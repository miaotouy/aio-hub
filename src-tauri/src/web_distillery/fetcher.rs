use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::command;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickFetchOptions {
    pub url: String,
    pub headers: Option<HashMap<String, String>>,
    pub cookie_profile: Option<String>,
    pub timeout: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawFetchPayload {
    pub url: String,
    pub html: String,
    pub status_code: u16,
    pub response_headers: HashMap<String, String>,
}

#[command]
pub async fn distillery_quick_fetch(
    url: String,
    options: Option<QuickFetchOptions>,
) -> Result<RawFetchPayload, String> {
    log::info!("[Distillery] Level 0 Quick Fetch: {}", url);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_millis(options.as_ref().and_then(|o| o.timeout).unwrap_or(15000)))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut request = client.get(&url);

    // 注入自定义请求头
    if let Some(opts) = options {
        if let Some(headers) = opts.headers {
            for (k, v) in headers {
                request = request.header(k, v);
            }
        }
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();
    let mut headers = HashMap::new();
    for (name, value) in response.headers().iter() {
        if let Ok(val_str) = value.to_str() {
            headers.insert(name.as_str().to_string(), val_str.to_string());
        }
    }

    // 处理转码 (UTF-8 / GBK)
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    // 这里简单处理，后续可以引入 encoding_rs
    let html = String::from_utf8_lossy(&bytes).to_string();

    Ok(RawFetchPayload {
        url,
        html,
        status_code: status.as_u16(),
        response_headers: headers,
    })
}
