//! What a plugin may do beyond its own sandbox. Declared in `plugin.json`,
//! shown before installing and granted all at once; every privileged call is
//! checked here against what was granted. See `docs/plugins/permissions.md`.

use std::path::{Component, Path, PathBuf};

use serde::Serialize;

/// Built-in providers whose state a plugin may read (`provider:<id>`). Others
/// (clipboard, notifications, Claude…) carry private data and stay off limits.
pub const READABLE_PROVIDERS: &[&str] = &["music", "monitor"];

/// Folders a `fs:read:` pattern can start from.
pub const PATH_VARS: &[&str] = &["$HOME", "$APPDATA", "$LOCALAPPDATA", "$DOCUMENTS"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "kebab-case")]
pub enum Permission {
    /// HTTPS requests to a host; `*.example.com` also covers subdomains.
    Network(String),
    ClipboardRead,
    ClipboardWrite,
    /// Open https links in the default browser.
    OpenUrl,
    /// Read text files matching a pattern such as `$HOME/.config/foo/**`.
    FsRead(String),
    /// Read a built-in provider's state.
    Provider(String),
}

impl Permission {
    pub fn parse(text: &str) -> Result<Self, String> {
        let bad = || format!("unknown permission '{text}'");
        let permission = match text {
            "clipboard:read" => Self::ClipboardRead,
            "clipboard:write" => Self::ClipboardWrite,
            "open-url" => Self::OpenUrl,
            _ => {
                let (kind, value) = text.split_once(':').ok_or_else(bad)?;
                match kind {
                    "network" if valid_host_pattern(value) => Self::Network(value.to_string()),
                    "fs" => {
                        let pattern = value.strip_prefix("read:").ok_or_else(bad)?;
                        if !valid_path_pattern(pattern) {
                            return Err(format!(
                                "{text}: patterns start with {}",
                                PATH_VARS.join(", ")
                            ));
                        }
                        Self::FsRead(pattern.to_string())
                    }
                    "provider" if READABLE_PROVIDERS.contains(&value) => {
                        Self::Provider(value.to_string())
                    }
                    _ => return Err(bad()),
                }
            }
        };
        Ok(permission)
    }
}

/// `example.com`, `api.example.com`, `*.example.com`, optionally `:port`.
fn valid_host_pattern(pattern: &str) -> bool {
    let (host, port) = match pattern.rsplit_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (pattern, None),
    };
    if port.is_some_and(|p| p.parse::<u16>().is_err()) {
        return false;
    }
    let host = host.strip_prefix("*.").unwrap_or(host);
    host.contains('.')
        && host.len() <= 253
        && host.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && label
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
}

fn valid_path_pattern(pattern: &str) -> bool {
    let Some(var) = PATH_VARS.iter().find(|v| pattern.starts_with(**v)) else {
        return false;
    };
    let rest = &pattern[var.len()..];
    (rest.is_empty() || rest.starts_with('/'))
        && !rest.contains('\\')
        && rest.split('/').all(|p| p != ".." && p != ".")
        // Wildcards only as the last part.
        && rest
            .split('/')
            .rev()
            .skip(1)
            .all(|p| !p.contains('*'))
        && rest
            .rsplit('/')
            .next()
            .is_none_or(|last| !last.contains('*') || last == "*" || last == "**")
}

/// Whether `granted` lets a plugin reach `host` (lowercase, no port) on `port`.
pub fn allows_host(granted: &[Permission], host: &str, port: Option<u16>) -> bool {
    let host = host.to_ascii_lowercase();
    granted.iter().any(|p| {
        let Permission::Network(pattern) = p else {
            return false;
        };
        let (pattern_host, pattern_port) = match pattern.rsplit_once(':') {
            Some((h, port)) => (h, port.parse::<u16>().ok()),
            None => (pattern.as_str(), None),
        };
        if pattern_port.is_some() && pattern_port != port.or(Some(443)) {
            return false;
        }
        match pattern_host.strip_prefix("*.") {
            Some(base) => host == base || host.ends_with(&format!(".{base}")),
            None => host == pattern_host,
        }
    })
}

/// What a `fs:read` pattern matches once its variable is resolved.
#[derive(Debug, PartialEq, Eq)]
pub enum PathScope {
    /// Exactly this file.
    File(PathBuf),
    /// Files directly inside this folder (`/*`).
    Children(PathBuf),
    /// Anything below this folder (`/**`).
    Tree(PathBuf),
}

impl PathScope {
    pub fn resolve(pattern: &str, var: impl Fn(&str) -> Option<PathBuf>) -> Option<Self> {
        let name = PATH_VARS.iter().find(|v| pattern.starts_with(**v))?;
        let mut path = var(name)?;
        let rest = pattern[name.len()..].trim_start_matches('/');
        let mut parts: Vec<&str> = rest.split('/').filter(|p| !p.is_empty()).collect();
        let last = parts.last().copied();
        if matches!(last, Some("*" | "**")) {
            parts.pop();
        }
        for part in parts {
            path.push(part);
        }
        Some(match last {
            Some("**") => Self::Tree(path),
            Some("*") => Self::Children(path),
            Some(_) => Self::File(path),
            None => Self::Tree(path),
        })
    }

