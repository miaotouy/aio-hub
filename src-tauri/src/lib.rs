// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// 模块声明
mod commands;
mod events;
mod frontend_monitor;
mod knowledge;
mod recall;
mod tray;
mod utils;
mod web_distillery;
pub mod webkit_check;

use chrono::{Local, Utc};
use chrono_tz::Tz;
use log::LevelFilter;
use std::collections::HashMap;
use std::sync::Arc;
#[cfg(debug_assertions)]
use tauri::image::Image;
#[cfg(target_os = "linux")]
use tauri::Listener;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_log::{Target, TargetKind, TimezoneStrategy};
use tokio_util::sync::CancellationToken;

pub use utils::get_app_data_dir;

// 导入命令模块
use commands::{
    apply_window_effect, AppState, AssetCatalog, ClipboardMonitorState, SidecarPluginManager,
};
// 导入全局鼠标监听器
// 条件导入：仅在非 macOS 上导入
#[cfg(not(target_os = "macos"))]
use commands::window_manager::init_global_mouse_listener;

// 导入事件处理
use events::handle_global_window_event;
use tray::create_system_tray;

struct StartupConfig {
    show_tray_icon: bool,
    minimize_to_tray: bool,
    timezone_str: String,
    window_effects_config: (bool, String, bool),
    main_window_config: Option<commands::window_config::WindowConfig>,
    disable_drag_drop: bool,
}

