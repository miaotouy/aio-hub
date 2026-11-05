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
    extract::{Query, Request, State as AxumState},
    http::{header, HeaderMap as AxumHeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use log::{error, info, warn};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use url::Url;
use wreq::header::HeaderValue;

pub type SharedProxyState = Arc<Mutex<DistilleryProxyState>>;

#[derive(Default)]
pub struct DistilleryProxyState {
    pub is_running: bool,
    pub port: u16,
    pub active_cookies: Option<String>,
    pub active_local_storage: Option<String>,
    pub active_target_origin: Option<String>,
    pub cookie_origin: Option<String>,
    pub origin: Option<String>,
    pub settings: super::net::ProxySettings,
    pub root_token: CancellationToken,
    control: Arc<Mutex<()>>,
    token: Option<CancellationToken>,
    worker: Option<tokio::task::JoinHandle<()>>,
}

pub fn new_proxy_state(token: CancellationToken) -> SharedProxyState {
    Arc::new(Mutex::new(DistilleryProxyState {
        root_token: token,
        ..Default::default()
    }))
}

/// 从 Set-Cookie 响应头中解析 name=value，并合并到现有的 cookie 字符串中。
/// 这模拟了浏览器的 Cookie Jar 行为：每次响应中的 Set-Cookie 都会被记录，
/// 后续请求会自动携带所有已知 cookies。
fn merge_set_cookies(existing: &Option<String>, set_cookie_headers: &[String]) -> Option<String> {
    if set_cookie_headers.is_empty() {
        return existing.clone();
    }

    // 解析现有 cookies 到 HashMap
    let mut cookie_map: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    if let Some(ref existing_str) = existing {
        for pair in existing_str.split(';') {
            let pair = pair.trim();
            if let Some(eq_idx) = pair.find('=') {
                let name = pair[..eq_idx].trim().to_string();
                let value = pair[eq_idx + 1..].trim().to_string();
                if !name.is_empty() {
                    cookie_map.insert(name, value);
                }
            }
        }
    }

    // 解析 Set-Cookie 头并合并
    for set_cookie in set_cookie_headers {
        // Set-Cookie 格式: name=value; Path=/; HttpOnly; ...
        // 只取第一个 `;` 之前的 name=value 部分
        let cookie_part = set_cookie.split(';').next().unwrap_or("").trim();
        if let Some(eq_idx) = cookie_part.find('=') {
            let name = cookie_part[..eq_idx].trim().to_string();
            let value = cookie_part[eq_idx + 1..].trim().to_string();
            if !name.is_empty() {
                // 检查是否是删除 cookie（Max-Age=0 或 expires 已过期）
                let lower = set_cookie.to_lowercase();
                if lower.contains("max-age=0") || lower.contains("max-age=-") {
                    cookie_map.remove(&name);
                } else {
                    cookie_map.insert(name, value);
                }
            }
        }
    }

    if cookie_map.is_empty() {
        None
    } else {
        let result: Vec<String> = cookie_map
            .into_iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();
        Some(result.join("; "))
    }
}

#[derive(Deserialize)]
pub struct ProxyQuery {
    pub url: String,
}

/// Each server has an unguessable, distinct loopback origin and a single owning window.
pub async fn distillery_start_proxy(
    proxy_state: SharedProxyState,
    settings: super::net::ProxySettings,
) -> Result<u16, String> {
    let control = proxy_state.lock().await.control.clone();
    let _guard = control.lock().await;
    let mut state = proxy_state.lock().await;
    if state.root_token.is_cancelled() {
        return Err("网页代理已随窗口关闭".into());
    }
    state.settings = settings;
    if state.is_running {
        return Ok(state.port);
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    state.origin = Some(format!(
        "http://{}.localhost:{}",
        uuid::Uuid::new_v4().simple(),
        port
    ));
    let token = state.root_token.child_token();
    state.token = Some(token.clone());
    state.is_running = true;
    state.port = port;
    let server_state = proxy_state.clone();
    let router = Router::new()
        .route("/proxy", get(handle_proxy_html))
        .route("/proxy-resource", axum::routing::any(handle_proxy_resource))
        .route("/__distillery/bridge.js", get(handle_bridge_js))
        .route("/__distillery/sniffer.js", get(handle_sniffer_js))
        .route(
            "/__distillery/anti-detection.js",
            get(handle_anti_detection_js),
        )
        .route(
            "/__distillery/resource-proxy.js",
            get(handle_resource_proxy_js),
        )
        .fallback(handle_fallback)
        .layer(middleware::from_fn_with_state(
            proxy_state.clone(),
            guard_session,
        ))
        .with_state(proxy_state.clone());
    state.worker = Some(tokio::spawn(async move {
        let outcome = axum::serve(listener, router)
            .with_graceful_shutdown(token.cancelled_owned())
            .await;
        if let Err(error) = outcome {
            error!("[Distillery-Proxy] Server failed: {}", error);
        }
        server_state.lock().await.is_running = false;
    }));
    Ok(port)
}

pub async fn distillery_stop_proxy(proxy_state: SharedProxyState) -> Result<(), String> {
    let control = proxy_state.lock().await.control.clone();
    let _guard = control.lock().await;
    let worker = {
        let mut state = proxy_state.lock().await;
        if let Some(token) = state.token.take() {
            token.cancel();
        }
        state.is_running = false;
        state.port = 0;
        state.origin = None;
        state.active_target_origin = None;
        state.active_cookies = None;
        state.active_local_storage = None;
        state.cookie_origin = None;
        state.worker.take()
    };
    if let Some(mut worker) = worker {
        if tokio::time::timeout(std::time::Duration::from_secs(5), &mut worker)
            .await
            .is_err()
        {
            worker.abort();
            let _ = worker.await;
        }
    }
    Ok(())
}

pub async fn distillery_get_proxy_port(proxy_state: SharedProxyState) -> Result<u16, String> {
    let state = proxy_state.lock().await;
    Ok(if state.is_running { state.port } else { 0 })
}
pub async fn distillery_get_proxy_origin(
    proxy_state: SharedProxyState,
) -> Result<Option<String>, String> {
    let state = proxy_state.lock().await;
    Ok(if state.is_running {
        state.origin.clone()
    } else {
        None
    })
}
pub async fn distillery_set_proxy_cookies(
    proxy_state: SharedProxyState,
    cookies: Option<String>,
) -> Result<(), String> {
    let mut state = proxy_state.lock().await;
    state.active_cookies = cookies;
    state.cookie_origin = None;
    Ok(())
}
pub async fn distillery_get_proxy_cookies(
    proxy_state: SharedProxyState,
) -> Result<Option<String>, String> {
    Ok(proxy_state.lock().await.active_cookies.clone())
}
pub async fn distillery_set_proxy_local_storage(
    proxy_state: SharedProxyState,
    data: Option<String>,
) -> Result<(), String> {
    if let Some(json) = &data {
        let parsed: serde_json::Value =
            serde_json::from_str(json).map_err(|_| "LocalStorage 数据格式无效")?;
        if !parsed.is_object() {
            return Err("LocalStorage 数据需要键值对象".into());
        }
        if json.len() > 1024 * 1024 {
            return Err("LocalStorage 数据过大".into());
        }
    }
    proxy_state.lock().await.active_local_storage = data;
    Ok(())
}

async fn guard_session(
    AxumState(proxy_state): AxumState<SharedProxyState>,
    req: Request,
    next: Next,
) -> Response {
    let (origin, token) = {
        let state = proxy_state.lock().await;
        (state.origin.clone(), state.token.clone())
    };
    let expected_host = origin
        .as_deref()
        .and_then(|value| value.strip_prefix("http://"));
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok());
    if expected_host.is_none() || host != expected_host {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Some(token) = token else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    tokio::select! {
        mut response = next.run(req) => {
            response.headers_mut().insert("referrer-policy", HeaderValue::from_static("no-referrer"));
            response.headers_mut().insert("cache-control", HeaderValue::from_static("no-store"));
            response
        },
        _ = token.cancelled() => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

/// 构建 localStorage 还原脚本（内联 <script>）
/// 在页面 JS 执行前同步写入 localStorage，确保 SPA 能读取到 token
fn build_local_storage_script(local_storage_json: &Option<String>) -> String {
    local_storage_json.as_ref().filter(|json| !json.is_empty()).map(|json| {
        let encoded = serde_json::to_string(json).unwrap_or_default().replace('<', r"\u003c");
        format!(r#"<script>(function(){{try{{var d=JSON.parse({});localStorage.clear();for(var k in d){{if(Object.prototype.hasOwnProperty.call(d,k))localStorage.setItem(k,d[k])}}}}catch(e){{}}}})()</script>"#, encoded)
    }).unwrap_or_else(|| "<script>try{localStorage.clear()}catch(e){}</script>".into())
}

fn inject_html(mut html: String, local_storage: &Option<String>, target: &Url) -> String {
    let source = serde_json::to_string(target.as_str())
        .unwrap_or_default()
        .replace('<', r"\u003c");
    let head = format!(
        r#"<base href="{}"><script>window.__DISTILLERY_TARGET_URL__={};</script><script src="/__distillery/anti-detection.js"></script><script src="/__distillery/resource-proxy.js"></script>{}"#,
        target.path().replace('&', "&amp;").replace('"', "&quot;"),
        source,
        build_local_storage_script(local_storage)
    );
    let lower = html.to_ascii_lowercase();
    if let Some(end) = lower
        .find("<head")
        .and_then(|pos| lower[pos..].find('>').map(|end| pos + end + 1))
    {
        html.insert_str(end, &head);
    } else {
        html.insert_str(0, &head);
    }
    let body = r#"<script src="/__distillery/bridge.js" defer></script><script src="/__distillery/sniffer.js" defer></script>"#;
    if let Some(pos) = html.to_ascii_lowercase().rfind("</body>") {
        html.insert_str(pos, body);
    } else {
        html.push_str(body);
    }
    html
}

/// 处理 HTML 代理请求
async fn handle_proxy_html(
    AxumState(proxy_state): AxumState<SharedProxyState>,
    Query(query): Query<ProxyQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let target_url = query.url;
    let decoded_url = target_url;
    let parsed_target =
        super::net::validate_url(&decoded_url).map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    // 提取并存储目标 origin，供 fallback 路由使用
    let target_origin = parsed_target.origin().ascii_serialization();

    info!(
        "[Distillery-Proxy] Proxying HTML: {} (origin: {})",
        decoded_url, target_origin
    );

    let settings = proxy_state.lock().await.settings.clone();
    let client = super::net::build_impersonated_client(
        Some(&settings),
        std::time::Duration::from_secs(15),
        &decoded_url,
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let mut request = client.get(&decoded_url);

    // 注入激活的 cookie，同时设置 active_target_origin
    {
        let mut state = proxy_state.lock().await;
        if state
            .cookie_origin
            .as_ref()
            .is_some_and(|origin| origin != &target_origin)
        {
            state.active_cookies = None;
            state.active_local_storage = None;
        }
        state.cookie_origin = Some(target_origin.clone());
        state.active_target_origin = Some(target_origin);
        if let Some(ref cookies) = state.active_cookies {
            if !cookies.is_empty() {
                request = request.header("Cookie", cookies.as_str());
            }
        }
    } // 锁在此释放

    let response = request
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Request failed: {}", e)))?;

    let resolved_target = Url::parse(&response.uri().to_string())
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
    {
        let mut state = proxy_state.lock().await;
        let resolved_origin = resolved_target.origin().ascii_serialization();
        if state
            .cookie_origin
            .as_ref()
            .is_some_and(|origin| origin != &resolved_origin)
        {
            state.active_cookies = None;
            state.active_local_storage = None;
        }
        state.cookie_origin = Some(resolved_origin.clone());
        state.active_target_origin = Some(resolved_origin);
    }
    let upstream_content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);

    // Cookie Jar: 自动累积响应中的 Set-Cookie 到 active_cookies
    let set_cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();
    if !set_cookies.is_empty() {
        let mut state = proxy_state.lock().await;
        state.active_cookies = merge_set_cookies(&state.active_cookies, &set_cookies);
        info!(
            "[Distillery-Proxy] Cookie Jar updated from proxy_html ({} Set-Cookie headers)",
            set_cookies.len()
        );
    }

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut resp_headers = AxumHeaderMap::new();

    // 过滤安全头、hop-by-hop 头以及会导致 body 大小不匹配的头
    let unsafe_headers = [
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
        "access-control-allow-origin",
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
        "set-cookie",
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
    resp_headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );

    let bytes = super::net::read_bounded(response, 32 * 1024 * 1024)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;
    let html = super::fetcher::decode_html_bytes(&bytes, upstream_content_type.as_deref());
    let storage = proxy_state.lock().await.active_local_storage.clone();
    let html = inject_html(html, &storage, &resolved_target);

    Ok((status, resp_headers, html))
}

/// 处理子资源代理请求 (CSS/JS/Images/API) — 显式代理模式
/// 支持所有 HTTP 方法，自动添加 Referer 头以绕过 CDN 防盗链
async fn handle_proxy_resource(
    AxumState(proxy_state): AxumState<SharedProxyState>,
    Query(query): Query<ProxyQuery>,
    req: Request,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let target_url = query.url;
    let decoded_url = target_url;
    let parsed_target =
        super::net::validate_url(&decoded_url).map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    // 提取目标 URL 的 origin 作为 Referer（绕过 CDN 防盗链检查）
    let referer = if let Ok(parsed) = Url::parse(&decoded_url) {
        format!("{}/", parsed.origin().ascii_serialization())
    } else {
        String::new()
    };

    let req_method = req.method().clone();
    let req_headers = req.headers().clone();

    // 读取请求 body（支持 POST 等方法）
    let body_bytes = axum::body::to_bytes(req.into_body(), 10 * 1024 * 1024)
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                format!("Failed to read body: {}", e),
            )
        })?;

    let settings = proxy_state.lock().await.settings.clone();
    let client = super::net::build_impersonated_client(
        Some(&settings),
        std::time::Duration::from_secs(15),
        &decoded_url,
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let wreq_method =
        wreq::Method::from_bytes(req_method.as_str().as_bytes()).unwrap_or(wreq::Method::GET);
    let mut request = client.request(wreq_method, &decoded_url);

    // 注入 Referer 头（关键：绕过 B站等 CDN 的防盗链）
    if !referer.is_empty() {
        request = request.header("Referer", referer.as_str());
    }

    // 注入 cookie
    {
        let state = proxy_state.lock().await;
        if state.cookie_origin.as_deref()
            == Some(parsed_target.origin().ascii_serialization().as_str())
        {
            if let Some(ref cookies) = state.active_cookies {
                if !cookies.is_empty() {
                    request = request.header("Cookie", cookies.as_str());
                }
            }
        }
    }

    // 转发原始请求头（过滤掉 host、hop-by-hop 头和 cookie/referer）
    let skip_headers = [
        "host",
        "connection",
        "transfer-encoding",
        "upgrade",
        "te",
        "trailer",
        "cookie",
        "referer",
        "origin",
        "proxy-authorization",
    ];
    for (name, value) in req_headers.iter() {
        let name_str = name.as_str().to_lowercase();
        if skip_headers.contains(&name_str.as_str()) {
            continue;
        }
        if let Ok(v) = value.to_str() {
            request = request.header(name.as_str(), v);
        }
    }

    // 附加 body（非空时）
    if !body_bytes.is_empty() {
        request = request.body(body_bytes.to_vec());
    }

    let response = request
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Request failed: {}", e)))?;

    let resolved_origin = Url::parse(&response.uri().to_string())
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?
        .origin()
        .ascii_serialization();

    // Cookie Jar: 子资源请求也可能返回 Set-Cookie（如跟踪 cookie）
    let set_cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();
    if !set_cookies.is_empty() {
        let mut state = proxy_state.lock().await;
        if state.cookie_origin.as_deref() == Some(resolved_origin.as_str()) {
            state.active_cookies = merge_set_cookies(&state.active_cookies, &set_cookies);
        }
    }

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut resp_headers = AxumHeaderMap::new();

    // 过滤安全头、hop-by-hop 头以及会导致 body 大小不匹配的头
    let unsafe_headers = [
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
        "access-control-allow-origin",
        "access-control-allow-credentials",
        "access-control-allow-methods",
        "access-control-allow-headers",
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
        "set-cookie",
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

    let bytes = super::net::read_bounded(response, 32 * 1024 * 1024)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;
    Ok((status, resp_headers, Body::from(bytes)))
}

/// Fallback 路由：将所有未匹配的请求透传到目标服务器（完整反向代理）
/// 这解决了 CORS 问题 — 页面内的 XHR/fetch 请求不再跨域
async fn handle_fallback(
    AxumState(proxy_state): AxumState<SharedProxyState>,
    req: Request,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let (target_origin, cookies, settings) = {
        let state = proxy_state.lock().await;
        let origin = state.active_target_origin.clone();
        let cookies = state.active_cookies.clone();
        let settings = state.settings.clone();
        (origin, cookies, settings)
    };

    let target_origin = match target_origin {
        Some(origin) if !origin.is_empty() => origin,
        _ => {
            warn!("[Distillery-Proxy] Fallback: no active target origin set");
            return Err((
                StatusCode::BAD_GATEWAY,
                "No active target origin. Load a page via /proxy first.".to_string(),
            ));
        }
    };

    let method = req.method().clone();
    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str().to_string())
        .unwrap_or_else(|| "/".to_string());
    let req_headers = req.headers().clone();

    let target_url = format!("{}{}", target_origin, path_and_query);

    // 读取请求 body
    let body_bytes = axum::body::to_bytes(req.into_body(), 50 * 1024 * 1024)
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                format!("Failed to read body: {}", e),
            )
        })?;

    let client = super::net::build_impersonated_client(
        Some(&settings),
        std::time::Duration::from_secs(30),
        &target_url,
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let wreq_method =
        wreq::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(wreq::Method::GET);
    let mut request = client.request(wreq_method, &target_url);

    request = request.header("Referer", format!("{}/", target_origin));
    if req_headers.contains_key("origin") {
        request = request.header("Origin", target_origin.as_str());
    }

    // 注入 cookie
    if let Some(ref cookie_str) = cookies {
        if !cookie_str.is_empty() {
            request = request.header("Cookie", cookie_str.as_str());
        }
    }

    // 转发原始请求头（过滤掉 host、hop-by-hop 头和 cookie）
    // cookie 必须过滤：iframe 请求可能自带针对代理域(127.0.0.1)的 cookie，
    // 与上面注入的 active_cookies 冲突会导致目标服务器 401
    let skip_headers = [
        "host",
        "connection",
        "transfer-encoding",
        "upgrade",
        "te",
        "trailer",
        "cookie",
        "referer",
        "origin",
        "proxy-authorization",
    ];
    for (name, value) in req_headers.iter() {
        let name_str = name.as_str().to_lowercase();
        if skip_headers.contains(&name_str.as_str()) {
            continue;
        }
        if let Ok(v) = value.to_str() {
            request = request.header(name.as_str(), v);
        }
    }

    // 附加 body（非空时）
    if !body_bytes.is_empty() {
        request = request.body(body_bytes.to_vec());
    }

    let response = request.send().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Fallback proxy failed: {}", e),
        )
    })?;

    let resolved_target = Url::parse(&response.uri().to_string())
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
    let upstream_content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);

    let resolved_origin = resolved_target.origin().ascii_serialization();
    let navigation = matches!(
        req_headers
            .get("sec-fetch-dest")
            .and_then(|v| v.to_str().ok()),
        Some("iframe" | "document")
    ) && upstream_content_type
        .as_deref()
        .is_some_and(|v| v.contains("text/html"));
    if navigation {
        let mut state = proxy_state.lock().await;
        if state.cookie_origin.as_deref() != Some(resolved_origin.as_str()) {
            state.active_cookies = None;
            state.active_local_storage = None;
        }
        state.active_target_origin = Some(resolved_origin.clone());
        state.cookie_origin = Some(resolved_origin.clone());
    }

    // Cookie Jar: 自动累积响应中的 Set-Cookie 到 active_cookies
    let set_cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();
    if !set_cookies.is_empty() {
        let mut state = proxy_state.lock().await;
        if state.cookie_origin.as_deref() == Some(resolved_origin.as_str()) {
            state.active_cookies = merge_set_cookies(&state.active_cookies, &set_cookies);
        }
        info!(
            "[Distillery-Proxy] Cookie Jar updated from fallback ({} Set-Cookie headers)",
            set_cookies.len()
        );
    }

    // 构建响应
    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut resp_headers = AxumHeaderMap::new();

    let unsafe_resp_headers = [
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
        "access-control-allow-origin",
        "access-control-allow-credentials",
        "access-control-allow-methods",
        "access-control-allow-headers",
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
        "set-cookie",
    ];

    for (name, value) in response.headers().iter() {
        let name_str = name.as_str().to_lowercase();
        if unsafe_resp_headers.contains(&name_str.as_str()) {
            continue;
        }
        if let Ok(axum_name) = axum::http::HeaderName::from_bytes(name.as_str().as_bytes()) {
            if let Ok(axum_value) = axum::http::HeaderValue::from_bytes(value.as_bytes()) {
                resp_headers.insert(axum_name, axum_value);
            }
        }
    }

    let bytes = super::net::read_bounded(response, 32 * 1024 * 1024)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    // 如果响应是 HTML，注入 bridge.js 等脚本（与 handle_proxy_html 一致）
    // 这确保 iframe 内部全量导航（如登录后跳转）后新页面仍有 bridge 通信能力
    let content_type = resp_headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let is_html = content_type.contains("text/html");

    if is_html {
        let html = super::fetcher::decode_html_bytes(&bytes, upstream_content_type.as_deref());
        let storage = proxy_state.lock().await.active_local_storage.clone();
        let html = inject_html(html, &storage, &resolved_target);

        // 移除原始 content-type 中可能的 charset 不匹配，强制 utf-8
        resp_headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/html; charset=utf-8"),
        );

        Ok((status, resp_headers, Body::from(html)))
    } else {
        Ok((status, resp_headers, Body::from(bytes)))
    }
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

/// 返回注入的资源代理脚本（处理跨域请求重写和懒加载修复）
async fn handle_resource_proxy_js() -> Response {
    let content = include_str!("inject/resource-proxy.js");
    Response::builder()
        .header(header::CONTENT_TYPE, "application/javascript")
        .body(Body::from(content))
        .unwrap()
}
