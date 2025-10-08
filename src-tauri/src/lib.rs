// 模块声明
mod commands;
mod events;
mod tray;

// 导入所需的依赖
use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use std::sync::Mutex;

// 导入命令模块
use commands::{
    ClipboardMonitorState,
    start_clipboard_monitor,
    stop_clipboard_monitor,
    get_clipboard_content_type,
    move_and_link,
    create_links_only,
    process_files_with_regex,
    generate_directory_tree,
    is_directory,
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
        
        // 管理状态
        .manage(ClipboardMonitorState::new())
        .manage(AppState::default())
        
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
            process_files_with_regex,
            generate_directory_tree,
            is_directory,
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
            git_format_log
        ])
        
        // 设置应用
        .setup(|app| {
            // 注册全局快捷键
            let app_handle = app.handle();
            let main_window = app_handle.get_webview_window("main")
                .expect("Failed to get main window");
            
            // 确保窗口显示在任务栏
            main_window.set_skip_taskbar(false)
                .expect("Failed to set skip taskbar");

            // 注册全局快捷键
            app_handle.global_shortcut()
                .register("CmdOrCtrl+Shift+Space")
                .expect("Failed to register global shortcut");
            
            // 创建系统托盘
            create_system_tray(&app_handle)?;
            
            Ok(())
        })
        
        // 窗口事件处理
        .on_window_event(|window, event| {
            // 先处理文件拖放事件
            handle_window_event(window, event);
            
            // 处理窗口关闭事件（托盘功能）
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 获取应用状态
                if let Some(app_state) = window.app_handle().try_state::<AppState>() {
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
