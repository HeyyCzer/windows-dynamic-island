use std::path::Path;

use serde_json::{Map, Value};

fn main() {
    embed_locales();
    embed_identifier();
    println!("cargo:rerun-if-changed=app.manifest");
    // Tauri's default manifest plus the `<msix>` link to the sparse package
    // that lets the island read Windows notifications.
    let manifest = include_str!("app.manifest");
    // The Store's MSIX gives the exe its identity; a link to the sparse
    // package would point at another app's package.
    let manifest = if store() { strip_msix(manifest) } else { manifest.to_string() };
    let windows = tauri_build::WindowsAttributes::new().app_manifest(manifest);
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run tauri-build");
}

/// Building the Microsoft Store edition (`--features store`).
fn store() -> bool {
    std::env::var_os("CARGO_FEATURE_STORE").is_some()
}

fn strip_msix(manifest: &str) -> String {
    let start = manifest.find("<msix ").expect("app.manifest: no <msix> element");
    let end = start + manifest[start..].find("/>").expect("app.manifest: unclosed <msix>") + 2;
    format!("{}{}", &manifest[..start], &manifest[end..])
}

/// `APP_IDENTIFIER` env var with the app's `identifier`, for code that runs
/// without an `AppHandle` (the statusline bridge). The Store edition takes it
/// from `tauri.microsoftstore.conf.json`, merged over `tauri.conf.json`.
fn embed_identifier() {
    let file = if store() { "tauri.microsoftstore.conf.json" } else { "tauri.conf.json" };
    println!("cargo:rerun-if-changed={file}");
    let text = std::fs::read_to_string(file).unwrap_or_else(|_| panic!("{file} not found"));
    let conf: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{file}: invalid JSON: {e}"));
    let id = conf["identifier"].as_str().unwrap_or_else(|| panic!("{file}: no identifier"));
    println!("cargo:rustc-env=APP_IDENTIFIER={id}");
}

/// Generates `$OUT_DIR/locales.rs`: every `src/locales/*.json5` as
/// `(code, flat JSON)`, so adding a language needs no Rust change. Nested keys
/// are flattened to dotted ones, same as `vite-plugin-locales.ts`.
fn embed_locales() {
    let dir = Path::new("../src/locales");
    println!("cargo:rerun-if-changed={}", dir.display());

    let mut files: Vec<_> = std::fs::read_dir(dir)
        .expect("src/locales not found")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "json5"))
        .collect();
    files.sort();

    let items: String = files
        .iter()
        .map(|path| {
            let code = path.file_stem().unwrap().to_string_lossy();
            let text = std::fs::read_to_string(path).unwrap();
            let tree: Value = json5::from_str(&text)
                .unwrap_or_else(|e| panic!("{}: {e}", path.display()));
            let mut flat = Map::new();
            flatten(&tree, "", &mut flat);
            let json = Value::Object(flat).to_string();
            format!("({code:?}, {json:?}),\n")
        })
        .collect();

    let out = Path::new(&std::env::var("OUT_DIR").unwrap()).join("locales.rs");
    std::fs::write(out, format!("&[\n{items}]")).unwrap();
}

fn flatten(value: &Value, prefix: &str, out: &mut Map<String, Value>) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let path = if prefix.is_empty() { key.clone() } else { format!("{prefix}.{key}") };
                flatten(child, &path, out);
            }
        }
        leaf => {
            out.insert(prefix.to_string(), leaf.clone());
        }
    }
}
