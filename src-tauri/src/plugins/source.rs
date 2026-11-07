//! Where plugins come from: a GitHub repository (or any HTTPS URL) serving an
//! `island-plugins.json` index that lists one or more plugins, each with the
//! URL and SHA-256 of its package. See `docs/plugins/publishing.md`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use url::Url;

use super::manifest::{Version, parse_sdk};

/// File name of the index at the root of a source repository.
pub const INDEX_FILE: &str = "island-plugins.json";

/// Index format this build reads.
pub const INDEX_SCHEMA: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    /// Stable key: `github:owner/repo` (`@ref` when pinned) or the index URL.
    pub id: String,
    /// What the settings show.
    pub label: String,
    pub index_url: String,
}

impl Source {
    /// Accepts `owner/repo`, `owner/repo@ref`, `https://github.com/owner/repo`
    /// (`/tree/<ref>` too) or the HTTPS URL of an index file.
    pub fn parse(input: &str) -> Result<Self, String> {
        let input = input.trim();
        if input.starts_with("https://") {
            let url = Url::parse(input).map_err(|e| format!("{input}: {e}"))?;
            if url.host_str() == Some("github.com") {
                let parts: Vec<&str> = url
                    .path_segments()
                    .into_iter()
                    .flatten()
                    .filter(|p| !p.is_empty())
                    .collect();
                return match parts.as_slice() {
                    [owner, repo] => Self::github(owner, repo, None),
                    [owner, repo, "tree", reference @ ..] if !reference.is_empty() => {
                        Self::github(owner, repo, Some(&reference.join("/")))
                    }
                    _ => Err(format!("{input}: not a repository link")),
                };
            }
            if url.username() != "" || url.password().is_some() {
                return Err("links with credentials aren't allowed".into());
            }
            return Ok(Self {
                id: url.to_string(),
                label: format!("{}{}", url.host_str().unwrap_or_default(), url.path()),
                index_url: url.to_string(),
            });
        }
        if input.contains("://") {
            return Err("only https links".into());
        }
        let (repo, reference) = match input.split_once('@') {
            Some((repo, reference)) => (repo, Some(reference)),
            None => (input, None),
        };
        match repo.split_once('/') {
            Some((owner, repo)) => Self::github(owner, repo, reference),
            None => Err(format!("'{input}': use owner/repo")),
        }
    }

    fn github(owner: &str, repo: &str, reference: Option<&str>) -> Result<Self, String> {
        let repo = repo.strip_suffix(".git").unwrap_or(repo);
        let name_ok = |s: &str| {
            !s.is_empty()
                && s.len() <= 100
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
                && s != "."
                && s != ".."
        };
        if !name_ok(owner) || !name_ok(repo) {
            return Err(format!("'{owner}/{repo}' is not a GitHub repository"));
        }
        let reference = reference.filter(|r| !r.is_empty());
        if let Some(r) = reference
            && (r.len() > 100
                || r.contains("..")
                || !r
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_./".contains(&b)))
        {
            return Err(format!("'{r}' is not a branch, tag or commit"));
        }
        let slug = format!("{owner}/{repo}");
        let (id, label) = match reference {
            Some(r) => (format!("github:{slug}@{r}"), format!("{slug}@{r}")),
            None => (format!("github:{slug}"), slug.clone()),
        };
        Ok(Self {
            id,
            label,
            index_url: format!(
                "https://raw.githubusercontent.com/{slug}/{}/{INDEX_FILE}",
                reference.unwrap_or("HEAD")
            ),
        })
    }
}

/// A string, or one per locale (`{ "en": "…", "pt-BR": "…" }`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Text {
    Plain(String),
    Localized(BTreeMap<String, String>),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Index {
    pub schema: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<Text>,
    pub plugins: Vec<Listing>,
}

/// One plugin as an index lists it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    pub id: String,
    pub version: String,
    pub sdk: String,
    pub name: Text,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<Text>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    /// Image URL, absolute or relative to the index.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    /// The plugin keeps a background running (`persistent` in its manifest).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub persistent: bool,
    /// Package (zip) URL, absolute or relative to the index.
    pub package: String,
    /// Hex SHA-256 of the package.
    pub sha256: String,
}

impl Index {
    /// Parses an index and makes its URLs absolute; listings that don't make
    /// sense are dropped (logged) rather than hiding the whole source.
    pub fn parse(text: &str, index_url: &str) -> Result<Self, String> {
        let mut index: Index =
            serde_json::from_str(text).map_err(|e| format!("{INDEX_FILE}: {e}"))?;
        if index.schema != INDEX_SCHEMA {
            return Err(format!(
                "{INDEX_FILE}: schema {} isn't supported (this app reads {INDEX_SCHEMA})",
                index.schema
            ));
        }
        let base = Url::parse(index_url).map_err(|e| e.to_string())?;
        index
            .plugins
            .retain_mut(|listing| match listing.normalize(&base) {
                Ok(()) => true,
                Err(e) => {
                    log::warn!("{index_url}: skipping '{}': {e}", listing.id);
                    false
                }
            });
        Ok(index)
    }
}

