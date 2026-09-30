//! User settings: a flat JSON key/value store persisted in the app config dir.
//!
//! The backend doesn't know the schema — defaults and meaning live in the
//! frontend (each module declares its own settings). Every change is broadcast
//! as `settings://changed` so all windows stay in sync.

use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;

pub const CHANGED_EVENT: &str = "settings://changed";
pub const SETTINGS_LABEL: &str = "settings";

pub struct Settings {
    path: PathBuf,
    data: Mutex<Map<String, Value>>,
}

impl Settings {
    pub fn load(app: &AppHandle) -> Self {
        let path = app
            .path()
            .app_config_dir()
            .unwrap_or_else(|_| std::env::temp_dir())
            .join("settings.json");
        let data = std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str::<Map<String, Value>>(&t).ok())
            .unwrap_or_default();
        Self {
            path,
            data: Mutex::new(data),
        }
    }

    fn save(&self, data: &Map<String, Value>) {
        if let Some(dir) = self.path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(text) = serde_json::to_string_pretty(data) {
            let _ = std::fs::write(&self.path, text);
        }
    }
}

#[tauri::command]
pub fn get_settings(settings: State<Settings>) -> Map<String, Value> {
    settings.data.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_setting(app: AppHandle, settings: State<Settings>, key: String, value: Value) {
    let snapshot = {
        let mut data = settings.data.lock().unwrap();
        data.insert(key, value);
        settings.save(&data);
        data.clone()
    };
    let _ = app.emit(CHANGED_EVENT, snapshot);
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    open(&app).map_err(|e| e.to_string())
}

pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(SETTINGS_LABEL) {
        win.unminimize()?;
        win.show()?;
        return win.set_focus();
    }
    WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("index.html".into()))
        .title(crate::i18n::t(app, "window.settings"))
        .inner_size(860.0, 620.0)
        .min_inner_size(680.0, 460.0)
        .center()
        // Custom titlebar lives in the webview (see `SettingsApp.tsx`).
        .decorations(false)
        .background_color(tauri::webview::Color(12, 12, 16, 255))
        .build()?;
    Ok(())
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let launcher = app.autolaunch();
    let result = if enabled { launcher.enable() } else { launcher.disable() };
    result.map_err(|e| e.to_string())?;
    Ok(launcher.is_enabled().unwrap_or(false))
}
