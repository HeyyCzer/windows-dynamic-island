//! Plan limits straight from Anthropic.
//!
//! The statusline only runs in the terminal CLI (not the IDE extensions), so we
//! also ask the same endpoint Claude Code's `/usage` uses, authenticated with the
//! OAuth token Claude Code keeps in `~/.claude/.credentials.json`. The token is
//! only ever sent to api.anthropic.com.
//!
//! The endpoint is undocumented and aggressively rate limited, so requests are
//! on demand (panel visible, a few hooks) and gated: a minimum age per caller,
//! one request in flight, and `Retry-After` / auth failures back off.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde_json::Value;

use super::{now_ms, statusline, Ctx, LimitWindow, Limits};

const URL: &str = "https://api.anthropic.com/api/oauth/usage";
const BETA: &str = "oauth-2025-04-20";

/// Panel open: at most one request per minute.
pub const VIEW_MIN_AGE_MS: u64 = 60 * 1000;
/// Hooks fire constantly; only refresh from them every 5 minutes.
pub const HOOK_MIN_AGE_MS: u64 = 5 * 60 * 1000;
/// No/expired token or other failure: wait before trying again.
const FAILURE_BACKOFF_MS: u64 = 5 * 60 * 1000;
/// Cap for a server-provided `Retry-After`.
const MAX_RETRY_AFTER_MS: u64 = 60 * 60 * 1000;

struct Gate {
    in_flight: bool,
    last_attempt: u64,
    blocked_until: u64,
}

static GATE: Mutex<Gate> = Mutex::new(Gate {
    in_flight: false,
    last_attempt: 0,
    blocked_until: 0,
});

/// Refresh limits in the background unless one ran within `min_age_ms`.
pub fn request(ctx: &Ctx, min_age_ms: u64) {
    let now = now_ms();
    {
        let mut gate = GATE.lock().unwrap();
        if gate.in_flight || now < gate.blocked_until || now.saturating_sub(gate.last_attempt) < min_age_ms {
            return;
        }
        gate.in_flight = true;
        gate.last_attempt = now;
    }
    let ctx = ctx.clone();
    std::thread::spawn(move || {
        let result = fetch();
        let mut gate = GATE.lock().unwrap();
        gate.in_flight = false;
        match result {
            Ok(limits) => {
                statusline::save_limits(&limits);
                ctx.store.lock().unwrap().limits = Some(limits);
                drop(gate);
                ctx.publish();
            }
            Err(Failure { retry_after_ms, reason }) => {
                log::warn!("claude usage: {reason}");
                gate.blocked_until = now_ms() + retry_after_ms.unwrap_or(FAILURE_BACKOFF_MS).min(MAX_RETRY_AFTER_MS);
            }
        }
    });
}

struct Failure {
    retry_after_ms: Option<u64>,
    reason: String,
}

impl Failure {
    fn new(reason: impl Into<String>) -> Self {
        Self {
            retry_after_ms: None,
            reason: reason.into(),
        }
    }
}

fn fetch() -> Result<Limits, Failure> {
    let token = access_token().ok_or_else(|| Failure::new("no Claude Code OAuth token"))?;

    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(10)))
        .build()
        .into();
    let mut res = agent
        .get(URL)
        .header("Authorization", &format!("Bearer {token}"))
        .header("anthropic-beta", BETA)
        .call()
        .map_err(|e| Failure::new(e.to_string()))?;

    let status = res.status().as_u16();
    if status != 200 {
        let retry_after_ms = res
            .headers()
            .get("retry-after")
            .and_then(|h| h.to_str().ok())
            .and_then(|s| s.trim().parse::<u64>().ok())
            .map(|secs| secs * 1000);
        return Err(Failure {
            retry_after_ms,
            reason: format!("HTTP {status}"),
        });
    }

    let body = res.body_mut().read_to_string().map_err(|e| Failure::new(e.to_string()))?;
    let v: Value = serde_json::from_str(&body).map_err(|e| Failure::new(e.to_string()))?;
    parse(&v).ok_or_else(|| Failure::new("no limit windows in response"))
}

fn access_token() -> Option<String> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    let path = PathBuf::from(home).join(".claude").join(".credentials.json");
    let v: Value = serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
    let oauth = &v["claudeAiOauth"];
    // Claude Code refreshes it; an expired token would just 401.
    if oauth["expiresAt"].as_u64().is_some_and(|exp| exp <= now_ms()) {
        return None;
    }
    oauth["accessToken"].as_str().filter(|t| !t.is_empty()).map(str::to_string)
}

fn parse(v: &Value) -> Option<Limits> {
    let window = |w: &Value| {
        w["utilization"].as_f64().map(|used_pct| LimitWindow {
            used_pct,
            resets_at: w["resets_at"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .and_then(|d| u64::try_from(d.timestamp()).ok()),
        })
    };
    let five_hour = window(&v["five_hour"]);
    let seven_day = window(&v["seven_day"]);
    if five_hour.is_none() && seven_day.is_none() {
        return None;
    }
    Some(Limits {
        five_hour,
        seven_day,
        updated_at: now_ms(),
    })
}
