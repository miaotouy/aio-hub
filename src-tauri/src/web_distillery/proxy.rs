use axum::{
    body::Body,
    extract::Query,
    http::{header, HeaderMap as AxumHeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use log::{error, info};
use once_cell::sync::Lazy;
use reqwest::header::HeaderValue;
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::{oneshot, Mutex};
use url::Url;

// 全局代理服务状态
pub static DISTILLERY_PROXY_STATE: Lazy<Arc<Mutex<DistilleryProxyState>>> =
    Lazy::new(|| Arc::new(Mutex::new(DistilleryProxyState::default())));

pub struct DistilleryProxyState {
    pub is_running: bool,
    pub port: u16,
    pub shutdown_tx: Option<oneshot::Sender<()>>,
}

impl Default for DistilleryProxyState {
    fn default() -> Self {
        Self {
            is_running: false,
            port: 0,
            shutdown_tx: None,
        }
    }
}

#[derive(Deserialize)]
pub struct ProxyQuery {
    pub url: String,
}

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// 启动代理服务器
#[tauri::command]
pub async fn distillery_start_proxy() -> Result<u16, String> {
    let mut state = DISTILLERY_PROXY_STATE.lock().await;
    if state.is_running {
        return Ok(state.port);
    }

    // 绑定到 127.0.0.1:0 以使用随机可用端口
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind to random port: {}", e))?;
    
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    
    // 避开高频端口（虽然 0 是随机的，但如果随机到了也换一个，虽然概率极低）
    let forbidden_ports = [3000, 5000, 8000, 8080];
    if forbidden_ports.contains(&port) {
        // 递归重试一次，或者直接报错让用户重试
        return Box::pin(distillery_start_proxy()).await;
    }

    let (tx, rx) = oneshot::channel::<()>();
    state.is_running = true;
    state.port = port;
    state.shutdown_tx = Some(tx);

    let state_clone = DISTILLERY_PROXY_STATE.clone();
    
    tokio::spawn(async move {
        let app = Router::new()
            .route("/proxy", get(handle_proxy_html))
            .route("/proxy-resource", get(handle_proxy_resource))
            .route("/__distillery/bridge.js", get(handle_bridge_js))
            .route("/__distillery/sniffer.js", get(handle_sniffer_js))
            .route("/__distillery/anti-detection.js", get(handle_anti_detection_js))
            .layer(tower_http::cors::CorsLayer::permissive());

        info!("[Distillery-Proxy] Server starting on http://127.0.0.1:{}", port);
        
        let server = axum::serve(listener, app).with_graceful_shutdown(async {
            rx.await.ok();
        });

        if let Err(e) = server.await {
            error!("[Distillery-Proxy] Server error: {}", e);
            let mut s = state_clone.lock().await;
            s.is_running = false;
            s.shutdown_tx = None;
        }
    });

    Ok(port)
}

/// 停止代理服务器
#[tauri::command]
pub async fn distillery_stop_proxy() -> Result<(), String> {
    let mut state = DISTILLERY_PROXY_STATE.lock().await;
    if let Some(tx) = state.shutdown_tx.take() {
        let _ = tx.send(());
    }
    state.is_running = false;
    state.port = 0;
    info!("[Distillery-Proxy] Server stopped");
    Ok(())
}

/// 获取当前端口号
#[tauri::command]
pub async fn distillery_get_proxy_port() -> Result<u16, String> {
    let state = DISTILLERY_PROXY_STATE.lock().await;
    if state.is_running {
        Ok(state.port)
    } else {
        Err("Proxy server is not running".to_string())
    }
}

/// 处理 HTML 代理请求
async fn handle_proxy_html(Query(query): Query<ProxyQuery>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let target_url = query.url;
    let decoded_url = urlencoding::decode(&target_url).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response = client.get(decoded_url.as_ref())
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Request failed: {}", e)))?;

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut resp_headers = AxumHeaderMap::new();

    // 过滤安全头
    let unsafe_headers = [
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
        "access-control-allow-origin",
    ];

    for (name, value) in response.headers().iter() {
        let name_str = name.as_str().to_lowercase();
        if unsafe_headers.contains(&name_str.as_str()) {
            continue;
        }
        if let Ok(axum_name) = axum::http::HeaderName::from_bytes(name.as_str().as_bytes()) {
            if let Ok(axum_value) = axum::http::HeaderValue::from_bytes(value.as_bytes()) {
                resp_headers.insert(axum_name, axum_value);
            }
        }
    }

    // 强制设置 Content-Type
    resp_headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/html; charset=utf-8"));

    let bytes = response.bytes().await.map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
    let mut html = String::from_utf8_lossy(&bytes).to_string();

    // 计算 <base> 标签的 href
    let base_href = if let Ok(parsed_url) = Url::parse(decoded_url.as_ref()) {
        let mut path = parsed_url.path().to_string();
        if !path.ends_with('/') {
            if let Some(last_slash) = path.rfind('/') {
                path.truncate(last_slash + 1);
            } else {
                path = "/".to_string();
            }
        }
        format!("{}://{}{}", parsed_url.scheme(), parsed_url.host_str().unwrap_or(""), path)
    } else {
        decoded_url.to_string()
    };

    // 注入脚本和 base 标签
    let injections = format!(
        r#"<base href="{}">
<script src="/__distillery/anti-detection.js"></script>
<script src="/__distillery/bridge.js"></script>
<script src="/__distillery/sniffer.js"></script>"#,
        base_href
    );

    if let Some(head_pos) = html.find("<head>") {
        html.insert_str(head_pos + 6, &format!("\n{}", injections));
    } else if let Some(html_pos) = html.find("<html>") {
        html.insert_str(html_pos + 6, &format!("\n<head>{}</head>", injections));
    } else {
        html.insert_str(0, &format!("{}\n", injections));
    }

    Ok((status, resp_headers, html))
}

/// 处理子资源代理请求 (CSS/JS/Images)
async fn handle_proxy_resource(Query(query): Query<ProxyQuery>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let target_url = query.url;
    let decoded_url = urlencoding::decode(&target_url).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response = client.get(decoded_url.as_ref())
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Request failed: {}", e)))?;

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut resp_headers = AxumHeaderMap::new();

    // 过滤安全头
    let unsafe_headers = [
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
        "access-control-allow-origin",
    ];

    for (name, value) in response.headers().iter() {
        let name_str = name.as_str().to_lowercase();
        if unsafe_headers.contains(&name_str.as_str()) {
            continue;
        }
        if let Ok(axum_name) = axum::http::HeaderName::from_bytes(name.as_str().as_bytes()) {
            if let Ok(axum_value) = axum::http::HeaderValue::from_bytes(value.as_bytes()) {
                resp_headers.insert(axum_name, axum_value);
            }
        }
    }

    let bytes = response.bytes().await.map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
    Ok((status, resp_headers, Body::from(bytes)))
}

/// 返回注入的 bridge 脚本
async fn handle_bridge_js() -> Response {
    let content = include_str!("inject/bridge.js");
    let nonce = nanoid::nanoid!();
    let final_js = content.replace("__NONCE_PLACEHOLDER__", &nonce);
    
    Response::builder()
        .header(header::CONTENT_TYPE, "application/javascript")
        .body(Body::from(final_js))
        .unwrap()
}

/// 返回注入的 sniffer 脚本
async fn handle_sniffer_js() -> Response {
    let content = include_str!("inject/api-sniffer.js");
    Response::builder()
        .header(header::CONTENT_TYPE, "application/javascript")
        .body(Body::from(content))
        .unwrap()
}

/// 返回注入的反检测脚本
async fn handle_anti_detection_js() -> Response {
    let content = include_str!("inject/anti-detection.js");
    Response::builder()
        .header(header::CONTENT_TYPE, "application/javascript")
        .body(Body::from(content))
        .unwrap()
}