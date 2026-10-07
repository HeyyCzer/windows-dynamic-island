//! Google Calendar REST client (blocking, via ureq), signed in with OAuth's
//! installed-app flow: the browser comes back to a one-shot server on
//! 127.0.0.1 with the code, protected by PKCE and a random `state`.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{DateTime, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tiny_http::{Header, Response, Server};
use url::Url;

use super::{CalEvent, Error, find_meeting_url, local_midnight_ms};
use crate::i18n;
use crate::providers::now_ms;
use crate::settings;

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const API: &str = "https://www.googleapis.com/calendar/v3";
const SCOPE: &str = "https://www.googleapis.com/auth/calendar.readonly";
/// How long the browser has to come back from the consent screen.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(180);
const PAGE_SIZE: &str = "250";
const MAX_PAGES: usize = 4;

/// OAuth client of type "Desktop app" (its secret isn't confidential).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Client {
    pub id: String,
    #[serde(default)]
    pub secret: String,
}

impl Client {
    /// Baked in at build time from `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
    pub fn builtin() -> Option<Self> {
        let id = option_env!("GOOGLE_CLIENT_ID")?.trim();
        (!id.is_empty()).then(|| Client {
            id: id.to_string(),
            secret: option_env!("GOOGLE_CLIENT_SECRET").unwrap_or_default().trim().to_string(),
        })
    }

    /// Form fields identifying the client; the secret is left out when empty.
    fn form<'a>(&'a self, fields: &[(&'a str, &'a str)]) -> Vec<(&'a str, &'a str)> {
        let mut form = vec![("client_id", self.id.as_str())];
        if !self.secret.is_empty() {
            form.push(("client_secret", self.secret.as_str()));
        }
        form.extend_from_slice(fields);
        form
    }
}

/// A calendar from the user's list.
pub struct Calendar {
    pub id: String,
    pub name: String,
    pub color: String,
    /// Checked in Google Calendar's own sidebar.
    pub selected: bool,
    pub primary: bool,
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(15)))
        .build()
        .into()
}

fn json(res: Result<ureq::http::Response<ureq::Body>, ureq::Error>) -> Result<Value, Error> {
    let mut res = res.map_err(|_| Error::Network)?;
    let status = res.status().as_u16();
    let body = res.body_mut().read_to_string().map_err(|_| Error::Network)?;
    let v: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
    match status {
        200..=299 => Ok(v),
        401 => Err(Error::Unauthorized),
        // Refresh token revoked or expired.
        400 if v["error"] == "invalid_grant" => Err(Error::Unauthorized),
        403 | 404 => Err(Error::NotFound),
        _ => Err(Error::Http),
    }
}

/// `bytes` random bytes, base64url.
fn random_token(bytes: usize) -> Result<String, Error> {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).map_err(|_| Error::Http)?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// Runs the browser sign-in and returns the refresh token. Blocks until the
/// browser comes back, `cancel` is set, or the login times out.
pub fn authorize(app: &AppHandle, client: &Client, cancel: &AtomicBool) -> Result<String, Error> {
    let verifier = random_token(32)?;
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_token(16)?;

    let server = Server::http("127.0.0.1:0").map_err(|_| Error::Network)?;
    let port = server.server_addr().to_ip().map(|a| a.port()).ok_or(Error::Network)?;
    let redirect = format!("http://127.0.0.1:{port}");
    let url = Url::parse_with_params(
        AUTH_URL,
        &[
            ("client_id", client.id.as_str()),
            ("redirect_uri", &redirect),
            ("response_type", "code"),
            ("scope", SCOPE),
            ("code_challenge", &challenge),
            ("code_challenge_method", "S256"),
            ("state", &state),
            ("access_type", "offline"),
            // Always hand out a refresh token, even when signing in again.
            ("prompt", "consent"),
        ],
    )
    .map_err(|_| Error::Invalid)?;
    settings::open_url(url.as_str());

    let deadline = Instant::now() + LOGIN_TIMEOUT;
    let code = loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(Error::Cancelled);
        }
        if Instant::now() > deadline {
            return Err(Error::Timeout);
        }
        let Ok(Some(req)) = server.recv_timeout(Duration::from_millis(250)) else {
            continue;
        };
        let full = Url::parse(&format!("{redirect}{}", req.url())).ok();
        let param = |key: &str| {
            full.as_ref()?
                .query_pairs()
                .find(|(k, _)| k == key)
                .map(|(_, v)| v.into_owned())
        };
        // Favicon and anything that isn't our redirect.
        if full.as_ref().is_none_or(|u| u.path() != "/") || param("state").as_deref() != Some(state.as_str()) {
            let _ = req.respond(Response::empty(404));
            continue;
        }
        let code = param("code");
        let key = if code.is_some() { "calendar.google.browserDone" } else { "calendar.google.browserDenied" };
        let html = Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap();
        let _ = req.respond(Response::from_string(browser_page(&i18n::t(app, key))).with_header(html));
        match code {
            Some(code) => break code,
            None => return Err(Error::Denied),
        }
    };

    let v = json(agent().post(TOKEN_URL).send_form(client.form(&[
        ("code", &code),
        ("redirect_uri", &redirect),
        ("grant_type", "authorization_code"),
        ("code_verifier", &verifier),
    ])))?;
    v["refresh_token"].as_str().map(str::to_string).ok_or(Error::Http)
}

