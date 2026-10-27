//! Spotify Connect volume through the Web API. When Spotify plays on another
//! device (a phone, a speaker, another PC) Windows has no mixer entry for it,
//! but the account's active device can still be turned up and down.
//!
//! Sign-in is OAuth's PKCE flow, which needs no client secret: the user
//! brings the Client ID of their own Spotify app, with [`REDIRECT`] among its
//! redirect URIs. Changing a device's volume needs Spotify Premium.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tiny_http::{Header, Response, Server};
use url::Url;

use super::volume::Volume;
use crate::hub::Hub;
use crate::i18n;
use crate::providers::{credentials, now_ms};
use crate::settings;

/// Whether an SMTC app id is Spotify's (`Spotify.exe`, or the Store app's).
pub fn is_spotify(app_id: &str) -> bool {
    app_id.to_lowercase().contains("spotify")
}

/// Hub id of the sign-in [`Status`] (read by the settings window).
pub const STATUS_ID: &str = "spotify";
/// Spotify only redirects to URIs registered in the app, port included, so
/// this one is fixed. A loopback IP, as Spotify requires (not `localhost`).
pub const REDIRECT: &str = "http://127.0.0.1:43821/callback";
const REDIRECT_ADDR: &str = "127.0.0.1:43821";
const REDIRECT_PATH: &str = "/callback";

const AUTH_URL: &str = "https://accounts.spotify.com/authorize";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const API: &str = "https://api.spotify.com/v1";
const SCOPE: &str = "user-read-playback-state user-modify-playback-state";
const CLIENT_TARGET: &str = "dynamic-island:spotify-client";
const TOKEN_TARGET: &str = "dynamic-island:spotify-token";
/// How long the browser has to come back from the consent screen.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(180);
/// How often the device's volume is read while Spotify plays elsewhere.
const POLL: Duration = Duration::from_secs(3);
/// Where unmuting goes when nothing was muted from here.
const UNMUTE_LEVEL: f32 = 0.5;

/// What the settings window shows.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub has_client: bool,
    pub connected: bool,
    /// Last API failure (`premium`, `unauthorized`, `network`…), cleared on success.
    pub error: Option<String>,
}

/// The device Spotify plays on, as last read or set.
struct Device {
    name: String,
    level: f32,
}

#[derive(Default)]
pub struct Spotify {
    hub: OnceLock<Arc<Hub>>,
    /// The music panel shows Spotify with no mixer entry: read the API.
    wanted: AtomicBool,
    connecting: AtomicBool,
    cancel: AtomicBool,
    access: Mutex<Option<(String, u64)>>,
    device: Mutex<Option<Device>>,
    /// Level to go back to on unmute: the API has no mute, only volume 0.
    restore: Mutex<Option<f32>>,
    /// Latest volume a drag asked for, and who is sending it (see `set_volume`).
    pending: Mutex<Option<u32>>,
    sending: Mutex<()>,
    error: Mutex<Option<String>>,
}

impl Spotify {
    pub fn start(self: &Arc<Self>, hub: Arc<Hub>) {
        let _ = self.hub.set(hub);
        self.publish();
        let me = self.clone();
        std::thread::spawn(move || {
            loop {
                if me.wanted.load(Ordering::Relaxed) && credentials::read(TOKEN_TARGET).is_some() {
                    me.read_device();
                } else {
                    *me.device.lock().unwrap() = None;
                }
                std::thread::sleep(POLL);
            }
        });
    }

    /// Whether the music panel needs the remote device's volume.
    pub fn set_wanted(&self, wanted: bool) {
        self.wanted.store(wanted, Ordering::Relaxed);
    }

    /// The remote device's volume and name, once read.
    pub fn volume(&self) -> Option<(Volume, String)> {
        let device = self.device.lock().unwrap();
        let device = device.as_ref()?;
        let muted = device.level == 0.0 && self.restore.lock().unwrap().is_some();
        Some((Volume { level: device.level, muted }, device.name.clone()))
    }

