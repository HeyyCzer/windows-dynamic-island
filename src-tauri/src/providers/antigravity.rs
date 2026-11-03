//! Read-only quota integration with the running Antigravity app's local language server.
//! Its CSRF token stays in this process and is never published to the UI.
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};
use tauri::Manager;

use super::Provider;
use crate::hub::Hub;
use crate::settings::Settings;

/// Poll interval while the quota can be read.
const CONNECTED_POLL: Duration = Duration::from_secs(60);
/// Poll interval while waiting for the app (cheap: PowerShell only runs once its server is up).
const DISCONNECTED_POLL: Duration = Duration::from_secs(15);
/// Antigravity's exe, `null` for the default install. Set from the settings window
/// (`AntigravitySettings`) through the `setExe` action.
const EXE_KEY: &str = "agents.antigravityExe";
const LANGUAGE_SERVERS: [&str; 2] = ["language_server_windows_x64", "language_server"];

#[derive(Clone, Deserialize)]
struct LocalServer {
    port: u16,
    csrf: String,
}

/// The default per-user install.
fn default_executable() -> PathBuf {
    PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default())
        .join("Programs")
        .join("Antigravity")
        .join("Antigravity.exe")
}

/// The exe set in the settings, else the default install.
fn executable(hub: &Hub) -> PathBuf {
    hub.app()
        .state::<Settings>()
        .get(EXE_KEY)
        .and_then(|v| {
            v.as_str()
                .filter(|s| !s.trim().is_empty())
                .map(PathBuf::from)
        })
        .unwrap_or_else(default_executable)
}

/// Language servers running from Antigravity's install folder, found by name in
/// the process list: no other process is inspected.
fn language_servers(exe: &Path) -> Vec<u32> {
    let Some(dir) = exe.parent().map(|d| d.to_string_lossy().to_lowercase()) else {
        return vec![];
    };
    LANGUAGE_SERVERS
        .iter()
        .flat_map(|stem| super::process::processes_named(stem))
        .filter(|(_, path)| path.to_string_lossy().to_lowercase().starts_with(&dir))
        .map(|(pid, _)| pid)
        .take(8)
        .collect()
}

/// Ports and CSRF tokens of these language servers (read from their command lines).
#[cfg(windows)]
fn discover(pids: &[u32]) -> Vec<LocalServer> {
    use std::io::Read;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::time::Instant;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const TIMEOUT: Duration = Duration::from_secs(8);
    if pids.is_empty() {
        return vec![];
    }
    let pids = pids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let script = format!(
        r#"$ErrorActionPreference='Stop'; $items=@(); foreach($id in @({pids})) {{ $p=Get-CimInstance Win32_Process -Filter "ProcessId=$id"; if($p) {{ $csrf=[regex]::Match([string]$p.CommandLine,'--csrf_token[=\s]+([^\s"]+)').Groups[1].Value; if($csrf) {{ Get-NetTCPConnection -State Listen -OwningProcess $id -ErrorAction SilentlyContinue | Where-Object {{$_.LocalAddress -eq '127.0.0.1'}} | ForEach-Object {{ $items += @{{port=$_.LocalPort;csrf=$csrf}} }} }} }} }}; ConvertTo-Json -InputObject @($items) -Compress"#
    );
    let shell = PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_default())
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let Ok(mut child) = Command::new(shell)
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
    else {
        return vec![];
    };
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(None) if started.elapsed() < TIMEOUT => {
                std::thread::sleep(Duration::from_millis(100))
            }
            Ok(Some(_)) => return vec![],
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return vec![];
            }
        }
    }
    let mut output = String::new();
    if let Some(stdout) = child.stdout.take() {
        let _ = stdout.take(16 * 1024).read_to_string(&mut output);
    }
    serde_json::from_str::<Vec<LocalServer>>(output.trim_start_matches('\u{feff}').trim())
        .unwrap_or_default()
        .into_iter()
        .filter(|s| s.port > 0 && !s.csrf.is_empty())
        .take(8)
        .collect()
}

#[cfg(not(windows))]
fn discover(_pids: &[u32]) -> Vec<LocalServer> {
    vec![]
}

fn parse_limits(payload: &Value) -> Vec<Value> {
    let Some(groups) = payload
        .pointer("/response/groups")
        .and_then(Value::as_array)
    else {
        return vec![];
    };
    let mut limits = vec![];
    for (i, group) in groups.iter().take(8).enumerate() {
        let label = group["displayName"].as_str().unwrap_or("Antigravity");
        let Some(buckets) = group["buckets"].as_array() else {
            continue;
        };
        for bucket in buckets.iter().take(8) {
            let Some(remaining) = bucket["remainingFraction"]
                .as_f64()
                .filter(|r| (0.0..=1.0).contains(r))
            else {
                continue;
            };
            let window = bucket["window"].as_str().unwrap_or("quota");
            let resets_at = bucket["resetTime"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|d| d.timestamp_millis());
            limits.push(json!({
                "id": format!("antigravity-{i}-{window}"),
                "label": label,
                "window": window,
                "usedPct": (1.0 - remaining) * 100.0,
                "resetsAt": resets_at,
            }));
        }
    }
    limits
}