fn browser_page(message: &str) -> String {
    let message = message.replace('&', "&amp;").replace('<', "&lt;");
    format!(
        "<!doctype html><meta charset=utf-8><title>Dynamic Island</title>\
         <body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#111;color:#eee;\
         font:15px 'Segoe UI',sans-serif\"><p>{message}</p>"
    )
}

/// Best effort: signing out also invalidates the token on Google's side.
pub fn revoke(refresh_token: &str) {
    let _ = agent().post(REVOKE_URL).send_form([("token", refresh_token)]);
}

/// A signed-in account; trades the refresh token for access tokens as needed.
pub struct Session {
    client: Client,
    refresh_token: String,
    access: Option<(String, u64)>,
}

impl Session {
    pub fn new(client: Client, refresh_token: String) -> Self {
        Self {
            client,
            refresh_token,
            access: None,
        }
    }

    fn access_token(&mut self) -> Result<String, Error> {
        if let Some((token, expires_at)) = &self.access
            && *expires_at > now_ms() + 60_000
        {
            return Ok(token.clone());
        }
        let v = json(agent().post(TOKEN_URL).send_form(self.client.form(&[
            ("refresh_token", &self.refresh_token),
            ("grant_type", "refresh_token"),
        ])))?;
        let token = v["access_token"].as_str().ok_or(Error::Http)?.to_string();
        let expires_at = now_ms() + v["expires_in"].as_u64().unwrap_or(3600) * 1000;
        self.access = Some((token.clone(), expires_at));
        Ok(token)
    }

    fn get(&mut self, url: &Url) -> Result<Value, Error> {
        for attempt in 0..2 {
            let token = self.access_token()?;
            let res = agent()
                .get(url.as_str())
                .header("Authorization", &format!("Bearer {token}"))
                .call();
            match json(res) {
                // The access token may have been revoked early: get a new one, once.
                Err(Error::Unauthorized) if attempt == 0 => self.access = None,
                other => return other,
            }
        }
        Err(Error::Unauthorized)
    }

