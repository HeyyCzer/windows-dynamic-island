//! Island window placement and click-through handling.
//!
//! The window is a fixed-size transparent overlay pinned to the top-center of
//! the primary monitor. Everything outside the island shape must let clicks
//! pass through to the apps below, so the window ignores cursor events by
//! default and a background thread turns them back on only while the cursor
//! is inside one of the rects reported by the frontend.

use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow};

pub const ISLAND_LABEL: &str = "island";
pub const HOVER_EVENT: &str = "island://hover";
pub const FULLSCREEN_EVENT: &str = "island://fullscreen";

#[tauri::command]
pub fn is_fullscreen_active(app: AppHandle) -> bool {
    app.get_webview_window(ISLAND_LABEL)
        .map(|w| fullscreen_app_active(&w))
        .unwrap_or(false)
}

/// Rect in CSS pixels relative to the window's top-left corner.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Default)]
pub struct HitState(pub Mutex<Vec<HitRect>>);

#[tauri::command]
pub fn set_hit_rects(state: tauri::State<HitState>, rects: Vec<HitRect>) {
    *state.0.lock().unwrap() = rects;
}

pub fn position_top_center(win: &WebviewWindow) -> tauri::Result<()> {
    let monitor = match win.primary_monitor()? {
        Some(m) => Some(m),
        None => win.current_monitor()?,
    };
    if let Some(monitor) = monitor {
        let size = win.outer_size()?;
        let origin = monitor.position();
        let x = origin.x + (monitor.size().width as i32 - size.width as i32) / 2;
        win.set_position(PhysicalPosition::new(x, origin.y))?;
    }
    Ok(())
}

pub fn spawn_hit_test(app: AppHandle) {
    std::thread::spawn(move || {
        let mut ignoring: Option<bool> = None;
        let mut hovering = false;
        let mut fullscreen = false;
        let mut tick = 0u32;
        loop {
            std::thread::sleep(Duration::from_millis(25));
            let Some(win) = app.get_webview_window(ISLAND_LABEL) else {
                continue;
            };

            // Fullscreen check is cheaper to run a few times per second.
            if tick % 12 == 0 {
                let fs = fullscreen_app_active(&win);
                if fs != fullscreen {
                    fullscreen = fs;
                    let _ = app.emit(FULLSCREEN_EVENT, fs);
                }
            }
            tick = tick.wrapping_add(1);

            let inside = !fullscreen && cursor_inside(&app, &win);

            let ignore = !inside;
            if ignoring != Some(ignore) && win.set_ignore_cursor_events(ignore).is_ok() {
                ignoring = Some(ignore);
            }
            if inside != hovering {
                hovering = inside;
                let _ = app.emit(HOVER_EVENT, inside);
            }
        }
    });
}

fn cursor_inside(app: &AppHandle, win: &WebviewWindow) -> bool {
    let Some((cx, cy)) = cursor_pos() else {
        return false;
    };
    let (Ok(origin), Ok(scale)) = (win.outer_position(), win.scale_factor()) else {
        return false;
    };
    let rects = app.state::<HitState>();
    let rects = rects.0.lock().unwrap();
    rects.iter().any(|r| {
        let left = origin.x as f64 + r.x * scale;
        let top = origin.y as f64 + r.y * scale;
        cx >= left && cx <= left + r.width * scale && cy >= top && cy <= top + r.height * scale
    })
}

#[cfg(windows)]
fn cursor_pos() -> Option<(f64, f64)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some((p.x as f64, p.y as f64))
}

#[cfg(not(windows))]
fn cursor_pos() -> Option<(f64, f64)> {
    None
}

/// True when the foreground window covers the island's whole monitor without
/// being maximized (games, videos, presentations in fullscreen).
#[cfg(windows)]
fn fullscreen_app_active(island: &WebviewWindow) -> bool {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect, IsZoomed};

    unsafe {
        let fg = GetForegroundWindow();
        if fg.is_invalid() {
            return false;
        }
        let island_hwnd = island.hwnd().map(|h| h.0).unwrap_or(std::ptr::null_mut());
        if fg.0 == island_hwnd || IsZoomed(fg).as_bool() {
            return false;
        }

        // The desktop and shell windows span the whole screen too.
        let mut class = [0u16; 64];
        let len = GetClassNameW(fg, &mut class) as usize;
        let class = String::from_utf16_lossy(&class[..len]);
        if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
            return false;
        }

        let fg_monitor = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
        let island_monitor = MonitorFromWindow(HWND(island_hwnd), MONITOR_DEFAULTTONEAREST);
        if fg_monitor != island_monitor {
            return false;
        }

        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(fg_monitor, &mut info).as_bool() {
            return false;
        }
        let mut rect = RECT::default();
        if GetWindowRect(fg, &mut rect).is_err() {
            return false;
        }
        let m = info.rcMonitor;
        rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom
    }
}

#[cfg(not(windows))]
fn fullscreen_app_active(_: &WebviewWindow) -> bool {
    false
}
