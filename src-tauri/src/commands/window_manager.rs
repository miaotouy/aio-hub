use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::time::sleep;

/// 全局拖拽会话状态
static DRAG_SESSION: once_cell::sync::Lazy<Arc<Mutex<Option<DragSession>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(None)));

/// 拖拽会话数据
#[derive(Debug, Clone)]
struct DragSession {
    /// 工具配置
    tool_config: WindowConfig,
    /// 起始全局坐标（逻辑坐标）
    start_x: f64,
    start_y: f64,
    /// 主窗口位置和尺寸（物理坐标）
    main_window_x: i32,
    main_window_y: i32,
    main_window_width: u32,
    main_window_height: u32,
    /// 缩放因子
    scale_factor: f64,
    /// 指示器尺寸
    indicator_width: f64,
    indicator_height: f64,
    /// 会话开始时间
    start_time: Instant,
    /// 是否需要停止
    should_stop: bool,
}

/// 拖拽距离阈值（与前端保持一致）
const DETACH_THRESHOLD: f64 = 100.0;
/// 更新频率（Hz）
const UPDATE_FREQUENCY_HZ: u64 = 20;

/// 窗口创建配置
#[derive(Debug, Clone, Deserialize)]
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
    width: f64,
    height: f64,
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

    // 在显示之前调整大小
    indicator_window.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
        .map_err(|e| e.to_string())?;

    indicator_window.emit("update-drag-indicator", DragIndicatorPayload { tool_name })
        .map_err(|e| e.to_string())?;
    
    set_window_position(app.clone(), "drag-indicator".to_string(), mouse_x, mouse_y, Some(true)).await?;
    indicator_window.show().map_err(|e| e.to_string())?;
    
    Ok(())
}

/// 事件载荷：拖拽会话更新
#[derive(Clone, serde::Serialize)]
struct DragSessionUpdate {
    can_detach: bool,
    tool_name: String,
}

/// 获取系统鼠标位置（物理坐标）
#[cfg(target_os = "windows")]
fn get_cursor_position() -> Result<(i32, i32), String> {
    unsafe {
        let mut point = windows::Win32::Foundation::POINT { x: 0, y: 0 };
        windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut point)
            .map_err(|e| format!("获取鼠标位置失败: {}", e))?;
        Ok((point.x, point.y))
    }
}

#[cfg(not(target_os = "windows"))]
fn get_cursor_position() -> Result<(i32, i32), String> {
    Err("非 Windows 平台暂不支持".to_string())
}

/// 开始拖拽会话
#[tauri::command]
pub async fn start_drag_session(
    app: AppHandle,
    tool_config: WindowConfig,
    indicator_width: f64,
    indicator_height: f64,
) -> Result<(), String> {
    // 获取主窗口信息
    let main_window = app.get_webview_window("main")
        .ok_or_else(|| "主窗口未找到".to_string())?;
    
    let scale_factor = main_window.scale_factor().map_err(|e| e.to_string())?;
    let main_pos = main_window.outer_position().map_err(|e| e.to_string())?;
    let main_size = main_window.outer_size().map_err(|e| e.to_string())?;
    
    // 获取当前鼠标位置（物理坐标）
    let (cursor_x, cursor_y) = get_cursor_position()?;
    
    // 转换为逻辑坐标
    let start_x = cursor_x as f64 / scale_factor;
    let start_y = cursor_y as f64 / scale_factor;
    
    println!("[DRAG_SESSION] 开始 | 工具='{}' | 起始位置=(物理:{}, {} | 逻辑:{:.0}, {:.0}) | 主窗口=({}, {}, {}x{})",
        tool_config.title, cursor_x, cursor_y, start_x, start_y,
        main_pos.x, main_pos.y, main_size.width, main_size.height);
    
    // 创建会话
    let session = DragSession {
        tool_config: tool_config.clone(),
        start_x,
        start_y,
        main_window_x: main_pos.x,
        main_window_y: main_pos.y,
        main_window_width: main_size.width,
        main_window_height: main_size.height,
        scale_factor,
        indicator_width,
        indicator_height,
        start_time: Instant::now(),
        should_stop: false,
    };
    
    // 保存到全局状态
    {
        let mut drag_session = DRAG_SESSION.lock().unwrap();
        *drag_session = Some(session);
    }
    
    // 显示并初始化指示器窗口
    let indicator_window = app.get_webview_window("drag-indicator")
        .ok_or_else(|| "拖拽指示器窗口未找到".to_string())?;
    
    indicator_window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: indicator_width,
        height: indicator_height,
    })).map_err(|e| e.to_string())?;
    
    indicator_window.emit("update-drag-indicator", serde_json::json!({
        "tool_name": tool_config.title
    })).map_err(|e| e.to_string())?;
    
    set_window_position(app.clone(), "drag-indicator".to_string(), start_x, start_y, Some(true)).await?;
    indicator_window.show().map_err(|e| e.to_string())?;
    
    // 启动后台更新循环
    let app_clone = app.clone();
    tokio::spawn(async move {
        drag_update_loop(app_clone).await;
    });
    
    Ok(())
}

