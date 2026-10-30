//! Microsoft Store edition (`--features store`, packaged by
//! `scripts/package-msix.ps1`). It's a separate app from the GitHub build
//! (own identifier, see `tauri.microsoftstore.conf.json`), so both can be
//! installed side by side. Differences:
//! - the Store updates it: no self-update;
//! - the MSIX gives it a package identity: no sparse package for notifications;
//! - startup goes through the package's `StartupTask` (`autostart.rs`);
//! - its install folder changes on every update, so commands written outside
//!   the app (the Claude statusline) run it through its execution alias.

use std::path::PathBuf;

pub const IS_STORE: bool = cfg!(feature = "store");

/// `AppExecutionAlias` in `msix/AppxManifest.xml`.
const ALIAS: &str = "island-for-windows.exe";
/// `TaskId` of the `desktop:StartupTask` in `msix/AppxManifest.xml`.
// Only `autostart.rs`'s Store implementation reads it.
#[cfg_attr(not(feature = "store"), allow(dead_code))]
pub const STARTUP_TASK_ID: &str = "IslandStartup";

/// Path other programs should use to start this exe: the current exe, or in
/// the Store edition its execution alias, which survives updates.
pub fn launch_path() -> std::io::Result<PathBuf> {
    if !IS_STORE {
        return std::env::current_exe();
    }
    let local = std::env::var_os("LOCALAPPDATA")
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "LOCALAPPDATA not set"))?;
    Ok(PathBuf::from(local).join("Microsoft").join("WindowsApps").join(ALIAS))
}

#[cfg(test)]
mod tests {
    use super::*;

    const MANIFEST: &str = include_str!("../msix/AppxManifest.xml");

    #[test]
    fn manifest_matches_the_code() {
        assert!(MANIFEST.contains(&format!("Alias=\"{ALIAS}\"")), "execution alias");
        assert!(MANIFEST.contains(&format!("Executable=\"{ALIAS}\"")), "executable name");
        assert!(MANIFEST.contains(&format!("TaskId=\"{STARTUP_TASK_ID}\"")), "startup task id");
    }
}
