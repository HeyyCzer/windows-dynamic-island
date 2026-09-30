//! Self-update from GitHub releases.
//!
//! The release workflow publishes a signed `latest.json` next to the
//! installers (endpoint and public key in `tauri.conf.json`). Installed builds
//! check it at startup and every few hours; a newer version is downloaded in
//! the background and offered in the tray, and only installed when the user
//! picks it, since installing on Windows closes the app.

use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

const FIRST_CHECK: Duration = Duration::from_secs(30);
const INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

/// A downloaded update waiting for the user: the update and its installer.
#[derive(Default)]
pub struct Pending(Mutex<Option<(Update, Vec<u8>)>>);

pub fn spawn(app: AppHandle) {
    if cfg!(debug_assertions) {
        return; // dev builds would "update" into the released app
    }
    app.manage(Pending::default());
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            if let Err(e) = tauri::async_runtime::block_on(check(&app)) {
                log::warn!("update check failed: {e}");
            }
            std::thread::sleep(INTERVAL);
        }
    });
}

async fn check(app: &AppHandle) -> tauri_plugin_updater::Result<()> {
    if app.state::<Pending>().0.lock().unwrap().is_some() {
        return Ok(()); // already waiting on the user
    }
    let Some(update) = app.updater()?.check().await? else {
        return Ok(());
    };
    let bytes = update.download(|_, _| {}, || {}).await?;
    let version = update.version.clone();
    *app.state::<Pending>().0.lock().unwrap() = Some((update, bytes));
    crate::tray::show_update(app, &version);
    Ok(())
}

/// Install the downloaded update. On Windows the installer takes over and the
/// app exits; the installer starts it again when done.
pub fn install(app: &AppHandle) {
    let Some(pending) = app.try_state::<Pending>() else {
        return;
    };
    let Some((update, bytes)) = pending.0.lock().unwrap().take() else {
        return;
    };
    if let Err(e) = update.install(bytes) {
        log::error!("update install failed: {e}");
        return;
    }
    app.restart();
}
