//! Reads Claude Code's JSONL transcripts (`~/.claude/projects/**.jsonl`).
//!
//! - Sums today's token usage (assistant `message.usage`, deduplicated by
//!   message id since one response is logged once per content block).
//! - Derives a best-effort session status for sessions that aren't reported by
//!   hooks (e.g. before the integration is installed).
//!
//! Files are read incrementally from the last offset, so each scan only parses
//! newly appended lines.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};

use chrono::{DateTime, Local, NaiveDate};
use serde_json::Value;

use super::activity::{self, Activity};
use super::integration::claude_dir;
use super::{now_ms, project_name, Ctx, Source, Status, TokenStats};

const SCAN_EVERY: Duration = Duration::from_secs(3);
/// A transcript with no new message for this long can't be "working" anymore.
const WORKING_WINDOW_MS: u64 = 60_000;
/// Only surface transcript-derived sessions active this recently.
const RECENT_MS: u64 = 30 * 60_000;

/// How the last turn ended, as logged in the transcript.
#[derive(Clone, Copy)]
struct TurnEnd {
    /// Activity kind: "done", "failed" or "interrupted".
    kind: &'static str,
    at: u64,
}

#[derive(Default)]
struct FileState {
    offset: u64,
    session_id: String,
    cwd: String,
    end: Option<TurnEnd>,
    /// Latest message timestamp. Not the file mtime: Claude Code keeps
    /// appending untimestamped bookkeeping lines to idle sessions.
    last_ts: u64,
    turn_started_at: Option<u64>,
    activity: Option<Activity>,
}

pub fn scan_loop(ctx: Ctx) {
    let mut files: HashMap<PathBuf, FileState> = HashMap::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut totals = TokenStats::default();
    let mut day = Local::now().date_naive();

    loop {
        let today = Local::now().date_naive();
        if today != day {
            day = today;
            files.clear();
            seen.clear();
            totals = TokenStats::default();
        }
        let midnight = midnight_ms(today);

        let mut paths = Vec::new();
        collect_jsonl(&claude_dir().join("projects"), 0, &mut paths);
        for path in paths {
            let Ok(meta) = std::fs::metadata(&path) else { continue };
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            if mtime < midnight {
                continue;
            }
            let st = files.entry(path.clone()).or_default();
            if meta.len() < st.offset {
                st.offset = 0; // rewritten
            }
            if meta.len() > st.offset {
                read_new_lines(&path, st, today, &mut seen, &mut totals);
            }
        }

        {
            let mut store = ctx.store.lock().unwrap();
            store.tokens_today = totals.clone();
            apply_sessions(&mut store, &files);
        }
        ctx.publish();
        std::thread::sleep(SCAN_EVERY);
    }
}

