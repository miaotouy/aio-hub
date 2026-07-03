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

use crate::tray::{build_system_tray, remove_system_tray};
use crate::utils::get_app_data_dir;
use local_ip_address::list_afinet_netifas;
use std::sync::Mutex;
use tauri_plugin_opener::OpenerExt;

use super::sidecar_plugin_manager::SidecarPluginManager;

// 应用状态管理
#[derive(Default)]
pub struct AppState {
    pub minimize_to_tray: Mutex<bool>,
}

// 简单的 greet 命令
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub async fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|e| e.to_string())
}

// 更新托盘设置命令
#[tauri::command]
pub fn update_tray_setting(
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
pub fn get_tray_setting(state: tauri::State<AppState>) -> Result<bool, String> {
    let minimize_to_tray = state.minimize_to_tray.lock().map_err(|e| e.to_string())?;
    Ok(*minimize_to_tray)
}

// 退出应用命令
#[tauri::command]
pub async fn exit_app(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarPluginManager>,
) -> Result<(), String> {
    // 清理所有常驻 Sidecar 进程
    state.kill_all().await;
    app.exit(0);
    Ok(())
}

// 动态设置托盘图标显示/隐藏
#[tauri::command]
pub fn set_show_tray_icon(app: tauri::AppHandle, show: bool) -> Result<(), String> {
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
pub async fn get_app_config_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(get_app_data_dir(app.config()).to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_local_ips() -> Result<Vec<String>, String> {
    let network_interfaces = list_afinet_netifas().map_err(|e| e.to_string())?;

    let mut ips = Vec::new();
    for (_name, ip) in network_interfaces {
        // 排除回环地址
        if !ip.is_loopback() {
            ips.push(ip.to_string());
        }
    }

    // 如果没有找到非回环地址，至少返回一个空列表或回环地址
    if ips.is_empty() {
        // 重新检查是否包含回环地址，有些情况下可能需要
        for (_name, ip) in list_afinet_netifas().map_err(|e| e.to_string())? {
            if ip.is_loopback() {
                ips.push(ip.to_string());
                break;
            }
        }
    }

    Ok(ips)
}
