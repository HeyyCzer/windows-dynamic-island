//! The island's shelf: files and folders dropped on it, kept by reference
//! (nothing is copied) until you drag them somewhere else or remove them.
//! Persisted in the app data folder as `shelf.json`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::Manager;

use super::ask::{data_url, image_media_type};
use super::Provider;
use crate::hub::Hub;

pub const ID: &str = "shelf";
pub const MAX_ITEMS: usize = 12;
const MAX_THUMB_BYTES: u64 = 4_000_000;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Item {
    path: String,
    name: String,
    is_dir: bool,
    /// Lowercase extension, for the file icon.
    ext: String,
    /// Small pictures: the picture itself, as a data URL.
    thumb: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
struct State {
    items: Vec<Item>,
}

struct Ctx {
    hub: Arc<Hub>,
    file: PathBuf,
    paths: Mutex<Vec<String>>,
    thumbs: Mutex<HashMap<String, Option<String>>>,
}

impl Ctx {
    /// Drops entries whose file was deleted or moved, saves and publishes.
    fn commit(&self) {
        let paths: Vec<String> = {
            let mut paths = self.paths.lock().unwrap();
            paths.retain(|p| Path::new(p).exists());
            paths.truncate(MAX_ITEMS);
            paths.clone()
        };
        if let Some(dir) = self.file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(text) = serde_json::to_string(&paths) {
            let _ = std::fs::write(&self.file, text);
        }
        let mut thumbs = self.thumbs.lock().unwrap();
        let items = paths
            .iter()
            .map(|p| {
                let path = Path::new(p);
                let thumb = thumbs
                    .entry(p.clone())
                    .or_insert_with(|| {
                        let small = std::fs::metadata(path).is_ok_and(|m| m.len() <= MAX_THUMB_BYTES);
                        image_media_type(path).filter(|_| small).and_then(|m| data_url(path, m))
                    })
                    .clone();
                Item {
                    path: p.clone(),
                    name: path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| p.clone()),
                    is_dir: path.is_dir(),
                    ext: path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default(),
                    thumb,
                }
            })
            .collect();
        thumbs.retain(|k, _| paths.contains(k));
        drop(thumbs);
        self.hub.publish(ID, &State { items });
    }
}

#[derive(Default)]
pub struct ShelfProvider {
    ctx: Mutex<Option<Arc<Ctx>>>,
}

impl Provider for ShelfProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let file = hub.app().path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir()).join("shelf.json");
        let paths = std::fs::read_to_string(&file)
            .ok()
            .and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok())
            .unwrap_or_default();
        let ctx = Arc::new(Ctx { hub, file, paths: Mutex::new(paths), thumbs: Mutex::default() });
        *self.ctx.lock().unwrap() = Some(ctx.clone());
        ctx.commit();
        // Notice files deleted or moved meanwhile.
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_secs(10));
            ctx.commit();
        });
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        let ctx = self.ctx.lock().unwrap().clone().ok_or("shelf not started")?;
        match action {
            // Newest first; dropping something already there moves it to the front.
            "add" => {
                let new: Vec<String> = serde_json::from_value(payload).map_err(|e| e.to_string())?;
                let mut paths = ctx.paths.lock().unwrap();
                for p in new.into_iter().rev() {
                    paths.retain(|q| !q.eq_ignore_ascii_case(&p));
                    paths.insert(0, p);
                }
            }
            "remove" => {
                let path = payload.as_str().unwrap_or_default();
                ctx.paths.lock().unwrap().retain(|p| p != path);
            }
            "clear" => ctx.paths.lock().unwrap().clear(),
            "open" => {
                if let Some(path) = known(&ctx, &payload) {
                    crate::settings::open_url(&path);
                }
                return Ok(Value::Null);
            }
            // Drag an item out to any app (Explorer, WhatsApp, an e-mail…).
            "drag" => {
                let path = known(&ctx, &payload).ok_or("not on the shelf")?;
                start_drag(ctx.hub.app(), PathBuf::from(path));
                return Ok(Value::Null);
            }
            _ => return Err(format!("{ID}: unknown action '{action}'")),
        }
        ctx.commit();
        Ok(Value::Null)
    }
}

/// Only paths that are actually on the shelf can be opened or dragged.
fn known(ctx: &Ctx, payload: &Value) -> Option<String> {
    let path = payload.as_str()?;
    ctx.paths.lock().unwrap().iter().find(|p| *p == path).cloned()
}

/// OLE drag & drop has to run on the UI thread, while the mouse button is down.
fn start_drag(app: &tauri::AppHandle, path: PathBuf) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(win) = handle.get_webview_window(crate::window::ISLAND_LABEL) else { return };
        let image = if image_media_type(&path).is_some() { drag::Image::File(path.clone()) } else { drag::Image::Raw(vec![]) };
        if let Err(e) = drag::start_drag(&win, drag::DragItem::Files(vec![path]), image, |_, _| {}, drag::Options::default()) {
            log::warn!("shelf: drag failed: {e}");
        }
    });
}
