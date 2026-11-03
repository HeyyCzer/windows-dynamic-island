//! Read-only quota integration with the running Antigravity app's local service.
//! Service CSRF tokens stay in this process and are never published to the UI.
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use super::Provider;
use crate::hub::Hub;

#[derive(Clone, Deserialize)]
struct LocalServer {
    port: u16,
    csrf: String,
}

fn executable() -> PathBuf {
    PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default())
        .join("Programs/antigravity/Antigravity.exe")
}

#[cfg(windows)]
fn discover() -> Vec<LocalServer> {
    use std::io::Read;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::time::Instant;
    let shell = PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_default())
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let script = r#"$ErrorActionPreference='Stop'; $items=@(); Get-CimInstance Win32_Process -Filter "name='language_server.exe' OR name='language_server_windows_x64.exe'" | ForEach-Object { if($_.ExecutablePath -match '[\\/]antigravity[\\/]') { $csrf=[regex]::Match($_.CommandLine,'--csrf_token[=\s]+([^\s"]+)').Groups[1].Value; if($csrf) { Get-NetTCPConnection -State Listen -OwningProcess $_.ProcessId -ErrorAction SilentlyContinue | Where-Object {$_.LocalAddress -in '127.0.0.1','::1'} | ForEach-Object { $items += @{port=$_.LocalPort;csrf=$csrf} } } } }; ConvertTo-Json -InputObject @($items) -Compress"#;
    let Ok(mut child) = Command::new(shell)
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(0x0800_0000)
        .spawn()
    else {
        return vec![];
    };
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return vec![];
                }
                break;
            }
            Ok(None) if started.elapsed() < Duration::from_secs(8) => {
                std::thread::sleep(Duration::from_millis(100))
            }
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
fn discover() -> Vec<LocalServer> {
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
        if let Some(buckets) = group["buckets"].as_array() {
            for bucket in buckets.iter().take(8) {
                let Some(remaining) = bucket["remainingFraction"].as_f64() else {
                    continue;
                };
                if !(0.0..=1.0).contains(&remaining) {
                    continue;
                }
                let window = bucket["window"].as_str().unwrap_or("quota");
                let reset = bucket["resetTime"]
                    .as_str()
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .map(|d| d.timestamp_millis());
                limits.push(json!({"id":format!("antigravity-{i}-{window}"),"label":label,"window":window,"usedPct":(1.0-remaining)*100.0,"resetsAt":reset}));
            }
        }
    }
    limits
}

fn quota(server: &LocalServer) -> Result<Vec<Value>, ()> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .proxy(None)
        .max_redirects(0)
        .timeout_global(Some(Duration::from_secs(3)))
        .build()
        .into();
    let mut response = agent.post(&format!("http://127.0.0.1:{}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary", server.port))
        .header("x-codeium-csrf-token", &server.csrf).header("Connect-Protocol-Version", "1").header("Content-Type", "application/json").send(b"{}").map_err(|_| ())?;
    let body = response
        .body_mut()
        .with_config()
        .limit(512 * 1024)
        .read_to_string()
        .map_err(|_| ())?;
    let payload: Value = serde_json::from_str(&body).map_err(|_| ())?;
    let limits = parse_limits(&payload);
    if limits.is_empty() {
        Err(())
    } else {
        Ok(limits)
    }
}

#[derive(Default)]
pub struct AntigravityProvider {
    servers: Mutex<Vec<LocalServer>>,
}

impl AntigravityProvider {
    fn snapshot(&self) -> Value {
        let cached = self.servers.lock().unwrap().clone();
        for server in &cached {
            if let Ok(limits) = quota(server) {
                return json!({"available":true,"connected":true,"limits":limits,"sessions":[]});
            }
        }
        let servers = discover();
        for server in &servers {
            if let Ok(limits) = quota(server) {
                *self.servers.lock().unwrap() = vec![server.clone()];
                return json!({"available":true,"connected":true,"limits":limits,"sessions":[]});
            }
        }
        *self.servers.lock().unwrap() = vec![];
        json!({"available":executable().is_file() || !servers.is_empty(),"connected":false,"limits":[],"sessions":[],"error":if servers.is_empty() {"not-running"} else {"service-unavailable"}})
    }
}

impl Provider for AntigravityProvider {
    fn id(&self) -> &'static str {
        "gemini"
    }
    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        std::thread::spawn(move || loop {
            hub.publish(self.id(), self.snapshot());
            std::thread::sleep(Duration::from_secs(60));
        });
    }
    fn action(&self, action: &str, _payload: Value) -> Result<Value, String> {
        if action != "launch" {
            return Err("不支持的 Antigravity 操作".into());
        }
        let exe = executable();
        if !exe.is_file() {
            return Err("未找到 Antigravity 安装程序".into());
        }
        std::process::Command::new(exe)
            .spawn()
            .map_err(|_| "无法启动 Antigravity")?;
        Ok(Value::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_real_remaining_fractions_and_reset_dates() {
        let data = json!({"response":{"groups":[{"displayName":"Gemini Models","buckets":[{"window":"5h","remainingFraction":0.75,"resetTime":"2026-11-03T08:22:05Z"},{"window":"weekly","remainingFraction":0.4}]}]}});
        let limits = parse_limits(&data);
        assert_eq!(limits.len(), 2);
        assert_eq!(limits[0]["usedPct"], 25.0);
        assert!(limits[0]["resetsAt"].as_i64().unwrap() > 0);
        assert_eq!(limits[1]["resetsAt"], Value::Null);
        assert!(parse_limits(
            &json!({"response":{"groups":[{"buckets":[{"remainingFraction":2.0}]}]}})
        )
        .is_empty());
    }
}
