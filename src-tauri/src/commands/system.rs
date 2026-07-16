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

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperInfo {
    pub monitor_index: u32,
    pub monitor_name: String,
    pub path: String,
}

#[tauri::command]
pub async fn get_system_wallpapers() -> Result<Vec<WallpaperInfo>, String> {
    #[cfg(windows)]
    {
        tokio::task::spawn_blocking(get_windows_wallpapers)
            .await
            .map_err(|error| format!("壁纸探测任务执行失败: {}", error))?
    }

    #[cfg(target_os = "macos")]
    {
        tokio::task::spawn_blocking(get_macos_wallpapers)
            .await
            .map_err(|error| format!("壁纸探测任务执行失败: {}", error))?
    }

    #[cfg(target_os = "linux")]
    {
        tokio::task::spawn_blocking(get_linux_wallpapers)
            .await
            .map_err(|error| format!("壁纸探测任务执行失败: {}", error))?
    }

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        Err("当前系统暂不支持获取壁纸".to_string())
    }
}

#[cfg(any(target_os = "macos", target_os = "linux", test))]
fn wallpaper_infos_from_paths(paths: Vec<String>) -> Vec<WallpaperInfo> {
    paths
        .into_iter()
        .filter(|path| !path.is_empty())
        .enumerate()
        .map(|(index, path)| WallpaperInfo {
            monitor_index: index as u32,
            monitor_name: format!("屏幕 {}", index + 1),
            path,
        })
        .collect()
}

#[cfg(windows)]
fn get_windows_wallpapers() -> Result<Vec<WallpaperInfo>, String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{DesktopWallpaper, IDesktopWallpaper};

    struct ComApartmentGuard {
        should_uninitialize: bool,
    }

    impl Drop for ComApartmentGuard {
        fn drop(&mut self) {
            if self.should_uninitialize {
                unsafe { CoUninitialize() };
            }
        }
    }

    struct CoTaskMemWideString(PWSTR);

    impl Drop for CoTaskMemWideString {
        fn drop(&mut self) {
            unsafe { CoTaskMemFree(Some(self.0.as_ptr().cast())) };
        }
    }

    let initialize_result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let should_uninitialize = if initialize_result.is_ok() {
        true
    } else if initialize_result == RPC_E_CHANGED_MODE {
        false
    } else {
        return Err(format!("初始化 COM 库失败: {}", initialize_result));
    };
    let _com_guard = ComApartmentGuard {
        should_uninitialize,
    };

    let desktop_wallpaper: IDesktopWallpaper = unsafe {
        CoCreateInstance(&DesktopWallpaper, None, CLSCTX_ALL)
            .map_err(|error| format!("无法创建 IDesktopWallpaper 实例: {}", error))?
    };
    let monitor_count = unsafe {
        desktop_wallpaper
            .GetMonitorDevicePathCount()
            .map_err(|error| format!("无法获取显示器数量: {}", error))?
    };

    let mut wallpapers = Vec::with_capacity(monitor_count as usize);
    for index in 0..monitor_count {
        let monitor_id = CoTaskMemWideString(unsafe {
            desktop_wallpaper
                .GetMonitorDevicePathAt(index)
                .map_err(|error| format!("无法获取屏幕 {} 的设备路径: {}", index + 1, error))?
        });
        let wallpaper_path = CoTaskMemWideString(unsafe {
            desktop_wallpaper
                .GetWallpaper(monitor_id.0)
                .map_err(|error| format!("无法获取屏幕 {} 的壁纸: {}", index + 1, error))?
        });
        let path = unsafe { wallpaper_path.0.to_string() }
            .map_err(|error| format!("屏幕 {} 的壁纸路径不是有效 Unicode: {}", index + 1, error))?;
        if !path.is_empty() {
            wallpapers.push(WallpaperInfo {
                monitor_index: index,
                monitor_name: format!("屏幕 {}", index + 1),
                path,
            });
        }
    }

    if wallpapers.is_empty() {
        return Err("系统未返回任何有效的壁纸路径".to_string());
    }

    Ok(wallpapers)
}

#[cfg(target_os = "macos")]
fn get_macos_wallpapers() -> Result<Vec<WallpaperInfo>, String> {
    use std::process::Command;

    const SCRIPT: &str = r#"
const systemEvents = Application("System Events");
const paths = systemEvents.desktops().map((desktop) => String(desktop.picture()));
JSON.stringify(paths);
"#;

    let output = Command::new("osascript")
        .args(["-l", "JavaScript", "-e", SCRIPT])
        .output()
        .map_err(|error| format!("执行 JavaScript for Automation 失败: {}", error))?;

    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("获取 macOS 壁纸失败: {}", message));
    }

    let paths: Vec<String> = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("解析 macOS 壁纸结果失败: {}", error))?;
    let wallpapers = wallpaper_infos_from_paths(paths);
    if wallpapers.is_empty() {
        return Err("系统未返回任何有效的壁纸路径".to_string());
    }

    Ok(wallpapers)
}

#[cfg(any(target_os = "linux", test))]
fn strip_wrapping_quotes(value: &str) -> &str {
    let value = value.trim();
    if value.len() >= 2 {
        let bytes = value.as_bytes();
        if (bytes[0] == b'\'' && bytes[value.len() - 1] == b'\'')
            || (bytes[0] == b'"' && bytes[value.len() - 1] == b'"')
        {
            return &value[1..value.len() - 1];
        }
    }
    value
}

#[cfg(any(target_os = "linux", test))]
fn kde_wallpaper_values(config: &str) -> Vec<&str> {
    config
        .lines()
        .filter_map(|line| line.trim().strip_prefix("Image="))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect()
}

