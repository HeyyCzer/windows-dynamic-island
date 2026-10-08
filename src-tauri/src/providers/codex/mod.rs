//! OpenAI Codex: live session status, token usage and plan limits.
//!
//! Codex (CLI, IDE extension and desktop app) appends everything a thread
//! does to a JSONL "rollout" under `~/.codex/sessions/YYYY/MM/DD/`. That is
//! all we read (`rollout.rs`), so there is nothing to install and none of
//! Codex's config is touched. A rollout carries:
//! - turn start / end (`task_started`, `task_complete`, `turn_aborted`),
//! - tool calls (`response_item` function / custom tool calls),
//! - `token_count` events with token usage *and* the plan's rate limits.
//!
//! Not in it: approval prompts, so a Codex session never shows "waiting".

mod rollout;

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;

use super::claude::activity::Activity;
use super::claude::{Status, TokenStats, Usage};
use super::Provider;
use crate::hub::Hub;

pub const ID: &str = "codex";

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub project: String,
    pub cwd: String,
    pub status: Status,
    pub activity: Option<Activity>,
    pub turn_started_at: Option<u64>,
    pub finished_at: Option<u64>,
    pub last_event_at: u64,
    pub model: Option<String>,
    pub context_pct: Option<f64>,
    /// Start of the last reply, once the turn ended.
    pub summary: Option<String>,
    pub prompt: Option<String>,
}

/// One rate-limit window as Codex reports it.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LimitWindow {
    pub used_pct: f64,
    /// Length of the window (300 = 5h, 10080 = a week).
    pub window_minutes: Option<u64>,
    /// Unix seconds.
    pub resets_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub primary: Option<LimitWindow>,
    pub secondary: Option<LimitWindow>,
    /// Unix ms of the `token_count` event they came from.
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexState {
    /// Codex has been used on this computer (`~/.codex` exists).
    pub available: bool,
    pub sessions: Vec<Session>,
    pub limits: Option<Limits>,
    pub model: Option<String>,
    pub tokens_today: TokenStats,
    pub usage: Usage,
}

/// `$CODEX_HOME`, or `~/.codex`.
pub fn codex_home() -> PathBuf {
    if let Some(dir) = std::env::var_os("CODEX_HOME") {
        return PathBuf::from(dir);
    }
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_default();
    home.join(".codex")
}

pub struct CodexProvider;

impl Provider for CodexProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        std::thread::spawn(move || rollout::scan_loop(hub));
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        match action {
            // Clicking a session opens its project in VS Code.
            "openProject" => {
                let cwd = payload.as_str().unwrap_or_default();
                if !cwd.is_empty() {
                    crate::settings::open_url(&super::claude::vscode_url(cwd));
                }
                Ok(Value::Null)
            }
            _ => Err(format!("codex: unknown action '{action}'")),
        }
    }
}
