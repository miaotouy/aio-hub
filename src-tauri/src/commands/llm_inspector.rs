use anyhow::Result;
use axum::{
    body::Body, extract::Request, http::StatusCode, response::Response, routing::any, Router,
};
use bytes::Bytes;
use futures_util::StreamExt;
use http_body_util::BodyExt;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Emitter, WebviewWindow};
use tokio::sync::Mutex;
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;

// 全局检查器服务状态
pub static INSPECTOR_STATE: Lazy<Arc<Mutex<InspectorServiceState>>> =
    Lazy::new(|| Arc::new(Mutex::new(InspectorServiceState::default())));

// 全局目标URL状态（支持运行时更新）
pub static INSPECTOR_TARGET_URL: Lazy<Arc<Mutex<String>>> =
    Lazy::new(|| Arc::new(Mutex::new(String::new())));

// 全局请求头覆盖规则
pub static INSPECTOR_HEADER_OVERRIDE_RULES: Lazy<Arc<Mutex<Vec<HeaderOverrideRule>>>> =
    Lazy::new(|| Arc::new(Mutex::new(Vec::new())));

#[derive(Default)]
pub struct InspectorServiceState {
    is_running: bool,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    port: u16,
    target_url: String,
    header_override_rules: Vec<HeaderOverrideRule>,
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

// 流式更新事件结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamUpdate {
    pub id: String,
    pub chunk: String,
    pub is_complete: bool,
}

// 请求头覆盖规则
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeaderOverrideRule {
    pub id: String,
    pub enabled: bool,
    pub key: String,
    pub value: String,
}

// 检查器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InspectorConfig {
    pub port: u16,
    pub target_url: String,
    #[serde(default)]
    pub header_override_rules: Vec<HeaderOverrideRule>,
}

// 启动检查器服务
#[tauri::command]
pub async fn start_llm_inspector(
    window: WebviewWindow,
    config: InspectorConfig,
) -> Result<String, String> {
    let mut state = INSPECTOR_STATE.lock().await;

    if state.is_running {
        return Err("代理服务已在运行".to_string());
    }

    // 创建关闭信号通道
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    state.is_running = true;
    state.shutdown_tx = Some(shutdown_tx);
    state.port = config.port;
    state.target_url = config.target_url.clone();
    state.header_override_rules = config.header_override_rules.clone();

    // 更新全局目标URL
    let mut global_target = INSPECTOR_TARGET_URL.lock().await;
    *global_target = config.target_url.clone();
    drop(global_target);

    // 更新全局请求头覆盖规则
    let mut global_rules = INSPECTOR_HEADER_OVERRIDE_RULES.lock().await;
    *global_rules = config.header_override_rules.clone();
    drop(global_rules);

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

        log::info!("LLM代理服务启动在: http://127.0.0.1:{}", port);

        // 使用hyper服务器运行
        let server = axum::serve(listener, app);

        // 等待关闭信号或服务结束
        tokio::select! {
            _ = server => {
                log::info!("服务器异常终止");
            }
            _ = shutdown_rx => {
                log::info!("收到关闭信号，正在停止代理服务...");
            }
        }
    });

    Ok(format!("代理服务已启动在端口 {}", port))
}

// 停止检查器服务
#[tauri::command]
pub async fn stop_llm_inspector() -> Result<String, String> {
    let mut state = INSPECTOR_STATE.lock().await;

    if !state.is_running {
        return Err("代理服务未运行".to_string());
    }

    if let Some(shutdown_tx) = state.shutdown_tx.take() {
        let _ = shutdown_tx.send(());
    }

    state.is_running = false;
    state.port = 0;
    state.target_url.clear();
    state.header_override_rules.clear();

    // 清空全局目标URL
    let mut global_target = INSPECTOR_TARGET_URL.lock().await;
    global_target.clear();

    // 清空全局请求头覆盖规则
    let mut global_rules = INSPECTOR_HEADER_OVERRIDE_RULES.lock().await;
    global_rules.clear();

    Ok("代理服务已停止".to_string())
}

