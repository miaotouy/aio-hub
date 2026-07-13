// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

use axum::{
    body::Body,
    extract::DefaultBodyLimit,
    http::{HeaderMap as AxumHeaderMap, StatusCode},
    routing::post,
    Router,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::StreamExt;
use log::{error, info, warn};
use once_cell::sync::Lazy;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
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

/// 启动结果：返回真实绑定的端口
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyServerInfo {
    pub port: u16,
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

/// 解析 Windows `netsh` 输出的排除端口段
/// 仅在 Windows 上调用；失败时返回空 Vec，调用方自动降级为试错策略
#[cfg(windows)]
fn fetch_windows_excluded_ranges() -> Vec<(u16, u16)> {
    use std::process::Command;
    let output = match Command::new("netsh")
        .args([
            "interface",
            "ipv4",
            "show",
            "excludedportrange",
            "protocol=tcp",
        ])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            warn!("netsh excludedportrange query failed: {}", e);
            return Vec::new();
        }
    };

    // netsh 在中文 Windows 上输出 GBK；UTF-8 解析失败时退化为有损解析
    let text = match std::str::from_utf8(&output.stdout) {
        Ok(s) => s.to_string(),
        Err(_) => String::from_utf8_lossy(&output.stdout).into_owned(),
    };

    let mut ranges = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        // 期望格式: "      16082       16181"
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }
        if let (Ok(start), Ok(end)) = (parts[0].parse::<u16>(), parts[1].parse::<u16>()) {
            if start <= end {
                ranges.push((start, end));
            }
        }
    }
    ranges
}

#[cfg(not(windows))]
fn fetch_windows_excluded_ranges() -> Vec<(u16, u16)> {
    Vec::new()
}

/// 判断端口是否落在任意排除段
fn is_port_excluded(port: u16, excluded: &[(u16, u16)]) -> bool {
    excluded.iter().any(|(s, e)| port >= *s && port <= *e)
}

/// 智能寻找一个可用端口
/// 策略：
/// 1. 先尝试用户指定的 preferred 端口（若不在排除段）
/// 2. 在安全候选段中按步长扫描（避免 Hyper-V 动态保留区）
/// 3. 兜底：让 OS 自动分配（绑定 127.0.0.1:0）
async fn find_available_port(preferred: u16) -> Result<(tokio::net::TcpListener, u16), String> {
    let excluded = fetch_windows_excluded_ranges();
    if !excluded.is_empty() {
        info!(
            "Detected {} excluded TCP port range(s) on this system",
            excluded.len()
        );
    }

    // 候选端口列表：preferred 优先；随后是几个常见的"安全区"代表端口
    // 这些值经过挑选，远离 Windows 16xxx/17xxx 常见的 Hyper-V 动态保留段
    let mut candidates: Vec<u16> = vec![preferred];
    candidates.extend_from_slice(&[
        21655, 21777, 21888, 21999, 23655, 23888, 24655, 25655, 28655, 29655, 31655, 34655,
    ]);

    for port in &candidates {
        if *port == 0 {
            continue;
        }
        if is_port_excluded(*port, &excluded) {
            warn!("Port {} is in Windows excluded range, skipping", port);
            continue;
        }
        match tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port)).await {
            Ok(listener) => {
                if *port != preferred {
                    info!(
                        "Preferred port {} unavailable, fell back to port {}",
                        preferred, port
                    );
                }
                return Ok((listener, *port));
            }
            Err(e) => {
                warn!("Failed to bind to port {}: {} (will try next)", port, e);
                continue;
            }
        }
    }

    // 最终兜底：让 OS 自动分配一个可用端口
    match tokio::net::TcpListener::bind("127.0.0.1:0").await {
        Ok(listener) => {
            let port = listener
                .local_addr()
                .map_err(|e| format!("Failed to get local addr: {}", e))?
                .port();
            info!(
                "All candidate ports failed, OS-assigned port {} is in use",
                port
            );
            Ok((listener, port))
        }
        Err(e) => Err(format!(
            "Failed to bind to any port (including OS-assigned): {}",
            e
        )),
    }
}

