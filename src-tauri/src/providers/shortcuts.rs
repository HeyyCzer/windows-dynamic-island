//! Configurable global shortcuts for built-in modules and installed plugins.
//!
//! Built-in Ask and Find actions retain their defaults. Other module shortcuts
//! are opt-in settings stored under `shortcut.module.<module-id>`.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{Listener, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use super::Provider;
use crate::hub::Hub;
use crate::settings::{self, Settings};

pub const ID: &str = "shortcuts";

const MODULE_PREFIX: &str = "shortcut.module.";

/// `shortcut.plugin.<plugin>.<shortcut>`: a plugin's own action.
const PLUGIN_PREFIX: &str = "shortcut.plugin.";

struct Action {
    id: &'static str,
    default: &'static str,
    fallback: Option<&'static str>,
}

const BUILTIN_ACTIONS: [Action; 2] = [
    Action {
        id: "ask",
        default: "Ctrl+Alt+Space",
        fallback: Some("Ctrl+Shift+Space"),
    },
    Action {
        id: "find",
        default: "Ctrl+Alt+F",
        fallback: None,
    },
];

#[derive(Clone)]
struct RegisteredShortcut {
    id: String,
    keys: String,
    shortcut: Shortcut,
}

static REGISTERED: Mutex<Vec<RegisteredShortcut>> = Mutex::new(Vec::new());

pub enum ShortcutTarget {
    Event(&'static str),
    Module(String),
    /// Sent to the plugin as `onShortcut(shortcut)`.
    Plugin {
        plugin: String,
        shortcut: String,
    },
}

pub fn event_for(shortcut: &Shortcut) -> Option<ShortcutTarget> {
    let registered = REGISTERED.lock().unwrap();
    let id = &registered
        .iter()
        .find(|entry| &entry.shortcut == shortcut)?
        .id;
    match id.as_str() {
        "ask" => Some(ShortcutTarget::Event("island://ask")),
        "find" => Some(ShortcutTarget::Event("island://find")),
        _ => {
            if let Some((plugin, shortcut)) =
                id.strip_prefix("plugin:").and_then(|p| p.split_once(':'))
            {
                return Some(ShortcutTarget::Plugin {
                    plugin: plugin.to_string(),
                    shortcut: shortcut.to_string(),
                });
            }
            id.strip_prefix("module:")
                .map(|module_id| ShortcutTarget::Module(module_id.to_string()))
        }
    }
}

#[derive(Default)]
pub struct ShortcutsProvider {
    tx: Mutex<Option<Sender<()>>>,
    paused: AtomicBool,
}

impl ShortcutsProvider {
    fn wake(&self) {
        if let Some(tx) = self.tx.lock().unwrap().as_ref() {
            let _ = tx.send(());
        }
    }
}

impl Provider for ShortcutsProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let (tx, rx) = mpsc::channel();
        let on_settings = tx.clone();
        hub.app().listen(settings::CHANGED_EVENT, move |_| {
            let _ = on_settings.send(());
        });
        let on_plugins = tx.clone();
        hub.app().listen(crate::plugins::CHANGED_EVENT, move |_| {
            let _ = on_plugins.send(());
        });
        let _ = tx.send(());
        *self.tx.lock().unwrap() = Some(tx);

        let this = self.clone();
        std::thread::spawn(move || {
            while rx.recv().is_ok() {
                sync(&hub, this.paused.load(Ordering::SeqCst));
            }
        });
    }

    fn action(&self, action: &str, _payload: Value) -> Result<Value, String> {
        match action {
            "pause" => self.paused.store(true, Ordering::SeqCst),
            "resume" => self.paused.store(false, Ordering::SeqCst),
            _ => return Err(format!("shortcuts: unknown action '{action}'")),
        }
        self.wake();
        Ok(Value::Null)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Status {
    keys: Option<String>,
    taken: Option<String>,
}

struct DesiredShortcut {
    id: String,
    default: Option<String>,
    fallback: Option<String>,
    chosen: Option<String>,
}

fn desired_shortcuts(app: &tauri::AppHandle, settings: &Settings) -> Vec<DesiredShortcut> {
    let mut actions = BUILTIN_ACTIONS
        .iter()
        .map(|action| DesiredShortcut {
            id: action.id.to_string(),
            default: Some(action.default.to_string()),
            fallback: action.fallback.map(str::to_string),
            chosen: settings
                .get(&format!("shortcut.{}", action.id))
                .and_then(|value| value.as_str().map(str::to_string)),
        })
        .collect::<Vec<_>>();

    for (key, value) in settings.snapshot() {
        let Some(module_id) = key.strip_prefix(MODULE_PREFIX).filter(|id| !id.is_empty()) else {
            continue;
        };
        actions.push(DesiredShortcut {
            id: format!("module:{module_id}"),
            default: None,
            fallback: None,
            chosen: value.as_str().map(str::to_string),
        });
    }

    // Plugins' shortcuts: the manifest suggests a default, the user decides.
    for manifest in app.state::<crate::plugins::Plugins>().manifests() {
        if crate::plugins::is_disabled(app, &manifest.id) {
            continue;
        }
        for shortcut in &manifest.shortcuts {
            actions.push(DesiredShortcut {
                id: format!("plugin:{}:{}", manifest.id, shortcut.id),
                default: shortcut.default.clone(),
                fallback: None,
                chosen: settings
                    .get(&format!("{PLUGIN_PREFIX}{}.{}", manifest.id, shortcut.id))
                    .and_then(|value| value.as_str().map(str::to_string)),
            });
        }
    }
    actions
}

fn sync(hub: &Hub, paused: bool) {
    let app = hub.app();
    let settings = app.state::<Settings>();
    let global = app.global_shortcut();
    let previous = REGISTERED.lock().unwrap().clone();
    let mut registered = Vec::new();
    let mut state = Map::new();

    for action in desired_shortcuts(app, &settings) {
        let uses_default = action.chosen.is_none();
        let mut candidates = match action.chosen {
            Some(keys) => vec![keys.trim().to_string()],
            None => action
                .default
                .into_iter()
                .chain(action.fallback)
                .collect::<Vec<_>>(),
        };
        candidates.retain(|keys| !keys.trim().is_empty());
        if paused {
            candidates.clear();
        }

        let mut status = Status::default();
        let existing = previous.iter().find(|entry| entry.id == action.id);
        if let Some(entry) = existing.filter(|entry| candidates.contains(&entry.keys)) {
            status.keys = Some(entry.keys.clone());
            registered.push(entry.clone());
        } else {
            if let Some(entry) = existing {
                let _ = global.unregister(entry.shortcut);
            }
            for keys in &candidates {
                match keys
                    .parse::<Shortcut>()
                    .ok()
                    .filter(|shortcut| global.register(*shortcut).is_ok())
                {
                    Some(shortcut) => {
                        status.keys = Some(keys.clone());
                        registered.push(RegisteredShortcut {
                            id: action.id.clone(),
                            keys: keys.clone(),
                            shortcut,
                        });
                        break;
                    }
                    None => {
                        log::warn!("{} shortcut unavailable: {keys}", action.id);
                        status.taken.get_or_insert_with(|| keys.clone());
                    }
                }
            }
        }
        if status.keys.is_some() && uses_default {
            status.taken = None;
        }
        state.insert(action.id, serde_json::to_value(status).unwrap_or_default());
    }
    *REGISTERED.lock().unwrap() = registered;
    if !paused {
        hub.publish(ID, Value::Object(state));
    }
}
