//! `plugin.json`: what a plugin is, what it adds to the island and what it
//! may do. See `docs/plugins/manifest.md` for the format.
//!
//! Every user-visible string (`name`, titles, labels…) is a key into the
//! plugin's own `locales/<code>.json`; the frontend namespaces them.

use std::cmp::Ordering;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::permissions::Permission;

/// The SDK this build implements. A plugin asking for `major.minor` loads when
/// the major matches and its minor is not newer than ours.
pub const SDK_VERSION: (u32, u32) = (1, 0);

/// Name of the manifest at the root of a plugin package.
pub const MANIFEST_FILE: &str = "plugin.json";

/// The reference locale every plugin must ship.
pub const REFERENCE_LOCALE: &str = "locales/en.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub id: String,
    pub version: String,
    /// SDK version the plugin was written for (`"1.0"`).
    pub sdk: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    /// Path to an image in the package.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// Script (or HTML page) the island runs for the plugin, out of sight.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
    /// Keep the background running for as long as the plugin is on. Without
    /// it the background only runs when something happens (an alarm, a
    /// shortcut, a panel's state…) and stops once idle, which saves memory.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub persistent: bool,
    #[serde(default)]
    pub modules: Vec<ModuleDef>,
    #[serde(default)]
    pub settings: Vec<SettingDef>,
    #[serde(default)]
    pub shortcuts: Vec<ShortcutDef>,
    #[serde(default)]
    pub permissions: Vec<String>,
}

/// A tab of the island.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModuleDef {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// HTML page shown when the tab is open.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub panel: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<Size>,
    #[serde(default = "yes")]
    pub enabled_by_default: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SettingType {
    Boolean,
    Number,
    String,
    Select,
}

/// A setting the settings window renders for the plugin.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SettingDef {
    pub key: String,
    #[serde(rename = "type")]
    pub kind: SettingType,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub default: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,
    /// Translation key of the unit shown next to a number (`"min"`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<SelectOption>,
    /// Hide the value while typing (tokens).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SelectOption {
    pub value: String,
    pub label: String,
}

/// A global shortcut that fires `onShortcut(id)` in the plugin.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutDef {
    pub id: String,
    pub label: String,
    /// Suggested combination (`"Ctrl+Alt+P"`); the user can change or clear it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<String>,
}

fn yes() -> bool {
    true
}

impl Manifest {
    pub fn parse(text: &str) -> Result<Self, String> {
        let manifest: Manifest =
            serde_json::from_str(text).map_err(|e| format!("plugin.json: {e}"))?;
        manifest.validate()?;
        Ok(manifest)
    }

    /// Structural checks; files are checked against the package separately.
    pub fn validate(&self) -> Result<(), String> {
        check_id("id", &self.id, 2, 48)?;
        Version::parse(&self.version)
            .ok_or_else(|| format!("version: '{}' is not x.y.z", self.version))?;
        let sdk = parse_sdk(&self.sdk)
            .ok_or_else(|| format!("sdk: '{}' is not major.minor", self.sdk))?;
        if !sdk_compatible(sdk) {
            return Err(format!(
                "needs SDK {}, this app has {}.{}",
                self.sdk, SDK_VERSION.0, SDK_VERSION.1
            ));
        }
        check_text("name", &self.name)?;
        if let Some(url) = &self.homepage
            && !url.starts_with("https://")
        {
            return Err("homepage: only https links".into());
        }
        for path in self.files() {
            check_path(path)?;
        }

        unique("module", self.modules.iter().map(|m| m.id.as_str()))?;
        for module in &self.modules {
            check_id("module id", &module.id, 1, 32)?;
            check_text("module title", &module.title)?;
            if let Some(size) = module.size
                && !(160..=900).contains(&size.width) | !(60..=600).contains(&size.height)
            {
                return Err(format!("module '{}': size out of range", module.id));
            }
        }
        if self.modules.is_empty() && self.background.is_none() {
            return Err("a plugin needs a module or a background script".into());
        }
        if self.persistent && self.background.is_none() {
            return Err("'persistent' needs a background script".into());
        }

        unique("setting", self.settings.iter().map(|s| s.key.as_str()))?;
        for setting in &self.settings {
            check_id("setting key", &setting.key, 1, 32)?;
            check_text("setting label", &setting.label)?;
            setting.validate()?;
        }

        unique("shortcut", self.shortcuts.iter().map(|s| s.id.as_str()))?;
        for shortcut in &self.shortcuts {
            check_id("shortcut id", &shortcut.id, 1, 32)?;
            check_text("shortcut label", &shortcut.label)?;
        }

        for permission in &self.permissions {
            Permission::parse(permission)?;
        }
        Ok(())
    }

