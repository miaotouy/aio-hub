// 模块声明
mod commands;
mod events;
mod tray;

// 导入所需的依赖
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tokio_util::sync::CancellationToken;
use tauri_plugin_log::{Target, TargetKind, TimezoneStrategy};
use log::LevelFilter;
use dirs_next::data_dir;

// 导入命令模块
use commands::{
    // 目录清理相关
    analyze_directory_for_cleanup,
    cleanup_items,
    stop_directory_scan,
    stop_directory_cleanup,
    cancel_move_operation,
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
    read_app_data_file_binary,
    read_file_as_base64,
    save_uploaded_file,
    copy_file_to_app_data,
    delete_file_to_trash,
    delete_directory_in_app_data,
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
    end_drag_session,
    // 窗口导航命令
    navigate_main_window_to_settings,
    // 资产管理命令
    get_asset_base_path,
    import_asset_from_path,
    import_asset_from_bytes,
    get_asset_binary,
    read_text_file,
    list_all_assets,
    rebuild_hash_index,
    find_duplicate_files,
    delete_asset,
    save_asset_thumbnail,
    // Lazy loading commands
    list_assets_paginated,
    get_asset_stats,
    rebuild_catalog_index,
    // 资产来源管理命令
    remove_asset_source,
    add_asset_source,
    remove_asset_completely,
    remove_assets_completely,
    // 插件管理命令
    uninstall_plugin,
    install_plugin_from_zip,
    preflight_plugin_zip,
    // Sidecar 插件命令
    execute_sidecar,
    // 状态
    ClipboardMonitorState,
    // 窗口特效命令
    apply_window_effect,
    list_directory_images
};
// 导入全局鼠标监听器
// 条件导入：仅在非 macOS 上导入
#[cfg(not(target_os = "macos"))]
use commands::{window_manager::init_global_mouse_listener, start_drag_session};

// 导入事件处理
use events::handle_window_event;
use tray::{create_system_tray, build_system_tray, remove_system_tray, should_prevent_close};

// 应用状态管理
#[derive(Default)]
pub struct AppState {
    pub minimize_to_tray: Mutex<bool>,
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
    let mut minimize_to_tray = state.minimize_to_tray.lock().map_err(|e| e.to_string())?;
    *minimize_to_tray = enabled;

    // 如果禁用托盘，确保窗口可见
    if !enabled {
        window.show().map_err(|e| e.to_string())?;
    }

    Ok(())
}

// 获取托盘设置命令
#[tauri::command]
fn get_tray_setting(state: tauri::State<AppState>) -> Result<bool, String> {
    let minimize_to_tray = state.minimize_to_tray.lock().map_err(|e| e.to_string())?;
    Ok(*minimize_to_tray)
}

