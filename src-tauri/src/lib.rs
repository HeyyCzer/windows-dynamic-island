mod hub;
mod i18n;
mod providers;
mod settings;
mod tray;
mod updater;
mod window;

use std::sync::Arc;

use tauri::Manager;

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
        .manage(window::HitState::default())
        .manage(window::DragState::default())
        .manage(i18n::Locale::default())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(settings::Settings::load(&handle));

            let hub = Arc::new(Hub::new(handle.clone()));
            let providers = providers::registry();
            for provider in &providers {
                provider.clone().start(hub.clone());
            }
            app.manage(hub);
            app.manage(Providers(providers));

            if let Some(win) = app.get_webview_window(window::ISLAND_LABEL) {
                window::position_top_center(&win)?;
                win.set_ignore_cursor_events(true)?;
                win.show()?;
            }
            window::spawn_hit_test(handle.clone());

            tray::setup(&handle)?;
            tray::enable_autostart_on_first_run(&handle);
            updater::spawn(handle.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            providers::get_snapshot,
            providers::provider_action,
            window::set_hit_rects,
            window::set_dragging,
            window::is_fullscreen_active,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
