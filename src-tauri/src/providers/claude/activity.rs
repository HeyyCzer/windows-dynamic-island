//! Turns a tool call into a short, language-neutral activity for the island.
//!
//! The backend only says *what* is happening (`kind` + optional `arg`); the
//! frontend owns the wording in every language (`src/locales/*`, `activity.*`).

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Activity {
    /// Translation key suffix: "thinking", "edit", "run", …
    pub kind: &'static str,
    /// File name, command, pattern… interpolated into the label.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arg: Option<String>,
    /// Waiting for the user to approve this action.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub permission: bool,
}

impl Activity {
    pub fn new(kind: &'static str) -> Self {
        Self { kind, arg: None, permission: false }
    }

    pub fn with(kind: &'static str, arg: impl AsRef<str>) -> Self {
        Self {
            kind,
            arg: Some(truncate(arg.as_ref().trim(), 50)),
            permission: false,
        }
    }

    pub fn thinking() -> Self {
        Self::new("thinking")
    }

    /// Raw text from Claude Code (e.g. a notification message), shown as is.
    pub fn message(text: &str) -> Self {
        Self::with("message", text)
    }

    pub fn needs_permission(mut self) -> Self {
        self.permission = true;
        self
    }
}

pub fn describe(tool: &str, input: &Value) -> Activity {
    let s = |key: &str| input.get(key).and_then(Value::as_str).unwrap_or("");
    let file = || {
        file_name(s("file_path"))
            .or_else(|| file_name(s("notebook_path")))
            .unwrap_or_default()
    };

    match tool {
        "Bash" | "PowerShell" => {
            let what = if s("description").is_empty() { s("command") } else { s("description") };
            Activity::with("run", first_line(what))
        }
        "Read" => Activity::with("read", file()),
        "Edit" | "MultiEdit" | "NotebookEdit" => Activity::with("edit", file()),
        "Write" => Activity::with("write", file()),
        "Grep" => Activity::with("grep", s("pattern")),
        "Glob" => Activity::with("glob", s("pattern")),
        "WebSearch" => Activity::with("webSearch", s("query")),
        "WebFetch" => Activity::with("webFetch", host(s("url"))),
        "Task" | "Agent" => Activity::with("subagent", s("description")),
        "TodoWrite" | "TaskCreate" | "TaskUpdate" => Activity::new("todos"),
        "Skill" => Activity::with("skill", s("skill")),
        "AskUserQuestion" => Activity::new("question"),
        "ExitPlanMode" => Activity::new("plan"),
        t if t.starts_with("mcp__") => {
            let mut parts = t.splitn(3, "__").skip(1);
            let server = parts.next().unwrap_or("");
            let action = parts.next().unwrap_or("");
            Activity::with("tool", format!("{server}: {}", action.replace('_', " ")))
        }
        t => Activity::with("tool", t),
    }
}

pub fn file_name(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    path.rsplit(['\\', '/']).next().map(str::to_string)
}

pub fn host(url: &str) -> &str {
    url.split("://").nth(1).unwrap_or(url).split('/').next().unwrap_or(url)
}

fn first_line(s: &str) -> &str {
    s.lines().next().unwrap_or("").trim()
}

pub fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max - 1).collect();
    out.push('…');
    out
}
