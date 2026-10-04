use std::sync::Mutex;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_autostart::ManagerExt;

use crate::i18n;
use crate::window::{position_top_center, ISLAND_LABEL, RECENTER_EVENT};

/// Menu items kept around so their labels can follow the UI language.
struct TrayItems {
    menu: Menu<Wry>,
    /// Added once an update is downloaded, with its version.
    update: Mutex<Option<(MenuItem<Wry>, String)>>,
    settings: MenuItem<Wry>,
    autostart: CheckMenuItem<Wry>,
    recenter: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let t = |key| i18n::t(app, key);
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        t("tray.autostart"),
        true,
        autostart_on,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, "settings", t("tray.settings"), true, None::<&str>)?;
    let recenter = MenuItem::with_id(app, "recenter", t("tray.recenter"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", t("tray.quit"), true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &settings,
            &autostart,
            &recenter,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    app.manage(TrayItems {
        menu: menu.clone(),
        update: Mutex::default(),
        settings: settings.clone(),
        autostart: autostart.clone(),
        recenter: recenter.clone(),
        quit: quit.clone(),
    });

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Dynamic Island")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "autostart" => {
                let launcher = app.autolaunch();
                let enabled = launcher.is_enabled().unwrap_or(false);
                let _ = if enabled {
                    launcher.disable()
                } else {
                    launcher.enable()
                };
                let _ = autostart.set_checked(launcher.is_enabled().unwrap_or(false));
            }
            "settings" => {
                let _ = crate::settings::open(app);
            }
            "recenter" => {
                if let Some(win) = app.get_webview_window(ISLAND_LABEL) {
                    let _ = position_top_center(&win);
                }
                let _ = app.emit(RECENTER_EVENT, ());
            }
            "update" => crate::updater::install(app),
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Re-apply labels after the UI language changed.
pub fn relabel(app: &AppHandle) {
    let Some(items) = app.try_state::<TrayItems>() else {
        return;
    };
    let t = |key| i18n::t(app, key);
    let _ = items.settings.set_text(t("tray.settings"));
    let _ = items.autostart.set_text(t("tray.autostart"));
    let _ = items.recenter.set_text(t("tray.recenter"));
    let _ = items.quit.set_text(t("tray.quit"));
    if let Some((item, version)) = &*items.update.lock().unwrap() {
        let _ = item.set_text(update_label(app, version));
    }
}

/// Offer a downloaded update at the top of the menu.
pub fn show_update(app: &AppHandle, version: &str) {
    let Some(items) = app.try_state::<TrayItems>() else {
        return;
    };
    let mut update = items.update.lock().unwrap();
    if let Some((item, current)) = &mut *update {
        *current = version.to_string();
        let _ = item.set_text(update_label(app, version));
        return;
    }
    let Ok(item) = MenuItem::with_id(app, "update", update_label(app, version), true, None::<&str>)
    else {
        return;
    };
    let _ = items.menu.insert(&item, 0);
    if let Ok(separator) = PredefinedMenuItem::separator(app) {
        let _ = items.menu.insert(&separator, 1);
    }
    *update = Some((item, version.to_string()));
}

fn update_label(app: &AppHandle, version: &str) -> String {
    i18n::t(app, "tray.update").replace("{version}", version)
}

/// Register autostart the first time the installed app runs.
pub fn enable_autostart_on_first_run(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return; // never register the dev binary
    }
    let Ok(dir) = app.path().app_config_dir() else {
        return;
    };
    let marker = dir.join(".autostart-initialized");
    if marker.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(&dir);
    if app.autolaunch().enable().is_ok() {
        let _ = std::fs::write(marker, b"1");
    }
}
