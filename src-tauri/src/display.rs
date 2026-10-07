//! Which monitor the island lives on.
//!
//! The user picks either the primary monitor (the default, following Windows'
//! own setting) or a fixed one. Optionally the island also leaves a monitor
//! taken by a fullscreen app (where it would otherwise hide), for another one
//! that's free. A background thread re-evaluates this a few times per
//! second, which also catches monitors being plugged in or out and changes of
//! resolution, scale or primary monitor.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::window::{ISLAND_LABEL, STRIP_HEIGHT};

/// `"primary"` or the id of a monitor from [`list_monitors`].
pub const MONITOR_KEY: &str = "island.monitor";
pub const AVOID_MAXIMIZED_KEY: &str = "island.avoidMaximized";
const PRIMARY: &str = "primary";

/// A monitor as the settings page shows it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    /// Stable id (the monitor's device path, so it survives reboots and
    /// `DISPLAYn` renumbering), falling back to the GDI name.
    id: String,
    /// The model's name from its EDID, when Windows knows it.
    name: Option<String>,
    width: u32,
    height: u32,
    primary: bool,
}

struct Screen {
    id: String,
    name: Option<String>,
    primary: bool,
    monitor: Monitor,
}

fn screens(win: &WebviewWindow) -> Vec<Screen> {
    let primary = win.primary_monitor().ok().flatten().and_then(|m| m.name().cloned());
    let names = display_names();
    win.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|monitor| {
            let gdi = monitor.name().cloned().unwrap_or_default();
            let (id, name) = match names.iter().find(|n| n.gdi == gdi) {
                Some(n) => (n.path.clone().unwrap_or_else(|| gdi.clone()), n.friendly.clone()),
                None => (gdi.clone(), None),
            };
            Screen {
                primary: primary.as_ref() == Some(&gdi),
                id,
                name,
                monitor,
            }
        })
        .collect()
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Vec<MonitorInfo> {
    let Some(win) = app.get_webview_window(ISLAND_LABEL) else {
        return Vec::new();
    };
    screens(&win)
        .into_iter()
        .map(|s| MonitorInfo {
            width: s.monitor.size().width,
            height: s.monitor.size().height,
            id: s.id,
            name: s.name,
            primary: s.primary,
        })
        .collect()
}

/// The monitor the island should be on right now.
fn target(app: &AppHandle, win: &WebviewWindow) -> Option<Monitor> {
    let settings = app.state::<crate::settings::Settings>();
    let wanted = match settings.get(MONITOR_KEY) {
        Some(Value::String(id)) => id,
        _ => PRIMARY.to_string(),
    };
    let avoid = matches!(settings.get(AVOID_MAXIMIZED_KEY), Some(Value::Bool(true)));

    let mut screens = screens(win);
    // A fixed monitor that's unplugged falls back to the primary one.
    let preferred = screens
        .iter()
        .position(|s| wanted != PRIMARY && s.id == wanted)
        .or_else(|| screens.iter().position(|s| s.primary))
        .or_else(|| (!screens.is_empty()).then_some(0))?;

    if avoid && screens.len() > 1 {
        let covered = covered_monitors(app);
        let is_covered = |m: &Monitor| covered.contains(&(m.position().x, m.position().y));
        if is_covered(&screens[preferred].monitor) {
            // The primary monitor first, then in Windows' order. When every
            // monitor is covered the island stays on the preferred one.
            let free = screens
                .iter()
                .enumerate()
                .filter(|(i, s)| *i != preferred && !is_covered(&s.monitor))
                .min_by_key(|(i, s)| (!s.primary, *i))
                .map(|(i, _)| i);
            if let Some(i) = free {
                return Some(screens.swap_remove(i).monitor);
            }
        }
    }
    Some(screens.swap_remove(preferred).monitor)
}

/// Window rect (physical px) that stretches the strip across `monitor`'s top.
fn strip_rect(monitor: &Monitor) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    let height = (STRIP_HEIGHT * monitor.scale_factor()).round() as u32;
    (*monitor.position(), PhysicalSize::new(monitor.size().width, height))
}

