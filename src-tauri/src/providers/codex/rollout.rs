//! Reads Codex's rollouts (`~/.codex/sessions/**/rollout-*.jsonl`).
//!
//! Each line is `{ timestamp, type, payload }`. Files are read incrementally
//! from the last offset, so a scan only parses newly appended lines.
//!
//! - Sessions: one per (non-subagent) thread, status from the turn events,
//!   activity from the last tool call.
//! - Tokens: every `token_count` whose running total moved adds its
//!   `last_token_usage` (today by kind, per day for 7 days, the last 5h).
//! - Limits: the `rate_limits` of the newest `token_count` across files.

use std::collections::{HashMap, VecDeque};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};

use chrono::{DateTime, Days, Local, NaiveDate};
use serde_json::Value;

use super::{codex_home, CodexState, LimitWindow, Limits, Session};
use crate::hub::Hub;
use crate::providers::claude::activity::{file_name, host, Activity};
use crate::providers::claude::{preview, project_name, DayUsage, Status, TokenStats, Usage};
use crate::providers::now_ms;

const SCAN_EVERY: Duration = Duration::from_secs(2);
/// Only list sessions active this recently.
const RECENT_MS: u64 = 30 * 60_000;
/// Without new lines, a "working" session is considered abandoned after this.
const STALE_WORKING_MS: u64 = 30 * 60_000;
/// Days in the usage chart, today included.
const DAYS: usize = 7;
const FIVE_HOURS_MS: u64 = 5 * 3600 * 1000;
/// Sessions shown in the island.
const MAX_SESSIONS: usize = 8;

#[derive(Default)]
struct FileState {
    offset: u64,
    /// A subagent's thread: its tokens count, but it isn't listed.
    hidden: bool,
    session: Session,
    context_window: Option<u64>,
    /// `total_token_usage.total_tokens` of the last counted `token_count`.
    last_total: Option<u64>,
}

/// Usage counters for the current 7-day window.
struct Totals {
    first_day: NaiveDate,
    today: NaiveDate,
    today_tokens: TokenStats,
    daily: [(u64, u64); DAYS],
    /// `(timestamp, tokens)` of the last 5 hours.
    recent: VecDeque<(u64, u64)>,
}

impl Totals {
    fn new(today: NaiveDate) -> Self {
        Self {
            first_day: today.checked_sub_days(Days::new(DAYS as u64 - 1)).unwrap_or(today),
            today,
            today_tokens: TokenStats::default(),
            daily: [(0, 0); DAYS],
            recent: VecDeque::new(),
        }
    }

    fn day_index(&self, day: NaiveDate) -> Option<usize> {
        day.signed_duration_since(self.first_day)
            .num_days()
            .try_into()
            .ok()
            .filter(|&i: &usize| i < DAYS)
    }

    fn usage(&mut self, now: u64) -> Usage {
        let horizon = now.saturating_sub(FIVE_HOURS_MS);
        self.recent.retain(|(t, _)| *t >= horizon);
        Usage {
            daily: self
                .daily
                .iter()
                .enumerate()
                .map(|(i, (tokens, responses))| DayUsage {
                    date: self
                        .first_day
                        .checked_add_days(Days::new(i as u64))
                        .unwrap_or(self.first_day)
                        .format("%Y-%m-%d")
                        .to_string(),
                    tokens: *tokens,
                    responses: *responses,
                })
                .collect(),
            last5h_tokens: self.recent.iter().map(|(_, n)| n).sum(),
        }
    }
}

pub fn scan_loop(hub: Arc<Hub>) {
    let mut files: HashMap<PathBuf, FileState> = HashMap::new();
    let mut totals = Totals::new(Local::now().date_naive());
    let mut limits: Option<Limits> = None;

    loop {
        let today = Local::now().date_naive();
        if today != totals.today {
            // New day: the window moves, so recount it from scratch.
            files.clear();
            totals = Totals::new(today);
        }
        let horizon = midnight_ms(totals.first_day);
        let home = codex_home();

        let mut paths = Vec::new();
        collect_rollouts(&home.join("sessions"), 0, &mut paths);
        for path in paths {
            let Ok(meta) = std::fs::metadata(&path) else { continue };
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            if mtime < horizon {
                continue;
            }
            let st = files.entry(path.clone()).or_default();
            if meta.len() < st.offset {
                *st = FileState::default(); // rewritten
            }
            if meta.len() > st.offset {
                read_new_lines(&path, st, &mut totals, &mut limits);
            }
        }

        let now = now_ms();
        if let Some(l) = limits.as_mut() {
            expire(l, now / 1000);
        }
        let sessions = sessions(&mut files, now);
        let state = CodexState {
            available: home.is_dir(),
            model: sessions.iter().max_by_key(|s| s.last_event_at).and_then(|s| s.model.clone()),
            sessions,
            limits: limits.clone(),
            tokens_today: totals.today_tokens.clone(),
            usage: totals.usage(now),
        };
        hub.publish(super::ID, &state);
        std::thread::sleep(SCAN_EVERY);
    }
}

