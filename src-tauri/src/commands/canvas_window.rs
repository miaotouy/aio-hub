use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use std::time::Duration;
use tokio::time::sleep;

/// 画布窗口信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasWindowInfo {
    pub label: String,
    pub canvas_id: String,
    pub title: String,
}

/// 画布窗口注册表（独立于 FINALIZED_DETACHED_WINDOWS）
static CANVAS_WINDOWS: once_cell::sync::Lazy<Arc<Mutex<HashMap<String, CanvasWindowInfo>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// 画布窗口标签前缀
const CANVAS_WINDOW_PREFIX: &str = "canvas-win-";

/// 判断一个窗口标签是否属于画布窗口
pub fn is_canvas_window(label: &str) -> bool {
    label.starts_with(CANVAS_WINDOW_PREFIX)
}

/// 创建画布预览窗口
#[tauri::command]
pub async fn create_canvas_window(
    app: AppHandle,
    canvas_id: String,
    title: String,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<String, String> {
    let label = format!("{}{}", CANVAS_WINDOW_PREFIX, canvas_id);
    let width = width.unwrap_or(1200.0);
    let height = height.unwrap_or(800.0);

    // 已存在则聚焦并返回
    if let Some(existing) = app.get_webview_window(&label) {
        existing.set_focus().map_err(|e| e.to_string())?;
        existing.show().map_err(|e| e.to_string())?;
        existing.unminimize().map_err(|e| e.to_string())?;
        return Ok(label);
    }

    // 创建窗口路由
    let url = format!("/canvas-window/{}", canvas_id);
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(&title)
        .inner_size(width, height)
        .min_inner_size(400.0, 300.0)
        .decorations(false)
        .visible(false);

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent);
    }

    #[cfg(target_os = "windows")]
    {
        builder = builder.transparent(true);
    }

    let window = builder.build().map_err(|e| e.to_string())?;

    // 应用保存的窗口配置（复用 window_config 模块）
    let window_clone = window.clone();
    let apply_result = crate::commands::window_config::apply_window_config(window_clone).await;
    if let Err(e) = apply_result {
        log::warn!("[CANVAS_WINDOW] 应用窗口配置失败（可能是首次打开）: {}", e);
    }

    // 注册到画布窗口表
    let info = CanvasWindowInfo {
        label: label.clone(),
        canvas_id: canvas_id.clone(),
        title,
    };
    {
        let mut windows = CANVAS_WINDOWS.lock().unwrap();
        windows.insert(label.clone(), info.clone());
    }

    // 发送画布专用事件
    app.emit("canvas-window-opened", &info)
        .map_err(|e| e.to_string())?;

    // 稍微延迟显示，给前端一点渲染时间
    sleep(Duration::from_millis(150)).await;
    window.show().map_err(|e| e.to_string())?;

    log::info!("[CANVAS_WINDOW] 已创建画布窗口: label={}, canvasId={}", label, canvas_id);
    Ok(label)
}

/// 关闭指定画布窗口
#[tauri::command]
pub async fn close_canvas_window(app: AppHandle, canvas_id: String) -> Result<(), String> {
    let label = format!("{}{}", CANVAS_WINDOW_PREFIX, canvas_id);

    // 注意：真正的清理逻辑在 handle_canvas_window_close 中，由 lib.rs 触发
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// 关闭所有画布窗口
#[tauri::command]
pub async fn close_all_canvas_windows(app: AppHandle) -> Result<u32, String> {
    let labels: Vec<String> = {
        let windows = CANVAS_WINDOWS.lock().unwrap();
        windows.keys().cloned().collect()
    };

    let count = labels.len() as u32;
    for label in labels {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }

    log::info!("[CANVAS_WINDOW] 已请求关闭所有画布窗口 ({}个)", count);
    Ok(count)
}

/// 获取所有打开的画布窗口
#[tauri::command]
pub async fn get_canvas_windows(_app: AppHandle) -> Result<Vec<CanvasWindowInfo>, String> {
    let windows = CANVAS_WINDOWS.lock().unwrap();
    Ok(windows.values().cloned().collect())
}

/// 画布窗口关闭时的清理逻辑（由 lib.rs on_window_event 调用）
pub fn handle_canvas_window_close(app: &AppHandle, label: &str) {
    let info = {
        let mut windows = CANVAS_WINDOWS.lock().unwrap();
        windows.remove(label)
    };

    if let Some(info) = info {
        let _ = app.emit("canvas-window-closed", &info);
        log::info!("[CANVAS_WINDOW] 画布窗口已关闭: label={}, canvasId={}", label, info.canvas_id);
    }
}