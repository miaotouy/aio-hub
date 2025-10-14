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

    // 创建新窗口
    let window = WebviewWindowBuilder::new(
        &app,
        &config.label,
        WebviewUrl::App(config.url.into()),
    )
    .title(&config.title)
    .inner_size(config.width, config.height)
    .min_inner_size(400.0, 300.0)
    .decorations(false)  // 无边框，与主窗口保持一致
    .transparent(true)   // 透明背景
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

        // 如果需要居中，则计算偏移量
        if center.unwrap_or(false) {
            let size = window.outer_size().map_err(|e| e.to_string())?;
            let offset_x = (size.width as i32) / 2;
            let offset_y = (size.height as i32) / 2;
            physical_x -= offset_x;
            physical_y -= offset_y;
        }

        window.set_position(PhysicalPosition::new(physical_x, physical_y))
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
/// 清除所有窗口的保存状态
/// 清除所有窗口的保存状态
#[tauri::command]
pub async fn clear_window_state(app: AppHandle) -> Result<(), String> {
    // tauri-plugin-window-state 将状态保存在 app data 目录下的 .window-state 文件中
    // 删除该文件即可清除所有窗口的保存状态
    use std::fs;
    
    let app_data_dir = app.path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    let state_file = app_data_dir.join(".window-state");
    
    if state_file.exists() {
        fs::remove_file(&state_file)
            .map_err(|e| format!("删除窗口状态文件失败: {}", e))?;
    }
    
    Ok(())
}
/// 事件载荷：更新拖拽指示器信息
#[derive(Clone, serde::Serialize)]
struct DragIndicatorPayload {
    tool_name: String,
}

/// 准备拖拽：显示并定位指示器窗口
#[tauri::command]
pub async fn prepare_drag_indicator(
    app: AppHandle,
    tool_name: String,
    mouse_x: f64,
    mouse_y: f64,
) -> Result<(), String> {
    // 获取系统鼠标位置进行对比验证
    #[cfg(target_os = "windows")]
    let system_mouse_pos = unsafe {
        let mut point = windows::Win32::Foundation::POINT { x: 0, y: 0 };
        windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut point).ok();
        Some((point.x, point.y))
    };
    #[cfg(not(target_os = "windows"))]
    let system_mouse_pos: Option<(i32, i32)> = None;
    
    println!("[DRAG_START] Tool='{}' | Frontend=(x:{:.0}, y:{:.0}) | System={:?}",
        tool_name, mouse_x, mouse_y, system_mouse_pos);
    
    let indicator_window = app.get_webview_window("drag-indicator")
        .ok_or_else(|| "Drag indicator window not found.".to_string())?;

    indicator_window.emit("update-drag-indicator", DragIndicatorPayload { tool_name })
        .map_err(|e| e.to_string())?;
    
    set_window_position(app.clone(), "drag-indicator".to_string(), mouse_x, mouse_y, Some(true)).await?;
    indicator_window.show().map_err(|e| e.to_string())?;
    
    Ok(())
}

/// 结束拖拽：根据最终位置判断是否创建新窗口
#[tauri::command]
pub async fn finalize_drag_indicator(
    app: AppHandle,
    tool_config: WindowConfig,
    mouse_x: f64,
    mouse_y: f64,
    drag_start_x: f64,
    drag_start_y: f64,
) -> Result<bool, String> {
    // 获取系统鼠标位置进行对比验证
    #[cfg(target_os = "windows")]
    let system_mouse_pos = unsafe {
        let mut point = windows::Win32::Foundation::POINT { x: 0, y: 0 };
        windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut point).ok();
        Some((point.x, point.y))
    };
    #[cfg(not(target_os = "windows"))]
    let system_mouse_pos: Option<(i32, i32)> = None;
    
    let indicator_window = app.get_webview_window("drag-indicator")
        .ok_or_else(|| "Drag indicator window not found.".to_string())?;
    
    let main_window = app.get_webview_window("main")
        .ok_or_else(|| "Main window not found.".to_string())?;

    indicator_window.hide().map_err(|e| e.to_string())?;

    let scale_factor = main_window.scale_factor().map_err(|e| e.to_string())?;
    let main_pos = main_window.outer_position().map_err(|e| e.to_string())?;
    let main_size = main_window.outer_size().map_err(|e| e.to_string())?;
    
    let physical_mouse_x = (mouse_x * scale_factor) as i32;
    let physical_mouse_y = (mouse_y * scale_factor) as i32;
    
    println!("[DRAG_END] Frontend=(x:{:.0}, y:{:.0}) | Physical=({}, {}) | System={:?} | MainWin=({}, {}, {}x{})",
        mouse_x, mouse_y, physical_mouse_x, physical_mouse_y, system_mouse_pos,
        main_pos.x, main_pos.y, main_size.width, main_size.height);

    let is_outside =
        physical_mouse_x < main_pos.x ||
        physical_mouse_x > main_pos.x + main_size.width as i32 ||
        physical_mouse_y < main_pos.y ||
        physical_mouse_y > main_pos.y + main_size.height as i32;
    
    let distance = ((mouse_x - drag_start_x).powi(2) + (mouse_y - drag_start_y).powi(2)).sqrt();
    let is_far_enough = distance > 100.0;
    
    println!("[DRAG_END] Outside={} | Distance={:.0} | FarEnough={}", is_outside, distance, is_far_enough);

    let can_detach = is_outside || is_far_enough;

    if can_detach {
        let new_win_w_offset = (tool_config.width * scale_factor / 2.0) as i32;
        let new_win_h_offset = (tool_config.height * scale_factor / 2.0) as i32;
        let new_win_x = physical_mouse_x - new_win_w_offset;
        let new_win_y = physical_mouse_y - new_win_h_offset;
        
        println!("[DRAG_END] Creating window at ({}, {})", new_win_x, new_win_y);

        let tool_window = WebviewWindowBuilder::new(
            &app,
            &tool_config.label,
            WebviewUrl::App(tool_config.url.into()),
        )
        .title(&tool_config.title)
        .inner_size(tool_config.width, tool_config.height)
        .min_inner_size(400.0, 300.0)
        .position(new_win_x as f64, new_win_y as f64)
        .decorations(false)
        .transparent(true)
        .build()
        .map_err(|e| e.to_string())?;

        tool_window.set_skip_taskbar(false).map_err(|e| e.to_string())?;
        app.emit("tool-detached", tool_config.label.clone()).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        println!("[DRAG_END] Canceled (inside window or too close)");
        Ok(false)
    }
}
