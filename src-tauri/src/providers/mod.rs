//! Data providers feeding the island.
//!
//! A provider owns one source of information (media session, Claude Code, …),
//! publishes its state through the [`Hub`] under its `id`, and optionally
//! handles actions coming from the UI (play/pause, etc).
//!
//! To add a new provider:
//!   1. create `providers/<name>.rs` implementing [`Provider`];
//!   2. add it to [`registry`];
//!   3. add a matching frontend module in `src/modules/<name>/`.

pub mod activities;
pub mod ask;
pub mod claude;
pub mod calendar;
pub mod clipboard;
pub mod credentials;
pub mod github;
pub mod monitor;
pub mod music;
pub mod notifications;
pub mod process;
pub mod shelf;

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;
use tauri::State;

use crate::hub::Hub;

pub trait Provider: Send + Sync + 'static {
    /// Unique id; the frontend reads this provider's state with `useProvider(id)`.
    fn id(&self) -> &'static str;

    /// Spawn whatever background work the provider needs. Must not block.
    fn start(self: Arc<Self>, hub: Arc<Hub>);

    /// Handle an action sent from the UI via `provider_action`.
    fn action(&self, action: &str, _payload: Value) -> Result<Value, String> {
        Err(format!("{}: unsupported action '{action}'", self.id()))
    }
}

pub fn registry() -> Vec<Arc<dyn Provider>> {
    vec![
        // First: the others push alerts into it.
        Arc::new(activities::ActivitiesProvider),
        Arc::new(music::MusicProvider::default()),
        Arc::new(notifications::NotificationsProvider::default()),
        Arc::new(ask::AskProvider::default()),
        Arc::new(shelf::ShelfProvider::default()),
        Arc::new(clipboard::ClipboardProvider::default()),
        Arc::new(claude::ClaudeProvider::default()),
        Arc::new(github::GithubProvider::default()),
        Arc::new(monitor::MonitorProvider::default()),
        Arc::new(calendar::CalendarProvider::default()),
    ]
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub struct Providers(pub Vec<Arc<dyn Provider>>);

#[tauri::command]
pub fn get_snapshot(hub: State<Arc<Hub>>) -> std::collections::HashMap<String, Value> {
    hub.snapshot()
}

#[tauri::command]
pub async fn provider_action(
    providers: State<'_, Providers>,
    id: String,
    action: String,
    payload: Option<Value>,
) -> Result<Value, String> {
    let provider = providers
        .0
        .iter()
        .find(|p| p.id() == id)
        .cloned()
        .ok_or_else(|| format!("unknown provider '{id}'"))?;
    let payload = payload.unwrap_or(Value::Null);
    tauri::async_runtime::spawn_blocking(move || provider.action(&action, payload))
        .await
        .map_err(|e| e.to_string())?
}
