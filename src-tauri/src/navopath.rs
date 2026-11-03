//! NavoPath's session headers are not accepted by its browser CORS preflight.
//! Send desktop MCP requests natively without exposing a general HTTP proxy.
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpResponse {
    status: u16,
    session_id: Option<String>,
    body: String,
}

fn validate(endpoint: &str, body: &Value) -> Result<(), String> {
    let url = url::Url::parse(endpoint).map_err(|_| "Invalid MCP endpoint")?;
    let loopback = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if url.host_str().is_none()
        || !(url.scheme() == "https" || (url.scheme() == "http" && loopback))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("MCP requires HTTPS (or a local HTTP endpoint)".into());
    }
    if body["jsonrpc"] != "2.0" {
        return Err("Invalid MCP request".into());
    }
    match body["method"].as_str() {
        Some("initialize" | "notifications/initialized") => Ok(()),
        Some("tools/call")
            if matches!(
                body["params"]["name"].as_str(),
                Some("get_workspace_summary" | "list_tasks" | "create_task" | "update_task")
            ) =>
        {
            Ok(())
        }
        _ => Err("Unsupported NavoPath method".into()),
    }
}

fn request(
    endpoint: String,
    token: String,
    body: Value,
    session_id: Option<String>,
    protocol_version: Option<String>,
) -> Result<McpResponse, String> {
    validate(&endpoint, &body)?;
    if token.trim().is_empty() {
        return Err("MCP token is required".into());
    }
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .max_redirects(0)
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .into();
    let mut call = agent
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", token.trim()))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream");
    if let Some(id) = session_id {
        call = call.header("mcp-session-id", id);
    }
    if let Some(version) = protocol_version {
        call = call.header("MCP-Protocol-Version", version);
    }
    let mut response = call
        .send(body.to_string().as_bytes())
        .map_err(|_| "MCP network request failed")?;
    let status = response.status().as_u16();
    let session_id = response
        .headers()
        .get("mcp-session-id")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let body = response
        .body_mut()
        .with_config()
        .limit(4 * 1024 * 1024)
        .read_to_string()
        .map_err(|_| "MCP response could not be read")?;
    Ok(McpResponse {
        status,
        session_id,
        body,
    })
}

#[tauri::command]
pub async fn navopath_mcp_request(
    window: tauri::WebviewWindow,
    endpoint: String,
    token: String,
    body: Value,
    session_id: Option<String>,
    protocol_version: Option<String>,
) -> Result<McpResponse, String> {
    if !matches!(
        window.label(),
        crate::window::ISLAND_LABEL | crate::settings::SETTINGS_LABEL
    ) {
        return Err("Unsupported MCP window".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        request(endpoint, token, body, session_id, protocol_version)
    })
    .await
    .map_err(|_| "MCP request stopped")?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn limits_transport_to_safe_endpoints_and_navopath_methods() {
        let init = json!({"jsonrpc":"2.0", "method":"initialize"});
        assert!(validate("https://example.com/mcp", &init).is_ok());
        assert!(validate("http://127.0.0.1:8080/mcp", &init).is_ok());
        for endpoint in [
            "file:///secret",
            "http://example.com/mcp",
            "https://user:password@example.com/mcp",
            "https://example.com/mcp#fragment",
        ] {
            assert!(validate(endpoint, &init).is_err());
        }
        assert!(
            validate(
                "https://example.com/mcp",
                &json!({"jsonrpc":"2.0", "method":"tools/call", "params":{"name":"list_tasks"}})
            )
            .is_ok()
        );
        assert!(validate("https://example.com/mcp", &json!({"jsonrpc":"2.0", "method":"tools/call", "params":{"name":"delete_workspace"}})).is_err());
    }

    #[test]
    fn native_transport_preserves_session_headers_and_http_errors() {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}/mcp", server.server_addr());
        let worker = std::thread::spawn(move || {
            let incoming = server.recv().unwrap();
            assert!(
                incoming
                    .headers()
                    .iter()
                    .any(|h| h.field.equiv("mcp-session-id") && h.value.as_str() == "session")
            );
            assert!(
                incoming
                    .headers()
                    .iter()
                    .any(|h| h.field.equiv("MCP-Protocol-Version")
                        && h.value.as_str() == "2025-03-26")
            );
            incoming
                .respond(tiny_http::Response::from_string("expired").with_status_code(404))
                .unwrap();
        });
        let response = request(
            endpoint,
            "test-token".into(),
            json!({"jsonrpc":"2.0", "method":"initialize"}),
            Some("session".into()),
            Some("2025-03-26".into()),
        )
        .unwrap();
        assert_eq!(response.status, 404);
        assert_eq!(response.body, "expired");
        worker.join().unwrap();
    }
}
