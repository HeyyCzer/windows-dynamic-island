//! Plugins: extra modules, settings and shortcuts installed from sources the
//! user adds (GitHub repositories serving an `island-plugins.json` index).
//!
//! A plugin is web code (HTML/JS/CSS) that runs in sandboxed iframes in the
//! island window, served by the `plugin://` protocol (`protocol.rs`). The
//! sandbox has no Tauri IPC, no storage and no network (CSP); everything
//! privileged goes through the host and the commands in `api.rs`, which check
//! the permissions the user granted. See `docs/plugins/`.

pub mod api;
#[cfg(windows)]
pub mod frames;
mod manifest;
mod net;
mod package;
pub mod permissions;
pub mod protocol;
mod registry;
mod source;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

pub use manifest::Manifest;
use package::Messages;
use permissions::Permission;
use registry::{Installed, Loaded, Problem, Registry};
use source::{Listing, Source, Text};

use crate::providers::now_ms;

/// Something was installed, removed or reloaded: windows fetch `plugins_list` again.
pub const CHANGED_EVENT: &str = "plugins://changed";

pub struct Plugins {
    root: PathBuf,
    registry: Mutex<Registry>,
    loaded: RwLock<HashMap<String, Arc<Loaded>>>,
    /// One install / removal at a time: they move folders around.
    busy: Mutex<()>,
}

impl Plugins {
    pub fn load(app: &AppHandle) -> Self {
        let root = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir())
            .join("plugins");
        let plugins = Self {
            registry: Mutex::new(Registry::load(&root.join("registry.json"))),
            root,
            loaded: RwLock::new(HashMap::new()),
            busy: Mutex::new(()),
        };
        plugins.refresh();
        plugins
    }

    fn installed_dir(&self) -> PathBuf {
        self.root.join("installed")
    }

    pub fn data_path(&self, id: &str) -> PathBuf {
        self.root.join("data").join(format!("{id}.json"))
    }

    fn save(&self, registry: &Registry) -> Result<(), String> {
        registry.save(&self.root.join("registry.json"))
    }

    /// Verifies every installed plugin again (startup, after changes).
    fn refresh(&self) {
        let registry = self.registry.lock().unwrap().clone();
        let installed_dir = self.installed_dir();
        let loaded = registry
            .installed
            .iter()
            .map(|(id, info)| {
                let loaded = Loaded::check(id, info, &installed_dir);
                if let Some((_, e)) = &loaded.problem {
                    log::warn!("plugin {id}: {e}");
                }
                (id.clone(), Arc::new(loaded))
            })
            .collect();
        *self.loaded.write().unwrap() = loaded;
    }

    pub fn get(&self, id: &str) -> Option<Arc<Loaded>> {
        self.loaded.read().unwrap().get(id).cloned()
    }

    /// Permissions granted to a plugin that loaded; none otherwise.
    pub fn granted(&self, id: &str) -> Vec<Permission> {
        self.get(id)
            .filter(|p| p.ok())
            .map(|p| {
                p.info
                    .granted
                    .iter()
                    .filter_map(|g| Permission::parse(g).ok())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Plugins that loaded, with their manifest (shortcuts, protocol).
    pub fn manifests(&self) -> Vec<Manifest> {
        self.loaded
            .read()
            .unwrap()
            .values()
            .filter_map(|p| p.manifest.clone().filter(|_| p.ok()))
            .collect()
    }

    fn info(&self) -> Vec<PluginInfo> {
        let mut list: Vec<PluginInfo> = self
            .loaded
            .read()
            .unwrap()
            .values()
            .map(|p| PluginInfo::from(p.as_ref()))
            .collect();
        list.sort_by(|a, b| a.id.cmp(&b.id));
        list
    }

    fn info_of(&self, id: &str) -> Option<PluginInfo> {
        self.get(id).map(|p| PluginInfo::from(p.as_ref()))
    }
}

/// An installed plugin as the frontend sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    id: String,
    version: String,
    manifest: Option<Manifest>,
    messages: Messages,
    source: Option<String>,
    dev: bool,
    dev_path: Option<String>,
    granted: Vec<String>,
    installed_at: u64,
    problem: Option<Problem>,
    error: Option<String>,
}

impl From<&Loaded> for PluginInfo {
    fn from(p: &Loaded) -> Self {
        Self {
            id: p.id.clone(),
            version: p
                .manifest
                .as_ref()
                .map_or_else(|| p.info.version.clone(), |m| m.version.clone()),
            manifest: p.manifest.clone(),
            messages: p.messages.clone(),
            source: p.info.source.clone(),
            dev: p.info.dev_path.is_some(),
            dev_path: p.info.dev_path.as_ref().map(|d| d.display().to_string()),
            granted: p.info.granted.clone(),
            installed_at: p.info.installed_at,
            problem: p.problem.as_ref().map(|(kind, _)| *kind),
            error: p.problem.as_ref().map(|(_, e)| e.clone()),
        }
    }
}

/// Turned off by the user (`plugin.<id>.enabled`); installed plugins start on.
pub fn is_disabled<R: tauri::Runtime>(app: &AppHandle<R>, id: &str) -> bool {
    app.state::<crate::settings::Settings>()
        .get(&format!("plugin.{id}.enabled"))
        == Some(serde_json::Value::Bool(false))
}

fn changed(app: &AppHandle) {
    let _ = app.emit(CHANGED_EVENT, ());
}

/// Runs blocking work (network, disk) off the main thread.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn plugins_list(plugins: State<Plugins>) -> Vec<PluginInfo> {
    plugins.info()
}

