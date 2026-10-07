//! Clipboard history: whatever you copy (text, pictures, files) shows up in
//! the island for a moment, and the latest ones stay in a list to copy again,
//! drag into another app, keep on the shelf or ask Claude about. Screenshots
//! (Win+Shift+S, Print Screen, ShareX…) open the island with the picture.
//!
//! Privacy: text only lives in memory. Pictures are written to the app data
//! folder (wiped at start) because dragging and attaching need a file. What
//! password managers mark as private is never read, and nothing is read while
//! the module is off.

mod image;
mod os;

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, UNIX_EPOCH};

use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use tauri::Manager;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;

use self::image::Picture;
use self::os::{Clip, Copied, Payload};
use super::{now_ms, Provider};
use crate::hub::Hub;
use crate::i18n;
use crate::settings::Settings;

pub const ID: &str = "clipboard";
const ENABLED_KEY: &str = "module.clipboard.enabled";
const MAX_ITEMS: usize = 20;
const MAX_PICTURES: usize = 8;
const PREVIEW_CHARS: usize = 300;
const THUMB_SIDE: u32 = 240;
const POLL: Duration = Duration::from_millis(250);
/// Apps put several formats on the clipboard one after the other.
const SETTLE: Duration = Duration::from_millis(120);
/// A busy clipboard is retried this many times before the copy is skipped.
const READ_ATTEMPTS: u32 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Kind {
    Text,
    Image,
    Files,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ItemView {
    id: u64,
    kind: Kind,
    /// Text: its start, on one line.
    preview: Option<String>,
    chars: Option<usize>,
    /// Pictures: a small PNG (data URL), the full size and the file.
    thumb: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    path: Option<String>,
    /// Files: their names.
    names: Vec<String>,
    screenshot: bool,
    /// App that copied it.
    source: Option<String>,
    copied_at: u64,
    /// Copied again from the island itself: no "copied" pill for it.
    quiet: bool,
}

enum Content {
    Text(String),
    Picture { path: PathBuf, fingerprint: u64 },
    Files(Vec<PathBuf>),
}

struct Entry {
    view: ItemView,
    content: Content,
}

#[derive(Serialize)]
struct State {
    items: Vec<ItemView>,
}

struct Ctx {
    hub: Arc<Hub>,
    dir: PathBuf,
    entries: Mutex<Vec<Entry>>,
    next_id: AtomicU64,
}

impl Ctx {
    fn publish(&self) {
        let items = self.entries.lock().unwrap().iter().map(|e| e.view.clone()).collect();
        self.hub.publish(ID, &State { items });
    }

    fn enabled(&self) -> bool {
        self.hub.app().state::<Settings>().get(ENABLED_KEY).and_then(|v| v.as_bool()).unwrap_or(true)
    }

    /// Forgets everything. True if there was something.
    fn clear(&self) -> bool {
        let mut entries = self.entries.lock().unwrap();
        let had = !entries.is_empty();
        entries.drain(..).for_each(delete_file);
        had
    }

    fn add(&self, copied: Copied, quiet: bool) {
        // Copying something already in the list moves it to the top (same id,
        // so the UI keeps its row).
        let same = |e: &Entry| match (&e.content, &copied.clip) {
            (Content::Text(a), Clip::Text(b)) => a == b,
            (Content::Files(a), Clip::Files(b)) => a == b,
            (Content::Picture { fingerprint, .. }, Clip::Picture(p)) => *fingerprint == image::fingerprint(p),
            _ => false,
        };
        let existing = {
            let mut entries = self.entries.lock().unwrap();
            entries.iter().position(same).map(|i| entries.remove(i))
        };
        let mut entry = match existing {
            Some(mut entry) => {
                entry.view.screenshot |= copied.screenshot;
                // Copied again from the island: it still comes from the original app.
                if !copied.own {
                    entry.view.source = copied.source.or(entry.view.source);
                }
                entry
            }
            None => match self.new_entry(self.next_id.fetch_add(1, Ordering::Relaxed), copied) {
                Some(entry) => entry,
                None => return,
            },
        };
        entry.view.copied_at = now_ms();
        entry.view.quiet = quiet;

        let mut entries = self.entries.lock().unwrap();
        entries.insert(0, entry);
        let mut pictures = 0;
        let mut kept = Vec::with_capacity(entries.len());
        for (i, e) in entries.drain(..).enumerate() {
            let is_picture = matches!(e.content, Content::Picture { .. });
            pictures += is_picture as usize;
            if i < MAX_ITEMS && (!is_picture || pictures <= MAX_PICTURES) {
                kept.push(e);
            } else {
                delete_file(e);
            }
        }
        *entries = kept;
        drop(entries);
        self.publish();
    }

    fn new_entry(&self, id: u64, copied: Copied) -> Option<Entry> {
        let mut view = ItemView {
            id,
            kind: Kind::Text,
            preview: None,
            chars: None,
            thumb: None,
            width: None,
            height: None,
            path: None,
            names: Vec::new(),
            screenshot: copied.screenshot,
            source: copied.source,
            copied_at: 0,
            quiet: false,
        };
        let content = match copied.clip {
            Clip::Text(text) => {
                view.preview = Some(preview(&text));
                view.chars = Some(text.chars().count());
                Content::Text(text)
            }
            Clip::Files(paths) => {
                view.kind = Kind::Files;
                view.names = paths
                    .iter()
                    .map(|p| p.file_name().map_or_else(|| p.to_string_lossy(), |n| n.to_string_lossy()).to_string())
                    .collect();
                Content::Files(paths)
            }
            Clip::Picture(picture) => {
                view.kind = Kind::Image;
                let path = self.dir.join(format!("clip-{id}.png"));
                let saved = image::encode_png(&picture).and_then(|png| std::fs::write(&path, png).map_err(|e| e.to_string()));
                if let Err(e) = saved {
                    log::warn!("clipboard: can't save picture: {e}");
                    return None;
                }
                view.thumb = thumb_url(&picture);
                view.width = Some(picture.width);
                view.height = Some(picture.height);
                view.path = Some(path.to_string_lossy().to_string());
                Content::Picture { path, fingerprint: image::fingerprint(&picture) }
            }
        };
        Some(Entry { view, content })
    }

    fn find<T>(&self, id: u64, f: impl FnOnce(&Entry) -> T) -> Result<T, String> {
        self.entries.lock().unwrap().iter().find(|e| e.view.id == id).map(f).ok_or_else(|| "no such item".into())
    }

    /// Puts an item back on the clipboard.
    fn copy(&self, id: u64) -> Result<(), String> {
        enum Owned {
            Text(String),
            Picture(PathBuf),
            Files(Vec<PathBuf>),
        }
        let content = self.find(id, |e| match &e.content {
            Content::Text(t) => Owned::Text(t.clone()),
            Content::Picture { path, .. } => Owned::Picture(path.clone()),
            Content::Files(p) => Owned::Files(p.clone()),
        })?;
        let win = self.hub.app().get_webview_window(crate::window::ISLAND_LABEL).ok_or("no island window")?;
        let owner = HWND(win.hwnd().map_err(|e| e.to_string())?.0);
        match content {
            Owned::Text(text) => os::write(owner, Payload::Text(&text)),
            Owned::Files(paths) => os::write(owner, Payload::Files(&paths)),
            Owned::Picture(path) => {
                let png = std::fs::read(&path).map_err(|e| e.to_string())?;
                let picture = image::decode_png(&png).ok_or("unreadable picture")?;
                os::write(owner, Payload::Picture { picture: &picture, png: &png })
            }
        }
    }

    fn remove(&self, id: u64) {
        let removed = {
            let mut entries = self.entries.lock().unwrap();
            entries.iter().position(|e| e.view.id == id).map(|i| entries.remove(i))
        };
        if let Some(entry) = removed {
            delete_file(entry);
            self.publish();
        }
    }

    /// Files to drag out of the island.
    fn paths(&self, id: u64) -> Result<Vec<PathBuf>, String> {
        self.find(id, |e| match &e.content {
            Content::Picture { path, .. } => Ok(vec![path.clone()]),
            Content::Files(paths) => Ok(paths.clone()),
            Content::Text(_) => Err("text can't be dragged".to_string()),
        })?
    }

    /// Lasting files for the shelf: the files themselves, or the picture saved
    /// to the Screenshots folder (reusing the copy Snipping Tool saved, if any).
    fn keep(&self, id: u64) -> Result<Vec<String>, String> {
        let (content, view) = self.find(id, |e| {
            let content = match &e.content {
                Content::Picture { path, .. } => Ok(path.clone()),
                Content::Files(paths) => Err(paths.clone()),
                Content::Text(_) => Ok(PathBuf::new()),
            };
            (content, e.view.clone())
        })?;
        let picture = match content {
            Err(files) => return Ok(files.iter().map(|p| p.to_string_lossy().to_string()).collect()),
            Ok(p) if p.as_os_str().is_empty() => return Err("text can't go on the shelf".into()),
            Ok(p) => p,
        };
        let folder = screenshots_folder().ok_or("no Pictures folder")?;
        let copied = UNIX_EPOCH + Duration::from_millis(view.copied_at);
        let size = view.width.zip(view.height).unwrap_or_default();
        if view.screenshot
            && let Some(saved) = os::saved_screenshot(&folder, copied, size)
        {
            return Ok(vec![saved.to_string_lossy().to_string()]);
        }
        std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
        let name = format!(
            "{} {}.png",
            i18n::t(self.hub.app(), "clipboard.fileName"),
            chrono::Local::now().format("%Y-%m-%d %H.%M.%S")
        );
        let target = folder.join(name);
        std::fs::copy(&picture, &target).map_err(|e| e.to_string())?;
        Ok(vec![target.to_string_lossy().to_string()])
    }

    fn text(&self, id: u64) -> Result<String, String> {
        self.find(id, |e| match &e.content {
            Content::Text(t) => Ok(t.clone()),
            _ => Err("not text".to_string()),
        })?
    }
}

fn delete_file(entry: Entry) {
    if let Content::Picture { path, .. } = entry.content {
        let _ = std::fs::remove_file(path);
    }
}

/// One line: whitespace runs collapsed, at most `PREVIEW_CHARS` characters.
fn preview(text: &str) -> String {
    let mut out = String::new();
    for word in text.split_whitespace() {
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(word);
        if out.chars().count() >= PREVIEW_CHARS {
            return out.chars().take(PREVIEW_CHARS).collect();
        }
    }
    out
}

fn thumb_url(picture: &Picture) -> Option<String> {
    let png = image::encode_png(&image::thumbnail(picture, THUMB_SIDE)).ok()?;
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
}

/// `Pictures\Screenshots` (where Windows saves screenshots).
fn screenshots_folder() -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Pictures, FOLDERID_Screenshots, KF_FLAG_DEFAULT, SHGetKnownFolderPath};
    let known = |id| unsafe {
        let path = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
        let out = path.to_string().ok().map(PathBuf::from);
        CoTaskMemFree(Some(path.0 as *const _));
        out
    };
    known(&FOLDERID_Screenshots).or_else(|| known(&FOLDERID_Pictures).map(|p| p.join("Screenshots")))
}

