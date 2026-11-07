//! What a plugin may ask the app to do, checked against its grants.
//!
//! Plugins can't call these themselves (their iframes have no IPC): the
//! island's host (`src/core/plugins/host.ts`) relays their requests, naming
//! the plugin by the frame the message came from. The permission check
//! happens here so a bug in the relay can't widen it.

use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, State};

use super::net::{self, FetchRequest, FetchResponse};
use super::permissions::{self, Permission};
use super::{Plugins, blocking};

/// Storage a plugin may keep, serialized.
const MAX_STORAGE_BYTES: usize = 1024 * 1024;
const MAX_READ_BYTES: u64 = 5 * 1024 * 1024;

/// Serializes storage writes (read-modify-write of one file per plugin).
static STORAGE: Mutex<()> = Mutex::new(());

fn require(plugins: &Plugins, plugin: &str, permission: &Permission) -> Result<(), String> {
    if plugins.granted(plugin).contains(permission) {
        Ok(())
    } else {
        Err(format!(
            "{plugin}: permission {permission:?} wasn't granted"
        ))
    }
}

/// `island.net.fetch`.
#[tauri::command]
pub async fn plugin_fetch(
    plugins: State<'_, Plugins>,
    plugin: String,
    request: FetchRequest,
) -> Result<FetchResponse, String> {
    let granted = plugins.granted(&plugin);
    blocking(move || net::plugin_fetch(&granted, request)).await
}

/// `island.storage`: a small key/value store of the plugin's own.
#[tauri::command]
pub fn plugin_storage(
    plugins: State<Plugins>,
    plugin: String,
    op: String,
    key: Option<String>,
    value: Option<Value>,
) -> Result<Value, String> {
    if plugins.get(&plugin).is_none_or(|p| !p.ok()) {
        return Err("unknown plugin".into());
    }
    let path = plugins.data_path(&plugin);
    let _lock = STORAGE.lock().unwrap();
    let mut data: Map<String, Value> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    let key = || key.clone().ok_or("missing key");
    match op.as_str() {
        "get" => return Ok(data.get(&key()?).cloned().unwrap_or(Value::Null)),
        "keys" => return Ok(data.keys().cloned().collect()),
        "set" => {
            data.insert(key()?, value.unwrap_or(Value::Null));
        }
        "remove" => {
            data.remove(&key()?);
        }
        "clear" => data.clear(),
        _ => return Err(format!("unknown storage op '{op}'")),
    }
    let text = serde_json::to_string(&data).map_err(|e| e.to_string())?;
    if text.len() > MAX_STORAGE_BYTES {
        return Err("storage is full (1 MB)".into());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

/// Folders a `fs:read:` pattern may start from.
fn path_var(app: &AppHandle, name: &str) -> Option<PathBuf> {
    let path = app.path();
    match name {
        "$HOME" => path.home_dir().ok(),
        "$APPDATA" => path.config_dir().ok(),
        "$LOCALAPPDATA" => path.local_data_dir().ok(),
        "$DOCUMENTS" => path.document_dir().ok(),
        _ => None,
    }
}

/// `island.fs.readText`: `path` is absolute or starts with a variable
/// (`$HOME/.config/foo.json`).
#[tauri::command]
pub async fn plugin_read_file(
    app: AppHandle,
    plugins: State<'_, Plugins>,
    plugin: String,
    path: String,
) -> Result<String, String> {
    let granted = plugins.granted(&plugin);
    blocking(move || {
        let expanded = match permissions::PATH_VARS
            .iter()
            .find(|v| path.starts_with(**v))
        {
            Some(var) => {
                let base = path_var(&app, var).ok_or("unknown folder")?;
                base.join(path[var.len()..].trim_start_matches(['/', '\\']))
            }
            None => PathBuf::from(&path),
        };
        // Canonical: no `..`, links resolved, before comparing with the grant.
        let real = expanded
            .canonicalize()
            .map_err(|e| format!("{path}: {e}"))?;
        if !permissions::allows_path(&granted, &real, |name| path_var(&app, name)) {
            return Err(format!("{plugin}: reading {path} wasn't granted"));
        }
        let meta = std::fs::metadata(&real).map_err(|e| e.to_string())?;
        if !meta.is_file() || meta.len() > MAX_READ_BYTES {
            return Err(format!("{path}: not a file, or larger than 5 MB"));
        }
        std::fs::read_to_string(&real).map_err(|e| format!("{path}: {e}"))
    })
    .await
}

/// `island.clipboard.readText` / `writeText`.
#[tauri::command]
pub async fn plugin_clipboard(
    app: AppHandle,
    plugins: State<'_, Plugins>,
    plugin: String,
    text: Option<String>,
) -> Result<Option<String>, String> {
    match text {
        Some(text) => {
            require(&plugins, &plugin, &Permission::ClipboardWrite)?;
            blocking(move || crate::providers::clipboard::write_text(&app, &text).map(|_| None))
                .await
        }
        None => {
            require(&plugins, &plugin, &Permission::ClipboardRead)?;
            blocking(crate::providers::clipboard::read_text).await
        }
    }
}

/// `island.openUrl`: https links in the default browser.
#[tauri::command]
pub fn plugin_open_url(plugins: State<Plugins>, plugin: String, url: String) -> Result<(), String> {
    require(&plugins, &plugin, &Permission::OpenUrl)?;
    crate::settings::open_external(url)
}

/// Whether a plugin may read a built-in provider's state (checked by the host,
/// which already has it; here so both sides share one rule).
#[tauri::command]
pub fn plugin_can_read_provider(plugins: State<Plugins>, plugin: String, provider: String) -> bool {
    plugins
        .granted(&plugin)
        .contains(&Permission::Provider(provider))
}
