// 模块声明
mod commands;
mod events;
mod tray;

// 导入所需的依赖
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

// 导入命令模块
use commands::{
    ClipboardMonitorState,
    start_clipboard_monitor,
    stop_clipboard_monitor,
    get_clipboard_content_type,
    move_and_link,
    create_links_only,
    cancel_move_operation,
    get_latest_operation_log,
    get_all_operation_logs,
    process_files_with_regex,
    generate_directory_tree,
    is_directory,
    read_file_as_base64,
    // LLM代理相关
    start_llm_proxy,
    stop_llm_proxy,
    get_proxy_status,
    update_proxy_target,
    // Git分析器相关
    git_load_repository,
    git_get_branch_commits,
    git_get_incremental_commits,
    git_load_commits_with_files,
    git_get_commit_detail,
    git_cherry_pick,
    git_revert,
    git_export_commits,
    git_format_log,
    // OCR相关
    native_ocr,
    // 窗口管理相关
    create_tool_window,
    focus_window,
    get_window_position,
    set_window_position,
    ensure_window_visible,
    get_all_tool_windows,
    close_tool_window,
    clear_window_state,
    prepare_drag_indicator,
    finalize_drag_indicator,
    start_drag_session,
    end_drag_session,
    // 配置管理相关
    export_all_configs,
    import_all_configs,
    list_config_files,
};

// 导入事件处理
use events::handle_window_event;
use tray::{create_system_tray, should_prevent_close};

// 应用状态管理
#[derive(Default)]
pub struct AppState {
    pub tray_enabled: Mutex<bool>,
}

// 简单的 greet 命令
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 更新托盘设置命令
#[tauri::command]
fn update_tray_setting(
    state: tauri::State<AppState>,
    window: tauri::Window,
    enabled: bool,
) -> Result<(), String> {
    let mut tray_enabled = state.tray_enabled.lock().map_err(|e| e.to_string())?;
    *tray_enabled = enabled;
    
    // 如果禁用托盘，确保窗口可见
    if !enabled {
        window.show().map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

// 获取托盘设置命令
#[tauri::command]
fn get_tray_setting(state: tauri::State<AppState>) -> Result<bool, String> {
    let tray_enabled = state.tray_enabled.lock().map_err(|e| e.to_string())?;
    Ok(*tray_enabled)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 插件初始化
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        
        // 管理状态
        .manage(ClipboardMonitorState::new())
        .manage(AppState::default())
        .manage(Arc::new(CancellationToken::new()))
        
        // 注册命令处理器
        .invoke_handler(tauri::generate_handler![
            greet,
            update_tray_setting,
            get_tray_setting,
            start_clipboard_monitor,
            stop_clipboard_monitor,
            get_clipboard_content_type,
            move_and_link,
            create_links_only,
            cancel_move_operation,
            get_latest_operation_log,
            get_all_operation_logs,
            process_files_with_regex,
            generate_directory_tree,
            is_directory,
            read_file_as_base64,
            // LLM代理命令
            start_llm_proxy,
            stop_llm_proxy,
            get_proxy_status,
            update_proxy_target,
            // Git分析器命令
            git_load_repository,
            git_get_branch_commits,
            git_get_incremental_commits,
            git_load_commits_with_files,
            git_get_commit_detail,
            git_cherry_pick,
            git_revert,
            git_export_commits,
            git_format_log,
            // OCR命令
            native_ocr,
            // 窗口管理命令
            create_tool_window,
            focus_window,
            get_window_position,
            set_window_position,
            ensure_window_visible,
            get_all_tool_windows,
            close_tool_window,
            clear_window_state,
            prepare_drag_indicator,
            finalize_drag_indicator,
            start_drag_session,
            end_drag_session,
            // 配置管理命令
            export_all_configs,
            import_all_configs,
            list_config_files
        ])
        
        // 设置应用
        .setup(|app| {
            // 预加载拖拽指示器窗口
            let indicator_window = tauri::WebviewWindowBuilder::new(
                app,
                "drag-indicator",
                tauri::WebviewUrl::App("/drag-indicator".into()),
            )
            .title("拖拽指示器")
            .inner_size(1.0, 1.0) // 初始尺寸设为最小，避免闪烁
            .decorations(false)
            .transparent(true)
            .shadow(false) // 移除窗口阴影（实现完全透明效果）
            .resizable(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .visible(false) // 初始时隐藏
            .build()?;
            
            // 强制隐藏，以防窗口状态插件恢复其可见性
            let _ = indicator_window.hide();

            // 注册全局快捷键
            let app_handle = app.handle();
            let main_window = app_handle.get_webview_window("main")
                .expect("Failed to get main window");
            
            // 确保窗口显示在任务栏
            main_window.set_skip_taskbar(false)
                .expect("Failed to set skip taskbar");

            // 注册全局快捷键（如果失败则记录警告但继续运行）
            if let Err(e) = app_handle.global_shortcut()
                .register("CmdOrCtrl+Shift+Space") {
                eprintln!("警告: 无法注册全局快捷键 CmdOrCtrl+Shift+Space: {}", e);
                eprintln!("程序将继续运行，但全局快捷键功能可能不可用");
            }
            
            // 创建系统托盘
            create_system_tray(&app_handle)?;
            
            Ok(())
        })
        
        // 窗口事件处理
        .on_window_event(|window, event| {
            // 先处理文件拖放事件
            handle_window_event(window, event);
            
            // 处理窗口关闭事件（托盘功能和工具窗口）
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let window_label = window.label().to_string();
                
                // 如果关闭的是工具窗口（非主窗口），发送事件通知
                if window_label != "main" {
                    let app_handle = window.app_handle();
                    let _ = app_handle.emit("tool-attached", window_label);
                }
                // 如果是主窗口，处理托盘逻辑
                else if let Some(app_state) = window.app_handle().try_state::<AppState>() {
                    if let Ok(tray_enabled) = app_state.tray_enabled.lock() {
                        if should_prevent_close(*tray_enabled) {
                            // 阻止关闭，改为隐藏
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                }
            }
        })
        
        // 运行应用
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
