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
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap as AxumHeaderMap, Method, StatusCode},
    routing::any,
    Router,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::StreamExt;
use log::{error, info, warn};
use once_cell::sync::Lazy;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::Mutex;
use tokio_util::io::ReaderStream;
use tower_http::cors::{AllowHeaders, AllowOrigin, CorsLayer};

// 全局代理服务状态
pub static PROXY_STATE: Lazy<Arc<Mutex<ProxyServiceState>>> =
    Lazy::new(|| Arc::new(Mutex::new(ProxyServiceState::default())));

#[derive(Default)]
pub struct ProxyServiceState {
    is_running: bool,
    port: u16,
    token: String,
}

/// 启动结果：返回真实绑定的端口和仅在本次运行有效的 capability token。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyServerInfo {
    pub port: u16,
    pub token: String,
}

#[derive(Clone)]
struct ProxyRouterState {
    token: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalFileRefPayload {
    kind: String,
    path: String,
    content_type: Option<String>,
}

fn parse_tagged_local_file_ref(
    map: &serde_json::Map<String, serde_json::Value>,
) -> Result<Option<LocalFileRefPayload>, String> {
    if map.get("kind").and_then(serde_json::Value::as_str) != Some("local-file-ref") {
        return Ok(None);
    }

    if map
        .keys()
        .any(|key| !matches!(key.as_str(), "kind" | "path" | "contentType"))
    {
        return Err("Invalid tagged local file reference".into());
    }

    let file_ref =
        serde_json::from_value::<LocalFileRefPayload>(serde_json::Value::Object(map.clone()))
            .map_err(|_| "Invalid tagged local file reference".to_string())?;
    validate_local_file_ref(&file_ref)?;
    Ok(Some(file_ref))
}

fn validate_local_file_ref(file_ref: &LocalFileRefPayload) -> Result<(), String> {
    if file_ref.kind != "local-file-ref"
        || file_ref.path.is_empty()
        || file_ref.path.len() > 4096
        || file_ref
            .content_type
            .as_deref()
            .is_some_and(|value| value.is_empty() || value.len() > 255)
    {
        return Err("Invalid tagged local file reference".into());
    }
    Ok(())
}

async fn expand_tagged_local_file_ref(file_ref: &LocalFileRefPayload) -> Result<String, String> {
    let bytes = tokio::fs::read(&file_ref.path)
        .await
        .map_err(|_| "Failed to read tagged local file reference".to_string())?;
    let content_type = file_ref
        .content_type
        .as_deref()
        .unwrap_or("application/octet-stream");
    Ok(format!(
        "data:{content_type};base64,{}",
        STANDARD.encode(bytes)
    ))
}

/// 只展开明确标记的 tagged LocalFileRef 和兼容期 data URL 引用。
async fn process_body_recursive(value: &mut serde_json::Value) -> Result<(), String> {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(file_ref) = parse_tagged_local_file_ref(map)? {
                *value = serde_json::Value::String(expand_tagged_local_file_ref(&file_ref).await?);
                return Ok(());
            }
            for (_, v) in map.iter_mut() {
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

                if path_str.len() > 4096 {
                    return Ok(());
                }

                // 解码路径（处理空格和特殊字符）
                let decoded_path = urlencoding::decode(path_str)
                    .map_err(|e| format!("Failed to decode path: {}", e))?;

                // 切换为异步读取，避免阻塞运行时
                let bytes = tokio::fs::read(decoded_path.as_ref())
                    .await
                    .map_err(|_| "Failed to read legacy local file reference".to_string())?;
                *value = serde_json::Value::String(format!("{}{}", prefix, STANDARD.encode(bytes)));
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
        return Ok(ProxyServerInfo {
            port: state.port,
            token: state.token.clone(),
        });
    }

    // 智能寻找可用端口
    let (listener, actual_port) = find_available_port(port).await?;

    info!(
        "LLM Proxy Server starting on http://127.0.0.1:{}",
        actual_port
    );
    state.is_running = true;
    state.port = actual_port;
    state.token = nanoid::nanoid!(48);
    let capability_token = state.token.clone();

    // 释放锁，然后再启动异步任务，防止死锁
    drop(state);

    let state_clone = PROXY_STATE.clone();
    let router_state = ProxyRouterState {
        token: capability_token.clone(),
    };
    tokio::spawn(async move {
        let cors = CorsLayer::new()
            .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
                origin.to_str().is_ok_and(is_allowed_origin)
            }))
            .allow_methods([
                Method::GET,
                Method::POST,
                Method::PUT,
                Method::PATCH,
                Method::DELETE,
                Method::OPTIONS,
            ])
            .allow_headers(AllowHeaders::mirror_request());
        let app = Router::new()
            .route("/proxy/raw", any(handle_raw_proxy_router))
            .route("/proxy/json-expand", any(handle_json_expand_proxy_router))
            .layer(DefaultBodyLimit::max(256 * 1024 * 1024))
            .layer(cors)
            .with_state(router_state);