#[tauri::command]
pub fn plugin_sources(plugins: State<Plugins>) -> Vec<Source> {
    plugins.registry.lock().unwrap().sources.clone()
}

/// Adds a source once its index could be read.
#[tauri::command]
pub async fn plugin_source_add(app: AppHandle, input: String) -> Result<Source, String> {
    let source = Source::parse(&input)?;
    let checked = source.clone();
    blocking(move || net::fetch_index(&checked).map(|_| ())).await?;
    let plugins = app.state::<Plugins>();
    let mut registry = plugins.registry.lock().unwrap();
    if !registry.sources.iter().any(|s| s.id == source.id) {
        registry.sources.push(source.clone());
        plugins.save(&registry)?;
    }
    drop(registry);
    changed(&app);
    Ok(source)
}

/// Forgets a source; plugins installed from it stay.
#[tauri::command]
pub fn plugin_source_remove(
    app: AppHandle,
    plugins: State<Plugins>,
    id: String,
) -> Result<(), String> {
    let mut registry = plugins.registry.lock().unwrap();
    registry.sources.retain(|s| s.id != id);
    plugins.save(&registry)?;
    drop(registry);
    changed(&app);
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSource {
    source: Source,
    name: Option<Text>,
    plugins: Vec<CatalogEntry>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    #[serde(flatten)]
    listing: Listing,
    /// Written for an SDK this app has.
    compatible: bool,
    /// Version installed from this source, if any.
    installed: Option<String>,
    /// A newer version than the installed one.
    update: bool,
}

/// Every source's index, fetched side by side; a source that fails shows
/// its error instead of hiding the others.
#[tauri::command]
pub async fn plugin_catalog(plugins: State<'_, Plugins>) -> Result<Vec<CatalogSource>, String> {
    let (sources, installed) = {
        let registry = plugins.registry.lock().unwrap();
        (registry.sources.clone(), registry.installed.clone())
    };
    let tasks: Vec<_> = sources
        .into_iter()
        .map(|source| {
            tauri::async_runtime::spawn_blocking(move || (net::fetch_index(&source), source))
        })
        .collect();
    let mut catalog = Vec::new();
    for task in tasks {
        let (index, source) = task.await.map_err(|e| e.to_string())?;
        catalog.push(match index {
            Ok(index) => CatalogSource {
                name: index.name,
                plugins: index
                    .plugins
                    .into_iter()
                    .map(|listing| {
                        let current = installed
                            .get(&listing.id)
                            .filter(|p| p.source.as_deref() == Some(source.id.as_str()))
                            .map(|p| p.version.clone());
                        CatalogEntry {
                            compatible: manifest::parse_sdk(&listing.sdk)
                                .is_some_and(manifest::sdk_compatible),
                            update: current
                                .as_deref()
                                .is_some_and(|v| manifest::is_newer(&listing.version, v)),
                            installed: current,
                            listing,
                        }
                    })
                    .collect(),
                source,
                error: None,
            },
            Err(e) => CatalogSource {
                source,
                name: None,
                plugins: Vec::new(),
                error: Some(e),
            },
        });
    }
    Ok(catalog)
}

/// Downloads, verifies and installs (or updates) a plugin. `approved` is
/// what the user agreed to: the package may not ask for more.
#[tauri::command]
pub async fn plugin_install(
    app: AppHandle,
    source: String,
    id: String,
    approved: Vec<String>,
) -> Result<PluginInfo, String> {
    let handle = app.clone();
    let info = blocking(move || install(&handle, &source, &id, &approved)).await?;
    changed(&app);
    Ok(info)
}

/// The package is what the index announced and the user agreed to.
fn check_package(manifest: &Manifest, listing: &Listing, approved: &[String]) -> Result<(), String> {
    if manifest.id != listing.id || manifest.version != listing.version {
        return Err(format!(
            "the package is {} {}, the index says {} {}",
            manifest.id, manifest.version, listing.id, listing.version
        ));
    }
    if let Some(extra) = manifest.permissions.iter().find(|p| !approved.contains(p)) {
        return Err(format!(
            "the package asks for '{extra}', which wasn't approved"
        ));
    }
    // The marketplace shows "runs in the background" from the index: it can't hide it.
    if manifest.persistent && !listing.persistent {
        return Err("the package keeps a background running, the index doesn't say so".into());
    }
    Ok(())
}

fn install(
    app: &AppHandle,
    source_id: &str,
    id: &str,
    approved: &[String],
) -> Result<PluginInfo, String> {
    let plugins = app.state::<Plugins>();
    let _busy = plugins.busy.lock().unwrap();
    let source = {
        let registry = plugins.registry.lock().unwrap();
        if let Some(other) = registry
            .installed
            .get(id)
            .filter(|p| p.source.as_deref() != Some(source_id))
        {
            return Err(match &other.source {
                Some(s) => format!("'{id}' is already installed from {s}; remove it first"),
                None => format!("'{id}' is loaded from a folder; remove it first"),
            });
        }
        registry
            .sources
            .iter()
            .find(|s| s.id == source_id)
            .cloned()
            .ok_or("unknown source")?
    };
    let index = net::fetch_index(&source)?;
    let listing = index
        .plugins
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("{} doesn't list '{id}' anymore", source.label))?;
    let bytes = net::download(&listing.package)?;
    package::verify_sha256(&bytes, &listing.sha256)?;

    let staging = plugins
        .root
        .join("staging")
        .join(format!("{id}-{}", now_ms()));
    let unpacked = package::unpack(&bytes, &staging).and_then(|(manifest, files)| {
        check_package(&manifest, &listing, approved)?;
        Ok((manifest, files))
    });
    let (manifest, files) = match unpacked {
        Ok(ok) => ok,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&staging);
            return Err(e);
        }
    };

    // Swap folders: the old version only goes once the new one is in place.
    let dest = plugins.installed_dir().join(id);
    let old = plugins
        .root
        .join("staging")
        .join(format!("{id}-old-{}", now_ms()));
    std::fs::create_dir_all(plugins.installed_dir()).map_err(|e| e.to_string())?;
    if dest.exists() {
        std::fs::rename(&dest, &old).map_err(|e| e.to_string())?;
    }
    if let Err(e) = std::fs::rename(&staging, &dest) {
        let _ = std::fs::rename(&old, &dest);
        return Err(e.to_string());
    }
    let _ = std::fs::remove_dir_all(&old);

    {
        let mut registry = plugins.registry.lock().unwrap();
        registry.installed.insert(
            id.to_string(),
            Installed {
                version: manifest.version.clone(),
                source: Some(source.id.clone()),
                package_sha256: Some(listing.sha256.clone()),
                files,
                granted: manifest.permissions.clone(),
                installed_at: now_ms(),
                dev_path: None,
            },
        );
        plugins.save(&registry)?;
    }
    plugins.refresh();
    plugins
        .info_of(id)
        .ok_or_else(|| "installed, but didn't load".into())
}

