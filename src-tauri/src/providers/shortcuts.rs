//! Global shortcuts open their pages from anywhere. The hardware Calculator
//! key is additionally registered when Windows exposes it as `LaunchApp2`.
//!
//! Each one is a setting (`shortcut.<id>`) holding a combination such as
//! "Ctrl+Alt+Space"; an empty string turns it off. They're registered again
//! whenever the settings change, and paused while the settings window records
//! a new combination (otherwise the old one would fire instead of being seen).
//! The state tells the frontend which combination each one got, and which
//! ones another app already holds.

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

struct Action {
    id: &'static str,
    default: &'static str,
    /// Tried when the default is taken and the user didn't pick one.
    fallback: Option<&'static str>,
    /// Emitted to the island when the shortcut fires.
    event: &'static str,
}

const ACTIONS: [Action; 3] = [
    Action {
        id: "ask",
        default: "Ctrl+Alt+Space",
        fallback: Some("Ctrl+Shift+Space"),
        event: "island://ask",
    },
    Action {
        id: "find",
        default: "Ctrl+Alt+F",
        fallback: None,
        event: "island://find",
    },
    Action {
        id: "toolboxCalculator",
        default: "Ctrl+Alt+C",
        fallback: None,
        event: "island://toolbox-calculator",
    },
];

/// Mirrors `ShortcutState` in `src/core/shortcuts.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Status {
    /// The combination that works right now.
    keys: Option<String>,
    /// The one asked for is held by another app (or isn't a valid combination).
    taken: Option<String>,
}

/// Registered combination per action, by `ACTIONS` index.
static REGISTERED: Mutex<[Option<(String, Shortcut)>; 3]> = Mutex::new([None, None, None]);

/// Dedicated calculator key (`VK_LAUNCH_APP2`). It is separate from the
/// editable fallback action, so changing that shortcut never disables a
/// physical Calculator key supplied directly by Windows.
static CALCULATOR_KEY: Mutex<Option<Shortcut>> = Mutex::new(None);

/// The island event for a shortcut that fired.
pub fn event_for(shortcut: &Shortcut) -> Option<&'static str> {
    if CALCULATOR_KEY.lock().unwrap().as_ref() == Some(shortcut) {
        return Some("island://toolbox-calculator");
    }
    let registered = REGISTERED.lock().unwrap();
    registered
        .iter()
        .zip(&ACTIONS)
        .find(|(r, _)| r.as_ref().is_some_and(|(_, s)| s == shortcut))
        .map(|(_, a)| a.event)
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
            // While the settings window records a combination.
            "pause" => self.paused.store(true, Ordering::SeqCst),
            "resume" => self.paused.store(false, Ordering::SeqCst),
            _ => return Err(format!("shortcuts: unknown action '{action}'")),
        }
        self.wake();
        Ok(Value::Null)
    }
}

/// Registers what the settings ask for, leaving unchanged ones alone.
fn sync(hub: &Hub, paused: bool) {
    let app = hub.app();
    let settings = app.state::<Settings>();
    let global = app.global_shortcut();
    // A copy: registering waits on the main thread, where `event_for` runs.
    let mut registered = REGISTERED.lock().unwrap().clone();
    let mut state = Map::new();

    // Some keyboard drivers consume this key before Windows sees it. Failure
    // to register is therefore expected and the editable fallback remains
    // available in the ToolBox settings.
    let mut calculator_key = CALCULATOR_KEY.lock().unwrap();
    if paused {
        if let Some(shortcut) = calculator_key.take() {
            let _ = global.unregister(shortcut);
        }
    } else if calculator_key.is_none() {
        match "Calculator".parse::<Shortcut>().ok().filter(|s| global.register(*s).is_ok()) {
            Some(shortcut) => *calculator_key = Some(shortcut),
            None => log::debug!("hardware Calculator key unavailable"),
        }
    }

    for (action, slot) in ACTIONS.iter().zip(registered.iter_mut()) {
        let chosen = settings.get(&format!("shortcut.{}", action.id)).and_then(|v| v.as_str().map(str::to_string));
        let mut candidates: Vec<String> = match &chosen {
            Some(keys) => vec![keys.trim().to_string()],
            None => std::iter::once(action.default).chain(action.fallback).map(str::to_string).collect(),
        };
        candidates.retain(|k| !k.is_empty());
        if paused {
            candidates.clear();
        }

        let mut status = Status::default();
        if let Some((keys, _)) = slot.as_ref().filter(|(keys, _)| candidates.contains(keys)) {
            // Already holds one of the wanted combinations.
            status.keys = Some(keys.clone());
        } else {
            if let Some((_, old)) = slot.take() {
                let _ = global.unregister(old);
            }
            for keys in &candidates {
                match keys.parse::<Shortcut>().ok().filter(|s| global.register(*s).is_ok()) {
                    Some(shortcut) => {
                        *slot = Some((keys.clone(), shortcut));
                        status.keys = Some(keys.clone());
                        break;
                    }
                    None => {
                        log::warn!("{} shortcut unavailable: {keys}", action.id);
                        status.taken.get_or_insert_with(|| keys.clone());
                    }
                }
            }
        }
        // The fallback worked: the default being taken isn't news.
        if status.keys.is_some() && chosen.is_none() {
            status.taken = None;
        }
        state.insert(action.id.to_string(), serde_json::to_value(status).unwrap_or_default());
    }
    *REGISTERED.lock().unwrap() = registered;
    // Paused: the frontend still shows what's set.
    if !paused {
        hub.publish(ID, Value::Object(state));
    }
}
