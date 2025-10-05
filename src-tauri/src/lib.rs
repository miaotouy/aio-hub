// 模块声明
mod commands;
mod events;

// 导入所需的依赖
use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

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
    git_get_commit_detail,
    git_cherry_pick,
    git_revert,
    git_export_commits,
    git_format_log,
};

// 导入事件处理
use events::handle_window_event;

// 简单的 greet 命令
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
        
        // 注册命令处理器
        .invoke_handler(tauri::generate_handler![
            greet,
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
            
            // 注意：实际的快捷键响应需要在前端或通过事件系统处理
            // 这里只是注册快捷键，具体的显示/隐藏逻辑可以通过事件实现
            
            Ok(())
        })
        
        // 窗口事件处理
        .on_window_event(|window, event| {
            handle_window_event(window, event);
        })
        
        // 运行应用
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
