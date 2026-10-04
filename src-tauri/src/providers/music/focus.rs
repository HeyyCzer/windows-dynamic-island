//! Bring the app that owns the media session to the front.
//!
//! SMTC only gives an AppUserModelID: `Spotify.exe` for most Win32 apps, a
//! short id for browsers (`Chrome`, `MSEdge`, a hash for Firefox) or
//! `Package_hash!App` for Store apps. The matching top-level window is found by
//! process name, preferring one whose title mentions the track (the playing
//! browser tab, Spotify's "Artist - Song" window). Store apps without a window
//! are activated through the shell.

use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, MAX_PATH};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GW_OWNER, GWL_EXSTYLE, GetWindow, GetWindowLongW, GetWindowTextW, GetWindowThreadProcessId, IsIconic,
    IsWindowVisible, SW_RESTORE, SW_SHOW, SetForegroundWindow, ShowWindow, SwitchToThisWindow, WS_EX_TOOLWINDOW,
};
use windows::core::BOOL;

/// Process names (lowercase, no `.exe`) behind SMTC ids that aren't exe names.
const KNOWN: &[(&str, &str)] = &[
    ("308046b0af4a39cb", "firefox"),
    ("zunemusic", "microsoft.media.player"),
    ("applemusic", "applemusic"),
];

pub fn focus(app_id: &str, title: &str) {
    let key = process_key(app_id);
    if let Some(hwnd) = find_window(&key, title) {
        activate(hwnd);
    } else if app_id.contains('!') {
        crate::settings::open_url(&format!("shell:AppsFolder\\{app_id}"));
    }
}

fn process_key(app_id: &str) -> String {
    let lower = app_id.to_lowercase();
    if let Some((_, name)) = KNOWN.iter().find(|(k, _)| lower.contains(k)) {
        return name.to_string();
    }
    lower
        .rsplit(['\\', '!'])
        .next()
        .unwrap_or(&lower)
        .trim_end_matches(".exe")
        .to_string()
}

struct Search<'a> {
    key: &'a str,
    title: String,
    best: Option<(u8, HWND)>,
}

fn find_window(key: &str, title: &str) -> Option<HWND> {
    if key.is_empty() {
        return None;
    }
    let mut search = Search {
        key,
        title: title.to_lowercase(),
        best: None,
    };
    unsafe {
        let _ = EnumWindows(Some(visit), LPARAM(&mut search as *mut Search as isize));
    }
    search.best.map(|(_, hwnd)| hwnd)
}

unsafe extern "system" fn visit(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let search = unsafe { &mut *(lparam.0 as *mut Search) };
    unsafe {
        if !GetWindow(hwnd, GW_OWNER).unwrap_or_default().is_invalid() {
            return true.into();
        }
        if GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW.0 != 0 {
            return true.into();
        }
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut buf) as usize;
        if len == 0 {
            return true.into();
        }
        let Some(process) = process_name(hwnd) else {
            return true.into();
        };
        if process != search.key && !process.contains(search.key) {
            return true.into();
        }

        let text = String::from_utf16_lossy(&buf[..len]).to_lowercase();
        let mentions_track = !search.title.is_empty() && text.contains(&search.title);
        let visible = IsWindowVisible(hwnd).as_bool();
        // Hidden windows (minimized to tray) only count when they're clearly the player.
        if !visible && !mentions_track {
            return true.into();
        }
        let score = u8::from(visible) + 2 * u8::from(mentions_track);
        if search.best.is_none_or(|(s, _)| score > s) {
            search.best = Some((score, hwnd));
        }
    }
    true.into()
}

fn process_name(hwnd: HWND) -> Option<String> {
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; MAX_PATH as usize];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(process);
        ok.ok()?;
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        let file = path.rsplit('\\').next()?.to_lowercase();
        Some(file.trim_end_matches(".exe").to_string())
    }
}

fn activate(hwnd: HWND) {
    unsafe {
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        } else if !IsWindowVisible(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }
        // Allowed because the click on the island was the last input event;
        // SwitchToThisWindow is the fallback when Windows still refuses.
        if !SetForegroundWindow(hwnd).as_bool() {
            SwitchToThisWindow(hwnd, true);
        }
    }
}
