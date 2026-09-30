//! Installs / removes the island's hooks and statusline bridge in the user's
//! Claude Code settings (`~/.claude/settings.json`).
//!
//! Only runs on explicit user action. Always writes a timestamped backup first,
//! keeps key order (serde_json `preserve_order`), touches nothing but our own
//! entries, and saves the user's original statusline so it can be restored.

use std::path::PathBuf;

use serde_json::{json, Map, Value};

use super::hooks::hook_url;
use super::statusline::{config_dir, BRIDGE_FLAG, ORIGINAL_FILE};
use super::Integration;

/// Hook events the island listens to.
const EVENTS: &[&str] = &[
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PermissionRequest",
    "Notification",
    "Stop",
    "SessionEnd",
];

pub fn claude_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("CLAUDE_CONFIG_DIR") {
        return PathBuf::from(dir);
    }
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_default();
    home.join(".claude")
}

fn settings_path() -> PathBuf {
    claude_dir().join("settings.json")
}

fn read_settings() -> Result<Value, String> {
    match std::fs::read_to_string(settings_path()) {
        Ok(text) if !text.trim().is_empty() => {
            serde_json::from_str(&text).map_err(|e| format!("invalid settings.json: {e}"))
        }
        _ => Ok(json!({})),
    }
}

fn write_settings(settings: &Value) -> Result<(), String> {
    let path = settings_path();
    if path.exists() {
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let backup = path.with_file_name(format!("settings.json.island-backup-{stamp}"));
        std::fs::copy(&path, backup).map_err(|e| format!("backup failed: {e}"))?;
    } else if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, text + "\n").map_err(|e| e.to_string())
}

fn is_our_hook(hook: &Value) -> bool {
    hook["url"].as_str() == Some(hook_url().as_str())
}

fn is_our_statusline(v: &Value) -> bool {
    v["command"].as_str().is_some_and(|c| c.contains(BRIDGE_FLAG))
}

fn bridge_command() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe = exe.to_string_lossy().replace('\\', "/");
    Ok(format!("\"{exe}\" {BRIDGE_FLAG}"))
}

pub fn status() -> Integration {
    let settings = read_settings().unwrap_or(Value::Null);
    let hooks = EVENTS.iter().all(|event| {
        settings["hooks"][event]
            .as_array()
            .is_some_and(|groups| groups.iter().any(|g| g["hooks"].as_array().is_some_and(|h| h.iter().any(is_our_hook))))
    });
    Integration {
        hooks,
        statusline: is_our_statusline(&settings["statusLine"]),
        server_ok: false,
    }
}

pub fn install() -> Result<(), String> {
    let mut settings = read_settings()?;
    let root = settings.as_object_mut().ok_or("settings.json is not an object")?;

    // --- hooks ---------------------------------------------------------------
    let hooks = root.entry("hooks").or_insert_with(|| json!({}));
    let hooks = hooks.as_object_mut().ok_or("\"hooks\" is not an object")?;
    for event in EVENTS {
        let groups = hooks.entry(*event).or_insert_with(|| json!([]));
        let groups = groups.as_array_mut().ok_or("invalid hooks group")?;
        let present = groups
            .iter()
            .any(|g| g["hooks"].as_array().is_some_and(|h| h.iter().any(is_our_hook)));
        if !present {
            groups.push(json!({
                "hooks": [{ "type": "http", "url": hook_url(), "timeout": 3 }]
            }));
        }
    }

    // --- statusline ------------------------------------------------------------
    let existing = root.get("statusLine").cloned();
    if !existing.as_ref().is_some_and(is_our_statusline) {
        let dir = config_dir();
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let original = existing.clone().unwrap_or(Value::Null);
        std::fs::write(dir.join(ORIGINAL_FILE), serde_json::to_string_pretty(&original).unwrap())
            .map_err(|e| e.to_string())?;
    }
    let mut line = Map::new();
    line.insert("type".into(), json!("command"));
    line.insert("command".into(), json!(bridge_command()?));
    if let Some(padding) = existing.as_ref().and_then(|e| e.get("padding")) {
        line.insert("padding".into(), padding.clone());
    }
    root.insert("statusLine".into(), Value::Object(line));

    write_settings(&settings)
}

pub fn uninstall() -> Result<(), String> {
    let mut settings = read_settings()?;
    let Some(root) = settings.as_object_mut() else {
        return Ok(());
    };

    if let Some(hooks) = root.get_mut("hooks").and_then(Value::as_object_mut) {
        for event in EVENTS {
            let Some(groups) = hooks.get_mut(*event).and_then(Value::as_array_mut) else {
                continue;
            };
            for group in groups.iter_mut() {
                if let Some(list) = group.get_mut("hooks").and_then(Value::as_array_mut) {
                    list.retain(|h| !is_our_hook(h));
                }
            }
            groups.retain(|g| g["hooks"].as_array().is_none_or(|h| !h.is_empty()));
            if groups.is_empty() {
                hooks.remove(*event);
            }
        }
        if hooks.is_empty() {
            root.remove("hooks");
        }
    }

    if root.get("statusLine").is_some_and(is_our_statusline) {
        let original = std::fs::read_to_string(config_dir().join(ORIGINAL_FILE))
            .ok()
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .unwrap_or(Value::Null);
        if original.is_null() {
            root.remove("statusLine");
        } else {
            root.insert("statusLine".into(), original);
        }
    }

    write_settings(&settings)
}
