//! Answering Claude Code's permission requests from the island.
//!
//! The `PermissionRequest` hook fires while Claude Code shows its own dialog.
//! Instead of answering right away, the hook server keeps that HTTP request
//! open until the user clicks Allow / Always / Deny in the island, then sends
//! the decision. Answering in the terminal or VS Code keeps working: once the
//! transcript has the tool's result (or the turn ends), the held request is
//! released with no decision.
//!
//! Claude Code 2.1 doesn't send `tool_use_id` with `PermissionRequest`, so a
//! held request is matched to its tool call by tool name and arguments: in
//! `PostToolUse`, and in the transcript (whose `tool_use` gives the id the
//! `tool_result` answers).

use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::Manager;
use tiny_http::{Header, Request, Response};

use super::activity::Activity;
use super::{now_ms, Ctx, Status};
use crate::settings::Settings;

/// Turned off: the island only shows that a session is waiting.
const ENABLED_KEY: &str = "agents.approveInIsland";
/// Answer before Claude Code gives up on the hook (`integration::PERMISSION_TIMEOUT_S`).
const MAX_HOLD: Duration = Duration::from_secs(590);
const CHECK_EVERY: Duration = Duration::from_secs(1);
/// Only the end of the transcript can hold the answer to a pending request.
const TRANSCRIPT_TAIL: u64 = 512 * 1024;
/// Tools whose dialog is a question or a plan to read, not a yes/no.
const NOT_APPROVABLE: &[&str] = &["AskUserQuestion", "ExitPlanMode"];
const DETAIL_CHARS: usize = 400;
const DENY_MESSAGE: &str = "The user denied this from the Dynamic Island.";

/// What the island shows for a pending request.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionView {
    pub id: String,
    pub tool: String,
    /// The command, file, URL… it's about.
    pub detail: Option<String>,
    /// The "don't ask again" rules Claude Code suggests, for the Always button.
    pub always: Option<String>,
    pub since: u64,
}

pub struct Pending {
    view: PermissionView,
    session_id: String,
    /// From the hook when sent, otherwise found in the transcript.
    tool_use_id: Option<String>,
    input: Value,
    transcript: PathBuf,
    suggestions: Value,
    request: Request,
    held_at: Instant,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Always,
    Deny,
}

impl Decision {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "allow" => Some(Self::Allow),
            "always" => Some(Self::Always),
            "deny" => Some(Self::Deny),
            _ => None,
        }
    }
}

fn enabled(ctx: &Ctx) -> bool {
    ctx.hub.app().state::<Settings>().get(ENABLED_KEY).and_then(|v| v.as_bool()).unwrap_or(true)
}

/// Keeps a `PermissionRequest` open for the island to answer. Gives the
/// request back when it shouldn't be held (feature off, a question…).
pub fn hold(ctx: &Ctx, v: &Value, request: Request) -> Option<Request> {
    let session_id = v["session_id"].as_str().unwrap_or_default();
    let tool = v["tool_name"].as_str().unwrap_or_default();
    if session_id.is_empty() || NOT_APPROVABLE.contains(&tool) || !enabled(ctx) {
        return Some(request);
    }
    let tool_use_id = v["tool_use_id"].as_str().filter(|id| !id.is_empty()).map(str::to_string);
    let id = tool_use_id.clone().unwrap_or_else(|| format!("{session_id}:{}", now_ms()));
    let suggestions = v["permission_suggestions"].clone();
    let pending = Pending {
        view: PermissionView {
            id,
            tool: tool.to_string(),
            detail: detail(tool, &v["tool_input"]),
            always: always_label(&suggestions),
            since: now_ms(),
        },
        session_id: session_id.to_string(),
        tool_use_id,
        input: v["tool_input"].clone(),
        transcript: PathBuf::from(v["transcript_path"].as_str().unwrap_or_default()),
        suggestions,
        request,
        held_at: Instant::now(),
    };
    ctx.pending.lock().unwrap().push(pending);
    sync(ctx, session_id);
    ctx.publish();
    None
}

