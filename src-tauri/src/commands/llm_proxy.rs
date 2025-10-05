use anyhow::Result;
use axum::{
    body::Body,
    extract::Request,
    http::StatusCode,
    response::Response,
    routing::any,
    Router,
};
use http_body_util::BodyExt;
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Emitter, WebviewWindow};
use tokio::sync::Mutex;
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;

// 全局代理服务状态
pub static PROXY_STATE: Lazy<Arc<Mutex<ProxyServiceState>>> =
    Lazy::new(|| Arc::new(Mutex::new(ProxyServiceState::default())));

// 全局目标URL状态（支持运行时更新）
pub static TARGET_URL: Lazy<Arc<Mutex<String>>> =
    Lazy::new(|| Arc::new(Mutex::new(String::new())));

#[derive(Default)]
pub struct ProxyServiceState {
    is_running: bool,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    port: u16,
    target_url: String,
}

// 请求记录结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestRecord {
    pub id: String,
    pub timestamp: i64,
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub request_size: usize,
}

// 响应记录结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseRecord {
    pub id: String,
    pub timestamp: i64,
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub response_size: usize,
    pub duration_ms: u64,
}

// 代理配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub port: u16,
    pub target_url: String,
}

// 启动代理服务
#[tauri::command]
pub async fn start_llm_proxy(
    window: WebviewWindow,
    config: ProxyConfig,
) -> Result<String, String> {
    let mut state = PROXY_STATE.lock().await;
    
    if state.is_running {
        return Err("代理服务已在运行".to_string());
    }

    // 创建关闭信号通道
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    
    state.is_running = true;
    state.shutdown_tx = Some(shutdown_tx);
    state.port = config.port;
    state.target_url = config.target_url.clone();

    // 更新全局目标URL
    let mut global_target = TARGET_URL.lock().await;
    *global_target = config.target_url.clone();
    drop(global_target);

    let port = config.port;
    let window_clone = window.clone();

    // 启动代理服务
    tokio::spawn(async move {
        // 创建路由
        let app = Router::new()
            .fallback(any(move |req: Request| {
                let window = window_clone.clone();
                proxy_handler(req, window)
            }))
            .layer(
                ServiceBuilder::new()
                    .layer(CorsLayer::permissive())
                    .into_inner(),
            );

        // 创建监听器
        let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port))
            .await
            .expect("Failed to bind port");

        println!("LLM代理服务启动在: http://127.0.0.1:{}", port);

        // 使用hyper服务器运行
        let server = axum::serve(listener, app);
        
        // 等待关闭信号或服务结束
        tokio::select! {
            _ = server => {
                println!("服务器异常终止");
            }
            _ = shutdown_rx => {
                println!("收到关闭信号，正在停止代理服务...");
            }
        }
    });

    Ok(format!("代理服务已启动在端口 {}", port))
}

// 停止代理服务
#[tauri::command]
pub async fn stop_llm_proxy() -> Result<String, String> {
    let mut state = PROXY_STATE.lock().await;
    
    if !state.is_running {
        return Err("代理服务未运行".to_string());
    }

    if let Some(shutdown_tx) = state.shutdown_tx.take() {
        let _ = shutdown_tx.send(());
    }

    state.is_running = false;
    state.port = 0;
    state.target_url.clear();

    // 清空全局目标URL
    let mut global_target = TARGET_URL.lock().await;
    global_target.clear();

    Ok("代理服务已停止".to_string())
}

