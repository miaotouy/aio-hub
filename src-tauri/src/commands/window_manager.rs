// rdev 用于全局鼠标监听，但在 macOS 上需要小心使用以避免与辅助功能冲突
use rdev::{listen, Event, EventType};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tokio::time::sleep;

// ============================================================================
// 新统一分离系统 (Unified Detachment System)
// ============================================================================

// ============================================================================
// 基于 rdev 的拖拽会话管理 (在 macOS 上被禁用)
// ============================================================================

/// 拖拽会话状态
#[derive(Debug, Clone)]
struct DragSessionState {
    /// 分离配置
    config: DetachableConfig,
    /// 预览窗口的标签
    preview_window_label: String,
    /// 起始屏幕坐标
    start_x: f64,
    start_y: f64,
    /// 当前屏幕坐标
    current_x: f64,
    current_y: f64,
    /// 是否可以分离
    can_detach: bool,
    /// 会话创建时间
    created_at: Instant,
    /// AppHandle 的克隆（用于在后台线程中更新窗口）
    app_handle: AppHandle,
    /// 手柄偏移量（物理坐标）
    handle_offset_x: f64,
    handle_offset_y: f64,
    /// 上次更新窗口位置的时间（用于节流）
    last_update_time: Instant,
}

/// 全局拖拽会话（同一时刻只有一个）
static DRAG_SESSION: once_cell::sync::Lazy<Arc<Mutex<Option<DragSessionState>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(None)));

/// 分离阈值（与前端保持一致）
const DETACH_THRESHOLD: f64 = 50.0;

/// 窗口位置更新的最小时间间隔（毫秒）
/// 设置为约 8ms，即最高 120Hz 更新频率
const UPDATE_THROTTLE_MS: u64 = 8;

