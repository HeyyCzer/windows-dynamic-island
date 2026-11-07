//! Windows: a plugin frame may only navigate within the `plugin://` protocol.
//!
//! The CSP blocks every request a plugin page could make except one: the page
//! navigating itself (`location = "https://…?data"`), which would carry data
//! out in the URL. WebView2 reports each child frame as it's created; frames
//! named [`FRAME_NAME`] (set by `PluginFrame.tsx`) get every navigation
//! checked, and anything outside the protocol is cancelled.

use tauri::WebviewWindow;
use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2_4, ICoreWebView2Frame2};
use webview2_com::{FrameCreatedEventHandler, FrameNavigationStartingEventHandler, take_pwstr};
use windows::core::{Interface, PWSTR};

/// The `name` of every plugin iframe.
pub const FRAME_NAME: &str = "island-plugin";

const ALLOWED: &str = "http://plugin.localhost/";

pub fn guard(win: &WebviewWindow) {
    let result = win.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        let Ok(core) = core.cast::<ICoreWebView2_4>() else {
            log::warn!("plugins: WebView2 too old to guard plugin frames");
            return;
        };
        let on_frame = FrameCreatedEventHandler::create(Box::new(|_, args| {
            let Some(args) = args else { return Ok(()) };
            let frame = args.Frame()?;
            let mut name = PWSTR::null();
            frame.Name(&mut name)?;
            if take_pwstr(name) != FRAME_NAME {
                return Ok(());
            }
            let frame: ICoreWebView2Frame2 = frame.cast()?;
            let on_navigate = FrameNavigationStartingEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut uri = PWSTR::null();
                args.Uri(&mut uri)?;
                let uri = take_pwstr(uri);
                if !allowed(&uri) {
                    log::warn!("plugins: blocked a plugin frame navigating to {uri}");
                    args.SetCancel(true)?;
                }
                Ok(())
            }));
            let mut token = 0;
            frame.add_NavigationStarting(&on_navigate, &mut token)?;
            Ok(())
        }));
        let mut token = 0;
        if let Err(e) = core.add_FrameCreated(&on_frame, &mut token) {
            log::warn!("plugins: can't guard plugin frames: {e}");
        }
    });
    if let Err(e) = result {
        log::warn!("plugins: can't guard plugin frames: {e}");
    }
}

fn allowed(uri: &str) -> bool {
    uri.starts_with(ALLOWED) || uri == "about:blank"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_frames_on_the_protocol() {
        assert!(allowed("http://plugin.localhost/counter/panel.html"));
        assert!(allowed("about:blank"));
        assert!(!allowed("https://evil.example/?data=secret"));
        assert!(!allowed("http://plugin.localhost.evil.example/"));
        assert!(!allowed("http://tauri.localhost/"));
    }
}