/// Removes a plugin, its files and its storage.
#[tauri::command]
pub async fn plugin_uninstall(app: AppHandle, id: String) -> Result<(), String> {
    let handle = app.clone();
    blocking(move || {
        let plugins = handle.state::<Plugins>();
        let _busy = plugins.busy.lock().unwrap();
        let removed = {
            let mut registry = plugins.registry.lock().unwrap();
            let removed = registry.installed.remove(&id);
            plugins.save(&registry)?;
            removed
        };
        // A folder in developer mode belongs to the developer: leave it.
        if removed.is_some_and(|p| p.dev_path.is_none()) {
            let _ = std::fs::remove_dir_all(plugins.installed_dir().join(&id));
        }
        let _ = std::fs::remove_file(plugins.data_path(&id));
        plugins.refresh();
        Ok(())
    })
    .await?;
    changed(&app);
    Ok(())
}

/// Developer mode: loads the plugin in `path` (a folder with `plugin.json`)
/// and serves it from there, so a rebuild shows up on reload. Its permissions
/// are granted as declared: the developer is the user.
#[tauri::command]
pub async fn plugin_load_dev(app: AppHandle, path: String) -> Result<PluginInfo, String> {
    let handle = app.clone();
    let info = blocking(move || {
        let mut dir = PathBuf::from(path.trim());
        if dir
            .file_name()
            .is_some_and(|n| n == manifest::MANIFEST_FILE)
        {
            dir.pop();
        }
        let dir = dir
            .canonicalize()
            .map_err(|e| format!("{}: {e}", dir.display()))?;
        let files = package::hash_dir(&dir)?;
        let manifest = package::check_contents(&dir, &files)?;
        let plugins = handle.state::<Plugins>();
        let _busy = plugins.busy.lock().unwrap();
        {
            let mut registry = plugins.registry.lock().unwrap();
            if let Some(other) = registry
                .installed
                .get(&manifest.id)
                .filter(|p| p.dev_path.as_deref() != Some(dir.as_path()))
            {
                return Err(match &other.source {
                    Some(s) => format!("'{}' is installed from {s}; remove it first", manifest.id),
                    None => format!("'{}' is already loaded from another folder", manifest.id),
                });
            }
            registry.installed.insert(
                manifest.id.clone(),
                Installed {
                    version: manifest.version.clone(),
                    source: None,
                    package_sha256: None,
                    files: Default::default(),
                    granted: manifest.permissions.clone(),
                    installed_at: now_ms(),
                    dev_path: Some(dir),
                },
            );
            plugins.save(&registry)?;
        }
        plugins.refresh();
        plugins
            .info_of(&manifest.id)
            .ok_or_else(|| "loaded, but didn't start".into())
    })
    .await?;
    changed(&app);
    Ok(info)
}

