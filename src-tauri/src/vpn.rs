//! Bounded access to a local Clash-compatible controller, never a general proxy.
use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};

fn endpoint_url(endpoint: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(endpoint).map_err(|_| "控制器地址无效")?;
    if !matches!(url.scheme(), "http" | "https")
        || !matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
        || !url.username().is_empty()
        || url.password().is_some()
        || !matches!(url.path(), "" | "/")
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("请使用本机控制器地址，如 http://127.0.0.1:9090".into());
    }
    Ok(url)
}

fn request(
    endpoint: &str,
    secret: &str,
    action: &str,
    name: &str,
    value: &str,
    test_url: &str,
    timeout_ms: u64,
) -> Result<Value, String> {
    let mut url = endpoint_url(endpoint)?;
    let timeout = timeout_ms.clamp(1000, 15000);
    let method = match action {
        "proxies" | "configs" => {
            url.set_path(if action == "proxies" {
                "/proxies"
            } else {
                "/configs"
            });
            "GET"
        }
        "delay" | "select" if !name.is_empty() && name.len() <= 1024 => {
            url.path_segments_mut()
                .map_err(|_| "地址无效")?
                .push("proxies")
                .push(name);
            if action == "delay" {
                let test = url::Url::parse(test_url).map_err(|_| "测速地址无效")?;
                if !matches!(test.scheme(), "http" | "https")
                    || !test.username().is_empty()
                    || test.password().is_some()
                {
                    return Err("测速地址必须是 HTTP 或 HTTPS".into());
                }
                url.path_segments_mut()
                    .map_err(|_| "地址无效")?
                    .push("delay");
                url.query_pairs_mut()
                    .append_pair("url", test_url)
                    .append_pair("timeout", &timeout.to_string());
                "GET"
            } else if !value.is_empty() && value.len() <= 1024 {
                "PUT"
            } else {
                return Err("请选择节点".into());
            }
        }
        "mode" if matches!(value, "rule" | "global" | "direct") => {
            url.set_path("/configs");
            "PATCH"
        }
        _ => return Err("不支持的 VPN 操作".into()),
    };
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .proxy(None)
        .http_status_as_error(false)
        .max_redirects(0)
        .timeout_global(Some(Duration::from_millis(timeout + 1000)))
        .build()
        .into();
    let auth = format!("Bearer {}", secret.trim());
    let result = match method {
        "PUT" => agent
            .put(url.as_str())
            .header("Authorization", &auth)
            .header("Content-Type", "application/json")
            .send(json!({"name":value}).to_string().as_bytes()),
        "PATCH" => agent
            .patch(url.as_str())
            .header("Authorization", &auth)
            .header("Content-Type", "application/json")
            .send(json!({"mode":value}).to_string().as_bytes()),
        _ => agent
            .get(url.as_str())
            .header("Authorization", &auth)
            .call(),
    };
    let mut response = result.map_err(|err| match err {
        ureq::Error::Timeout(_) => "控制器请求超时".to_owned(),
        _ => "无法连接本机控制器，请检查客户端及 External Controller 设置".to_owned(),
    })?;
    match response.status().as_u16() {
        200..=299 => {}
        401 | 403 => return Err("控制器密钥无效，请检查 Secret".into()),
        408 | 504 => return Err("节点测速超时".into()),
        status => return Err(format!("控制器 HTTP {status}：操作未成功")),
    }
    let body = response
        .body_mut()
        .with_config()
        .limit(2 * 1024 * 1024)
        .read_to_string()
        .map_err(|_| "控制器响应读取失败")?;
    if body.is_empty() {
        Ok(Value::Null)
    } else {
        serde_json::from_str(&body).map_err(|_| "控制器响应格式无效，请勿填写代理混合端口".into())
    }
}

#[tauri::command]
pub async fn vpn_request(
    window: tauri::WebviewWindow,
    request: VpnRequest,
) -> Result<Value, String> {
    if !matches!(
        window.label(),
        crate::window::ISLAND_LABEL | crate::settings::SETTINGS_LABEL
    ) {
        return Err("不支持的控制器窗口".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        self::request(
            &request.endpoint,
            &request.secret,
            &request.action,
            request.name.as_deref().unwrap_or(""),
            request.value.as_deref().unwrap_or(""),
            request
                .test_url
                .as_deref()
                .unwrap_or("https://www.gstatic.com/generate_204"),
            request.timeout_ms.unwrap_or(4000),
        )
    })
    .await
    .map_err(|_| "控制器请求已停止")?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VpnRequest {
    endpoint: String,
    secret: String,
    action: String,
    name: Option<String>,
    value: Option<String>,
    test_url: Option<String>,
    timeout_ms: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn controller_must_be_loopback_without_credentials_or_paths() {
        assert!(endpoint_url("http://127.0.0.1:9090").is_ok());
        assert!(endpoint_url("http://[::1]:9090").is_ok());
        for endpoint in [
            "https://example.com",
            "http://127.0.0.1:9090/proxies",
            "http://user:secret@localhost",
            "file:///private",
            "http://localhost?token=x",
        ] {
            assert!(endpoint_url(endpoint).is_err());
        }
        assert!(request("http://127.0.0.1:9090", "", "restart", "", "", "", 1000).is_err());
    }

    #[test]
    fn selects_encoded_node_and_reports_auth_errors() {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}", server.server_addr());
        let worker = std::thread::spawn(move || {
            let mut incoming = server.recv().unwrap();
            assert_eq!(incoming.method(), &tiny_http::Method::Put);
            assert!(incoming.url().contains("%2F"));
            let mut body = String::new();
            incoming.as_reader().read_to_string(&mut body).unwrap();
            assert_eq!(
                serde_json::from_str::<Value>(&body).unwrap()["name"],
                "Tokyo"
            );
            incoming.respond(tiny_http::Response::empty(401)).unwrap();
        });
        assert!(
            request(
                &endpoint,
                "fixture",
                "select",
                "group/name",
                "Tokyo",
                "",
                1000
            )
            .unwrap_err()
            .contains("密钥")
        );
        worker.join().unwrap();
    }
}