fn apply(win: &WebviewWindow, monitor: &Monitor) -> tauri::Result<()> {
    let (position, size) = strip_rect(monitor);
    // Position first: crossing to a monitor with another scale makes Windows
    // resize the window on its own, and the size below then fixes it up.
    win.set_position(position)?;
    win.set_size(size)
}

/// Put the island on its monitor now (startup, tray "Recenter").
pub fn place(win: &WebviewWindow) -> tauri::Result<()> {
    match target(win.app_handle(), win) {
        Some(monitor) => apply(win, &monitor),
        None => Ok(()),
    }
}

/// Follows setting, monitor and (optionally) maximized-window changes.
pub fn spawn_placement(app: AppHandle) {
    std::thread::spawn(move || {
        // A new target must hold for two checks in a row, so dragging a window
        // across monitors or a quick maximize/restore doesn't bounce the island.
        let mut pending: Option<(PhysicalPosition<i32>, PhysicalSize<u32>)> = None;
        loop {
            std::thread::sleep(Duration::from_millis(400));
            let Some(win) = app.get_webview_window(ISLAND_LABEL) else {
                continue;
            };
            // Never pull the island away from under the cursor.
            if crate::window::is_interacting(&app) {
                pending = None;
                continue;
            }
            let Some(monitor) = target(&app, &win) else {
                continue;
            };
            let rect = strip_rect(&monitor);
            let (Ok(position), Ok(size)) = (win.outer_position(), win.outer_size()) else {
                continue;
            };
            if (position, size) == rect {
                pending = None;
                continue;
            }
            if pending == Some(rect) {
                pending = None;
                let _ = apply(&win, &monitor);
            } else {
                pending = Some(rect);
            }
        }
    });
}

struct DisplayName {
    /// `\\.\DISPLAY1`, what `Monitor::name` returns.
    gdi: String,
    friendly: Option<String>,
    path: Option<String>,
}

fn from_wide(s: &[u16]) -> String {
    let len = s.iter().position(|&c| c == 0).unwrap_or(s.len());
    String::from_utf16_lossy(&s[..len])
}

/// Model names and device paths of the active displays.
#[cfg(windows)]
fn display_names() -> Vec<DisplayName> {
    use windows::Win32::Devices::Display::{
        DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME,
        DISPLAYCONFIG_DEVICE_INFO_HEADER, DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO,
        DISPLAYCONFIG_SOURCE_DEVICE_NAME, DISPLAYCONFIG_TARGET_DEVICE_NAME, DisplayConfigGetDeviceInfo,
        GetDisplayConfigBufferSizes, QDC_ONLY_ACTIVE_PATHS, QueryDisplayConfig,
    };
    use windows::Win32::Foundation::ERROR_SUCCESS;

    unsafe {
        let (mut path_count, mut mode_count) = (0u32, 0u32);
        if GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut path_count, &mut mode_count) != ERROR_SUCCESS {
            return Vec::new();
        }
        let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); path_count as usize];
        let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); mode_count as usize];
        if QueryDisplayConfig(
            QDC_ONLY_ACTIVE_PATHS,
            &mut path_count,
            paths.as_mut_ptr(),
            &mut mode_count,
            modes.as_mut_ptr(),
            None,
        ) != ERROR_SUCCESS
        {
            return Vec::new();
        }
        paths.truncate(path_count as usize);

        let mut out = Vec::new();
        for path in &paths {
            let mut source = DISPLAYCONFIG_SOURCE_DEVICE_NAME {
                header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
                    r#type: DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
                    size: size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32,
                    adapterId: path.sourceInfo.adapterId,
                    id: path.sourceInfo.id,
                },
                ..Default::default()
            };
            if DisplayConfigGetDeviceInfo(&mut source.header) != 0 {
                continue;
            }
            let gdi = from_wide(&source.viewGdiDeviceName);
            // Mirrored displays share a source: the first target names it.
            if out.iter().any(|n: &DisplayName| n.gdi == gdi) {
                continue;
            }

            let mut target = DISPLAYCONFIG_TARGET_DEVICE_NAME {
                header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
                    r#type: DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME,
                    size: size_of::<DISPLAYCONFIG_TARGET_DEVICE_NAME>() as u32,
                    adapterId: path.targetInfo.adapterId,
                    id: path.targetInfo.id,
                },
                ..Default::default()
            };
            let (friendly, device) = if DisplayConfigGetDeviceInfo(&mut target.header) == 0 {
                let friendly = from_wide(&target.monitorFriendlyDeviceName);
                let device = from_wide(&target.monitorDevicePath);
                (
                    (!friendly.is_empty()).then_some(friendly),
                    (!device.is_empty()).then_some(device),
                )
            } else {
                (None, None)
            };
            out.push(DisplayName { gdi, friendly, path: device });
        }
        out
    }
}

