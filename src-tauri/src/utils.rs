use dirs_next::data_dir;
use std::path::PathBuf;
use tauri::Manager;

pub mod mime;

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

// 打印当前窗口列表
pub(crate) fn print_window_list(app_handle: &tauri::AppHandle) {
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