/// `sessions/YYYY/MM/DD/rollout-*.jsonl`
fn collect_rollouts(dir: &Path, depth: u8, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        match entry.file_type() {
            Ok(t) if t.is_dir() && depth < 3 => collect_rollouts(&path, depth + 1, out),
            Ok(t) if t.is_file()
                && path.extension().is_some_and(|e| e == "jsonl")
                && path.file_name().is_some_and(|n| n.to_string_lossy().starts_with("rollout-")) =>
            {
                out.push(path)
            }
            _ => {}
        }
    }
}

fn midnight_ms(day: NaiveDate) -> u64 {
    day.and_hms_opt(0, 0, 0)
        .and_then(|d| d.and_local_timezone(Local).earliest())
        .map(|d| d.timestamp_millis().max(0) as u64)
        .unwrap_or(0)
}

fn read_new_lines(path: &Path, st: &mut FileState, totals: &mut Totals, limits: &mut Option<Limits>) {
    let Ok(mut file) = File::open(path) else { return };
    if file.seek(SeekFrom::Start(st.offset)).is_err() {
        return;
    }
    let mut buf = Vec::new();
    if file.read_to_end(&mut buf).is_err() {
        return;
    }
    // Only consume complete lines; a partially written one is read next time.
    let Some(last_nl) = buf.iter().rposition(|&b| b == b'\n') else { return };
    st.offset += last_nl as u64 + 1;

    for line in buf[..last_nl].split(|&b| b == b'\n') {
        let Ok(v) = serde_json::from_slice::<Value>(line) else { continue };
        process_line(&v, st, totals, limits);
    }
}

fn process_line(v: &Value, st: &mut FileState, totals: &mut Totals, limits: &mut Option<Limits>) {
    let ts = v["timestamp"]
        .as_str()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.with_timezone(&Local));
    let ts_ms = ts.map(|d| d.timestamp_millis().max(0) as u64).unwrap_or(st.session.last_event_at);
    let s = &mut st.session;
    s.last_event_at = s.last_event_at.max(ts_ms);
    let p = &v["payload"];
    let str_of = |v: &Value, k: &str| v[k].as_str().filter(|s| !s.is_empty()).map(str::to_string);
    // Unix seconds in the payload, else the line's timestamp.
    let secs_or_ts = |k: &str| p[k].as_u64().map(|s| s * 1000).unwrap_or(ts_ms);

    match v["type"].as_str() {
        Some("session_meta") => {
            if let Some(id) = str_of(p, "id") {
                s.id = id;
            }
            if let Some(cwd) = str_of(p, "cwd") {
                set_cwd(s, cwd);
            }
            st.hidden = p["source"].get("subagent").is_some() || p["parent_thread_id"].is_string();
        }
        Some("turn_context") => {
            if let Some(cwd) = str_of(p, "cwd") {
                set_cwd(s, cwd);
            }
            if let Some(model) = str_of(p, "model") {
                s.model = Some(model);
            }
        }
        Some("event_msg") => match p["type"].as_str().unwrap_or("") {
            "task_started" | "turn_started" => {
                s.status = Status::Working;
                s.turn_started_at = Some(secs_or_ts("started_at"));
                s.finished_at = None;
                s.summary = None;
                s.activity = Some(Activity::thinking());
                if let Some(w) = p["model_context_window"].as_u64() {
                    st.context_window = Some(w);
                }
            }
            "task_complete" | "turn_complete" => {
                let failed = !p["error"].is_null();
                s.status = Status::Done;
                s.finished_at = Some(secs_or_ts("completed_at"));
                s.summary = p["last_agent_message"].as_str().map(preview).filter(|t| !t.is_empty());
                s.activity = Some(Activity::new(if failed { "failed" } else { "done" }));
                if let Some(i) = ts.and_then(|d| totals.day_index(d.date_naive())) {
                    totals.daily[i].1 += 1;
                }
            }
            "turn_aborted" => {
                s.status = Status::Idle;
                s.finished_at = Some(secs_or_ts("completed_at"));
                s.activity = Some(Activity::new("interrupted"));
            }
            "user_message" => set_prompt(s, p["message"].as_str().unwrap_or("")),
            "token_count" => {
                let info = &p["info"];
                if let Some(window) = info["model_context_window"].as_u64() {
                    st.context_window = Some(window);
                }
                let total = info["total_token_usage"]["total_tokens"].as_u64();
                // Also re-sent unchanged when only the rate limits moved.
                if total.is_some() && total != st.last_total {
                    st.last_total = total;
                    let last = &info["last_token_usage"];
                    if let Some(ts) = ts {
                        count_usage(totals, last, ts.date_naive(), ts_ms);
                    }
                    if let (Some(window), Some(used)) = (st.context_window, last["total_tokens"].as_u64())
                        && window > 0
                    {
                        s.context_pct = Some((used as f64 * 100.0 / window as f64).min(100.0));
                    }
                }
                if let Some(new) = parse_limits(&p["rate_limits"], ts_ms)
                    && limits.as_ref().is_none_or(|l| new.updated_at >= l.updated_at)
                {
                    *limits = Some(new);
                }
            }
            _ => {}
        },
        Some("response_item") => {
            let activity = match p["type"].as_str().unwrap_or("") {
                "function_call" => {
                    let args = p["arguments"]
                        .as_str()
                        .and_then(|a| serde_json::from_str(a).ok())
                        .unwrap_or(Value::Null);
                    Some(describe(p["name"].as_str().unwrap_or(""), &args))
                }
                "custom_tool_call" => Some(describe(p["name"].as_str().unwrap_or(""), &p["input"])),
                "local_shell_call" => Some(describe("local_shell", &p["action"])),
                "web_search_call" => Some(Activity::with("webSearch", p["action"]["query"].as_str().unwrap_or(""))),
                "message" if p["role"] == "user" => {
                    let text = p["content"]
                        .as_array()
                        .map(|c| c.iter().filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join("\n"))
                        .unwrap_or_default();
                    set_prompt(s, &text);
                    None
                }
                _ => None,
            };
            if let Some(activity) = activity {
                if !matches!(s.status, Status::Working) {
                    s.status = Status::Working;
                    s.turn_started_at = Some(ts_ms);
                    s.finished_at = None;
                }
                s.activity = Some(activity);
            }
        }
        _ => {}
    }
}

