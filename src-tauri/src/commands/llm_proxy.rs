use axum::{
    body::Body,
    extract::DefaultBodyLimit,
    http::{HeaderMap as AxumHeaderMap, StatusCode},
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::StreamExt;
use log::{error, info};
use once_cell::sync::Lazy;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

// 全局代理服务状态
pub static PROXY_STATE: Lazy<Arc<Mutex<ProxyServiceState>>> =
    Lazy::new(|| Arc::new(Mutex::new(ProxyServiceState::default())));

#[derive(Default)]
pub struct ProxyServiceState {
    is_running: bool,
    port: u16,
}

#[derive(Debug, Deserialize)]
pub struct ProxySettings {
    pub mode: String,
    pub custom_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProxyRequest {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: serde_json::Value,
    pub timeout: Option<u64>,                  // 超时时间（毫秒）
    pub relax_invalid_certs: Option<bool>,     // 是否放宽证书校验
    pub http1_only: Option<bool>,              // 是否强制 HTTP/1.1
    pub proxy_settings: Option<ProxySettings>, // 代理设置
}

/// 递归处理 Body，查找并替换以 local-file:// 开头的本地路径
fn process_body_recursive(value: &mut serde_json::Value) -> Result<(), String> {
    match value {
        serde_json::Value::Object(map) => {
            for (_, v) in map.iter_mut() {
                process_body_recursive(v)?;
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                process_body_recursive(v)?;
            }
        }
        serde_json::Value::String(s) => {
            if let Some(path_str) = s.strip_prefix("local-file://") {
                // 解码路径（处理空格和特殊字符）
                let decoded_path = urlencoding::decode(path_str)
                    .map_err(|e| format!("Failed to decode path: {}", e))?;

                // 使用 std::fs::read 没问题，因为这个函数是在 handle_proxy_request 中被调用的，
                // 而 handle_proxy_request 是异步的，但 process_body_recursive 是递归同步的。
                // 考虑到 LLM 请求通常在单独的线程池中处理，这里暂时保持同步读取。
                if let Ok(bytes) = std::fs::read(decoded_path.as_ref()) {
                    let b64 = STANDARD.encode(bytes);
                    *value = serde_json::Value::String(b64);
                } else {
                    error!("Failed to read local file: {}", decoded_path);
                }
            }
        }
        _ => {}
    }
    Ok(())
}
#[tauri::command]
pub async fn start_llm_proxy_server(port: u16) -> Result<String, String> {
    let mut state = PROXY_STATE.lock().await;
    if state.is_running {
        return Ok(format!(
            "LLM Proxy Server already running on port {}",
            state.port
        ));
    }

    state.is_running = true;
    state.port = port;

    tokio::spawn(async move {
        let app = Router::new()
            .route("/proxy", post(handle_proxy_request))
            .layer(DefaultBodyLimit::max(500 * 1024 * 1024)) // 500MB
            .layer(tower_http::cors::CorsLayer::permissive());

        let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port))
            .await
            .unwrap();
        info!("LLM Proxy Server started on http://127.0.0.1:{}", port);
        axum::serve(listener, app).await.unwrap();
    });

    Ok(format!("LLM Proxy Server started on port {}", port))
}

async fn handle_proxy_request(
    Json(mut request): Json<ProxyRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    info!("LLM Proxy (HTTP): {} {}", request.method, request.url);

    // 检查是否是 IP 地址
    let is_ip = if let Ok(u) = reqwest::Url::parse(&request.url) {
        u.host_str()
            .map(|h| h.parse::<std::net::IpAddr>().is_ok())
            .unwrap_or(false)
    } else {
        false
    };

    let mut client_builder = reqwest::Client::builder()
        .danger_accept_invalid_certs(request.relax_invalid_certs.unwrap_or(true))
        .user_agent("AIO-Hub/0.5.0")
        .connect_timeout(std::time::Duration::from_secs(10))
        .tcp_keepalive(std::time::Duration::from_secs(60))
        .no_gzip()
        .no_brotli()
        .no_deflate();

    if request.http1_only.unwrap_or(true) {
        client_builder = client_builder.http1_only();
    }

    // 处理代理设置
    if is_ip {
        client_builder = client_builder.no_proxy();
    } else if let Some(proxy_settings) = &request.proxy_settings {
        match proxy_settings.mode.as_str() {
            "none" => {
                client_builder = client_builder.no_proxy();
            }
            "custom" => {
                if let Some(custom_url) = &proxy_settings.custom_url {
                    if !custom_url.is_empty() {
                        match reqwest::Proxy::all(custom_url) {
                            Ok(proxy) => {
                                client_builder = client_builder.proxy(proxy);
                            }
                            Err(e) => {
                                error!("Invalid custom proxy URL {}: {}", custom_url, e);
                            }
                        }
                    }
                }
            }
            _ => {
                // 默认使用系统代理，reqwest 默认已启用
            }
        }
    }

    let client = client_builder.build().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create client: {}", e),
        )
    })?;

    let mut headers = HeaderMap::new();
    for (k, v) in request.headers {
        let name_lower = k.to_lowercase();
        // 过滤掉 host 和 accept-encoding，由 reqwest 自动处理或禁用
        if name_lower == "host" || name_lower == "accept-encoding" {
            continue;
        }

        if let (Ok(name), Ok(value)) = (
            HeaderName::from_bytes(k.as_bytes()),
            HeaderValue::from_str(&v),
        ) {
            headers.insert(name, value);
        }
    }

    // 处理本地文件读取
    if let Err(e) = process_body_recursive(&mut request.body) {
        return Err((StatusCode::BAD_REQUEST, e));
    }

    let req_builder = match request.method.to_uppercase().as_str() {
        "POST" => client.post(&request.url),
        "GET" => client.get(&request.url),
        _ => return Err((StatusCode::METHOD_NOT_ALLOWED, "Unsupported method".into())),
    };

    let mut req = req_builder.headers(headers);
    if let Some(timeout_ms) = request.timeout {
        req = req.timeout(std::time::Duration::from_millis(timeout_ms));
    }

    if request.method.to_uppercase() != "GET" {
        req = req.json(&request.body);
    }

    let response = req.send().await.map_err(|e| {
        error!("LLM Proxy Request failed: {}", e);
        (StatusCode::BAD_GATEWAY, format!("Request failed: {}", e))
    })?;

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut resp_headers = AxumHeaderMap::new();

    // 定义需要过滤的逐跳头部和敏感头部
    let hop_by_hop = [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        "content-length",
        "content-encoding",
        "host",
        "access-control-allow-origin",
        "access-control-allow-methods",
        "access-control-allow-headers",
        "access-control-allow-credentials",
    ];

    for (name, value) in response.headers().iter() {
        let name_str = name.as_str().to_lowercase();
        if hop_by_hop.contains(&name_str.as_str()) {
            continue;
        }

        if let Ok(axum_name) = axum::http::HeaderName::from_bytes(name.as_str().as_bytes()) {
            if let Ok(axum_value) = axum::http::HeaderValue::from_bytes(value.as_bytes()) {
                resp_headers.insert(axum_name, axum_value);
            }
        }
    }

    let stream = response
        .bytes_stream()
        .map(|item| item.map_err(std::io::Error::other));

    let body = Body::from_stream(stream);
    Ok((status, resp_headers, body))
}
