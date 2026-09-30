//! Claude Code: live session status, token usage and plan limits.
//!
//! Claude Code has no local API, so we combine what it does expose:
//! - **hooks** (`hooks.rs`): Claude Code POSTs every lifecycle event to a tiny
//!   local HTTP server → real-time "working / waiting / done" + current tool.
//! - **statusline** (`statusline.rs`): the statusline payload carries the plan
//!   `rate_limits` (5h / 7d), model and context usage.
//! - **transcripts** (`transcripts.rs`): the JSONL logs give today's token
//!   totals, and a best-effort status when hooks aren't installed.
//!
//! `integration.rs` wires the first two into `~/.claude/settings.json` on demand.

mod activity;
mod hooks;
pub mod integration;
pub mod statusline;
mod transcripts;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{now_ms, Provider};
use crate::hub::Hub;

pub const ID: &str = "claude";
pub const HOOK_PORT: u16 = 47823;

/// Without new events, a "working" session is considered abandoned after this.
const STALE_WORKING_MS: u64 = 30 * 60 * 1000;

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
    /// Human description of what is happening ("Editando App.tsx").
    pub activity: Option<String>,
    pub tool: Option<String>,
    /// When the current (or last) turn started — drives the live timer.
    pub turn_started_at: Option<u64>,
    pub finished_at: Option<u64>,
    pub last_event_at: u64,
    pub model: Option<String>,
    pub context_pct: Option<f64>,
    pub source: Source,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LimitWindow {
    pub used_pct: f64,
    /// Unix seconds.
    pub resets_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub five_hour: Option<LimitWindow>,
    pub seven_day: Option<LimitWindow>,
    pub updated_at: u64,
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

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Integration {
    pub hooks: bool,
    pub statusline: bool,
    pub server_ok: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeState {
    pub sessions: Vec<Session>,
    pub limits: Option<Limits>,
    pub model: Option<String>,
    pub tokens_today: TokenStats,
    pub integration: Integration,
}

/// Mutable state shared by the hook server, transcript scanner and ticker.
#[derive(Default)]
pub struct Store {
    pub sessions: HashMap<String, Session>,
    pub limits: Option<Limits>,
    pub model: Option<String>,
    pub tokens_today: TokenStats,
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
            model: self.model.clone(),
            tokens_today: self.tokens_today.clone(),
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
}

impl Ctx {
    pub fn publish(&self) {
        let state = self.store.lock().unwrap().snapshot();
        self.hub.publish(ID, &state);
    }
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
        };
        *self.ctx.lock().unwrap() = Some(ctx.clone());

        let server_ctx = ctx.clone();
        std::thread::spawn(move || hooks::serve(server_ctx));

        let scan_ctx = ctx.clone();
        std::thread::spawn(move || transcripts::scan_loop(scan_ctx));

        std::thread::spawn(move || tick_loop(ctx));
    }

    fn action(&self, action: &str, _payload: Value) -> Result<Value, String> {
        let ctx = self.ctx.lock().unwrap().clone().ok_or("claude provider not started")?;
        match action {
            "install" => integration::install()?,
            "uninstall" => integration::uninstall()?,
            "refresh" => {}
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

/// Housekeeping: expire stale sessions and pick up external settings edits.
fn tick_loop(ctx: Ctx) {
    let mut tick = 0u32;
    loop {
        std::thread::sleep(Duration::from_secs(5));
        tick += 1;
        {
            let mut store = ctx.store.lock().unwrap();
            let now = now_ms();
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
    }
}
