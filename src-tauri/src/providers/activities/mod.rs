//! Live activities: short-lived alerts and ongoing activities, pushed by any
//! local app through the HTTP API (`api.rs`) or by the system watchers
//! (volume, battery, Bluetooth headphones) and other providers (Windows
//! notifications, Ask Claude).
//!
//! An activity with an expiry is an *alert*: it takes over the island until it
//! runs out (the volume level, "headphones connected"…). One without an expiry
//! stays until it is removed (a download, a build…).

mod api;
mod battery;
mod bluetooth;
mod volume;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use super::{now_ms, Provider};
use crate::hub::Hub;

pub const ID: &str = "activities";

pub const GREEN: &str = "#30D158";
pub const ORANGE: &str = "#FF9F0A";
pub const RED: &str = "#FF453A";
pub const BLUE: &str = "#0A84FF";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Style {
    /// Icon + title (+ subtitle and progress when expanded).
    #[default]
    Standard,
    /// Icon + level bar in the compact island (volume…).
    Level,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
    /// Small label above the title, e.g. the app that sent a notification.
    pub caption: Option<String>,
    /// Icon name (see `src/modules/activities/glyphs.ts`) or a single character.
    pub icon: Option<String>,
    /// Picture shown instead of the icon (app logo), as a data URL.
    pub image: Option<String>,
    /// Accent color, `#RRGGBB`.
    pub color: Option<String>,
    /// 0..1
    pub progress: Option<f64>,
    /// Unix ms. `None` keeps the activity until it is removed.
    pub expires_at: Option<u64>,
    /// Higher wins. The system volume uses 100; API activities are clamped to 0..99.
    pub priority: i32,
    /// Opened when the activity is clicked (http(s) link, or an app for notifications).
    pub action: Option<String>,
    pub style: Style,
    /// Briefly expands the island when it first arrives.
    pub expand: bool,
    /// "api", "volume", "battery", "bluetooth", "notification", "ask"…
    pub source: String,
    pub updated_at: u64,
}

impl Activity {
    pub fn alert(id: impl Into<String>, source: &str, duration: Duration) -> Self {
        Self {
            id: id.into(),
            source: source.to_string(),
            expires_at: Some(now_ms() + duration.as_millis() as u64),
            priority: 50,
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ActivitiesState {
    /// Highest priority first.
    items: Vec<Activity>,
    /// Port of the local API, when it is listening.
    api_port: Option<u16>,
    /// False on desktops: the battery alerts setting is hidden.
    has_battery: bool,
}

struct Inner {
    hub: Arc<Hub>,
    items: Mutex<HashMap<String, Activity>>,
    api_port: Mutex<Option<u16>>,
}

/// Handle to the shared activity list, usable from any provider.
#[derive(Clone)]
pub struct Activities(Arc<Inner>);

static HANDLE: OnceLock<Activities> = OnceLock::new();

/// The running activity list (`None` before the provider started).
pub fn handle() -> Option<Activities> {
    HANDLE.get().cloned()
}

impl Activities {
    pub fn app(&self) -> &AppHandle {
        self.0.hub.app()
    }

    pub fn hub(&self) -> &Arc<Hub> {
        &self.0.hub
    }

    /// Adds or replaces an activity (same id = update).
    pub fn upsert(&self, mut activity: Activity) {
        activity.updated_at = now_ms();
        self.0.items.lock().unwrap().insert(activity.id.clone(), activity);
        self.publish();
    }

    pub fn remove(&self, id: &str) -> bool {
        let removed = self.0.items.lock().unwrap().remove(id).is_some();
        if removed {
            self.publish();
        }
        removed
    }

    /// Activities except the ones from `hidden_source` (private notifications).
    pub fn snapshot_without(&self, hidden_source: &str) -> Vec<Activity> {
        sorted(&self.0.items.lock().unwrap())
            .into_iter()
            .filter(|a| a.source != hidden_source)
            .collect()
    }

    fn get(&self, id: &str) -> Option<Activity> {
        self.0.items.lock().unwrap().get(id).cloned()
    }

    fn set_api_port(&self, port: Option<u16>) {
        *self.0.api_port.lock().unwrap() = port;
        self.publish();
    }

    fn publish(&self) {
        let state = ActivitiesState {
            items: sorted(&self.0.items.lock().unwrap()),
            api_port: *self.0.api_port.lock().unwrap(),
            has_battery: battery::present(),
        };
        self.0.hub.publish(ID, &state);
    }

    /// Drops expired alerts.
    fn expire(&self) {
        let now = now_ms();
        let removed = {
            let mut items = self.0.items.lock().unwrap();
            let before = items.len();
            items.retain(|_, a| a.expires_at.is_none_or(|t| t > now));
            items.len() != before
        };
        if removed {
            self.publish();
        }
    }
}

fn sorted(items: &HashMap<String, Activity>) -> Vec<Activity> {
    let mut list: Vec<Activity> = items.values().cloned().collect();
    list.sort_by(|a, b| {
        b.priority
            .cmp(&a.priority)
            .then(b.updated_at.cmp(&a.updated_at))
            .then(a.id.cmp(&b.id))
    });
    list
}

#[derive(Default)]
pub struct ActivitiesProvider;

impl Provider for ActivitiesProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let activities = Activities(Arc::new(Inner {
            hub,
            items: Mutex::default(),
            api_port: Mutex::default(),
        }));
        let _ = HANDLE.set(activities.clone());
        activities.publish();

        let expiry = activities.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(200));
            expiry.expire();
        });

        let server = activities.clone();
        std::thread::spawn(move || api::serve(server));

        let watcher = activities.clone();
        std::thread::spawn(move || volume::watch(watcher));
        let watcher = activities.clone();
        std::thread::spawn(move || battery::watch(watcher));
        std::thread::spawn(move || bluetooth::watch(activities));
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        let activities = handle().ok_or("activities not started")?;
        let id = payload.as_str().unwrap_or_default();
        match action {
            "remove" => {
                activities.remove(id);
            }
            // Click on an activity: open its link or app.
            "open" => {
                if let Some(target) = activities.get(id).and_then(|a| a.action) {
                    crate::settings::open_url(&target);
                }
            }
            _ => return Err(format!("{ID}: unknown action '{action}'")),
        }
        Ok(Value::Null)
    }
}