/// 初始化全局鼠标监听器
pub fn init_global_mouse_listener() {
    thread::spawn(move || {
        let session_arc = DRAG_SESSION.clone();

        // 提取通用逻辑以避免代码重复
        let handle_button_release = |session_arc: Arc<Mutex<Option<DragSessionState>>>| {
            let app_handle_opt = {
                let session_opt = session_arc.lock().unwrap();
                session_opt.as_ref().map(|s| s.app_handle.clone())
            };

            if let Some(app_handle) = app_handle_opt {
                log::debug!("[DRAG] 检测到全局鼠标释放，尝试结束会话");
                thread::spawn(move || {
                    let rt = tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build()
                        .unwrap();
                    rt.block_on(async {
                        tokio::time::sleep(Duration::from_millis(100)).await;
                        if let Err(e) = end_drag_session(app_handle).await {
                            if !e.contains("没有活动的拖拽会话") {
                                log::warn!("[DRAG] 自动结束会话失败: {}", e);
                            }
                        }
                    });
                });
            }
        };

        let handle_mouse_move =
            |session_arc: Arc<Mutex<Option<DragSessionState>>>, x: f64, y: f64| {
                let update_data = {
                    let mut session_opt = session_arc.lock().unwrap();
                    if let Some(session) = session_opt.as_mut() {
                        session.current_x = x;
                        session.current_y = y;

                        let delta_x = x - session.start_x;
                        let delta_y = y - session.start_y;
                        let distance = (delta_x * delta_x + delta_y * delta_y).sqrt();
                        session.can_detach = distance >= DETACH_THRESHOLD;

                        let now = Instant::now();
                        let should_update = now.duration_since(session.last_update_time).as_millis()
                            >= UPDATE_THROTTLE_MS as u128;

                        if should_update {
                            session.last_update_time = now;
                            Some((
                                session.app_handle.clone(),
                                session.preview_window_label.clone(),
                                session.can_detach,
                                session.handle_offset_x,
                                session.handle_offset_y,
                            ))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                };

                if let Some((app_handle, preview_label, can_detach, handle_offset_x, handle_offset_y)) =
                    update_data
                {
                    if let Some(window) = app_handle.get_webview_window(&preview_label) {
                        let physical_x = (x - handle_offset_x) as i32;
                        let physical_y = (y - handle_offset_y) as i32;
                        let _ = window.set_position(PhysicalPosition::new(physical_x, physical_y));
                        let _ = window.emit(
                            "detach-status-update",
                            serde_json::json!({ "canDetach": can_detach }),
                        );
                    }
                }
            };

        // 根据操作系统定义不同的回调
        let callback = {
            let session_arc = session_arc.clone();
            move |event: Event| {
                #[cfg(target_os = "macos")]
                {
                    // 在 macOS 上，采取最严格的策略，只处理鼠标事件
                    match event.event_type {
                        EventType::ButtonRelease(_) => handle_button_release(session_arc.clone()),
                        EventType::MouseMove { x, y } => handle_mouse_move(session_arc.clone(), x, y),
                        _ => {
                            // 忽略所有其他事件，特别是键盘事件，以防止崩溃
                        }
                    }
                }
                #[cfg(not(target_os = "macos"))]
                {
                    // 在其他系统上，可以稍微放宽，但仍然忽略键盘事件
                    match event.event_type {
                        EventType::ButtonRelease(_) => handle_button_release(session_arc.clone()),
                        EventType::MouseMove { x, y } => handle_mouse_move(session_arc.clone(), x, y),
                        EventType::KeyPress(_) | EventType::KeyRelease(_) => {
                            // 显式忽略键盘事件
                        }
                        _ => {}
                    }
                }
            }
        };

        log::info!("[DRAG] 全局鼠标监听器已启动");
        if let Err(error) = listen(callback) {
            log::error!("[DRAG] 全局鼠标监听错误: {:?}", error);
        }
    });
}

/// 开始一个基于全局鼠标监听的拖拽会话
#[tauri::command]
pub async fn start_drag_session(app: AppHandle, config: DetachableConfig) -> Result<(), String> {
    // 检查并清理可能卡住的旧会话
    {
        let mut session_opt = DRAG_SESSION.lock().unwrap();
        if let Some(existing_session) = &*session_opt {
            // 如果会话存在超过10秒，就认为它卡住了
            if existing_session.created_at.elapsed() > Duration::from_secs(10) {
                log::warn!("[DRAG] 检测到卡住的旧会话，强制清理...");
                let old_preview_label = existing_session.preview_window_label.clone();
                let app_clone = app.clone();

                // 在后台线程中关闭旧窗口
                thread::spawn(move || {
                    if let Some(window) = app_clone.get_webview_window(&old_preview_label) {
                        let _ = window.close();
                    }
                });

                // 清理会话
                *session_opt = None;
                log::info!("[DRAG] 旧会话已清理");
            } else {
                // 如果会话还很新，拒绝创建新会话
                return Err("已存在活动的拖拽会话".to_string());
            }
        }
    }

    log::info!("[DRAG] 开始拖拽会话: {}", config.display_name);
    
    // 动态注册 ESC 快捷键（仅在拖拽会话期间有效）
    let app_clone = app.clone();
    if let Err(e) = app
        .global_shortcut()
        .on_shortcut("Escape", move |_app, _shortcut, _event| {
            cancel_drag_on_esc(app_clone.clone());
        })
    {
        log::warn!("[DRAG] 警告: 无法注册 ESC 快捷键: {}", e);
    } else {
        log::info!("[DRAG] ESC 快捷键已注册");
    }

    // 创建预览窗口，使用固定标签以支持窗口状态记忆
    let preview_label = format!("detached-{}", &config.id);
    create_preview_window_internal(&app, &preview_label, &config, true).await?;

    // 前端传入的是逻辑坐标，需要转换为物理坐标以匹配 rdev 的坐标系统
    let scale_factor = if let Some(window) = app.get_webview_window(&preview_label) {
        window.scale_factor().unwrap_or(1.0)
    } else {
        1.0
    };

    let physical_start_x = config.mouse_x * scale_factor;
    let physical_start_y = config.mouse_y * scale_factor;
    let physical_handle_offset_x = config.handle_offset_x * scale_factor;
    let physical_handle_offset_y = config.handle_offset_y * scale_factor;

    // 创建会话状态
    let now = Instant::now();
    let session_state = DragSessionState {
        config: config.clone(),
        preview_window_label: preview_label.clone(),
        start_x: physical_start_x,
        start_y: physical_start_y,
        current_x: physical_start_x,
        current_y: physical_start_y,
        can_detach: false,
        created_at: now,
        app_handle: app.clone(),
        handle_offset_x: physical_handle_offset_x,
        handle_offset_y: physical_handle_offset_y,
        last_update_time: now,
    };

    // 保存会话状态
    {
        let mut session = DRAG_SESSION.lock().unwrap();
        *session = Some(session_state);
    }

    Ok(())
}
/// 结束拖拽会话
#[tauri::command]
pub async fn end_drag_session(app: AppHandle) -> Result<bool, String> {
    let session_state = {
        let mut session = DRAG_SESSION.lock().unwrap();
        session.take()
    };

    if let Some(state) = session_state {
        let duration = state.created_at.elapsed();
        log::info!(
            "[DRAG] 结束拖拽会话: {}, can_detach: {}, 持续时间: {:?}",
            state.config.display_name, state.can_detach, duration
        );

        // 取消注册 ESC 快捷键
        if let Err(e) = app.global_shortcut().unregister("Escape") {
            log::warn!("[DRAG] 警告: 取消注册 ESC 快捷键失败: {}", e);
        } else {
            log::info!("[DRAG] ESC 快捷键已取消注册");
        }

        let preview_window_label = state.preview_window_label.clone();
        let should_detach = state.can_detach;

        if should_detach {
            // 固化窗口
            finalize_window_internal(&app, &preview_window_label, &state.config).await?;
            Ok(true)
        } else {
            // 取消分离，关闭预览窗口
            if let Some(window) = app.get_webview_window(&preview_window_label) {
                window.close().map_err(|e| e.to_string())?;
            }
            Ok(false)
        }
    } else {
        Err("没有活动的拖拽会话".to_string())
    }
}

/// 取消当前的拖拽会话（由 ESC 快捷键触发）
/// ESC 是强制取消，无论 can_detach 状态如何都直接关闭窗口
pub fn cancel_drag_on_esc(app: AppHandle) {
    // 取出会话状态
    let session_to_cancel = { DRAG_SESSION.lock().unwrap().take() };

    if let Some(session) = session_to_cancel {
        log::info!("[SHORTCUT] ESC 快捷键触发，强制取消拖拽会话");

        let preview_label = session.preview_window_label.clone();
        
        // 在异步运行时中执行取消操作
        tauri::async_runtime::spawn(async move {
            // 1. 取消注册 ESC 快捷键
            if let Err(e) = app.global_shortcut().unregister("Escape") {
                log::warn!("[SHORTCUT] 取消注册 ESC 快捷键失败: {}", e);
            } else {
                log::info!("[SHORTCUT] ESC 快捷键已取消注册");
            }

            // 2. 强制关闭预览窗口（不管 can_detach 状态）
            if let Some(window) = app.get_webview_window(&preview_label) {
                if let Err(e) = window.close() {
                    log::error!("[SHORTCUT] 关闭预览窗口失败: {}", e);
                } else {
                    log::info!("[SHORTCUT] 预览窗口已关闭");
                }
            }
        });
    }
}

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
    /// 手柄相对于窗口左上角的X偏移量（可选）
    #[serde(default)]
    pub handle_offset_x: f64,
    /// 手柄相对于窗口左上角的Y偏移量（可选）
    #[serde(default)]
    pub handle_offset_y: f64,
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
///
/// # 参数
/// * `is_drag` - 是否为拖拽创建（true: 拖拽创建，需要覆盖尺寸和位置；false: 按钮创建，完全依赖插件恢复）
async fn create_preview_window_internal(
    app: &AppHandle,
    label: &str,
    config: &DetachableConfig,
    is_drag: bool,
) -> Result<(), String> {
    // 根据类型选择不同的路由
    let url = if config.r#type == "tool" {
        // 工具类型：使用清晰的路径结构 /detached-window/{tool-path}
        // 将驼峰命名的 ID 转换为短横线格式的路径
        let tool_path = camel_to_kebab(&config.id);
        format!("/detached-window/{}", tool_path)
    } else {
        // 组件类型：使用清晰的路径结构 /detached-component/{component-id}
        // 需要传递配置信息以支持动态尺寸和 props
        let config_json =
            serde_json::to_string(config).map_err(|e| format!("序列化组件配置失败: {}", e))?;
        let config_encoded = urlencoding::encode(&config_json);
        format!(
            "/detached-component/{}?config={}",
            &config.id, config_encoded
        )
    };

    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title("Preview")
        .inner_size(config.width, config.height)
        .decorations(false)
        .shadow(false)
        .skip_taskbar(true)
        .visible(false);

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent);
    }

    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.transparent(true);
    }

    let window = builder.build().map_err(|e| e.to_string())?;

    window
        .set_ignore_cursor_events(true)
        .map_err(|e| e.to_string())?;

    // 只有在拖拽创建时才需要覆盖尺寸和位置
    if is_drag {
        // 仅对组件类型强制设置窗口尺寸，覆盖插件可能恢复的旧尺寸
        // 这确保拖拽出来的组件大小与在页面内时的大小一致
        // 工具类型则保留插件恢复的尺寸或使用默认尺寸
        if config.r#type == "component" {
            use tauri::LogicalSize;
            window
                .set_size(LogicalSize::new(config.width, config.height))
                .map_err(|e| e.to_string())?;
        }

        // 使用手柄偏移量来定位窗口
        // 窗口位置 = 鼠标位置 - 手柄偏移量
        let window_x = config.mouse_x - config.handle_offset_x;
        let window_y = config.mouse_y - config.handle_offset_y;

        set_window_position(
            app.clone(),
            label.to_string(),
            window_x,
            window_y,
            Some(false), // 不居中，使用精确位置
        )
        .await?;
    }
    // 按钮创建时，完全依赖插件恢复位置和尺寸，不做任何覆盖

    // 应用保存的窗口配置（如果存在）
    // 注意：这会覆盖上面的位置和尺寸设置（如果有保存的配置）
    let window_clone = window.clone();
    let apply_result = crate::commands::window_config::apply_window_config(window_clone).await;
    if let Err(e) = apply_result {
        log::error!("[WINDOW_CONFIG] 应用窗口配置失败: {}", e);
    }

    sleep(Duration::from_millis(150)).await;
    window.show().map_err(|e| e.to_string())?;

    Ok(())
}

