use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, WebviewBuilder, WebviewUrl};

/// 网页蒸馏室子 Webview 管理器（记录活跃标签）
pub struct DistilleryWebviewManager {
    pub active_labels: Arc<Mutex<HashMap<String, String>>>,
}

impl DistilleryWebviewManager {
    pub fn new() -> Self {
        Self {
            active_labels: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

lazy_static::lazy_static! {
    static ref WEBVIEW_MANAGER: DistilleryWebviewManager = DistilleryWebviewManager::new();
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWebviewOptions {
    pub url: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    // pub headless: Option<bool>,
}

/// 创建子 Webview
#[tauri::command]
pub async fn distillery_create_webview(
    app: AppHandle,
    options: CreateWebviewOptions,
) -> Result<(), String> {
    let label = "web-distillery-sub";

    // 1. 先销毁已有的
    let _ = distillery_destroy_webview(app.clone()).await;

    log::info!(
        "[Distillery] Creating sub-webview: {} at ({}, {}) {}x{}",
        options.url,
        options.x,
        options.y,
        options.width,
        options.height
    );

    // 2. 加载注入脚本
    let bridge_inject = include_str!("inject/bridge.js");
    let sniffer_inject = include_str!("inject/api-sniffer.js");
    let nonce = nanoid::nanoid!();
    let final_inject = format!(
        "{}\n{}",
        bridge_inject.replace("__NONCE_PLACEHOLDER__", &nonce),
        sniffer_inject
    );

    // 3. 通过 get_webview("main") 获取主 webview，然后通过其 .window() 得到 Window<R>
    //    再在 Window 上调用 add_child（需要 unstable feature）
    let main_webview = app.get_webview("main").ok_or("Cannot find main webview")?;

    let main_window = main_webview.window();

    let url = WebviewUrl::External(
        options
            .url
            .parse()
            .map_err(|e| format!("Invalid URL: {}", e))?,
    );

    let builder = WebviewBuilder::new(label, url)
        .initialization_script(&final_inject)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    // add_child 在 unstable feature 下可用
    let _webview = main_window
        .add_child(
            builder,
            tauri::LogicalPosition::new(options.x, options.y),
            tauri::LogicalSize::new(options.width, options.height),
        )
        .map_err(|e| format!("Failed to create child webview: {}", e))?;

    // 4. 记录状态
    {
        let mut manager = WEBVIEW_MANAGER.active_labels.lock().unwrap();
        manager.insert(label.to_string(), nonce);
    }

    Ok(())
}

/// 导航子 Webview
#[tauri::command]
pub async fn distillery_navigate(app: AppHandle, url: String) -> Result<(), String> {
    let label = "web-distillery-sub";
    if let Some(webview) = app.get_webview(label) {
        webview
            .navigate(url.parse().map_err(|e| format!("Invalid URL: {}", e))?)
            .map_err(|e| format!("Navigation failed: {}", e))?;
        Ok(())
    } else {
        Err("Sub-webview not found".into())
    }
}

/// 销毁子 Webview（导航至 about:blank 停止活动）
#[tauri::command]
pub async fn distillery_destroy_webview(app: AppHandle) -> Result<(), String> {
    let label = "web-distillery-sub";

    {
        let mut manager = WEBVIEW_MANAGER.active_labels.lock().unwrap();
        manager.remove(label);
    }

    if let Some(webview) = app.get_webview(label) {
        let _ = webview.eval("window.location.href = 'about:blank'");
        log::info!("[Distillery] Sub-webview navigated to blank");
    }

    Ok(())
}

/// 移动 / 调整大小
#[tauri::command]
pub async fn distillery_resize(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let label = "web-distillery-sub";
    if let Some(webview) = app.get_webview(label) {
        webview
            .set_position(tauri::LogicalPosition::new(x, y))
            .map_err(|e| format!("Reposition failed: {}", e))?;
        webview
            .set_size(tauri::LogicalSize::new(width, height))
            .map_err(|e| format!("Resize failed: {}", e))?;
        Ok(())
    } else {
        Err("Sub-webview not found".into())
    }
}

/// 在子 Webview 中执行 JS 脚本
#[tauri::command]
pub async fn distillery_eval(app: AppHandle, script: String) -> Result<(), String> {
    let label = "web-distillery-sub";
    if let Some(webview) = app.get_webview(label) {
        webview
            .eval(&script)
            .map_err(|e| format!("Eval failed: {}", e))?;
        Ok(())
    } else {
        Err("Sub-webview not found".into())
    }
}

/// P2：等待页面就绪后触发 DOM 提取
/// 提取结果通过 bridge.js 中的 send 函数作为 Tauri 事件回传主前端
#[tauri::command]
pub async fn distillery_extract_dom(
    app: AppHandle,
    wait_for: Option<String>,
    wait_timeout_ms: Option<u64>,
) -> Result<String, String> {
    let label = "web-distillery-sub";
    let timeout_ms = wait_timeout_ms.unwrap_or(10000);

    let webview = app
        .get_webview(label)
        .ok_or_else(|| "Sub-webview not found".to_string())?;

    // 等待页面就绪
    let wait_ms = if wait_for.is_some() {
        std::cmp::min(timeout_ms, 5000)
    } else {
        500
    };
    tokio::time::sleep(std::time::Duration::from_millis(wait_ms)).await;

    let selector_check = if let Some(sel) = &wait_for {
        format!(
            "const _el = document.querySelector({}); if (!_el) {{ console.warn('[Distillery] Selector not found:', {}); }}",
            serde_json::to_string(sel).unwrap(),
            serde_json::to_string(sel).unwrap()
        )
    } else {
        String::new()
    };

    let extract_script = format!(
        r#"
        (function() {{
            {}
            try {{
                const html = document.documentElement.outerHTML;
                if (window.__DISTILLERY_BRIDGE__) {{
                    window.__DISTILLERY_BRIDGE__.send({{
                        type: 'dom-extracted',
                        html: html,
                        url: window.location.href,
                        title: document.title
                    }});
                }}
            }} catch(e) {{
                if (window.__DISTILLERY_BRIDGE__) {{
                    window.__DISTILLERY_BRIDGE__.send({{
                        type: 'dom-extract-error',
                        error: e.message
                    }});
                }}
            }}
        }})();
        "#,
        selector_check
    );

    webview
        .eval(&extract_script)
        .map_err(|e| format!("Eval DOM extraction script failed: {}", e))?;

    Ok("extraction-triggered".to_string())
}

/// 获取子 Webview 的 Cookie（当前通过 eval document.cookie 实现 V1）
#[tauri::command]
pub async fn distillery_get_cookies(app: AppHandle) -> Result<String, String> {
    let label = "web-distillery-sub";
    let webview = app
        .get_webview(label)
        .ok_or_else(|| "Sub-webview not found".to_string())?;

    // 注意：eval 无法直接返回结果到 Rust，这里我们通过 bridge 回传事件，或者直接 eval 返回
    // 在 Tauri v2 中，webview.eval 只是触发执行。
    // 为了简单且符合当前架构，我们让前端通过 eval 获取结果，或者这里我们用 eval 发送事件。
    let script = r#"
        (function() {
            if (window.__DISTILLERY_BRIDGE__) {
                window.__DISTILLERY_BRIDGE__.send('cookies-extracted', {
                    cookies: document.cookie,
                    url: window.location.href
                });
            }
        })();
    "#;

    webview
        .eval(script)
        .map_err(|e| format!("Eval get_cookies failed: {}", e))?;

    Ok("cookies-extraction-triggered".to_string())
}

/// 设置子 Webview 的 Cookie
#[tauri::command]
pub async fn distillery_set_cookie(app: AppHandle, cookie_str: String) -> Result<(), String> {
    let label = "web-distillery-sub";
    let webview = app
        .get_webview(label)
        .ok_or_else(|| "Sub-webview not found".to_string())?;

    let script = format!(
        "document.cookie = {};",
        serde_json::to_string(&cookie_str).unwrap()
    );

    webview
        .eval(&script)
        .map_err(|e| format!("Eval set_cookie failed: {}", e))?;

    Ok(())
}