#[cfg(not(windows))]
fn display_names() -> Vec<DisplayName> {
    Vec::new()
}

/// Top-left corners (physical px) of the monitors that have a fullscreen app
/// (game, video, F11 browser, presentation) on them — the same apps that make
/// the island hide. Maximized windows don't count: they overhang the screen by
/// their resize borders or stop at the taskbar, so their rect never matches
/// the monitor exactly.
#[cfg(windows)]
fn covered_monitors(app: &AppHandle) -> Vec<(i32, i32)> {
    use windows::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Dwm::{DWMWA_CLOAKED, DwmGetWindowAttribute};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MONITOR_DEFAULTTONULL, MONITORINFO, MonitorFromWindow};
    use windows::Win32::UI::Shell::{
        QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN, SHQueryUserNotificationState,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GWL_EXSTYLE, GetClassNameW, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect, IsIconic,
        IsWindowVisible, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
    };
    use windows::core::BOOL;

    struct Ctx {
        ours: Vec<isize>,
        /// Foreground window, when Windows reports a D3D fullscreen game or a
        /// presentation (its rect may not match the monitor exactly).
        busy_fg: Option<isize>,
        covered: Vec<(i32, i32)>,
    }

    unsafe extern "system" fn visit(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = unsafe { &mut *(lparam.0 as *mut Ctx) };
        unsafe {
            if ctx.ours.contains(&(hwnd.0 as isize)) || !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
                return true.into();
            }
            // Overlays, tool palettes and click-through layers aren't apps.
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
            if ex & (WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0 | WS_EX_TRANSPARENT.0) != 0 {
                return true.into();
            }
            // Windows on other virtual desktops (and suspended UWP frames) are cloaked.
            let mut cloaked = 0u32;
            if DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, (&raw mut cloaked).cast(), size_of::<u32>() as u32).is_ok()
                && cloaked != 0
            {
                return true.into();
            }
            let mut class = [0u16; 64];
            let len = GetClassNameW(hwnd, &mut class) as usize;
            let class = String::from_utf16_lossy(&class[..len]);
            if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
                return true.into();
            }

            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONULL);
            if monitor.is_invalid() {
                return true.into();
            }
            let mut info = MONITORINFO {
                cbSize: size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return true.into();
            }
            let m = info.rcMonitor;
            let corner = (m.left, m.top);
            if ctx.covered.contains(&corner) {
                return true.into();
            }
            let mut rect = RECT::default();
            let fullscreen = ctx.busy_fg == Some(hwnd.0 as isize)
                || (GetWindowRect(hwnd, &mut rect).is_ok()
                    && rect.left == m.left
                    && rect.top == m.top
                    && rect.right == m.right
                    && rect.bottom == m.bottom);
            if fullscreen {
                ctx.covered.push(corner);
            }
        }
        true.into()
    }

    let mut ctx = Ctx {
        ours: app
            .webview_windows()
            .values()
            .filter_map(|w| w.hwnd().ok().map(|h| h.0 as isize))
            .collect(),
        busy_fg: unsafe {
            let fg = GetForegroundWindow();
            let busy = SHQueryUserNotificationState().is_ok_and(|state| {
                state == QUNS_BUSY || state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE
            });
            (busy && !fg.is_invalid()).then_some(fg.0 as isize)
        },
        covered: Vec::new(),
    };
    unsafe {
        let _ = EnumWindows(Some(visit), LPARAM(&raw mut ctx as isize));
    }
    ctx.covered
}

#[cfg(not(windows))]
fn covered_monitors(_: &AppHandle) -> Vec<(i32, i32)> {
    Vec::new()
}