        if let Err(e) = axum::serve(listener, app).await {
            error!("LLM Proxy Server error: {}", e);
            // 发生错误时重置状态
            let mut s = state_clone.lock().await;
            s.is_running = false;
            s.port = 0;
            s.token.clear();
        }
    });

    Ok(ProxyServerInfo {
        port: actual_port,
        token: capability_token,
    })
}

const MAX_EXPAND_BODY_SIZE: usize = 256 * 1024 * 1024;
const MAX_UPLOAD_MANIFEST_SIZE: usize = 16 * 1024 * 1024;

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct ClientPoolKey {
    proxy_mode: String,
    proxy_url: Option<String>,
    relax_certs: bool,
    http1_only: bool,
    bypass_proxy: bool,
}

static CLIENT_POOL: Lazy<StdMutex<HashMap<ClientPoolKey, reqwest::Client>>> =
    Lazy::new(|| StdMutex::new(HashMap::new()));

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MultipartManifest {
    parts: Vec<MultipartManifestPart>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MultipartManifestPart {
    name: String,
    body: MultipartManifestPartBody,
    filename: Option<String>,
    content_type: Option<String>,
    headers: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum MultipartManifestPartBody {
    Text { value: String },
    Bytes { base64: String },
    FileRef { r#ref: LocalFileRefPayload },
}

async fn handle_raw_proxy_router(
    State(state): State<ProxyRouterState>,
    method: Method,
    headers: AxumHeaderMap,
    body: Body,
) -> (StatusCode, AxumHeaderMap, Body) {
    if let Err(error) = validate_proxy_request(&headers, &state) {
        return error_response(error);
    }
    into_router_response(handle_raw_proxy(method, headers, body).await)
}

async fn handle_json_expand_proxy_router(
    State(state): State<ProxyRouterState>,
    method: Method,
    headers: AxumHeaderMap,
    body: Body,
) -> (StatusCode, AxumHeaderMap, Body) {
    if let Err(error) = validate_proxy_request(&headers, &state) {
        return error_response(error);
    }
    into_router_response(handle_json_expand_proxy(method, headers, body).await)
}

fn into_router_response(
    result: Result<(StatusCode, AxumHeaderMap, Body), (StatusCode, String)>,
) -> (StatusCode, AxumHeaderMap, Body) {
    match result {
        Ok(response) => response,
        Err(error) => error_response(error),
    }
}

fn error_response(error: (StatusCode, String)) -> (StatusCode, AxumHeaderMap, Body) {
    (error.0, AxumHeaderMap::new(), Body::from(error.1))
}

fn validate_proxy_request(
    headers: &AxumHeaderMap,
    state: &ProxyRouterState,
) -> Result<(), (StatusCode, String)> {
    let token_matches = get_header_str(headers, "x-proxy-token")
        .is_some_and(|token| token.as_bytes() == state.token.as_bytes());
    if !token_matches {
        return Err((StatusCode::UNAUTHORIZED, "Invalid proxy capability".into()));
    }

    get_header_str(headers, "origin")
        .filter(|origin| is_allowed_origin(origin))
        .map(|_| ())
        .ok_or((StatusCode::FORBIDDEN, "Proxy origin is not allowed".into()))
}

fn is_allowed_origin(origin: &str) -> bool {
    if matches!(
        origin,
        "tauri://localhost" | "http://tauri.localhost" | "https://tauri.localhost"
    ) {
        return true;
    }

    reqwest::Url::parse(origin).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && url
                .host_str()
                .is_some_and(|host| host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1")
    })
}

async fn handle_json_expand_proxy(
    method: Method,
    headers: AxumHeaderMap,
    body: Body,
) -> Result<(StatusCode, AxumHeaderMap, Body), (StatusCode, String)> {
    let mut value = serde_json::from_slice::<serde_json::Value>(
        &axum::body::to_bytes(body, MAX_EXPAND_BODY_SIZE)
            .await
            .map_err(|_| (StatusCode::BAD_REQUEST, "JSON body is too large".into()))?,
    )
    .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid JSON body".into()))?;
    process_body_recursive(&mut value)
        .await
        .map_err(|message| (StatusCode::BAD_REQUEST, message))?;
    let expanded = serde_json::to_vec(&value).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "Failed to serialize JSON body".into(),
        )
    })?;
    send_upstream_request(method, headers, Some(reqwest::Body::from(expanded)), None).await
}

