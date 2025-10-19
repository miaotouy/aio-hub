use nanoid::nanoid;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};
use tokio::time::sleep;

// ============================================================================
// 新统一分离系统 (Unified Detachment System)
// ============================================================================

/// 统一的窗口分离配置
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetachableConfig {
    /// 唯一标识符 (e.g., "json-formatter" or "chat-area")
    pub id: String,
    /// 显示名称 (e.g., "JSON Formatter" or "对话区域")
    pub display_name: String,
    /// 窗口类型: 'tool' 或 'component'
    pub r#type: String, // 'type' is a keyword in Rust
    /// 初始宽度
    pub width: f64,
    /// 初始高度
    pub height: f64,
    /// 鼠标起始X坐标
    pub mouse_x: f64,
    /// 鼠标起始Y坐标
    pub mouse_y: f64,
}

/// 统一的拖拽分离会话状态
#[derive(Debug, Clone)]
struct DetachSession {
    /// 分离配置
    config: DetachableConfig,
    /// 预览窗口的标签
    preview_window_label: String,
}

/// 全局分离会话管理器
static DETACH_SESSIONS: once_cell::sync::Lazy<Arc<Mutex<HashMap<String, DetachSession>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// 辅助函数：将驼峰命名转换为短横线命名
fn camel_to_kebab(s: &str) -> String {
    let mut result = String::new();
    for (i, ch) in s.chars().enumerate() {
        if ch.is_uppercase() {
            if i > 0 {
                result.push('-');
            }
            result.push(ch.to_lowercase().next().unwrap());
        } else {
            result.push(ch);
        }
    }
    result
}

/// 辅助函数：创建一个预览窗口
async fn create_preview_window_internal(
    app: &AppHandle,
    label: &str,
    config: &DetachableConfig,
) -> Result<(), String> {
    // 根据类型选择不同的路由
    let url = if config.r#type == "tool" {
        // 工具类型：使用 DetachedWindowContainer
        // 将驼峰命名的 ID 转换为短横线格式的路径
        let tool_path = format!("/{}", camel_to_kebab(&config.id));
        format!(
            "/detached-window?toolPath={}&title={}",
            urlencoding::encode(&tool_path),
            urlencoding::encode(&config.display_name)
        )
    } else {
        // 组件类型：使用 DetachedComponentContainer
        let config_json =
            serde_json::to_string(config).map_err(|e| format!("序列化组件配置失败: {}", e))?;
        let config_encoded = urlencoding::encode(&config_json);
        format!("/detached-component-loader?config={}", config_encoded)
    };

    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title("Preview")
        .inner_size(config.width, config.height)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

    window
        .set_ignore_cursor_events(true)
        .map_err(|e| e.to_string())?;

    set_window_position(
        app.clone(),
        label.to_string(),
        config.mouse_x,
        config.mouse_y,
        Some(true),
    )
    .await?;

    sleep(Duration::from_millis(150)).await;
    window.show().map_err(|e| e.to_string())?;

    Ok(())
}