/// 开始一个统一的分离会话（用于按钮分离）
#[tauri::command]
pub async fn begin_detach_session(
    app: AppHandle,
    config: DetachableConfig,
) -> Result<String, String> {
    // 使用固定标签以支持窗口状态记忆
    let preview_label = format!("detached-{}", &config.id);
    let session_id = preview_label.clone();

    log::info!(
        "[DETACH] 开始按钮分离会话: {}, 类型: {}, ID: {}",
        session_id, config.r#type, config.id
    );

    // 按钮创建时 is_drag=false，完全依赖插件恢复位置和尺寸
    create_preview_window_internal(&app, &preview_label, &config, false).await?;

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
        sessions
            .get(&session_id)
            .map(|session| session.preview_window_label.clone())
    };

    // 锁已释放，现在可以安全地进行异步操作
    if let Some(label) = preview_label {
        set_window_position(app, label, x, y, Some(true)).await
    } else {
        Err(format!("分离会话 {} 不存在", session_id))
    }
}

/// 更新分离会话的状态（是否可以分离）并通知预览窗口
#[tauri::command]
pub async fn update_detach_session_status(
    app: AppHandle,
    session_id: String,
    can_detach: bool,
) -> Result<(), String> {
    // 在独立作用域中获取锁，提取需要的数据后立即释放锁
    let preview_label = {
        let sessions = DETACH_SESSIONS.lock().unwrap();
        sessions
            .get(&session_id)
            .map(|session| session.preview_window_label.clone())
    };

    // 锁已释放，现在可以安全地进行异步操作
    if let Some(label) = preview_label {
        if let Some(window) = app.get_webview_window(&label) {
            // 向预览窗口发送状态更新事件
            window
                .emit(
                    "detach-status-update",
                    serde_json::json!({ "canDetach": can_detach }),
                )
                .map_err(|e| format!("发送状态更新事件失败: {}", e))?;
            Ok(())
        } else {
            Err(format!("预览窗口 '{}' 不存在", label))
        }
    } else {
        Err(format!("分离会话 {} 不存在", session_id))
    }
}

