//! Calendar: events from a Google account (`google.rs`) and from iCalendar
//! links (`ics.rs`), for the clock module's month view and its reminders.
//!
//! Secrets stay in the Windows Credential Manager (see `providers/credentials.rs`):
//! the Google refresh token, the OAuth client when this build has none built
//! in, and the iCal links (Google's "secret address" grants read access to the
//! whole calendar). Which calendars show is a regular setting
//! (`calendar.visibility`); hidden ones aren't fetched.
//!
//! Events cover the previous month to three months ahead, refreshed every few
//! minutes, on demand, and when the account, the links or the visibility change.

mod google;
mod ics;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use chrono::{Datelike, Local, Months, NaiveDate, TimeZone};
use serde::Serialize;
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use tauri::{Listener, Manager};

use super::{Provider, credentials, now_ms};
use crate::hub::Hub;
use crate::settings::{self, Settings};

pub const ID: &str = "calendar";

const ENABLED_KEY: &str = "module.clock.enabled";
const VISIBILITY_KEY: &str = "calendar.visibility";
const GOOGLE_TARGET: &str = "dynamic-island:calendar-google";
const CLIENT_TARGET: &str = "dynamic-island:calendar-google-client";
const FEEDS_TARGET: &str = "dynamic-island:calendar-ics";
const POLL_MS: u64 = 5 * 60 * 1000;
/// Manual refreshes closer than this to the last round are ignored.
const MIN_REFRESH_GAP_MS: u64 = 15_000;
const MAX_FEEDS: usize = 8;
const MAX_GOOGLE_CALENDARS: usize = 20;
/// For iCal feeds that don't name a color.
const FEED_COLORS: [&str; 6] = ["#0A84FF", "#30D158", "#FF9F0A", "#BF5AF2", "#FF375F", "#64D2FF"];
/// Hosts of video calls worth a "Join" button.
const MEETING_HOSTS: [&str; 6] = [
    "meet.google.com",
    "zoom.us",
    "teams.microsoft.com",
    "teams.live.com",
    "webex.com",
    "whereby.com",
];

/// Error codes are worded by the frontend (`calendar.error.*`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    /// Token revoked, or the link needs a login.
    Unauthorized,
    NotFound,
    /// Not an iCalendar file / malformed input.
    Invalid,
    Network,
    Http,
    /// No OAuth client to sign in with.
    NoClient,
    /// The user declined on Google's consent screen.
    Denied,
    Cancelled,
    Timeout,
}

