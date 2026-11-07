//! Plugin packages: a zip with `plugin.json` at its root. Installing checks the
//! package's SHA-256 against the index, unpacks it without letting any entry
//! escape the target folder, and records a SHA-256 per file; those are checked
//! again before the plugin loads and on every file served to it.

use std::collections::BTreeMap;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use super::manifest::{MANIFEST_FILE, Manifest, REFERENCE_LOCALE, check_path};

/// Largest package accepted for download.
pub const MAX_PACKAGE_BYTES: u64 = 30 * 1024 * 1024;
const MAX_FILES: usize = 1000;
const MAX_UNPACKED_BYTES: u64 = 80 * 1024 * 1024;

/// Relative path (forward slashes) → hex SHA-256.
pub type FileHashes = BTreeMap<String, String>;

/// Locale code → flat key → text.
pub type Messages = BTreeMap<String, BTreeMap<String, String>>;

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

pub fn verify_sha256(bytes: &[u8], expected: &str) -> Result<(), String> {
    let actual = sha256_hex(bytes);
    if actual.eq_ignore_ascii_case(expected) {
        Ok(())
    } else {
        Err(format!(
            "the package's hash doesn't match the index (expected {expected}, got {actual})"
        ))
    }
}

/// Unpacks `zip` into `dest` (which must not exist yet) and checks what it
/// holds. On error `dest` may be left half-written: callers unpack into a
/// temporary folder.
pub fn unpack(zip: &[u8], dest: &Path) -> Result<(Manifest, FileHashes), String> {
    let mut archive =
        zip::ZipArchive::new(Cursor::new(zip)).map_err(|e| format!("not a zip: {e}"))?;
    if archive.len() > MAX_FILES {
        return Err(format!("more than {MAX_FILES} files"));
    }
    let mut files = FileHashes::new();
    let mut total = 0u64;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        // The raw name, not `enclosed_name`: anything odd is an error, not skipped.
        let name = entry.name().replace('\\', "/");
        if entry.is_dir() {
            check_path(name.trim_end_matches('/'))?;
            continue;
        }
        if entry.is_symlink() {
            return Err(format!("{name}: links aren't allowed"));
        }
        check_path(&name)?;
        total += entry.size();
        if total > MAX_UNPACKED_BYTES {
            return Err("the package is too big once unpacked".into());
        }
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        // `take`: the size in the header is only a claim.
        (&mut entry)
            .take(MAX_UNPACKED_BYTES)
            .read_to_end(&mut bytes)
            .map_err(|e| format!("{name}: {e}"))?;
        let path = dest.join(&name);
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, &bytes).map_err(|e| format!("{name}: {e}"))?;
        files.insert(name, sha256_hex(&bytes));
    }
    let manifest = check_contents(dest, &files)?;
    Ok((manifest, files))
}

/// Reads and checks the manifest of an unpacked plugin.
pub fn check_contents(dir: &Path, files: &FileHashes) -> Result<Manifest, String> {
    if !files.contains_key(MANIFEST_FILE) {
        return Err(format!("no {MANIFEST_FILE} at the package's root"));
    }
    let text = std::fs::read_to_string(dir.join(MANIFEST_FILE)).map_err(|e| e.to_string())?;
    let manifest = Manifest::parse(&text)?;
    for path in manifest.files() {
        if !files.contains_key(path) {
            return Err(format!(
                "{MANIFEST_FILE} points at '{path}', which isn't in the package"
            ));
        }
    }
    if !files.contains_key(REFERENCE_LOCALE) {
        return Err(format!("{REFERENCE_LOCALE} is required"));
    }
    load_messages(dir, files)?;
    Ok(manifest)
}

/// Hashes every file below `dir` (a plugin being developed, loaded from disk).
pub fn hash_dir(dir: &Path) -> Result<FileHashes, String> {
    fn walk(root: &Path, dir: &Path, files: &mut FileHashes) -> Result<(), String> {
        for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            // Sources and dependencies aren't served.
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_dir() {
                walk(root, &path, files)?;
            } else if kind.is_file() {
                if files.len() >= MAX_FILES {
                    return Err(format!("more than {MAX_FILES} files"));
                }
                let rel = relative(root, &path)?;
                let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
                files.insert(rel, sha256_hex(&bytes));
            }
        }
        Ok(())
    }
    let mut files = FileHashes::new();
    walk(dir, dir, &mut files)?;
    Ok(files)
}

fn relative(root: &Path, path: &Path) -> Result<String, String> {
    let rel = path.strip_prefix(root).map_err(|e| e.to_string())?;
    let parts: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    Ok(parts.join("/"))
}

/// Every recorded file is still there, unchanged.
pub fn verify_files(dir: &Path, files: &FileHashes) -> Result<(), String> {
    for (name, hash) in files {
        verify_file(dir, name, hash)?;
    }
    Ok(())
}

/// Reads one recorded file, failing if it changed since it was installed.
pub fn read_verified(dir: &Path, name: &str, hash: &str) -> Result<Vec<u8>, String> {
    check_path(name)?;
    let bytes = std::fs::read(file_path(dir, name)).map_err(|e| format!("{name}: {e}"))?;
    if sha256_hex(&bytes) != hash {
        return Err(format!("{name} was modified after it was installed"));
    }
    Ok(bytes)
}