/// The island's answer.
pub fn decide(ctx: &Ctx, id: &str, decision: Decision) -> Result<(), String> {
    let pending = {
        let mut list = ctx.pending.lock().unwrap();
        let i = list.iter().position(|p| p.view.id == id).ok_or("this request was already answered")?;
        list.remove(i)
    };
    let session_id = pending.session_id.clone();
    let body = decision_body(decision, &pending.suggestions);
    respond(pending.request, &body);
    {
        let mut store = ctx.store.lock().unwrap();
        if let Some(s) = store.sessions.get_mut(&session_id) {
            s.status = Status::Working;
            s.activity = Some(Activity::thinking());
            s.last_event_at = now_ms();
        }
    }
    sync(ctx, &session_id);
    ctx.publish();
    Ok(())
}

/// Other hook events tell when a request was answered somewhere else.
pub fn on_event(ctx: &Ctx, v: &Value) {
    let session_id = v["session_id"].as_str().unwrap_or_default();
    let tool_use_id = v["tool_use_id"].as_str();
    let event = v["hook_event_name"].as_str().unwrap_or_default();
    match event {
        // The tool ran (allowed in the terminal) or failed.
        "PostToolUse" | "PostToolUseFailure" => {
            let tool = v["tool_name"].as_str().unwrap_or_default();
            release(ctx, |p| {
                p.session_id == session_id
                    && match (&p.tool_use_id, tool_use_id) {
                        (Some(held), Some(ran)) => held == ran,
                        _ => p.view.tool == tool && same_input(&p.input, &v["tool_input"]),
                    }
            });
        }
        // The turn is over (or a new one started): nothing left to ask.
        "UserPromptSubmit" | "Stop" | "StopFailure" | "SessionEnd" => {
            release(ctx, |p| p.session_id == session_id);
        }
        _ => {}
    }
}

/// Answers matching requests with no decision (Claude Code's own dialog decides).
fn release(ctx: &Ctx, matches: impl Fn(&Pending) -> bool) {
    let released: Vec<Pending> = {
        let mut list = ctx.pending.lock().unwrap();
        let (gone, kept): (Vec<_>, Vec<_>) = list.drain(..).partition(|p| matches(p));
        *list = kept;
        gone
    };
    if released.is_empty() {
        return;
    }
    let mut sessions: Vec<String> = Vec::new();
    for p in released {
        if !sessions.contains(&p.session_id) {
            sessions.push(p.session_id.clone());
        }
        respond(p.request, &json!({}));
    }
    for s in &sessions {
        sync(ctx, s);
    }
    ctx.publish();
}

/// Mirrors the oldest pending request of a session into its public state.
fn sync(ctx: &Ctx, session_id: &str) {
    let view = ctx.pending.lock().unwrap().iter().find(|p| p.session_id == session_id).map(|p| p.view.clone());
    if let Some(s) = ctx.store.lock().unwrap().sessions.get_mut(session_id) {
        s.permission = view;
    }
}

fn respond(request: Request, body: &Value) {
    let json = Header::from_bytes("Content-Type", "application/json").unwrap();
    let _ = request.respond(Response::from_string(body.to_string()).with_header(json));
}

/// Releases requests answered in the terminal / VS Code, and ones held too long.
pub fn watch(ctx: Ctx) {
    struct Check {
        id: String,
        tool: String,
        input: Value,
        tool_use_id: Option<String>,
        transcript: PathBuf,
        expired: bool,
    }
    loop {
        std::thread::sleep(CHECK_EVERY);
        let checks: Vec<Check> = ctx
            .pending
            .lock()
            .unwrap()
            .iter()
            .map(|p| Check {
                id: p.view.id.clone(),
                tool: p.view.tool.clone(),
                input: p.input.clone(),
                tool_use_id: p.tool_use_id.clone(),
                transcript: p.transcript.clone(),
                expired: p.held_at.elapsed() >= MAX_HOLD,
            })
            .collect();
        let mut found: Vec<(String, String)> = Vec::new();
        let mut done: Vec<String> = Vec::new();
        for c in checks {
            if c.expired {
                done.push(c.id);
                continue;
            }
            let Some(tail) = transcript_tail(&c.transcript) else { continue };
            let tool_use_id = c.tool_use_id.or_else(|| {
                let id = tool_use_in(&tail, &c.tool, &c.input)?;
                found.push((c.id.clone(), id.clone()));
                Some(id)
            });
            if tool_use_id.is_some_and(|id| result_in(&tail, &id)) {
                done.push(c.id);
            }
        }
        if !found.is_empty() {
            for p in ctx.pending.lock().unwrap().iter_mut() {
                if let Some((_, id)) = found.iter().find(|(view, _)| *view == p.view.id) {
                    p.tool_use_id = Some(id.clone());
                }
            }
        }
        if !done.is_empty() {
            release(&ctx, |p| done.contains(&p.view.id));
        }
    }
}

