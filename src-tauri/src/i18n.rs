//! The few strings the backend renders itself (tray menu, window titles).
//!
//! Translations live in `src/locales/*.json`, shared with the frontend and
//! embedded at compile time (see `build.rs`). The frontend (`src/core/i18n.ts`)
//! resolves the active locale (setting or system language) and reports it via
//! `set_locale`.

use std::sync::{LazyLock, Mutex};

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, State};

const FALLBACK: &str = "en";

const SOURCES: &[(&str, &str)] = include!(concat!(env!("OUT_DIR"), "/locales.rs"));

static LOCALES: LazyLock<Vec<(&'static str, Map<String, Value>)>> = LazyLock::new(|| {
    SOURCES
        .iter()
        .map(|(code, json)| (*code, serde_json::from_str(json).expect("invalid locale JSON")))
        .collect()
});

#[derive(Default)]
pub struct Locale(Mutex<Option<String>>);

/// Translate `key` in the active locale, falling back to English, then the key.
pub fn t(app: &AppHandle, key: &str) -> String {
    let code = app.state::<Locale>().0.lock().unwrap().clone();
    let lookup = |code: &str| {
        LOCALES
            .iter()
            .find(|(c, _)| *c == code)
            .and_then(|(_, m)| m.get(key))
            .and_then(Value::as_str)
            .map(str::to_string)
    };
    code.as_deref()
        .and_then(lookup)
        .or_else(|| lookup(FALLBACK))
        .unwrap_or_else(|| key.to_string())
}

#[tauri::command]
pub fn set_locale(app: AppHandle, locale: State<Locale>, code: String) {
    {
        let mut current = locale.0.lock().unwrap();
        if current.as_deref() == Some(code.as_str()) {
            return;
        }
        *current = Some(code);
    }
    crate::tray::relabel(&app);
    if let Some(win) = app.get_webview_window(crate::settings::SETTINGS_LABEL) {
        let _ = win.set_title(&t(&app, "window.settings"));
    }
}