async fn handle_raw_proxy(
    method: Method,
    headers: AxumHeaderMap,
    body: Body,
) -> Result<(StatusCode, AxumHeaderMap, Body), (StatusCode, String)> {
    match get_header_str(&headers, "x-aio-body-kind").unwrap_or("raw") {
        "raw" => {
            let has_body = headers.contains_key(axum::http::header::CONTENT_TYPE)
                || headers.contains_key(axum::http::header::CONTENT_LENGTH);
            let upstream_body = has_body.then(|| {
                let stream = body
                    .into_data_stream()
                    .map(|result| result.map_err(std::io::Error::other));
                reqwest::Body::wrap_stream(stream)
            });
            send_upstream_request(method, headers, upstream_body, None).await
        }
        "file-ref" => {
            let bytes = axum::body::to_bytes(body, MAX_UPLOAD_MANIFEST_SIZE)
                .await
                .map_err(|_| {
                    (
                        StatusCode::BAD_REQUEST,
                        "File reference is too large".into(),
                    )
                })?;
            let file_ref = serde_json::from_slice::<LocalFileRefPayload>(&bytes)
                .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid file reference".into()))?;
            validate_local_file_ref(&file_ref)
                .map_err(|message| (StatusCode::BAD_REQUEST, message))?;
            let (file_body, content_type) = open_file_body(&file_ref).await?;
            send_upstream_request(method, headers, Some(file_body), Some(content_type)).await
        }
        "multipart-manifest" => {
            let bytes = axum::body::to_bytes(body, MAX_UPLOAD_MANIFEST_SIZE)
                .await
                .map_err(|_| {
                    (
                        StatusCode::BAD_REQUEST,
                        "Multipart manifest is too large".into(),
                    )
                })?;
            let manifest = serde_json::from_slice::<MultipartManifest>(&bytes)
                .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid multipart manifest".into()))?;
            let form = build_multipart_form(manifest).await?;
            send_upstream_request_with_form(method, headers, form).await
        }
        _ => Err((
            StatusCode::BAD_REQUEST,
            "Unsupported proxy body kind".into(),
        )),
    }
}

async fn build_multipart_form(
    manifest: MultipartManifest,
) -> Result<reqwest::multipart::Form, (StatusCode, String)> {
    let mut form = reqwest::multipart::Form::new();
    for manifest_part in manifest.parts {
        if manifest_part.name.is_empty() || manifest_part.name.len() > 1024 {
            return Err((
                StatusCode::BAD_REQUEST,
                "Invalid multipart part name".into(),
            ));
        }

        let mut part = match manifest_part.body {
            MultipartManifestPartBody::Text { value } => reqwest::multipart::Part::text(value),
            MultipartManifestPartBody::Bytes { base64 } => {
                let bytes = STANDARD.decode(base64).map_err(|_| {
                    (
                        StatusCode::BAD_REQUEST,
                        "Invalid multipart byte payload".into(),
                    )
                })?;
                reqwest::multipart::Part::bytes(bytes)
            }
            MultipartManifestPartBody::FileRef { r#ref } => {
                validate_local_file_ref(&r#ref)
                    .map_err(|message| (StatusCode::BAD_REQUEST, message))?;
                let file = tokio::fs::File::open(&r#ref.path).await.map_err(|_| {
                    (
                        StatusCode::BAD_REQUEST,
                        "Failed to read multipart file".into(),
                    )
                })?;
                let length = file
                    .metadata()
                    .await
                    .map_err(|_| {
                        (
                            StatusCode::BAD_REQUEST,
                            "Failed to inspect multipart file".into(),
                        )
                    })?
                    .len();
                let body = reqwest::Body::wrap_stream(ReaderStream::new(file));
                let mut part = reqwest::multipart::Part::stream_with_length(body, length);
                if manifest_part.filename.is_none() {
                    if let Some(filename) = Path::new(&r#ref.path).file_name() {
                        part = part.file_name(filename.to_string_lossy().into_owned());
                    }
                }
                if manifest_part.content_type.is_none() {
                    if let Some(content_type) = r#ref.content_type.as_deref() {
                        part = part.mime_str(content_type).map_err(|_| {
                            (
                                StatusCode::BAD_REQUEST,
                                "Invalid multipart content type".into(),
                            )
                        })?;
                    }
                }
                part
            }
        };

        if let Some(filename) = manifest_part.filename {
            part = part.file_name(filename);
        }
        if let Some(content_type) = manifest_part.content_type {
            part = part.mime_str(&content_type).map_err(|_| {
                (
                    StatusCode::BAD_REQUEST,
                    "Invalid multipart content type".into(),
                )
            })?;
        }
        if let Some(headers) = manifest_part.headers {
            part = part.headers(parse_manifest_headers(headers)?);
        }
        form = form.part(manifest_part.name, part);
    }
    Ok(form)
}

