//! GitHub: open issues and pull requests, newest commit and newest release of
//! the repositories the user follows.
//!
//! The repo list lives in the regular settings store (`github.repos`, edited by
//! the settings window); this provider re-polls whenever it changes and every
//! few minutes otherwise. Issue counts come from the search API, which excludes
//! pull requests (a repo's `open_issues_count` doesn't).
//!
//! Auth, in order: a token saved from the settings window (kept in the Windows
//! Credential Manager, see `providers/credentials.rs`), the GitHub CLI (`gh auth token`),
//! or anonymous — public repos only, with a much lower rate limit.

mod api;

use std::sync::Arc;
use std::sync::Mutex;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{Listener, Manager};

use super::{Provider, credentials, now_ms};
use crate::hub::Hub;
use crate::settings::{self, Settings};

pub const ID: &str = "github";

const TOKEN_TARGET: &str = "dynamic-island:github";
const REPOS_KEY: &str = "github.repos";
const ENABLED_KEY: &str = "module.github.enabled";
const POLL_MS: u64 = 5 * 60 * 1000;
/// Manual refreshes closer than this to the last round are ignored.
const MIN_REFRESH_GAP_MS: u64 = 20_000;
const MAX_REPOS: usize = 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Auth {
    #[default]
    None,
    Token,
    Gh,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Issues,
    Pulls,
    Commits,
    Releases,
}

impl Kind {
    const ALL: [Kind; 4] = [Kind::Issues, Kind::Pulls, Kind::Commits, Kind::Releases];

    fn fetch(self, repo: &str, token: Option<&str>) -> Result<api::Section, api::Error> {
        match self {
            Kind::Issues => api::issues(repo, token),
            Kind::Pulls => api::pulls(repo, token),
            Kind::Commits => api::commits(repo, token),
            Kind::Releases => api::releases(repo, token),
        }
    }

    /// Commits come and go too often to be worth a peek.
    fn notifies(self) -> bool {
        self != Kind::Commits
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepoState {
    /// `owner/name`, as the user typed it.
    pub name: String,
    /// `None` until first fetched.
    pub issues: Option<api::Section>,
    pub pulls: Option<api::Section>,
    pub commits: Option<api::Section>,
    pub releases: Option<api::Section>,
    pub error: Option<&'static str>,
}

impl RepoState {
    fn section(&mut self, kind: Kind) -> &mut Option<api::Section> {
        match kind {
            Kind::Issues => &mut self.issues,
            Kind::Pulls => &mut self.pulls,
            Kind::Commits => &mut self.commits,
            Kind::Releases => &mut self.releases,
        }
    }
}

/// An issue, pull request or release that showed up since the previous poll
/// (drives the peek; the frontend drops the kinds the user muted).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewItem {
    pub kind: Kind,
    pub repo: String,
    pub item: api::Entry,
    pub seen_at: u64,
}

/// The newest entry of `next`, if it wasn't there at the previous poll. Nothing
/// on the first fetch, which only learns what already exists.
fn arrived<'a>(prev: Option<&api::Section>, next: &'a api::Section) -> Option<&'a api::Entry> {
    let prev = prev?;
    let latest = next.latest.as_ref()?;
    let before = prev.latest.as_ref().map_or(0, |e| e.key);
    (latest.key > before).then_some(latest)
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GithubState {
    pub repos: Vec<RepoState>,
    pub auth: Auth,
    pub login: Option<String>,
    /// The saved token was rejected.
    pub auth_error: bool,
    pub rate_limited_until: Option<u64>,
    pub loading: bool,
    pub updated_at: Option<u64>,
    /// Newest arrival per kind.
    pub news: Vec<NewItem>,
}

enum Wake {
    Settings,
    Refresh,
    Auth,
}

#[derive(Default)]
pub struct GithubProvider {
    tx: Mutex<Option<Sender<Wake>>>,
}

impl GithubProvider {
    fn wake(&self, w: Wake) {
        if let Some(tx) = self.tx.lock().unwrap().as_ref() {
            let _ = tx.send(w);
        }
    }
}

