//! Independently downloaded plugin packages. No plugin source is embedded here.
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::Manager;

const LIMIT: u64 = 8 * 1024 * 1024;
const CATALOG: &str = "https://github.com/shawn89890916/windows-dynamic-island/releases/download/plugins/catalog.json";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Package {
    format_version: u32,
    manifest: Value,
    code: String,
    #[serde(default)]
    css: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    manifest: Value,
    code: String,
    code_sha256: String,
    css_hash: String,
    sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Loaded {
    manifest: Value,
    code: String,
    css: String,
    sha256: String,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn valid_id(id: &str) -> bool {
    (3..=120).contains(&id.len())
        && id.contains('.')
        && !id.contains("..")
        && id.starts_with(|c: char| c.is_ascii_lowercase())
        && id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"._-".contains(&c))
}

fn validate(package: &Package) -> Result<&str, String> {
    let manifest = &package.manifest;
    let id = manifest["id"].as_str().ok_or("插件缺少 id")?;
    if !valid_id(id) {
        return Err("插件 id 无效".into());
    }
    let version = manifest["version"].as_str().ok_or("插件缺少版本")?;
    if version.is_empty()
        || version.len() > 48
        || !version.starts_with(|c: char| c.is_ascii_digit())
        || !version
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b".-+".contains(&c))
    {
        return Err("插件版本无效".into());
    }
    if package.format_version != 1 || manifest["sdkVersion"].as_u64() != Some(1) {
        return Err("插件需要不同版本的宿主 SDK".into());
    }
    if manifest["name"]
        .as_str()
        .is_none_or(|s| s.is_empty() || s.len() > 240)
        || package.code.is_empty()
        || package.code.len() > 4 * 1024 * 1024
        || package.css.len() > 2 * 1024 * 1024
    {
        return Err("插件内容或大小无效".into());
    }
    if let Some(fields) = manifest["settings"].as_array()
        && (fields.len() > 64
            || fields.iter().any(|f| {
                f["key"].as_str().is_none_or(|k| {
                    k.len() > 100 || matches!(k, "__proto__" | "prototype" | "constructor")
                })
            }))
    {
        return Err("插件设置字段无效".into());
    }
    Ok(id)
}

fn download(url: &str) -> Result<String, String> {
    let parsed = url::Url::parse(url).map_err(|_| "下载地址无效")?;
    if parsed.scheme() != "https"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
    {
        return Err("插件下载需要不含凭据的 HTTPS 地址".into());
    }
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(30)))
        .build()
        .into();
    agent
        .get(url)
        .call()
        .map_err(|_| "无法下载插件，请检查网络后重试")?
        .body_mut()
        .with_config()
        .limit(LIMIT)
        .read_to_string()
        .map_err(|_| "插件下载超时或超过大小限制".into())
}

fn cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("plugins"))
        .map_err(|_| "无法读取插件目录".into())
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = path.with_extension("partial");
    let previous = path.with_extension("previous");
    std::fs::write(&temp, bytes).map_err(|_| "无法保存插件文件")?;
    if path.exists() {
        if previous.exists() {
            std::fs::remove_file(&previous).map_err(|_| "无法替换插件备份")?;
        }
        std::fs::rename(path, &previous).map_err(|_| "无法备份原插件")?;
    }
    if std::fs::rename(&temp, path).is_err() {
        if previous.exists() {
            let _ = std::fs::rename(&previous, path);
        }
        let _ = std::fs::remove_file(temp);
        return Err("无法替换插件，已保留原版本".into());
    }
    Ok(())
}