fn collect_jsonl(dir: &Path, depth: u8, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        match entry.file_type() {
            Ok(t) if t.is_dir() && depth < 3 => collect_jsonl(&path, depth + 1, out),
            Ok(t) if t.is_file() && path.extension().is_some_and(|e| e == "jsonl") => out.push(path),
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

fn read_new_lines(path: &Path, st: &mut FileState, today: NaiveDate, seen: &mut HashSet<String>, totals: &mut TokenStats) {
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
        process_line(&v, st, today, seen, totals);
    }
}

fn process_line(v: &Value, st: &mut FileState, today: NaiveDate, seen: &mut HashSet<String>, totals: &mut TokenStats) {
    if st.session_id.is_empty()
        && let Some(id) = v["sessionId"].as_str() {
            st.session_id = id.to_string();
        }
    if let Some(cwd) = v["cwd"].as_str() {
        st.cwd = cwd.to_string();
    }
    let ts = v["timestamp"]
        .as_str()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.with_timezone(&Local));
    let ts_ms = ts.map(|d| d.timestamp_millis().max(0) as u64);
    if let Some(ms) = ts_ms {
        st.last_ts = st.last_ts.max(ms);
    }

    match v["type"].as_str() {
        Some("assistant") => {
            let msg = &v["message"];
            let usage = &msg["usage"];
            let is_today = ts.is_some_and(|d| d.date_naive() == today);
            if usage.is_object() && is_today {
                let key = format!(
                    "{}:{}",
                    msg["id"].as_str().unwrap_or(""),
                    v["requestId"].as_str().unwrap_or("")
                );
                if seen.insert(key) {
                    let n = |k: &str| usage[k].as_u64().unwrap_or(0);
                    totals.input += n("input_tokens");
                    totals.output += n("output_tokens");
                    totals.cache_read += n("cache_read_input_tokens");
                    totals.cache_write += n("cache_creation_input_tokens");
                    totals.messages += 1;
                }
            }
            // Errors (auth, network, overload…) are logged as a synthetic
            // assistant message, and no Stop hook fires for them.
            let kind = if v["isApiErrorMessage"].as_bool().unwrap_or(false) {
                Some("failed")
            } else {
                matches!(msg["stop_reason"].as_str(), Some("end_turn" | "stop_sequence" | "refusal")).then_some("done")
            };
            st.end = kind.map(|kind| TurnEnd { kind, at: ts_ms.unwrap_or(st.last_ts) });
            if let Some(tool) = msg["content"]
                .as_array()
                .and_then(|c| c.iter().rev().find(|b| b["type"] == "tool_use"))
            {
                st.activity = Some(activity::describe(tool["name"].as_str().unwrap_or(""), &tool["input"]));
            } else if st.end.is_none() {
                st.activity = Some(Activity::thinking());
            }
        }
        Some("user") => {
            let content = &v["message"]["content"];
            let texts: Vec<&str> = match content {
                Value::String(s) => vec![s.as_str()],
                Value::Array(blocks) => blocks
                    .iter()
                    .filter(|b| b["type"] == "text")
                    .filter_map(|b| b["text"].as_str())
                    .collect(),
                _ => vec![],
            };
            // Esc mid-turn: logged as a user message, no Stop hook either.
            if texts.iter().any(|t| t.starts_with("[Request interrupted by user")) {
                st.end = Some(TurnEnd { kind: "interrupted", at: ts_ms.unwrap_or(st.last_ts) });
                return;
            }
            st.end = None;
            // A plain-text user message (not a tool result) starts a new turn.
            if !texts.is_empty() && !v["isMeta"].as_bool().unwrap_or(false) {
                st.turn_started_at = ts_ms;
                st.activity = Some(Activity::thinking());
            }
        }
        _ => {}
    }
}

fn apply_sessions(store: &mut super::Store, files: &HashMap<PathBuf, FileState>) {
    let now = now_ms();
    for (path, st) in files {
        let is_subagent = path.components().any(|c| c.as_os_str() == "subagents");
        if is_subagent || st.session_id.is_empty() || now.saturating_sub(st.last_ts) > RECENT_MS {
            continue;
        }
        if let Some(s) = store.sessions.get_mut(&st.session_id)
            && s.source == Source::Hooks
        {
            // Hooks are authoritative, except for turns that end without a
            // Stop hook (API errors, Esc): trust the transcript for those.
            if let Some(end) = st.end
                && matches!(s.status, Status::Working | Status::Waiting)
                && end.at > s.last_event_at
            {
                s.status = end_status(end);
                s.activity = Some(Activity::new(end.kind));
                s.tool = None;
                s.finished_at = Some(end.at);
                s.last_event_at = end.at;
            }
            continue;
        }
        let (status, activity) = if let Some(end) = st.end {
            (end_status(end), Some(Activity::new(end.kind)))
        } else if now.saturating_sub(st.last_ts) < WORKING_WINDOW_MS {
            (Status::Working, st.activity.clone())
        } else {
            (Status::Idle, None)
        };

        let s = store.session(&st.session_id, &st.cwd);
        if s.project.is_empty() {
            s.project = project_name(&st.cwd);
        }
        s.source = Source::Transcript;
        s.status = status;
        s.activity = activity;
        s.turn_started_at = st.turn_started_at;
        s.finished_at = st.end.map(|e| e.at);
        s.last_event_at = st.last_ts;
    }
}

fn end_status(end: TurnEnd) -> Status {
    if end.kind == "interrupted" { Status::Idle } else { Status::Done }
}