#[tauri::command]
pub async fn start_llm_proxy_server(port: u16) -> Result<ProxyServerInfo, String> {
    let mut state = PROXY_STATE.lock().await;
    if state.is_running {
        // 服务已运行：忽略调用方指定的 port，直接返回真实端口
        // 这是关键变更——前端不再要求"指定端口必须可用"，而是"获取实际可用端口"
        return Ok(ProxyServerInfo { port: state.port });
    }

    // 智能寻找可用端口
    let (listener, actual_port) = find_available_port(port).await?;

    info!(
        "LLM Proxy Server starting on http://127.0.0.1:{}",
        actual_port
    );
    state.is_running = true;
    state.port = actual_port;

    // 释放锁，然后再启动异步任务，防止死锁
    drop(state);

    let state_clone = PROXY_STATE.clone();
    tokio::spawn(async move {
        let app = Router::new()
            .route("/proxy", post(handle_proxy_request_router))
            .layer(DefaultBodyLimit::max(256 * 1024 * 1024)) // 限制 body 大小为 256MB，更加安全
            .layer(tower_http::cors::CorsLayer::permissive());

        if let Err(e) = axum::serve(listener, app).await {
            error!("LLM Proxy Server error: {}", e);
            // 发生错误时重置状态
            let mut s = state_clone.lock().await;
            s.is_running = false;
        }
    });

    Ok(ProxyServerInfo { port: actual_port })
}

/// 路由入口：根据 Content-Type 分流
async fn handle_proxy_request_router(
    headers: AxumHeaderMap,
    body: Body,
) -> (StatusCode, AxumHeaderMap, Body) {
    let content_type = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    match content_type.starts_with("application/json") {
        true => {
            // JSON 路径：读取 body → 反序列化 → 走现有业务逻辑
            let max_body_size: usize = 256 * 1024 * 1024;
            match axum::body::to_bytes(body, max_body_size).await {
                Ok(bytes) => match serde_json::from_slice::<ProxyRequest>(&bytes) {
                    Ok(request) => match handle_json_proxy(request).await {
                        Ok(resp) => resp,
                        Err((status, msg)) => {
                            error!("JSON proxy error: {}", msg);
                            (status, AxumHeaderMap::new(), Body::from(msg))
                        }
                    },
                    Err(e) => {
                        let msg = format!("Invalid JSON: {}", e);
                        error!("{}", msg);
                        (
                            StatusCode::BAD_REQUEST,
                            AxumHeaderMap::new(),
                            Body::from(msg),
                        )
                    }
                },
                Err(e) => {
                    let msg = format!("Failed to read body: {}", e);
                    error!("{}", msg);
                    (
                        StatusCode::BAD_REQUEST,
                        AxumHeaderMap::new(),
                        Body::from(msg),
                    )
                }
            }
        }
        false => {
            // 透明转发路径（multipart/form-data、binary 等）
            match handle_raw_proxy(headers, body).await {
                Ok(resp) => resp,
                Err((status, msg)) => {
                    error!("Raw proxy error: {}", msg);
                    (status, AxumHeaderMap::new(), Body::from(msg))
                }
            }
        }
    }
}