fn parse_manifest_headers(
    headers: HashMap<String, String>,
) -> Result<HeaderMap, (StatusCode, String)> {
    let mut parsed = HeaderMap::new();
    for (name, value) in headers {
        let name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid multipart header".into()))?;
        let value = HeaderValue::from_bytes(value.as_bytes())
            .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid multipart header".into()))?;
        parsed.append(name, value);
    }
    Ok(parsed)
}

async fn open_file_body(
    file_ref: &LocalFileRefPayload,
) -> Result<(reqwest::Body, String), (StatusCode, String)> {
    let file = tokio::fs::File::open(&file_ref.path)
        .await
        .map_err(|_| (StatusCode::BAD_REQUEST, "Failed to read local file".into()))?;
    let content_type = file_ref
        .content_type
        .clone()
        .unwrap_or_else(|| "application/octet-stream".into());
    Ok((
        reqwest::Body::wrap_stream(ReaderStream::new(file)),
        content_type,
    ))
}

async fn send_upstream_request(
    method: Method,
    headers: AxumHeaderMap,
    body: Option<reqwest::Body>,
    content_type: Option<String>,
) -> Result<(StatusCode, AxumHeaderMap, Body), (StatusCode, String)> {
    let metadata = ProxyRequestMetadata::from_headers(&headers)?;
    let client = get_proxy_client(
        &metadata.target_url,
        &metadata.proxy_mode,
        metadata.proxy_url.as_deref(),
        metadata.relax_certs,
        metadata.http1_only,
    )
    .map_err(|message| (StatusCode::INTERNAL_SERVER_ERROR, message))?;
    let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
        .map_err(|_| (StatusCode::METHOD_NOT_ALLOWED, "Unsupported method".into()))?;
    let mut forward_headers = collect_forward_headers(&headers);
    if let Some(content_type) = content_type {
        let value = HeaderValue::from_str(&content_type)
            .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid content type".into()))?;
        forward_headers.insert(reqwest::header::CONTENT_TYPE, value);
    }

    let mut request = client
        .request(reqwest_method, &metadata.target_url)
        .headers(forward_headers);
    if let Some(body) = body {
        request = request.body(body);
    }
    let response = send_request(request, &metadata).await?;
    relay_upstream_response(response, &metadata)
}

async fn send_upstream_request_with_form(
    method: Method,
    headers: AxumHeaderMap,
    form: reqwest::multipart::Form,
) -> Result<(StatusCode, AxumHeaderMap, Body), (StatusCode, String)> {
    let metadata = ProxyRequestMetadata::from_headers(&headers)?;
    let client = get_proxy_client(
        &metadata.target_url,
        &metadata.proxy_mode,
        metadata.proxy_url.as_deref(),
        metadata.relax_certs,
        metadata.http1_only,
    )
    .map_err(|message| (StatusCode::INTERNAL_SERVER_ERROR, message))?;
    let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
        .map_err(|_| (StatusCode::METHOD_NOT_ALLOWED, "Unsupported method".into()))?;
    let mut forward_headers = collect_forward_headers(&headers);
    forward_headers.remove(reqwest::header::CONTENT_TYPE);
    let request = client
        .request(reqwest_method, &metadata.target_url)
        .headers(forward_headers)
        .multipart(form);
    let response = send_request(request, &metadata).await?;
    relay_upstream_response(response, &metadata)
}

