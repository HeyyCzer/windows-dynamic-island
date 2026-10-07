//! Local HTTP API (127.0.0.1 only) so any app, script or tool can push
//! activities into the island.
//!
//! - `POST /notify`          transient notification (expands, 5 s by default)
//! - `POST /activity`        live activity (stays until removed or `duration`)
//! - `DELETE /activity/{id}` removes an activity
//! - `GET /status`           current activities and media
//! - `POST /claude/hook`     raw Claude Code hook payload (same as the hooks server)
//!
//! The port is 5199, or `DYNAMIC_ISLAND_PORT` / `WINDOWS_ISLAND_PORT`.

use std::io::Read;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};
use tiny_http::{Header, Method, Request, Response, Server};

use super::{Activities, Activity, Style};
use crate::providers::now_ms;

pub const DEFAULT_PORT: u16 = 5199;
/// Claude Code hook payloads include tool inputs (whole files being written).
const MAX_BODY: u64 = 8 * 1024 * 1024;

pub fn port() -> u16 {
    ["DYNAMIC_ISLAND_PORT", "WINDOWS_ISLAND_PORT"]
        .iter()
        .find_map(|k| std::env::var(k).ok()?.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

pub fn serve(activities: Activities) {
    let port = port();
    let server = match Server::http(("127.0.0.1", port)) {
        Ok(s) => s,
        Err(e) => {
            log::error!("activities api on port {port}: {e}");
            return;
        }
    };
    activities.set_api_port(Some(port));

    for mut req in server.incoming_requests() {
        let mut body = String::new();
        let _ = req.as_reader().take(MAX_BODY).read_to_string(&mut body);
        let (status, payload) = route(&activities, &req, &body);
        respond(req, status, payload);
    }
    activities.set_api_port(None);
}

fn respond(req: Request, status: u16, payload: Option<Value>) {
    let json = Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap();
    let body = payload.map(|p| p.to_string()).unwrap_or_default();
    let _ = req.respond(Response::from_string(body).with_status_code(status).with_header(json));
}

fn route(activities: &Activities, req: &Request, body: &str) -> (u16, Option<Value>) {
    let path = req.url().split('?').next().unwrap_or("").trim_end_matches('/').to_lowercase();
    match (req.method(), path.as_str()) {
        (Method::Options, _) => (204, None),
        (Method::Get, "" | "/status") => (200, Some(status(activities))),
        (Method::Post, "/notify" | "/activity") => {
            let request: ActivityRequest = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => return (400, Some(json!({ "error": format!("invalid JSON: {e}") }))),
            };
            match to_activity(request, path == "/notify") {
                Some(activity) => {
                    let id = activity.id.clone();
                    activities.upsert(activity);
                    (200, Some(json!({ "id": id })))
                }
                None => (400, Some(json!({ "error": "send at least 'title' or 'progress'" }))),
            }
        }
        // 204 keeps curl silent: for UserPromptSubmit, anything a hook prints
        // would be added to Claude's context.
        (Method::Post, "/claude/hook") => {
            if let Ok(v) = serde_json::from_str::<Value>(body) {
                crate::providers::claude::handle_hook(&v);
            }
            (204, None)
        }
        (Method::Delete, p) if p.starts_with("/activity/") => {
            let raw = &req.url().split('?').next().unwrap_or("").trim_end_matches('/')["/activity/".len()..];
            let id = percent_decode(raw);
            if activities.remove(&id) {
                (200, Some(json!({ "removed": id })))
            } else {
                (404, Some(json!({ "error": "activity not found" })))
            }
        }
        _ => (
            404,
            Some(json!({
                "error": "route not found",
                "routes": ["GET /status", "POST /notify", "POST /activity", "DELETE /activity/{id}"],
            })),
        ),
    }
}

fn status(activities: &Activities) -> Value {
    // Mirrored Windows notifications can be private messages: never hand
    // their text to other local apps.
    let items: Vec<Value> = activities
        .snapshot_without("notification")
        .into_iter()
        .map(|a| {
            json!({
                "id": a.id,
                "title": a.title,
                "subtitle": a.subtitle,
                "icon": a.icon,
                "progress": a.progress,
                "priority": a.priority,
                "source": a.source,
            })
        })
        .collect();
    let media = activities
        .hub()
        .snapshot()
        .remove(crate::providers::music::ID)
        .filter(|m| m["available"].as_bool() == Some(true))
        .map(|m| {
            json!({
                "title": m["title"],
                "artist": m["artist"],
                "isPlaying": m["playing"],
                "source": m["appName"],
            })
        });
    json!({
        "name": "Dynamic Island",
        "version": activities.app().package_info().version.to_string(),
        "activities": items,
        "media": media,
    })
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct ActivityRequest {
    id: Option<String>,
    title: Option<String>,
    subtitle: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    progress: Option<f64>,
    duration: Option<f64>,
    priority: Option<i32>,
    action: Option<String>,
    style: Option<String>,
    expand: Option<bool>,
    source: Option<String>,
}

fn to_activity(r: ActivityRequest, notify: bool) -> Option<Activity> {
    let progress = r.progress.filter(|p| p.is_finite()).map(|p| p.clamp(0.0, 1.0));
    let title = truncate(r.title, 120);
    if title.is_none() && progress.is_none() {
        return None;
    }
    let duration = match r.duration.filter(|d| d.is_finite() && *d > 0.0) {
        Some(d) => Some(Duration::from_secs_f64(d.min(86_400.0))),
        None if notify => Some(Duration::from_secs(5)),
        None => None,
    };
    Some(Activity {
        id: truncate(r.id, 64).unwrap_or_else(random_id),
        title: title.unwrap_or_default(),
        subtitle: truncate(r.subtitle, 300),
        caption: None,
        icon: truncate(r.icon, 32),
        image: None,
        color: r.color.filter(|c| is_hex_color(c)),
        progress,
        expires_at: duration.map(|d| now_ms() + d.as_millis() as u64),
        priority: r.priority.unwrap_or(50).clamp(0, 99),
        // Only web links: an HTTP caller must never make us launch a file or protocol.
        action: r.action.filter(|a| a.starts_with("https://") || a.starts_with("http://")),
        style: if r.style.is_some_and(|s| s.eq_ignore_ascii_case("level")) { Style::Level } else { Style::Standard },
        expand: r.expand.unwrap_or(notify),
        source: truncate(r.source, 40).unwrap_or_else(|| "api".into()),
        updated_at: 0,
    })
}

fn truncate(value: Option<String>, max: usize) -> Option<String> {
    let value = value?.trim().to_string();
    if value.is_empty() {
        return None;
    }
    Some(value.chars().take(max).collect())
}

fn is_hex_color(c: &str) -> bool {
    c.strip_prefix('#')
        .is_some_and(|h| matches!(h.len(), 3 | 6 | 8) && h.chars().all(|ch| ch.is_ascii_hexdigit()))
}

fn random_id() -> String {
    format!("{:08x}", (now_ms() as u32) ^ std::process::id().rotate_left(16))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let Some(b) = std::str::from_utf8(&bytes[i + 1..i + 3])
                .ok()
                .and_then(|h| u8::from_str_radix(h, 16).ok())
        {
            out.push(b);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_ids() {
        assert_eq!(percent_decode("build%20web"), "build web");
        assert_eq!(percent_decode("a%2"), "a%2");
    }

    #[test]
    fn needs_title_or_progress() {
        assert!(to_activity(ActivityRequest::default(), true).is_none());
        let a = to_activity(ActivityRequest { progress: Some(2.0), ..Default::default() }, false).unwrap();
        assert_eq!(a.progress, Some(1.0));
        assert!(a.expires_at.is_none());
    }

    #[test]
    fn rejects_unsafe_links_and_colors() {
        let a = to_activity(
            ActivityRequest {
                title: Some("x".into()),
                action: Some("file:///C:/Windows/System32/calc.exe".into()),
                color: Some("red; background: url(x)".into()),
                ..Default::default()
            },
            true,
        )
        .unwrap();
        assert!(a.action.is_none());
        assert!(a.color.is_none());
        assert!(a.expires_at.is_some());
    }
}
