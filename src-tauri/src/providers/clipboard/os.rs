//! Win32 clipboard access: what was just copied (and by which app), and
//! putting an item back.

use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;

use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL, HWND, POINT};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardOwner, IsClipboardFormatAvailable, OpenClipboard,
    RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::System::Ole::{CF_DIB, CF_HDROP, CF_UNICODETEXT};
use windows::Win32::UI::Shell::{DragQueryFileW, DROPFILES, HDROP};
use windows::core::{BOOL, HSTRING};

use super::image::{self, Picture};
use crate::providers::process;

/// Bigger texts aren't kept (a whole log file, a database dump…).
const MAX_TEXT_CHARS: usize = 1_000_000;
/// Apps whose pictures are screenshots (lowercase exe names).
const SCREENSHOT_TOOLS: &[&str] = &[
    "snippingtool",
    "screenclippinghost",
    "screensketch",
    "sharex",
    "greenshot",
    "lightshot",
    "flameshot",
    "picpick",
    "snagit32",
    "snagiteditor",
];

pub enum Clip {
    Text(String),
    Picture(Picture),
    Files(Vec<PathBuf>),
}

pub struct Copied {
    pub clip: Clip,
    /// Display name of the app that copied it.
    pub source: Option<String>,
    pub screenshot: bool,
    /// Put there by the island itself (an item copied back from the history).
    pub own: bool,
}

struct Formats {
    /// Password managers mark secrets with these so history tools skip them.
    exclude: u32,
    viewer_ignore: u32,
    can_include_in_history: u32,
    png: u32,
    drop_effect: u32,
}

fn formats() -> &'static Formats {
    static FORMATS: OnceLock<Formats> = OnceLock::new();
    FORMATS.get_or_init(|| {
        let register = |name: &str| unsafe { RegisterClipboardFormatW(&HSTRING::from(name)) };
        Formats {
            exclude: register("ExcludeClipboardContentFromMonitorProcessing"),
            viewer_ignore: register("Clipboard Viewer Ignore"),
            can_include_in_history: register("CanIncludeInClipboardHistory"),
            png: register("PNG"),
            drop_effect: register("Preferred DropEffect"),
        }
    })
}

fn available(format: u32) -> bool {
    format != 0 && unsafe { IsClipboardFormatAvailable(format).is_ok() }
}

/// Open clipboard, closed on drop. Another app may hold it for a moment.
struct Open;

impl Open {
    fn new(owner: Option<HWND>) -> Result<Self, String> {
        for attempt in 0..8 {
            if unsafe { OpenClipboard(owner) }.is_ok() {
                return Ok(Open);
            }
            std::thread::sleep(Duration::from_millis(20 + attempt * 15));
        }
        Err("clipboard busy".into())
    }
}

impl Drop for Open {
    fn drop(&mut self) {
        let _ = unsafe { CloseClipboard() };
    }
}

/// Bytes of a clipboard format (clipboard must be open).
fn bytes(format: u32) -> Option<Vec<u8>> {
    unsafe {
        let handle = GetClipboardData(format).ok()?;
        let global = HGLOBAL(handle.0);
        let ptr = GlobalLock(global) as *const u8;
        if ptr.is_null() {
            return None;
        }
        let data = std::slice::from_raw_parts(ptr, GlobalSize(global)).to_vec();
        let _ = GlobalUnlock(global);
        Some(data)
    }
}

/// What's on the clipboard now, or `None` for nothing to keep (empty, a
/// password, a format we don't show).
pub fn read() -> Result<Option<Copied>, String> {
    let f = formats();
    if available(f.exclude) || available(f.viewer_ignore) {
        return Ok(None);
    }
    let owner = unsafe { GetClipboardOwner() }.ok().filter(|h| !h.is_invalid()).and_then(process::window_pid);
    let own = owner == Some(std::process::id());
    let exe = owner.and_then(process::exe_path);
    let tool = exe.as_deref().is_some_and(|p| SCREENSHOT_TOOLS.contains(&process::exe_stem(p).as_str()));

    let _open = Open::new(None)?;
    if available(f.can_include_in_history)
        && bytes(f.can_include_in_history).is_some_and(|b| b.get(..4) == Some(&[0, 0, 0, 0]))
    {
        return Ok(None);
    }

    let text = || {
        let data = bytes(CF_UNICODETEXT.0 as u32)?;
        let wide: Vec<u16> = data.as_chunks::<2>().0.iter().map(|c| u16::from_le_bytes(*c)).collect();
        let end = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
        let text = String::from_utf16_lossy(&wide[..end]);
        (!text.trim().is_empty() && text.chars().count() <= MAX_TEXT_CHARS).then_some(text)
    };
    let picture = || bytes(CF_DIB.0 as u32).and_then(|b| image::from_dib(&b));

    // Files first (Explorer also offers their names as text); text beats the
    // picture some apps add next to it (Excel cells, Word), except from
    // screenshot tools.
    let clip = if available(CF_HDROP.0 as u32) {
        files().map(Clip::Files)
    } else if available(CF_UNICODETEXT.0 as u32) && !tool {
        text().map(Clip::Text)
    } else if available(CF_DIB.0 as u32) {
        picture().map(Clip::Picture)
    } else {
        None
    };
    let Some(clip) = clip else { return Ok(None) };
    // A picture without an owner comes from the Print Screen key.
    let screenshot = matches!(clip, Clip::Picture(_)) && (tool || owner.is_none());
    let source = exe.as_deref().map(process::app_name);
    Ok(Some(Copied { clip, source, screenshot, own }))
}

