//! What's installed and where from, persisted as `plugins/registry.json` in
//! the app data folder next to the unpacked plugins:
//!
//! ```text
//! plugins/
//!   registry.json        sources, installed plugins, file hashes, grants
//!   installed/<id>/      unpacked package
//!   data/<id>.json       the plugin's own storage
//! ```

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::manifest::Manifest;
use super::package::{self, FileHashes, Messages};
use super::source::Source;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Registry {
    #[serde(default)]
    pub sources: Vec<Source>,
    #[serde(default)]
    pub installed: BTreeMap<String, Installed>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    pub version: String,
    /// Id of the source it came from; `None` for a plugin loaded from a folder.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_sha256: Option<String>,
    /// Hash of every file, taken when it was installed.
    #[serde(default)]
    pub files: FileHashes,
    /// Permissions the user agreed to.
    #[serde(default)]
    pub granted: Vec<String>,
    pub installed_at: u64,
    /// Developer mode: served from this folder as it is, without hashes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dev_path: Option<PathBuf>,
}

impl Registry {
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    /// Written to a temporary file first, so a crash never leaves half a registry.
    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let text = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, path).map_err(|e| e.to_string())
    }
}

/// Why a plugin didn't load.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Problem {
    /// A file changed (or went missing) since it was installed.
    Tampered,
    /// Broken manifest, or written for another SDK.
    Invalid,
}

/// An installed plugin checked and ready to run, or the reason it isn't.
#[derive(Debug, Clone)]
pub struct Loaded {
    pub id: String,
    pub dir: PathBuf,
    pub info: Installed,
    pub manifest: Option<Manifest>,
    pub messages: Messages,
    pub problem: Option<(Problem, String)>,
}

impl Loaded {
    /// Verifies (or, in developer mode, re-reads) an installed plugin.
    pub fn check(id: &str, info: &Installed, installed_dir: &Path) -> Self {
        let dir = info
            .dev_path
            .clone()
            .unwrap_or_else(|| installed_dir.join(id));
        let mut loaded = Self {
            id: id.to_string(),
            dir: dir.clone(),
            info: info.clone(),
            manifest: None,
            messages: Messages::new(),
            problem: None,
        };
        let files = if info.dev_path.is_some() {
            match package::hash_dir(&dir) {
                Ok(files) => files,
                Err(e) => {
                    loaded.problem = Some((Problem::Invalid, e));
                    return loaded;
                }
            }
        } else {
            if let Err(e) = package::verify_files(&dir, &info.files) {
                loaded.problem = Some((Problem::Tampered, e));
                return loaded;
            }
            info.files.clone()
        };
        match package::check_contents(&dir, &files) {
            Ok(manifest) if manifest.id != id => {
                loaded.problem = Some((
                    Problem::Invalid,
                    format!("plugin.json now says '{}'", manifest.id),
                ));
            }
            Ok(manifest) => {
                loaded.messages = package::load_messages(&dir, &files).unwrap_or_default();
                loaded.manifest = Some(manifest);
            }
            Err(e) => loaded.problem = Some((Problem::Invalid, e)),
        }
        if info.dev_path.is_some() {
            // Served as is in developer mode; keep the hashes for display only.
            loaded.info.files = files;
        }
        loaded
    }

    pub fn ok(&self) -> bool {
        self.problem.is_none() && self.manifest.is_some()
    }

    /// The bytes of `name` for the `plugin://` protocol, verified against the
    /// hash taken at install time (developer mode reads the folder as is).
    pub fn read(&self, name: &str) -> Result<Vec<u8>, String> {
        if !self.ok() {
            return Err("plugin didn't load".into());
        }
        if self.info.dev_path.is_some() {
            super::manifest::check_path(name)?;
            return std::fs::read(package::file_path(&self.dir, name)).map_err(|e| e.to_string());
        }
        let hash = self.info.files.get(name).ok_or("not in the package")?;
        package::read_verified(&self.dir, name, hash)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "island-registry-test-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_plugin(dir: &Path) {
        std::fs::create_dir_all(dir.join("locales")).unwrap();
        std::fs::write(
            dir.join("plugin.json"),
            r#"{ "id": "hello", "version": "1.0.0", "sdk": "1", "name": "n", "background": "bg.js" }"#,
        )
        .unwrap();
        std::fs::write(dir.join("bg.js"), "island.ready()").unwrap();
        std::fs::write(dir.join("locales/en.json"), r#"{ "n": "Hello" }"#).unwrap();
    }

    fn installed(files: FileHashes, dev_path: Option<PathBuf>) -> Installed {
        Installed {
            version: "1.0.0".into(),
            source: None,
            package_sha256: None,
            files,
            granted: vec![],
            installed_at: 0,
            dev_path,
        }
    }

    #[test]
    fn round_trips() {
        let root = temp("save");
        let path = root.join("registry.json");
        let mut registry = Registry::default();
        registry.sources.push(Source::parse("o/r").unwrap());
        registry
            .installed
            .insert("hello".into(), installed(FileHashes::new(), None));
        registry.save(&path).unwrap();
        assert_eq!(Registry::load(&path), registry);
        assert_eq!(
            Registry::load(&root.join("missing.json")),
            Registry::default()
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn verifies_installed_plugins() {
        let root = temp("check");
        write_plugin(&root.join("hello"));
        let files = package::hash_dir(&root.join("hello")).unwrap();
        let info = installed(files, None);
        let loaded = Loaded::check("hello", &info, &root);
        assert!(loaded.ok(), "{:?}", loaded.problem);
        assert_eq!(loaded.messages["en"]["n"], "Hello");
        assert_eq!(loaded.read("bg.js").unwrap(), b"island.ready()");
        assert!(loaded.read("other.js").is_err());
        assert!(loaded.read("../registry.json").is_err());

        std::fs::write(root.join("hello/bg.js"), "steal()").unwrap();
        // Caught when serving the file…
        assert!(loaded.read("bg.js").is_err());
        // …and at the next start.
        let loaded = Loaded::check("hello", &info, &root);
        assert_eq!(loaded.problem.map(|p| p.0), Some(Problem::Tampered));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn serves_dev_folders_live() {
        let root = temp("dev");
        let dev = root.join("src");
        write_plugin(&dev);
        let loaded = Loaded::check(
            "hello",
            &installed(FileHashes::new(), Some(dev.clone())),
            &root,
        );
        assert!(loaded.ok());
        std::fs::write(dev.join("bg.js"), "v2").unwrap();
        assert_eq!(loaded.read("bg.js").unwrap(), b"v2");
        let other = Loaded::check("other", &installed(FileHashes::new(), Some(dev)), &root);
        assert_eq!(other.problem.map(|p| p.0), Some(Problem::Invalid));
        std::fs::remove_dir_all(root).unwrap();
    }
}
