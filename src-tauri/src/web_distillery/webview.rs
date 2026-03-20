use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

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
    pub headless: Option<bool>,
}

/// 创建子 Webview (独立窗口模式以修复主窗口拖拽失效问题)
#[tauri::command]
pub async fn distillery_create_webview(
    app: AppHandle,
    options: CreateWebviewOptions,
) -> Result<(), String> {
    let label = "web-distillery-sub";

    // 1. 先销毁已有的
    let _ = distillery_destroy_webview(app.clone()).await;

    log::info!(
        "[Distillery] Creating sub-window: {} at ({}, {}) {}x{}",
        options.url,
        options.x,
        options.y,
        options.width,
        options.height
    );

    // 2. 加载注入脚本（顺序很重要：反检测 -> 桥接 -> 嗅探）
    let anti_detection_inject = include_str!("inject/anti-detection.js");
    let bridge_inject = include_str!("inject/bridge.js");
    let sniffer_inject = include_str!("inject/api-sniffer.js");
    let nonce = nanoid::nanoid!();
    let final_inject = format!(
        "{}\n{}\n{}",
        anti_detection_inject,
        bridge_inject.replace("__NONCE_PLACEHOLDER__", &nonce),
        sniffer_inject
    );

    // 3. 解析 URL
    let url = WebviewUrl::External(
        options
            .url
            .parse()
            .map_err(|e| format!("Invalid URL: {}", e))?,
    );

    // 4. 使用 WebviewWindowBuilder 创建独立窗口 (Tauri v2)
    let mut builder = WebviewWindowBuilder::new(&app, label, url)
        .initialization_script(&final_inject)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .on_navigation(|url| {
            log::debug!("[Distillery] Navigating to: {}", url);
            true
        })
        .decorations(false)
        .shadow(false)
        .skip_taskbar(true)
        .visible(false);

    // P1: 禁用媒体自动播放 (Windows WebView2)
    builder =
        builder.additional_browser_args("--autoplay-policy=user-gesture-required --mute-audio");

    let is_headless = options.headless.unwrap_or(false);

    #[cfg(target_os = "windows")]
    {
        builder = builder.transparent(true);
    }

    if !is_headless {
        builder = builder.always_on_top(true);
    }

    // 5. 构建窗口
    let window = builder
        .build()
        .map_err(|e| format!("Failed to build sub-window: {}", e))?;

    // P2: 移除所有不稳定的底层拦截逻辑
    // 我们将通过 window.opener.postMessage 在前端层面进行跨窗口通信

    // 设置位置和大小
    window
        .set_position(tauri::LogicalPosition::new(options.x, options.y))
        .map_err(|e| format!("Failed to set position: {}", e))?;
    window
        .set_size(tauri::LogicalSize::new(options.width, options.height))
        .map_err(|e| format!("Failed to set size: {}", e))?;

    // 6. 记录状态
    {
        let mut manager = WEBVIEW_MANAGER.active_labels.lock().unwrap();
        manager.insert(label.to_string(), nonce);
    }

    // 7. 处理显示逻辑 (仅在非无头模式下显示)
    if !is_headless {
        // 延迟显示以防视觉闪烁
        let window_clone = window.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
            let _ = window_clone.show();
        });
    }

    Ok(())
}

