//! Island window placement and click-through handling.
//!
//! The window is a transparent overlay strip spanning the full width of a
//! monitor's top edge (which one: see `display.rs`), so the island can be dragged left/right inside
//! it. Everything outside the island shape must let clicks
//! pass through to the apps below, so the window ignores cursor events by
//! default and a background thread turns them back on only while the cursor
//! is inside one of the rects reported by the frontend.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

pub const ISLAND_LABEL: &str = "island";
pub const HOVER_EVENT: &str = "island://hover";
pub const FULLSCREEN_EVENT: &str = "island://fullscreen";
/// Tray "Recenter": the frontend snaps the island back to the middle.
pub const RECENTER_EVENT: &str = "island://recenter";

/// Strip height in logical pixels (fits the tallest expanded panel + shadow).
pub const STRIP_HEIGHT: f64 = 480.0;

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
    allow_activation();
    win.set_focus().map_err(|e| e.to_string())
}

/// Until when (`GetTickCount64`, ms) the island may become the active window.
static ACTIVATE_UNTIL: AtomicU64 = AtomicU64::new(0);
/// Long enough for the queued `set_focus` to run.
const ACTIVATE_GRACE_MS: u64 = 1000;

/// The island normally never takes the focus (see `make_overlay`); call this
/// right before activating it on purpose, to type in it.
pub fn allow_activation() {
    ACTIVATE_UNTIL.store(tick_ms() + ACTIVATE_GRACE_MS, Ordering::Relaxed);
}

#[cfg(windows)]
fn activation_allowed() -> bool {
    FILE_DRAG.load(Ordering::Relaxed) || tick_ms() < ACTIVATE_UNTIL.load(Ordering::Relaxed)
}

/// Files are being dragged in from another app. OLE refuses to drop on a
/// window that can't be activated, so meanwhile the island may be.
static FILE_DRAG: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
fn set_file_drag(win: &WebviewWindow, on: bool) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GWL_EXSTYLE, GetWindowLongW, SetWindowLongW, WS_EX_NOACTIVATE};

    FILE_DRAG.store(on, Ordering::Relaxed);
    if on {
        // WebView2 may have made new windows since the last drag: hook them too.
        let w = win.clone();
        let _ = win.run_on_main_thread(move || crate::file_drop::hook(w.app_handle(), &w));
    }
    let Ok(hwnd) = win.hwnd() else {
        return;
    };
    // The subclass puts `WS_EX_NOACTIVATE` back unless a drag is on.
    unsafe {
        let hwnd = HWND(hwnd.0);
        SetWindowLongW(hwnd, GWL_EXSTYLE, GetWindowLongW(hwnd, GWL_EXSTYLE) & !(WS_EX_NOACTIVATE.0 as i32));
    }
}

#[cfg(not(windows))]
fn set_file_drag(_: &WebviewWindow, on: bool) {
    FILE_DRAG.store(on, Ordering::Relaxed);
}

#[cfg(windows)]
fn tick_ms() -> u64 {
    unsafe { windows::Win32::System::SystemInformation::GetTickCount64() }
}