    /// Package paths the manifest points at.
    pub fn files(&self) -> impl Iterator<Item = &str> {
        self.icon
            .iter()
            .chain(&self.background)
            .chain(
                self.modules
                    .iter()
                    .flat_map(|m| m.icon.iter().chain(&m.panel)),
            )
            .map(String::as_str)
    }
}

impl SettingDef {
    fn validate(&self) -> Result<(), String> {
        let ok = match self.kind {
            SettingType::Boolean => self.default.is_boolean(),
            SettingType::Number => self.default.as_f64().is_some_and(|n| {
                self.min.is_none_or(|min| n >= min) && self.max.is_none_or(|max| n <= max)
            }),
            SettingType::String => self.default.is_string(),
            SettingType::Select => {
                !self.options.is_empty()
                    && self
                        .options
                        .iter()
                        .any(|o| Some(o.value.as_str()) == self.default.as_str())
            }
        };
        if ok {
            Ok(())
        } else {
            Err(format!(
                "setting '{}': default doesn't fit its type",
                self.key
            ))
        }
    }
}

/// `[a-z0-9-]`, no leading/trailing dash: safe in setting keys, URLs and paths.
fn check_id(what: &str, id: &str, min: usize, max: usize) -> Result<(), String> {
    let ok = (min..=max).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !id.starts_with('-')
        && !id.ends_with('-');
    if ok {
        Ok(())
    } else {
        Err(format!(
            "{what}: '{id}' must be {min}-{max} of a-z, 0-9 and -"
        ))
    }
}

fn check_text(what: &str, text: &str) -> Result<(), String> {
    if text.trim().is_empty() || text.len() > 200 {
        Err(format!("{what}: empty or too long"))
    } else {
        Ok(())
    }
}

fn unique<'a>(what: &str, ids: impl Iterator<Item = &'a str>) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for id in ids {
        if !seen.insert(id) {
            return Err(format!("{what} '{id}' is declared twice"));
        }
    }
    Ok(())
}

/// A relative, forward-slash path that stays inside the package.
pub fn check_path(path: &str) -> Result<(), String> {
    let bad = path.is_empty()
        || path.len() > 200
        || path.starts_with('/')
        || path.contains('\\')
        || path.contains(':')
        || path.contains('\0')
        || path
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..");
    if bad {
        Err(format!(
            "path '{path}' must be relative and inside the package"
        ))
    } else {
        Ok(())
    }
}

/// `"1"` or `"1.2"`.
pub fn parse_sdk(text: &str) -> Option<(u32, u32)> {
    let mut parts = text.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().map_or(Some(0), |m| m.parse().ok())?;
    parts.next().is_none().then_some((major, minor))
}

pub fn sdk_compatible((major, minor): (u32, u32)) -> bool {
    major == SDK_VERSION.0 && minor <= SDK_VERSION.1
}

/// `major.minor.patch[-pre]`, enough to tell which of two releases is newer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Version {
    numbers: [u64; 3],
    pre: Option<String>,
}

impl Version {
    pub fn parse(text: &str) -> Option<Self> {
        let (core, pre) = match text.split_once('-') {
            Some((core, pre)) if !pre.is_empty() => (core, Some(pre.to_string())),
            Some(_) => return None,
            None => (text, None),
        };
        let mut numbers = [0; 3];
        let mut parts = core.split('.');
        for n in &mut numbers {
            let part = parts.next()?;
            if part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            *n = part.parse().ok()?;
        }
        parts.next().is_none().then_some(Self { numbers, pre })
    }
}

