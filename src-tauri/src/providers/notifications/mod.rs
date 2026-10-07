//! Windows notifications (WhatsApp, Teams, Outlook, Discord…) mirrored into
//! the island: each new toast arrives as an alert, and the module keeps a
//! short history. Dismissing one in the Notification Center drops it here too.
//!
//! Windows only lets apps with *package identity* read notifications, so the
//! island registers a sparse package for itself (`package.rs`) on request.
//! Polls instead of relying on `NotificationChanged`, which is unreliable for
//! unpackaged senders.

mod package;

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use tauri::Manager;
use windows::Foundation::Size;
use windows::Storage::Streams::{DataReader, RandomAccessStreamReference};
use windows::UI::Notifications::Management::{UserNotificationListener, UserNotificationListenerAccessStatus};
use windows::UI::Notifications::{KnownNotificationBindings, NotificationKinds, UserNotification};

use super::activities::{self, Activity, BLUE};
use super::{now_ms, Provider};
use crate::hub::Hub;

pub const ID: &str = "notifications";
const ENABLED_KEY: &str = "module.notifications.enabled";
const POLL: Duration = Duration::from_secs(1);
/// After sleep/resume many can arrive at once; only surface the newest few.
const MAX_BURST: usize = 3;
const MAX_HISTORY: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Access {
    /// Not registered yet: the island has no package identity.
    #[default]
    NoIdentity,
    /// Blocked in Windows Settings → Privacy → Notifications.
    Denied,
    Allowed,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: u32,
    pub app: String,
    pub aumid: String,
    pub logo: Option<String>,
    pub title: String,
    pub body: Option<String>,
    pub received_at: u64,
    pub read: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct State {
    access: Access,
    items: Vec<Item>,
    /// Last error of the "enable" action (Developer Mode off, …).
    error: Option<String>,
}

struct Ctx {
    hub: Arc<Hub>,
    state: Mutex<State>,
}

impl Ctx {
    fn publish(&self) {
        let state = self.state.lock().unwrap().clone();
        self.hub.publish(ID, &state);
    }
}

#[derive(Default)]
pub struct NotificationsProvider {
    ctx: Mutex<Option<Arc<Ctx>>>,
}

impl Provider for NotificationsProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let ctx = Arc::new(Ctx { hub, state: Mutex::default() });
        *self.ctx.lock().unwrap() = Some(ctx.clone());
        ctx.publish();
        std::thread::spawn(move || run(ctx));
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        let ctx = self.ctx.lock().unwrap().clone().ok_or("notifications not started")?;
        match action {
            "open" => {
                let id = payload.as_u64().unwrap_or_default() as u32;
                let item = {
                    let mut state = ctx.state.lock().unwrap();
                    let item = state.items.iter().find(|i| i.id == id).cloned();
                    state.items.retain(|i| i.id != id);
                    item
                };
                if let Some(item) = item {
                    open_app(&item.aumid);
                    if let Some(a) = activities::handle() {
                        a.remove(&activity_id(id));
                    }
                }
            }
            "markRead" => {
                for item in &mut ctx.state.lock().unwrap().items {
                    item.read = true;
                }
            }
            "clear" => ctx.state.lock().unwrap().items.clear(),
            // Register the sparse package, then relaunch to pick up the identity.
            "enable" => match package::register(ctx.hub.app()) {
                Ok(()) => {
                    ctx.hub.app().restart();
                }
                Err(e) => {
                    log::warn!("notifications: package registration failed: {e}");
                    ctx.state.lock().unwrap().error = Some(e.clone());
                    ctx.publish();
                    return Err(e);
                }
            },
            "openPrivacy" => crate::settings::open_url("ms-settings:privacy-notifications"),
            "openDeveloper" => crate::settings::open_url("ms-settings:developers"),
            _ => return Err(format!("{ID}: unknown action '{action}'")),
        }
        ctx.publish();
        Ok(Value::Null)
    }
}

fn run(ctx: Arc<Ctx>) {
    let access = request_access();
    ctx.state.lock().unwrap().access = access;
    ctx.publish();
    if access != Access::Allowed {
        return;
    }
    let Ok(listener) = UserNotificationListener::Current() else { return };

    // Don't replay what is already sitting in the Notification Center.
    let mut known: HashSet<u32> = toasts(&listener).unwrap_or_default().iter().filter_map(|n| n.Id().ok()).collect();
    let mut logos: HashMap<String, Option<String>> = HashMap::new();

    loop {
        std::thread::sleep(POLL);
        if !enabled(&ctx) {
            continue;
        }
        let Ok(current) = toasts(&listener) else { continue };
        let present: HashSet<u32> = current.iter().filter_map(|n| n.Id().ok()).collect();

        let mut arrived: Vec<&UserNotification> =
            current.iter().filter(|n| n.Id().is_ok_and(|id| !known.contains(&id))).collect();
        arrived.sort_by_key(|n| n.CreationTime().map(|t| t.UniversalTime).unwrap_or(0));
        let skip = arrived.len().saturating_sub(MAX_BURST);
        for n in &arrived {
            if let Ok(id) = n.Id() {
                known.insert(id);
            }
        }
        for n in arrived.into_iter().skip(skip) {
            if let Some(item) = read_item(n, &mut logos) {
                show(&ctx, item);
            }
        }

        // Dismissed in the Notification Center (or by the app): drop it here too.
        let gone: Vec<u32> = known.iter().copied().filter(|id| !present.contains(id)).collect();
        if !gone.is_empty() {
            for id in &gone {
                known.remove(id);
                if let Some(a) = activities::handle() {
                    a.remove(&activity_id(*id));
                }
            }
            ctx.state.lock().unwrap().items.retain(|i| !gone.contains(&i.id));
            ctx.publish();
        }
    }
}