fn load_startup_config(config: &tauri::Config) -> StartupConfig {
    let app_data_dir = get_app_data_dir(config);
    let settings_path = app_data_dir.join("app-settings").join("settings.json");

    let mut show_tray_icon = true;
    let mut minimize_to_tray = true;
    let mut timezone_str = "auto".to_string();
    let mut enable_effects = false;
    let mut effect_type = "none".to_string();
    let mut show_shadow = true;
    let mut disable_drag_drop = false;

    if settings_path.exists() {
        if let Ok(contents) = std::fs::read_to_string(&settings_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                show_tray_icon = json
                    .get("showTrayIcon")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                minimize_to_tray = json
                    .get("minimizeToTray")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                timezone_str = json
                    .get("timezone")
                    .and_then(|v| v.as_str())
                    .unwrap_or("auto")
                    .to_string();

                // 读取外观设置
                if let Some(appearance) = json.get("appearance") {
                    enable_effects = appearance
                        .get("enableWindowEffects")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    effect_type = appearance
                        .get("windowEffect")
                        .and_then(|v| v.as_str())
                        .unwrap_or("none")
                        .to_string();
                    show_shadow = appearance
                        .get("showWindowShadow")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);
                }

                // 读取拖放兼容模式设置。false 表示使用 Tauri 路径优先模式。
                disable_drag_drop = json
                    .get("disableTauriDragDropHandler")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
            }
        }
    }

    // 同步读取主窗口配置，避免启动时窗口位置闪烁
    let main_window_config = {
        let config_path = app_data_dir.join("window-configs.json");
        if config_path.exists() {
            std::fs::read_to_string(&config_path)
                .ok()
                .and_then(|contents| {
                    serde_json::from_str::<HashMap<String, commands::window_config::WindowConfig>>(
                        &contents,
                    )
                    .ok()
                })
                .and_then(|configs| configs.get("main").cloned())
        } else {
            None
        }
    };

    StartupConfig {
        show_tray_icon,
        minimize_to_tray,
        timezone_str,
        window_effects_config: (enable_effects, effect_type, show_shadow),
        main_window_config,
        disable_drag_drop,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 注意：Linux WebKitGTK 环境变量已在 main.rs 中通过智能检测设置
    // 不再在此处重复设置 WEBKIT_DISABLE_DMABUF_RENDERER

    let context = tauri::generate_context!();

    // 读取配置以获取时区、窗口特效和窗口位置
    let startup_config = load_startup_config(context.config());
    let StartupConfig {
        show_tray_icon,
        minimize_to_tray,
        timezone_str,
        window_effects_config,
        main_window_config,
        disable_drag_drop,
    } = startup_config;
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
    let mut builder = tauri::Builder::<tauri::Wry>::default();

    builder = builder
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    #[cfg(not(debug_assertions))]
    let mut builder = builder;
    #[cfg(not(debug_assertions))]
    {
        if std::env::var("AIO_PORTABLE_MODE").is_err() {
            builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
                log::info!("[SingleInstance] 收到新实例请求, args: {:?}", args);

                #[derive(Clone, serde::Serialize)]
                struct SingleInstancePayload {
                    args: Vec<String>,
                    cwd: String,
                }
                let _ = app.emit("single-instance", SingleInstancePayload { args, cwd });

                let _ = app.get_webview_window("main").map(|w| {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                });
            }));
        }
    }

    let builder = builder
        // 管理状态
        .manage(ClipboardMonitorState::new())
        .manage(commands::native_plugin::NativePluginState::default())
        .manage(commands::directory_janitor::ScanCancellation::new())
        .manage(commands::directory_janitor::CleanupCancellation::new())
        .manage(commands::dir_search::DirSearchCancellation::new())
        .manage(commands::content_deduplicator::DedupScanCancellation::new())
        .manage(commands::llmchat_search::LlmChatSearchCancellation::new())
        .manage(AppState::default())
        .manage(commands::ffmpeg_processor::FFmpegState::default())
        .manage(AssetCatalog::new())
        .manage(Arc::new(CancellationToken::new()))
        .manage(recall::RecallState::new())
        .manage(commands::system_pulse::PulseState::default())
        .manage(SidecarPluginManager::default())
        .manage(frontend_monitor::FrontendMonitorState::default())
        .on_page_load(frontend_monitor::record_page_load);

    // 注册命令处理器
    let builder = commands::register_commands(builder);

    builder
        // 设置应用
        .setup(move |app| {
            // 在 Windows 上注册 Deep Link 协议关联
            #[cfg(windows)]
            {
                let _ = app.deep_link().register("aiohub");
            }

            // 监听 Deep Link 打开事件 (主要针对 macOS/iOS/Android)
            let handle = app.app_handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                log::info!("[DeepLink] on_open_url 捕获: {:?}", urls);
                let _ = handle.emit("deep-link://opened", urls);
            });

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
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
            .min_inner_size(360.0, 112.0);

            if disable_drag_drop {
                win_builder = win_builder.disable_drag_drop_handler();
            }
            // 始终隐藏创建主窗口，由前端 mount 后调用 show（避免白屏闪烁）
            win_builder = win_builder.visible(false);

            // 如果有保存的窗口配置，直接在创建时应用尺寸和最大化状态
            if let Some(ref config) = main_window_config {
                win_builder = win_builder.inner_size(config.width, config.height);
                if config.maximized {
                    win_builder = win_builder.maximized(true);
                }
            } else {
                win_builder = win_builder.inner_size(1280.0, 768.0);
            }

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
            frontend_monitor::start_frontend_monitor(app.app_handle().clone());

            // 如果有保存的配置，用物理坐标精确设置位置（窗口仍隐藏，由前端 show）
            if let Some(ref config) = main_window_config {
                use tauri::PhysicalPosition;
                let _ = main_window.set_position(PhysicalPosition::new(config.x, config.y));
            }

            // 在启动时应用窗口特效和阴影，避免前端加载延迟导致的闪烁
            let (enable_effects, effect_type, show_shadow) = window_effects_config;
            if enable_effects && effect_type != "none" {
                let window_clone = main_window.as_ref().window().clone();
                let effect_clone = effect_type.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = apply_window_effect(window_clone, &effect_clone).await {
                        log::error!("[WINDOW_EFFECT] 启动时应用特效失败: {}", e);
                    }
                });
            }

            // 应用阴影设置
            if let Err(e) = main_window.set_shadow(show_shadow) {
                log::error!("[WINDOW_SHADOW] 启动时设置阴影失败: {}", e);
            }


            // 确保窗口显示在任务栏
            main_window
                .set_skip_taskbar(false)
                .expect("Failed to set skip taskbar");

            // Linux 运行时白屏检测：如果前端 15 秒内未发送 ready 信号，注入诊断提示
            #[cfg(target_os = "linux")]
            {
                let app_handle_for_watchdog = app.app_handle().clone();
                let frontend_ready = Arc::new(std::sync::atomic::AtomicBool::new(false));
                let frontend_ready_clone = frontend_ready.clone();

                // 监听前端 ready 事件
                let app_handle_listen = app.app_handle().clone();
                app_handle_listen.listen("frontend-ready", move |_| {
                    frontend_ready_clone.store(true, std::sync::atomic::Ordering::SeqCst);
                    log::info!("[WebKit 监控] 前端已就绪，白屏检测通过");
                });

                // 启动超时检测任务
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(15)).await;

                    if !frontend_ready.load(std::sync::atomic::Ordering::SeqCst) {
                        log::warn!("[WebKit 监控] 前端 15 秒内未响应，疑似白屏");

                        // 尝试向主窗口注入诊断提示
                        if let Some(window) = app_handle_for_watchdog.get_webview_window("main") {
                            let diagnostic_js = r#"
                                (function() {
                                    if (document.getElementById('webkit-diagnostic-overlay')) return;
                                    var overlay = document.createElement('div');
                                    overlay.id = 'webkit-diagnostic-overlay';
                                    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:999999;font-family:system-ui,sans-serif;padding:40px;text-align:center;';
                                    overlay.innerHTML = '<h2 style="color:#f56c6c;margin-bottom:16px;">⚠️ 界面加载超时</h2>'
                                        + '<p style="color:#ccc;max-width:500px;line-height:1.6;">AIO Hub 的前端界面未能在预期时间内加载完成。这通常是由于 WebKitGTK 兼容性问题导致的。</p>'
                                        + '<div style="background:#1a1a2e;border-radius:8px;padding:16px;margin:20px 0;text-align:left;max-width:500px;width:100%;">'
                                        + '<p style="color:#909399;font-size:12px;margin:0 0 8px;">建议尝试：</p>'
                                        + '<code style="color:#67c23a;font-size:13px;display:block;margin:4px 0;">WEBKIT_DISABLE_DMABUF_RENDERER=1 ./aio-hub</code>'
                                        + '<code style="color:#67c23a;font-size:13px;display:block;margin:4px 0;">WEBKIT_DISABLE_COMPOSITING_MODE=1 ./aio-hub</code>'
                                        + '<code style="color:#67c23a;font-size:13px;display:block;margin:4px 0;">./aio-hub --diagnose</code>'
                                        + '</div>'
                                        + '<p style="color:#909399;font-size:12px;">如需帮助，请运行 <code style="color:#409eff;">--diagnose</code> 并将输出附在 GitHub Issue 中</p>'
                                        + '<button onclick="this.parentElement.remove()" style="margin-top:16px;background:#409eff;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:14px;">关闭提示</button>';
                                    document.body.appendChild(overlay);
                                })();
                            "#;
                            let _ = window.eval(diagnostic_js);
                        }
                    }
                });
            }

            // 只在配置启用时创建系统托盘
            if show_tray_icon {
                create_system_tray(app)?;
            }

            // 初始化全局鼠标监听器（用于基于 rdev 的拖拽, 仅在非 macOS 上启用）
            #[cfg(not(target_os = "macos"))]
            init_global_mouse_listener();

            // 启动时清理过期临时文件（超过 24 小时）
            commands::sidecar_plugin_manager::cleanup_expired_temp_files(app.app_handle());

            Ok(())
        })
        // 窗口事件处理
        .on_window_event(handle_global_window_event)
        // 运行应用
        .run(context)
        .expect("error while running tauri application");
}
