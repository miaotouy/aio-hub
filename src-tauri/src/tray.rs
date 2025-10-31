use tauri::{
    App, AppHandle, Manager,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    image::Image,
};
use crate::commands::window_config;

// 托盘 ID 常量
const TRAY_ID: &str = "main-tray";

// 创建系统托盘（用于应用启动时）
pub fn create_system_tray(app: &App) -> tauri::Result<()> {
    build_system_tray(app.handle())
}

// 动态构建系统托盘
pub fn build_system_tray(app_handle: &AppHandle) -> tauri::Result<()> {
    // 检查托盘是否已存在
    if app_handle.tray_by_id(TRAY_ID).is_some() {
        return Ok(()); // 已存在，不重复创建
    }
    
    // 创建托盘菜单
    let menu = Menu::with_items(
        app_handle,
        &[
            &MenuItem::with_id(app_handle, "show", "显示主窗口", true, None::<&str>)?,
            &MenuItem::with_id(app_handle, "hide", "隐藏主窗口", true, None::<&str>)?,
            &MenuItem::with_id(app_handle, "clear_window_configs", "清除窗口配置", true, None::<&str>)?,
            &MenuItem::with_id(app_handle, "quit", "退出", true, None::<&str>)?,
        ],
    )?;

    // 加载托盘图标
    let icon_bytes = include_bytes!("../icons/icon.png");
    let icon = Image::from_bytes(icon_bytes)
        .expect("Failed to load tray icon");
    
    // 创建托盘图标（带 ID）
    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .menu(&menu)
        .tooltip("AIO Hub")
        .on_menu_event(move |app_handle, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "hide" => {
                    if let Some(main_window) = app_handle.get_webview_window("main") {
                        let windows = app_handle.webview_windows();
                        let relevant_window_count = windows.keys().count();
                        if relevant_window_count > 1 {
                            let _ = main_window.show();
                            let _ = main_window.set_focus();
                        } else {
                            let _ = main_window.hide();
                        }
                    }
                }
                "clear_window_configs" => {
                    // 使用同步版本的清除函数
                    match window_config::clear_all_configs_sync(app_handle) {
                        Ok(_) => println!("[TRAY] 已通过托盘菜单清除所有窗口配置"),
                        Err(e) => eprintln!("[TRAY] 清除窗口配置失败: {}", e),
                    }
                }
                "quit" => {
                    app_handle.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            match event {
                TrayIconEvent::Click {
                    button,
                    button_state,
                    ..
                } => {
                    // 左键单击显示/隐藏窗口
                    if button == MouseButton::Left && button_state == MouseButtonState::Up {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let windows = app.webview_windows();
                                let relevant_window_count = windows.keys().count();
                                if relevant_window_count > 1 {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                } else {
                                    let _ = window.hide();
                                }
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                }
                _ => {}
            }
        })
        .build(app_handle)?;

    Ok(())
}

// 动态移除系统托盘
pub fn remove_system_tray(app_handle: &AppHandle) -> tauri::Result<()> {
    // remove_tray_by_id 会处理托盘不存在的情况，所以可以直接调用
    app_handle.remove_tray_by_id(TRAY_ID);
    Ok(())
}

// 处理窗口关闭事件
pub fn should_prevent_close(tray_enabled: bool) -> bool {
    tray_enabled
}