fn enabled(ctx: &Ctx) -> bool {
    ctx.hub
        .app()
        .state::<crate::settings::Settings>()
        .get(ENABLED_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

fn request_access() -> Access {
    if !package::has_identity() {
        return Access::NoIdentity;
    }
    let status = UserNotificationListener::Current().and_then(|l| l.RequestAccessAsync()?.join());
    match status {
        Ok(s) if s == UserNotificationListenerAccessStatus::Allowed => Access::Allowed,
        Ok(_) => Access::Denied,
        Err(e) => {
            log::warn!("notifications: {e}");
            Access::Unavailable
        }
    }
}

fn toasts(listener: &UserNotificationListener) -> windows::core::Result<Vec<UserNotification>> {
    let list = listener.GetNotificationsAsync(NotificationKinds::Toast)?.join()?;
    (0..list.Size()?).map(|i| list.GetAt(i)).collect()
}

fn read_item(n: &UserNotification, logos: &mut HashMap<String, Option<String>>) -> Option<Item> {
    let id = n.Id().ok()?;
    // Some Win32 senders expose no AppInfo; show the text anyway.
    let (app, aumid, logo) = match n.AppInfo() {
        Ok(info) => {
            let aumid = info.AppUserModelId().map(|s| s.to_string()).unwrap_or_default();
            let display = info.DisplayInfo().ok();
            let app = display
                .as_ref()
                .and_then(|d| d.DisplayName().ok())
                .map(|s| s.to_string())
                .unwrap_or_default();
            let logo = logos
                .entry(app.clone())
                .or_insert_with(|| {
                    display
                        .and_then(|d| d.GetLogo(Size { Width: 64.0, Height: 64.0 }).ok())
                        .and_then(|r| read_image(&r))
                })
                .clone();
            (app, aumid, logo)
        }
        Err(_) => (String::new(), String::new(), None),
    };
    if app.eq_ignore_ascii_case("Dynamic Island") {
        return None;
    }

    let texts: Vec<String> = n
        .Notification()
        .and_then(|n| n.Visual())
        .and_then(|v| v.GetBinding(&KnownNotificationBindings::ToastGeneric()?))
        .and_then(|b| b.GetTextElements())
        .map(|list| {
            (0..list.Size().unwrap_or(0))
                .filter_map(|i| list.GetAt(i).ok()?.Text().ok().map(|t| t.to_string()))
                .filter(|t| !t.trim().is_empty())
                .collect()
        })
        .unwrap_or_default();
    if texts.is_empty() && app.is_empty() {
        return None;
    }
    let title = texts.first().cloned().unwrap_or_else(|| app.clone());
    let body = (texts.len() > 1).then(|| texts[1..].join(" · "));
    Some(Item { id, app, aumid, logo, title, body, received_at: now_ms(), read: false })
}

fn show(ctx: &Ctx, item: Item) {
    {
        let mut state = ctx.state.lock().unwrap();
        state.items.insert(0, item.clone());
        state.items.truncate(MAX_HISTORY);
    }
    ctx.publish();

    let Some(activities) = activities::handle() else { return };
    let mut alert = Activity::alert(activity_id(item.id), "notification", Duration::from_secs(6));
    alert.caption = (!item.app.is_empty()).then(|| item.app.clone());
    alert.title = item.title;
    alert.subtitle = item.body;
    alert.image = item.logo;
    alert.icon = Some("bell".into());
    alert.color = Some(BLUE.into());
    alert.priority = 60;
    alert.expand = true;
    // Clicking the alert opens the app that sent it.
    alert.action = (!item.aumid.is_empty()).then(|| format!("shell:AppsFolder\\{}", item.aumid));
    activities.upsert(alert);
}

fn activity_id(id: u32) -> String {
    format!("notification.{id}")
}

/// Brings the sending app (WhatsApp, Teams…) to the front.
fn open_app(aumid: &str) {
    if aumid.is_empty() {
        return;
    }
    crate::settings::open_url(&format!("shell:AppsFolder\\{aumid}"));
}

fn read_image(reference: &RandomAccessStreamReference) -> Option<String> {
    let stream = reference.OpenReadAsync().ok()?.join().ok()?;
    let size = stream.Size().ok()? as u32;
    if size == 0 || size > 2 * 1024 * 1024 {
        return None;
    }
    let mime = stream.ContentType().map(|s| s.to_string()).unwrap_or_default();
    let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0).ok()?).ok()?;
    reader.LoadAsync(size).ok()?.join().ok()?;
    let mut buf = vec![0u8; size as usize];
    reader.ReadBytes(&mut buf).ok()?;
    let mime = if mime.is_empty() { "image/png".to_string() } else { mime };
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(&buf)))
}
