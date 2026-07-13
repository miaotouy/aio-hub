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

use dirs_next::data_dir;
use std::path::PathBuf;
use tauri::Manager;

pub mod mime;

pub(crate) const AIOHUB_PLUGIN_DATA_DIR_ENV: &str = "AIOHUB_PLUGIN_DATA_DIR";

#[cfg(windows)]
pub(crate) fn hide_child_process_window(command: &mut tokio::process::Command) {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn hide_child_process_window(_command: &mut tokio::process::Command) {}

#[cfg(windows)]
pub(crate) fn hide_std_child_process_window(command: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn hide_std_child_process_window(_command: &mut std::process::Command) {}

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

/// 确保插件专属持久化数据目录存在。
pub(crate) fn ensure_plugin_data_dir(
    config: &tauri::Config,
    plugin_id: &str,
) -> Result<PathBuf, String> {
    let plugin_data_dir = get_app_data_dir(config)
        .join("plugins-data")
        .join(plugin_id);

    std::fs::create_dir_all(&plugin_data_dir).map_err(|e| {
        format!(
            "创建插件数据目录失败: {} ({})",
            plugin_data_dir.display(),
            e
        )
    })?;

    Ok(plugin_data_dir)
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