impl Listing {
    fn normalize(&mut self, base: &Url) -> Result<(), String> {
        Version::parse(&self.version).ok_or("bad version")?;
        parse_sdk(&self.sdk).ok_or("bad sdk")?;
        if self.sha256.len() != 64 || !self.sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("sha256 must be 64 hex digits".into());
        }
        self.sha256.make_ascii_lowercase();
        self.package = resolve(base, &self.package)?;
        self.icon = self
            .icon
            .as_deref()
            .map(|icon| resolve(base, icon))
            .transpose()?;
        if let Some(home) = &self.homepage
            && !home.starts_with("https://")
        {
            self.homepage = None;
        }
        Ok(())
    }
}

/// `relative` against `base`; the result must be HTTPS.
pub fn resolve(base: &Url, relative: &str) -> Result<String, String> {
    let url = base
        .join(relative)
        .map_err(|e| format!("{relative}: {e}"))?;
    if url.scheme() != "https" {
        return Err(format!("{relative}: only https"));
    }
    Ok(url.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_github_shorthands() {
        let s = Source::parse("HeyyCzer/island-windows-plugins").unwrap();
        assert_eq!(s.id, "github:HeyyCzer/island-windows-plugins");
        assert_eq!(
            s.index_url,
            "https://raw.githubusercontent.com/HeyyCzer/island-windows-plugins/HEAD/island-plugins.json"
        );
        let s = Source::parse(" owner/repo@v1.2 ").unwrap();
        assert_eq!(s.id, "github:owner/repo@v1.2");
        assert!(s.index_url.contains("/owner/repo/v1.2/"));
        let s = Source::parse("https://github.com/owner/repo.git").unwrap();
        assert_eq!(s.id, "github:owner/repo");
        let s = Source::parse("https://github.com/owner/repo/tree/feat/x").unwrap();
        assert_eq!(s.id, "github:owner/repo@feat/x");
    }

    #[test]
    fn accepts_index_urls() {
        let s = Source::parse("https://example.com/plugins/island-plugins.json").unwrap();
        assert_eq!(
            s.index_url,
            "https://example.com/plugins/island-plugins.json"
        );
        assert_eq!(s.label, "example.com/plugins/island-plugins.json");
    }

    #[test]
    fn rejects_bad_sources() {
        for input in [
            "repo",
            "http://example.com/x.json",
            "file:///C:/x.json",
            "https://user:pw@example.com/x.json",
            "owner/../repo",
            "owner/repo@../../x",
            "https://github.com/owner",
            "own er/repo",
        ] {
            assert!(Source::parse(input).is_err(), "{input}");
        }
    }

    const INDEX_URL: &str = "https://raw.githubusercontent.com/o/r/HEAD/island-plugins.json";

    fn listing(package: &str) -> serde_json::Value {
        serde_json::json!({
            "id": "pomodoro",
            "version": "1.0.0",
            "sdk": "1.0",
            "name": { "en": "Pomodoro", "pt-BR": "Pomodoro" },
            "icon": "plugins/pomodoro/icon.svg",
            "package": package,
            "sha256": "AB".repeat(32),
        })
    }

    #[test]
    fn resolves_relative_urls() {
        let text =
            serde_json::json!({ "schema": 1, "plugins": [listing("packages/pomodoro-1.0.0.zip")] });
        let index = Index::parse(&text.to_string(), INDEX_URL).unwrap();
        let p = &index.plugins[0];
        assert_eq!(
            p.package,
            "https://raw.githubusercontent.com/o/r/HEAD/packages/pomodoro-1.0.0.zip"
        );
        assert_eq!(
            p.icon.as_deref(),
            Some("https://raw.githubusercontent.com/o/r/HEAD/plugins/pomodoro/icon.svg")
        );
        assert_eq!(p.sha256, "ab".repeat(32));
        assert!(matches!(p.name, Text::Localized(_)));
    }

    #[test]
    fn drops_broken_listings() {
        let mut bad_hash = listing("a.zip");
        bad_hash["sha256"] = "xyz".into();
        let text = serde_json::json!({
            "schema": 1,
            "plugins": [
                listing("https://github.com/o/r/releases/download/v1/a.zip"),
                listing("http://insecure.example/a.zip"),
                bad_hash,
            ],
        });
        let index = Index::parse(&text.to_string(), INDEX_URL).unwrap();
        assert_eq!(index.plugins.len(), 1);
    }

    #[test]
    fn refuses_unknown_schemas() {
        let text = serde_json::json!({ "schema": 2, "plugins": [] });
        assert!(Index::parse(&text.to_string(), INDEX_URL).is_err());
    }
}