/// 开始一个统一的分离会话
#[tauri::command]
pub async fn begin_detach_session(
    app: AppHandle,
    config: DetachableConfig,
) -> Result<String, String> {
    let preview_label = format!("preview-{}", nanoid!(8));
    let session_id = preview_label.clone();

    println!("[DETACH] 开始新会话: {}, 类型: {}, ID: {}", session_id, config.r#type, config.id);

    create_preview_window_internal(&app, &preview_label, &config).await?;

    let session = DetachSession {
        config,
        preview_window_label: preview_label,
    };
    
    {
        let mut sessions = DETACH_SESSIONS.lock().unwrap();
        sessions.insert(session_id.clone(), session);
    }

    Ok(session_id)
}

/// 更新分离会话中预览窗口的位置
#[tauri::command]
pub async fn update_detach_session_position(
    app: AppHandle,
    session_id: String,
    x: f64,
    y: f64,
) -> Result<(), String> {
    // 在独立作用域中获取锁，提取需要的数据后立即释放锁
    let preview_label = {
        let sessions = DETACH_SESSIONS.lock().unwrap();
        sessions.get(&session_id)
            .map(|session| session.preview_window_label.clone())
    };
    
    // 锁已释放，现在可以安全地进行异步操作
    if let Some(label) = preview_label {
        set_window_position(app, label, x, y, Some(true)).await
    } else {
        Err(format!("分离会话 {} 不存在", session_id))
    }
}

/// 持久化的已分离窗口集合
/// key: window label, value: DetachedWindowInfo
static FINALIZED_DETACHED_WINDOWS: once_cell::sync::Lazy<Arc<Mutex<HashMap<String, DetachedWindowInfo>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// 辅助函数：固化一个窗口
async fn finalize_window_internal(app: &AppHandle, label: &str, config: &DetachableConfig) -> Result<(), String> {
    let window = app.get_webview_window(label).ok_or_else(|| format!("窗口不存在: {}", label))?;

    // 更新窗口标题为实际的显示名称
    window.set_title(&config.display_name).map_err(|e| e.to_string())?;
    
    window.set_ignore_cursor_events(false).map_err(|e| e.to_string())?;
    window.set_skip_taskbar(false).map_err(|e| e.to_string())?;

    // 通知前端视图更新 (e.g., to hide preview-only elements)
    window.emit("finalize-component-view", ()).map_err(|e| e.to_string())?;

    let info = DetachedWindowInfo {
        label: label.to_string(),
        id: config.id.clone(),
        r#type: config.r#type.clone(),
    };

    // 1. Add to persistent state
    {
        let mut detached_windows = FINALIZED_DETACHED_WINDOWS.lock().unwrap();
        detached_windows.insert(label.to_string(), info.clone());
    }

    // 2. Emit the unified 'window-detached' event
    app.emit("window-detached", info).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// 统一获取所有已分离的窗口信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetachedWindowInfo {
    pub label: String,
    pub id: String,
    pub r#type: String,
}

#[tauri::command]
pub async fn get_all_detached_windows(_app: AppHandle) -> Result<Vec<DetachedWindowInfo>, String> {
    let detached_windows = FINALIZED_DETACHED_WINDOWS.lock().unwrap();
    let windows: Vec<DetachedWindowInfo> = detached_windows.values().cloned().collect();
    Ok(windows)
}

/// 最终化一个分离会话（创建真实窗口或取消）
#[tauri::command]
pub async fn finalize_detach_session(
    app: AppHandle,
    session_id: String,
    should_detach: bool,
) -> Result<(), String> {
    let session = {
        let mut sessions = DETACH_SESSIONS.lock().unwrap();
        sessions.remove(&session_id)
    };

    if let Some(session) = session {
        let preview_window_label = session.preview_window_label.clone();
        let preview_window = app.get_webview_window(&preview_window_label).ok_or_else(|| format!("预览窗口 '{}' 不存在", preview_window_label))?;

        if should_detach {
            println!("[DETACH] 会话 {} 已固化", session_id);
            finalize_window_internal(&app, &preview_window_label, &session.config).await?;
        } else {
            println!("[DETACH] 会话 {} 已取消", session_id);
            preview_window.close().map_err(|e| e.to_string())?;
        }
        Ok(())
    } else {
        Err(format!("分离会话 {} 不存在或已被处理", session_id))
    }
}


// ============================================================================
// 通用窗口管理命令 (Common Window Management Commands)
// ============================================================================

/// 窗口创建配置 (用于非拖拽创建)
#[derive(Debug, Clone, Deserialize)]
pub struct WindowConfig {
    pub label: String,
    pub title: String,
    pub url: String,
    #[serde(default = "default_width")]
    pub width: f64,
    #[serde(default = "default_height")]
    pub height: f64,
}

fn default_width() -> f64 { 900.0 }
fn default_height() -> f64 { 700.0 }


/// 创建工具窗口 (用于从菜单等非拖拽方式打开)
#[tauri::command]
pub async fn create_tool_window(app: AppHandle, config: WindowConfig) -> Result<(), String> {
    if let Some(existing_window) = app.get_webview_window(&config.label) {
        existing_window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let _window = WebviewWindowBuilder::new(&app, &config.label, WebviewUrl::App(config.url.into()))
        .title(&config.title)
        .inner_size(config.width, config.height)
        .min_inner_size(400.0, 300.0)
        .decorations(false)
        .transparent(true)
        .build()
        .map_err(|e| e.to_string())?;

    let detachable_config = DetachableConfig {
        id: config.label.clone(),
        display_name: config.title.clone(),
        r#type: "tool".to_string(),
        width: config.width,
        height: config.height,
        mouse_x: 0.0, // 不适用于此场景
        mouse_y: 0.0,
    };

    finalize_window_internal(&app, &config.label, &detachable_config).await
}

/// 关闭分离的窗口（重新附加）
#[tauri::command]
pub async fn close_detached_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        // 1. 从持久化状态中移除
        let info = {
            let mut detached_windows = FINALIZED_DETACHED_WINDOWS.lock().unwrap();
            detached_windows.remove(&label)
        };

        // 2. 发送窗口重新附着事件
        if let Some(info) = info {
            let payload = serde_json::json!({ "label": info.label });
            app.emit("window-attached", payload)
                .map_err(|e| e.to_string())?;
        }
        
        // 3. 关闭窗口
        window.close().map_err(|e| e.to_string())?;

        Ok(())
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

/// 聚焦指定窗口
#[tauri::command]
pub async fn focus_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

/// 设置窗口位置（接收逻辑坐标并转换为物理坐标）
#[tauri::command]
pub async fn set_window_position(
    app: AppHandle,
    label: String,
    x: f64,
    y: f64,
    center: Option<bool>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        let scale_factor = window.scale_factor().map_err(|e| e.to_string())?;
        let mut physical_x = (x * scale_factor) as i32;
        let mut physical_y = (y * scale_factor) as i32;

        if center.unwrap_or(false) {
            let size = window.outer_size().map_err(|e| e.to_string())?;
            physical_x -= (size.width as i32) / 2;
            physical_y -= (size.height as i32) / 2;
        }

        window
            .set_position(PhysicalPosition::new(physical_x, physical_y))
            .map_err(|e| e.to_string())?;

        Ok(())
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

/// 检查窗口位置是否在屏幕内，如果不在则拉回
#[tauri::command]
pub async fn ensure_window_visible(app: AppHandle, label: String) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window(&label) {
        if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
            let position = window.outer_position().map_err(|e| e.to_string())?;
            let size = window.outer_size().map_err(|e| e.to_string())?;
            let scale_factor = monitor.scale_factor();

            let logical_x = position.x as f64 / scale_factor;
            let logical_y = position.y as f64 / scale_factor;
            let logical_width = size.width as f64 / scale_factor;
            let logical_height = size.height as f64 / scale_factor;

            let monitor_pos = monitor.position();
            let monitor_size = monitor.size();

            let (clamped_x, clamped_y) = clamp_position_to_screen(
                logical_x, logical_y, logical_width, logical_height,
                monitor_pos.x, monitor_pos.y,
                monitor_size.width, monitor_size.height,
                scale_factor,
            );

            let needs_adjustment = (clamped_x - logical_x).abs() > 0.1 || (clamped_y - logical_y).abs() > 0.1;

            if needs_adjustment {
                set_window_position(app.clone(), label, clamped_x, clamped_y, Some(false)).await?;
            }

            Ok(needs_adjustment)
        } else {
            Err("No monitor found for the window".to_string())
        }
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

fn clamp_position_to_screen(
    x: f64, y: f64, width: f64, _height: f64,
    monitor_pos_x: i32, monitor_pos_y: i32,
    monitor_width: u32, monitor_height: u32,
    scale_factor: f64,
) -> (f64, f64) {
    let physical_x = (x * scale_factor) as i32;
    let physical_y = (y * scale_factor) as i32;
    let physical_width = (width * scale_factor) as i32;

    let monitor_right = monitor_pos_x + monitor_width as i32;
    let monitor_bottom = monitor_pos_y + monitor_height as i32;

    let mut clamped_x = physical_x;
    let mut clamped_y = physical_y;

    if clamped_x + physical_width < monitor_pos_x + 60 { // 至少保留60px可见
        clamped_x = monitor_pos_x + 60 - physical_width;
    }
    if clamped_x > monitor_right - 60 {
        clamped_x = monitor_right - 60;
    }
    if clamped_y < monitor_pos_y {
        clamped_y = monitor_pos_y;
    }
    if clamped_y > monitor_bottom - 60 {
        clamped_y = monitor_bottom - 60;
    }

    (clamped_x as f64 / scale_factor, clamped_y as f64 / scale_factor)
}

/// 清除所有窗口的保存状态
#[tauri::command]
pub async fn clear_window_state(app: AppHandle) -> Result<(), String> {
    use std::fs;
    let app_data_dir = app.path().app_data_dir().map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    let state_file = app_data_dir.join(".window-state");
    if state_file.exists() {
        fs::remove_file(&state_file).map_err(|e| format!("删除窗口状态文件失败: {}", e))?;
    }
    Ok(())
}
