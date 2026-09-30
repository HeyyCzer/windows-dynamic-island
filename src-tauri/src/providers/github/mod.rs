//! GitHub: open issue counts for the repositories the user follows.
//!
//! The repo list lives in the regular settings store (`github.repos`, edited by
//! the settings window); this provider re-polls whenever it changes and every
//! few minutes otherwise. Counts come from the search API, which excludes pull
//! requests (a repo's `open_issues_count` doesn't).
//!
//! Auth, in order: a token saved from the settings window (kept in the Windows
//! Credential Manager, see `credentials.rs`), the GitHub CLI (`gh auth token`),
//! or anonymous — public repos only, with a much lower rate limit.

mod api;
mod credentials;

use std::sync::Mutex;
use std::sync::Arc;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{Listener, Manager};

use super::{Provider, now_ms};
use crate::hub::Hub;
use crate::settings::{self, Settings};

pub const ID: &str = "github";

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

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepoState {
    /// `owner/name`, as the user typed it.
    pub name: String,
    pub open_issues: Option<u64>,
    pub latest: Option<api::Issue>,
    pub error: Option<&'static str>,
}

/// An issue that showed up since the previous poll (drives the peek).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewIssue {
    pub repo: String,
    pub issue: api::Issue,
    pub seen_at: u64,
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
    pub new_issue: Option<NewIssue>,
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
                    Some(Wake::Refresh) if now_ms().saturating_sub(w.last_round) < MIN_REFRESH_GAP_MS => continue,
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
                credentials::write(token)?;
                self.wake(Wake::Auth);
                return Ok(Value::String(login));
            }
            "clearToken" => {
                credentials::delete()?;
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
        let enabled = settings.get(ENABLED_KEY).and_then(|v| v.as_bool()).unwrap_or(true);
        let mut repos: Vec<String> = Vec::new();
        for v in settings.get(REPOS_KEY).and_then(|v| v.as_array().cloned()).unwrap_or_default() {
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
                    .map(|r| RepoState { name: name.clone(), ..r })
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

        for i in 0..self.state.repos.len() {
            if self.state.rate_limited_until.is_some() {
                break;
            }
            let name = self.state.repos[i].name.clone();
            match api::repo_issues(&name, token.as_deref()) {
                Ok(found) => {
                    let repo = &mut self.state.repos[i];
                    let prev_number = repo.latest.as_ref().map(|l| l.number);
                    if let (Some(prev), Some(latest)) = (prev_number, &found.latest)
                        && latest.number > prev
                    {
                        self.state.new_issue = Some(NewIssue {
                            repo: name.clone(),
                            issue: latest.clone(),
                            seen_at: now_ms(),
                        });
                    }
                    let repo = &mut self.state.repos[i];
                    repo.open_issues = Some(found.open);
                    repo.latest = found.latest;
                    repo.error = None;
                }
                Err(api::Error::RateLimited(until)) => {
                    self.state.rate_limited_until = Some(until);
                }
                Err(e) => {
                    if matches!(e, api::Error::Unauthorized) && token.is_some() {
                        self.state.auth_error = true;
                    }
                    self.state.repos[i].error = Some(e.code());
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
    let ok = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c));
    matches!(r.split_once('/'), Some((owner, name)) if ok(owner) && ok(name))
}

fn resolve_token() -> (Option<String>, Auth) {
    if let Some(t) = credentials::read() {
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
