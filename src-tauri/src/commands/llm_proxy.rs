use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{ipc::Channel, AppHandle};

#[derive(Debug, Deserialize)]
pub struct ProxyRequest {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: serde_json::Value,
    pub timeout: Option<u64>, // 超时时间（毫秒）
}

#[derive(Debug, Serialize, Clone)]
pub struct ProxyResponseStart {
    pub status: u16,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", content = "data")]
pub enum ProxyResponseEvent {
    #[serde(rename = "start")]
    Start(ProxyResponseStart),
    #[serde(rename = "chunk")]
    Chunk(String),
    #[serde(rename = "binary")]
    Binary(Vec<u8>),
    #[serde(rename = "error")]
    Error(String),
    #[serde(rename = "done")]
    Done,
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

                let bytes = std::fs::read(decoded_path.as_ref())
                    .map_err(|e| format!("Failed to read local file {}: {}", decoded_path, e))?;

                let b64 = STANDARD.encode(bytes);
                *value = serde_json::Value::String(b64);
            }
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
pub async fn proxy_llm_request(
    _app: AppHandle,
    request: ProxyRequest,
    on_event: Channel<ProxyResponseEvent>,
) -> Result<(), String> {
    // 优化：配置超时和连接池
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .tcp_keepalive(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let mut headers = HeaderMap::new();
    for (k, v) in request.headers {
        let name = HeaderName::from_bytes(k.as_bytes())
            .map_err(|_| format!("Invalid header name: {}", k))?;
        let value = HeaderValue::from_str(&v)
            .map_err(|_| format!("Invalid header value for {}: {}", k, v))?;
        headers.insert(name, value);
    }

    let mut body_json = request.body;
    // 在 Rust 侧处理本地文件读取，避免 JS 侧传输巨型 Base64
    if let Err(e) = process_body_recursive(&mut body_json) {
        let _ = on_event.send(ProxyResponseEvent::Error(e.clone()));
        return Err(e);
    }

    let mut req_builder = match request.method.to_uppercase().as_str() {
        "POST" => client.post(&request.url),
        "GET" => client.get(&request.url),
        _ => return Err(format!("Unsupported method: {}", request.method)),
    };

    // 应用前端传入的超时时间
    if let Some(timeout_ms) = request.timeout {
        req_builder = req_builder.timeout(std::time::Duration::from_millis(timeout_ms));
    }

    let response = req_builder
        .headers(headers)
        .json(&body_json)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    // 发送起始事件，包含状态码和响应头
    let mut resp_headers = HashMap::new();
    for (name, value) in response.headers().iter() {
        if let Ok(v) = value.to_str() {
            resp_headers.insert(name.to_string(), v.to_string());
        }
    }

    let _ = on_event.send(ProxyResponseEvent::Start(ProxyResponseStart {
        status: response.status().as_u16(),
        headers: resp_headers,
    }));

    let mut stream = response.bytes_stream();

    while let Some(item) = stream.next().await {
        match item {
            Ok(bytes) => {
                // 尝试作为文本发送，如果失败则作为二进制发送
                match String::from_utf8(bytes.to_vec()) {
                    Ok(s) => {
                        let _ = on_event.send(ProxyResponseEvent::Chunk(s));
                    }
                    Err(_) => {
                        let _ = on_event.send(ProxyResponseEvent::Binary(bytes.to_vec()));
                    }
                }
            }
            Err(e) => {
                let _ = on_event.send(ProxyResponseEvent::Error(format!("Stream error: {}", e)));
                return Err(format!("Stream error: {}", e));
            }
        }
    }

    let _ = on_event.send(ProxyResponseEvent::Done);
    Ok(())
}
