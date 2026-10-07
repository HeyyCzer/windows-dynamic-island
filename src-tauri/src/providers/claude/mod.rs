//! Claude Code: live session status, token usage and plan limits.
//!
//! Claude Code has no local API, so we combine what it does expose:
//! - **hooks** (`hooks.rs`): Claude Code POSTs every lifecycle event to a tiny
//!   local HTTP server → real-time "working / waiting / done" + current tool.
//! - **statusline** (`statusline.rs`): the statusline payload carries the plan
//!   `rate_limits` (5h / 7d), model and context usage.
//! - **usage** (`usage.rs`): plan limits from Anthropic on demand, for when the
//!   statusline never runs (IDE extensions).
//! - **transcripts** (`transcripts.rs`): the JSONL logs give today's token
//!   totals, and a best-effort status when hooks aren't installed.
//!
//! `integration.rs` wires the first two into `~/.claude/settings.json` on demand.

mod activity;
mod hooks;
pub mod integration;
mod permissions;
pub mod statusline;
mod transcripts;
mod usage;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{now_ms, Provider};
use crate::hub::Hub;

pub const ID: &str = "claude";
pub const HOOK_PORT: u16 = 47823;

/// Without new events, a "working" session is considered abandoned after this.
const STALE_WORKING_MS: u64 = 30 * 60 * 1000;
/// How long `limitsResetAt` stays set (the frontend peeks while it is).
/// Cleared by the 5s tick, so it lasts 6–11s.
const LIMITS_RESET_VISIBLE_MS: u64 = 6 * 1000;
/// A window that rolled over longer ago than this (e.g. while the island was
/// closed) is refreshed silently instead of announced.
const LIMITS_RESET_ANNOUNCE_MS: u64 = 10 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    #[default]
    Idle,
    Working,
    Waiting,
    Done,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    #[default]
    Transcript,
    Hooks,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub project: String,
    pub cwd: String,
    pub status: Status,
    /// What is happening right now (worded by the frontend).
    pub activity: Option<activity::Activity>,
    pub tool: Option<String>,
    /// When the current (or last) turn started — drives the live timer.
    pub turn_started_at: Option<u64>,
    pub finished_at: Option<u64>,
    pub last_event_at: u64,
    pub model: Option<String>,
    pub context_pct: Option<f64>,
    pub source: Source,
    /// Start of the last reply, once the turn ended (read from the transcript).
    pub summary: Option<String>,
    /// The last prompt typed in it: tells apart sessions of the same project.
    pub prompt: Option<String>,
    /// A permission request the island can answer (see `permissions.rs`).
    pub permission: Option<permissions::PermissionView>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LimitWindow {
    pub used_pct: f64,
    /// Unix seconds.
    pub resets_at: Option<u64>,
}