fn watch(ctx: Arc<Ctx>) {
    // `None`: nothing read since start (or since the module was turned on);
    // what's on the clipboard then is listed without the "copied" pill.
    let mut seen: Option<u32> = None;
    let mut failures = 0;
    loop {
        std::thread::sleep(POLL);
        if !ctx.enabled() {
            if ctx.clear() {
                ctx.publish();
            }
            seen = None;
            continue;
        }
        let seq = unsafe { GetClipboardSequenceNumber() };
        if seen == Some(seq) {
            continue;
        }
        std::thread::sleep(SETTLE);
        if unsafe { GetClipboardSequenceNumber() } != seq {
            continue;
        }
        let first = seen.is_none();
        match os::read() {
            Ok(copied) => {
                seen = Some(seq);
                failures = 0;
                if let Some(copied) = copied {
                    let quiet = first || copied.own;
                    ctx.add(copied, quiet);
                }
            }
            Err(e) => {
                failures += 1;
                if failures >= READ_ATTEMPTS {
                    log::debug!("clipboard: {e}");
                    seen = Some(seq);
                    failures = 0;
                }
            }
        }
    }
}

#[derive(Default)]
pub struct ClipboardProvider {
    ctx: Mutex<Option<Arc<Ctx>>>,
}

impl Provider for ClipboardProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let dir = hub.app().path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir()).join("clipboard");
        // Pictures from the previous run.
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::create_dir_all(&dir);
        let ctx = Arc::new(Ctx { hub, dir, entries: Mutex::default(), next_id: AtomicU64::new(1) });
        *self.ctx.lock().unwrap() = Some(ctx.clone());
        ctx.publish();
        std::thread::spawn(move || watch(ctx));
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        let ctx = self.ctx.lock().unwrap().clone().ok_or("clipboard not started")?;
        let id = || payload.as_u64().ok_or_else(|| "missing item id".to_string());
        match action {
            "copy" => ctx.copy(id()?)?,
            "remove" => ctx.remove(id()?),
            "clear" => {
                ctx.clear();
                ctx.publish();
            }
            // Drag a picture or files out to any app.
            "drag" => crate::providers::shelf::start_drag(ctx.hub.app(), ctx.paths(id()?)?),
            "open" => {
                if let Some(path) = ctx.paths(id()?)?.first() {
                    crate::settings::open_url(&path.to_string_lossy());
                }
            }
            "keep" => return serde_json::to_value(ctx.keep(id()?)?).map_err(|e| e.to_string()),
            // The whole text (the list only carries a preview).
            "text" => return Ok(Value::String(ctx.text(id()?)?)),
            _ => return Err(format!("{ID}: unknown action '{action}'")),
        }
        Ok(Value::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn previews() {
        assert_eq!(preview("  hello \n\n  world\t!  "), "hello world !");
        let long = "word ".repeat(200);
        assert_eq!(preview(&long).chars().count(), PREVIEW_CHARS);
    }
}