async fn send_request(
    request: reqwest::RequestBuilder,
    metadata: &ProxyRequestMetadata,
) -> Result<reqwest::Response, (StatusCode, String)> {
    info!(
        "[Proxy-{}] {} request to {}",
        metadata.request_id, metadata.body_path, metadata.safe_target
    );
    request.send().await.map_err(|error| {
        let safe_error = error.without_url();
        error!(
            "[Proxy-{}] Upstream request failed: {safe_error}",
            metadata.request_id
        );
        (
            StatusCode::BAD_GATEWAY,
            format!("Upstream request failed: {safe_error}"),
        )
    })
}

fn relay_upstream_response(
    response: reqwest::Response,
    metadata: &ProxyRequestMetadata,
) -> Result<(StatusCode, AxumHeaderMap, Body), (StatusCode, String)> {
    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut headers = copy_response_headers(response.headers());
    if metadata.streaming {
        headers.insert(
            axum::http::header::CACHE_CONTROL,
            axum::http::HeaderValue::from_static("no-cache"),
        );
        headers.insert(
            axum::http::HeaderName::from_static("x-accel-buffering"),
            axum::http::HeaderValue::from_static("no"),
        );
    }
    let stream = response
        .bytes_stream()
        .map(|item| item.map_err(std::io::Error::other));
    Ok((status, headers, Body::from_stream(stream)))
}

