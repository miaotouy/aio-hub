// 模块声明
mod commands;
mod events;
mod knowledge;
mod tray;
mod utils;

// 导入所需的依赖
use dirs_next::data_dir;
use log::LevelFilter;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{image::Image, Emitter, Manager};
use tauri_plugin_log::{Target, TargetKind, TimezoneStrategy};
use tokio_util::sync::CancellationToken;

// 导入命令模块
use commands::{
    // 资产目录内存状态
    AssetCatalog,
    add_asset_source,
    // 目录清理相关
    analyze_directory_for_cleanup,
    append_file_force,
    apply_window_config,
    // 窗口特效命令
    apply_window_effect,
    batch_delete_agent_assets,
    // 新统一分离系统命令
    begin_detach_session,
    cancel_move_operation,
    // 视频处理命令
    check_ffmpeg_availability,
    get_media_metadata,
    process_media,
    kill_ffmpeg_process,
    get_full_media_info,
    cleanup_items,
    clear_all_window_configs,
    close_detached_window, // 新增：统一的关闭命令
    copy_directory_in_app_data,
    copy_file_to_app_data,
    create_dir_force,
    create_links_only,
    // 窗口管理相关
    create_tool_window,
    delete_agent_asset,
    delete_all_agent_assets,
    delete_asset,
    delete_directory_in_app_data,
    delete_file_to_trash,
    delete_window_config,
    end_drag_session,
    ensure_window_visible,
    // Sidecar 插件命令
    execute_sidecar,
    // 配置管理相关
    export_all_configs_to_zip,
    finalize_detach_session,
    find_asset_by_hash,
    find_duplicate_files,
    focus_window,
    generate_directory_tree,
    get_agent_asset_path,
    get_all_detached_windows,
    get_all_operation_logs,
    get_image_dimensions,
    // 资产管理命令
    get_asset_base_path,
    get_asset_base64,
    get_asset_binary,
    get_asset_by_id,
    get_asset_stats,
    get_clipboard_content_type,
    get_file_metadata,
    get_file_mime_type,
    get_inspector_status,
    get_latest_operation_log,
    get_local_ips,
    get_saved_window_labels,
    git_cancel_load,
    git_cherry_pick,
    git_export_commits,
    git_format_log,
    git_get_branch_commits,
    git_get_branches,
    git_get_commit_detail,
    git_get_incremental_commits,
    git_load_commits_with_files,
    git_load_incremental_stream,
    // 内容查重相关
    delete_duplicate_files,
    read_file_content_for_diff,
    scan_content_duplicates,
    stop_dedup_scan,
    // Git分析器相关
    git_load_repository,
    git_load_repository_stream,
    git_revert,
    git_update_commit_message,
    import_all_configs_from_zip,
    import_asset_from_bytes,
    import_asset_from_path,
    install_plugin_from_zip,
    is_directory,
    list_agent_assets,
    list_all_assets,
    list_directory,
    // Lazy loading commands
    list_assets_paginated,
    list_config_files,
    list_directory_images,
    move_and_link,
    // OCR相关
    native_ocr,
    // 窗口导航命令
    navigate_main_window_to_settings,
    open_file_directory,
    open_path_force,
    path_exists,
    preflight_plugin_zip,
    process_files_with_regex,
    read_agent_asset_binary,
    read_app_data_file_binary,
    read_file_as_base64,
    read_file_binary,
    read_file_binary_raw,
    read_text_file,
    read_text_file_force,
    rebuild_catalog_index,
    rebuild_hash_index,
    remove_asset_completely,
    // 资产来源管理命令
    remove_asset_source,
    remove_assets_completely,
    // Agent 资产管理命令
    save_agent_asset,
    save_asset_thumbnail,
    save_uploaded_file,
    // 窗口配置管理相关
    save_window_config,
    // LLM 代理命令
    start_llm_proxy_server,
    // LLM 搜索命令
    search_llm_data,
    search_media_generator_data,
    set_window_position,
    start_clipboard_monitor,
    // LLM检查器相关
    start_llm_inspector,
    stop_clipboard_monitor,
    stop_directory_cleanup,
    stop_directory_scan,
    stop_llm_inspector,
    // 插件管理命令
    uninstall_plugin,
    update_asset_derived_data,
    update_detach_session_position,
    update_detach_session_status,
    update_inspector_target,
    validate_file_for_link,
    validate_regex_pattern,
    write_file_force,
    write_text_file_force,
    // 状态
    ClipboardMonitorState,
};
// 导入全局鼠标监听器
// 条件导入：仅在非 macOS 上导入
#[cfg(not(target_os = "macos"))]
use commands::{start_drag_session, window_manager::init_global_mouse_listener};

