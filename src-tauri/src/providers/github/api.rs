//! Minimal GitHub REST client (blocking, via ureq).

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use super::super::now_ms;

const API: &str = "https://api.github.com";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub author: Option<String>,
    /// ISO 8601, straight from GitHub.
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RepoIssues {
    pub open: u64,
    pub latest: Option<Issue>,
}

/// Error codes are worded by the frontend (`github.error.*`).
#[derive(Debug)]
pub enum Error {
    /// Missing or private without access (GitHub answers 404 / 422).
    NotFound,
    Unauthorized,
    /// Rate limited until this unix time in ms.
    RateLimited(u64),
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
            Error::Http => "http",
        }
    }
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(15)))
        .build()
        .into()
}

fn get(path: &str, query: &[(&str, &str)], token: Option<&str>) -> Result<Value, Error> {
    let mut req = agent()
        .get(format!("{API}{path}"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "windows-dynamic-island");
    for (k, v) in query {
        req = req.query(*k, *v);
    }
    if let Some(token) = token {
        req = req.header("Authorization", &format!("Bearer {token}"));
    }
    let mut res = req.call().map_err(|_| Error::Network)?;

    let status = res.status().as_u16();
    let header = |name: &str| {
        res.headers()
            .get(name)
            .and_then(|h| h.to_str().ok())
            .and_then(|s| s.trim().parse::<u64>().ok())
    };
    match status {
        200 => {}
        401 => return Err(Error::Unauthorized),
        404 | 422 => return Err(Error::NotFound),
        403 | 429 => {
            let until = header("retry-after")
                .map(|secs| now_ms() + secs * 1000)
                .or_else(|| {
                    let exhausted = header("x-ratelimit-remaining") == Some(0);
                    header("x-ratelimit-reset").filter(|_| exhausted).map(|secs| secs * 1000)
                })
                // Secondary limits don't always say when; back off a minute.
                .unwrap_or_else(|| now_ms() + 60_000);
            return Err(Error::RateLimited(until));
        }
        _ => return Err(Error::Http),
    }
    let body = res.body_mut().read_to_string().map_err(|_| Error::Network)?;
    serde_json::from_str(&body).map_err(|_| Error::Http)
}

/// Open issues (pull requests excluded) and the newest one.
pub fn repo_issues(repo: &str, token: Option<&str>) -> Result<RepoIssues, Error> {
    let q = format!("repo:{repo} is:issue is:open");
    let v = get(
        "/search/issues",
        &[("q", &q), ("sort", "created"), ("order", "desc"), ("per_page", "1")],
        token,
    )?;
    let latest = v["items"].get(0).map(|i| Issue {
        number: i["number"].as_u64().unwrap_or(0),
        title: i["title"].as_str().unwrap_or_default().to_string(),
        url: i["html_url"].as_str().unwrap_or_default().to_string(),
        author: i["user"]["login"].as_str().map(str::to_string),
        created_at: i["created_at"].as_str().unwrap_or_default().to_string(),
    });
    Ok(RepoIssues {
        open: v["total_count"].as_u64().unwrap_or(0),
        latest,
    })
}

/// Login of the token's owner.
pub fn login(token: &str) -> Result<String, Error> {
    let v = get("/user", &[], Some(token))?;
    Ok(v["login"].as_str().unwrap_or_default().to_string())
}
