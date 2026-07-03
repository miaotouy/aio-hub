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

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::command;
use wreq::Client;
use wreq_util::Emulation;

/// 前端传来的浏览器指纹参数
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrowserFingerprint {
    pub user_agent: String,
    pub accept_language: String,
    pub platform: Option<String>,
    pub sec_ch_ua: Option<String>,
    pub sec_ch_ua_platform: Option<String>,
    pub sec_ch_ua_mobile: Option<String>,
}

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
    pub content_length: usize,
    pub is_challenge_page: bool,
}

#[command]
pub async fn distillery_quick_fetch(
    url: String,
    options: Option<QuickFetchOptions>,
    cookies: Option<String>,
    fingerprint: Option<BrowserFingerprint>,
) -> Result<RawFetchPayload, String> {
    log::info!("[Distillery] Quick Fetch with TLS impersonation: {}", url);

    let timeout_ms = options.as_ref().and_then(|o| o.timeout).unwrap_or(15000);

    // 使用 wreq 的 Chrome 指纹模拟（TLS + H2 + Header 顺序）
    let client = Client::builder()
        .emulation(Emulation::Chrome133)
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .build()
        .map_err(|e| format!("Failed to create impersonated client: {}", e))?;

    let mut request = client.get(&url);

    // 用前端传来的真实指纹覆盖默认值（确保 UA 和语言与用户真实环境一致）
    if let Some(ref fp) = fingerprint {
        request = request.header("User-Agent", &fp.user_agent);
        request = request.header("Accept-Language", &fp.accept_language);
        if let Some(ref ch_ua) = fp.sec_ch_ua {
            request = request.header("Sec-Ch-Ua", ch_ua.as_str());
        }
        if let Some(ref ch_platform) = fp.sec_ch_ua_platform {
            request = request.header("Sec-Ch-Ua-Platform", ch_platform.as_str());
        }
        if let Some(ref ch_mobile) = fp.sec_ch_ua_mobile {
            request = request.header("Sec-Ch-Ua-Mobile", ch_mobile.as_str());
        }
    }

    // 补全浏览器必备 Header
    request = request
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        )
        .header("Sec-Fetch-Dest", "document")
        .header("Sec-Fetch-Mode", "navigate")
        .header("Sec-Fetch-Site", "none")
        .header("Sec-Fetch-User", "?1")
        .header("Upgrade-Insecure-Requests", "1")
        .header("Cache-Control", "max-age=0");

    // 注入 Cookie
    if let Some(ref cookie_str) = cookies {
        if !cookie_str.is_empty() {
            request = request.header("Cookie", cookie_str.as_str());
        }
    }

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

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    // 智能编码检测（利用已有的 encoding_rs）
    let html = decode_html_bytes(&bytes, headers.get("content-type").map(|s| s.as_str()));

    // Challenge 页面检测
    let is_challenge = detect_challenge_page(&html, status.as_u16());

    if is_challenge {
        log::warn!(
            "[Distillery] Challenge page detected for {}, status={}",
            url,
            status.as_u16()
        );
    }

    Ok(RawFetchPayload {
        content_length: html.len(),
        is_challenge_page: is_challenge,
        html,
        url,
        status_code: status.as_u16(),
        response_headers: headers,
    })
}

/// 智能编码检测：根据 Content-Type 和 HTML meta 标签确定正确编码
fn decode_html_bytes(bytes: &[u8], content_type: Option<&str>) -> String {
    let charset =
        extract_charset_from_header(content_type).or_else(|| extract_charset_from_meta(bytes));

    match charset.as_deref() {
        Some("gbk") | Some("gb2312") | Some("gb18030") => {
            let (decoded, _, _) = encoding_rs::GBK.decode(bytes);
            decoded.into_owned()
        }
        Some("big5") => {
            let (decoded, _, _) = encoding_rs::BIG5.decode(bytes);
            decoded.into_owned()
        }
        Some("euc-jp") => {
            let (decoded, _, _) = encoding_rs::EUC_JP.decode(bytes);
            decoded.into_owned()
        }
        Some("shift_jis") | Some("shift-jis") | Some("sjis") => {
            let (decoded, _, _) = encoding_rs::SHIFT_JIS.decode(bytes);
            decoded.into_owned()
        }
        Some("euc-kr") => {
            let (decoded, _, _) = encoding_rs::EUC_KR.decode(bytes);
            decoded.into_owned()
        }
        _ => String::from_utf8_lossy(bytes).to_string(),
    }
}

/// 从 Content-Type header 中提取 charset
fn extract_charset_from_header(content_type: Option<&str>) -> Option<String> {
    content_type.and_then(|ct| {
        let lower = ct.to_lowercase();
        lower
            .split("charset=")
            .nth(1)
            .map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
    })
}

/// 从 HTML <meta> 标签中提取 charset（只扫描前 2KB）
fn extract_charset_from_meta(bytes: &[u8]) -> Option<String> {
    let preview_len = bytes.len().min(2048);
    let preview = String::from_utf8_lossy(&bytes[..preview_len]);
    let lower = preview.to_lowercase();

    // <meta charset="gbk">
    if let Some(pos) = lower.find("charset=") {
        let rest = &lower[pos + 8..];
        let charset: String = rest
            .chars()
            .skip_while(|c| *c == '"' || *c == '\'' || *c == ' ')
            .take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        if !charset.is_empty() {
            return Some(charset);
        }
    }

    // <meta http-equiv="Content-Type" content="text/html; charset=gbk">
    if let Some(pos) = lower.find("content-type") {
        let rest = &lower[pos..];
        if let Some(charset_pos) = rest.find("charset=") {
            let charset_rest = &rest[charset_pos + 8..];
            let charset: String = charset_rest
                .chars()
                .skip_while(|c| *c == '"' || *c == '\'' || *c == ' ')
                .take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
                .collect();
            if !charset.is_empty() {
                return Some(charset);
            }
        }
    }

    None
}

/// 检测是否为反爬 challenge 页面
fn detect_challenge_page(html: &str, status: u16) -> bool {
    // 状态码异常 + 内容短
    if (status == 403 || status == 429 || status == 503) && html.len() < 10000 {
        return true;
    }

    // Cloudflare challenge
    if html.contains("Just a moment")
        && (html.contains("cloudflare") || html.contains("cf-browser-verification"))
    {
        return true;
    }

    // Cloudflare Turnstile
    if html.contains("challenges.cloudflare.com") {
        return true;
    }

    // 通用验证码检测（短页面 + captcha 关键词）
    if html.len() < 5000
        && (html.contains("captcha") || html.contains("CAPTCHA") || html.contains("验证码"))
    {
        return true;
    }

    false
}