fn copy_response_headers(headers: &HeaderMap) -> AxumHeaderMap {
    const HOP_BY_HOP: &[&str] = &[
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
    let mut result = AxumHeaderMap::new();
    for (name, value) in headers {
        if HOP_BY_HOP.contains(&name.as_str().to_ascii_lowercase().as_str()) {
            continue;
        }
        if let (Ok(name), Ok(value)) = (
            axum::http::HeaderName::from_bytes(name.as_str().as_bytes()),
            axum::http::HeaderValue::from_bytes(value.as_bytes()),
        ) {
            result.append(name, value);
        }
    }
    result
}

#[derive(Debug)]
struct ProxyRequestMetadata {
    target_url: String,
    safe_target: String,
    proxy_mode: String,
    proxy_url: Option<String>,
    relax_certs: bool,
    http1_only: bool,
    streaming: bool,
    request_id: String,
    body_path: &'static str,
}

impl ProxyRequestMetadata {
    fn from_headers(headers: &AxumHeaderMap) -> Result<Self, (StatusCode, String)> {
        let target_url = get_header_str(headers, "x-aio-target-url")
            .ok_or((StatusCode::BAD_REQUEST, "Missing target URL".into()))?
            .to_string();
        let parsed = reqwest::Url::parse(&target_url)
            .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid target URL".into()))?;
        if !matches!(parsed.scheme(), "http" | "https") {
            return Err((
                StatusCode::BAD_REQUEST,
                "Unsupported target URL scheme".into(),
            ));
        }
        let safe_target = {
            let mut safe = parsed;
            safe.set_query(None);
            safe.set_fragment(None);
            safe.to_string()
        };
        let body_path = match get_header_str(headers, "x-aio-body-kind") {
            Some("file-ref") => "file-ref",
            Some("multipart-manifest") => "multipart",
            _ if get_header_str(headers, "x-aio-json-expand") == Some("true") => "json-expand",
            _ => "raw",
        };
        Ok(Self {
            target_url,
            safe_target,
            proxy_mode: get_header_str(headers, "x-aio-proxy-mode")
                .unwrap_or("system")
                .to_string(),
            proxy_url: get_header_str(headers, "x-aio-proxy-url")
                .filter(|value| !value.is_empty())
                .map(str::to_string),
            relax_certs: parse_bool_header(headers, "x-aio-relax-certs", true),
            http1_only: parse_bool_header(headers, "x-aio-http1-only", true),
            streaming: parse_bool_header(headers, "x-aio-streaming", false),
            request_id: nanoid::nanoid!(8),
            body_path,
        })
    }
}

fn parse_bool_header(headers: &AxumHeaderMap, name: &str, default: bool) -> bool {
    get_header_str(headers, name)
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn collect_forward_headers(headers: &AxumHeaderMap) -> HeaderMap {
    let mut result = HeaderMap::new();
    for (name, value) in headers {
        let lower = name.as_str().to_ascii_lowercase();
        if lower.starts_with("x-aio-")
            || lower == "x-proxy-token"
            || matches!(
                lower.as_str(),
                "host" | "origin" | "accept-encoding" | "content-length"
            )
            || lower.starts_with("sec-fetch-")
        {
            continue;
        }
        if let (Ok(name), Ok(value)) = (
            HeaderName::from_bytes(name.as_str().as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            result.append(name, value);
        }
    }
    result
}

fn get_proxy_client(
    target_url: &str,
    proxy_mode: &str,
    proxy_url: Option<&str>,
    relax_certs: bool,
    http1_only: bool,
) -> Result<reqwest::Client, String> {
    let bypass_proxy = reqwest::Url::parse(target_url)
        .ok()
        .and_then(|url| {
            url.host_str()
                .map(|host| host.parse::<std::net::IpAddr>().is_ok())
        })
        .unwrap_or(false)
        || proxy_mode == "none";
    let key = ClientPoolKey {
        proxy_mode: proxy_mode.to_string(),
        proxy_url: proxy_url.filter(|url| !url.is_empty()).map(str::to_string),
        relax_certs,
        http1_only,
        bypass_proxy,
    };
    let mut pool = CLIENT_POOL
        .lock()
        .map_err(|_| "LLM proxy client pool is unavailable".to_string())?;
    if let Some(client) = pool.get(&key) {
        return Ok(client.clone());
    }

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
    if bypass_proxy {
        builder = builder.no_proxy();
    } else if proxy_mode == "custom" {
        if let Some(url) = proxy_url.filter(|url| !url.is_empty()) {
            builder = builder
                .proxy(reqwest::Proxy::all(url).map_err(|_| "Invalid proxy URL".to_string())?);
        }
    }

    let client = builder
        .build()
        .map_err(|error| format!("Failed to build client: {error}"))?;
    pool.insert(key, client.clone());
    Ok(client)
}

fn get_header_str<'a>(headers: &'a AxumHeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|value| value.to_str().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_allows_tauri_and_loopback_origins() {
        assert!(is_allowed_origin("tauri://localhost"));
        assert!(is_allowed_origin("http://tauri.localhost"));
        assert!(is_allowed_origin("http://localhost:1420"));
        assert!(is_allowed_origin("http://127.0.0.1:1420"));
        assert!(!is_allowed_origin("https://example.com"));
        assert!(!is_allowed_origin("null"));
    }

    #[test]
    fn rejects_malformed_tagged_file_references() {
        let value = serde_json::json!({
            "kind": "local-file-ref",
            "path": "C:/media/image.png",
            "providerField": true
        });
        assert!(parse_tagged_local_file_ref(value.as_object().unwrap()).is_err());
    }

    #[test]
    fn requires_matching_capability_and_allowed_origin() {
        let state = ProxyRouterState {
            token: "current-token".into(),
        };
        let mut headers = AxumHeaderMap::new();
        headers.insert("origin", "http://localhost:1420".parse().unwrap());
        assert_eq!(
            validate_proxy_request(&headers, &state).unwrap_err().0,
            StatusCode::UNAUTHORIZED
        );

        headers.insert("x-proxy-token", "current-token".parse().unwrap());
        assert!(validate_proxy_request(&headers, &state).is_ok());
        headers.insert("origin", "https://example.com".parse().unwrap());
        assert_eq!(
            validate_proxy_request(&headers, &state).unwrap_err().0,
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn expands_nested_tagged_file_references() {
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), b"aiohub").unwrap();
        let mut value = serde_json::json!({
            "input": [{
                "kind": "local-file-ref",
                "path": file.path().to_string_lossy(),
                "contentType": "text/plain"
            }]
        });

        process_body_recursive(&mut value).await.unwrap();
        assert_eq!(value["input"][0], "data:text/plain;base64,YWlvaHVi");
    }

    #[test]
    fn top_level_file_reference_rejects_unknown_fields() {
        let value = br#"{
            "kind":"local-file-ref",
            "path":"C:/media/image.png",
            "providerField":true
        }"#;
        assert!(serde_json::from_slice::<LocalFileRefPayload>(value).is_err());
    }

    #[test]
    fn strips_query_parameters_from_logged_target() {
        let mut headers = AxumHeaderMap::new();
        headers.insert(
            "x-aio-target-url",
            "https://example.com/chat?key=secret".parse().unwrap(),
        );
        let metadata = ProxyRequestMetadata::from_headers(&headers).unwrap();
        assert_eq!(metadata.safe_target, "https://example.com/chat");
    }
}