// 获取检查器状态
#[tauri::command]
pub async fn get_inspector_status() -> Result<InspectorStatus, String> {
    let state = INSPECTOR_STATE.lock().await;

    Ok(InspectorStatus {
        is_running: state.is_running,
        port: state.port,
        target_url: state.target_url.clone(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InspectorStatus {
    pub is_running: bool,
    pub port: u16,
    pub target_url: String,
}

// 更新检查器目标地址
#[tauri::command]
pub async fn update_inspector_target(target_url: String) -> Result<String, String> {
    let state = INSPECTOR_STATE.lock().await;

    if !state.is_running {
        return Err("检查器服务未运行".to_string());
    }

    // 更新状态中的目标URL
    drop(state);
    let mut state = INSPECTOR_STATE.lock().await;
    state.target_url = target_url.clone();
    drop(state);

    // 更新全局目标URL
    let mut global_target = INSPECTOR_TARGET_URL.lock().await;
    *global_target = target_url.clone();

    Ok(format!("目标地址已更新为: {}", target_url))
}

// 代理处理函数
async fn proxy_handler(req: Request, window: WebviewWindow) -> Result<Response<Body>, StatusCode> {
    let start_time = std::time::Instant::now();
    let request_id = uuid::Uuid::new_v4().to_string();

    // 提取请求信息
    let method = req.method().clone();
    let uri = req.uri().clone();
    let headers = req.headers().clone();

    // 从全局状态获取目标URL
    let target_base_url = INSPECTOR_TARGET_URL.lock().await.clone();

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
    let body_bytes = body
        .collect()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
        .to_bytes();
    let request_body = String::from_utf8_lossy(&body_bytes).to_string();
    let request_size = body_bytes.len();

    // 创建请求记录
    let request_record = RequestRecord {
        id: request_id.clone(),
        timestamp: chrono::Utc::now().timestamp_millis(),
        method: method.to_string(),
        url: target_url.clone(),
        headers: request_headers.clone(),
        body: if !request_body.is_empty() {
            Some(request_body.clone())
        } else {
            None
        },
        request_size,
    };

    // 发送请求事件到前端
    let _ = window.emit("inspector-request", &request_record);

    // 使用 reqwest 客户端来支持 HTTPS
    // 对于SSE流，我们需要禁用超时和自动解压
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true) // 临时接受无效证书以进行测试
        .no_gzip() // 对于流式响应，禁用自动gzip解压
        .no_brotli() // 禁用自动brotli解压
        .no_deflate() // 禁用自动deflate解压
        .build()
        .map_err(|e| {
            log::error!("创建HTTP客户端失败: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // 构建 reqwest 请求
    let mut req_builder = match method.as_str() {
        "GET" => client.get(&target_url),
        "POST" => client.post(&target_url),
        "PUT" => client.put(&target_url),
        "DELETE" => client.delete(&target_url),
        "PATCH" => client.patch(&target_url),
        "HEAD" => client.head(&target_url),
        _ => {
            log::error!("不支持的HTTP方法: {}", method);
            return Err(StatusCode::METHOD_NOT_ALLOWED);
        }
    };

    // 获取请求头覆盖规则
    let override_rules = INSPECTOR_HEADER_OVERRIDE_RULES.lock().await.clone();

    // 收集需要覆盖的请求头键（转换为小写用于比较）
    let mut override_keys: std::collections::HashSet<String> = std::collections::HashSet::new();
    for rule in override_rules.iter() {
        if rule.enabled {
            override_keys.insert(rule.key.to_lowercase());
        }
    }

    // 复制请求头（排除被覆盖的）
    for (name, value) in headers.iter() {
        let name_str = name.as_str().to_lowercase();
        // 跳过可能导致问题的头，但保留accept-encoding以告诉服务器我们支持压缩
        if name_str != "host"
            && name_str != "content-length"
            && name_str != "connection"
            && !override_keys.contains(&name_str)
        {
            // 跳过要被覆盖的请求头
            if let Ok(v) = value.to_str() {
                // 不要传递accept-encoding，让reqwest自己处理
                if name_str != "accept-encoding" {
                    req_builder = req_builder.header(name.as_str(), v);
                }
            }
        }
    }

    // 应用请求头覆盖规则
    for rule in override_rules.iter() {
        if rule.enabled && !rule.key.is_empty() && !rule.value.is_empty() {
            log::info!("[代理] 应用请求头覆盖: {} = {}", rule.key, rule.value);
            req_builder = req_builder.header(&rule.key, &rule.value);
        }
    }

    // 设置请求体
    if !body_bytes.is_empty() {
        req_builder = req_builder.body(body_bytes.to_vec());
    }

    // 发送请求
    let response = match req_builder.send().await {
        Ok(res) => res,
        Err(e) => {
            log::error!("代理请求失败: {}", e);

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

            let _ = window.emit("inspector-response", &error_response);

            return Err(StatusCode::BAD_GATEWAY);
        }
    };

    // 提取响应信息
    let status = response.status();
    let response_headers = response.headers().clone();

    // 收集响应头
    let mut headers_map = HashMap::new();
    let mut is_streaming = false;

    for (name, value) in response_headers.iter() {
        if let Ok(v) = value.to_str() {
            let name_str = name.as_str().to_lowercase();
            headers_map.insert(name.to_string(), v.to_string());

            // 检查是否是流式响应
            if name_str == "content-type" && v.contains("text/event-stream") {
                is_streaming = true;
                log::info!("检测到SSE流式响应");
            }
        }
    }

    // 根据是否是流式响应选择不同的处理方式
    if is_streaming {
        // 处理流式响应
        log::info!("开始处理流式响应...");

        // 立即发送一个流开始事件，让前端知道流式响应已经开始
        let stream_start = StreamUpdate {
            id: request_id.clone(),
            chunk: String::new(),
            is_complete: false,
        };
        let _ = window.emit("inspector-stream-update", &stream_start);

        // 为流式响应创建一个流
        log::info!(
            "响应状态: {}, Content-Length: {:?}, Transfer-Encoding: {:?}",
            status,
            response_headers.get("content-length"),
            response_headers.get("transfer-encoding")
        );

        // 尝试使用不同的流处理方式
        // 对于 SSE，我们需要更直接的流处理
        let stream = response.bytes_stream();
        log::debug!("[代理] 成功创建字节流");

        // 创建两个独立的任务：一个用于代理转发，一个用于数据收集和分析
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();

        // 启动异步任务来收集和分析数据（不会影响代理转发）
        let window_for_analysis = window.clone();
        let request_id_for_analysis = request_id.clone();
        let headers_map_for_analysis = headers_map.clone();
        let start_time_for_analysis = start_time;

        tokio::spawn(async move {
            let mut accumulated_body = Vec::new();
            let mut chunk_count = 0;
            let mut parse_errors = 0;
            const MAX_ACCUMULATED_SIZE: usize = 10 * 1024 * 1024;
            let mut last_update_size = 0;
            const UPDATE_THRESHOLD: usize = 256; // 降低阈值到256字节，更频繁地更新

            // 持续接收数据块进行分析
            while let Some(chunk) = rx.recv().await {
                chunk_count += 1;
                let chunk_size = chunk.len();

                // 累积数据（带大小限制）
                accumulated_body.extend_from_slice(&chunk);
                if accumulated_body.len() > MAX_ACCUMULATED_SIZE {
                    let start = accumulated_body.len() - MAX_ACCUMULATED_SIZE;
                    accumulated_body.drain(..start);
                    log::warn!("[分析器] 累积数据超过10MB，已截断旧数据");
                }

                // 定期报告分析进度
                if chunk_count % 100 == 0 {
                    log::debug!(
                        "[分析器] 已分析 {} 个数据块，当前块: {} 字节，累积: {} 字节",
                        chunk_count,
                        chunk_size,
                        accumulated_body.len()
                    );
                }

                // 尝试解析当前累积的数据（不影响转发）
                if let Err(e) = std::str::from_utf8(&accumulated_body) {
                    parse_errors += 1;
                    if parse_errors == 1 || parse_errors % 10 == 0 {
                        log::warn!(
                            "[分析器] UTF-8解析错误 #{} (位置: {})",
                            parse_errors,
                            e.valid_up_to()
                        );
                    }
                }

                // 发送流式更新事件（当累积了足够的数据时，或者是第一个块）
                if accumulated_body.len() - last_update_size >= UPDATE_THRESHOLD || chunk_count == 1
                {
                    last_update_size = accumulated_body.len();

                    // 尝试将数据转换为字符串
                    let chunk_str = if let Ok(text) = String::from_utf8(chunk.clone()) {
                        text
                    } else {
                        String::from_utf8_lossy(&chunk).to_string()
                    };

                    let stream_update = StreamUpdate {
                        id: request_id_for_analysis.clone(),
                        chunk: chunk_str,
                        is_complete: false,
                    };

                    let _ = window_for_analysis.emit("inspector-stream-update", &stream_update);

                    // 在第一个块时额外打印日志
                    if chunk_count == 1 {
                        log::debug!(
                            "[分析器] 发送第一个流式更新事件，ID: {}",
                            request_id_for_analysis
                        );
                    }
                }
            }

            log::info!(
                "[分析器] 数据收集完成：{} 个块，{} 字节，{} 个解析错误",
                chunk_count,
                accumulated_body.len(),
                parse_errors
            );

            // 最终尝试构建响应记录
            let response_body = if accumulated_body.is_empty() {
                String::new()
            } else {
                match String::from_utf8(accumulated_body.clone()) {
                    Ok(text) => {
                        log::debug!("[分析器] 成功解析完整响应为UTF-8");
                        text
                    }
                    Err(e) => {
                        log::warn!("[分析器] 最终UTF-8解析失败，使用有损转换");
                        let valid_up_to = e.utf8_error().valid_up_to();
                        if valid_up_to > 0 {
                            // 尝试保留有效部分
                            let mut truncated = accumulated_body.clone();
                            truncated.truncate(valid_up_to);
                            if let Ok(text) = String::from_utf8(truncated) {
                                log::debug!("[分析器] 保留了前 {} 字节的有效数据", valid_up_to);
                                text
                            } else {
                                String::from_utf8_lossy(&accumulated_body).to_string()
                            }
                        } else {
                            String::from_utf8_lossy(&accumulated_body).to_string()
                        }
                    }
                }
            };

            // 发送最终的流完成事件
            let final_stream_update = StreamUpdate {
                id: request_id_for_analysis.clone(),
                chunk: String::new(),
                is_complete: true,
            };
            let _ = window_for_analysis.emit("inspector-stream-update", &final_stream_update);

            let response_record = ResponseRecord {
                id: request_id_for_analysis,
                timestamp: chrono::Utc::now().timestamp_millis(),
                status: status.as_u16(),
                headers: headers_map_for_analysis,
                body: if !response_body.is_empty() {
                    Some(response_body)
                } else {
                    None
                },
                response_size: accumulated_body.len(),
                duration_ms: start_time_for_analysis.elapsed().as_millis() as u64,
            };

            let _ = window_for_analysis.emit("inspector-response", &response_record);
        });

        // 使用futures stream转换为axum body - 纯转发，不关心内容
        let body_stream = async_stream::stream! {
            let mut stream = Box::pin(stream);
            let mut chunk_count = 0;
            let mut consecutive_errors = 0;

            log::info!("[代理] 开始转发流式响应...");

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(chunk) => {
                        chunk_count += 1;
                        consecutive_errors = 0; // 重置连续错误计数

                        // 发送副本给分析器（不阻塞）
                        let _ = tx.send(chunk.to_vec());

                        // 简单的进度日志
                        if chunk_count % 100 == 0 {
                            log::debug!("[代理] 已转发 {} 个数据块", chunk_count);
                        }

                        // 立即转发原始数据块给客户端，不做任何处理
                        yield Ok::<Bytes, std::io::Error>(chunk);
                    }
                    Err(e) => {
                        consecutive_errors += 1;
                        // 更详细的错误信息
                        log::error!("[代理] 读取源流错误 #{} (块 #{} 后): {:?}",
                            consecutive_errors, chunk_count, e);

                        // 检查错误类型
                        let error_str = format!("{:?}", e);
                        if error_str.contains("error decoding response body") {
                            log::warn!("[代理] 解码错误可能是由于分块传输编码问题");
                            // 对于解码错误，可能是流已经正常结束
                            if chunk_count > 0 {
                                log::info!("[代理] 已接收 {} 个块，可能是流正常结束", chunk_count);
                                break;
                            }
                        }

                        // 源流本身出错才停止
                        if consecutive_errors >= 5 {
                            log::error!("[代理] 源流连续错误过多，停止转发");
                            break;
                        }

                        // 短暂延迟后继续尝试
                        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
                    }
                }
            }

            log::info!("[代理] 流式转发完成，共转发 {} 个数据块", chunk_count);

            // 通知分析器流已结束（通过关闭channel）
            drop(tx);
        };

        // 构建流式响应
        let mut final_response = Response::builder().status(status.as_u16());

        // 复制响应头
        for (name, value) in response_headers.iter() {
            let name_str = name.as_str().to_lowercase();
            // 保留原始的transfer-encoding和content-type用于流式传输
            // 但不包括content-encoding，因为reqwest已经处理了
            if name_str != "content-encoding" {
                final_response = final_response.header(name.as_str(), value.as_bytes());
            }
        }

        // 使用流式body
        let body = Body::from_stream(body_stream);
        final_response
            .body(body)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    } else {
        // 非流式响应，一次性读取
        log::info!("处理非流式响应...");

        let response_body_bytes = response.bytes().await.map_err(|e| {
            log::error!("读取响应体失败: {}", e);
            StatusCode::BAD_GATEWAY
        })?;

        // 打印响应体的前几个字节用于调试
        if !response_body_bytes.is_empty() {
            let preview = &response_body_bytes[..std::cmp::min(20, response_body_bytes.len())];
            log::debug!("响应体前20字节: {:?}", preview);
        }

        // 尝试将响应体转换为字符串
        let response_body = match String::from_utf8(response_body_bytes.to_vec()) {
            Ok(text) => {
                log::debug!("成功将响应体转换为UTF-8字符串, 长度: {}", text.len());
                text
            }
            Err(e) => {
                log::warn!("无法将响应体转换为UTF-8: {}", e);
                // 检查是否是gzip压缩的数据（以1f 8b开头）
                if response_body_bytes.len() >= 2
                    && response_body_bytes[0] == 0x1f
                    && response_body_bytes[1] == 0x8b
                {
                    log::info!("检测到gzip压缩数据，尝试手动解压");
                    // 手动解压gzip
                    use flate2::read::GzDecoder;
                    use std::io::Read;

                    let mut decoder = GzDecoder::new(&response_body_bytes[..]);
                    let mut decompressed = Vec::new();
                    match decoder.read_to_end(&mut decompressed) {
                        Ok(_) => match String::from_utf8(decompressed) {
                            Ok(text) => {
                                log::info!("手动解压成功，得到UTF-8字符串");
                                text
                            }
                            Err(_) => {
                                log::warn!("解压后仍不是有效的UTF-8");
                                use base64::Engine;
                                format!(
                                    "[Binary data - base64 encoded]: {}",
                                    base64::engine::general_purpose::STANDARD
                                        .encode(&response_body_bytes)
                                )
                            }
                        },
                        Err(e) => {
                            log::error!("手动解压失败: {}", e);
                            use base64::Engine;
                            format!(
                                "[Binary data - base64 encoded]: {}",
                                base64::engine::general_purpose::STANDARD
                                    .encode(&response_body_bytes)
                            )
                        }
                    }
                } else {
                    // 不是gzip数据，使用base64编码
                    use base64::Engine;
                    format!(
                        "[Binary data - base64 encoded]: {}",
                        base64::engine::general_purpose::STANDARD.encode(&response_body_bytes)
                    )
                }
            }
        };
        let response_size = response_body_bytes.len();

        // 创建响应记录
        let response_record = ResponseRecord {
            id: request_id,
            timestamp: chrono::Utc::now().timestamp_millis(),
            status: status.as_u16(),
            headers: headers_map.clone(),
            body: if !response_body.is_empty() {
                Some(response_body.clone())
            } else {
                None
            },
            response_size,
            duration_ms: start_time.elapsed().as_millis() as u64,
        };

        // 发送响应事件到前端
        let _ = window.emit("inspector-response", &response_record);

        // 构建返回给客户端的响应
        let mut final_response = Response::builder().status(status.as_u16());

        // 复制响应头（但不包括content-encoding，因为我们已经解压了）
        for (name, value) in response_headers.iter() {
            let name_str = name.as_str().to_lowercase();
            if name_str != "content-encoding" && name_str != "transfer-encoding" {
                final_response = final_response.header(name.as_str(), value.as_bytes());
            }
        }

        // 返回解压后的响应体
        final_response
            .body(Body::from(response_body_bytes.to_vec()))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    }
}