/// The server's quota limits; `None` when it can't be read or has none.
fn quota(server: &LocalServer) -> Option<Vec<Value>> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .proxy(None)
        .max_redirects(0)
        .timeout_global(Some(Duration::from_secs(3)))
        .build()
        .into();
    let url = format!(
        "http://127.0.0.1:{}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary",
        server.port
    );
    let mut response = agent
        .post(&url)
        .header("x-codeium-csrf-token", &server.csrf)
        .header("Connect-Protocol-Version", "1")
        .header("Content-Type", "application/json")
        .send(b"{}")
        .ok()?;
    let body = response
        .body_mut()
        .with_config()
        .limit(512 * 1024)
        .read_to_string()
        .ok()?;
    let limits = parse_limits(&serde_json::from_str(&body).ok()?);
    (!limits.is_empty()).then_some(limits)
}

#[derive(Default)]
pub struct AntigravityProvider {
    hub: OnceLock<Arc<Hub>>,
    /// The last server that answered, tried before discovering again.
    server: Mutex<Option<LocalServer>>,
}

impl AntigravityProvider {
    /// Publishes the current state; `true` when the quota could be read.
    fn refresh(&self, hub: &Hub) -> bool {
        let exe = executable(hub);
        let cached = self.server.lock().unwrap().clone();
        let mut pids = None;
        let found = cached
            .and_then(|s| quota(&s).map(|limits| (s, limits)))
            .or_else(|| {
                discover(pids.insert(language_servers(&exe)))
                    .into_iter()
                    .find_map(|s| quota(&s).map(|limits| (s, limits)))
            });
        let connected = found.is_some();
        let running = connected || pids.is_some_and(|p| !p.is_empty());
        let (server, limits) = found.unzip();
        *self.server.lock().unwrap() = server;
        hub.publish(
            self.id(),
            json!({
                "available": running || exe.is_file(),
                "exe": exe,
                "defaultExe": default_executable(),
                "connected": connected,
                "limits": limits.unwrap_or_default(),
                "error": (!connected).then_some(if running { "service-unavailable" } else { "not-running" }),
            }),
        );
        connected
    }
}

impl Provider for AntigravityProvider {
    fn id(&self) -> &'static str {
        "antigravity"
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let _ = self.hub.set(hub.clone());
        std::thread::spawn(move || {
            loop {
                let connected = self.refresh(&hub);
                std::thread::sleep(if connected {
                    CONNECTED_POLL
                } else {
                    DISCONNECTED_POLL
                });
            }
        });
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        let hub = self.hub.get().ok_or("antigravity: not started")?;
        match action {
            "pickExe" => {
                Ok(crate::dialog::pick_file("Antigravity", "*.exe")
                    .map_or(Value::Null, Value::String))
            }
            // A new exe path (`null` or empty: the default install).
            "setExe" => {
                let exe = payload.as_str().map(str::trim).filter(|s| !s.is_empty());
                crate::settings::set(
                    hub.app(),
                    EXE_KEY,
                    exe.map_or(Value::Null, |s| Value::String(s.into())),
                );
                *self.server.lock().unwrap() = None;
                self.refresh(hub);
                Ok(Value::Null)
            }
            "launch" => {
                let exe = executable(hub);
                if !exe.is_file() {
                    return Err(format!("Antigravity not found at {}", exe.display()));
                }
                std::process::Command::new(exe)
                    .spawn()
                    .map_err(|e| format!("couldn't start Antigravity: {e}"))?;
                Ok(Value::Null)
            }
            _ => Err(format!("antigravity: unsupported action '{action}'")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_remaining_fractions_and_reset_dates() {
        let data = json!({"response":{"groups":[{"displayName":"Gemini Models","buckets":[{"window":"5h","remainingFraction":0.75,"resetTime":"2026-11-03T08:22:05Z"},{"window":"weekly","remainingFraction":0.4}]}]}});
        let limits = parse_limits(&data);
        assert_eq!(limits.len(), 2);
        assert_eq!(limits[0]["usedPct"], 25.0);
        assert_eq!(limits[0]["label"], "Gemini Models");
        assert!(limits[0]["resetsAt"].as_i64().unwrap() > 0);
        assert_eq!(limits[1]["resetsAt"], Value::Null);
    }

    #[test]
    fn skips_out_of_range_and_missing_fractions() {
        let data = json!({"response":{"groups":[{"buckets":[{"remainingFraction":2.0},{"window":"5h"}]}]}});
        assert!(parse_limits(&data).is_empty());
        assert!(parse_limits(&json!({})).is_empty());
    }
}
