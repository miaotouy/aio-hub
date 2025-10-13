use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};
use serde::{Deserialize, Serialize};

/// 窗口创建配置
#[derive(Debug, Deserialize)]
pub struct WindowConfig {
    /// 窗口标签（唯一标识符）
    pub label: String,
    /// 窗口标题
    pub title: String,
    /// 窗口 URL（相对路径，如 /json-formatter?detached=true）
    pub url: String,
    /// 窗口宽度
    #[serde(default = "default_width")]
    pub width: f64,
    /// 窗口高度
    #[serde(default = "default_height")]
    pub height: f64,
}

fn default_width() -> f64 { 900.0 }
fn default_height() -> f64 { 700.0 }

/// 窗口位置信息
#[derive(Debug, Serialize)]
pub struct WindowPosition {
    pub x: i32,
    pub y: i32,
}

/// 创建工具窗口
#[tauri::command]
pub async fn create_tool_window(
    app: AppHandle,
    config: WindowConfig,
) -> Result<String, String> {
    // 检查窗口是否已存在
    if let Some(existing_window) = app.get_webview_window(&config.label) {
        // 如果已存在，直接聚焦
        existing_window.set_focus().map_err(|e| e.to_string())?;
        existing_window.show().map_err(|e| e.to_string())?;
        return Ok(format!("Window '{}' already exists and has been focused", config.label));
    }

    // 构建完整的 URL
    let window_url = format!("http://localhost:1420{}", config.url);
    
    // 创建新窗口
    let window = WebviewWindowBuilder::new(
        &app,
        &config.label,
        WebviewUrl::External(window_url.parse().map_err(|e: url::ParseError| e.to_string())?),
    )
    .title(&config.title)
    .inner_size(config.width, config.height)
    .min_inner_size(400.0, 300.0)
    .decorations(false)  // 无边框，与主窗口保持一致
    .transparent(true)   // 透明背景
    .center()           // 居中显示
    .build()
    .map_err(|e| e.to_string())?;

    // 确保窗口显示在任务栏
    window.set_skip_taskbar(false).map_err(|e| e.to_string())?;

    // 发送全局事件通知所有窗口
    app.emit("tool-detached", config.label.clone())
        .map_err(|e| e.to_string())?;

    Ok(format!("Window '{}' created successfully", config.label))
}

/// 聚焦指定窗口
#[tauri::command]
pub async fn focus_window(
    app: AppHandle,
    label: String,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

/// 获取窗口位置
#[tauri::command]
pub async fn get_window_position(
    app: AppHandle,
    label: String,
) -> Result<WindowPosition, String> {
    if let Some(window) = app.get_webview_window(&label) {
        let position = window.outer_position().map_err(|e| e.to_string())?;
        Ok(WindowPosition {
            x: position.x,
            y: position.y,
        })
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

/// 设置窗口位置
#[tauri::command]
pub async fn set_window_position(
    app: AppHandle,
    label: String,
    x: i32,
    y: i32,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.set_position(PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

/// 检查窗口位置是否在屏幕内，如果不在则拉回
#[tauri::command]
pub async fn ensure_window_visible(
    app: AppHandle,
    label: String,
) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window(&label) {
        let position = window.outer_position().map_err(|e| e.to_string())?;
        let size = window.outer_size().map_err(|e| e.to_string())?;
        
        // 获取当前显示器信息
        if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
            let monitor_size = monitor.size();
            let monitor_position = monitor.position();
            
            let mut needs_adjustment = false;
            let mut new_x = position.x;
            let mut new_y = position.y;
            
            // 检查窗口是否完全超出屏幕边界
            let right_edge = position.x + size.width as i32;
            let bottom_edge = position.y + size.height as i32;
            let monitor_right = monitor_position.x + monitor_size.width as i32;
            let monitor_bottom = monitor_position.y + monitor_size.height as i32;
            
            // 左边界检查
            if right_edge < monitor_position.x + 100 {
                new_x = monitor_position.x;
                needs_adjustment = true;
            }
            // 右边界检查
            else if position.x > monitor_right - 100 {
                new_x = monitor_right - size.width as i32;
                needs_adjustment = true;
            }
            
            // 上边界检查
            if bottom_edge < monitor_position.y + 100 {
                new_y = monitor_position.y;
                needs_adjustment = true;
            }
            // 下边界检查
            else if position.y > monitor_bottom - 100 {
                new_y = monitor_bottom - size.height as i32;
                needs_adjustment = true;
            }
            
            if needs_adjustment {
                window.set_position(PhysicalPosition::new(new_x, new_y))
                    .map_err(|e| e.to_string())?;
            }
            
            Ok(needs_adjustment)
        } else {
            Err("No monitor found".to_string())
        }
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

/// 获取所有工具窗口的标签列表
#[tauri::command]
pub async fn get_all_tool_windows(app: AppHandle) -> Result<Vec<String>, String> {
    let windows: Vec<String> = app.webview_windows()
        .iter()
        .filter_map(|(label, _)| {
            // 过滤掉主窗口
            if label != "main" {
                Some(label.clone())
            } else {
                None
            }
        })
        .collect();
    
    Ok(windows)
}