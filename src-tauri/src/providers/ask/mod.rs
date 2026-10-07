//! "Ask Claude" from the island: runs the Claude Code CLI headless
//! (`claude -p`, stream-json in and out) with the user's own login, streams
//! the answer in, and keeps one conversation going with `--resume`.
//!
//! Questions can carry attachments: a screenshot of the window you were using
//! (`capture.rs`) or files dropped on the island. Images go as images; other
//! files by path, for Claude's Read tool.

mod capture;

use std::io::{BufRead, BufReader, Read, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::Manager;

use super::activities::{self, Activity};
use super::Provider;
use crate::hub::Hub;
use crate::i18n;

pub const ID: &str = "ask";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Streaming produces dozens of deltas per second: publish at most ~16 times a second.
const PUBLISH_EVERY: Duration = Duration::from_millis(60);
/// Larger images go by path instead (the API takes up to 5 MB per image).
const MAX_IMAGE_BYTES: u64 = 3_500_000;
/// Thumbnails for the attachment chips.
const MAX_THUMB_BYTES: u64 = 6_000_000;
const CLAUDE_ORANGE: &str = "#D97757";

const SYSTEM_PROMPT: &str = "You are answering through Dynamic Island, a small pill at the top of the user's Windows \
screen. Answer in {language}, short and direct: a few sentences or a short list. Avoid tables, headings and long \
code blocks unless the user asks. Use at most **bold** and `code` as formatting. In this window you can't ask for \
permission: if a task needs editing files or running commands, explain what you would do and suggest opening \
Claude Code to run it. When an image is attached, it is the user's screen or a file they want you to see.";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub path: String,
    pub name: String,
    pub is_image: bool,
    /// "Screen: Chrome"… (the file name when `None`).
    pub label: Option<String>,
    #[serde(default)]
    pub thumb: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Message {
    from_user: bool,
    text: String,
    error: bool,
    attachments: Vec<Attachment>,
}

/// What Claude is doing right now (worded by the frontend).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    kind: &'static str,
    arg: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct State {
    /// The Claude Code CLI was found.
    available: bool,
    messages: Vec<Message>,
    running: bool,
    status: Option<Status>,
    /// A finished answer the user hasn't looked at yet.
    unread: bool,
    /// Global shortcut that opens the ask page ("Ctrl+Alt+Space").
    hotkey: Option<String>,
}

struct Ctx {
    hub: Arc<Hub>,
    state: Mutex<State>,
    session_id: Mutex<Option<String>>,
    child: Mutex<Option<Child>>,
    /// The ask page is on screen: no "Claude answered" alert needed.
    viewing: Mutex<bool>,
}

impl Ctx {
    fn publish(&self) {
        let state = self.state.lock().unwrap().clone();
        self.hub.publish(ID, &state);
    }

    fn update(&self, f: impl FnOnce(&mut State)) {
        f(&mut self.state.lock().unwrap());
        self.publish();
    }
}

#[derive(Default)]
pub struct AskProvider {
    ctx: Mutex<Option<Arc<Ctx>>>,
}

static HOTKEY: Mutex<Option<String>> = Mutex::new(None);

/// Called once the global shortcut is registered.
pub fn set_hotkey(label: Option<String>) {
    *HOTKEY.lock().unwrap() = label;
}

#[derive(Deserialize)]
struct SendRequest {
    text: String,
    #[serde(default)]
    attachments: Vec<Attachment>,
}

impl Provider for AskProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let ctx = Arc::new(Ctx {
            hub,
            state: Mutex::new(State { available: find_claude().is_some(), ..Default::default() }),
            session_id: Mutex::default(),
            child: Mutex::default(),
            viewing: Mutex::default(),
        });
        *self.ctx.lock().unwrap() = Some(ctx.clone());
        ctx.publish();
        // The hotkey is registered during setup; pick its label up afterwards.
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(2));
            let hotkey = HOTKEY.lock().unwrap().clone();
            ctx.update(|s| s.hotkey = hotkey);
        });
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        let ctx = self.ctx.lock().unwrap().clone().ok_or("ask not started")?;
        match action {
            "send" => {
                let request: SendRequest = serde_json::from_value(payload).map_err(|e| e.to_string())?;
                send(&ctx, request.text, request.attachments);
            }
            "cancel" => cancel(&ctx),
            "new" => {
                cancel(&ctx);
                *ctx.session_id.lock().unwrap() = None;
                ctx.update(|s| {
                    s.messages.clear();
                    s.unread = false;
                    s.status = None;
                });
            }
            "viewing" => {
                let viewing = payload.as_bool().unwrap_or(false);
                *ctx.viewing.lock().unwrap() = viewing;
                if viewing {
                    ctx.update(|s| s.unread = false);
                    if let Some(a) = activities::handle() {
                        a.remove("ask.answer");
                    }
                }
            }
            // Screenshot of the window used before coming to the island.
            "screenshot" => {
                let folder = ctx.hub.app().path().app_data_dir().map_err(|e| e.to_string())?.join("attachments");
                let shot = capture::capture(crate::window::last_foreground(), &folder).ok_or("capture failed")?;
                let app = ctx.hub.app();
                let label = match shot.title {
                    Some(title) => i18n::t(app, "ask.screenOf").replace("{title}", &title),
                    None => i18n::t(app, "ask.wholeScreen"),
                };
                let mut attachment = attachment_for(&shot.path);
                attachment.label = Some(label);
                return serde_json::to_value(attachment).map_err(|e| e.to_string());
            }
            // Files dropped on the island → attachments (with thumbnails).
            "attachments" => {
                let paths: Vec<String> = serde_json::from_value(payload).map_err(|e| e.to_string())?;
                let list: Vec<Attachment> = paths.iter().map(|p| attachment_for(Path::new(p))).collect();
                return serde_json::to_value(list).map_err(|e| e.to_string());
            }
            _ => return Err(format!("{ID}: unknown action '{action}'")),
        }
        Ok(Value::Null)
    }
}