    /// Calendars in the user's list (hidden ones left out), primary first.
    pub fn calendars(&mut self) -> Result<Vec<Calendar>, Error> {
        let url = Url::parse_with_params(
            &format!("{API}/users/me/calendarList"),
            &[
                ("minAccessRole", "freeBusyReader"),
                ("fields", "items(id,summary,summaryOverride,backgroundColor,selected,primary,hidden)"),
            ],
        )
        .map_err(|_| Error::Invalid)?;
        let v = self.get(&url)?;
        let mut list: Vec<Calendar> = v["items"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or_default()
            .iter()
            .filter(|c| c["hidden"] != true)
            .filter_map(|c| {
                Some(Calendar {
                    id: c["id"].as_str()?.to_string(),
                    name: c["summaryOverride"]
                        .as_str()
                        .or(c["summary"].as_str())
                        .unwrap_or_default()
                        .to_string(),
                    color: c["backgroundColor"].as_str().unwrap_or("#4285F4").to_string(),
                    selected: c["selected"] == true,
                    primary: c["primary"] == true,
                })
            })
            .collect();
        list.sort_by_key(|c| !c.primary);
        Ok(list)
    }

    /// Events of `calendar_id` overlapping `[from, to)` (unix ms), recurring
    /// ones expanded into their instances.
    pub fn events(&mut self, calendar_id: &str, key: &str, from: u64, to: u64) -> Result<Vec<CalEvent>, Error> {
        let mut url = Url::parse(API).map_err(|_| Error::Invalid)?;
        url.path_segments_mut()
            .map_err(|_| Error::Invalid)?
            .extend(["calendars", calendar_id, "events"]);
        url.query_pairs_mut()
            .append_pair("singleEvents", "true")
            .append_pair("orderBy", "startTime")
            .append_pair("maxResults", PAGE_SIZE)
            .append_pair("timeMin", &rfc3339(from))
            .append_pair("timeMax", &rfc3339(to))
            .append_pair(
                "fields",
                "nextPageToken,items(id,status,summary,start,end,location,description,htmlLink,hangoutLink,\
                 eventType,conferenceData/entryPoints(entryPointType,uri),attendees(self,responseStatus))",
            );

        let mut events = Vec::new();
        let mut page_token: Option<String> = None;
        for _ in 0..MAX_PAGES {
            let mut page = url.clone();
            if let Some(t) = &page_token {
                page.query_pairs_mut().append_pair("pageToken", t);
            }
            let v = self.get(&page)?;
            let items = v["items"].as_array().map(Vec::as_slice).unwrap_or_default();
            events.extend(items.iter().filter_map(|e| event(e, key)));
            page_token = v["nextPageToken"].as_str().map(str::to_string);
            if page_token.is_none() {
                break;
            }
        }
        Ok(events)
    }
}

fn rfc3339(ms: u64) -> String {
    DateTime::from_timestamp_millis(ms as i64)
        .unwrap_or_default()
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// `start` / `end` object: `dateTime` (RFC 3339) or `date` (all-day).
fn when(v: &Value) -> Option<(u64, bool)> {
    if let Some(dt) = v["dateTime"].as_str() {
        let ms = DateTime::parse_from_rfc3339(dt).ok()?.timestamp_millis();
        return Some((ms.max(0) as u64, false));
    }
    let date = NaiveDate::parse_from_str(v["date"].as_str()?, "%Y-%m-%d").ok()?;
    Some((local_midnight_ms(date), true))
}

fn event(v: &Value, key: &str) -> Option<CalEvent> {
    if v["status"] == "cancelled" || v["eventType"] == "workingLocation" {
        return None;
    }
    let declined = v["attendees"]
        .as_array()
        .is_some_and(|a| a.iter().any(|p| p["self"] == true && p["responseStatus"] == "declined"));
    if declined {
        return None;
    }
    let (start, all_day) = when(&v["start"])?;
    let end = when(&v["end"]).map_or(start, |(end, _)| end.max(start));
    let conference = v["conferenceData"]["entryPoints"]
        .as_array()
        .and_then(|points| points.iter().find(|p| p["entryPointType"] == "video"))
        .and_then(|p| p["uri"].as_str());
    let text = |k: &str| v[k].as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
    let location = text("location");
    let meeting_url = v["hangoutLink"]
        .as_str()
        .or(conference)
        .map(str::to_string)
        .or_else(|| find_meeting_url(location.as_deref().unwrap_or_default()))
        .or_else(|| find_meeting_url(v["description"].as_str().unwrap_or_default()));
    Some(CalEvent {
        id: format!("{key}/{}", v["id"].as_str()?),
        calendar: key.to_string(),
        title: text("summary").unwrap_or_default(),
        start,
        end,
        all_day,
        location,
        meeting_url,
        url: text("htmlLink"),
    })
}