    /// Same shape as the mixer's: muting stores the level and sets 0.
    pub fn set_volume(&self, level: Option<f32>, muted: Option<bool>) -> Result<(), String> {
        let current = self.device.lock().unwrap().as_ref().map(|d| d.level);
        let level = match (level, muted) {
            (_, Some(true)) => {
                *self.restore.lock().unwrap() = current.filter(|&l| l > 0.0).or(Some(UNMUTE_LEVEL));
                0.0
            }
            (Some(level), _) => {
                self.restore.lock().unwrap().take();
                level
            }
            (None, Some(false)) => self.restore.lock().unwrap().take().unwrap_or(UNMUTE_LEVEL),
            (None, None) => return Ok(()),
        };
        if let Some(device) = self.device.lock().unwrap().as_mut() {
            device.level = level;
        }

        // A drag asks many times a second; each request takes a round trip.
        // Whoever holds `sending` sends the latest level, the rest just leave it.
        *self.pending.lock().unwrap() = Some((level * 100.0).round() as u32);
        loop {
            let Ok(guard) = self.sending.try_lock() else { return Ok(()) };
            while let Some(percent) = self.pending.lock().unwrap().take() {
                self.api(|token| {
                    agent()
                        .put(&format!("{API}/me/player/volume?volume_percent={percent}"))
                        .header("Authorization", &format!("Bearer {token}"))
                        .send_empty()
                })?;
            }
            drop(guard);
            // A level may have landed after the last take, while the lock was held.
            if self.pending.lock().unwrap().is_none() {
                return Ok(());
            }
        }
    }

    pub fn action(&self, action: &str, payload: &Value) -> Result<(), String> {
        match action {
            "spotifyConnect" => self.connect()?,
            "spotifyCancel" => self.cancel.store(true, Ordering::SeqCst),
            // Spotify has no revoke endpoint: forgetting the token is all there is.
            "spotifyDisconnect" => self.forget()?,
            "spotifySetClient" => {
                let id = payload["id"].as_str().unwrap_or_default().trim();
                if id.len() != 32 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Err("invalid".into());
                }
                credentials::write(CLIENT_TARGET, id)?;
            }
            "spotifyClearClient" => {
                // Tokens belong to the client that issued them.
                self.forget()?;
                credentials::delete(CLIENT_TARGET)?;
            }
            _ => return Err(format!("music: unknown action '{action}'")),
        }
        self.publish();
        Ok(())
    }

    fn connect(&self) -> Result<(), String> {
        let hub = self.hub.get().ok_or("busy")?;
        let client = credentials::read(CLIENT_TARGET).ok_or("noClient")?;
        if self.connecting.swap(true, Ordering::SeqCst) {
            return Err("busy".into());
        }
        self.cancel.store(false, Ordering::SeqCst);
        let result = authorize(hub, &client, &self.cancel);
        self.connecting.store(false, Ordering::SeqCst);
        credentials::write(TOKEN_TARGET, &result?)?;
        *self.access.lock().unwrap() = None;
        *self.error.lock().unwrap() = None;
        Ok(())
    }

    fn forget(&self) -> Result<(), String> {
        credentials::delete(TOKEN_TARGET)?;
        *self.access.lock().unwrap() = None;
        *self.device.lock().unwrap() = None;
        *self.error.lock().unwrap() = None;
        Ok(())
    }

    fn read_device(&self) {
        let result = self.api(|token| {
            agent()
                .get(&format!("{API}/me/player"))
                .header("Authorization", &format!("Bearer {token}"))
                .call()
        });
        // 204 (nothing playing) comes back as `null`.
        let device = result.as_ref().ok().map(|v| &v["device"]).and_then(|d| {
            let percent = d["volume_percent"].as_f64().filter(|_| d["supports_volume"] != false)?;
            Some(Device {
                name: d["name"].as_str().unwrap_or_default().to_string(),
                level: (percent / 100.0) as f32,
            })
        });
        *self.device.lock().unwrap() = device;
        let error = result.err();
        if *self.error.lock().unwrap() != error {
            *self.error.lock().unwrap() = error;
            self.publish();
        }
    }

    /// One API call, with a fresh access token; retried once if Spotify
    /// turned the token down before it expired.
    fn api(
        &self,
        call: impl Fn(&str) -> Result<ureq::http::Response<ureq::Body>, ureq::Error>,
    ) -> Result<Value, String> {
        for attempt in 0..2 {
            let token = self.access_token()?;
            match json(call(&token)) {
                Err(e) if e == "unauthorized" && attempt == 0 => *self.access.lock().unwrap() = None,
                other => return other,
            }
        }
        Err("unauthorized".into())
    }

    fn access_token(&self) -> Result<String, String> {
        let mut access = self.access.lock().unwrap();
        if let Some((token, expires_at)) = access.as_ref()
            && *expires_at > now_ms() + 60_000
        {
            return Ok(token.clone());
        }
        let client = credentials::read(CLIENT_TARGET).ok_or("noClient")?;
        let refresh = credentials::read(TOKEN_TARGET).ok_or("unauthorized")?;
        let v = json(agent().post(TOKEN_URL).send_form([
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh.as_str()),
            ("client_id", client.as_str()),
        ]))?;
        // PKCE refresh tokens may rotate: the old one stops working.
        if let Some(next) = v["refresh_token"].as_str() {
            credentials::write(TOKEN_TARGET, next)?;
        }
        let token = v["access_token"].as_str().ok_or("http")?.to_string();
        *access = Some((token.clone(), now_ms() + v["expires_in"].as_u64().unwrap_or(3600) * 1000));
        Ok(token)
    }

    fn publish(&self) {
        let Some(hub) = self.hub.get() else { return };
        hub.publish(
            STATUS_ID,
            Status {
                has_client: credentials::read(CLIENT_TARGET).is_some(),
                connected: credentials::read(TOKEN_TARGET).is_some(),
                error: self.error.lock().unwrap().clone(),
            },
        );
    }
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(10)))
        .build()
        .into()
}