fn set_cwd(s: &mut Session, cwd: String) {
    if s.cwd != cwd {
        s.project = project_name(&cwd);
        s.cwd = cwd;
    }
}

/// What the user typed — not the instructions and context Codex injects.
fn set_prompt(s: &mut Session, text: &str) {
    let t = text.trim_start();
    if t.is_empty() || t.starts_with('<') || t.starts_with("# AGENTS.md") {
        return;
    }
    s.prompt = Some(preview(t));
}

fn count_usage(totals: &mut Totals, last: &Value, day: NaiveDate, ts_ms: u64) {
    let Some(index) = totals.day_index(day) else { return };
    let n = |k: &str| last[k].as_u64().unwrap_or(0);
    // OpenAI counts cached tokens inside `input_tokens`.
    let cache_read = n("cached_input_tokens");
    let input = n("input_tokens").saturating_sub(cache_read);
    let cache_write = n("cache_write_input_tokens");
    let output = n("output_tokens");
    let all = input + cache_read + cache_write + output;
    if all == 0 {
        return;
    }
    totals.daily[index].0 += all;
    if now_ms().saturating_sub(ts_ms) < FIVE_HOURS_MS {
        totals.recent.push_back((ts_ms, all));
    }
    if day == totals.today {
        let t = &mut totals.today_tokens;
        t.input += input;
        t.output += output;
        t.cache_read += cache_read;
        t.cache_write += cache_write;
        t.messages += 1;
    }
}

fn parse_limits(rl: &Value, ts_ms: u64) -> Option<Limits> {
    // Other buckets (e.g. a model with its own limits) aren't the plan's.
    if rl["limit_id"].as_str().is_some_and(|id| id != "codex") {
        return None;
    }
    let window = |w: &Value| {
        w["used_percent"].as_f64().map(|used_pct| LimitWindow {
            used_pct,
            window_minutes: w["window_minutes"].as_u64(),
            // Older versions sent a relative `resets_in_seconds`.
            resets_at: w["resets_at"]
                .as_u64()
                .or_else(|| w["resets_in_seconds"].as_u64().map(|s| ts_ms / 1000 + s)),
        })
    };
    let primary = window(&rl["primary"]);
    let secondary = window(&rl["secondary"]);
    if primary.is_none() && secondary.is_none() {
        return None;
    }
    Some(Limits {
        primary,
        secondary,
        updated_at: ts_ms,
    })
}

