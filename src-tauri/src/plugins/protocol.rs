//! The `plugin://` protocol (`http://plugin.localhost` on Windows) that serves
//! plugins' files to their sandboxed iframes:
//!
//! - `/<plugin>/<path>`: a file of the package, re-checked against the hash
//!   taken at install time on every request;
//! - `/<plugin>/__background.html`: the page the island loads for a plugin
//!   whose background is a script;
//! - `/__sdk/<major>.js|css`: the SDK runtime, injected into every HTML page.
//!
//! Every response carries a CSP that lets a plugin load only its own files
//! (and the SDK): no network, no frames, no forms.

use tauri::http::{Request, Response, StatusCode, header};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

use super::Plugins;
use super::manifest::SDK_VERSION;

pub const SCHEME: &str = "plugin";

/// The generated page that runs a background script.
pub const BACKGROUND_PAGE: &str = "__background.html";

const SDK_JS: &str = include_str!("../../../packages/plugin-sdk/runtime/v1.js");
const SDK_CSS: &str = include_str!("../../../packages/plugin-sdk/runtime/v1.css");

/// What the webview calls this protocol's origin.
fn origin() -> &'static str {
    if cfg!(windows) {
        "http://plugin.localhost"
    } else {
        "plugin://localhost"
    }
}

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    // Hashing files is quick, but not for the webview's thread.
    std::thread::spawn(move || {
        let path = request.uri().path().to_string();
        let response = if request.method() != "GET" {
            plain(StatusCode::METHOD_NOT_ALLOWED, "GET only")
        } else {
            serve(&app, &path)
        };
        responder.respond(response);
    });
}

fn serve<R: Runtime>(app: &tauri::AppHandle<R>, path: &str) -> Response<Vec<u8>> {
    let plugins = app.state::<Plugins>();
    let path = percent_decode(path);
    let path = path.trim_start_matches('/');
    let (plugin, file) = path.split_once('/').unwrap_or((path, ""));

    if plugin == "__sdk" {
        let major = SDK_VERSION.0;
        return match file {
            f if f == format!("{major}.js") => {
                respond(SDK_JS.as_bytes().to_vec(), "text/javascript", None)
            }
            f if f == format!("{major}.css") => {
                respond(SDK_CSS.as_bytes().to_vec(), "text/css", None)
            }
            _ => plain(StatusCode::NOT_FOUND, "unknown SDK version"),
        };
    }

    let Some(loaded) = plugins.get(plugin).filter(|p| p.ok()) else {
        return plain(StatusCode::NOT_FOUND, "no such plugin");
    };
    let Some(manifest) = &loaded.manifest else {
        return plain(StatusCode::NOT_FOUND, "no such plugin");
    };
    if super::is_disabled(app, plugin) {
        return plain(StatusCode::FORBIDDEN, "plugin is turned off");
    }

    if file == BACKGROUND_PAGE {
        return match &manifest.background {
            Some(script) if script.ends_with(".html") => serve_file(&loaded, plugin, script),
            Some(script) => respond(
                with_sdk(&format!(
                    "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>\
                     <script type=\"module\" src=\"./{script}\"></script></body></html>"
                )),
                "text/html; charset=utf-8",
                Some(plugin),
            ),
            None => plain(StatusCode::NOT_FOUND, "no background"),
        };
    }
    serve_file(&loaded, plugin, file)
}

fn serve_file(loaded: &super::registry::Loaded, plugin: &str, file: &str) -> Response<Vec<u8>> {
    match loaded.read(file) {
        Ok(bytes) => {
            let kind = content_type(file);
            let bytes = if kind.starts_with("text/html") {
                with_sdk(&String::from_utf8_lossy(&bytes))
            } else {
                bytes
            };
            respond(bytes, kind, Some(plugin))
        }
        Err(e) => {
            log::warn!("plugin {plugin}: {file}: {e}");
            plain(StatusCode::NOT_FOUND, &e)
        }
    }
}

/// Puts the SDK first in `<head>`, ahead of the plugin's own scripts.
fn with_sdk(html: &str) -> Vec<u8> {
    let major = SDK_VERSION.0;
    let tags = format!(
        "<link rel=\"stylesheet\" href=\"/__sdk/{major}.css\"><script src=\"/__sdk/{major}.js\"></script>"
    );
    let lower = html.to_ascii_lowercase();
    let at = lower
        .find("<head")
        .and_then(|i| lower[i..].find('>').map(|j| i + j + 1))
        .or_else(|| {
            lower
                .find("<html")
                .and_then(|i| lower[i..].find('>').map(|j| i + j + 1))
        });
    match at {
        Some(at) => format!("{}{tags}{}", &html[..at], &html[at..]),
        None => format!("{tags}{html}"),
    }
    .into_bytes()
}

/// Only the plugin's own files and the SDK; nothing from the network.
fn csp(plugin: &str) -> String {
    let own = format!("{0}/{plugin}/ {0}/__sdk/", origin());
    format!(
        "default-src 'none'; script-src {own}; style-src {own} 'unsafe-inline'; \
         img-src {own} data: blob:; font-src {own} data:; media-src {own} data: blob:; \
         connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; \
         form-action 'none'; base-uri 'none'"
    )
}

fn respond(body: Vec<u8>, kind: &str, plugin: Option<&str>) -> Response<Vec<u8>> {
    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, kind)
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        // Sandboxed frames have an opaque origin: module scripts need CORS.
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header("Cross-Origin-Resource-Policy", "cross-origin");
    if let Some(plugin) = plugin {
        builder = builder.header("Content-Security-Policy", csp(plugin));
    }
    builder
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn plain(status: StatusCode, text: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(text.as_bytes().to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn content_type(path: &str) -> &'static str {
    let ext = path.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase());
    match ext.as_deref() {
        Some("html" | "htm") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("txt" | "md") => "text/plain; charset=utf-8",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}

/// `%20` → space; a path with invalid escapes is left as is (and won't match).
fn percent_decode(path: &str) -> String {
    let bytes = path.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && let Some(hex) = path.get(i + 1..i + 3)
            && let Ok(b) = u8::from_str_radix(hex, 16)
        {
            out.push(b);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| path.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn injects_the_sdk_first() {
        let html = String::from_utf8(with_sdk(
            "<!doctype html><html><HEAD><script src=\"app.js\"></script></HEAD></html>",
        ))
        .unwrap();
        let sdk = html.find("/__sdk/1.js").unwrap();
        assert!(sdk < html.find("app.js").unwrap());
        assert!(html.find("<HEAD>").unwrap() < sdk);
        let bare = String::from_utf8(with_sdk("<p>hi</p>")).unwrap();
        assert!(bare.starts_with("<link"));
    }

    #[test]
    fn locks_plugins_to_their_own_files() {
        let csp = csp("pomodoro");
        assert!(csp.contains("connect-src 'none'"));
        assert!(csp.contains("/pomodoro/ "));
        assert!(!csp.contains("script-src *"));
        assert!(!csp.contains("'unsafe-eval'"));
    }

    #[test]
    fn decodes_paths() {
        assert_eq!(percent_decode("/a%20b/c.js"), "/a b/c.js");
        assert_eq!(percent_decode("/%2e%2e/x"), "/../x");
        assert_eq!(percent_decode("/bad%zz"), "/bad%zz");
    }

    #[test]
    fn knows_common_types() {
        assert!(content_type("a/index.HTML").starts_with("text/html"));
        assert_eq!(content_type("icon.svg"), "image/svg+xml");
        assert_eq!(content_type("x"), "application/octet-stream");
    }
}
