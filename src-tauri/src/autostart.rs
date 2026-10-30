//! "Start with Windows". The GitHub build writes the registry Run key
//! (`tauri-plugin-autostart`); inside the Store's MSIX that key is virtualized
//! and Windows never sees it, so the Store edition toggles the package's
//! `StartupTask` instead (declared in `msix/AppxManifest.xml`).

use tauri::AppHandle;

pub fn is_enabled(app: &AppHandle) -> bool {
    imp::is_enabled(app)
}

/// Turn it on or off; returns the resulting state.
pub fn set(app: &AppHandle, enabled: bool) -> Result<bool, String> {
    imp::set(app, enabled)?;
    Ok(is_enabled(app))
}

#[cfg(not(feature = "store"))]
mod imp {
    use tauri::AppHandle;
    use tauri_plugin_autostart::ManagerExt;

    pub fn is_enabled(app: &AppHandle) -> bool {
        app.autolaunch().is_enabled().unwrap_or(false)
    }

    pub fn set(app: &AppHandle, enabled: bool) -> Result<(), String> {
        let launcher = app.autolaunch();
        let result = if enabled { launcher.enable() } else { launcher.disable() };
        result.map_err(|e| e.to_string())
    }
}

#[cfg(feature = "store")]
mod imp {
    use tauri::AppHandle;
    use windows::ApplicationModel::{StartupTask, StartupTaskState};
    use windows::core::HSTRING;

    fn task() -> windows::core::Result<StartupTask> {
        StartupTask::GetAsync(&HSTRING::from(crate::store::STARTUP_TASK_ID))?.join()
    }

    pub fn is_enabled(_app: &AppHandle) -> bool {
        task()
            .and_then(|t| t.State())
            .is_ok_and(|s| s == StartupTaskState::Enabled || s == StartupTaskState::EnabledByPolicy)
    }

    /// Packaged desktop apps get no consent prompt. A task the user turned off
    /// in Task Manager stays off: Windows only lets them turn it back on there.
    pub fn set(_app: &AppHandle, enabled: bool) -> Result<(), String> {
        let task = task().map_err(|e| e.message())?;
        if enabled {
            let state = task.RequestEnableAsync().and_then(|op| op.join()).map_err(|e| e.message())?;
            if state == StartupTaskState::DisabledByUser {
                return Err("disabledByUser".into());
            }
        } else {
            task.Disable().map_err(|e| e.message())?;
        }
        Ok(())
    }
}