/// A window past its reset time no longer applies: it starts over at 0.
fn expire(limits: &mut Limits, now_s: u64) {
    for w in [&mut limits.primary, &mut limits.secondary].into_iter().flatten() {
        if w.resets_at.is_some_and(|t| t <= now_s) {
            w.used_pct = 0.0;
            w.resets_at = None;
        }
    }
}

fn sessions(files: &mut HashMap<PathBuf, FileState>, now: u64) -> Vec<Session> {
    let mut out: Vec<Session> = files
        .values_mut()
        .filter(|st| !st.hidden && !st.session.id.is_empty())
        .filter_map(|st| {
            let s = &mut st.session;
            let quiet = now.saturating_sub(s.last_event_at);
            if s.status == Status::Working && quiet > STALE_WORKING_MS {
                s.status = Status::Idle;
                s.activity = None;
            }
            (quiet < RECENT_MS).then(|| s.clone())
        })
        .collect();
    let rank = |s: &Session| match s.status {
        Status::Waiting => 0,
        Status::Working => 1,
        Status::Done => 2,
        Status::Idle => 3,
    };
    out.sort_by(|a, b| rank(a).cmp(&rank(b)).then(b.last_event_at.cmp(&a.last_event_at)));
    out.truncate(MAX_SESSIONS);
    out
}

/// Turns a Codex tool call into the same activities as Claude's.
fn describe(tool: &str, args: &Value) -> Activity {
    let s = |key: &str| args[key].as_str().unwrap_or("");
    let file = |key: &str| file_name(s(key)).unwrap_or_default();

    match tool {
        "shell" | "container.exec" | "local_shell" | "exec_command" | "shell_command" | "unified_exec" => {
            Activity::with("run", command(args))
        }
        "apply_patch" => {
            let patch = args.as_str().or_else(|| args["input"].as_str()).or_else(|| args["patch"].as_str());
            patch_activity(patch.unwrap_or(""))
        }
        "update_plan" => Activity::new("todos"),
        "view_image" | "read_file" => Activity::with("read", file("path")),
        "list_dir" => Activity::with("glob", s("dir_path")),
        "grep_files" => Activity::with("grep", s("pattern")),
        "web_search" => Activity::with("webSearch", s("query")),
        "web_fetch" | "fetch" => Activity::with("webFetch", host(s("url"))),
        "spawn_agent" => Activity::with("subagent", s("message")),
        "request_user_input" => Activity::new("question"),
        t if t.starts_with("mcp__") => {
            let mut parts = t.splitn(3, "__").skip(1);
            let server = parts.next().unwrap_or("");
            let action = parts.next().unwrap_or("");
            Activity::with("tool", format!("{server}: {}", action.replace('_', " ")))
        }
        t => Activity::with("tool", t),
    }
}

/// The command line of a shell call: `["bash", "-lc", "cargo test"]` →
/// `cargo test`, a plain string as is.
fn command(args: &Value) -> String {
    let cmd = if args["command"].is_null() { &args["cmd"] } else { &args["command"] };
    let text = match cmd {
        Value::String(s) => s.clone(),
        Value::Array(parts) => {
            let parts: Vec<&str> = parts.iter().filter_map(Value::as_str).collect();
            let is_shell = parts.first().is_some_and(|p| {
                let exe = file_name(p).unwrap_or_default().to_lowercase();
                ["bash", "sh", "zsh", "pwsh", "powershell", "cmd"]
                    .iter()
                    .any(|sh| exe == *sh || exe == format!("{sh}.exe"))
            });
            match (is_shell, parts.last()) {
                (true, Some(last)) if parts.len() > 1 => last.to_string(),
                _ => parts.join(" "),
            }
        }
        _ => String::new(),
    };
    text.lines().next().unwrap_or("").trim().to_string()
}

