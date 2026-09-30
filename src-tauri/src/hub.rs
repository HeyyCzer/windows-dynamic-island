//! Central state store shared by every provider.
//!
//! Providers call [`Hub::publish`] with their latest state; the hub caches it
//! (so the frontend can fetch a snapshot on load) and emits a single
//! `provider://update` event only when the value actually changed.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

pub const UPDATE_EVENT: &str = "provider://update";

pub struct Hub {
    app: AppHandle,
    state: Mutex<HashMap<String, Value>>,
}

#[derive(Serialize, Clone)]
struct Update<'a> {
    id: &'a str,
    data: &'a Value,
}

impl Hub {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            state: Mutex::new(HashMap::new()),
        }
    }

    /// Store and broadcast a provider's state (deduplicated).
    pub fn publish(&self, id: &str, data: impl Serialize) {
        let value = serde_json::to_value(data).unwrap_or(Value::Null);
        {
            let mut state = self.state.lock().unwrap();
            if state.get(id) == Some(&value) {
                return;
            }
            state.insert(id.to_string(), value.clone());
        }
        let _ = self.app.emit(UPDATE_EVENT, Update { id, data: &value });
    }

    /// Fire-and-forget event for high-frequency data that should not be cached
    /// (e.g. audio levels).
    pub fn transient(&self, event: &str, payload: impl Serialize + Clone) {
        let _ = self.app.emit(event, payload);
    }

    pub fn snapshot(&self) -> HashMap<String, Value> {
        self.state.lock().unwrap().clone()
    }
}
