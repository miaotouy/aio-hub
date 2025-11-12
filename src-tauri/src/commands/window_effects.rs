use std::fs;
use std::path::Path;

#[cfg(target_os = "windows")]
use window_vibrancy::apply_blur;
#[cfg(target_os = "windows")]
use window_vibrancy::apply_acrylic;
#[cfg(target_os = "windows")]
use window_vibrancy::apply_mica;
#[cfg(target_os = "windows")]
use window_vibrancy::clear_blur;
#[cfg(target_os = "windows")]
use window_vibrancy::clear_acrylic;
#[cfg(target_os = "windows")]
use window_vibrancy::clear_mica;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[tauri::command]
pub async fn apply_window_effect(window: tauri::Window, effect: &str) -> Result<(), String> {
    match effect {
        "blur" => {
            #[cfg(target_os = "macos")]
            {
                apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                    .map_err(|e| format!("Failed to apply blur effect: {}", e))?;
            }
            #[cfg(target_os = "windows")]
            {
                apply_blur(&window, Some((18, 18, 18, 125)))
                    .map_err(|e| format!("Failed to apply blur effect: {}", e))?;
            }
            #[cfg(target_os = "linux")]
            {
                return Err("Blur effect is not supported on Linux".to_string());
            }
        }
        "acrylic" => {
            #[cfg(target_os = "windows")]
            {
                apply_acrylic(&window, Some((18, 18, 18, 125)))
                    .map_err(|e| format!("Failed to apply acrylic effect: {}", e))?;
            }
            #[cfg(not(target_os = "windows"))]
            {
                return Err(format!("Acrylic effect is only supported on Windows"));
            }
        }
        "mica" => {
            #[cfg(target_os = "windows")]
            {
                apply_mica(&window, None)
                    .map_err(|e| format!("Failed to apply mica effect: {}", e))?;
            }
            #[cfg(not(target_os = "windows"))]
            {
                return Err(format!("Mica effect is only supported on Windows"));
            }
        }
        "vibrancy" => {
            #[cfg(target_os = "macos")]
            {
                apply_vibrancy(&window, NSVisualEffectMaterial::WindowBackground, None, None)
                    .map_err(|e| format!("Failed to apply vibrancy effect: {}", e))?;
            }
            #[cfg(not(target_os = "macos"))]
            {
                return Err("Vibrancy effect is only supported on macOS".to_string());
            }
        }
        "none" => {
            // 清除所有效果
            #[cfg(target_os = "windows")]
            {
                // 尝试清除所有可能的效果
                let _ = clear_blur(&window);
                let _ = clear_acrylic(&window);
                let _ = clear_mica(&window);
            }
            #[cfg(target_os = "macos")]
            {
                // macOS 上通过设置为 None 来清除效果
                apply_vibrancy(&window, NSVisualEffectMaterial::WindowBackground, None, None)
                    .map_err(|e| format!("Failed to clear effects: {}", e))?;
            }
        }
        _ => {
            return Err(format!("Unknown effect: {}", effect));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_directory_images(directory: String) -> Result<Vec<String>, String> {
    let path = Path::new(&directory);
    if !path.is_dir() {
        return Err(format!("'{}' is not a valid directory.", directory));
    }

    let mut images = Vec::new();
    let allowed_extensions = ["jpg", "jpeg", "png", "webp", "bmp", "gif", "avif"];

    match fs::read_dir(path) {
        Ok(entries) => {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                        if allowed_extensions.contains(&ext.to_lowercase().as_str()) {
                            // 使用 display() 方法获取路径字符串，并统一转换为正斜杠
                            // 这样在所有平台上都能正常工作
                            let path_str = path.display().to_string();
                            // 在 Windows 上将反斜杠替换为正斜杠，以便前端统一处理
                            #[cfg(target_os = "windows")]
                            let path_str = path_str.replace('\\', "/");
                            images.push(path_str);
                        }
                    }
                }
            }
            Ok(images)
        }
        Err(e) => Err(format!("Failed to read directory: {}", e)),
    }
}