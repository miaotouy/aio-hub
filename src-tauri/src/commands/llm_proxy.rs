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
    pub relax_invalid_certs: Option<bool>, // 是否放宽证书校验
    pub http1_only: Option<bool>,          // 是否强制 HTTP/1.1
    pub proxy_settings: Option<ProxySettings>, // 代理设置
    pub is_streaming: Option<bool>,        // 是否为流式请求（SSE）
}

/// 递归处理 Body，查找并替换以 local-file:// 开头的本地路径
async fn process_body_recursive(value: &mut serde_json::Value) -> Result<(), String> {
    match value {
        serde_json::Value::Object(map) => {
            for (_, v) in map.iter_mut() {
                // 使用 Box::pin 处理递归异步
                Box::pin(process_body_recursive(v)).await?;
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                Box::pin(process_body_recursive(v)).await?;
            }
        }
        serde_json::Value::String(s) => {
            // 严格验证：只处理以 "data:image/" 或 "data:audio/" 等开头，
            // 且紧跟 "local-file://" 的合法文件协议 URL
            // 这样可以避免将消息内容中的普通文本误识别为文件路径
            if let Some(pos) = s.find("local-file://") {
                // 检查是否是合法的文件协议格式
                // 合法格式：data:image/png;base64,local-file://...
                //          data:audio/mpeg;base64,local-file://...
                //          data:application/pdf;base64,local-file://...
                let prefix = &s[..pos];
                let is_valid_protocol = prefix.starts_with("data:")
                    && (prefix.contains("image/")
                        || prefix.contains("audio/")
                        || prefix.contains("video/")
                        || prefix.contains("application/pdf"))
                    && prefix.ends_with(",");

                if !is_valid_protocol {
                    // 不是合法的文件协议格式，跳过处理
                    // 这样可以避免将消息内容中提到的 "local-file://" 文本误识别为文件路径
                    return Ok(());
                }

                let path_str = &s[pos + "local-file://".len()..];

                // 额外的安全检查：路径长度限制
                // Windows 最大路径长度为 260 字符（包括驱动器字母和终止符）
                // Unix 系统通常为 4096 字节
                // 这里设置 1024 作为合理的上限，超过此长度的很可能是误识别的文本内容
                if path_str.len() > 1024 {
                    // 不是合法的文件路径，跳过处理
                    return Ok(());
                }

                // 解码路径（处理空格和特殊字符）
                let decoded_path = urlencoding::decode(path_str)
                    .map_err(|e| format!("Failed to decode path: {}", e))?;

                // 切换为异步读取，避免阻塞运行时
                match tokio::fs::read(decoded_path.as_ref()).await {
                    Ok(bytes) => {
                        let b64 = STANDARD.encode(bytes);
                        *value = serde_json::Value::String(format!("{}{}", prefix, b64));
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to read local file {}: {}", decoded_path, e);
                        error!("{}", err_msg);
                        return Err(err_msg);
                    }
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
        if state.port == port {
            return Ok(format!("LLM Proxy Server already running on port {}", port));
        } else {
            return Err(format!(
                "LLM Proxy Server is already running on port {}. Cannot start on port {}.",
                state.port, port
            ));
        }
    }

    // 在主线程尝试绑定端口，确保及时反馈错误
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| {
            error!("Failed to bind to port {}: {}", port, e);
            format!("Failed to bind to port {}: {}", port, e)
        })?;

    info!("LLM Proxy Server starting on http://127.0.0.1:{}", port);
    state.is_running = true;
    state.port = port;

    // 释放锁，然后再启动异步任务，防止死锁
    drop(state);

    let state_clone = PROXY_STATE.clone();
    tokio::spawn(async move {
        let app = Router::new()
            .route("/proxy", post(handle_proxy_request))
            .layer(DefaultBodyLimit::max(256 * 1024 * 1024)) // 限制 body 大小为 256MB，更加安全
            .layer(tower_http::cors::CorsLayer::permissive());

        if let Err(e) = axum::serve(listener, app).await {
            error!("LLM Proxy Server error: {}", e);
            // 发生错误时重置状态
            let mut s = state_clone.lock().await;
            s.is_running = false;
        }
    });

    Ok(format!("LLM Proxy Server started on port {}", port))
}

async fn handle_proxy_request(
    Json(mut request): Json<ProxyRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let request_id = nanoid::nanoid!(8);
    let url_for_log = request.url.clone();

    // 尝试获取业务层透传的 X-Request-ID
    let business_id = request
        .headers
        .get("X-Request-ID")
        .or_else(|| request.headers.get("x-request-id"))
        .cloned()
        .unwrap_or_else(|| "none".to_string());

    info!(
        "[Proxy-{}] New request (BizID: {}): {} {}",
        request_id, business_id, request.method, url_for_log
    );

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
        .user_agent(format!("AIO-Hub/{}", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(15))
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
                        let proxy = reqwest::Proxy::all(custom_url).map_err(|e| {
                            let err_msg = format!("Invalid custom proxy URL {}: {}", custom_url, e);
                            error!("{}", err_msg);
                            (StatusCode::BAD_REQUEST, err_msg)
                        })?;
                        client_builder = client_builder.proxy(proxy);
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

        if let Ok(name) = HeaderName::from_bytes(k.as_bytes()) {
            // 使用 from_bytes 允许非 ASCII 字符，增强对不规范渠道的兼容性
            if let Ok(value) = HeaderValue::from_bytes(v.as_bytes()) {
                headers.insert(name, value);
            }
        }
    }

    // 处理本地文件读取
    if let Err(e) = process_body_recursive(&mut request.body).await {
        return Err((StatusCode::BAD_REQUEST, e));
    }

    let req_builder = match request.method.to_uppercase().as_str() {
        "POST" => client.post(&request.url),
        "GET" => client.get(&request.url),
        "PUT" => client.put(&request.url),
        "DELETE" => client.delete(&request.url),
        "PATCH" => client.patch(&request.url),
        _ => return Err((StatusCode::METHOD_NOT_ALLOWED, "Unsupported method".into())),
    };

    let mut req = req_builder.headers(headers);
    // 移除后端的整体超时设置，完全交给前端 common.ts 控制。
    // 前端已经实现了 TTFB (Time to First Byte) 超时检测。
    // 后端仅保留 connect_timeout 保护连接建立阶段。
    let is_streaming = request.is_streaming.unwrap_or(false);
    if is_streaming {
        info!(
            "[Proxy] Streaming mode: relaying stream for {}",
            request.url
        );
    }

    if request.method.to_uppercase() != "GET" {
        req = req.json(&request.body);
    }

    // 发送请求。
    // 注意：Rust 的 Future 机制保证了如果客户端断开连接，Axum 会 drop 这个 handler future，
    // 从而触发 reqwest 请求的 drop，实现自动取消。不需要额外的 CancellationToken。
    let response = req.send().await.map_err(|e| {
        error!("[Proxy-{}] Request failed: {}", request_id, e);
        (StatusCode::BAD_GATEWAY, format!("Request failed: {}", e))
    })?;

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut resp_headers = AxumHeaderMap::new();

    // 定义需要过滤的逐跳头部和敏感头部
    // 移除了 content-encoding，因为我们现在允许 reqwest 处理解压（如果不是流式）
    // 或者将原始编码透传（如果是流式且前端能处理）
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

    // 为流式请求强制添加必要的 SSE 头部，防止被缓存或压缩
    if is_streaming {
        resp_headers.insert(
            axum::http::header::CACHE_CONTROL,
            axum::http::HeaderValue::from_static("no-cache"),
        );
        resp_headers.insert(
            axum::http::header::CONNECTION,
            axum::http::HeaderValue::from_static("keep-alive"),
        );
        if let Ok(x_accel_name) = axum::http::HeaderName::from_bytes(b"x-accel-buffering") {
            resp_headers.insert(x_accel_name, axum::http::HeaderValue::from_static("no"));
        }
    }

    if is_streaming {
        let mut upstream_stream = response.bytes_stream();
        let request_id_stream = request_id.clone();
        let url_stream = url_for_log.clone();

        // 注意：Axum 的 Body::from_stream 在客户端断开时会自动 drop stream。
        // 由于 upstream_stream 持有 reqwest 的连接，drop stream 会自动中止上游请求。
        let stream = async_stream::stream! {
            let mut total_bytes = 0;

            while let Some(item) = upstream_stream.next().await {
                match item {
                    Ok(bytes) => {
                        total_bytes += bytes.len();
                        // 降低日志频率，仅在 1MB 整数倍时记录
                        if total_bytes > 0 && total_bytes % (1024 * 1024) < bytes.len() {
                            info!(
                                "[Proxy-{}] Stream progress for {}: {}KB",
                                request_id_stream, url_stream, total_bytes / 1024
                            );
                        }
                        yield Ok(bytes);
                    }
                    Err(e) => {
                        error!(
                            "[Proxy-{}] Stream error for {} after {}KB: {}",
                            request_id_stream, url_stream, total_bytes / 1024, e
                        );
                        yield Err(std::io::Error::other(e));
                        break;
                    }
                }
            }
            info!("[Proxy-{}] Stream completed for {}, total {}KB", request_id_stream, url_stream, total_bytes / 1024);
        };

        info!(
            "[Proxy-{}] Starting stream relay for {}",
            request_id, url_for_log
        );
        Ok((status, resp_headers, Body::from_stream(stream)))
    } else {
        // 非流式请求：直接获取全部字节，避免复杂的流转换逻辑
        let bytes = response.bytes().await.map_err(|e| {
            error!("[Proxy-{}] Failed to read full response: {}", request_id, e);
            (
                StatusCode::BAD_GATEWAY,
                format!("Failed to read response: {}", e),
            )
        })?;

        info!(
            "[Proxy-{}] Request completed, total {}KB",
            request_id,
            bytes.len() / 1024
        );
        Ok((status, resp_headers, Body::from(bytes)))
    }
}