fn install(
    root: &Path,
    content: &str,
    expected: Option<(&str, &str, &str)>,
) -> Result<Loaded, String> {
    if content.len() as u64 > LIMIT {
        return Err("插件超过大小限制".into());
    }
    let package: Package =
        serde_json::from_str(content).map_err(|_| "文件不是可执行插件包；仅有清单不能安装")?;
    let id = validate(&package)?.to_owned();
    let sha256 = digest(content.as_bytes());
    if let Some((expected_id, version, hash)) = expected
        && (id != expected_id
            || package.manifest["version"] != version
            || sha256 != hash.to_ascii_lowercase())
    {
        return Err("插件身份、版本或 SHA-256 校验失败；原版本未更改".into());
    }
    std::fs::create_dir_all(root).map_err(|_| "无法创建插件目录")?;
    let css_hash = digest(package.css.as_bytes());
    let css_path = root.join(format!("{css_hash}.css"));
    if !css_path.exists() {
        std::fs::write(&css_path, &package.css).map_err(|_| "无法保存插件样式")?;
    }
    let code_sha256 = digest(package.code.as_bytes());
    let stored = Stored {
        manifest: package.manifest,
        code: package.code,
        code_sha256,
        css_hash,
        sha256,
    };
    let bytes = serde_json::to_vec(&stored).map_err(|_| "无法保存插件清单")?;
    write_atomic(&root.join(format!("{id}.json")), &bytes)?;
    load(root, &id)
}

fn load(root: &Path, id: &str) -> Result<Loaded, String> {
    if !valid_id(id) {
        return Err("插件 id 无效".into());
    }
    let bytes = std::fs::read(root.join(format!("{id}.json")))
        .map_err(|_| "插件文件尚未下载，请在设置中安装")?;
    if bytes.len() as u64 > LIMIT {
        return Err("本地插件文件过大".into());
    }
    let stored: Stored =
        serde_json::from_slice(&bytes).map_err(|_| "本地插件文件损坏，请重新安装")?;
    if stored.css_hash.len() != 64
        || !stored.css_hash.bytes().all(|b| b.is_ascii_hexdigit())
        || stored.code_sha256.len() != 64
        || digest(stored.code.as_bytes()) != stored.code_sha256
        || stored.manifest["id"] != id
    {
        return Err("本地插件清单无效".into());
    }
    let css = std::fs::read_to_string(root.join(format!("{}.css", stored.css_hash)))
        .map_err(|_| "本地插件样式缺失，请重新安装")?;
    if digest(css.as_bytes()) != stored.css_hash {
        return Err("本地插件样式校验失败".into());
    }
    Ok(Loaded {
        manifest: stored.manifest,
        code: stored.code,
        css,
        sha256: stored.sha256,
    })
}

fn allow_window(window: &tauri::WebviewWindow, mutation: bool) -> Result<(), String> {
    if window.label() == crate::settings::SETTINGS_LABEL
        || (!mutation && window.label() == crate::window::ISLAND_LABEL)
    {
        Ok(())
    } else {
        Err("该窗口不能管理插件文件".into())
    }
}

#[tauri::command]
pub async fn plugin_catalog(window: tauri::WebviewWindow) -> Result<Value, String> {
    allow_window(&window, false)?;
    tauri::async_runtime::spawn_blocking(|| {
        let text = download(CATALOG)?;
        let index: Value = serde_json::from_str(&text).map_err(|_| "插件目录响应无效")?;
        if index["formatVersion"] != 1 || !index["plugins"].is_array() {
            return Err("插件目录格式不受支持".into());
        }
        Ok(index)
    })
    .await
    .map_err(|_| "插件目录读取已停止")?
}

#[tauri::command]
pub async fn plugin_download(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    descriptor: Value,
) -> Result<Loaded, String> {
    allow_window(&window, true)?;
    let root = cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let id = descriptor["id"].as_str().ok_or("缺少插件 id")?;
        let version = descriptor["version"].as_str().ok_or("缺少插件版本")?;
        let hash = descriptor["sha256"].as_str().ok_or("缺少插件校验值")?;
        if !valid_id(id) || hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("插件目录条目无效".into());
        }
        let content = download(descriptor["packageUrl"].as_str().ok_or("缺少插件包地址")?)?;
        install(&root, &content, Some((id, version, hash)))
    })
    .await
    .map_err(|_| "插件下载已停止")?
}

#[tauri::command]
pub async fn plugin_import(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    content: String,
) -> Result<Loaded, String> {
    allow_window(&window, true)?;
    let root = cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || install(&root, &content, None))
        .await
        .map_err(|_| "插件导入已停止")?
}

