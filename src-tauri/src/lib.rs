mod hub;
mod providers;
mod tray;
mod window;

use std::sync::Arc;

use tauri::Manager;

use hub::Hub;
use providers::Providers;

pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch just exits.
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .manage(window::HitState::default())
        .setup(|app| {
            let handle = app.handle().clone();

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            providers::get_snapshot,
            providers::provider_action,
            window::set_hit_rects,
            window::is_fullscreen_active,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