// 退出应用命令
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// 动态设置托盘图标显示/隐藏
#[tauri::command]
fn set_show_tray_icon(app: tauri::AppHandle, show: bool) -> Result<(), String> {
    if show {
        // 创建托盘
        build_system_tray(&app).map_err(|e| e.to_string())?;
    } else {
        // 移除托盘
        remove_system_tray(&app).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// 打印当前窗口列表
fn print_window_list(app_handle: &tauri::AppHandle) {
    let windows = app_handle.webview_windows();
    let window_labels: Vec<String> = windows.keys().map(|k| k.to_string()).collect();
    
    log::info!("========================================");
    log::info!("当前窗口列表 (总数: {})", window_labels.len());
    log::info!("========================================");
    for (index, label) in window_labels.iter().enumerate() {
        log::info!("  [{}] {}", index + 1, label);
    }
    log::info!("========================================");
}

use chrono::Local;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();

    // Manually construct the path to AppData/Roaming/{bundle_id}/logs
    let log_dir = data_dir()
        .map(|p| p.join(&context.config().identifier).join("logs"))
        .expect("Failed to construct log directory path");

    let log_filename = format!("backend-{}", Local::now().format("%Y-%m-%d"));
tauri::Builder::default()
    .plugin(
        tauri_plugin_log::Builder::new()
            .clear_targets() // 清除默认目标
            .targets([
                Target::new(TargetKind::Stdout),
                Target::new(TargetKind::Folder {
                    path: log_dir,
                    file_name: Some(log_filename),
                }),
            ])
            .timezone_strategy(TimezoneStrategy::UseLocal) // 使用本地时区
            .level_for("hyper", LevelFilter::Warn) // 过滤掉 hyper 的大量 INFO 日志
            .build()
        )
        // 插件初始化
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        // 管理状态
        .manage(ClipboardMonitorState::new())
        .manage(commands::native_plugin::NativePluginState::default())
        .manage(commands::directory_janitor::ScanCancellation::new())
        .manage(commands::directory_janitor::CleanupCancellation::new())
        .manage(AppState::default())
        .manage(Arc::new(CancellationToken::new()))
        // 注册命令处理器
        .invoke_handler(tauri::generate_handler![
            greet,
            update_tray_setting,
            get_tray_setting,
            exit_app,
            set_show_tray_icon,
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
            read_app_data_file_binary,
            read_file_as_base64,
            save_uploaded_file,
            copy_file_to_app_data,
            delete_file_to_trash,
            delete_directory_in_app_data,
            open_file_directory,
            validate_file_for_link,
            path_exists,
            get_file_metadata,
            // 目录清理命令
            analyze_directory_for_cleanup,
            cleanup_items,
            stop_directory_scan,
            stop_directory_cleanup,
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
            read_text_file,
            list_all_assets,
            rebuild_hash_index,
            find_duplicate_files,
            delete_asset,
            save_asset_thumbnail,
            // Lazy loading commands
            list_assets_paginated,
            get_asset_stats,
            rebuild_catalog_index,
            // 资产来源管理命令
            remove_asset_source,
            add_asset_source,
            remove_asset_completely,
            remove_assets_completely,
            // 插件管理命令
            uninstall_plugin,
            install_plugin_from_zip,
            preflight_plugin_zip,
            // Sidecar 插件命令
            execute_sidecar,
            // 原生插件命令
            commands::native_plugin::load_native_plugin,
            commands::native_plugin::unload_native_plugin,
            commands::native_plugin::call_native_plugin_method,
            // 窗口特效命令
            apply_window_effect,
            list_directory_images,
            // 基于 rdev 的拖拽会话命令 (仅在非 macOS 上注册)
            #[cfg(not(target_os = "macos"))]
            start_drag_session
        ])
        // 设置应用
        .setup(|app| {
            // 读取配置
            let (show_tray_icon, minimize_to_tray) = {
                let app_data_dir = app.path().app_data_dir()
                    .expect("Failed to get app data dir");
                let settings_path = app_data_dir.join("settings.json");
                
                if settings_path.exists() {
                    if let Ok(contents) = std::fs::read_to_string(&settings_path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                            let show = json.get("showTrayIcon").and_then(|v| v.as_bool()).unwrap_or(true);
                            let minimize = json.get("minimizeToTray").and_then(|v| v.as_bool()).unwrap_or(true);
                            (show, minimize)
                        } else {
                            (true, true) // 解析失败，默认启用
                        }
                    } else {
                        (true, true) // 读取失败，默认启用
                    }
                } else {
                    (true, true) // 文件不存在，默认启用
                }
            };
            
            // 更新应用状态
            if let Some(state) = app.try_state::<AppState>() {
                if let Ok(mut minimize_to_tray_state) = state.minimize_to_tray.lock() {
                    *minimize_to_tray_state = minimize_to_tray;
                }
            }
            
            // 创建主窗口
            let mut win_builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("AIO Hub")
            .inner_size(1280.0, 768.0)
            .min_inner_size(360.0, 112.0);

            // 根据不同平台应用不同的窗口样式
            #[cfg(target_os = "macos")]
            {
                win_builder = win_builder
                    .title_bar_style(tauri::TitleBarStyle::Transparent)
                    .hidden_title(true);
            }

            #[cfg(not(target_os = "macos"))]
            {
                win_builder = win_builder
                    .decorations(false)
                    .transparent(true);
            }

            let main_window = win_builder.build()?;
            
            // 应用保存的窗口配置（如果存在）
            let main_window_clone = main_window.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = apply_window_config(main_window_clone).await {
                    log::error!("[WINDOW_CONFIG] 应用主窗口配置失败: {}", e);
                }
            });

            // 确保窗口显示在任务栏
            main_window
                .set_skip_taskbar(false)
                .expect("Failed to set skip taskbar");

            // 只在配置启用时创建系统托盘
            if show_tray_icon {
                create_system_tray(app)?;
            }

            // 初始化全局鼠标监听器（用于基于 rdev 的拖拽, 仅在非 macOS 上启用）
            #[cfg(not(target_os = "macos"))]
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
                
                // 在关闭前同步保存窗口配置
                if let Err(e) = commands::window_config::save_window_config_sync(window.app_handle(), &window_label) {
                    log::error!("[WINDOW_CONFIG] 保存窗口配置失败: {}", e);
                }

                // 如果关闭的是分离窗口（非主窗口），调用统一的关闭命令
                if window_label != "main" {
                    let app_handle = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = commands::close_detached_window(app_handle, window_label).await {
                            log::error!("Error closing detached window: {}", e);
                        }
                    });
                }
                // 如果是主窗口，处理托盘逻辑
                else if let Some(app_state) = window.app_handle().try_state::<AppState>() {
                    if let Ok(minimize_to_tray) = app_state.minimize_to_tray.lock() {
                        if should_prevent_close(*minimize_to_tray) {
                            api.prevent_close(); // 阻止默认关闭行为

                            let app_handle = window.app_handle();
                            let windows = app_handle.webview_windows();
                            let relevant_window_count = windows.keys().count();

                            // 如果有超过一个窗口（即存在分离窗口），则不允许隐藏，而是聚焦主窗口
                            if relevant_window_count > 1 {
                                let _ = window.show();
                                let _ = window.set_focus();
                            } else {
                                // 否则，安全地隐藏窗口
                                let _ = window.hide();
                            }
                        } else {
                            // 未启用最小化到托盘，发送关闭确认请求到前端
                            api.prevent_close(); // 阻止默认关闭行为
                            let _ = window.emit("request-close-confirmation", ());
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
        .run(context)
        .expect("error while running tauri application");
}
