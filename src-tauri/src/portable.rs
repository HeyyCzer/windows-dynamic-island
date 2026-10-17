//! Portable build: the release zip ships the exe with an empty `.portable`
//! file beside it. Such a copy never self-updates (the updater would run the
//! installer, leaving the portable copy behind) and doesn't register itself
//! to start with Windows on first run.

use std::sync::OnceLock;

/// Marker file next to the exe.
const MARKER: &str = ".portable";

pub fn is_portable() -> bool {
    static PORTABLE: OnceLock<bool> = OnceLock::new();
    *PORTABLE.get_or_init(|| {
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join(MARKER).exists()))
            .unwrap_or(false)
    })
}
