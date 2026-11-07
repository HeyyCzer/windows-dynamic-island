//! WebView2 memory footprint.
//!
//! Two levers:
//!
//! * [`BROWSER_ARGS`]: Chromium switches for the shared WebView2 browser
//!   process. They turn off background services an overlay never uses (the
//!   spare renderer Chromium keeps warm, translation, component updates…).
//! * [`set_low_memory`]: WebView2's `MemoryUsageTargetLevel`. While a webview
//!   isn't being looked at (the island swallowed by the tray's black hole,
//!   settings minimized), `Low` lets WebView2 trim its working set; it goes
//!   back to `Normal` as soon as the window is in use again.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindow, WindowEvent};

/// Browser arguments for every webview of the app.
///
/// All webviews share one WebView2 environment, and WebView2 refuses to make a
/// webview whose arguments differ from the environment's: the island's copy in
/// `tauri.conf.json` (`additionalBrowserArgs`) must stay identical (a test
/// checks it). Setting them replaces wry's defaults, so those
/// (`msWebOOUI,msPdfOOUI,msSmartScreenProtection`) are repeated here.
pub const BROWSER_ARGS: &str = concat!(
    "--disable-features=",
    // wry's defaults: the "mini menu" on selected text, PDF UI, SmartScreen.
    "msWebOOUI,msPdfOOUI,msSmartScreenProtection,",
    // An idle renderer process kept ready for the next site: we never navigate.
    "SpareRendererForSitePerProcess,",
    // Browser features with nothing to do in a local UI.
    "Translate,OptimizationHints,MediaRouter,AutofillServerCommunication",
    " --disable-background-networking",
    " --disable-component-update",
    " --disable-default-apps",
    " --disable-extensions",
    " --disable-sync",
);

/// How long the black hole animation gets to play before the island's
/// webview trims its memory (trimming can make the next frames stutter).
const HIDE_DELAY: Duration = Duration::from_secs(3);

/// Bumped on every island visibility change, so a pending delayed trim from an
/// older change doesn't apply after the island came back.
static ISLAND_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Follow the tray's hidden state: trim the island's webview while it's
/// swallowed, restore it right away when it comes back.
pub fn sync_island(app: &AppHandle) {
    let generation = ISLAND_GENERATION.fetch_add(1, Ordering::Relaxed) + 1;
    let hidden = crate::tray::is_hidden(app);
    if !hidden {
        if let Some(win) = app.get_webview_window(crate::window::ISLAND_LABEL) {
            set_low_memory(&win, false);
        }
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(HIDE_DELAY);
        if ISLAND_GENERATION.load(Ordering::Relaxed) != generation || !crate::tray::is_hidden(&app)
        {
            return;
        }
        if let Some(win) = app.get_webview_window(crate::window::ISLAND_LABEL) {
            set_low_memory(&win, true);
        }
    });
}

/// Trim a window's webview while it's minimized.
pub fn trim_when_minimized(win: &WebviewWindow) {
    let handle = win.clone();
    win.on_window_event(move |event| {
        if matches!(event, WindowEvent::Resized(_) | WindowEvent::Focused(_)) {
            let minimized = handle.is_minimized().unwrap_or(false);
            set_low_memory(&handle, minimized);
        }
    });
}

/// Hint WebView2 to keep its memory low (`true`) or back to normal.
/// No-op where unsupported (WebView2 runtimes older than 1.0.1774, other OSes).
#[cfg(windows)]
pub fn set_low_memory(win: &WebviewWindow, low: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        ICoreWebView2_19,
    };
    use windows::core::Interface;

    let level = if low {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
    } else {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
    };
    // Runs on the main thread, where the WebView2 COM objects live.
    let _ = win.with_webview(move |webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        let Ok(core) = core.cast::<ICoreWebView2_19>() else {
            return;
        };
        if let Err(e) = core.SetMemoryUsageTargetLevel(level) {
            log::warn!("webview memory level: {e}");
        }
    });
}

#[cfg(not(windows))]
pub fn set_low_memory(_: &WebviewWindow, _: bool) {}

#[cfg(test)]
mod tests {
    use super::BROWSER_ARGS;

    /// WebView2 won't make a webview whose browser arguments differ from the
    /// shared environment's, so the island's (config) and the other windows'
    /// (code) must match.
    #[test]
    fn island_config_uses_the_shared_browser_args() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let island = config["app"]["windows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|w| w["label"] == crate::window::ISLAND_LABEL)
            .unwrap();
        assert_eq!(island["additionalBrowserArgs"], BROWSER_ARGS);
    }

    #[test]
    fn keeps_wry_default_args() {
        assert!(
            BROWSER_ARGS
                .starts_with("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,")
        );
    }
}