/// JSON 代理路径：保留所有现有业务逻辑（process_body_recursive、流式 SSE 等）
async fn handle_json_proxy(
    mut request: ProxyRequest,
) -> Result<(StatusCode, AxumHeaderMap, Body), (StatusCode, String)> {
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

    // 构建客户端（复用函数）
    let client = build_proxy_client(
        &request.url,
        request
            .proxy_settings
            .as_ref()
            .map(|s| s.mode.as_str())
            .unwrap_or("system"),
        request
            .proxy_settings
            .as_ref()
            .and_then(|s| s.custom_url.as_deref()),
        request.relax_invalid_certs.unwrap_or(true),
        request.http1_only.unwrap_or(true),
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

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

    // 非 GET 请求附加 JSON body
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

/// 透明代理：直接转发任意 Content-Type 的请求体，不解析、不修改
/// 仅用于附件已在前端预处理为 Blob 的场景（如图片编辑 multipart/form-data）
async fn handle_raw_proxy(
    headers: AxumHeaderMap,
    body: Body,
) -> Result<(StatusCode, AxumHeaderMap, Body), (StatusCode, String)> {
    let request_id = nanoid::nanoid!(8);

    // 从 Header 提取目标 URL（必填）
    let target_url = get_header_str(&headers, "x-target-url").ok_or((
        StatusCode::BAD_REQUEST,
        "Missing X-Target-URL header".into(),
    ))?;

    let business_id = get_header_str(&headers, "x-request-id").unwrap_or("none");
    let proxy_mode = get_header_str(&headers, "x-proxy-mode").unwrap_or("system");
    let proxy_url = get_header_str(&headers, "x-proxy-url");
    let relax_certs = get_header_str(&headers, "x-relax-certs")
        .and_then(|v| v.parse().ok())
        .unwrap_or(true);
    let http1_only = get_header_str(&headers, "x-http1-only")
        .and_then(|v| v.parse().ok())
        .unwrap_or(true);

    info!("[Proxy-{request_id}] Raw proxy (BizID: {business_id}): POST {target_url}");

    // 构建客户端（复用 build_proxy_client）
    let client = build_proxy_client(target_url, proxy_mode, proxy_url, relax_certs, http1_only)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // 转发 Header：保留业务 Header，过滤元信息 Header
    let meta_headers = [
        "x-target-url",
        "x-request-id",
        "x-proxy-mode",
        "x-proxy-url",
        "x-relax-certs",
        "x-http1-only",
        "host",
        "accept-encoding",
    ];
    let mut forward_headers = HeaderMap::new();
    for (name, value) in headers.iter() {
        let lower = name.as_str().to_lowercase();
        if meta_headers.contains(&lower.as_str()) {
            continue;
        }
        if let (Ok(n), Ok(v)) = (
            HeaderName::from_bytes(name.as_str().as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            forward_headers.insert(n, v);
        }
    }

    // 管道转发 Body（零拷贝流）
    let body_stream = body
        .into_data_stream()
        .map(|result| result.map_err(std::io::Error::other));

    let upstream_response = client
        .post(target_url)
        .headers(forward_headers)
        .body(reqwest::Body::wrap_stream(body_stream))
        .send()
        .await
        .map_err(|e| {
            error!("[Proxy-{request_id}] Request failed: {e}");
            (StatusCode::BAD_GATEWAY, format!("Request failed: {e}"))
        })?;

    // 先提取状态码和响应头
    let status =
        StatusCode::from_u16(upstream_response.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut resp_headers = AxumHeaderMap::new();
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
    ];
    for (name, value) in upstream_response.headers().iter() {
        if hop_by_hop.contains(&name.as_str().to_lowercase().as_str()) {
            continue;
        }
        if let (Ok(n), Ok(v)) = (
            axum::http::HeaderName::from_bytes(name.as_str().as_bytes()),
            axum::http::HeaderValue::from_bytes(value.as_bytes()),
        ) {
            resp_headers.insert(n, v);
        }
    }

    // 流式返回响应体，实现端到端透明转发
    let stream = upstream_response
        .bytes_stream()
        .map(|item| item.map_err(std::io::Error::other));

    info!("[Proxy-{request_id}] Raw proxy relaying response stream");
    Ok((status, resp_headers, Body::from_stream(stream)))
}

/// 构建 reqwest Client，供 JSON 代理路径和透明转发路径复用
fn build_proxy_client(
    target_url: &str,
    proxy_mode: &str,
    proxy_url: Option<&str>,
    relax_certs: bool,
    http1_only: bool,
) -> Result<reqwest::Client, String> {
    let is_ip = reqwest::Url::parse(target_url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.parse::<std::net::IpAddr>().is_ok()))
        .unwrap_or(false);

    let mut builder = reqwest::Client::builder()
        .danger_accept_invalid_certs(relax_certs)
        .user_agent(format!("AIO-Hub/{}", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(15))
        .tcp_keepalive(std::time::Duration::from_secs(60))
        .no_gzip()
        .no_brotli()
        .no_deflate();

    if http1_only {
        builder = builder.http1_only();
    }

    if is_ip {
        builder = builder.no_proxy();
    } else {
        match proxy_mode {
            "none" => {
                builder = builder.no_proxy();
            }
            "custom" => {
                if let Some(url) = proxy_url.filter(|u| !u.is_empty()) {
                    builder = builder.proxy(
                        reqwest::Proxy::all(url).map_err(|e| format!("Invalid proxy URL: {e}"))?,
                    );
                }
            }
            _ => {} // 系统代理（默认）
        }
    }

    builder
        .build()
        .map_err(|e| format!("Failed to build client: {e}"))
}

/// 从 Axum HeaderMap 中提取字符串值
fn get_header_str<'a>(headers: &'a AxumHeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|v| v.to_str().ok())
}
