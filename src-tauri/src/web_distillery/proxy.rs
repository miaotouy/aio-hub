use axum::{
    body::Body,
    extract::{Query, Request},
    http::{header, HeaderMap as AxumHeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use log::{error, info, warn};
use once_cell::sync::Lazy;
use reqwest::header::HeaderValue;
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::{oneshot, Mutex};
use url::Url;

// 全局代理服务状态
pub static DISTILLERY_PROXY_STATE: Lazy<Arc<Mutex<DistilleryProxyState>>> =
    Lazy::new(|| Arc::new(Mutex::new(DistilleryProxyState::default())));

#[derive(Default)]
pub struct DistilleryProxyState {
    pub is_running: bool,
    pub port: u16,
    pub shutdown_tx: Option<oneshot::Sender<()>>,
    pub active_cookies: Option<String>,
    /// 当前代理的目标 origin（如 "http://127.0.0.1:6565"），用于 fallback 路由转发
    pub active_target_origin: Option<String>,
}

/// 从 Set-Cookie 响应头中解析 name=value，并合并到现有的 cookie 字符串中。
/// 这模拟了浏览器的 Cookie Jar 行为：每次响应中的 Set-Cookie 都会被记录，
/// 后续请求会自动携带所有已知 cookies。
fn merge_set_cookies(
    existing: &Option<String>,
    set_cookie_headers: &[String],
) -> Option<String> {
    if set_cookie_headers.is_empty() {
        return existing.clone();
    }

    // 解析现有 cookies 到 HashMap
    let mut cookie_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
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
            .route(
                "/__distillery/anti-detection.js",
                get(handle_anti_detection_js),
            )
            .fallback(handle_fallback)
            .layer(tower_http::cors::CorsLayer::permissive());

        info!(
            "[Distillery-Proxy] Server starting on http://127.0.0.1:{}",
            port
        );

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
    state.active_target_origin = None;
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
        Ok(0)
    }
}

/// 设置代理服务器的 Cookie（用于 iframe 代理请求携带身份）
#[tauri::command]
pub async fn distillery_set_proxy_cookies(cookies: Option<String>) -> Result<(), String> {
    let mut state = DISTILLERY_PROXY_STATE.lock().await;
    state.active_cookies = cookies;
    Ok(())
}

/// 获取代理服务器当前累积的所有 Cookie（Cookie Jar 内容）
/// 前端可用此命令在登录后自动同步 cookies 到身份卡片
#[tauri::command]
pub async fn distillery_get_proxy_cookies() -> Result<Option<String>, String> {
    let state = DISTILLERY_PROXY_STATE.lock().await;
    Ok(state.active_cookies.clone())
}

/// 处理 HTML 代理请求
async fn handle_proxy_html(
    Query(query): Query<ProxyQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let target_url = query.url;
    let decoded_url =
        urlencoding::decode(&target_url).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // 提取并存储目标 origin，供 fallback 路由使用
    let target_origin = if let Ok(parsed) = Url::parse(decoded_url.as_ref()) {
        let host_with_port = match parsed.port() {
            Some(port) => format!("{}:{}", parsed.host_str().unwrap_or(""), port),
            None => parsed.host_str().unwrap_or("").to_string(),
        };
        format!("{}://{}", parsed.scheme(), host_with_port)
    } else {
        String::new()
    };

    info!(
        "[Distillery-Proxy] Proxying HTML: {} (origin: {})",
        decoded_url, target_origin
    );

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut request = client.get(decoded_url.as_ref());

    // 注入激活的 cookie，同时设置 active_target_origin
    {
        let mut state = DISTILLERY_PROXY_STATE.lock().await;
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

    // Cookie Jar: 自动累积响应中的 Set-Cookie 到 active_cookies
    let set_cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();
    if !set_cookies.is_empty() {
        let mut state = DISTILLERY_PROXY_STATE.lock().await;
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

    let bytes = response
        .bytes()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
    let mut html = String::from_utf8_lossy(&bytes).to_string();

    // 注入脚本和 base 标签
    // 使用 <base href="/"> 让所有相对路径资源和 API 请求都发到代理服务器，
    // 由 fallback 路由统一转发到目标服务器，彻底避免 CORS 问题
    let head_injections =
        r#"<base href="/"><script src="/__distillery/anti-detection.js"></script>"#;

    // bridge.js 和 sniffer.js 移到 body 末尾，避免干扰 head hydration
    let body_injections = r#"<script src="/__distillery/bridge.js" defer></script><script src="/__distillery/sniffer.js" defer></script>"#;

    // 健壮的注入逻辑：避免引入多余的换行符，防止 Text Node Hydration 失败
    if let Some(pos) = html.find("<head") {
        if let Some(end_pos) = html[pos..].find('>').map(|i| i + pos + 1) {
            html.insert_str(end_pos, head_injections);
        }
    }

    if let Some(pos) = html.rfind("</body>") {
        html.insert_str(pos, body_injections);
    } else {
        html.push_str(body_injections);
    }

    Ok((status, resp_headers, html))
}

/// 处理子资源代理请求 (CSS/JS/Images) — 显式代理模式
async fn handle_proxy_resource(
    Query(query): Query<ProxyQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let target_url = query.url;
    let decoded_url =
        urlencoding::decode(&target_url).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut request = client.get(decoded_url.as_ref());

    // 注入 cookie
    {
        let state = DISTILLERY_PROXY_STATE.lock().await;
        if let Some(ref cookies) = state.active_cookies {
            if !cookies.is_empty() {
                request = request.header("Cookie", cookies.as_str());
            }
        }
    }

    let response = request
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Request failed: {}", e)))?;

    // Cookie Jar: 子资源请求也可能返回 Set-Cookie（如跟踪 cookie）
    let set_cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();
    if !set_cookies.is_empty() {
        let mut state = DISTILLERY_PROXY_STATE.lock().await;
        state.active_cookies = merge_set_cookies(&state.active_cookies, &set_cookies);
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

    let bytes = response
        .bytes()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
    Ok((status, resp_headers, Body::from(bytes)))
}

/// Fallback 路由：将所有未匹配的请求透传到目标服务器（完整反向代理）
/// 这解决了 CORS 问题 — 页面内的 XHR/fetch 请求不再跨域
async fn handle_fallback(req: Request) -> Result<impl IntoResponse, (StatusCode, String)> {
    let (target_origin, cookies) = {
        let state = DISTILLERY_PROXY_STATE.lock().await;
        let origin = state.active_target_origin.clone();
        let cookies = state.active_cookies.clone();
        (origin, cookies)
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

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let reqwest_method =
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET);
    let mut request = client.request(reqwest_method, &target_url);

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

    // Cookie Jar: 自动累积响应中的 Set-Cookie 到 active_cookies
    let set_cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();
    if !set_cookies.is_empty() {
        let mut state = DISTILLERY_PROXY_STATE.lock().await;
        state.active_cookies = merge_set_cookies(&state.active_cookies, &set_cookies);
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

    let bytes = response
        .bytes()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

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
