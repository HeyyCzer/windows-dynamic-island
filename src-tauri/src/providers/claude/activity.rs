//! Turns a tool call into a short, human label for the island.

use serde_json::Value;

pub const THINKING: &str = "Pensando…";

pub fn describe(tool: &str, input: &Value) -> String {
    let s = |key: &str| input.get(key).and_then(Value::as_str).unwrap_or("");
    let file = || file_name(s("file_path")).or_else(|| file_name(s("notebook_path")));

    let label = match tool {
        "Bash" | "PowerShell" => {
            let what = if s("description").is_empty() { s("command") } else { s("description") };
            format!("Executando {}", first_line(what))
        }
        "Read" => format!("Lendo {}", file().unwrap_or_default()),
        "Edit" | "MultiEdit" | "NotebookEdit" => format!("Editando {}", file().unwrap_or_default()),
        "Write" => format!("Escrevendo {}", file().unwrap_or_default()),
        "Grep" => format!("Buscando \"{}\"", s("pattern")),
        "Glob" => format!("Procurando {}", s("pattern")),
        "WebSearch" => format!("Pesquisando \"{}\"", s("query")),
        "WebFetch" => format!("Lendo {}", host(s("url"))),
        "Task" | "Agent" => format!("Subagente: {}", s("description")),
        "TodoWrite" | "TaskCreate" | "TaskUpdate" => "Atualizando tarefas".into(),
        "Skill" => format!("Skill {}", s("skill")),
        "AskUserQuestion" => "Aguardando sua resposta".into(),
        "ExitPlanMode" => "Plano pronto".into(),
        t if t.starts_with("mcp__") => {
            let mut parts = t.splitn(3, "__").skip(1);
            let server = parts.next().unwrap_or("");
            let action = parts.next().unwrap_or("");
            format!("{server}: {}", action.replace('_', " "))
        }
        t => t.to_string(),
    };
    truncate(label.trim(), 60)
}

fn file_name(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    path.rsplit(['\\', '/']).next().map(str::to_string)
}

fn host(url: &str) -> &str {
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
