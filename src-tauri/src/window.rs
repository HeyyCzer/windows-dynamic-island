//! Island window placement and click-through handling.
//!
//! The window is a transparent overlay strip spanning the full width of the
//! primary monitor's top edge, so the island can be dragged left/right inside
//! it. Everything outside the island shape must let clicks
//! pass through to the apps below, so the window ignores cursor events by
//! default and a background thread turns them back on only while the cursor
//! is inside one of the rects reported by the frontend.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

pub const ISLAND_LABEL: &str = "island";
pub const HOVER_EVENT: &str = "island://hover";
pub const FULLSCREEN_EVENT: &str = "island://fullscreen";
/// Tray "Recenter": the frontend snaps the island back to the middle.
pub const RECENTER_EVENT: &str = "island://recenter";

/// Strip height in logical pixels (fits the tallest expanded panel + shadow).
const STRIP_HEIGHT: f64 = 480.0;

/// The last window in front that wasn't one of ours: what "ask about the
/// screen" captures, and where focus goes back to after typing in the island.
static LAST_FOREGROUND: AtomicIsize = AtomicIsize::new(0);

#[cfg(windows)]
pub fn last_foreground() -> Option<windows::Win32::Foundation::HWND> {
    let raw = LAST_FOREGROUND.load(Ordering::Relaxed);
    (raw != 0).then_some(windows::Win32::Foundation::HWND(raw as *mut _))
}

#[cfg(windows)]
fn track_foreground(app: &AppHandle) {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let fg = unsafe { GetForegroundWindow() };
    if fg.is_invalid() {
        return;
    }
    let ours = app
        .webview_windows()
        .values()
        .any(|w| w.hwnd().is_ok_and(|h| h.0 == fg.0));
    if !ours {
        LAST_FOREGROUND.store(fg.0 as isize, Ordering::Relaxed);
    }
}

#[cfg(not(windows))]
fn track_foreground(_: &AppHandle) {}

/// Lets the island take keyboard focus (typing a question).
#[tauri::command]
pub fn focus_island(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window(ISLAND_LABEL).ok_or("no island window")?;
    win.set_focus().map_err(|e| e.to_string())
}

/// Gives the keyboard back to the app used before the island (Esc).
#[tauri::command]
pub fn restore_focus() {
    #[cfg(windows)]
    if let Some(hwnd) = last_foreground() {
        use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
        let _ = unsafe { SetForegroundWindow(hwnd) };
    }
}

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

/// While the island is being dragged the whole window takes the cursor, so
/// the drag survives the pointer leaving the island's shape.
#[derive(Default)]
pub struct DragState(pub AtomicBool);

#[tauri::command]
pub fn set_dragging(state: tauri::State<DragState>, dragging: bool) {
    state.0.store(dragging, Ordering::Relaxed);
}

/// Stretch the window across the top edge of the primary monitor.
pub fn position_top_center(win: &WebviewWindow) -> tauri::Result<()> {
    let monitor = match win.primary_monitor()? {
        Some(m) => Some(m),
        None => win.current_monitor()?,
    };
    if let Some(monitor) = monitor {
        let origin = monitor.position();
        let height = (STRIP_HEIGHT * monitor.scale_factor()).round() as u32;
        win.set_size(PhysicalSize::new(monitor.size().width, height))?;
        win.set_position(PhysicalPosition::new(origin.x, origin.y))?;
    }
    Ok(())
}