// 获取代理状态
#[tauri::command]
pub async fn get_proxy_status() -> Result<ProxyStatus, String> {
    let state = PROXY_STATE.lock().await;
    
    Ok(ProxyStatus {
        is_running: state.is_running,
        port: state.port,
        target_url: state.target_url.clone(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub is_running: bool,
    pub port: u16,
    pub target_url: String,
}

// 更新代理目标地址
#[tauri::command]
pub async fn update_proxy_target(target_url: String) -> Result<String, String> {
    let state = PROXY_STATE.lock().await;
    
    if !state.is_running {
        return Err("代理服务未运行".to_string());
    }
    
    // 更新状态中的目标URL
    drop(state);
    let mut state = PROXY_STATE.lock().await;
    state.target_url = target_url.clone();
    drop(state);
    
    // 更新全局目标URL
    let mut global_target = TARGET_URL.lock().await;
    *global_target = target_url.clone();
    
    Ok(format!("目标地址已更新为: {}", target_url))
}

// 代理处理函数
async fn proxy_handler(
    req: Request,
    window: WebviewWindow,
) -> Result<Response<Body>, StatusCode> {
    let start_time = std::time::Instant::now();
    let request_id = uuid::Uuid::new_v4().to_string();
    
    // 提取请求信息
    let method = req.method().clone();
    let uri = req.uri().clone();
    let headers = req.headers().clone();
    let version = req.version();
    
    // 从全局状态获取目标URL
    let target_base_url = TARGET_URL.lock().await.clone();
    
    // 构建目标URL
    let target_url = format!(
        "{}{}{}",
        target_base_url.trim_end_matches('/'),
        uri.path(),
        uri.query().map(|q| format!("?{}", q)).unwrap_or_default()
    );

    // 收集请求头
    let mut request_headers = HashMap::new();
    for (name, value) in headers.iter() {
        if let Ok(v) = value.to_str() {
            request_headers.insert(name.to_string(), v.to_string());
        }
    }

    // 读取请求体
    let (_parts, body) = req.into_parts();
    let body_bytes = body.collect().await.map_err(|_| StatusCode::BAD_REQUEST)?.to_bytes();
    let request_body = String::from_utf8_lossy(&body_bytes).to_string();
    let request_size = body_bytes.len();

    // 创建请求记录
    let request_record = RequestRecord {
        id: request_id.clone(),
        timestamp: chrono::Utc::now().timestamp_millis(),
        method: method.to_string(),
        url: target_url.clone(),
        headers: request_headers.clone(),
        body: if !request_body.is_empty() { Some(request_body.clone()) } else { None },
        request_size,
    };

    // 发送请求事件到前端
    let _ = window.emit("proxy-request", &request_record);

    // 构建转发请求
    let client = Client::builder(TokioExecutor::new())
        .build_http::<Body>();

    let mut forward_request = hyper::Request::builder()
        .method(method)
        .uri(&target_url)
        .version(version);

    // 复制请求头（跳过Host头）
    for (name, value) in headers.iter() {
        if name.as_str().to_lowercase() != "host" {
            forward_request = forward_request.header(name, value);
        }
    }

    // 设置请求体
    let forward_body = Body::from(body_bytes.clone());
    let forward_request = forward_request
        .body(forward_body)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    // 发送请求
    let response = match client.request(forward_request).await {
        Ok(res) => res,
        Err(e) => {
            eprintln!("代理请求失败: {}", e);
            
            // 发送错误响应事件
            let error_response = ResponseRecord {
                id: request_id,
                timestamp: chrono::Utc::now().timestamp_millis(),
                status: 502,
                headers: HashMap::new(),
                body: Some(format!("代理请求失败: {}", e)),
                response_size: 0,
                duration_ms: start_time.elapsed().as_millis() as u64,
            };
            
            let _ = window.emit("proxy-response", &error_response);
            
            return Err(StatusCode::BAD_GATEWAY);
        }
    };

    // 提取响应信息
    let status = response.status();
    let response_headers = response.headers().clone();
    
    // 收集响应头
    let mut headers_map = HashMap::new();
    for (name, value) in response_headers.iter() {
        if let Ok(v) = value.to_str() {
            headers_map.insert(name.to_string(), v.to_string());
        }
    }

    // 读取响应体
    let response_body_bytes = response
        .into_body()
        .collect()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?
        .to_bytes();
    
    let response_body = String::from_utf8_lossy(&response_body_bytes).to_string();
    let response_size = response_body_bytes.len();

    // 创建响应记录
    let response_record = ResponseRecord {
        id: request_id,
        timestamp: chrono::Utc::now().timestamp_millis(),
        status: status.as_u16(),
        headers: headers_map.clone(),
        body: if !response_body.is_empty() { Some(response_body.clone()) } else { None },
        response_size,
        duration_ms: start_time.elapsed().as_millis() as u64,
    };

    // 发送响应事件到前端
    let _ = window.emit("proxy-response", &response_record);

    // 构建返回给客户端的响应
    let mut final_response = Response::builder()
        .status(status);

    // 复制响应头
    for (name, value) in response_headers.iter() {
        final_response = final_response.header(name, value);
    }

    final_response
        .body(Body::from(response_body_bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}