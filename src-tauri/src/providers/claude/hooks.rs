//! Local HTTP endpoint for Claude Code hooks and the statusline bridge.
//!
//! Claude Code's `type: "http"` hooks POST the same JSON a command hook gets on
//! stdin. We answer `{}` (no decision) so the normal permission flow applies.

use std::io::Read;

use serde_json::Value;
use tiny_http::{Header, Method, Response, Server};

use super::activity::{self, Activity};
use super::{now_ms, statusline, transcripts, usage, Ctx, Source, Status, HOOK_PORT};

pub const HOOK_PATH: &str = "/claude/hook";
pub const STATUSLINE_PATH: &str = "/claude/statusline";

pub fn hook_url() -> String {
    format!("http://127.0.0.1:{HOOK_PORT}{HOOK_PATH}")
}

pub fn serve(ctx: Ctx) {
    let server = match Server::http(("127.0.0.1", HOOK_PORT)) {
        Ok(s) => s,
        Err(e) => {
            log::error!("claude hook server: {e}");
            return;
        }
    };
    ctx.store.lock().unwrap().integration.server_ok = true;
    ctx.publish();

    let json = Header::from_bytes("Content-Type", "application/json").unwrap();
    for mut req in server.incoming_requests() {
        let mut body = String::new();
        let _ = req.as_reader().take(4 * 1024 * 1024).read_to_string(&mut body);
        let payload: Value = serde_json::from_str(&body).unwrap_or(Value::Null);

        if *req.method() == Method::Post {
            match req.url() {
                HOOK_PATH => handle_hook(&ctx, &payload),
                STATUSLINE_PATH => statusline::handle(&ctx, &payload),
                _ => {}
            }
        }
        let _ = req.respond(Response::from_string("{}").with_header(json.clone()));
    }
}

pub fn handle_hook(ctx: &Ctx, v: &Value) {
    let str_of = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("");
    let session_id = str_of("session_id");
    if session_id.is_empty() {
        return;
    }
    let event = str_of("hook_event_name");
    let tool = str_of("tool_name");
    let now = now_ms();
    // How the reply starts, for the "done" alert. Newer Claude Code versions
    // send it with the hook; otherwise it's the last text in the transcript.
    let mut summary = (event == "Stop")
        .then(|| {
            v["last_assistant_message"]
                .as_str()
                .map(str::to_string)
                .or_else(|| transcripts::last_reply(std::path::Path::new(str_of("transcript_path"))))
        })
        .flatten()
        .map(|text| preview(&text));

    {
        let mut store = ctx.store.lock().unwrap();
        if event == "SessionEnd" {
            store.sessions.remove(session_id);
        } else {
            let s = store.session(session_id, str_of("cwd"));
            s.last_event_at = now;
            s.source = Source::Hooks;

            match event {
                "SessionStart" => {
                    s.status = Status::Idle;
                }
                "UserPromptSubmit" => {
                    s.status = Status::Working;
                    s.turn_started_at = Some(now);
                    s.finished_at = None;
                    s.tool = None;
                    s.summary = None;
                    s.activity = Some(Activity::thinking());
                }
                "PreToolUse" => {
                    start_turn_if_needed(s, now);
                    s.status = Status::Working;
                    s.tool = Some(tool.to_string());
                    s.activity = Some(activity::describe(tool, &v["tool_input"]));
                }
                "PostToolUse" | "PostToolUseFailure" => {
                    start_turn_if_needed(s, now);
                    s.status = Status::Working;
                    s.activity = Some(Activity::thinking());
                }
                "PermissionRequest" => {
                    s.status = Status::Waiting;
                    s.tool = Some(tool.to_string());
                    s.activity = Some(activity::describe(tool, &v["tool_input"]).needs_permission());
                }
                "Notification" => {
                    let message = str_of("message");
                    let kind = str_of("notification_type");
                    let asks_permission =
                        kind == "permission_prompt" || message.to_lowercase().contains("permission");
                    if asks_permission && s.status != Status::Waiting {
                        s.status = Status::Waiting;
                        s.activity = Some(Activity::message(message));
                    }
                }
                "Stop" | "StopFailure" => {
                    s.status = Status::Done;
                    s.finished_at = Some(now);
                    s.tool = None;
                    s.summary = summary.take();
                    s.activity = Some(Activity::new(if event == "Stop" { "done" } else { "failed" }));
                }
                _ => {}
            }
        }
    }
    ctx.publish();

    // A session starting or a turn ending is when the plan usage moves.
    if matches!(event, "SessionStart" | "Stop") {
        usage::request(ctx, usage::HOOK_MIN_AGE_MS);
    }
}

/// One line, no Markdown markers, at most ~160 characters.
fn preview(text: &str) -> String {
    let flat = text
        .replace("**", "")
        .replace('`', "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let mut out: String = flat.chars().take(160).collect();
    if flat.chars().count() > 160 {
        out.push('…');
    }
    out
}

fn start_turn_if_needed(s: &mut super::Session, now: u64) {
    if !matches!(s.status, Status::Working | Status::Waiting) || s.turn_started_at.is_none() {
        s.turn_started_at = Some(now);
        s.finished_at = None;
    }
}