/// 导航子 Webview
#[tauri::command]
pub async fn distillery_navigate(app: AppHandle, url: String) -> Result<(), String> {
    let label = "web-distillery-sub";
    if let Some(window) = app.get_webview_window(label) {
        window
            .navigate(url.parse().map_err(|e| format!("Invalid URL: {}", e))?)
            .map_err(|e| format!("Navigation failed: {}", e))?;
        Ok(())
    } else {
        Err("Sub-window not found".into())
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

    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
        log::info!("[Distillery] Sub-window closed");
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
    if let Some(window) = app.get_webview_window(label) {
        window
            .set_position(tauri::LogicalPosition::new(x, y))
            .map_err(|e| format!("Reposition failed: {}", e))?;
        window
            .set_size(tauri::LogicalSize::new(width, height))
            .map_err(|e| format!("Resize failed: {}", e))?;
        Ok(())
    } else {
        Err("Sub-window not found".into())
    }
}

/// 在子 Webview 中执行 JS 脚本
#[tauri::command]
pub async fn distillery_eval(app: AppHandle, script: String) -> Result<(), String> {
    let label = "web-distillery-sub";
    if let Some(window) = app.get_webview_window(label) {
        window
            .eval(&script)
            .map_err(|e| format!("Eval failed: {}", e))?;
        Ok(())
    } else {
        Err("Sub-window not found".into())
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

    let window = app
        .get_webview_window(label)
        .ok_or_else(|| "Sub-window not found".to_string())?;

    // P2: 基础等待 300ms 确保基础 JS 和 Bridge 环境初始化
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    let selector_json = if let Some(sel) = &wait_for {
        serde_json::to_string(sel).unwrap()
    } else {
        "null".to_string()
    };

    let extract_script = format!(
        r#"
        (function() {{
            const selector = {};
            const startTime = Date.now();
            const timeout = {};
            console.log('[Distillery] Extraction script started. Waiting for:', selector || 'body content');

            function tryExtract() {{
                const isReady = document.readyState === 'complete' || document.readyState === 'interactive';
                const elementFound = !selector || !!document.querySelector(selector);
                const hasBodyContent = document.body && document.body.innerText.length > 500;
                const wechatContentReady = !selector && !!document.getElementById('js_content');

                if ((isReady && elementFound) || wechatContentReady || hasBodyContent) {{
                    console.log('[Distillery] extraction conditions met', {{ isReady, elementFound, wechatContentReady, hasBodyContent }});
                    performExtraction();
                }} else if (Date.now() - startTime < timeout) {{
                    if (Math.random() < 0.1) {{ // 降低日志频率
                        console.log('[Distillery] still waiting...', {{ elapsed: Date.now() - startTime }});
                    }}
                    setTimeout(tryExtract, 250);
                }} else {{
                    console.warn('[Distillery] Extraction timeout, proceeding anyway', {{ elapsed: Date.now() - startTime }});
                    performExtraction();
                }}
            }}

            function performExtraction() {{
                try {{
                    console.log('[Distillery] starting performExtraction');
                    const html = document.documentElement.outerHTML;
                    const payload = {{
                        type: 'dom-extracted',
                        html: html,
                        url: window.location.href,
                        title: document.title
                    }};
                    
                    if (window.__DISTILLERY_BRIDGE__ && typeof window.__DISTILLERY_BRIDGE__.send === 'function') {{
                        console.log('[Distillery] Sending extracted DOM via bridge');
                        window.__DISTILLERY_BRIDGE__.send(payload);
                    }} else {{
                        console.error('[Distillery] Bridge not found during extraction! Attempting raw fallback.');
                        // 最后的兜底方案
                        const nativePost = window.ipc?.postMessage 
                            || window.chrome?.webview?.postMessage 
                            || (window.webkit?.messageHandlers?.ipc?.postMessage.bind(window.webkit.messageHandlers.ipc));
                        
                        if (nativePost) {{
                            nativePost(JSON.stringify(payload));
                        }}
                    }}
                }} catch(e) {{
                    console.error('[Distillery] Extraction failed:', e);
                    const errPayload = {{ type: 'dom-extract-error', error: e.message }};
                    if (window.__DISTILLERY_BRIDGE__) {{
                        window.__DISTILLERY_BRIDGE__.send(errPayload);
                    }}
                }}
            }}

            tryExtract();
        }})();
        "#,
        selector_json, timeout_ms
    );

    log::info!(
        "[Distillery] Triggering DOM extraction. Selector: {:?}, Timeout: {}ms",
        wait_for,
        timeout_ms
    );

    window
        .eval(&extract_script)
        .map_err(|e| format!("Eval DOM extraction script failed: {}", e))?;

    Ok("extraction-triggered".to_string())
}

/// 获取子 Webview 的 Cookie（当前通过 eval document.cookie 实现 V1）
#[tauri::command]
pub async fn distillery_get_cookies(app: AppHandle) -> Result<String, String> {
    let label = "web-distillery-sub";
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| "Sub-window not found".to_string())?;

    let script = r#"
        (function() {
            if (window.__DISTILLERY_BRIDGE__) {
                window.__DISTILLERY_BRIDGE__.send({
                    type: 'cookies-extracted',
                    cookies: document.cookie,
                    url: window.location.href
                });
            }
        })();
    "#;

    window
        .eval(script)
        .map_err(|e| format!("Eval get_cookies failed: {}", e))?;

    Ok("cookies-extraction-triggered".to_string())
}

/// 设置子 Webview 的 Cookie
#[tauri::command]
pub async fn distillery_set_cookie(app: AppHandle, cookie_str: String) -> Result<(), String> {
    let label = "web-distillery-sub";
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| "Sub-window not found".to_string())?;

    let script = format!(
        "document.cookie = {};",
        serde_json::to_string(&cookie_str).unwrap()
    );

    window
        .eval(&script)
        .map_err(|e| format!("Eval set_cookie failed: {}", e))?;

    Ok(())
}

/// 转发来自子窗口的消息到主窗口的事件总线
#[tauri::command]
pub fn distillery_forward_message(
    app: AppHandle,
    payload: serde_json::Value,
) -> Result<(), String> {
    let msg_type = payload["type"].as_str().unwrap_or("unknown");
    log::info!("[Distillery] Received IPC message: {}", msg_type);

    // 调试：打印完整 payload 以便排查
    if msg_type == "unknown" {
        log::debug!("[Distillery] Full payload: {}", payload);
    }

    app.emit("distillery-message", payload.to_string())
        .map_err(|e| format!("Emit failed: {}", e))
}
