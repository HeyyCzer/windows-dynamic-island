//! Sounds for when a session finishes its turn or asks for permission
//! (settings `agents.sound*`, off by default). Each plays the file the user
//! picked, or the one shipped with the app.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::providers::now_ms;
use crate::settings::Settings;
use crate::sound;

/// The same alert again within this window (a permission prompt arrives as
/// both `PermissionRequest` and `Notification`) stays silent.
const DEBOUNCE_MS: u64 = 1500;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Alert {
    Done,
    Permission,
}

impl Alert {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "done" => Some(Alert::Done),
            "permission" => Some(Alert::Permission),
            _ => None,
        }
    }

    /// Mirrors `agentSettings` in `src/modules/ai-agents/settings.ts`.
    fn keys(self) -> (&'static str, &'static str) {
        match self {
            Alert::Done => ("agents.soundDone", "agents.soundDoneFile"),
            Alert::Permission => ("agents.soundPermission", "agents.soundPermissionFile"),
        }
    }

    fn bundled(self) -> (&'static str, &'static [u8]) {
        match self {
            Alert::Done => ("claude-done.mp3", include_bytes!("../../../sounds/claude-done.mp3")),
            Alert::Permission => ("claude-permission.mp3", include_bytes!("../../../sounds/claude-permission.mp3")),
        }
    }
}

static LAST: Mutex<[u64; 2]> = Mutex::new([0, 0]);

/// Plays `alert` if its setting is on (always when `test`).
pub fn play(app: &AppHandle, alert: Alert, test: bool) {
    let settings = app.state::<Settings>();
    let (enabled_key, file_key) = alert.keys();
    if !test {
        if settings.get(enabled_key).and_then(|v| v.as_bool()) != Some(true) {
            return;
        }
        let mut last = LAST.lock().unwrap();
        let slot = &mut last[alert as usize];
        let now = now_ms();
        if now.saturating_sub(*slot) < DEBOUNCE_MS {
            return;
        }
        *slot = now;
    }
    let custom = settings
        .get(file_key)
        .and_then(|v| v.as_str().map(PathBuf::from))
        .filter(|p| p.is_file());
    let (name, bytes) = alert.bundled();
    if let Some(path) = custom.or_else(|| sound::bundled(app, name, bytes)) {
        sound::file(&path);
    }
}