impl Provider for GithubProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let (tx, rx) = mpsc::channel();
        let on_settings = tx.clone();
        hub.app().listen(settings::CHANGED_EVENT, move |_| {
            let _ = on_settings.send(Wake::Settings);
        });
        *self.tx.lock().unwrap() = Some(tx);

        std::thread::spawn(move || {
            let mut w = Worker {
                hub,
                state: GithubState::default(),
                signature: String::new(),
                last_round: 0,
                auth_dirty: true,
            };
            let mut next_at = 0u64;
            loop {
                let wait = next_at.saturating_sub(now_ms());
                let reason = match rx.recv_timeout(Duration::from_millis(wait)) {
                    Ok(w) => Some(w),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => return,
                };
                let (enabled, repos) = w.config();
                let signature = format!("{enabled}|{}", repos.join(","));
                match reason {
                    // Some other setting changed.
                    Some(Wake::Settings) if signature == w.signature => continue,
                    Some(Wake::Refresh)
                        if now_ms().saturating_sub(w.last_round) < MIN_REFRESH_GAP_MS =>
                    {
                        continue;
                    }
                    Some(Wake::Auth) => w.auth_dirty = true,
                    _ => {}
                }
                w.signature = signature;
                if enabled {
                    w.round(&repos);
                }
                next_at = (now_ms() + POLL_MS).max(w.state.rate_limited_until.unwrap_or(0));
            }
        });
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        match action {
            "refresh" => self.wake(Wake::Refresh),
            "setToken" => {
                let token = payload["token"].as_str().unwrap_or_default().trim();
                if token.is_empty() {
                    return Err("empty token".into());
                }
                // Only keep tokens GitHub accepts.
                let login = api::login(token).map_err(|e| e.code().to_string())?;
                credentials::write(TOKEN_TARGET, token)?;
                self.wake(Wake::Auth);
                return Ok(Value::String(login));
            }
            "clearToken" => {
                credentials::delete(TOKEN_TARGET)?;
                self.wake(Wake::Auth);
            }
            "open" => {
                let url = payload["url"].as_str().unwrap_or_default();
                if !url.starts_with("https://github.com/") {
                    return Err("only github.com links can be opened".into());
                }
                settings::open_url(url);
            }
            _ => return Err(format!("github: unknown action '{action}'")),
        }
        Ok(Value::Null)
    }
}

struct Worker {
    hub: Arc<Hub>,
    state: GithubState,
    /// Module switch + repo list at the last round, to skip unrelated settings changes.
    signature: String,
    last_round: u64,
    auth_dirty: bool,
}

impl Worker {
    fn config(&self) -> (bool, Vec<String>) {
        let settings = self.hub.app().state::<Settings>();
        let enabled = settings
            .get(ENABLED_KEY)
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let mut repos: Vec<String> = Vec::new();
        for v in settings
            .get(REPOS_KEY)
            .and_then(|v| v.as_array().cloned())
            .unwrap_or_default()
        {
            if let Some(r) = v.as_str().map(str::trim)
                && valid_repo(r)
                && !repos.iter().any(|x| x.eq_ignore_ascii_case(r))
            {
                repos.push(r.to_string());
            }
        }
        repos.truncate(MAX_REPOS);
        (enabled, repos)
    }

    fn publish(&self) {
        self.hub.publish(ID, &self.state);
    }