// 导入事件处理
use events::handle_window_event;
use tray::{build_system_tray, create_system_tray, remove_system_tray, should_prevent_close};

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

#[tauri::command]
async fn get_app_config_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(get_app_data_dir(app.config()).to_string_lossy().to_string())
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

use chrono::{Local, Utc};
use chrono_tz::Tz;

/// 获取应用数据目录，支持便携模式
pub fn get_app_data_dir(config: &tauri::Config) -> PathBuf {
    // 优先检查显式设置的数据目录
    if let Ok(data_dir) = std::env::var("AIO_PORTABLE_DATA_DIR") {
        let path = PathBuf::from(data_dir);
        if !path.exists() {
            let _ = std::fs::create_dir_all(&path);
        }
        return path;
    }

    // 兼容旧的便携模式检查逻辑
    if let Ok(portable_mode) = std::env::var("AIO_PORTABLE_MODE") {
        if portable_mode == "1" {
            if let Ok(exe_path) = std::env::current_exe() {
                if let Some(exe_dir) = exe_path.parent() {
                    let portable_dir = exe_dir.join("data");
                    if !portable_dir.exists() {
                        let _ = std::fs::create_dir_all(&portable_dir);
                    }
                    return portable_dir;
                }
            }
        }
    }

    // 回退到标准目录
    data_dir()
        .map(|p| p.join(&config.identifier))
        .expect("Failed to get app data dir")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 解决 Linux 下 WebKitGTK 渲染崩溃问题 (EGL_BAD_PARAMETER)
    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    let context = tauri::generate_context!();

    // 读取配置以获取时区
    let (show_tray_icon, minimize_to_tray, timezone_str) = {
        let app_data_dir = get_app_data_dir(context.config());
        let settings_path = app_data_dir.join("settings.json");

        if settings_path.exists() {
            if let Ok(contents) = std::fs::read_to_string(&settings_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                    let show = json
                        .get("showTrayIcon")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);
                    let minimize = json
                        .get("minimizeToTray")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);
                    let tz = json
                        .get("timezone")
                        .and_then(|v| v.as_str())
                        .unwrap_or("auto")
                        .to_string();
                    (show, minimize, tz)
                } else {
                    (true, true, "auto".to_string())
                }
            } else {
                (true, true, "auto".to_string())
            }
        } else {
            (true, true, "auto".to_string())
        }
    };

    // 解析时区并计算偏移量
    let (timezone_strategy, now_formatted, date_filename) = {
        let now_utc = Utc::now();
        if timezone_str != "auto" {
            if let Ok(tz) = timezone_str.parse::<Tz>() {
                let now_tz = now_utc.with_timezone(&tz);
                (
                    TimezoneStrategy::UseLocal,
                    now_tz.format("%Y-%m-%d %H:%M:%S").to_string(),
                    now_tz.format("%Y-%m-%d").to_string(),
                )
            } else {
                (
                    TimezoneStrategy::UseLocal,
                    Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                    Local::now().format("%Y-%m-%d").to_string(),
                )
            }
        } else {
            (
                TimezoneStrategy::UseLocal,
                Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                Local::now().format("%Y-%m-%d").to_string(),
            )
        }
    };

    // Manually construct the path to AppData/Roaming/{bundle_id}/logs
    let log_dir = get_app_data_dir(context.config()).join("logs");

    let log_filename = format!("backend-{}", date_filename);
    tauri::Builder::<tauri::Wry>::default()
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
                .timezone_strategy(timezone_strategy)
                .level_for("hyper", LevelFilter::Warn) // 过滤掉 hyper 的大量 INFO 日志
                .level_for("hnsw_rs", LevelFilter::Info) // 过滤掉 HNSW 构图时的 TRACE 日志
                .build(),
        )
        // 插件初始化
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(match () {
            #[cfg(not(debug_assertions))]
            _ if std::env::var("AIO_PORTABLE_MODE").is_ok() => tauri_plugin_opener::init(),
            #[cfg(not(debug_assertions))]
            _ => tauri_plugin_single_instance::init(|app, args, _cwd| {
                // 处理 Windows/Linux 上的 Deep Link
                #[cfg(desktop)]
                {
                    for arg in &args {
                        if arg.starts_with("aiohub://") {
                            let _ = app.emit("deep-link://opened", vec![arg.clone()]);
                        }
                    }
                }

                let _ = app.get_webview_window("main").map(|w| {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                });
            }),
            #[cfg(debug_assertions)]
            _ => tauri_plugin_opener::init(),
        })
        // 管理状态
        .manage(ClipboardMonitorState::new())
        .manage(commands::native_plugin::NativePluginState::default())
        .manage(commands::directory_janitor::ScanCancellation::new())
        .manage(commands::directory_janitor::CleanupCancellation::new())
        .manage(commands::content_deduplicator::DedupScanCancellation::new())
        .manage(AppState::default())
        .manage(commands::ffmpeg_processor::FFmpegState::default())
        .manage(AssetCatalog::new())
        .manage(Arc::new(CancellationToken::new()))
        .manage(knowledge::KnowledgeState::new())
        // 注册命令处理器
        .invoke_handler(tauri::generate_handler![
            greet,
            get_local_ips,
            get_app_config_dir,
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
            get_image_dimensions,
            process_files_with_regex,
            validate_regex_pattern,
            generate_directory_tree,
            is_directory,
            list_directory,
            read_file_binary,
            read_file_binary_raw,
            read_app_data_file_binary,
            read_file_as_base64,
            save_uploaded_file,
            copy_file_to_app_data,
            copy_directory_in_app_data,
            delete_file_to_trash,
            delete_directory_in_app_data,
            write_file_force,
            write_text_file_force,
            append_file_force,
            create_dir_force,
            read_text_file_force,
            open_path_force,
            open_file_directory,
            validate_file_for_link,
            path_exists,
            get_file_metadata,
            get_file_mime_type,
            // 目录清理命令
            analyze_directory_for_cleanup,
            cleanup_items,
            stop_directory_scan,
            stop_directory_cleanup,
            // 内容查重命令
            scan_content_duplicates,
            stop_dedup_scan,
            read_file_content_for_diff,
            delete_duplicate_files,
            // LLM检查器命令
            start_llm_inspector,
            stop_llm_inspector,
            get_inspector_status,
            update_inspector_target,
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
            git_update_commit_message,
            git_cancel_load,
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
            get_asset_base64,
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
            find_asset_by_hash,
            update_asset_derived_data,
            get_asset_by_id,
            // Agent 资产管理命令
            save_agent_asset,
            read_agent_asset_binary,
            delete_agent_asset,
            batch_delete_agent_assets,
            list_agent_assets,
            delete_all_agent_assets,
            get_agent_asset_path,
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
            // 视频处理命令
            check_ffmpeg_availability,
            process_media,
            kill_ffmpeg_process,
            get_media_metadata,
            get_full_media_info,
            // LLM 代理命令
            start_llm_proxy_server,
            // LLM 搜索命令
            search_llm_data,
            search_media_generator_data,
            // 基于 rdev 的拖拽会话命令 (仅在非 macOS 上注册)
            #[cfg(not(target_os = "macos"))]
            start_drag_session,
            // 知识库命令
            knowledge::kb_initialize,
            knowledge::kb_batch_import_files,
            knowledge::kb_batch_upsert_entries,
            knowledge::kb_check_vector_coverage,
            knowledge::kb_get_library_stats,
            knowledge::kb_get_tag_pool_stats,
            knowledge::kb_load_model_vectors,
            knowledge::kb_update_entry_vector,
            knowledge::kb_clear_legacy_vectors,
            knowledge::kb_clear_all_other_vectors,
            knowledge::kb_get_embedding_cache,
            knowledge::kb_set_embedding_cache,
            knowledge::kb_clear_embedding_cache,
            knowledge::kb_search,
            knowledge::kb_upsert_entry,
            knowledge::kb_delete_entry,
            knowledge::kb_batch_delete_entries,
            knowledge::kb_save_base_meta,
            knowledge::kb_warmup,
            knowledge::kb_list_bases,
            knowledge::kb_load_base_meta,
            knowledge::kb_load_entry,
            knowledge::kb_get_entries,
            knowledge::kb_list_entry_ids,
            knowledge::kb_list_engines,
            knowledge::kb_get_missing_tags,
            knowledge::kb_sync_tag_vectors,
            knowledge::kb_rebuild_tag_pool_index,
            knowledge::kb_list_all_tags,
            knowledge::kb_list_tag_pool_models,
            knowledge::kb_clear_tag_pool,
            knowledge::kb_clear_other_tag_pools,
            knowledge::kb_flush_all_tag_pools,
            knowledge::kb_clone_base,
            knowledge::kb_export_base,
            knowledge::monitor::kb_monitor_heartbeat
        ])
        // 设置应用
        .setup(move |app| {
            // 动态扩展文件系统权限 (Scope)，确保便携模式下前端插件也能访问数据目录
            let app_data_dir = get_app_data_dir(app.config());
            #[cfg(desktop)]
            {
                use tauri_plugin_fs::FsExt;
                let _ = app.fs_scope().allow_directory(&app_data_dir, true);
                log::info!("[SCOPE] 已允许访问数据目录 (fs): {:?}", app_data_dir);
            }

            // 打印启动元数据
            let package_info = app.package_info();
            log::info!("========================================");
            log::info!("🚀 应用启动: {}", package_info.name);
            log::info!("📦 版本: v{}", package_info.version);
            log::info!(
                "🖥️  系统: {} ({})",
                std::env::consts::OS,
                std::env::consts::ARCH
            );
            log::info!("⏰ 时间: {}", now_formatted);
            log::info!("========================================");
            // 初始化资产目录内存索引
            if let Some(catalog) = app.try_state::<AssetCatalog>() {
                if let Err(e) = catalog.initialize(app.app_handle()) {
                    log::error!("[AssetCatalog] 初始化失败: {}", e);
                }
            }

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

            // 开发模式下使用特殊的窗口图标
            #[cfg(debug_assertions)]
            {
                let icon_bytes = include_bytes!("../icons/icon-dev.png");
                if let Ok(icon) = Image::from_bytes(icon_bytes) {
                    win_builder = win_builder.icon(icon).expect("Failed to set window icon");
                }
            }

            // 根据不同平台应用不同的窗口样式
            #[cfg(target_os = "macos")]
            {
                win_builder = win_builder
                    .title_bar_style(tauri::TitleBarStyle::Transparent)
                    .hidden_title(true);
            }

            #[cfg(not(target_os = "macos"))]
            {
                win_builder = win_builder.decorations(false).transparent(true);
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
                if let Err(e) = commands::window_config::save_window_config_sync(
                    window.app_handle(),
                    &window_label,
                ) {
                    log::error!("[WINDOW_CONFIG] 保存窗口配置失败: {}", e);
                }

                // 如果关闭的是分离窗口（非主窗口），调用统一的关闭命令
                if window_label != "main" {
                    let app_handle = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) =
                            commands::close_detached_window(app_handle, window_label).await
                        {
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
