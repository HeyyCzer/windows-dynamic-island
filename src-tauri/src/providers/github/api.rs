//! Minimal GitHub REST client (blocking, via ureq).
//!
//! Responses are cached with their `ETag`: polls send `If-None-Match`, and
//! GitHub's `304 Not Modified` answers don't count against the rate limit.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use super::super::now_ms;

const API: &str = "https://api.github.com";
/// Dropped wholesale past this many URLs (only stale repos pile up).
const CACHE_MAX: usize = 400;

/// One issue, pull request, commit or release, in a shape the panel renders as is.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// What the panel prints first: `#128`, a short sha or a release tag.
    pub id: String,
    pub title: String,
    pub url: String,
    pub author: Option<String>,
    /// ISO 8601, straight from GitHub.
    pub at: String,
    /// Grows with newer entries (issue/PR number, release id); 0 for commits.
    #[serde(skip)]
    pub key: u64,
}

/// Open count (issues, PRs) and the newest entry of one list of a repo.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub count: Option<u64>,
    pub latest: Option<Entry>,
}

/// Error codes are worded by the frontend (`github.error.*`).
#[derive(Debug)]
pub enum Error {
    /// Missing or private without access (GitHub answers 404 / 422).
    NotFound,
    Unauthorized,
    /// Rate limited until this unix time in ms.
    RateLimited(u64),
    /// 409: the repository is empty (no commits yet).
    Empty,
    Network,
    Http,
}

impl Error {
    pub fn code(&self) -> &'static str {
        match self {
            Error::NotFound => "notFound",
            Error::Unauthorized => "unauthorized",
            Error::RateLimited(_) => "rateLimited",
            Error::Network => "network",
            Error::Empty | Error::Http => "http",
        }
    }
}

struct Page {
    body: Value,
    /// From the `Link` header: with `per_page=1`, the number of items.
    last_page: Option<u64>,
}

struct Cached {
    etag: String,
    body: Value,
    last_page: Option<u64>,
}

static CACHE: LazyLock<Mutex<HashMap<String, Cached>>> = LazyLock::new(Default::default);

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(15)))
        .build()
        .into()
}

fn get(path: &str, query: &[(&str, &str)], token: Option<&str>) -> Result<Page, Error> {
    let cache_key = format!("{}|{path}|{query:?}", token.is_some());
    let etag = CACHE
        .lock()
        .unwrap()
        .get(&cache_key)
        .map(|c| c.etag.clone());

    let mut req = agent()
        .get(format!("{API}{path}"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "windows-island");
    for (k, v) in query {
        req = req.query(*k, *v);
    }
    if let Some(token) = token {
        req = req.header("Authorization", &format!("Bearer {token}"));
    }
    if let Some(etag) = &etag {
        req = req.header("If-None-Match", etag);
    }
    let mut res = req.call().map_err(|_| Error::Network)?;

    let status = res.status().as_u16();
    let text = |name: &str| {
        res.headers()
            .get(name)
            .and_then(|h| h.to_str().ok())
            .map(str::to_string)
    };
    let number = |name: &str| text(name).and_then(|s| s.trim().parse::<u64>().ok());
    match status {
        200 => {}
        304 => {
            if let Some(c) = CACHE.lock().unwrap().get(&cache_key) {
                return Ok(Page {
                    body: c.body.clone(),
                    last_page: c.last_page,
                });
            }
            return Err(Error::Http);
        }
        401 => return Err(Error::Unauthorized),
        404 | 422 => return Err(Error::NotFound),
        409 => return Err(Error::Empty),
        403 | 429 => {
            let until = number("retry-after")
                .map(|secs| now_ms() + secs * 1000)
                .or_else(|| {
                    let exhausted = number("x-ratelimit-remaining") == Some(0);
                    number("x-ratelimit-reset")
                        .filter(|_| exhausted)
                        .map(|secs| secs * 1000)
                })
                // Secondary limits don't always say when; back off a minute.
                .unwrap_or_else(|| now_ms() + 60_000);
            return Err(Error::RateLimited(until));
        }
        _ => return Err(Error::Http),
    }
    let new_etag = text("etag");
    let last_page = text("link").as_deref().and_then(last_page);
    let raw = res
        .body_mut()
        .read_to_string()
        .map_err(|_| Error::Network)?;
    let body: Value = serde_json::from_str(&raw).map_err(|_| Error::Http)?;
    if let Some(etag) = new_etag {
        let mut cache = CACHE.lock().unwrap();
        if cache.len() >= CACHE_MAX {
            cache.clear();
        }
        cache.insert(
            cache_key,
            Cached {
                etag,
                body: body.clone(),
                last_page,
            },
        );
    }
    Ok(Page { body, last_page })
}

/// Page number of the `rel="last"` link of a `Link` header.
fn last_page(link: &str) -> Option<u64> {
    link.split(',')
        .find(|part| part.contains("rel=\"last\""))
        .and_then(|part| {
            let url = part.split(['<', '>']).nth(1)?;
            let query = url.split_once('?')?.1;
            query
                .split('&')
                .find_map(|kv| kv.strip_prefix("page="))
                .and_then(|n| n.parse().ok())
        })
}

/// First line of a commit message.
fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or_default().trim().to_string()
}

