//! HTTP for the marketplace (indexes, packages) and for plugins' `net.fetch`.

use std::collections::BTreeMap;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::{Deserialize, Serialize};

use super::package::MAX_PACKAGE_BYTES;
use super::permissions::{Permission, allows_host};
use super::source::{Index, Source};

const MAX_INDEX_BYTES: u64 = 2 * 1024 * 1024;
const MAX_FETCH_BYTES: u64 = 10 * 1024 * 1024;
const USER_AGENT: &str = concat!("IslandForWindows/", env!("CARGO_PKG_VERSION"));

fn marketplace_agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .https_only(true)
        .timeout_global(Some(Duration::from_secs(30)))
        .user_agent(USER_AGENT)
        .build()
        .into()
}

pub fn fetch_index(source: &Source) -> Result<Index, String> {
    let mut res = marketplace_agent()
        .get(&source.index_url)
        .call()
        .map_err(|e| format!("{}: {e}", source.index_url))?;
    let text = res
        .body_mut()
        .with_config()
        .limit(MAX_INDEX_BYTES)
        .read_to_string()
        .map_err(|e| e.to_string())?;
    Index::parse(&text, &source.index_url)
}

pub fn download(url: &str) -> Result<Vec<u8>, String> {
    let mut res = marketplace_agent()
        .get(url)
        .call()
        .map_err(|e| format!("{url}: {e}"))?;
    res.body_mut()
        .with_config()
        .limit(MAX_PACKAGE_BYTES)
        .read_to_vec()
        .map_err(|e| e.to_string())
}

/// A plugin's request, as `island.net.fetch` sends it.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
    pub url: String,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    /// Text body, or base64 when `body_base64` is set.
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub body_base64: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResponse {
    pub status: u16,
    pub url: String,
    pub headers: BTreeMap<String, String>,
    /// The body as base64 (the SDK decodes it into text, JSON or bytes).
    pub body: String,
}

/// Headers a plugin can't set: they'd let it pose as something else.
const FORBIDDEN_HEADERS: &[&str] = &[
    "host",
    "content-length",
    "connection",
    "transfer-encoding",
    "cookie",
];

pub fn plugin_fetch(granted: &[Permission], req: FetchRequest) -> Result<FetchResponse, String> {
    let url = url::Url::parse(&req.url).map_err(|e| format!("{}: {e}", req.url))?;
    if url.scheme() != "https" {
        return Err("only https requests".into());
    }
    let host = url.host_str().ok_or("no host")?;
    if !allows_host(granted, host, url.port()) {
        return Err(format!("permission 'network:{host}' wasn't granted"));
    }
    let method = req.method.as_deref().unwrap_or("GET").to_ascii_uppercase();
    let mut builder = ureq::http::Request::builder()
        .method(method.as_str())
        .uri(url.as_str());
    for (name, value) in &req.headers {
        if FORBIDDEN_HEADERS.contains(&name.to_ascii_lowercase().as_str()) {
            continue;
        }
        builder = builder.header(name, value);
    }
    let body = match req.body {
        Some(body) if req.body_base64 => BASE64.decode(body).map_err(|e| e.to_string())?,
        Some(body) => body.into_bytes(),
        None => Vec::new(),
    };
    let request = builder.body(body).map_err(|e| e.to_string())?;

    // No redirects: each hop would need its own permission, so the plugin gets
    // the 3xx and may follow it itself.
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .https_only(true)
        .http_status_as_error(false)
        .max_redirects(0)
        .timeout_global(Some(Duration::from_secs(30)))
        .user_agent(USER_AGENT)
        .build()
        .into();
    let mut res = agent.run(request).map_err(|e| e.to_string())?;
    let headers = res
        .headers()
        .iter()
        .filter(|(name, _)| name.as_str() != "set-cookie")
        .filter_map(|(name, value)| Some((name.to_string(), value.to_str().ok()?.to_string())))
        .collect();
    let bytes = res
        .body_mut()
        .with_config()
        .limit(MAX_FETCH_BYTES)
        .read_to_vec()
        .map_err(|e| e.to_string())?;
    Ok(FetchResponse {
        status: res.status().as_u16(),
        url: url.to_string(),
        headers,
        body: BASE64.encode(bytes),
    })
}