impl Error {
    pub fn code(self) -> &'static str {
        match self {
            Error::Unauthorized => "unauthorized",
            Error::NotFound => "notFound",
            Error::Invalid => "invalid",
            Error::Network => "network",
            Error::Http => "http",
            Error::NoClient => "noClient",
            Error::Denied => "denied",
            Error::Cancelled => "cancelled",
            Error::Timeout => "timeout",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalEvent {
    /// Unique across calendars and across instances of a recurring event.
    pub id: String,
    /// `CalendarInfo::key` of its calendar.
    pub calendar: String,
    pub title: String,
    /// Unix ms; `end` is exclusive. All-day events span local midnights.
    pub start: u64,
    pub end: u64,
    pub all_day: bool,
    pub location: Option<String>,
    /// Video call to join (Meet, Zoom, Teams…).
    pub meeting_url: Option<String>,
    /// The event in its calendar's web page.
    pub url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Google,
    Ics,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarInfo {
    /// `google:<calendar id>` or `ics:<feed id>`; key of `calendar.visibility`.
    pub key: String,
    pub name: String,
    pub color: String,
    pub source: Source,
    /// Shown unless the user says otherwise (Google: checked in its sidebar).
    pub default_visible: bool,
    pub visible: bool,
    pub error: Option<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GoogleState {
    /// This build ships an OAuth client: no setup needed to sign in.
    pub builtin_client: bool,
    /// A client is available (built in or saved by the user).
    pub has_client: bool,
    pub connected: bool,
    /// E-mail of the signed-in account.
    pub account: Option<String>,
    pub error: Option<&'static str>,
}

/// An iCal link, without the link itself (it's a secret).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedState {
    pub id: String,
    pub host: String,
    pub name: Option<String>,
    pub error: Option<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CalendarState {
    pub google: GoogleState,
    pub feeds: Vec<FeedState>,
    pub calendars: Vec<CalendarInfo>,
    /// Visible calendars only, sorted by start.
    pub events: Vec<CalEvent>,
    /// Unix ms span the events cover.
    pub range: Option<(u64, u64)>,
    pub loading: bool,
    pub updated_at: Option<u64>,
}

enum Wake {
    Settings,
    Refresh,
    /// Account, OAuth client or iCal links changed.
    Sources,
}

#[derive(Default)]
pub struct CalendarProvider {
    tx: Mutex<Option<Sender<Wake>>>,
    hub: OnceLock<Arc<Hub>>,
    connecting: AtomicBool,
    cancel: AtomicBool,
}

impl CalendarProvider {
    fn wake(&self, w: Wake) {
        if let Some(tx) = self.tx.lock().unwrap().as_ref() {
            let _ = tx.send(w);
        }
    }

    fn connect_google(&self) -> Result<Value, String> {
        let hub = self.hub.get().ok_or("not started")?;
        let client = client().ok_or(Error::NoClient.code())?;
        if self.connecting.swap(true, Ordering::SeqCst) {
            return Err("busy".into());
        }
        self.cancel.store(false, Ordering::SeqCst);
        let result = google::authorize(hub.app(), &client, &self.cancel);
        self.connecting.store(false, Ordering::SeqCst);
        let token = result.map_err(|e| e.code().to_string())?;
        // Signing in again replaces the old token: let Google forget it.
        if let Some(old) = credentials::read(GOOGLE_TARGET) {
            google::revoke(&old);
        }
        credentials::write(GOOGLE_TARGET, &token)?;
        self.wake(Wake::Sources);
        Ok(Value::Null)
    }

    fn add_feed(&self, payload: &Value) -> Result<Value, String> {
        let url = ics::normalize(payload["url"].as_str().unwrap_or_default()).ok_or(Error::Invalid.code())?;
        let mut feeds = load_feeds();
        if feeds.contains(&url) {
            return Err("duplicate".into());
        }
        if feeds.len() >= MAX_FEEDS {
            return Err("tooMany".into());
        }
        // Only keep links that answer with a calendar.
        let now = now_ms();
        let feed = ics::fetch(&url, "ics:check", now, now + 1).map_err(|e| e.code().to_string())?;
        feeds.push(url);
        save_feeds(&feeds).map_err(|_| "tooMany".to_string())?;
        self.wake(Wake::Sources);
        Ok(json!({ "name": feed.name }))
    }
}

impl Provider for CalendarProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let _ = self.hub.set(hub.clone());
        let (tx, rx) = mpsc::channel();
        let on_settings = tx.clone();
        hub.app().listen(settings::CHANGED_EVENT, move |_| {
            let _ = on_settings.send(Wake::Settings);
        });
        *self.tx.lock().unwrap() = Some(tx);

        std::thread::spawn(move || {
            let mut w = Worker {
                hub,
                state: CalendarState::default(),
                signature: String::new(),
                last_round: 0,
                session: None,
                sources_dirty: true,
            };
            let mut next_at = 0u64;
            loop {
                let wait = next_at.saturating_sub(now_ms());
                let reason = match rx.recv_timeout(Duration::from_millis(wait)) {
                    Ok(w) => Some(w),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => return,
                };
                let (enabled, visibility) = w.config();
                let signature = format!("{enabled}|{}", Value::Object(visibility.clone()));
                match reason {
                    // Some other setting changed.
                    Some(Wake::Settings) if signature == w.signature => continue,
                    Some(Wake::Refresh) if now_ms().saturating_sub(w.last_round) < MIN_REFRESH_GAP_MS => continue,
                    Some(Wake::Sources) => w.sources_dirty = true,
                    _ => {}
                }
                w.signature = signature;
                if enabled {
                    w.round(&visibility);
                }
                next_at = now_ms() + POLL_MS;
            }
        });
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        match action {
            "refresh" => self.wake(Wake::Refresh),
            "connectGoogle" => return self.connect_google(),
            "cancelConnect" => self.cancel.store(true, Ordering::SeqCst),
            "disconnectGoogle" => {
                if let Some(token) = credentials::read(GOOGLE_TARGET) {
                    google::revoke(&token);
                }
                credentials::delete(GOOGLE_TARGET)?;
                self.wake(Wake::Sources);
            }
            "setClient" => {
                let id = payload["id"].as_str().unwrap_or_default().trim();
                let secret = payload["secret"].as_str().unwrap_or_default().trim();
                if !id.ends_with(".apps.googleusercontent.com") {
                    return Err(Error::Invalid.code().into());
                }
                let client = google::Client {
                    id: id.to_string(),
                    secret: secret.to_string(),
                };
                credentials::write(CLIENT_TARGET, &serde_json::to_string(&client).map_err(|e| e.to_string())?)?;
                self.wake(Wake::Sources);
            }
            "clearClient" => {
                // Tokens belong to the client that issued them.
                credentials::delete(GOOGLE_TARGET)?;
                credentials::delete(CLIENT_TARGET)?;
                self.wake(Wake::Sources);
            }
            "addFeed" => return self.add_feed(&payload),
            "removeFeed" => {
                let id = payload["id"].as_str().unwrap_or_default();
                let feeds: Vec<String> = load_feeds().into_iter().filter(|url| feed_id(url) != id).collect();
                save_feeds(&feeds)?;
                self.wake(Wake::Sources);
            }
            _ => return Err(format!("calendar: unknown action '{action}'")),
        }
        Ok(Value::Null)
    }
}

/// The user's own client first, then the one built into this release.
fn client() -> Option<google::Client> {
    credentials::read(CLIENT_TARGET)
        .and_then(|s| serde_json::from_str(&s).ok())
        .or_else(google::Client::builtin)
}

fn load_feeds() -> Vec<String> {
    credentials::read(FEEDS_TARGET)
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_feeds(feeds: &[String]) -> Result<(), String> {
    if feeds.is_empty() {
        return credentials::delete(FEEDS_TARGET);
    }
    credentials::write(FEEDS_TARGET, &serde_json::to_string(feeds).map_err(|e| e.to_string())?)
}

/// Stable id for a link that doesn't reveal it.
fn feed_id(url: &str) -> String {
    Sha256::digest(url.as_bytes())[..6].iter().map(|b| format!("{b:02x}")).collect()
}

pub fn local_midnight_ms(date: NaiveDate) -> u64 {
    date.and_hms_opt(0, 0, 0)
        .and_then(|dt| Local.from_local_datetime(&dt).earliest())
        .map_or(0, |dt| dt.timestamp_millis().max(0) as u64)
}

/// First day of last month to the first day of the month three months ahead.
fn window() -> (u64, u64) {
    let first = Local::now().date_naive().with_day(1).unwrap_or_default();
    let from = first.checked_sub_months(Months::new(1)).unwrap_or(first);
    let to = first.checked_add_months(Months::new(4)).unwrap_or(first);
    (local_midnight_ms(from), local_midnight_ms(to))
}

/// First video-call link in free text (event description or location).
pub fn find_meeting_url(text: &str) -> Option<String> {
    text.match_indices("https://").find_map(|(i, _)| {
        let rest = &text[i..];
        let end = rest
            .find(|c: char| c.is_whitespace() || "\"'<>()[]".contains(c))
            .unwrap_or(rest.len());
        let link = rest[..end].trim_end_matches(['.', ',', ';']);
        let host = url::Url::parse(link).ok()?.host_str()?.to_ascii_lowercase();
        MEETING_HOSTS
            .iter()
            .any(|h| host == *h || host.ends_with(&format!(".{h}")))
            .then(|| link.to_string())
    })
}

struct Worker {
    hub: Arc<Hub>,
    state: CalendarState,
    /// Module switch + visibility at the last round, to skip unrelated settings changes.
    signature: String,
    last_round: u64,
    session: Option<google::Session>,
    sources_dirty: bool,
}

impl Worker {
    fn config(&self) -> (bool, Map<String, Value>) {
        let settings = self.hub.app().state::<Settings>();
        let enabled = settings.get(ENABLED_KEY).and_then(|v| v.as_bool()).unwrap_or(true);
        let visibility = settings
            .get(VISIBILITY_KEY)
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default();
        (enabled, visibility)
    }

    fn publish(&self) {
        self.hub.publish(ID, &self.state);
    }

    fn round(&mut self, visibility: &Map<String, Value>) {
        self.last_round = now_ms();
        if self.sources_dirty {
            self.sources_dirty = false;
            let client = client();
            let token = credentials::read(GOOGLE_TARGET);
            self.state.google = GoogleState {
                builtin_client: google::Client::builtin().is_some(),
                has_client: client.is_some(),
                connected: token.is_some(),
                ..Default::default()
            };
            self.session = client.zip(token).map(|(c, t)| google::Session::new(c, t));
            // Drop what came from sources that are gone.
            self.state.calendars.clear();
            self.state.events.clear();
        }
        self.state.loading = true;
        self.publish();

        let (from, to) = window();
        let previous_calendars = std::mem::take(&mut self.state.calendars);
        let previous_events = std::mem::take(&mut self.state.events);
        let visible = |key: &str, default: bool| visibility.get(key).and_then(Value::as_bool).unwrap_or(default);
        // On a transient error a calendar keeps what it had.
        let keep = |key: &str, events: &mut Vec<CalEvent>| {
            events.extend(previous_events.iter().filter(|e| e.calendar == key).cloned());
        };
        let mut calendars = Vec::new();
        let mut events = Vec::new();

        if let Some(session) = &mut self.session {
            self.state.google.error = None;
            match session.calendars() {
                Ok(list) => {
                    for c in list.into_iter().take(MAX_GOOGLE_CALENDARS) {
                        if c.primary {
                            self.state.google.account = Some(c.id.clone());
                        }
                        let key = format!("google:{}", c.id);
                        let mut info = CalendarInfo {
                            visible: visible(&key, c.selected),
                            key,
                            name: c.name,
                            color: c.color,
                            source: Source::Google,
                            default_visible: c.selected,
                            error: None,
                        };
                        if info.visible {
                            match session.events(&c.id, &info.key, from, to) {
                                Ok(found) => events.extend(found),
                                Err(e) => {
                                    info.error = Some(e.code());
                                    keep(&info.key, &mut events);
                                }
                            }
                        }
                        calendars.push(info);
                    }
                }
                Err(e) => {
                    self.state.google.error = Some(e.code());
                    if e != Error::Unauthorized {
                        for c in previous_calendars.iter().filter(|c| c.source == Source::Google) {
                            keep(&c.key, &mut events);
                            calendars.push(c.clone());
                        }
                    }
                }
            }
        }

        let previous_feeds = std::mem::take(&mut self.state.feeds);
        for (i, url) in load_feeds().into_iter().enumerate() {
            let id = feed_id(&url);
            let key = format!("ics:{id}");
            let before = previous_feeds.iter().find(|f| f.id == id);
            let before_color = previous_calendars.iter().find(|c| c.key == key).map(|c| c.color.clone());
            let mut feed = FeedState {
                host: url::Url::parse(&url)
                    .ok()
                    .and_then(|u| u.host_str().map(str::to_string))
                    .unwrap_or_default(),
                name: before.and_then(|f| f.name.clone()),
                error: None,
                id,
            };
            let mut color = before_color.unwrap_or_else(|| FEED_COLORS[i % FEED_COLORS.len()].to_string());
            let shown = visible(&key, true);
            if shown {
                match ics::fetch(&url, &key, from, to) {
                    Ok(f) => {
                        feed.name = f.name.or(feed.name);
                        color = f.color.unwrap_or(color);
                        events.extend(f.events);
                    }
                    Err(e) => {
                        feed.error = Some(e.code());
                        keep(&key, &mut events);
                    }
                }
            }
            calendars.push(CalendarInfo {
                name: feed.name.clone().unwrap_or_else(|| feed.host.clone()),
                key,
                color,
                source: Source::Ics,
                default_visible: true,
                visible: shown,
                error: feed.error,
            });
            self.state.feeds.push(feed);
        }

        events.sort_by_key(|e| (e.start, e.end));
        self.state.calendars = calendars;
        self.state.events = events;
        self.state.range = Some((from, to));
        self.state.loading = false;
        self.state.updated_at = Some(now_ms());
        self.publish();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_meeting_links() {
        assert_eq!(
            find_meeting_url("Join at https://us02web.zoom.us/j/123?pwd=x. Thanks").as_deref(),
            Some("https://us02web.zoom.us/j/123?pwd=x")
        );
        assert_eq!(find_meeting_url("Docs: https://example.com/a"), None);
        assert_eq!(
            find_meeting_url("<a href=\"https://meet.google.com/abc-defg-hij\">").as_deref(),
            Some("https://meet.google.com/abc-defg-hij")
        );
    }
}