impl Ord for Version {
    fn cmp(&self, other: &Self) -> Ordering {
        self.numbers
            .cmp(&other.numbers)
            .then_with(|| match (&self.pre, &other.pre) {
                (None, None) => Ordering::Equal,
                // A pre-release comes before its release.
                (None, Some(_)) => Ordering::Greater,
                (Some(_), None) => Ordering::Less,
                (Some(a), Some(b)) => a.cmp(b),
            })
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Whether `candidate` is a newer release than `current`.
pub fn is_newer(candidate: &str, current: &str) -> bool {
    match (Version::parse(candidate), Version::parse(current)) {
        (Some(a), Some(b)) => a > b,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal() -> serde_json::Value {
        serde_json::json!({
            "id": "pomodoro",
            "version": "1.0.0",
            "sdk": "1.0",
            "name": "meta.name",
            "modules": [{ "id": "timer", "title": "timer.title", "panel": "panel.html" }],
        })
    }

    fn parse(value: serde_json::Value) -> Result<Manifest, String> {
        Manifest::parse(&value.to_string())
    }

    #[test]
    fn accepts_a_minimal_manifest() {
        let manifest = parse(minimal()).unwrap();
        assert_eq!(manifest.modules[0].id, "timer");
        assert!(manifest.modules[0].enabled_by_default);
        assert_eq!(manifest.files().collect::<Vec<_>>(), ["panel.html"]);
    }

    #[test]
    fn rejects_bad_ids() {
        for id in [
            "",
            "a",
            "Pomodoro",
            "pomo.doro",
            "-pomo",
            "pomo_doro",
            "../x",
        ] {
            let mut m = minimal();
            m["id"] = id.into();
            assert!(parse(m).is_err(), "{id}");
        }
    }

    #[test]
    fn rejects_paths_leaving_the_package() {
        for path in [
            "../x.js", "/x.js", "a//b.js", "C:/x.js", "a\\b.js", "./x.js",
        ] {
            let mut m = minimal();
            m["background"] = path.into();
            assert!(parse(m).is_err(), "{path}");
        }
        let mut m = minimal();
        m["background"] = "dist/background.js".into();
        assert!(parse(m).is_ok());
    }

    #[test]
    fn checks_the_sdk_version() {
        assert_eq!(parse_sdk("1"), Some((1, 0)));
        assert_eq!(parse_sdk("1.3"), Some((1, 3)));
        assert_eq!(parse_sdk("1.3.0"), None);
        assert!(sdk_compatible((1, 0)));
        assert!(!sdk_compatible((SDK_VERSION.0, SDK_VERSION.1 + 1)));
        assert!(!sdk_compatible((2, 0)));
        let mut m = minimal();
        m["sdk"] = "2.0".into();
        assert!(parse(m).unwrap_err().contains("needs SDK"));
    }

    #[test]
    fn needs_something_to_run() {
        let mut m = minimal();
        m["modules"] = serde_json::json!([]);
        assert!(parse(m.clone()).is_err());
        m["background"] = "bg.js".into();
        assert!(parse(m).is_ok());
    }

    #[test]
    fn persistent_needs_a_background() {
        let mut m = minimal();
        m["persistent"] = true.into();
        assert!(parse(m.clone()).unwrap_err().contains("persistent"));
        m["background"] = "bg.js".into();
        assert!(parse(m.clone()).unwrap().persistent);
        m.as_object_mut().unwrap().remove("persistent");
        assert!(!parse(m).unwrap().persistent);
    }

    #[test]
    fn checks_setting_defaults() {
        let mut m = minimal();
        m["settings"] = serde_json::json!([
            { "key": "work", "type": "number", "label": "l", "default": 25, "min": 1, "max": 120 },
            { "key": "sound", "type": "boolean", "label": "l", "default": true },
            { "key": "mode", "type": "select", "label": "l", "default": "a",
              "options": [{ "value": "a", "label": "a" }] },
        ]);
        assert!(parse(m.clone()).is_ok());
        m["settings"][0]["default"] = 500.into();
        assert!(parse(m.clone()).is_err());
        m["settings"][0]["default"] = 25.into();
        m["settings"][2]["default"] = "b".into();
        assert!(parse(m).is_err());
    }

    #[test]
    fn rejects_duplicates_and_unknown_permissions() {
        let mut m = minimal();
        m["modules"] = serde_json::json!([
            { "id": "a", "title": "t" },
            { "id": "a", "title": "t" },
        ]);
        assert!(parse(m).is_err());
        let mut m = minimal();
        m["permissions"] = serde_json::json!(["root"]);
        assert!(parse(m).is_err());
    }

    #[test]
    fn compares_versions() {
        assert!(is_newer("1.0.1", "1.0.0"));
        assert!(is_newer("1.10.0", "1.9.9"));
        assert!(is_newer("1.0.0", "1.0.0-beta"));
        assert!(!is_newer("1.0.0", "1.0.0"));
        assert!(!is_newer("1.0", "0.9.0"));
        assert!(Version::parse("1.0.0-").is_none());
        assert!(Version::parse("01.a.0").is_none());
    }
}