/// The end of a transcript, where a pending request and its answer are.
fn transcript_tail(transcript: &Path) -> Option<String> {
    let mut file = std::fs::File::open(transcript).ok()?;
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    file.seek(SeekFrom::Start(len.saturating_sub(TRANSCRIPT_TAIL))).ok()?;
    let mut tail = Vec::new();
    file.read_to_end(&mut tail).ok()?;
    Some(String::from_utf8_lossy(&tail).into_owned())
}

/// The transcript already has this tool call's result: it was answered.
fn result_in(jsonl: &str, tool_use_id: &str) -> bool {
    jsonl.lines().any(|line| line.contains("tool_result") && line.contains(tool_use_id))
}

/// The id of the latest `tool_use` of `tool` with these arguments.
fn tool_use_in(jsonl: &str, tool: &str, input: &Value) -> Option<String> {
    let name = format!("\"name\":\"{tool}\"");
    jsonl.lines().rev().filter(|l| l.contains("\"tool_use\"") && l.contains(&name)).find_map(|line| {
        let entry: Value = serde_json::from_str(line).ok()?;
        entry["message"]["content"].as_array()?.iter().rev().find_map(|item| {
            if item["type"] == "tool_use" && item["name"] == tool && same_input(&item["input"], input) {
                item["id"].as_str().map(str::to_string)
            } else {
                None
            }
        })
    })
}

/// Same tool arguments, give or take defaults one side fills in.
fn same_input(a: &Value, b: &Value) -> bool {
    let within = |small: &Value, big: &Value| {
        small.as_object().is_some_and(|o| !o.is_empty() && o.iter().all(|(k, v)| big.get(k) == Some(v)))
    };
    a == b || within(a, b) || within(b, a)
}

fn decision_body(decision: Decision, suggestions: &Value) -> Value {
    let decision = match decision {
        Decision::Allow => json!({ "behavior": "allow" }),
        // The same rules the dialog's "don't ask again" would save.
        Decision::Always if suggestions.as_array().is_some_and(|s| !s.is_empty()) => {
            json!({ "behavior": "allow", "updatedPermissions": suggestions })
        }
        Decision::Always => json!({ "behavior": "allow" }),
        Decision::Deny => json!({ "behavior": "deny", "message": DENY_MESSAGE }),
    };
    json!({ "hookSpecificOutput": { "hookEventName": "PermissionRequest", "decision": decision } })
}

/// The part of the tool input a person decides on.
fn detail(tool: &str, input: &Value) -> Option<String> {
    let field = |k: &str| input.get(k).and_then(Value::as_str).filter(|s| !s.trim().is_empty());
    let text = match tool {
        "Bash" | "PowerShell" => field("command").map(str::to_string),
        "Edit" | "MultiEdit" | "Write" | "Read" | "NotebookEdit" => field("file_path").or(field("notebook_path")).map(str::to_string),
        "WebFetch" => field("url").map(str::to_string),
        "WebSearch" => field("query").map(str::to_string),
        "Glob" | "Grep" => field("pattern").map(str::to_string),
        _ => None,
    }
    .or_else(|| {
        // MCP and other tools: their arguments, compact.
        input.as_object().filter(|o| !o.is_empty()).map(|_| input.to_string())
    })?;
    let trimmed = text.trim();
    Some(if trimmed.chars().count() > DETAIL_CHARS {
        format!("{}…", trimmed.chars().take(DETAIL_CHARS).collect::<String>())
    } else {
        trimmed.to_string()
    })
}