pub fn spawn_hit_test(app: AppHandle) {
    std::thread::spawn(move || {
        let mut ignoring: Option<bool> = None;
        let mut hovering = false;
        let mut fullscreen = false;
        let mut tick = 0u32;
        let mut last_fg = 0isize;
        let mut button_down = false;
        let mut pressed_inside = false;
        loop {
            std::thread::sleep(Duration::from_millis(25));
            let Some(win) = app.get_webview_window(ISLAND_LABEL) else {
                continue;
            };

            // Fullscreen check is cheaper to run a few times per second.
            let mut fullscreen_left = false;
            if tick.is_multiple_of(12) {
                let fs = fullscreen_app_active(&win);
                if fs != fullscreen {
                    fullscreen = fs;
                    fullscreen_left = !fs;
                    let _ = app.emit(FULLSCREEN_EVENT, fs);
                }
            }
            tick = tick.wrapping_add(1);
            if tick.is_multiple_of(4) {
                track_foreground(&app);
            }

            let fg = foreground_window();
            let fg_changed = fg != last_fg;
            last_fg = fg;
            if !fullscreen {
                ensure_topmost(&win, fg_changed || fullscreen_left);
            }

            let dragging = app.state::<DragState>().0.load(Ordering::Relaxed);
            let over_island = cursor_inside(&app, &win, 0.0);
            let inside = !fullscreen && (dragging || over_island);

            // A drag that started in another app (files from Explorer…). The
            // island is a thin target and the drop target must be under the
            // cursor the moment OLE looks for it, so a wider zone around the
            // island takes the cursor while the button is held. The other app
            // keeps the mouse capture, so nothing is stolen if it isn't a file.
            let down = left_button_down();
            if down && !button_down {
                pressed_inside = over_island;
            }
            button_down = down;
            let drop_zone = !fullscreen && down && !pressed_inside && cursor_inside(&app, &win, DROP_MARGIN);

            let ignore = !inside && !drop_zone;
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

/// Extra room (CSS px) around the island that accepts files dragged in.
const DROP_MARGIN: f64 = 48.0;

#[cfg(windows)]
fn left_button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000 != 0 }
}

#[cfg(not(windows))]
fn left_button_down() -> bool {
    false
}

/// Cursor over one of the frontend's rects, grown by `margin` CSS px.
fn cursor_inside(app: &AppHandle, win: &WebviewWindow, margin: f64) -> bool {
    let Some((cx, cy)) = cursor_pos() else {
        return false;
    };
    let (Ok(origin), Ok(scale)) = (win.outer_position(), win.scale_factor()) else {
        return false;
    };
    let rects = app.state::<HitState>();
    let rects = rects.0.lock().unwrap();
    rects.iter().any(|r| {
        let left = origin.x as f64 + (r.x - margin) * scale;
        let top = origin.y as f64 + (r.y - margin).max(0.0) * scale;
        let right = origin.x as f64 + (r.x + r.width + margin) * scale;
        let bottom = origin.y as f64 + (r.y + r.height + margin) * scale;
        cx >= left && cx <= right && cy >= top && cy <= bottom
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

#[cfg(windows)]
fn foreground_window() -> isize {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    unsafe { GetForegroundWindow().0 as isize }
}

#[cfg(not(windows))]
fn foreground_window() -> isize {
    0
}

/// `alwaysOnTop` is only applied once at creation, and Windows can drop the
/// island out of the topmost band afterwards (typically right after boot, when
/// autostart runs before the shell settles): it then sits under whatever app
/// gets focus until the user clicks it. Re-assert it whenever the TOPMOST bit
/// goes missing, and on `force` (foreground change) so another topmost window
/// that just got activated doesn't stay above it.
#[cfg(windows)]
fn ensure_topmost(win: &WebviewWindow, force: bool) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GetWindowLongPtrW, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE,
        SetWindowPos, WS_EX_TOPMOST,
    };

    let Ok(hwnd) = win.hwnd() else {
        return;
    };
    let hwnd = HWND(hwnd.0);
    unsafe {
        let topmost = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) & WS_EX_TOPMOST.0 as isize != 0;
        if topmost && !force {
            return;
        }
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        );
    }
}

#[cfg(not(windows))]
fn ensure_topmost(_: &WebviewWindow, _: bool) {}

/// True when a fullscreen app (game, video, F11 browser, presentation) is in
/// front on the island's monitor.
///
/// Two signals:
/// - Windows' own "busy / D3D fullscreen / presentation" state (the one that
///   silences notifications);
/// - the foreground window's rect matching the monitor *exactly*. Maximized
///   windows overhang the screen by their resize borders (~8px) or stop at the
///   taskbar, so they never match — but browsers in fullscreen stay flagged as
///   "maximized", which is why `IsZoomed` can't be used to rule them out.
#[cfg(windows)]
fn fullscreen_app_active(island: &WebviewWindow) -> bool {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect};

    unsafe {
        let fg = GetForegroundWindow();
        if fg.is_invalid() {
            return false;
        }
        let island_hwnd = island.hwnd().map(|h| h.0).unwrap_or(std::ptr::null_mut());
        if fg.0 == island_hwnd {
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

        if let Ok(state) = SHQueryUserNotificationState()
            && (state == QUNS_BUSY || state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE) {
                return true;
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
        rect.left == m.left && rect.top == m.top && rect.right == m.right && rect.bottom == m.bottom
    }
}

#[cfg(not(windows))]
fn fullscreen_app_active(_: &WebviewWindow) -> bool {
    false
}