fn str_of(v: &Value) -> String {
    v.as_str().unwrap_or_default().to_string()
}

/// An issue or a pull request (same fields in both APIs).
fn numbered(i: &Value) -> Entry {
    let number = i["number"].as_u64().unwrap_or(0);
    Entry {
        id: format!("#{number}"),
        title: str_of(&i["title"]),
        url: str_of(&i["html_url"]),
        author: i["user"]["login"].as_str().map(str::to_string),
        at: str_of(&i["created_at"]),
        key: number,
    }
}

/// Open issues (pull requests excluded) and the newest one.
pub fn issues(repo: &str, token: Option<&str>) -> Result<Section, Error> {
    let q = format!("repo:{repo} is:issue is:open");
    let v = get(
        "/search/issues",
        &[
            ("q", &q),
            ("sort", "created"),
            ("order", "desc"),
            ("per_page", "1"),
        ],
        token,
    )?
    .body;
    Ok(Section {
        count: Some(v["total_count"].as_u64().unwrap_or(0)),
        latest: v["items"].get(0).map(numbered),
    })
}

/// Open pull requests and the newest one. Counted from the pagination instead
/// of the search API, whose limit (30 a minute) the issues already use.
pub fn pulls(repo: &str, token: Option<&str>) -> Result<Section, Error> {
    let page = get(
        &format!("/repos/{repo}/pulls"),
        &[
            ("state", "open"),
            ("sort", "created"),
            ("direction", "desc"),
            ("per_page", "1"),
        ],
        token,
    )?;
    let items = page.body.as_array().cloned().unwrap_or_default();
    Ok(Section {
        count: Some(page.last_page.unwrap_or(items.len() as u64)),
        latest: items.first().map(numbered),
    })
}

/// Newest commit of the default branch.
pub fn commits(repo: &str, token: Option<&str>) -> Result<Section, Error> {
    let body = match get(
        &format!("/repos/{repo}/commits"),
        &[("per_page", "1")],
        token,
    ) {
        Ok(page) => page.body,
        Err(Error::Empty) => return Ok(Section::default()),
        Err(e) => return Err(e),
    };
    let latest = body.get(0).map(|c| {
        let sha = c["sha"].as_str().unwrap_or_default();
        Entry {
            id: sha.chars().take(7).collect(),
            title: first_line(c["commit"]["message"].as_str().unwrap_or_default()),
            url: str_of(&c["html_url"]),
            author: c["author"]["login"]
                .as_str()
                .or(c["commit"]["author"]["name"].as_str())
                .map(str::to_string),
            at: str_of(&c["commit"]["committer"]["date"]),
            key: 0,
        }
    });
    Ok(Section {
        count: None,
        latest,
    })
}

/// Newest published release (drafts skipped).
pub fn releases(repo: &str, token: Option<&str>) -> Result<Section, Error> {
    let body = get(
        &format!("/repos/{repo}/releases"),
        &[("per_page", "5")],
        token,
    )?
    .body;
    Ok(Section {
        count: None,
        latest: newest_release(&body),
    })
}

fn newest_release(list: &Value) -> Option<Entry> {
    let r = list
        .as_array()?
        .iter()
        .find(|r| !r["draft"].as_bool().unwrap_or(false))?;
    let tag = str_of(&r["tag_name"]);
    let name = r["name"].as_str().map(str::trim).unwrap_or_default();
    Some(Entry {
        title: if name.is_empty() {
            tag.clone()
        } else {
            name.to_string()
        },
        id: tag,
        url: str_of(&r["html_url"]),
        author: r["author"]["login"].as_str().map(str::to_string),
        at: str_of(&r["published_at"]),
        key: r["id"].as_u64().unwrap_or(0),
    })
}

/// Login of the token's owner.
pub fn login(token: &str) -> Result<String, Error> {
    let v = get("/user", &[], Some(token))?.body;
    Ok(v["login"].as_str().unwrap_or_default().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_last_page_from_link_header() {
        let link = r#"<https://api.github.com/repositories/1/pulls?state=open&per_page=1&page=2>; rel="next", <https://api.github.com/repositories/1/pulls?state=open&per_page=1&page=42>; rel="last""#;
        assert_eq!(last_page(link), Some(42));
        let no_last = r#"<https://api.github.com/x?page=1>; rel="prev", <https://api.github.com/x?page=1>; rel="first""#;
        assert_eq!(last_page(no_last), None);
    }

    #[test]
    fn keeps_first_line_of_commit_message() {
        assert_eq!(first_line("fix: thing\n\nlong body"), "fix: thing");
        assert_eq!(first_line(""), "");
    }

    #[test]
    fn release_skips_drafts_and_falls_back_to_tag() {
        let list = serde_json::json!([
            {"tag_name": "v2.0.0", "name": "Next", "id": 11, "draft": true},
            {"tag_name": "v1.0.0", "name": " ", "id": 9, "draft": false},
        ]);
        let r = newest_release(&list).unwrap();
        assert_eq!(
            (r.id.as_str(), r.title.as_str(), r.key),
            ("v1.0.0", "v1.0.0", 9)
        );
        assert!(newest_release(&serde_json::json!([])).is_none());
    }
}