fn files() -> Option<Vec<PathBuf>> {
    unsafe {
        let handle = GetClipboardData(CF_HDROP.0 as u32).ok()?;
        let drop = HDROP(handle.0);
        let count = DragQueryFileW(drop, u32::MAX, None);
        let mut out = Vec::new();
        for i in 0..count {
            let len = DragQueryFileW(drop, i, None) as usize;
            let mut buf = vec![0u16; len + 1];
            DragQueryFileW(drop, i, Some(&mut buf));
            out.push(PathBuf::from(String::from_utf16_lossy(&buf[..len])));
        }
        (!out.is_empty()).then_some(out)
    }
}

pub enum Payload<'a> {
    Text(&'a str),
    Picture { picture: &'a Picture, png: &'a [u8] },
    Files(&'a [PathBuf]),
}

/// Replaces the clipboard's content. `owner` must be one of our windows:
/// with no owner, Windows refuses the data.
pub fn write(owner: HWND, payload: Payload) -> Result<(), String> {
    let f = formats();
    let _open = Open::new(Some(owner))?;
    unsafe { EmptyClipboard() }.map_err(|e| e.to_string())?;
    match payload {
        Payload::Text(text) => {
            let bytes: Vec<u8> = text.encode_utf16().chain([0]).flat_map(u16::to_le_bytes).collect();
            set(CF_UNICODETEXT.0 as u32, &bytes)
        }
        Payload::Picture { picture, png } => {
            set(CF_DIB.0 as u32, &image::to_dib(picture))?;
            // Keeps transparency for the apps that read it.
            set(f.png, png)
        }
        Payload::Files(paths) => {
            set(CF_HDROP.0 as u32, &drop_files(paths))?;
            // Pasting in Explorer copies (instead of moving) the files.
            set(f.drop_effect, &1u32.to_le_bytes())
        }
    }
}

fn set(format: u32, bytes: &[u8]) -> Result<(), String> {
    unsafe {
        let global = GlobalAlloc(GMEM_MOVEABLE, bytes.len()).map_err(|e| e.to_string())?;
        let ptr = GlobalLock(global) as *mut u8;
        if ptr.is_null() {
            let _ = GlobalFree(Some(global));
            return Err("GlobalLock failed".into());
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len());
        let _ = GlobalUnlock(global);
        // On success the clipboard owns the memory.
        if let Err(e) = SetClipboardData(format, Some(HANDLE(global.0))) {
            let _ = GlobalFree(Some(global));
            return Err(e.to_string());
        }
        Ok(())
    }
}

/// `CF_HDROP` payload: a `DROPFILES` header and a double-null-terminated list.
fn drop_files(paths: &[PathBuf]) -> Vec<u8> {
    let header = DROPFILES {
        pFiles: std::mem::size_of::<DROPFILES>() as u32,
        pt: POINT::default(),
        fNC: BOOL(0),
        fWide: BOOL(1),
    };
    let mut out = unsafe {
        std::slice::from_raw_parts(&header as *const DROPFILES as *const u8, std::mem::size_of::<DROPFILES>()).to_vec()
    };
    for path in paths {
        out.extend(path.as_os_str().encode_wide().flat_map(u16::to_le_bytes));
        out.extend_from_slice(&[0, 0]);
    }
    out.extend_from_slice(&[0, 0]);
    out
}

/// The file Windows' Snipping Tool saved for this screenshot, if it did:
/// a PNG in the Screenshots folder from around `at` with the same size.
pub fn saved_screenshot(folder: &Path, at: std::time::SystemTime, size: (u32, u32)) -> Option<PathBuf> {
    let window = Duration::from_secs(20);
    std::fs::read_dir(folder)
        .ok()?
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("png")))
        .filter(|e| {
            e.metadata().and_then(|m| m.modified()).is_ok_and(|t| {
                t.duration_since(at).or_else(|_| at.duration_since(t)).is_ok_and(|d| d <= window)
            })
        })
        .map(|e| e.path())
        .find(|p| {
            std::fs::File::open(p).ok().and_then(|mut f| {
                use std::io::Read;
                let mut head = [0u8; 24];
                f.read_exact(&mut head).ok()?;
                image::png_size(&head)
            }) == Some(size)
        })
}