impl LimitWindow {
    /// Past its `resets_at` — the usage it reports no longer applies.
    fn expired(&self, now_s: u64) -> bool {
        self.resets_at.is_some_and(|t| t <= now_s)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub five_hour: Option<LimitWindow>,
    pub seven_day: Option<LimitWindow>,
    pub updated_at: u64,
}

impl Limits {
    fn windows_mut(&mut self) -> impl Iterator<Item = &mut LimitWindow> {
        [&mut self.five_hour, &mut self.seven_day].into_iter().flatten()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenStats {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub messages: u64,
}

/// Tokens (input + output + cache) and responses of one local day.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DayUsage {
    /// `YYYY-MM-DD`
    pub date: String,
    pub tokens: u64,
    pub responses: u64,
}

/// Usage from the local transcripts: the last 7 days (oldest first, today
/// last) and the last 5 hours.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub daily: Vec<DayUsage>,
    pub last5h_tokens: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Integration {
    pub hooks: bool,
    pub statusline: bool,
    pub server_ok: bool,
    /// The permission hook waits long enough for an answer from the island.
    pub permissions: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeState {
    pub sessions: Vec<Session>,
    pub limits: Option<Limits>,
    /// Unix ms — a used limit window just rolled over (cleared shortly after).
    pub limits_reset_at: Option<u64>,
    pub model: Option<String>,
    pub tokens_today: TokenStats,
    pub usage: Usage,
    pub integration: Integration,
}

/// Mutable state shared by the hook server, transcript scanner and ticker.
#[derive(Default)]
pub struct Store {
    pub sessions: HashMap<String, Session>,
    /// Write through `set_limits` so resets are detected.
    pub limits: Option<Limits>,
    pub limits_reset_at: Option<u64>,
    pub model: Option<String>,
    pub tokens_today: TokenStats,
    pub usage: Usage,
    pub integration: Integration,
}

impl Store {
    pub fn session(&mut self, id: &str, cwd: &str) -> &mut Session {
        let s = self.sessions.entry(id.to_string()).or_insert_with(|| Session {
            id: id.to_string(),
            ..Default::default()
        });
        if !cwd.is_empty() && s.cwd != cwd {
            s.cwd = cwd.to_string();
            s.project = project_name(cwd);
        }
        s
    }

    /// Stores fresh limits (statusline or usage endpoint). Windows already past
    /// their reset time are stale — e.g. an idle Claude Code still forwarding
    /// old `rate_limits` — and count as reset.
    pub fn set_limits(&mut self, mut limits: Limits) {
        let now = now_ms();
        self.expire_limits(now);
        for w in limits.windows_mut() {
            if w.expired(now / 1000) {
                *w = LimitWindow::default();
            }
        }
        statusline::save_limits(&limits);
        self.limits = Some(limits);
    }

    /// Rolls over every window past its reset time. Returns whether any did;
    /// a used one that just reset also sets `limits_reset_at`.
    fn expire_limits(&mut self, now: u64) -> bool {
        let Some(limits) = self.limits.as_mut() else {
            return false;
        };
        let mut expired = false;
        let mut announce = false;
        for w in limits.windows_mut() {
            if let Some(resets_at) = w.resets_at.filter(|_| w.expired(now / 1000)) {
                expired = true;
                announce |= w.used_pct > 0.0 && now.saturating_sub(resets_at * 1000) < LIMITS_RESET_ANNOUNCE_MS;
                *w = LimitWindow::default();
            }
        }
        if expired {
            statusline::save_limits(limits);
        }
        if announce {
            log::info!("claude: plan limits reset");
            self.limits_reset_at = Some(now);
        }
        expired
    }

    fn snapshot(&self) -> ClaudeState {
        let mut sessions: Vec<Session> = self.sessions.values().cloned().collect();
        let rank = |s: &Session| match s.status {
            Status::Waiting => 0,
            Status::Working => 1,
            Status::Done => 2,
            Status::Idle => 3,
        };
        sessions.sort_by(|a, b| rank(a).cmp(&rank(b)).then(b.last_event_at.cmp(&a.last_event_at)));
        sessions.truncate(8);
        ClaudeState {
            sessions,
            limits: self.limits.clone(),
            limits_reset_at: self.limits_reset_at,
            model: self.model.clone(),
            tokens_today: self.tokens_today.clone(),
            usage: self.usage.clone(),
            integration: self.integration.clone(),
        }
    }
}

pub fn project_name(cwd: &str) -> String {
    cwd.trim_end_matches(['\\', '/'])
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(cwd)
        .to_string()
}

/// Everything the background workers need.
#[derive(Clone)]
pub struct Ctx {
    pub store: Arc<Mutex<Store>>,
    hub: Arc<Hub>,
    /// Permission requests held open for the island to answer.
    pending: Arc<Mutex<Vec<permissions::Pending>>>,
}

impl Ctx {
    pub fn publish(&self) {
        let state = self.store.lock().unwrap().snapshot();
        self.hub.publish(ID, &state);
    }
}

static CTX: OnceLock<Ctx> = OnceLock::new();

/// A Claude Code hook payload that arrived through the activities API
/// (`POST /claude/hook` on its port, as in Windows Island's setup).
pub fn handle_hook(payload: &Value) {
    if let Some(ctx) = CTX.get() {
        hooks::handle_hook(ctx, payload);
    }
}

/// `vscode://file/C:/path/to/project`
fn vscode_url(cwd: &str) -> String {
    let path = cwd.replace('\\', "/");
    let encoded: String = path
        .chars()
        .map(|c| match c {
            ' ' => "%20".to_string(),
            '#' => "%23".to_string(),
            '?' => "%3F".to_string(),
            c => c.to_string(),
        })
        .collect();
    format!("vscode://file/{}", encoded.trim_start_matches('/'))
}

#[derive(Default)]
pub struct ClaudeProvider {
    ctx: Mutex<Option<Ctx>>,
}

impl Provider for ClaudeProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let store = Store {
            limits: statusline::load_limits(),
            integration: integration::status(),
            ..Default::default()
        };
        let ctx = Ctx {
            store: Arc::new(Mutex::new(store)),
            hub,
            pending: Arc::default(),
        };
        *self.ctx.lock().unwrap() = Some(ctx.clone());
        let _ = CTX.set(ctx.clone());

        let server_ctx = ctx.clone();
        std::thread::spawn(move || hooks::serve(server_ctx));

        let scan_ctx = ctx.clone();
        std::thread::spawn(move || transcripts::scan_loop(scan_ctx));

        let permissions_ctx = ctx.clone();
        std::thread::spawn(move || permissions::watch(permissions_ctx));

        std::thread::spawn(move || tick_loop(ctx));
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        let ctx = self.ctx.lock().unwrap().clone().ok_or("claude provider not started")?;
        match action {
            // Clicking a session opens its project in VS Code.
            "openProject" => {
                let cwd = payload.as_str().unwrap_or_default();
                if !cwd.is_empty() {
                    crate::settings::open_url(&vscode_url(cwd));
                }
                return Ok(Value::Null);
            }
            // Allow / Always / Deny clicked in the island.
            "permission" => {
                let id = payload["id"].as_str().ok_or("missing request id")?;
                let decision = payload["decision"].as_str().and_then(permissions::Decision::parse).ok_or("bad decision")?;
                permissions::decide(&ctx, id, decision)?;
                return Ok(Value::Null);
            }
            "install" => integration::install()?,
            "uninstall" => integration::uninstall()?,
            "refresh" => {}
            "refreshLimits" => {
                usage::request(&ctx, usage::VIEW_MIN_AGE_MS);
                return Ok(Value::Null);
            }
            _ => return Err(format!("claude: unknown action '{action}'")),
        }
        {
            let mut store = ctx.store.lock().unwrap();
            let server_ok = store.integration.server_ok;
            store.integration = Integration {
                server_ok,
                ..integration::status()
            };
        }
        ctx.publish();
        Ok(Value::Null)
    }
}

/// Housekeeping: expire stale sessions, roll over limit windows at their reset
/// time (then refetch the real numbers) and pick up external settings edits.
fn tick_loop(ctx: Ctx) {
    let mut tick = 0u32;
    loop {
        std::thread::sleep(Duration::from_secs(5));
        tick += 1;
        let limits_expired;
        {
            let mut store = ctx.store.lock().unwrap();
            let now = now_ms();
            limits_expired = store.expire_limits(now);
            if store
                .limits_reset_at
                .is_some_and(|t| now.saturating_sub(t) >= LIMITS_RESET_VISIBLE_MS)
            {
                store.limits_reset_at = None;
            }
            for s in store.sessions.values_mut() {
                if matches!(s.status, Status::Working | Status::Waiting)
                    && now.saturating_sub(s.last_event_at) > STALE_WORKING_MS
                {
                    s.status = Status::Idle;
                    s.activity = None;
                }
            }
            // Drop sessions idle for more than 12h.
            store
                .sessions
                .retain(|_, s| now.saturating_sub(s.last_event_at) < 12 * 3600 * 1000);
            if tick.is_multiple_of(6) {
                let server_ok = store.integration.server_ok;
                store.integration = Integration {
                    server_ok,
                    ..integration::status()
                };
            }
        }
        ctx.publish();
        if limits_expired {
            usage::request(&ctx, usage::RESET_MIN_AGE_MS);
        }
    }
}