    /// `path` must already be canonical (no `..`, symlinks resolved).
    pub fn contains(&self, path: &Path) -> bool {
        match self {
            Self::File(file) => path == file,
            Self::Children(dir) => path.parent() == Some(dir.as_path()),
            Self::Tree(dir) => path.starts_with(dir) && path != dir,
        }
    }
}

/// Whether `granted` lets a plugin read `path` (canonical).
pub fn allows_path(
    granted: &[Permission],
    path: &Path,
    var: impl Fn(&str) -> Option<PathBuf>,
) -> bool {
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return false;
    }
    granted.iter().any(|p| match p {
        Permission::FsRead(pattern) => PathScope::resolve(pattern, |name| {
            // Compare canonical forms on both sides (`\\?\C:\…` on Windows).
            var(name).map(|dir| dir.canonicalize().unwrap_or(dir))
        })
        .is_some_and(|scope| scope.contains(path)),
        _ => false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_every_kind() {
        assert_eq!(
            Permission::parse("network:api.github.com"),
            Ok(Permission::Network("api.github.com".into()))
        );
        assert!(Permission::parse("network:*.example.com:8443").is_ok());
        assert_eq!(
            Permission::parse("clipboard:read"),
            Ok(Permission::ClipboardRead)
        );
        assert_eq!(Permission::parse("open-url"), Ok(Permission::OpenUrl));
        assert!(Permission::parse("fs:read:$HOME/.config/foo/**").is_ok());
        assert_eq!(
            Permission::parse("provider:music"),
            Ok(Permission::Provider("music".into()))
        );
    }

    #[test]
    fn rejects_what_it_does_not_know() {
        for p in [
            "network:*",
            "network:localhost",
            "network:Example.com",
            "network:example.com:99999",
            "network:exa mple.com",
            "fs:read:/etc/passwd",
            "fs:read:C:/Windows",
            "fs:read:$HOME/../x",
            "fs:read:$HOME/*/x",
            "fs:read:$HOME/a*b",
            "fs:write:$HOME/x",
            "provider:clipboard",
            "provider:claude",
            "shell",
        ] {
            assert!(Permission::parse(p).is_err(), "{p}");
        }
    }

    #[test]
    fn matches_hosts() {
        let granted = [
            Permission::parse("network:api.github.com").unwrap(),
            Permission::parse("network:*.example.com").unwrap(),
            Permission::parse("network:weather.dev:8443").unwrap(),
        ];
        assert!(allows_host(&granted, "api.github.com", None));
        assert!(allows_host(&granted, "API.GitHub.com", Some(443)));
        assert!(!allows_host(&granted, "github.com", None));
        assert!(!allows_host(&granted, "api.github.com.evil.io", None));
        assert!(allows_host(&granted, "example.com", None));
        assert!(allows_host(&granted, "a.b.example.com", None));
        assert!(!allows_host(&granted, "badexample.com", None));
        assert!(allows_host(&granted, "weather.dev", Some(8443)));
        assert!(!allows_host(&granted, "weather.dev", None));
        assert!(!allows_host(&[], "api.github.com", None));
    }

    fn home(name: &str) -> Option<PathBuf> {
        (name == "$HOME").then(|| PathBuf::from("/home/u"))
    }

    #[test]
    fn resolves_path_patterns() {
        assert_eq!(
            PathScope::resolve("$HOME/.config/foo/**", home),
            Some(PathScope::Tree("/home/u/.config/foo".into()))
        );
        assert_eq!(
            PathScope::resolve("$HOME/notes/*", home),
            Some(PathScope::Children("/home/u/notes".into()))
        );
        assert_eq!(
            PathScope::resolve("$HOME/todo.txt", home),
            Some(PathScope::File("/home/u/todo.txt".into()))
        );
        assert_eq!(PathScope::resolve("$APPDATA/x", home), None);
    }

    #[test]
    fn matches_paths() {
        let granted = [
            Permission::parse("fs:read:$HOME/.config/foo/**").unwrap(),
            Permission::parse("fs:read:$HOME/notes/*").unwrap(),
            Permission::parse("fs:read:$HOME/todo.txt").unwrap(),
        ];
        let ok = |p: &str| allows_path(&granted, Path::new(p), home);
        assert!(ok("/home/u/.config/foo/a.json"));
        assert!(ok("/home/u/.config/foo/deep/a.json"));
        assert!(!ok("/home/u/.config/foo"));
        assert!(!ok("/home/u/.config/foobar/a.json"));
        assert!(ok("/home/u/notes/a.md"));
        assert!(!ok("/home/u/notes/sub/a.md"));
        assert!(ok("/home/u/todo.txt"));
        assert!(!ok("/home/u/todo.txt.bak"));
        assert!(!ok("/home/u/.config/foo/../../.ssh/id_rsa"));
        assert!(!ok("/home/u/.ssh/id_rsa"));
    }
}