/// `*** Update File: src/App.tsx` → editing App.tsx (adding / several files…).
fn patch_activity(patch: &str) -> Activity {
    let mut files = patch.lines().filter_map(|l| {
        l.strip_prefix("*** Update File: ")
            .map(|f| ("edit", f))
            .or_else(|| l.strip_prefix("*** Add File: ").map(|f| ("write", f)))
            .or_else(|| l.strip_prefix("*** Delete File: ").map(|f| ("edit", f)))
    });
    match files.next() {
        Some((kind, f)) => Activity::with(kind, file_name(f.trim()).unwrap_or_default()),
        None => Activity::with("edit", ""),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn feed(lines: &[Value]) -> (FileState, Totals, Option<Limits>) {
        let mut st = FileState::default();
        let mut totals = Totals::new(Local::now().date_naive());
        let mut limits = None;
        for v in lines {
            process_line(v, &mut st, &mut totals, &mut limits);
        }
        (st, totals, limits)
    }

    fn line(kind: &str, payload: Value) -> Value {
        json!({ "timestamp": chrono::Utc::now().to_rfc3339(), "type": kind, "payload": payload })
    }

    #[test]
    fn turn_lifecycle() {
        let (st, totals, limits) = feed(&[
            line("session_meta", json!({ "id": "t1", "cwd": "C:\\dev\\app", "source": "cli" })),
            line("turn_context", json!({ "cwd": "C:\\dev\\app", "model": "gpt-5-codex" })),
            line("event_msg", json!({ "type": "task_started", "model_context_window": 200000 })),
            line("event_msg", json!({ "type": "user_message", "message": "fix the tests" })),
            line("response_item", json!({
                "type": "function_call", "name": "shell",
                "arguments": "{\"command\":[\"bash\",\"-lc\",\"cargo test\"]}"
            })),
        ]);
        assert_eq!(st.session.id, "t1");
        assert_eq!(st.session.project, "app");
        assert_eq!(st.session.status, Status::Working);
        assert_eq!(st.session.prompt.as_deref(), Some("fix the tests"));
        let a = st.session.activity.as_ref().unwrap();
        assert_eq!((a.kind, a.arg.as_deref()), ("run", Some("cargo test")));
        assert_eq!(totals.daily[DAYS - 1].1, 0);
        assert!(limits.is_none());

        let (st, totals, limits) = feed(&[
            line("session_meta", json!({ "id": "t1", "cwd": "/dev/app" })),
            line("event_msg", json!({ "type": "task_started" })),
            line("event_msg", json!({ "type": "token_count",
                "info": {
                    "total_token_usage": { "total_tokens": 1500 },
                    "last_token_usage": { "input_tokens": 1000, "cached_input_tokens": 600, "output_tokens": 500, "total_tokens": 1500 },
                    "model_context_window": 10000
                },
                "rate_limits": {
                    "primary": { "used_percent": 12.5, "window_minutes": 300, "resets_at": 4102444800u64 },
                    "secondary": { "used_percent": 40.0, "window_minutes": 10080, "resets_in_seconds": 60 }
                }
            })),
            // Same total: only the limits moved, nothing to count.
            line("event_msg", json!({ "type": "token_count",
                "info": { "total_token_usage": { "total_tokens": 1500 }, "last_token_usage": { "input_tokens": 1000 } }
            })),
            line("event_msg", json!({ "type": "task_complete", "last_agent_message": "All **green**." })),
        ]);
        assert_eq!(st.session.status, Status::Done);
        assert_eq!(st.session.summary.as_deref(), Some("All green."));
        assert_eq!(st.session.context_pct, Some(15.0));
        let t = &totals.today_tokens;
        assert_eq!((t.input, t.cache_read, t.output, t.messages), (400, 600, 500, 1));
        assert_eq!(totals.daily[DAYS - 1], (1500, 1));
        let limits = limits.unwrap();
        assert_eq!(limits.primary.unwrap().resets_at, Some(4102444800));
        assert!(limits.secondary.unwrap().resets_at.is_some());
    }

    #[test]
    fn subagents_and_aborts() {
        let (st, _, _) = feed(&[
            line("session_meta", json!({ "id": "t2", "cwd": "/x", "source": { "subagent": "review" } })),
            line("event_msg", json!({ "type": "task_started" })),
            line("event_msg", json!({ "type": "turn_aborted", "reason": "interrupted" })),
        ]);
        assert!(st.hidden);
        assert_eq!(st.session.status, Status::Idle);
        assert_eq!(st.session.activity.unwrap().kind, "interrupted");
    }

    #[test]
    fn patches_and_prompts() {
        let a = describe("apply_patch", &json!("*** Begin Patch\n*** Add File: src/new.rs\n+fn main() {}\n"));
        assert_eq!((a.kind, a.arg.as_deref()), ("write", Some("new.rs")));
        let mut s = Session::default();
        set_prompt(&mut s, "<environment_context>…</environment_context>");
        set_prompt(&mut s, "# AGENTS.md instructions for /x");
        assert!(s.prompt.is_none());
        assert_eq!(command(&json!({ "command": ["powershell.exe", "-Command", "ls"] })), "ls");
        assert_eq!(command(&json!({ "cmd": "git status" })), "git status");
    }
}