/// "Bash(npm test)", "Read(src/**)", or a mode ("acceptEdits") from Claude
/// Code's suggestions (rule strings or `PermissionUpdate` objects).
fn always_label(suggestions: &Value) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    for s in suggestions.as_array()? {
        if let Some(rule) = s.as_str() {
            parts.push(rule.to_string());
            continue;
        }
        if let Some(rules) = s["rules"].as_array() {
            for r in rules {
                let tool = r["toolName"].as_str().unwrap_or_default();
                match r["ruleContent"].as_str() {
                    Some(content) if !content.is_empty() => parts.push(format!("{tool}({content})")),
                    _ if !tool.is_empty() => parts.push(tool.to_string()),
                    _ => {}
                }
            }
        } else if let Some(mode) = s["mode"].as_str() {
            parts.push(mode.to_string());
        } else if let Some(dirs) = s["directories"].as_array() {
            parts.extend(dirs.iter().filter_map(Value::as_str).map(str::to_string));
        }
    }
    (!parts.is_empty()).then(|| parts.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn details() {
        assert_eq!(detail("Bash", &json!({ "command": "  npm test  ", "description": "x" })), Some("npm test".into()));
        assert_eq!(detail("Edit", &json!({ "file_path": "C:/a/b.rs", "old_string": "x" })), Some("C:/a/b.rs".into()));
        assert_eq!(detail("WebFetch", &json!({ "url": "https://x.dev" })), Some("https://x.dev".into()));
        assert_eq!(detail("mcp__github__create_issue", &json!({ "title": "t" })), Some(r#"{"title":"t"}"#.into()));
        assert_eq!(detail("Bash", &json!({})), None);
        let long = "x".repeat(DETAIL_CHARS + 10);
        assert_eq!(detail("Bash", &json!({ "command": long })).unwrap().chars().count(), DETAIL_CHARS + 1);
    }

    #[test]
    fn always_labels() {
        assert_eq!(always_label(&json!(["Bash(rm *)", "Bash(rm important.*)"])), Some("Bash(rm *), Bash(rm important.*)".into()));
        let updates = json!([
            { "type": "addRules", "rules": [{ "toolName": "Bash", "ruleContent": "npm test" }], "behavior": "allow", "destination": "localSettings" },
            { "type": "setMode", "mode": "acceptEdits", "destination": "session" },
            { "type": "addDirectories", "directories": ["C:/other"], "destination": "session" },
        ]);
        assert_eq!(always_label(&updates), Some("Bash(npm test), acceptEdits, C:/other".into()));
        assert_eq!(always_label(&json!([])), None);
        assert_eq!(always_label(&Value::Null), None);
    }

    #[test]
    fn decisions() {
        let suggestions = json!(["Bash(npm test)"]);
        let d = |x| decision_body(x, &suggestions)["hookSpecificOutput"]["decision"].clone();
        assert_eq!(d(Decision::Allow), json!({ "behavior": "allow" }));
        assert_eq!(d(Decision::Always), json!({ "behavior": "allow", "updatedPermissions": ["Bash(npm test)"] }));
        assert_eq!(d(Decision::Deny)["behavior"], "deny");
        assert_eq!(decision_body(Decision::Always, &Value::Null)["hookSpecificOutput"]["decision"], json!({ "behavior": "allow" }));
        assert_eq!(decision_body(Decision::Allow, &suggestions)["hookSpecificOutput"]["hookEventName"], "PermissionRequest");
    }

    #[test]
    fn matches_tool_calls() {
        let held = json!({ "command": "touch x.txt", "description": "Create", "timeout": 120000 });
        let jsonl = concat!(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_old","name":"Bash","input":{"command":"touch x.txt","description":"Create"}}]}}"#,
            "\n",
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hi"},{"type":"tool_use","id":"toolu_new","name":"Bash","input":{"command":"touch x.txt","description":"Create"}}]}}"#,
            "\n",
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_other","name":"Bash","input":{"command":"ls"}}]}}"#,
            "\n",
        );
        // The latest matching call; defaults on the hook's side are ignored.
        assert_eq!(tool_use_in(jsonl, "Bash", &held), Some("toolu_new".into()));
        assert_eq!(tool_use_in(jsonl, "Write", &held), None);
        assert_eq!(tool_use_in(jsonl, "Bash", &json!({ "command": "rm x" })), None);
        assert!(same_input(&json!({ "a": 1 }), &json!({ "a": 1, "b": 2 })));
        assert!(!same_input(&json!({ "a": 1 }), &json!({ "a": 2, "b": 2 })));
        assert!(!same_input(&json!({}), &json!({ "a": 1 })));
    }

    #[test]
    fn finds_tool_results() {
        let jsonl = concat!(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Bash"}]}}"#,
            "\n",
            r#"{"type":"user","message":{"content":[{"tool_use_id":"toolu_1","type":"tool_result","content":"ok"}]}}"#,
            "\n",
        );
        assert!(result_in(jsonl, "toolu_1"));
        assert!(!result_in(jsonl, "toolu_2"));
        // The request itself (tool_use) isn't an answer.
        assert!(!result_in(jsonl.lines().next().unwrap(), "toolu_1"));
    }
}
