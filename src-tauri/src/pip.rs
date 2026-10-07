//! Picture-in-picture: the YouTube video pinned out of the island into a small
//! always-on-top window you can drag anywhere. It snaps to screen edges and
//! corners, resizes with the mouse wheel (keeping 16:9), and remembers where
//! it was left. The page itself is `src/pip/PipApp.tsx`.

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub const PIP_LABEL: &str = "pip";
pub const CHANGED_EVENT: &str = "pip://changed";

const X_KEY: &str = "pip.x";
const Y_KEY: &str = "pip.y";
const WIDTH_KEY: &str = "pip.width";
const DEFAULT_WIDTH: f64 = 400.0;
const MIN_WIDTH: f64 = 240.0;
const MAX_WIDTH: f64 = 960.0;
/// Edges closer than this (logical px) pull the window in.
const SNAP: f64 = 28.0;
const MARGIN: f64 = 16.0;

fn setting(app: &AppHandle, key: &str) -> Option<f64> {
    app.state::<crate::settings::Settings>().get(key)?.as_f64()
}

fn width(app: &AppHandle) -> f64 {
    setting(app, WIDTH_KEY).unwrap_or(DEFAULT_WIDTH).clamp(MIN_WIDTH, MAX_WIDTH)
}

#[tauri::command]
pub fn is_pip_open(app: AppHandle) -> bool {
    app.get_webview_window(PIP_LABEL).is_some()
}

#[tauri::command]
pub fn open_pip(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(PIP_LABEL) {
        return win.set_focus().map_err(|e| e.to_string());
    }
    // Building a webview from a sync command deadlocks on Windows (see settings.rs).
    std::thread::spawn(move || {
        if let Err(e) = create(&app) {
            log::error!("pip window: {e}");
        }
    });
    Ok(())
}

#[tauri::command]
pub fn close_pip(app: AppHandle) {
    if let Some(win) = app.get_webview_window(PIP_LABEL) {
        let _ = win.close();
    }
}

fn create(app: &AppHandle) -> tauri::Result<()> {
    let w = width(app);
    let win = WebviewWindowBuilder::new(app, PIP_LABEL, WebviewUrl::App("index.html".into()))
        .title("Dynamic Island — Video")
        .inner_size(w, w * 9.0 / 16.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(true)
        .focused(false)
        .visible(false)
        .background_color(tauri::webview::Color(0, 0, 0, 255))
        .build()?;

    let scale = win.scale_factor()?;
    let size = win.outer_size()?;
    let position = match (setting(app, X_KEY), setting(app, Y_KEY)) {
        (Some(x), Some(y)) => PhysicalPosition::new(x as i32, y as i32),
        // Bottom-right corner of the primary screen's work area.
        _ => match win.primary_monitor()? {
            Some(m) => {
                let area = m.work_area();
                let margin = (MARGIN * scale) as i32;
                PhysicalPosition::new(
                    area.position.x + area.size.width as i32 - size.width as i32 - margin,
                    area.position.y + area.size.height as i32 - size.height as i32 - margin,
                )
            }
            None => PhysicalPosition::new(100, 100),
        },
    };
    win.set_position(position)?;
    win.show()?;

    let handle = app.clone();
    win.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let _ = handle.emit(CHANGED_EVENT, false);
        }
    });
    let _ = app.emit(CHANGED_EVENT, true);
    Ok(())
}

/// After a drag: pull the window to nearby edges and remember where it is.
#[tauri::command]
pub fn pip_snap(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window(PIP_LABEL).ok_or("no pip window")?;
    let (pos, size, scale) = (
        win.outer_position().map_err(|e| e.to_string())?,
        win.outer_size().map_err(|e| e.to_string())?,
        win.scale_factor().map_err(|e| e.to_string())?,
    );
    let mut x = pos.x;
    let mut y = pos.y;
    if let Ok(Some(monitor)) = win.current_monitor() {
        let area = monitor.work_area();
        let (snap, margin) = ((SNAP * scale) as i32, (MARGIN * scale) as i32);
        let (left, top) = (area.position.x + margin, area.position.y + margin);
        let right = area.position.x + area.size.width as i32 - size.width as i32 - margin;
        let bottom = area.position.y + area.size.height as i32 - size.height as i32 - margin;
        if (x - left).abs() < snap {
            x = left;
        } else if (x - right).abs() < snap {
            x = right;
        }
        if (y - top).abs() < snap {
            y = top;
        } else if (y - bottom).abs() < snap {
            y = bottom;
        }
        // Never lose it off-screen.
        x = x.clamp(area.position.x, right.max(area.position.x));
        y = y.clamp(area.position.y, bottom.max(area.position.y));
    }
    if (x, y) != (pos.x, pos.y) {
        win.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    }
    crate::settings::set(&app, X_KEY, json!(x));
    crate::settings::set(&app, Y_KEY, json!(y));
    Ok(())
}

/// Mouse wheel over the video: grow or shrink around its center, keeping 16:9.
#[tauri::command]
pub fn pip_resize(app: AppHandle, delta: f64) -> Result<(), String> {
    let win = app.get_webview_window(PIP_LABEL).ok_or("no pip window")?;
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    let old = win.outer_size().map_err(|e| e.to_string())?;
    let pos = win.outer_position().map_err(|e| e.to_string())?;
    let w = (old.width as f64 / scale + delta).clamp(MIN_WIDTH, MAX_WIDTH);
    let new = PhysicalSize::new((w * scale) as u32, (w * 9.0 / 16.0 * scale) as u32);
    win.set_size(new).map_err(|e| e.to_string())?;
    let dx = (new.width as i32 - old.width as i32) / 2;
    let dy = (new.height as i32 - old.height as i32) / 2;
    win.set_position(PhysicalPosition::new(pos.x - dx, pos.y - dy)).map_err(|e| e.to_string())?;
    crate::settings::set(&app, WIDTH_KEY, json!(w.round()));
    Ok(())
}
