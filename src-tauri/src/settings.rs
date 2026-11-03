//! User settings: a flat JSON key/value store persisted in the app config dir.
//!
//! The backend doesn't know the schema — defaults and meaning live in the
//! frontend (each module declares its own settings). Every change is broadcast
//! as `settings://changed` so all windows stay in sync.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

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

    /// Current raw value of a setting (`None` = never set, use the default).
    pub fn get(&self, key: &str) -> Option<Value> {
        self.data.lock().unwrap().get(key).cloned()
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
pub fn set_setting(app: AppHandle, key: String, value: Value) {
    set(&app, &key, value);
}

/// Store and broadcast a setting (backend side of `setSetting`).
pub fn set(app: &AppHandle, key: &str, value: Value) {
    let settings = app.state::<Settings>();
    let snapshot = {
        let mut data = settings.data.lock().unwrap();
        data.insert(key.to_string(), value);
        settings.save(&data);
        data.clone()
    };
    let _ = app.emit(CHANGED_EVENT, snapshot);
    if key == crate::tray::HIDDEN_KEY {
        crate::tray::sync_hidden(app);
    }
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    open(&app).map_err(|e| e.to_string())
}

const SIZE: (f64, f64) = (860.0, 620.0);

pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(SETTINGS_LABEL) {
        win.unminimize()?;
        win.show()?;
        return win.set_focus();
    }
    // Callers are sync commands / tray / single-instance handlers on the main
    // thread, where building a webview deadlocks on Windows (WebView2 needs the
    // event loop). Build from another thread instead.
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = create(&app) {
            eprintln!("settings window: {e}");
        }
    });
    Ok(())
}

fn create(app: &AppHandle) -> tauri::Result<()> {
    let _win = WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("index.html".into()))
        .title(crate::i18n::t(app, "window.settings"))
        .inner_size(SIZE.0, SIZE.1)
        .resizable(false)
        .center()
        // Custom titlebar lives in the webview (see `SettingsApp.tsx`).
        .decorations(false)
        .background_color(tauri::webview::Color(12, 12, 16, 255))
        .build()?;
    Ok(())
}

const REPO_URL: &str = "https://github.com/HeyyCzer/windows-island";

/// Open the GitHub repo in the default browser (About page).
#[tauri::command]
pub fn open_repo() {
    open_url(REPO_URL);
}

/// Open a web page in the default browser (island links, e.g. usage pages).
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let lower = url.trim().to_lowercase();
    if lower.starts_with("javascript:") || lower.starts_with("vbscript:") || lower.starts_with("data:") {
        return Err("disallowed protocol".into());
    }
    open_url(&url);
    Ok(())
}

#[tauri::command]
pub fn everything_query(
    query: String,
    port: Option<u16>,
    count: Option<usize>,
    sort: Option<String>,
    ascending: Option<bool>,
) -> Result<Value, String> {
    let p = port.unwrap_or(8080);
    let c = count.unwrap_or(15);
    let encoded: String = url::form_urlencoded::byte_serialize(query.trim().as_bytes()).collect();
    let sort_param = sort.as_deref().unwrap_or("date_modified");
    let asc_param = if ascending.unwrap_or(false) { "1" } else { "0" };
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_millis(2000)))
        .build()
        .into();
    let ports = if p == 8080 { vec![8080, 80] } else { vec![p, 8080, 80] };
    let mut last_err = String::new();
    for port_num in ports {
        let url = format!("http://127.0.0.1:{port_num}/?search={encoded}&json=1&count={c}&path_column=1&size_column=1&date_modified_column=1&sort={sort_param}&ascending={asc_param}");
        match agent.get(&url).call() {
            Ok(mut response) => {
                if let Ok(body) = response.body_mut().read_to_string()
                    && let Ok(value) = serde_json::from_str::<Value>(&body)
                {
                    return Ok(value);
                }
            }
            Err(error) => last_err = error.to_string(),
        }
    }
    Err(if last_err.is_empty() { "Everything HTTP connection failed".into() } else { last_err })
}

#[tauri::command]
pub fn open_in_folder(path: String) -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        use windows::core::{HSTRING, PCWSTR, w};
        let clean = path.replace('/', "\\");
        let arg = format!("/select,\"{clean}\"");
        ShellExecuteW(None, w!("open"), w!("explorer.exe"), &HSTRING::from(arg), PCWSTR::null(), SW_SHOWNORMAL);
    }
    Ok(())
}

/// Open a URL in the default browser.
pub fn open_url(url: &str) {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        use windows::core::{HSTRING, PCWSTR, w};
        ShellExecuteW(
            None,
            w!("open"),
            &HSTRING::from(url),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        );
    }
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> bool {
    crate::autostart::is_enabled(&app)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    crate::autostart::set(&app, enabled)
}