/// 持久化的已分离窗口集合
/// key: window label, value: DetachedWindowInfo
static FINALIZED_DETACHED_WINDOWS: once_cell::sync::Lazy<
    Arc<Mutex<HashMap<String, DetachedWindowInfo>>>,
> = once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// 辅助函数：固化一个窗口
async fn finalize_window_internal(
    app: &AppHandle,
    label: &str,
    config: &DetachableConfig,
) -> Result<(), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("窗口不存在: {}", label))?;

    // 更新窗口标题为实际的显示名称
    window
        .set_title(&config.display_name)
        .map_err(|e| e.to_string())?;

    window
        .set_ignore_cursor_events(false)
        .map_err(|e| e.to_string())?;
    window.set_skip_taskbar(false).map_err(|e| e.to_string())?;

    // 只对工具类型窗口启用阴影，组件类型窗口保持透明无阴影
    if config.r#type == "tool" {
        window.set_shadow(true).map_err(|e| e.to_string())?;
    }

    // 只对组件类型窗口默认置顶
    if config.r#type == "component" {
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
    }

    // 通知前端视图更新 (e.g., to hide preview-only elements)
    window
        .emit("finalize-component-view", ())
        .map_err(|e| e.to_string())?;

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
    app.emit("window-detached", info)
        .map_err(|e| e.to_string())?;

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
        let preview_window = app
            .get_webview_window(&preview_window_label)
            .ok_or_else(|| format!("预览窗口 '{}' 不存在", preview_window_label))?;

        if should_detach {
            log::info!("[DETACH] 会话 {} 已固化", session_id);
            finalize_window_internal(&app, &preview_window_label, &session.config).await?;
        } else {
            log::info!("[DETACH] 会话 {} 已取消", session_id);
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

fn default_width() -> f64 {
    900.0
}
fn default_height() -> f64 {
    700.0
}

/// 创建工具窗口 (用于从菜单等非拖拽方式打开)
#[tauri::command]
pub async fn create_tool_window(app: AppHandle, config: WindowConfig) -> Result<(), String> {
    if let Some(existing_window) = app.get_webview_window(&config.label) {
        existing_window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(&app, &config.label, WebviewUrl::App(config.url.into()))
        .title(&config.title)
        .inner_size(config.width, config.height)
        .min_inner_size(400.0, 300.0)
        .decorations(false);

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent);
    }

    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.transparent(true);
    }

    let _window = builder.build().map_err(|e| e.to_string())?;

    let detachable_config = DetachableConfig {
        id: config.label.clone(),
        display_name: config.title.clone(),
        r#type: "tool".to_string(),
        width: config.width,
        height: config.height,
        mouse_x: 0.0, // 不适用于此场景
        mouse_y: 0.0,
        handle_offset_x: 0.0,
        handle_offset_y: 0.0,
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
        // 如果窗口已最大化，跳过位置调整
        // 在 Windows 上，调用 set_position 会自动取消最大化状态
        if window.is_maximized().map_err(|e| e.to_string())? {
            return Ok(false);
        }

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

            let monitor_bounds = ScreenBounds {
                pos_x: monitor_pos.x,
                pos_y: monitor_pos.y,
                width: monitor_size.width,
                height: monitor_size.height,
            };

            let (clamped_x, clamped_y) = clamp_position_to_screen(
                logical_x,
                logical_y,
                logical_width,
                logical_height,
                &monitor_bounds,
                scale_factor,
            );

            let needs_adjustment =
                (clamped_x - logical_x).abs() > 0.1 || (clamped_y - logical_y).abs() > 0.1;

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

struct ScreenBounds {
    pos_x: i32,
    pos_y: i32,
    width: u32,
    height: u32,
}

fn clamp_position_to_screen(
    x: f64,
    y: f64,
    width: f64,
    _height: f64,
    monitor: &ScreenBounds,
    scale_factor: f64,
) -> (f64, f64) {
    let physical_x = (x * scale_factor) as i32;
    let physical_y = (y * scale_factor) as i32;
    let physical_width = (width * scale_factor) as i32;

    let monitor_right = monitor.pos_x + monitor.width as i32;
    let monitor_bottom = monitor.pos_y + monitor.height as i32;

    let mut clamped_x = physical_x;
    let mut clamped_y = physical_y;

    if clamped_x + physical_width < monitor.pos_x + 60 {
        // 至少保留60px可见
        clamped_x = monitor.pos_x + 60 - physical_width;
    }
    if clamped_x > monitor_right - 60 {
        clamped_x = monitor_right - 60;
    }
    if clamped_y < monitor.pos_y {
        clamped_y = monitor.pos_y;
    }
    if clamped_y > monitor_bottom - 60 {
        clamped_y = monitor_bottom - 60;
    }

    (
        clamped_x as f64 / scale_factor,
        clamped_y as f64 / scale_factor,
    )
}

/// 从分离窗口导航主窗口到设置页面
#[tauri::command]
pub async fn navigate_main_window_to_settings(
    app: AppHandle,
    section_id: String,
) -> Result<(), String> {
    // 尝试获取主窗口
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;

    // 聚焦主窗口
    main_window.set_focus().map_err(|e| e.to_string())?;
    main_window.show().map_err(|e| e.to_string())?;
    main_window.unminimize().map_err(|e| e.to_string())?;

    // 向主窗口发送导航事件
    main_window
        .emit(
            "navigate-to-settings",
            serde_json::json!({ "sectionId": section_id }),
        )
        .map_err(|e| format!("发送导航事件失败: {}", e))?;

    log::info!("[NAVIGATION] 已请求主窗口导航到设置页面: {}", section_id);
    Ok(())
}