fn verify_file(dir: &Path, name: &str, hash: &str) -> Result<(), String> {
    read_verified(dir, name, hash).map(|_| ())
}

pub fn file_path(dir: &Path, name: &str) -> PathBuf {
    name.split('/')
        .fold(dir.to_path_buf(), |path, part| path.join(part))
}

/// `locales/<code>.json` files, flattened to dotted keys.
pub fn load_messages(dir: &Path, files: &FileHashes) -> Result<Messages, String> {
    let mut messages = Messages::new();
    for name in files.keys() {
        let Some(code) = name
            .strip_prefix("locales/")
            .and_then(|n| n.strip_suffix(".json"))
            .filter(|c| !c.contains('/'))
        else {
            continue;
        };
        let text = std::fs::read_to_string(file_path(dir, name)).map_err(|e| e.to_string())?;
        let tree: Value = serde_json::from_str(&text).map_err(|e| format!("{name}: {e}"))?;
        let Value::Object(tree) = tree else {
            return Err(format!("{name}: must be an object"));
        };
        let mut flat = BTreeMap::new();
        flatten(&tree, "", &mut flat);
        messages.insert(code.to_string(), flat);
    }
    Ok(messages)
}

fn flatten(tree: &Map<String, Value>, prefix: &str, out: &mut BTreeMap<String, String>) {
    for (key, value) in tree {
        let path = if prefix.is_empty() {
            key.clone()
        } else {
            format!("{prefix}.{key}")
        };
        match value {
            Value::Object(child) => flatten(child, &path, out),
            Value::String(text) => {
                out.insert(path, text.clone());
            }
            other => {
                out.insert(path, other.to_string());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    const MANIFEST: &str = r#"{
        "id": "hello", "version": "1.0.0", "sdk": "1.0", "name": "meta.name",
        "modules": [{ "id": "main", "title": "main.title", "panel": "panel.html" }]
    }"#;

    fn zip_of(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut out);
            let options = zip::write::SimpleFileOptions::default();
            for (name, text) in entries {
                zip.start_file(*name, options).unwrap();
                zip.write_all(text.as_bytes()).unwrap();
            }
            zip.finish().unwrap();
        }
        out.into_inner()
    }

    fn temp(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("island-plugin-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn valid() -> Vec<(&'static str, &'static str)> {
        vec![
            ("plugin.json", MANIFEST),
            ("panel.html", "<p>hi</p>"),
            (
                "locales/en.json",
                r#"{ "meta": { "name": "Hello" }, "main": { "title": "Hi" } }"#,
            ),
            ("locales/pt-BR.json", r#"{ "meta": { "name": "Olá" } }"#),
        ]
    }

    #[test]
    fn unpacks_and_hashes() {
        let dir = temp("ok");
        let (manifest, files) = unpack(&zip_of(&valid()), &dir).unwrap();
        assert_eq!(manifest.id, "hello");
        assert_eq!(files.len(), 4);
        assert_eq!(files["panel.html"], sha256_hex(b"<p>hi</p>"));
        verify_files(&dir, &files).unwrap();
        let messages = load_messages(&dir, &files).unwrap();
        assert_eq!(messages["en"]["main.title"], "Hi");
        assert_eq!(messages["pt-BR"]["meta.name"], "Olá");
        assert_eq!(hash_dir(&dir).unwrap(), files);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn notices_tampering() {
        let dir = temp("tamper");
        let (_, files) = unpack(&zip_of(&valid()), &dir).unwrap();
        std::fs::write(dir.join("panel.html"), "<script>evil()</script>").unwrap();
        assert!(verify_files(&dir, &files).unwrap_err().contains("modified"));
        std::fs::remove_file(dir.join("panel.html")).unwrap();
        assert!(verify_files(&dir, &files).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn refuses_entries_escaping_the_folder() {
        for evil in [
            "../evil.js",
            "/abs.js",
            "a/../../evil.js",
            "C:/evil.js",
            "..\\evil.js",
        ] {
            let dir = temp("slip");
            let mut entries = valid();
            entries.push((evil, "x"));
            assert!(unpack(&zip_of(&entries), &dir).is_err(), "{evil}");
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    #[test]
    fn checks_what_the_manifest_points_at() {
        let dir = temp("missing");
        let entries: Vec<_> = valid()
            .into_iter()
            .filter(|(n, _)| *n != "panel.html")
            .collect();
        assert!(
            unpack(&zip_of(&entries), &dir)
                .unwrap_err()
                .contains("panel.html")
        );
        let _ = std::fs::remove_dir_all(&dir);
        let entries: Vec<_> = valid()
            .into_iter()
            .filter(|(n, _)| *n != "locales/en.json")
            .collect();
        assert!(
            unpack(&zip_of(&entries), &dir)
                .unwrap_err()
                .contains("en.json")
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn checks_the_package_hash() {
        let zip = zip_of(&valid());
        verify_sha256(&zip, &sha256_hex(&zip).to_uppercase()).unwrap();
        assert!(verify_sha256(&zip, &"0".repeat(64)).is_err());
    }
}