/// 后台拖拽更新循环
async fn drag_update_loop(app: AppHandle) {
    let update_interval = Duration::from_millis(1000 / UPDATE_FREQUENCY_HZ);
    let mut last_update = Instant::now();
    
    loop {
        // 检查会话是否还存在
        let session_info = {
            let session_lock = DRAG_SESSION.lock().unwrap();
            if let Some(ref session) = *session_lock {
                if session.should_stop {
                    break;
                }
                Some((
                    session.start_x,
                    session.start_y,
                    session.scale_factor,
                    session.tool_config.title.clone(),
                ))
            } else {
                None
            }
        };
        
        if session_info.is_none() {
            break;
        }
        
        let (start_x, start_y, scale_factor, tool_name) = session_info.unwrap();
        
        // 获取当前鼠标位置
        if let Ok((cursor_x, cursor_y)) = get_cursor_position() {
            let current_x = cursor_x as f64 / scale_factor;
            let current_y = cursor_y as f64 / scale_factor;
            
            // 更新指示器窗口位置
            if let Ok(_) = set_window_position(
                app.clone(),
                "drag-indicator".to_string(),
                current_x,
                current_y,
                Some(true)
            ).await {
                // 计算是否满足分离条件
                let distance = ((current_x - start_x).powi(2) + (current_y - start_y).powi(2)).sqrt();
                let can_detach = distance > DETACH_THRESHOLD;
                
                // 节流发送更新事件
                if last_update.elapsed() >= Duration::from_millis(50) {
                    let _ = app.emit("drag-session-update", DragSessionUpdate {
                        can_detach,
                        tool_name: tool_name.clone(),
                    });
                    last_update = Instant::now();
                }
            }
        }
        
        sleep(update_interval).await;
    }
    
    println!("[DRAG_SESSION] 更新循环已停止");
}

/// 结束拖拽会话
#[tauri::command]
pub async fn end_drag_session(app: AppHandle) -> Result<bool, String> {
    // 获取会话信息并标记停止
    let session = {
        let mut session_lock = DRAG_SESSION.lock().unwrap();
        if let Some(ref mut session) = *session_lock {
            session.should_stop = true;
            Some(session.clone())
        } else {
            None
        }
    };
    
    let session = session.ok_or_else(|| "没有活跃的拖拽会话".to_string())?;
    
    // 隐藏指示器窗口
    if let Some(indicator_window) = app.get_webview_window("drag-indicator") {
        indicator_window.hide().map_err(|e| e.to_string())?;
    }
    
    // 获取最终鼠标位置
    let (final_cursor_x, final_cursor_y) = get_cursor_position()?;
    let final_x = final_cursor_x as f64 / session.scale_factor;
    let final_y = final_cursor_y as f64 / session.scale_factor;
    
    // 计算距离
    let distance = ((final_x - session.start_x).powi(2) + (final_y - session.start_y).powi(2)).sqrt();
    
    // 判断是否在主窗口外
    let is_outside =
        final_cursor_x < session.main_window_x ||
        final_cursor_x > session.main_window_x + session.main_window_width as i32 ||
        final_cursor_y < session.main_window_y ||
        final_cursor_y > session.main_window_y + session.main_window_height as i32;
    
    let can_detach = is_outside || distance > DETACH_THRESHOLD;
    
    println!("[DRAG_SESSION] 结束 | 最终位置=(物理:{}, {} | 逻辑:{:.0}, {:.0}) | 距离={:.0} | 在窗口外={} | 可分离={}",
        final_cursor_x, final_cursor_y, final_x, final_y, distance, is_outside, can_detach);
    
    // 清除会话
    {
        let mut session_lock = DRAG_SESSION.lock().unwrap();
        *session_lock = None;
    }
    
    // 如果满足条件，创建新窗口
    if can_detach {
        let config = &session.tool_config;
        let new_win_w_offset = (config.width * session.scale_factor / 2.0) as i32;
        let new_win_h_offset = (config.height * session.scale_factor / 2.0) as i32;
        let new_win_x = final_cursor_x - new_win_w_offset;
        let new_win_y = final_cursor_y - new_win_h_offset;
        
        println!("[DRAG_SESSION] 创建窗口于 ({}, {})", new_win_x, new_win_y);
        
        let tool_window = WebviewWindowBuilder::new(
            &app,
            &config.label,
            WebviewUrl::App(config.url.clone().into()),
        )
        .title(&config.title)
        .inner_size(config.width, config.height)
        .min_inner_size(400.0, 300.0)
        .position(new_win_x as f64, new_win_y as f64)
        .decorations(false)
        .transparent(true)
        .build()
        .map_err(|e| e.to_string())?;
        
        tool_window.set_skip_taskbar(false).map_err(|e| e.to_string())?;
        app.emit("tool-detached", config.label.clone()).map_err(|e| e.to_string())?;
        
        Ok(true)
    } else {
        println!("[DRAG_SESSION] 取消创建（在窗口内或距离不足）");
        Ok(false)
    }
}

/// 结束拖拽：根据最终位置判断是否创建新窗口（保留旧命令以兼容）
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