#[cfg(not(windows))]
fn tick_ms() -> u64 {
    0
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

/// Cursor over the island (as last reported by the hit-test thread).
static HOVERING: AtomicBool = AtomicBool::new(false);

/// The user is hovering or dragging the island: don't move it away.
pub fn is_interacting(app: &AppHandle) -> bool {
    HOVERING.load(Ordering::Relaxed) || app.state::<DragState>().0.load(Ordering::Relaxed)
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
        let mut file_drag = false;
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
            let dragging_in = down && !pressed_inside && (file_drag || drop_zone);
            if dragging_in != file_drag {
                file_drag = dragging_in;
                set_file_drag(&win, file_drag);
            }

            let ignore = !inside && !drop_zone;
            if ignoring != Some(ignore) && win.set_ignore_cursor_events(ignore).is_ok() {
                ignoring = Some(ignore);
            }
            if inside != hovering {
                hovering = inside;
                HOVERING.store(inside, Ordering::Relaxed);
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

/// The island is an overlay, not an app window: it must never look or act
/// like one.
///
/// tao keeps `WS_CAPTION | WS_SYSMENU` on undecorated windows and rewrites
/// the styles on every flag change (each click-through toggle). Tools that
/// draw their own caption buttons on every captioned window (e.g. macOS-style
/// "traffic lights") then put them on the island's full-width strip, right over
/// the minimize/maximize/close buttons of maximized apps. A subclass filters
/// every style change instead: no caption or system menu, and a tool window
/// (also kept out of Alt+Tab). It also keeps Windows from painting a title bar
/// over the strip.
///
/// Nor does it ever become the active window by itself: each of those flag
/// changes ends in `ShowWindow(SW_SHOW)`, which activated the island whenever
/// the pointer crossed it, and so did clicking it. That took the keyboard
/// from the app in use (and made such tools treat the strip as the active
/// window). `WS_EX_NOACTIVATE` keeps clicks from activating it, and position
/// changes lose their activation; only `allow_activation` (typing a question)
/// lets it through. Must run on the window's thread.
#[cfg(windows)]
pub fn make_overlay(win: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::SetWindowSubclass;
    use windows::Win32::UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GWL_STYLE, GetWindowLongW, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
        SetWindowLongW, SetWindowPos,
    };

    let Ok(hwnd) = win.hwnd() else {
        return;
    };
    let hwnd = HWND(hwnd.0);
    unsafe {
        if !SetWindowSubclass(hwnd, Some(overlay_proc), OVERLAY_SUBCLASS, 0).as_bool() {
            log::warn!("island: could not subclass the window");
            return;
        }
        // Rewrite the current styles through the filter.
        SetWindowLongW(hwnd, GWL_STYLE, GetWindowLongW(hwnd, GWL_STYLE));
        SetWindowLongW(hwnd, GWL_EXSTYLE, GetWindowLongW(hwnd, GWL_EXSTYLE));
        let _ = SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

#[cfg(not(windows))]
pub fn make_overlay(_: &WebviewWindow) {}

#[cfg(windows)]
const OVERLAY_SUBCLASS: usize = 0x15_1A_4D;

#[cfg(windows)]
unsafe extern "system" fn overlay_proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _id: usize,
    _data: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::{LPARAM, LRESULT};
    use windows::Win32::UI::Shell::DefSubclassProc;
    use windows::Win32::UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GWL_STYLE, STYLESTRUCT, SWP_NOACTIVATE, WINDOWPOS, WM_NCACTIVATE, WM_NCPAINT,
        WM_STYLECHANGING, WM_WINDOWPOSCHANGING, WS_CAPTION, WS_EX_APPWINDOW, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW, WS_SYSMENU,
    };

    match msg {
        // There is no frame, but `DefWindowProc` still paints a classic title bar
        // ("Dynamic Island" on a dark band) across the whole strip when the window
        // gets activated (dropping on the shelf, typing a question…).
        WM_NCPAINT => return LRESULT(0),
        // Still delivered (tao tracks focus with it); lParam -1 tells
        // `DefWindowProc` not to repaint the non-client area.
        WM_NCACTIVATE => return unsafe { DefSubclassProc(hwnd, msg, wparam, LPARAM(-1)) },
        WM_STYLECHANGING if lparam.0 != 0 => {
            let change = unsafe { &mut *(lparam.0 as *mut STYLESTRUCT) };
            let which = wparam.0 as i32;
            if which == GWL_STYLE.0 {
                change.styleNew &= !(WS_CAPTION.0 | WS_SYSMENU.0);
            } else if which == GWL_EXSTYLE.0 {
                change.styleNew = (change.styleNew | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0;
                if !FILE_DRAG.load(Ordering::Relaxed) {
                    change.styleNew |= WS_EX_NOACTIVATE.0;
                }
            }
        }
        WM_WINDOWPOSCHANGING if lparam.0 != 0 && !activation_allowed() => {
            let pos = unsafe { &mut *(lparam.0 as *mut WINDOWPOS) };
            pos.flags |= SWP_NOACTIVATE;
        }
        _ => {}
    }
    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

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