#[cfg(target_os = "linux")]
fn normalize_linux_wallpaper_path(value: &str) -> Option<String> {
    use std::path::Path;

    let value = strip_wrapping_quotes(value);
    if value.starts_with("file:") {
        return url::Url::parse(value)
            .ok()?
            .to_file_path()
            .ok()
            .map(|path| path.to_string_lossy().to_string());
    }

    Path::new(value).is_absolute().then(|| value.to_string())
}

#[cfg(target_os = "linux")]
fn read_gsettings_value(schema: &str, key: &str) -> Result<String, String> {
    use std::process::Command;

    let output = Command::new("gsettings")
        .args(["get", schema, key])
        .output()
        .map_err(|error| format!("无法执行 gsettings: {}", error))?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("读取 {} 失败: {}", key, message));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "linux")]
fn get_gnome_wallpapers() -> Result<Vec<WallpaperInfo>, String> {
    const BACKGROUND_SCHEMA: &str = "org.gnome.desktop.background";
    let prefers_dark = read_gsettings_value("org.gnome.desktop.interface", "color-scheme")
        .map(|value| value.contains("prefer-dark"))
        .unwrap_or(false);
    let keys = if prefers_dark {
        ["picture-uri-dark", "picture-uri"]
    } else {
        ["picture-uri", "picture-uri-dark"]
    };

    let mut errors = Vec::new();
    for key in keys {
        match read_gsettings_value(BACKGROUND_SCHEMA, key) {
            Ok(value) => {
                if let Some(path) = normalize_linux_wallpaper_path(&value) {
                    return Ok(wallpaper_infos_from_paths(vec![path]));
                }
                errors.push(format!("{} 未返回本地文件路径", key));
            }
            Err(error) => errors.push(error),
        }
    }

    Err(errors.join("；"))
}

#[cfg(target_os = "linux")]
fn get_kde_wallpapers() -> Result<Vec<WallpaperInfo>, String> {
    use std::collections::HashSet;
    use std::path::PathBuf;

    let config_dir = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
        .ok_or_else(|| "无法确定 KDE 配置目录".to_string())?;
    let config_path = config_dir.join("plasma-org.kde.plasma.desktop-appletsrc");
    let config = std::fs::read_to_string(&config_path).map_err(|error| {
        format!(
            "读取 KDE 壁纸配置失败（{}）: {}",
            config_path.display(),
            error
        )
    })?;

    let mut seen = HashSet::new();
    let paths = kde_wallpaper_values(&config)
        .into_iter()
        .filter_map(normalize_linux_wallpaper_path)
        .filter(|path| seen.insert(path.clone()))
        .collect::<Vec<_>>();

    if paths.is_empty() {
        return Err("KDE 配置中没有找到当前壁纸路径".to_string());
    }

    Ok(wallpaper_infos_from_paths(paths))
}

#[cfg(target_os = "linux")]
fn get_linux_wallpapers() -> Result<Vec<WallpaperInfo>, String> {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .or_else(|_| std::env::var("DESKTOP_SESSION"))
        .unwrap_or_default()
        .to_ascii_lowercase();
    let prefer_kde = desktop.contains("kde") || desktop.contains("plasma");

    let detectors: [fn() -> Result<Vec<WallpaperInfo>, String>; 2] = if prefer_kde {
        [get_kde_wallpapers, get_gnome_wallpapers]
    } else {
        [get_gnome_wallpapers, get_kde_wallpapers]
    };

    let mut errors = Vec::new();
    for detect in detectors {
        match detect() {
            Ok(wallpapers) => return Ok(wallpapers),
            Err(error) => errors.push(error),
        }
    }

    Err(format!(
        "当前 Linux 桌面环境暂未探测到壁纸：{}",
        errors.join("；")
    ))
}

#[cfg(test)]
mod wallpaper_tests {
    use super::{kde_wallpaper_values, strip_wrapping_quotes, wallpaper_infos_from_paths};

    #[test]
    fn strips_only_matching_wrapping_quotes() {
        assert_eq!(
            strip_wrapping_quotes(" 'file:///tmp/a,b.jpg' "),
            "file:///tmp/a,b.jpg"
        );
        assert_eq!(
            strip_wrapping_quotes("\"/tmp/wallpaper.png\""),
            "/tmp/wallpaper.png"
        );
        assert_eq!(
            strip_wrapping_quotes("'/tmp/wallpaper.png\""),
            "'/tmp/wallpaper.png\""
        );
    }

    #[test]
    fn extracts_only_kde_image_entries() {
        let config = "[Wallpaper]\nImage=file:///tmp/first.jpg\nPreviewImage=file:///tmp/preview.jpg\nImage=/tmp/second.png\n";
        assert_eq!(
            kde_wallpaper_values(config),
            vec!["file:///tmp/first.jpg", "/tmp/second.png"]
        );
    }

    #[test]
    fn creates_stable_monitor_metadata_and_skips_empty_paths() {
        let wallpapers = wallpaper_infos_from_paths(vec![
            "C:\\first.jpg".to_string(),
            String::new(),
            "C:\\second.jpg".to_string(),
        ]);
        assert_eq!(wallpapers.len(), 2);
        assert_eq!(wallpapers[0].monitor_index, 0);
        assert_eq!(wallpapers[0].monitor_name, "屏幕 1");
        assert_eq!(wallpapers[1].monitor_index, 1);
        assert_eq!(wallpapers[1].monitor_name, "屏幕 2");
    }
}
