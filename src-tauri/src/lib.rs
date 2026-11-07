mod autostart;
mod dialog;
mod display;
mod file_drop;
mod glass;
mod hub;
mod i18n;
mod memory;
mod pip;
mod plugins;
mod portable;
mod providers;
mod screen;
mod settings;
mod sound;
mod store;
mod tray;
mod updater;
mod window;

use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::ShortcutState;

use hub::Hub;
use providers::Providers;

pub use providers::claude::statusline::BRIDGE_FLAG as STATUSLINE_BRIDGE_FLAG;
pub use providers::claude::statusline::run_bridge as run_statusline_bridge;

pub fn run() {
    tauri::Builder::default()
        // Must be registered first. Launching the app again opens settings.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = settings::open(app);
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    // See `providers/shortcuts.rs`.
                    if event.state() == ShortcutState::Pressed
                        && let Some(target) = providers::shortcuts::event_for(shortcut)
                    {
                        match target {
                            providers::shortcuts::ShortcutTarget::Event(event) => {
                                open_page(app, event)
                            }
                            providers::shortcuts::ShortcutTarget::Module(id) => {
                                open_module(app, &id)
                            }
                            providers::shortcuts::ShortcutTarget::Plugin { plugin, shortcut } => {
                                let _ = app.emit(
                                    "plugin://shortcut",
                                    serde_json::json!({ "plugin": plugin, "shortcut": shortcut }),
                                );
                            }
                        }
                    }
                })
                .build(),
        )
        .manage(window::HitState::default())
        .manage(window::DragState::default())
        .manage(i18n::Locale::default())
        // Plugins' files, for their sandboxed iframes (see `plugins/protocol.rs`).
        .register_asynchronous_uri_scheme_protocol(
            plugins::protocol::SCHEME,
            plugins::protocol::handle,
        )
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(settings::Settings::load(&handle));
            app.manage(plugins::Plugins::load(&handle));

            let hub = Arc::new(Hub::new(handle.clone()));
            let providers = providers::registry();
            for provider in &providers {
                provider.clone().start(hub.clone());
            }
            app.manage(hub);
            app.manage(Providers(providers));

            if let Some(win) = app.get_webview_window(window::ISLAND_LABEL) {
                window::make_overlay(&win);
                display::place(&win)?;
                win.set_ignore_cursor_events(true)?;
                win.show()?;
                file_drop::hook(&handle, &win);
                #[cfg(windows)]
                plugins::frames::guard(&win);
            }
            memory::sync_island(&handle);
            glass::setup(&handle);
            window::spawn_hit_test(handle.clone());
            display::spawn_placement(handle.clone());

            tray::setup(&handle)?;
            tray::enable_autostart_on_first_run(&handle);
            updater::spawn(handle.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            providers::get_snapshot,
            providers::provider_action,
            window::set_hit_rects,
            glass::set_glass_shapes,
            glass::set_glass_level,
            glass::glass_supported,
            window::set_dragging,
            window::is_fullscreen_active,
            window::focus_island,
            window::restore_focus,
            display::list_monitors,
            settings::get_settings,
            settings::set_setting,
            settings::open_settings,
            settings::get_autostart,
            settings::set_autostart,
            settings::open_repo,
            settings::open_external,
            updater::check_update,
            updater::install_update,
            i18n::set_locale,
            pip::open_pip,
            pip::close_pip,
            pip::is_pip_open,
            pip::pip_snap,
            pip::pip_resize,
            plugins::plugins_list,
            plugins::plugin_sources,
            plugins::plugin_source_add,
            plugins::plugin_source_remove,
            plugins::plugin_catalog,
            plugins::plugin_install,
            plugins::plugin_uninstall,
            plugins::plugin_load_dev,
            plugins::plugin_pick_dev_folder,
            plugins::plugins_reload,
            plugins::api::plugin_fetch,
            plugins::api::plugin_storage,
            plugins::api::plugin_read_file,
            plugins::api::plugin_clipboard,
            plugins::api::plugin_open_url,
            plugins::api::plugin_can_read_provider,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Brings the island forward on a page that takes the keyboard (`event` tells which).
fn open_page(app: &AppHandle, event: &str) {
    if tray::is_hidden(app) {
        return;
    }
    if let Some(win) = app.get_webview_window(window::ISLAND_LABEL) {
        window::allow_activation();
        let _ = win.set_focus();
    }
    let _ = app.emit(event, ());
}

fn open_module(app: &AppHandle, id: &str) {
    if tray::is_hidden(app) {
        return;
    }
    if let Some(win) = app.get_webview_window(window::ISLAND_LABEL) {
        window::allow_activation();
        let _ = win.set_focus();
    }
    let _ = app.emit("island://open-module", id);
}
