use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{ipc::Channel, AppHandle};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use futures_util::StreamExt;
use base64::{Engine as _, engine::general_purpose::STANDARD};

#[derive(Debug, Deserialize)]
pub struct ProxyRequest {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: serde_json::Value,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", content = "data")]
pub enum ProxyResponseEvent {
    #[serde(rename = "chunk")]
    Chunk(String),
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
            if s.starts_with("local-file://") {
                let path_str = &s["local-file://".len()..];
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
    let client = reqwest::Client::new();
    
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

    let req_builder = match request.method.to_uppercase().as_str() {
        "POST" => client.post(&request.url),
        "GET" => client.get(&request.url),
        _ => return Err(format!("Unsupported method: {}", request.method)),
    };

    let response = req_builder
        .headers(headers)
        .json(&body_json)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let mut stream = response.bytes_stream();

    while let Some(item) = stream.next().await {
        match item {
            Ok(bytes) => {
                let chunk = String::from_utf8_lossy(&bytes).to_string();
                let _ = on_event.send(ProxyResponseEvent::Chunk(chunk));
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