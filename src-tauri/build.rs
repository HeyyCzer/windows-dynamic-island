use std::path::Path;

use serde_json::{Map, Value};

fn main() {
    embed_locales();
    println!("cargo:rerun-if-changed=app.manifest");
    // Tauri's default manifest plus the `<msix>` link to the sparse package
    // that lets the island read Windows notifications.
    let windows = tauri_build::WindowsAttributes::new().app_manifest(include_str!("app.manifest"));
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run tauri-build");
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
