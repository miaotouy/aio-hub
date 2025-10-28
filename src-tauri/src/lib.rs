// 模块声明
mod commands;
mod events;
mod tray;

// 导入所需的依赖
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tokio_util::sync::CancellationToken;

// 导入命令模块
use commands::{
    // 目录清理相关
    analyze_directory_for_cleanup,
    cancel_move_operation,
    cleanup_items,
    create_links_only,
    // 窗口管理相关
    create_tool_window,
    ensure_window_visible,
    // 窗口配置管理相关
    save_window_config,
    apply_window_config,
    delete_window_config,
    clear_all_window_configs,
    get_saved_window_labels,
    // 配置管理相关
    export_all_configs_to_zip,
    import_all_configs_from_zip,
    focus_window,
    generate_directory_tree,
    get_all_operation_logs,
    get_clipboard_content_type,
    get_latest_operation_log,
    get_proxy_status,
    git_cherry_pick,
    git_export_commits,
    git_format_log,
    git_get_branch_commits,
    git_get_branches,
    git_get_commit_detail,
    git_get_incremental_commits,
    git_load_incremental_stream,
    git_load_commits_with_files,
    // Git分析器相关
    git_load_repository,
    git_load_repository_stream,
    git_revert,
    is_directory,
    list_config_files,
    move_and_link,
    // OCR相关
    native_ocr,
    process_files_with_regex,
    validate_regex_pattern,
    read_file_binary,
    read_file_as_base64,
    save_uploaded_file,
    copy_file_to_app_data,
    delete_file_to_trash,
    open_file_directory,
    path_exists,
    get_file_metadata,
    set_window_position,
    start_clipboard_monitor,
    // LLM代理相关
    start_llm_proxy,
    stop_clipboard_monitor,
    stop_llm_proxy,
    update_proxy_target,
    validate_file_for_link,
    // 新统一分离系统命令
    begin_detach_session,
    update_detach_session_position,
    update_detach_session_status,
    finalize_detach_session,
    get_all_detached_windows,
    close_detached_window, // 新增：统一的关闭命令
    // 基于 rdev 的拖拽会话命令
    start_drag_session,
    end_drag_session,
    // 窗口导航命令
    navigate_main_window_to_settings,
    // 资产管理命令
    get_asset_base_path,
    import_asset_from_path,
    import_asset_from_bytes,
    get_asset_binary,
    read_text_file,
    ClipboardMonitorState,
};

// 导入全局鼠标监听器
use commands::window_manager::init_global_mouse_listener;

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

// 打印当前窗口列表
fn print_window_list(app_handle: &tauri::AppHandle) {
    let windows = app_handle.webview_windows();
    let window_labels: Vec<String> = windows.keys().map(|k| k.to_string()).collect();
    
    println!("========================================");
    println!("当前窗口列表 (总数: {})", window_labels.len());
    println!("========================================");
    for (index, label) in window_labels.iter().enumerate() {
        println!("  [{}] {}", index + 1, label);
    }
    println!("========================================");
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
        .plugin(tauri_plugin_os::init())
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
            validate_regex_pattern,
            generate_directory_tree,
            is_directory,
            read_file_binary,
            read_file_as_base64,
            save_uploaded_file,
            copy_file_to_app_data,
            delete_file_to_trash,
            open_file_directory,
            validate_file_for_link,
            path_exists,
            get_file_metadata,
            // 目录清理命令
            analyze_directory_for_cleanup,
            cleanup_items,
            // LLM代理命令
            start_llm_proxy,
            stop_llm_proxy,
            get_proxy_status,
            update_proxy_target,
            // Git分析器命令
            git_load_repository,
            git_load_repository_stream,
            git_get_branch_commits,
            git_get_branches,
            git_get_incremental_commits,
            git_load_incremental_stream,
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
            set_window_position,
            ensure_window_visible,
            // 窗口配置管理命令
            save_window_config,
            apply_window_config,
            delete_window_config,
            clear_all_window_configs,
            get_saved_window_labels,
            // 新统一分离命令
            begin_detach_session,
            update_detach_session_position,
            update_detach_session_status,
            finalize_detach_session,
            get_all_detached_windows,
            close_detached_window,
            // 基于 rdev 的拖拽会话命令
            start_drag_session,
            end_drag_session,
            // 窗口导航命令
            navigate_main_window_to_settings,
            // 配置管理命令
            list_config_files,
            export_all_configs_to_zip,
            import_all_configs_from_zip,
            // 资产管理命令
            get_asset_base_path,
            import_asset_from_path,
            import_asset_from_bytes,
            get_asset_binary,
            read_text_file
        ])
        // 设置应用
        .setup(|app| {
            
            // 创建主窗口
            let mut win_builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("AIO Hub")
            .inner_size(1280.0, 768.0)
            .min_inner_size(360.0, 112.0)
            .transparent(true);

            // 根据不同平台应用不同的窗口样式
            #[cfg(target_os = "macos")]
            {
                win_builder = win_builder
                    .title_bar_style(tauri::TitleBarStyle::Transparent)
                    .hidden_title(true);
            }

            #[cfg(not(target_os = "macos"))]
            {
                win_builder = win_builder.decorations(false);
            }

            let main_window = win_builder.build()?;
            
            // 应用保存的窗口配置（如果存在）
            let main_window_clone = main_window.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = apply_window_config(main_window_clone).await {
                    eprintln!("[WINDOW_CONFIG] 应用主窗口配置失败: {}", e);
                }
            });
            
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

            // 确保窗口显示在任务栏
            main_window
                .set_skip_taskbar(false)
                .expect("Failed to set skip taskbar");

            // 创建系统托盘
            create_system_tray(&app_handle)?;

            // 初始化全局鼠标监听器（用于基于 rdev 的拖拽）
            init_global_mouse_listener();

            Ok(())
        })
        // 窗口事件处理
        .on_window_event(|window, event| {
            // 先处理文件拖放事件
            handle_window_event(window, event);

            // 处理窗口关闭事件（托盘功能和工具窗口）
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let window_label = window.label().to_string();
                
                // 在关闭前同步保存窗口配置（排除拖拽指示器）
                if !window_label.starts_with("drag-indicator") {
                    if let Err(e) = commands::window_config::save_window_config_sync(window.app_handle(), &window_label) {
                        eprintln!("[WINDOW_CONFIG] 保存窗口配置失败: {}", e);
                    }
                }

                // 如果关闭的是分离窗口（非主窗口），调用统一的关闭命令
                if window_label != "main" && !window_label.starts_with("drag-indicator") {
                    let app_handle = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = commands::close_detached_window(app_handle, window_label).await {
                            eprintln!("Error closing detached window: {}", e);
                        }
                    });
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

            // 监听窗口销毁事件，打印窗口列表
            if let tauri::WindowEvent::Destroyed = event {
                print_window_list(window.app_handle());
            }
        })
        // 运行应用
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