    fn round(&mut self, repos: &[String]) {
        self.last_round = now_ms();
        let (mut token, auth) = resolve_token();
        if auth != self.state.auth {
            self.auth_dirty = true;
        }
        self.state.auth = auth;
        if self.auth_dirty {
            self.state.login = None;
            self.state.auth_error = false;
            match token.as_deref().map(api::login) {
                Some(Ok(login)) => {
                    self.state.login = Some(login);
                    self.auth_dirty = false;
                }
                Some(Err(api::Error::Unauthorized)) => {
                    self.state.auth_error = true;
                    self.auth_dirty = false;
                }
                // Offline / rate limited: try again next round.
                Some(Err(_)) => {}
                None => self.auth_dirty = false,
            }
        }
        if self.state.auth_error {
            token = None;
        }

        // Keep what we know about repos still in the list, in the user's order.
        let mut previous = std::mem::take(&mut self.state.repos);
        self.state.repos = repos
            .iter()
            .map(|name| {
                previous
                    .iter()
                    .position(|r| r.name.eq_ignore_ascii_case(name))
                    .map(|i| previous.swap_remove(i))
                    .map(|r| RepoState {
                        name: name.clone(),
                        ..r
                    })
                    .unwrap_or_else(|| RepoState {
                        name: name.clone(),
                        ..Default::default()
                    })
            })
            .collect();
        if self.state.rate_limited_until.is_some_and(|t| t <= now_ms()) {
            self.state.rate_limited_until = None;
        }
        self.state.loading = true;
        self.publish();

        'repos: for i in 0..self.state.repos.len() {
            let name = self.state.repos[i].name.clone();
            for kind in Kind::ALL {
                if self.state.rate_limited_until.is_some() {
                    break 'repos;
                }
                match kind.fetch(&name, token.as_deref()) {
                    Ok(next) => {
                        let section = self.state.repos[i].section(kind);
                        if kind.notifies()
                            && let Some(item) = arrived(section.as_ref(), &next)
                        {
                            let item = NewItem {
                                kind,
                                repo: name.clone(),
                                item: item.clone(),
                                seen_at: now_ms(),
                            };
                            self.state.news.retain(|n| n.kind != kind);
                            self.state.news.push(item);
                        }
                        *self.state.repos[i].section(kind) = Some(next);
                        self.state.repos[i].error = None;
                    }
                    Err(api::Error::RateLimited(until)) => {
                        self.state.rate_limited_until = Some(until);
                    }
                    Err(e) => {
                        if matches!(e, api::Error::Unauthorized) && token.is_some() {
                            self.state.auth_error = true;
                        }
                        self.state.repos[i].error = Some(e.code());
                        // Missing repo, offline…: the other lists would fail alike.
                        break;
                    }
                }
            }
            self.publish();
        }

        self.state.loading = false;
        self.state.updated_at = Some(now_ms());
        self.publish();
    }
}

/// `owner/name` with GitHub's allowed characters.
fn valid_repo(r: &str) -> bool {
    let ok = |s: &str| {
        !s.is_empty()
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
    };
    matches!(r.split_once('/'), Some((owner, name)) if ok(owner) && ok(name))
}

fn resolve_token() -> (Option<String>, Auth) {
    if let Some(t) = credentials::read(TOKEN_TARGET) {
        return (Some(t), Auth::Token);
    }
    if let Some(t) = gh_token() {
        return (Some(t), Auth::Gh);
    }
    (None, Auth::None)
}

/// Token of a logged-in GitHub CLI, if installed.
fn gh_token() -> Option<String> {
    let mut cmd = std::process::Command::new("gh");
    cmd.args(["auth", "token"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let token = String::from_utf8(out.stdout).ok()?.trim().to_string();
    (!token.is_empty()).then_some(token)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn section(key: Option<u64>) -> api::Section {
        api::Section {
            count: Some(1),
            latest: key.map(|key| api::Entry {
                id: format!("#{key}"),
                title: String::new(),
                url: String::new(),
                author: None,
                at: String::new(),
                key,
            }),
        }
    }

    #[test]
    fn first_fetch_announces_nothing() {
        assert!(arrived(None, &section(Some(5))).is_none());
    }

    #[test]
    fn newer_entry_is_announced() {
        assert_eq!(
            arrived(Some(&section(Some(5))), &section(Some(6))).map(|e| e.key),
            Some(6)
        );
        assert!(arrived(Some(&section(Some(6))), &section(Some(6))).is_none());
        // The newest one got closed: not new.
        assert!(arrived(Some(&section(Some(6))), &section(Some(4))).is_none());
    }

    #[test]
    fn first_entry_of_an_empty_list_is_announced() {
        assert_eq!(
            arrived(Some(&section(None)), &section(Some(1))).map(|e| e.key),
            Some(1)
        );
    }
}
