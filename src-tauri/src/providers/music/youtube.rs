//! Figures out which YouTube video a browser is playing, so the island can
//! mirror it. Windows' media controls only expose title, channel and duration,
//! so we search YouTube for "title channel" and accept a result only when the
//! title matches exactly and either the duration matches or a browser window
//! title confirms it is YouTube. Ads never match, so they keep the artwork.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::Value;
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, IsWindowVisible};

use super::MusicState;

const BROWSERS: &[&str] = &["Chrome", "Edge", "Brave", "Firefox", "Opera", "Vivaldi", "Arc"];

pub fn is_browser(app_name: &str) -> bool {
    BROWSERS.iter().any(|b| b.eq_ignore_ascii_case(app_name))
}

#[derive(Default, Clone)]
pub struct Resolver {
    cache: Arc<Mutex<HashMap<String, Option<String>>>>,
    in_flight: Arc<Mutex<HashSet<String>>>,
}

impl Resolver {
    /// The video id for this media once resolved; starts resolving it in the
    /// background the first time it's asked.
    pub fn video_id(&self, state: &MusicState) -> Option<String> {
        if !is_browser(&state.app_name) || state.title.is_empty() {
            return None;
        }
        let key = format!("{}|{}|{}|{}", state.app_name, state.title, state.artist, state.duration_ms / 1000);
        if let Some(found) = self.cache.lock().unwrap().get(&key) {
            return found.clone();
        }
        if !self.in_flight.lock().unwrap().insert(key.clone()) {
            return None;
        }
        let (title, artist, duration_ms) = (state.title.clone(), state.artist.clone(), state.duration_ms);
        let this = self.clone();
        std::thread::spawn(move || {
            let window_says_youtube = browser_window_shows_youtube(&title);
            let found = find(&title, &artist, duration_ms, window_says_youtube).unwrap_or_else(|e| {
                log::info!("youtube: couldn't identify \"{title}\": {e}");
                None
            });
            this.cache.lock().unwrap().insert(key.clone(), found);
            this.in_flight.lock().unwrap().remove(&key);
        });
        None
    }
}

fn find(title: &str, artist: &str, duration_ms: u64, window_says_youtube: bool) -> Result<Option<String>, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(8)))
        .build()
        .into();
    let mut res = agent
        .get("https://www.youtube.com/results")
        .query("search_query", format!("{title} {artist}").trim())
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        )
        .header("Accept-Language", "en-US,en;q=0.9")
        // Skips the EU cookie-consent interstitial, which has no results in it.
        .header("Cookie", "CONSENT=YES+1")
        .call()
        .map_err(|e| e.to_string())?;
    let html = res.body_mut().read_to_string().map_err(|e| e.to_string())?;

    let wanted = normalize(title);
    for (id, result_title, length) in parse_results(&html) {
        if normalize(&result_title) != wanted {
            continue;
        }
        let duration_matches =
            duration_ms > 0 && length.is_some_and(|l| (l as i64 - (duration_ms / 1000) as i64).abs() <= 3);
        if duration_matches || window_says_youtube {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

/// `(video id, title, length in seconds)` from the page's `ytInitialData`.
fn parse_results(html: &str) -> Vec<(String, String, Option<u64>)> {
    const MARKER: &str = "var ytInitialData = ";
    let Some(start) = html.find(MARKER).map(|i| i + MARKER.len()) else { return vec![] };
    let Some(end) = html[start..].find(";</script>").map(|i| start + i) else { return vec![] };
    let Ok(data) = serde_json::from_str::<Value>(&html[start..end]) else { return vec![] };
    let mut found = Vec::new();
    collect(&data, &mut found);
    found
}

fn collect(v: &Value, found: &mut Vec<(String, String, Option<u64>)>) {
    if found.len() >= 10 {
        return;
    }
    match v {
        Value::Object(map) => {
            for (key, child) in map {
                if key == "videoRenderer" {
                    if let Some(video) = to_video(child) {
                        found.push(video);
                    }
                } else {
                    collect(child, found);
                }
            }
        }
        Value::Array(items) => items.iter().for_each(|i| collect(i, found)),
        _ => {}
    }
}

fn to_video(r: &Value) -> Option<(String, String, Option<u64>)> {
    let id = r["videoId"].as_str().filter(|id| is_video_id(id))?.to_string();
    let title: String = r["title"]["runs"].as_array()?.iter().filter_map(|run| run["text"].as_str()).collect();
    if title.is_empty() {
        return None;
    }
    let length = r["lengthText"]["simpleText"].as_str().and_then(parse_length);
    Some((id, title, length))
}

pub fn is_video_id(id: &str) -> bool {
    id.len() == 11 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// "1:02:03" → 3723
fn parse_length(text: &str) -> Option<u64> {
    text.split(':').try_fold(0u64, |acc, part| Some(acc * 60 + part.trim().parse::<u64>().ok()?))
}

fn normalize(text: &str) -> String {
    text.trim().to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Browsers title their window after the active tab: "Video - YouTube - Google Chrome".
fn browser_window_shows_youtube(media_title: &str) -> bool {
    let wanted = normalize(media_title);
    window_titles()
        .iter()
        .any(|t| t.contains("YouTube") && normalize(t).contains(&wanted))
}

fn window_titles() -> Vec<String> {
    unsafe extern "system" fn each(hwnd: HWND, lparam: LPARAM) -> BOOL {
        unsafe {
            let titles = &mut *(lparam.0 as *mut Vec<String>);
            if IsWindowVisible(hwnd).as_bool() {
                let mut buf = [0u16; 512];
                let len = GetWindowTextW(hwnd, &mut buf) as usize;
                if len > 0 {
                    titles.push(String::from_utf16_lossy(&buf[..len.min(buf.len())]));
                }
            }
        }
        BOOL(1)
    }
    let mut titles: Vec<String> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(each), LPARAM(&mut titles as *mut Vec<String> as isize));
    }
    titles
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lengths() {
        assert_eq!(parse_length("4:05"), Some(245));
        assert_eq!(parse_length("1:02:03"), Some(3723));
        assert_eq!(parse_length("live"), None);
    }

    #[test]
    fn ids() {
        assert!(is_video_id("dQw4w9WgXcQ"));
        assert!(!is_video_id("dQw4w9WgXc"));
        assert!(!is_video_id("dQw4w9WgX'Q"));
    }

    #[test]
    fn parses_results() {
        let html = r#"<script>var ytInitialData = {"contents":[{"videoRenderer":{"videoId":"dQw4w9WgXcQ","title":{"runs":[{"text":"Never Gonna"},{"text":" Give You Up"}]},"lengthText":{"simpleText":"3:33"}}}]};</script>"#;
        assert_eq!(
            parse_results(html),
            vec![("dQw4w9WgXcQ".to_string(), "Never Gonna Give You Up".to_string(), Some(213))]
        );
    }
}
