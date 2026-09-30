//! Statusline bridge.
//!
//! Claude Code pipes a JSON payload (model, context window, plan `rate_limits`)
//! into the configured statusline command on every render. When the island
//! integration is installed, that command is this executable with
//! `--claude-statusline`: it forwards the payload to the running island, then
//! runs the user's original statusline command (saved at install time) with the
//! same input and prints its output, so their statusline keeps working.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

use serde_json::Value;

use super::hooks::STATUSLINE_PATH;
use super::{now_ms, Ctx, LimitWindow, Limits, HOOK_PORT};

pub const BRIDGE_FLAG: &str = "--claude-statusline";
const IDENTIFIER: &str = "dev.rafap.dynamicisland";
const LIMITS_FILE: &str = "claude-limits.json";
pub const ORIGINAL_FILE: &str = "claude-statusline-original.json";

/// Same directory Tauri uses as `app_config_dir` on Windows.
pub fn config_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join(IDENTIFIER)
}

// ------------------------------------------------------------ island side --

pub fn handle(ctx: &Ctx, v: &Value) {
    let session_id = v["session_id"].as_str().unwrap_or("");
    let cwd = v["workspace"]["current_dir"]
        .as_str()
        .or_else(|| v["cwd"].as_str())
        .unwrap_or("");
    let model = v["model"]["display_name"].as_str().map(str::to_string);
    let context_pct = v["context_window"]["used_percentage"].as_f64();
    let limits = parse_limits(&v["rate_limits"]);

    {
        let mut store = ctx.store.lock().unwrap();
        if model.is_some() {
            store.model = model.clone();
        }
        if !session_id.is_empty() && store.sessions.contains_key(session_id) {
            let s = store.session(session_id, cwd);
            s.model = model;
            s.context_pct = context_pct;
        }
        if let Some(limits) = limits {
            save_limits(&limits);
            store.limits = Some(limits);
        }
    }
    ctx.publish();
}

fn parse_limits(v: &Value) -> Option<Limits> {
    let window = |w: &Value| {
        w["used_percentage"].as_f64().map(|used_pct| LimitWindow {
            used_pct,
            resets_at: w["resets_at"].as_u64(),
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

pub fn load_limits() -> Option<Limits> {
    let text = std::fs::read_to_string(config_dir().join(LIMITS_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

fn save_limits(limits: &Limits) {
    let dir = config_dir();
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(text) = serde_json::to_string(limits) {
        let _ = std::fs::write(dir.join(LIMITS_FILE), text);
    }
}

// ------------------------------------------------------------ bridge side --

/// Entry point for `dynamic-island.exe --claude-statusline`. Never starts the GUI.
pub fn run_bridge() {
    let mut input = String::new();
    let _ = std::io::stdin().read_to_string(&mut input);

    forward(&input);

    let output = original_command()
        .and_then(|cmd| run_original(&cmd, &input))
        .unwrap_or_else(|| fallback_line(&input));

    let mut out = std::io::stdout();
    let _ = out.write_all(output.as_bytes());
    let _ = out.flush();
}

fn forward(body: &str) {
    let timeout = Duration::from_millis(250);
    let Ok(addr) = format!("127.0.0.1:{HOOK_PORT}").parse() else {
        return;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, timeout) else {
        return; // island not running — nothing to do
    };
    let _ = stream.set_write_timeout(Some(timeout));
    let _ = stream.set_read_timeout(Some(timeout));
    let request = format!(
        "POST {STATUSLINE_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    if stream.write_all(request.as_bytes()).is_ok() {
        let _ = stream.read(&mut [0u8; 256]);
    }
}

fn original_command() -> Option<String> {
    let text = std::fs::read_to_string(config_dir().join(ORIGINAL_FILE)).ok()?;
    let v: Value = serde_json::from_str(&text).ok()?;
    v["command"].as_str().filter(|c| !c.trim().is_empty()).map(str::to_string)
}

/// Run the user's statusline the way Claude Code would: through Git Bash when
/// available, otherwise `cmd`.
fn run_original(command: &str, input: &str) -> Option<String> {
    let mut cmd = match find_bash() {
        Some(bash) => {
            let mut c = Command::new(bash);
            c.arg("-c").arg(command);
            c
        }
        None => {
            let mut c = Command::new("cmd");
            c.arg("/S").arg("/C").arg(command);
            c
        }
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.as_bytes());
    }
    let out = child.wait_with_output().ok()?;
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn find_bash() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("CLAUDE_CODE_GIT_BASH_PATH").map(PathBuf::from)
        && p.exists() {
            return Some(p);
        }
    let candidates = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ];
    candidates.iter().map(PathBuf::from).find(|p| p.exists())
}

/// Minimal statusline when the user had none.
fn fallback_line(input: &str) -> String {
    let v: Value = serde_json::from_str(input).unwrap_or(Value::Null);
    let mut parts = vec![format!("[{}]", v["model"]["display_name"].as_str().unwrap_or("Claude"))];
    if let Some(ctx) = v["context_window"]["used_percentage"].as_f64() {
        parts.push(format!("ctx {ctx:.0}%"));
    }
    if let Some(p) = v["rate_limits"]["five_hour"]["used_percentage"].as_f64() {
        parts.push(format!("5h {p:.0}%"));
    }
    if let Some(p) = v["rate_limits"]["seven_day"]["used_percentage"].as_f64() {
        parts.push(format!("7d {p:.0}%"));
    }
    parts.join(" · ")
}