#[tauri::command]
pub async fn plugin_load(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    id: String,
) -> Result<Loaded, String> {
    allow_window(&window, false)?;
    let root = cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || load(&root, &id))
        .await
        .map_err(|_| "插件加载已停止")?
}

#[tauri::command]
pub fn plugin_remove(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    id: String,
) -> Result<(), String> {
    allow_window(&window, true)?;
    if !valid_id(&id) {
        return Err("插件 id 无效".into());
    }
    let root = cache_dir(&app)?;
    if !root.exists() {
        return Ok(());
    }
    for suffix in ["json", "previous", "partial"] {
        let file = root.join(format!("{id}.{suffix}"));
        if file.exists() {
            std::fs::remove_file(file).map_err(|_| "无法删除插件文件")?;
        }
    }
    // CSS is shared by hash; only remove files no installed/rollback package uses.
    let files: Vec<_> = std::fs::read_dir(&root)
        .map_err(|_| "无法读取插件目录")?
        .flatten()
        .map(|e| e.path())
        .collect();
    let used: Vec<String> = files
        .iter()
        .filter(|p| {
            matches!(
                p.extension().and_then(|s| s.to_str()),
                Some("json" | "previous")
            )
        })
        .filter_map(|p| std::fs::read(p).ok())
        .filter_map(|b| serde_json::from_slice::<Stored>(&b).ok())
        .map(|p| p.css_hash)
        .collect();
    for path in files {
        if path.extension().is_some_and(|ext| ext == "css")
            && path
                .file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(|hash| {
                    hash.len() == 64
                        && hash.bytes().all(|b| b.is_ascii_hexdigit())
                        && !used.iter().any(|u| u == hash)
                })
        {
            let _ = std::fs::remove_file(path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture(version: &str) -> String {
        json!({"formatVersion":1,"manifest":{"id":"test.example","name":"Example","version":version,"sdkVersion":1},"code":"globalThis.example=true;","css":".example {color:white}"}).to_string()
    }

    #[test]
    fn installs_actual_code_offline_preserves_old_on_hash_failure_and_shares_css() {
        let root = std::env::temp_dir().join(format!(
            "island-plugins-{}-{}",
            std::process::id(),
            super::super::providers::now_ms()
        ));
        let first = fixture("1.0.0");
        let installed = install(
            &root,
            &first,
            Some(("test.example", "1.0.0", &digest(first.as_bytes()))),
        )
        .unwrap();
        assert!(!installed.code.is_empty());
        assert_eq!(
            load(&root, "test.example").unwrap().manifest["version"],
            "1.0.0"
        );
        assert!(
            install(
                &root,
                &fixture("1.1.0"),
                Some(("test.example", "1.1.0", &"0".repeat(64)))
            )
            .is_err()
        );
        assert_eq!(
            load(&root, "test.example").unwrap().manifest["version"],
            "1.0.0"
        );
        install(&root, &fixture("1.1.0"), None).unwrap();
        assert!(root.join("test.example.previous").is_file());
        assert_eq!(
            std::fs::read_dir(&root)
                .unwrap()
                .flatten()
                .filter(|e| e.path().extension().is_some_and(|x| x == "css"))
                .count(),
            1
        );
        assert!(
            root.canonicalize()
                .unwrap()
                .starts_with(std::env::temp_dir().canonicalize().unwrap())
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_traversal_metadata_only_and_wrong_sdk() {
        for id in ["../outside", "foo/../../bar", "CON", "foo..bar", "a:b.c"] {
            assert!(!valid_id(id));
        }
        let root = std::env::temp_dir();
        assert!(
            install(
                &root,
                "{\"id\":\"test.example\",\"name\":\"Not a package\"}",
                None
            )
            .is_err()
        );
        let mut package: Package = serde_json::from_str(&fixture("1.0.0")).unwrap();
        package.manifest["sdkVersion"] = json!(999);
        assert!(validate(&package).is_err());
    }
}
