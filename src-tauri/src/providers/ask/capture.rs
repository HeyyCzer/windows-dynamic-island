//! Screenshots for "ask about the screen": the window you were using (or the
//! monitor under the cursor), saved as a PNG the chat can attach.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetWindowRect, GetWindowTextW, IsIconic, IsWindowVisible};

use crate::screen::{self, Image};

/// Longest side sent to Claude: a 4K screenshot would cost a fortune in tokens.
const MAX_SIDE: u32 = 1600;
/// `PW_RENDERFULLCONTENT`: also captures DirectComposition content (browsers).
const PW_RENDERFULLCONTENT: u32 = 2;

pub struct Shot {
    pub path: PathBuf,
    /// Window title, or `None` for the whole screen.
    pub title: Option<String>,
}

/// Captures `hwnd` (or, if it can't, the monitor under the cursor) into `folder`.
pub fn capture(hwnd: Option<HWND>, folder: &Path) -> Option<Shot> {
    std::fs::create_dir_all(folder).ok()?;
    delete_old(folder);
    let path = folder.join(format!("shot-{}.png", chrono::Local::now().format("%Y%m%d-%H%M%S")));

    let window = hwnd.filter(|&h| unsafe { IsWindowVisible(h).as_bool() && !IsIconic(h).as_bool() });
    let (image, title) = match window.and_then(capture_window) {
        Some(image) => (image, window.map(window_title).filter(|t| !t.is_empty())),
        None => (capture_monitor()?, None),
    };
    save_png(&image, &path).ok()?;
    Some(Shot { path, title })
}

fn capture_window(hwnd: HWND) -> Option<Image> {
    unsafe {
        let mut window = RECT::default();
        GetWindowRect(hwnd, &mut window).ok()?;
        // The visible frame, without Windows 10/11's invisible resize borders.
        let mut frame = RECT::default();
        let frame = if DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut frame as *mut RECT as *mut _,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_ok()
            && frame.right > frame.left
        {
            frame
        } else {
            window
        };
        let (w, h) = (window.right - window.left, window.bottom - window.top);
        if w <= 0 || h <= 0 {
            return None;
        }

        // PrintWindow draws the window itself, even if something (like the island) covers it.
        let printed = screen::grab(w, h, |dc| PrintWindow(hwnd, dc, PRINT_WINDOW_FLAGS(PW_RENDERFULLCONTENT)).as_bool());
        let (x, y) = (frame.left - window.left, frame.top - window.top);
        if let Some(full) = printed
            && let Some(image) = full.crop(x, y, frame.right - frame.left, frame.bottom - frame.top)
            && !is_blank(&image)
        {
            return Some(image);
        }
        // Some apps (games, protected video) draw nothing for PrintWindow: copy the screen instead.
        screen::area(frame)
    }
}

fn capture_monitor() -> Option<Image> {
    unsafe {
        let mut cursor = POINT::default();
        GetCursorPos(&mut cursor).ok()?;
        let monitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return None;
        }
        screen::area(info.rcMonitor)
    }
}

/// All one color (typically black): the window didn't draw into PrintWindow.
fn is_blank(image: &Image) -> bool {
    let pixel = |x: u32, y: u32| {
        let i = ((y * image.height / 12).min(image.height - 1) * image.width + (x * image.width / 12).min(image.width - 1))
            as usize
            * 4;
        [image.bgra[i], image.bgra[i + 1], image.bgra[i + 2]]
    };
    let first = pixel(0, 0);
    (0..12).all(|y| (0..12).all(|x| pixel(x, y) == first))
}

/// RGB PNG, scaled down (area average) so the longest side is at most `MAX_SIDE`.
fn save_png(image: &Image, path: &Path) -> Result<(), String> {
    let scale = (MAX_SIDE as f64 / image.width.max(image.height) as f64).min(1.0);
    let (w, h) = (
        ((image.width as f64 * scale).round() as u32).max(1),
        ((image.height as f64 * scale).round() as u32).max(1),
    );
    let mut rgb = Vec::with_capacity((w * h * 3) as usize);
    for oy in 0..h {
        let y0 = oy * image.height / h;
        let y1 = ((oy + 1) * image.height / h).max(y0 + 1);
        for ox in 0..w {
            let x0 = ox * image.width / w;
            let x1 = ((ox + 1) * image.width / w).max(x0 + 1);
            let mut sum = [0u32; 3];
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = ((y * image.width + x) * 4) as usize;
                    sum[0] += image.bgra[i + 2] as u32;
                    sum[1] += image.bgra[i + 1] as u32;
                    sum[2] += image.bgra[i] as u32;
                }
            }
            let n = (y1 - y0) * (x1 - x0);
            rgb.extend(sum.iter().map(|s| (s / n) as u8));
        }
    }

    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut encoder = png::Encoder::new(std::io::BufWriter::new(file), w, h);
    encoder.set_color(png::ColorType::Rgb);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&rgb).map_err(|e| e.to_string())
}

fn window_title(hwnd: HWND) -> String {
    let mut buf = [0u16; 256];
    let len = unsafe { GetWindowTextW(hwnd, &mut buf) } as usize;
    String::from_utf16_lossy(&buf[..len.min(buf.len())])
}

/// Screenshots only matter for the conversation at hand: keep a day's worth.
fn delete_old(folder: &Path) {
    let Ok(entries) = std::fs::read_dir(folder) else { return };
    let cutoff = SystemTime::now() - Duration::from_secs(24 * 3600);
    for entry in entries.flatten() {
        let old = entry.metadata().and_then(|m| m.modified()).is_ok_and(|t| t < cutoff);
        if old && entry.file_name().to_string_lossy().starts_with("shot-") {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}