fn json(res: Result<ureq::http::Response<ureq::Body>, ureq::Error>) -> Result<Value, String> {
    let mut res = res.map_err(|_| "network")?;
    let status = res.status().as_u16();
    let body = res.body_mut().read_to_string().unwrap_or_default();
    let v: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
    Err(match status {
        200..=299 => return Ok(v),
        401 => "unauthorized",
        // Refresh token revoked or expired.
        400 if v["error"] == "invalid_grant" => "unauthorized",
        // No Premium, or an account the app's dashboard doesn't list.
        403 => "premium",
        404 => "noDevice",
        429 => "rateLimited",
        _ => "http",
    }
    .into())
}

/// `bytes` random bytes, base64url.
fn random_token(bytes: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).map_err(|_| "http")?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// Runs the browser sign-in and returns the refresh token. Blocks until the
/// browser comes back, `cancel` is set, or the login times out.
fn authorize(hub: &Hub, client: &str, cancel: &AtomicBool) -> Result<String, String> {
    let verifier = random_token(32)?;
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_token(16)?;

    let server = Server::http(REDIRECT_ADDR).map_err(|_| "portBusy")?;
    let url = Url::parse_with_params(
        AUTH_URL,
        &[
            ("client_id", client),
            ("redirect_uri", REDIRECT),
            ("response_type", "code"),
            ("scope", SCOPE),
            ("code_challenge", &challenge),
            ("code_challenge_method", "S256"),
            ("state", &state),
        ],
    )
    .map_err(|_| "invalid")?;
    settings::open_url(url.as_str());

    let deadline = Instant::now() + LOGIN_TIMEOUT;
    let code = loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("cancelled".into());
        }
        if Instant::now() > deadline {
            return Err("timeout".into());
        }
        let Ok(Some(req)) = server.recv_timeout(Duration::from_millis(250)) else {
            continue;
        };
        let full = Url::parse(&format!("http://{REDIRECT_ADDR}{}", req.url())).ok();
        let param = |key: &str| {
            full.as_ref()?
                .query_pairs()
                .find(|(k, _)| k == key)
                .map(|(_, v)| v.into_owned())
        };
        // Favicon and anything that isn't our redirect.
        if full.as_ref().is_none_or(|u| u.path() != REDIRECT_PATH) || param("state").as_deref() != Some(state.as_str()) {
            let _ = req.respond(Response::empty(404));
            continue;
        }
        let code = param("code");
        let key = if code.is_some() { "music.spotify.browserDone" } else { "music.spotify.browserDenied" };
        let html = Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap();
        let _ = req.respond(Response::from_string(browser_page(&i18n::t(hub.app(), key))).with_header(html));
        match code {
            Some(code) => break code,
            None => return Err("denied".into()),
        }
    };

    let v = json(agent().post(TOKEN_URL).send_form([
        ("grant_type", "authorization_code"),
        ("code", code.as_str()),
        ("redirect_uri", REDIRECT),
        ("client_id", client),
        ("code_verifier", verifier.as_str()),
    ]))?;
    v["refresh_token"].as_str().map(str::to_string).ok_or_else(|| "http".into())
}

fn browser_page(message: &str) -> String {
    let message = message.replace('&', "&amp;").replace('<', "&lt;");
    format!(
        "<!doctype html><meta charset=utf-8><title>Dynamic Island</title>\
         <body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#111;color:#eee;\
         font:15px 'Segoe UI',sans-serif\"><p>{message}</p>"
    )
}
