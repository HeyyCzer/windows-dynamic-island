//! Short alert sounds: Windows' own (the calendar chime) and audio files (the
//! Claude Code alerts, MP3 / WAV / WMA through MCI), plus a picker for them.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, Manager};

/// One of Windows' sounds by alias (`HKCU\AppEvents\EventLabels`), e.g.
/// "Notification.Reminder"; nothing when the user turned it off.
pub fn system(alias: &str) {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::Media::Audio::{PlaySoundW, SND_ALIAS, SND_ASYNC, SND_NODEFAULT};
        let alias = windows::core::HSTRING::from(alias);
        let _ = PlaySoundW(&alias, None, SND_ALIAS | SND_ASYNC | SND_NODEFAULT);
    }
    #[cfg(not(windows))]
    let _ = alias;
}

/// Plays an audio file in the background; overlapping calls play together.
pub fn file(path: &Path) {
    static NEXT: AtomicU32 = AtomicU32::new(0);
    let alias = format!("island-sound-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    let path = path.to_string_lossy().replace('"', "");
    std::thread::spawn(move || {
        // `wait` blocks this thread until the end, so the device can be closed.
        if mci(&format!("open \"{path}\" type mpegvideo alias {alias}")) {
            mci(&format!("play {alias} wait"));
            mci(&format!("close {alias}"));
        } else {
            log::warn!("sound: can't play {path}");
        }
    });
}

#[cfg(windows)]
fn mci(command: &str) -> bool {
    use windows::Win32::Media::Multimedia::mciSendStringW;
    let command = windows::core::HSTRING::from(command);
    unsafe { mciSendStringW(&command, None, None) == 0 }
}

#[cfg(not(windows))]
fn mci(_command: &str) -> bool {
    false
}

/// A sound shipped with the app, written next to its data on first use (MCI
/// plays files, not memory).
pub fn bundled(app: &AppHandle, name: &str, bytes: &[u8]) -> Option<PathBuf> {
    let path = app.path().app_data_dir().ok()?.join("sounds").join(name);
    if std::fs::metadata(&path).is_ok_and(|m| m.len() == bytes.len() as u64) {
        return Some(path);
    }
    std::fs::create_dir_all(path.parent()?).ok()?;
    std::fs::write(&path, bytes).ok()?;
    Some(path)
}

/// Windows' "Open" dialog for an audio file; `None` when cancelled. Blocks
/// until the user picks.
pub fn pick() -> Option<String> {
    crate::dialog::pick_file("Audio (MP3, WAV, WMA)", "*.mp3;*.wav;*.wma")
}