/// Asks for a plugin folder (by its `plugin.json`) for developer mode.
#[tauri::command]
pub async fn plugin_pick_dev_folder() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| {
        crate::dialog::pick_file("plugin.json", "plugin.json").map(|file| {
            PathBuf::from(file)
                .parent()
                .map(|dir| dir.display().to_string())
                .unwrap_or_default()
        })
    })
    .await
    .ok()
    .flatten()
}

/// Checks every plugin again and reloads them in the open windows (after a
/// rebuild in developer mode).
#[tauri::command]
pub async fn plugins_reload(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    blocking(move || {
        handle.state::<Plugins>().refresh();
        Ok(())
    })
    .await?;
    changed(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(extra: serde_json::Value) -> Manifest {
        let mut m = serde_json::json!({
            "id": "demo", "version": "1.0.0", "sdk": "1.0", "name": "n", "background": "bg.js",
            "permissions": ["clipboard:read"],
        });
        m.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        Manifest::parse(&m.to_string()).unwrap()
    }

    fn listing(persistent: bool) -> Listing {
        serde_json::from_value(serde_json::json!({
            "id": "demo", "version": "1.0.0", "sdk": "1.0", "name": "n",
            "package": "https://x.dev/demo.zip", "sha256": "00", "persistent": persistent,
        }))
        .unwrap()
    }

    #[test]
    fn package_must_match_its_listing() {
        let ok = vec!["clipboard:read".to_string()];
        assert!(check_package(&manifest(serde_json::json!({})), &listing(false), &ok).is_ok());
        assert!(check_package(&manifest(serde_json::json!({})), &listing(false), &[]).is_err());
        let other = manifest(serde_json::json!({ "version": "1.0.1" }));
        assert!(check_package(&other, &listing(false), &ok).is_err());
    }

    #[test]
    fn package_cant_hide_a_persistent_background() {
        let ok = vec!["clipboard:read".to_string()];
        let persistent = manifest(serde_json::json!({ "persistent": true }));
        assert!(check_package(&persistent, &listing(false), &ok).is_err());
        assert!(check_package(&persistent, &listing(true), &ok).is_ok());
        // Saying more than the package does is harmless.
        assert!(check_package(&manifest(serde_json::json!({})), &listing(true), &ok).is_ok());
    }
}
