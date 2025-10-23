use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewWindow};

/// 窗口配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowConfig {
    /// 窗口位置 (物理坐标)
    pub x: i32,
    pub y: i32,
    /// 窗口尺寸 (逻辑坐标)
    pub width: f64,
    pub height: f64,
    /// 是否最大化
    pub maximized: bool,
}

/// 获取配置文件路径
fn get_config_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    // 确保目录存在
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("创建应用数据目录失败: {}", e))?;
    
    Ok(app_data_dir.join("window-configs.json"))
}

/// 从文件加载所有窗口配置
fn load_all_configs(app: &AppHandle) -> Result<HashMap<String, WindowConfig>, String> {
    let config_path = get_config_file_path(app)?;
    
    if !config_path.exists() {
        return Ok(HashMap::new());
    }
    
    let mut file = fs::File::open(&config_path)
        .map_err(|e| format!("打开配置文件失败: {}", e))?;
    
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    
    serde_json::from_str(&contents)
        .map_err(|e| format!("解析配置文件失败: {}", e))
}

/// 将所有窗口配置保存到文件
fn save_all_configs(app: &AppHandle, configs: &HashMap<String, WindowConfig>) -> Result<(), String> {
    let config_path = get_config_file_path(app)?;
    
    let json = serde_json::to_string_pretty(configs)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    
    fs::write(&config_path, json)
        .map_err(|e| format!("写入配置文件失败: {}", e))
}

/// 同步保存窗口配置（用于窗口关闭事件）
pub fn save_window_config_sync(app: &AppHandle, label: &str) -> Result<(), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("窗口 '{}' 不存在", label))?;
    
    // 获取当前窗口状态
    let position = window.outer_position()
        .map_err(|e| format!("获取窗口位置失败: {}", e))?;
    let size = window.inner_size()
        .map_err(|e| format!("获取窗口尺寸失败: {}", e))?;
    let maximized = window.is_maximized()
        .map_err(|e| format!("获取窗口最大化状态失败: {}", e))?;
    let scale_factor = window.scale_factor()
        .map_err(|e| format!("获取缩放因子失败: {}", e))?;
    
    // 创建配置对象
    let config = WindowConfig {
        x: position.x,
        y: position.y,
        width: size.width as f64 / scale_factor,
        height: size.height as f64 / scale_factor,
        maximized,
    };
    
    // 加载现有配置
    let mut all_configs = load_all_configs(app).unwrap_or_default();
    
    // 更新或插入新配置
    all_configs.insert(label.to_string(), config.clone());
    
    // 保存到文件
    save_all_configs(app, &all_configs)?;
    
    println!("[WINDOW_CONFIG] 已保存窗口配置: label={}, x={}, y={}, width={:.0}, height={:.0}, maximized={}",
        label, config.x, config.y, config.width, config.height, config.maximized);
    
    Ok(())
}

/// 保存指定窗口的当前配置（Tauri 命令版本）
#[tauri::command]
pub async fn save_window_config(app: AppHandle, label: String) -> Result<(), String> {
    save_window_config_sync(&app, &label)
}

/// 应用保存的配置到指定窗口
#[tauri::command]
pub async fn apply_window_config(window: WebviewWindow) -> Result<bool, String> {
    let label = window.label().to_string();
    let app = window.app_handle();
    
    // 加载配置
    let all_configs = load_all_configs(&app)?;
    
    if let Some(config) = all_configs.get(&label) {
        println!("[WINDOW_CONFIG] 应用窗口配置: label={}, x={}, y={}, width={:.0}, height={:.0}, maximized={}", 
            label, config.x, config.y, config.width, config.height, config.maximized);
        
        // 应用尺寸
        window.set_size(LogicalSize::new(config.width, config.height))
            .map_err(|e| format!("设置窗口尺寸失败: {}", e))?;
        
        // 应用位置
        window.set_position(PhysicalPosition::new(config.x, config.y))
            .map_err(|e| format!("设置窗口位置失败: {}", e))?;
        
        // 应用最大化状态
        if config.maximized {
            println!("[WINDOW_CONFIG] [自动恢复] 将窗口 '{}' 设置为最大化状态", label);
            window.maximize()
                .map_err(|e| format!("最大化窗口失败: {}", e))?;
        } else {
            // 如果保存的配置是非最大化，确保窗口也是非最大化的
            let current_maximized = window.is_maximized()
                .map_err(|e| format!("获取窗口最大化状态失败: {}", e))?;
            if current_maximized {
                println!("[WINDOW_CONFIG] [自动恢复] 将窗口 '{}' 取消最大化", label);
                window.unmaximize()
                    .map_err(|e| format!("取消最大化失败: {}", e))?;
            }
        }
        
        Ok(true)
    } else {
        println!("[WINDOW_CONFIG] 窗口 '{}' 没有保存的配置，使用默认设置", label);
        Ok(false)
    }
}

/// 删除指定窗口的配置
#[tauri::command]
pub async fn delete_window_config(app: AppHandle, label: String) -> Result<(), String> {
    let mut all_configs = load_all_configs(&app).unwrap_or_default();
    
    if all_configs.remove(&label).is_some() {
        save_all_configs(&app, &all_configs)?;
        println!("[WINDOW_CONFIG] 已删除窗口配置: label={}", label);
    }
    
    Ok(())
}

/// 清除所有窗口配置
#[tauri::command]
pub async fn clear_all_window_configs(app: AppHandle) -> Result<(), String> {
    let config_path = get_config_file_path(&app)?;
    
    if config_path.exists() {
        fs::remove_file(&config_path)
            .map_err(|e| format!("删除配置文件失败: {}", e))?;
        println!("[WINDOW_CONFIG] 已清除所有窗口配置");
    }
    
    Ok(())
}

/// 获取所有已保存的窗口配置标签列表
#[tauri::command]
pub async fn get_saved_window_labels(app: AppHandle) -> Result<Vec<String>, String> {
    let all_configs = load_all_configs(&app).unwrap_or_default();
    let labels: Vec<String> = all_configs.keys().cloned().collect();
    Ok(labels)
}