pub fn attachment_for(path: &Path) -> Attachment {
    let media = image_media_type(path);
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(u64::MAX);
    Attachment {
        path: path.to_string_lossy().to_string(),
        name: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        is_image: media.is_some() && size <= MAX_IMAGE_BYTES,
        label: None,
        thumb: media.filter(|_| size <= MAX_THUMB_BYTES).and_then(|m| data_url(path, m)),
    }
}

pub fn image_media_type(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => return None,
    })
}

pub fn data_url(path: &Path, media: &str) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(format!("data:{media};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

fn send(ctx: &Arc<Ctx>, text: String, attachments: Vec<Attachment>) {
    let app = ctx.hub.app().clone();
    let mut prompt = text.trim().to_string();
    if prompt.is_empty() && attachments.is_empty() {
        return;
    }
    if ctx.state.lock().unwrap().running {
        return;
    }
    if prompt.is_empty() {
        let key = if attachments.iter().any(|a| a.is_image) { "ask.defaultImage" } else { "ask.defaultFile" };
        prompt = i18n::t(&app, key);
    }

    ctx.update(|s| {
        s.messages.push(Message { from_user: true, text: prompt.clone(), error: false, attachments: attachments.clone() });
        s.messages.push(Message { from_user: false, text: String::new(), error: false, attachments: vec![] });
        s.unread = false;
    });

    let Some(claude) = find_claude() else {
        fail(ctx, i18n::t(&app, "ask.notFound"));
        return;
    };
    let input = match build_input(&prompt, &attachments) {
        Ok(input) => input,
        Err(e) => {
            fail(ctx, i18n::t(&app, "ask.attachmentFailed").replace("{error}", &e));
            return;
        }
    };

    let home = std::env::var_os("USERPROFILE").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    let language = i18n::t(&app, "language.name");
    let mut command = Command::new(&claude);
    command
        .current_dir(home)
        .args(["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"])
        .arg("--include-partial-messages")
        // The island's own questions shouldn't show up as sessions in the island.
        .args(["--settings", r#"{"disableAllHooks":true}"#])
        .args(["--append-system-prompt", &SYSTEM_PROMPT.replace("{language}", &language)])
        // Read-only tools work without asking; the web needs an explicit allowance headless.
        .args(["--allowedTools", "WebSearch", "WebFetch"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW);
    if let Some(id) = ctx.session_id.lock().unwrap().clone() {
        command.args(["--resume", &id]);
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(e) => {
            fail(ctx, i18n::t(&app, "ask.startFailed").replace("{error}", &e.to_string()));
            return;
        }
    };
    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *ctx.child.lock().unwrap() = Some(child);
    ctx.update(|s| {
        s.running = true;
        s.status = Some(Status { kind: "thinking", arg: None });
    });

    let ctx = ctx.clone();
    std::thread::spawn(move || {
        if let Some(mut stdin) = stdin {
            let _ = stdin.write_all(input.as_bytes());
        }
        let errors = Arc::new(Mutex::new(String::new()));
        if let Some(mut stderr) = stderr {
            let errors = errors.clone();
            std::thread::spawn(move || {
                let mut text = String::new();
                let _ = stderr.read_to_string(&mut text);
                *errors.lock().unwrap() = text;
            });
        }
        let outcome = stdout.map(|out| stream(&ctx, out)).unwrap_or_default();
        let status = ctx.child.lock().unwrap().take().and_then(|mut c| c.wait().ok());
        // Give stderr a moment to be collected.
        std::thread::sleep(Duration::from_millis(50));
        finish(&ctx, outcome, status.is_some_and(|s| s.success()), &errors.lock().unwrap());
    });
}

#[derive(Default)]
struct Outcome {
    result: Option<String>,
    is_error: bool,
    denied: Vec<String>,
}

/// Reads the stream-json events into the last (assistant) message.
fn stream(ctx: &Ctx, stdout: impl Read) -> Outcome {
    let mut outcome = Outcome::default();
    let mut text_in_block = false;
    let mut last_publish = Instant::now();
    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        if !line.starts_with('{') {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        if let Some(id) = v["session_id"].as_str().filter(|s| !s.is_empty()) {
            *ctx.session_id.lock().unwrap() = Some(id.to_string());
        }
        let mut state = ctx.state.lock().unwrap();
        match v["type"].as_str() {
            Some("stream_event") => {
                let ev = &v["event"];
                match ev["type"].as_str() {
                    Some("content_block_start") => match ev["content_block"]["type"].as_str() {
                        Some("tool_use") => {
                            let tool = ev["content_block"]["name"].as_str().unwrap_or("").to_string();
                            state.status = Some(Status { kind: "tool", arg: Some(tool) });
                            text_in_block = false;
                        }
                        Some("text") => {
                            // Text after a tool call starts a new paragraph.
                            if let Some(reply) = state.messages.last_mut()
                                && !reply.text.is_empty()
                                && !text_in_block
                            {
                                reply.text.push_str("\n\n");
                            }
                            text_in_block = true;
                            state.status = Some(Status { kind: "writing", arg: None });
                        }
                        _ => {}
                    },
                    Some("content_block_delta") if ev["delta"]["type"] == "text_delta" => {
                        if let Some(reply) = state.messages.last_mut() {
                            reply.text.push_str(ev["delta"]["text"].as_str().unwrap_or(""));
                        }
                    }
                    _ => {}
                }
            }
            Some("result") => {
                outcome.is_error = v["is_error"].as_bool().unwrap_or(false);
                outcome.result = v["result"].as_str().map(str::to_string);
                for d in v["permission_denials"].as_array().into_iter().flatten() {
                    if let Some(name) = d["tool_name"].as_str()
                        && !outcome.denied.iter().any(|n| n == name)
                    {
                        outcome.denied.push(name.to_string());
                    }
                }
            }
            _ => {}
        }
        drop(state);
        if last_publish.elapsed() >= PUBLISH_EVERY {
            last_publish = Instant::now();
            ctx.publish();
        }
    }
    outcome
}

fn finish(ctx: &Ctx, outcome: Outcome, success: bool, errors: &str) {
    let app = ctx.hub.app().clone();
    let mut answer: Option<String> = None;
    ctx.update(|s| {
        s.running = false;
        s.status = None;
        let Some(reply) = s.messages.last_mut() else { return };
        let cancelled = !success && outcome.result.is_none() && errors.trim().is_empty();
        if reply.text.is_empty()
            && let Some(result) = outcome.result.as_deref().filter(|r| !r.trim().is_empty())
        {
            reply.text = result.trim().to_string();
        }
        if outcome.is_error || (reply.text.is_empty() && !cancelled) {
            let detail = outcome
                .result
                .as_deref()
                .map(str::trim)
                .filter(|r| !r.is_empty())
                .or(Some(errors.trim()).filter(|e| !e.is_empty()))
                .map(str::to_string)
                .unwrap_or_else(|| i18n::t(&app, "ask.noAnswer"));
            log::warn!("ask: {detail}");
            reply.error = true;
            reply.text = if reply.text.is_empty() { detail } else { format!("{}\n\n{detail}", reply.text) };
        } else if cancelled && reply.text.is_empty() {
            reply.text = i18n::t(&app, "ask.interrupted");
            reply.error = true;
        }
        if !outcome.denied.is_empty() {
            let note = i18n::t(&app, "ask.denied").replace("{tools}", &outcome.denied.join(", "));
            reply.text.push_str(&format!("\n\n{note}"));
        }
        s.unread = true;
        if !reply.error {
            answer = Some(reply.text.clone());
        }
    });

    // Answered while you were elsewhere: say so (click to read).
    if let Some(text) = answer
        && !*ctx.viewing.lock().unwrap()
        && let Some(activities) = activities::handle()
    {
        let flat = text.replace("**", "").replace('`', "").split_whitespace().collect::<Vec<_>>().join(" ");
        let mut preview: String = flat.chars().take(140).collect();
        if flat.chars().count() > 140 {
            preview.push('…');
        }
        let mut alert = Activity::alert("ask.answer", "ask", Duration::from_secs(8));
        alert.caption = Some("Claude".into());
        alert.title = i18n::t(&app, "ask.answered");
        alert.subtitle = Some(preview);
        alert.icon = Some("claude".into());
        alert.color = Some(CLAUDE_ORANGE.into());
        alert.priority = 70;
        alert.expand = true;
        activities.upsert(alert);
    }
}

fn fail(ctx: &Ctx, message: String) {
    ctx.update(|s| {
        if let Some(reply) = s.messages.last_mut() {
            reply.text = message;
            reply.error = true;
        }
    });
}

fn cancel(ctx: &Ctx) {
    if let Some(child) = ctx.child.lock().unwrap().as_mut() {
        let _ = child.kill();
    }
}

/// One stream-json user message: the images, then the text (other files by path).
fn build_input(prompt: &str, attachments: &[Attachment]) -> Result<String, String> {
    let mut content = Vec::new();
    for a in attachments.iter().filter(|a| a.is_image) {
        let path = Path::new(&a.path);
        let media = image_media_type(path).ok_or_else(|| format!("{}: not an image", a.name))?;
        let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", a.name))?;
        let data = base64::engine::general_purpose::STANDARD.encode(bytes);
        content.push(json!({ "type": "image", "source": { "type": "base64", "media_type": media, "data": data } }));
    }
    let mut text = prompt.to_string();
    let files: Vec<&Attachment> = attachments.iter().filter(|a| !a.is_image).collect();
    if !files.is_empty() {
        text.push_str("\n\nAttached files (read them with the Read tool if needed):");
        for f in files {
            text.push_str(&format!("\n- {}", f.path));
        }
    }
    content.push(json!({ "type": "text", "text": text }));
    Ok(json!({ "type": "user", "message": { "role": "user", "content": content } }).to_string() + "\n")
}

/// The Claude Code CLI: on PATH, the standalone install (`~/.local/bin`), or
/// the binary bundled with the newest VS Code extension.
pub fn find_claude() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join("claude.exe");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    let home = PathBuf::from(std::env::var_os("USERPROFILE")?);
    let local = home.join(".local").join("bin").join("claude.exe");
    if local.is_file() {
        return Some(local);
    }
    std::fs::read_dir(home.join(".vscode").join("extensions"))
        .ok()?
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("anthropic.claude-code-"))
        .map(|e| e.path().join("resources").join("native-binary").join("claude.exe"))
        .filter(|p| p.is_file())
        .max_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok())
}
