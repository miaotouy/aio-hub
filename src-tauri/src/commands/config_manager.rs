use std::fs;
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// 配置导出结果
#[derive(Serialize, Deserialize)]
pub struct ConfigExport {
    /// 导出时间戳
    pub timestamp: String,
    /// 应用版本
    pub app_version: String,
    /// 所有模块的配置
    pub configs: HashMap<String, HashMap<String, Value>>,
}

/// 获取应用数据目录
fn get_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))
}

/// 读取单个配置文件
fn read_config_file(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Err(format!("配置文件不存在: {}", path.display()));
    }
    
    let content = fs::read_to_string(path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    
    serde_json::from_str(&content)
        .map_err(|e| format!("解析配置文件失败: {}", e))
}

/// 写入单个配置文件
fn write_config_file(path: &Path, value: &Value) -> Result<(), String> {
    // 确保父目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    
    let content = serde_json::to_string_pretty(value)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    
    fs::write(path, content)
        .map_err(|e| format!("写入配置文件失败: {}", e))
}

/// 深度合并两个 JSON 值
/// - 如果两个值都是对象，则递归合并它们的字段
/// - 如果两个值都是数组，则将 source 的元素追加到 target
/// - 否则，source 的值会覆盖 target 的值
fn merge_json_values(target: &mut Value, source: &Value) {
    match (target, source) {
        (Value::Object(target_map), Value::Object(source_map)) => {
            // 两者都是对象，递归合并
            for (key, source_value) in source_map {
                if let Some(target_value) = target_map.get_mut(key) {
                    // 键已存在，递归合并
                    merge_json_values(target_value, source_value);
                } else {
                    // 键不存在，直接插入
                    target_map.insert(key.clone(), source_value.clone());
                }
            }
        }
        (Value::Array(target_array), Value::Array(source_array)) => {
            // 两者都是数组，将 source 的元素追加到 target（去重）
            for item in source_array {
                if !target_array.contains(item) {
                    target_array.push(item.clone());
                }
            }
        }
        (target_value, source_value) => {
            // 其他情况，直接用 source 覆盖 target
            *target_value = source_value.clone();
        }
    }
}

/// 检查是否应该排除该目录
fn should_exclude_dir(dir_name: &str) -> bool {
    // 排除的目录列表
    matches!(dir_name, "logs")
}

/// 检查是否应该排除该文件
fn should_exclude_file(file_name: &str) -> bool {
    // 排除日志文件和其他不需要的文件
    file_name.ends_with(".log") || file_name == ".DS_Store" || file_name == "Thumbs.db"
}

/// 扫描目录并收集所有配置文件
fn scan_config_dir(dir: &Path, module_name: &str) -> Result<HashMap<String, Value>, String> {
    let mut configs = HashMap::new();
    
    if !dir.exists() || !dir.is_dir() {
        return Ok(configs);
    }
    
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("读取目录失败 {}: {}", dir.display(), e))?;
    
    for entry in entries.flatten() {
        if let Ok(file_type) = entry.file_type() {
            let file_name = entry.file_name();
            let file_name_str = file_name.to_string_lossy();
            
            if file_type.is_file() && !should_exclude_file(&file_name_str) {
                let file_path = entry.path();
                
                // 只处理 JSON 文件
                if file_name_str.ends_with(".json") {
                    match read_config_file(&file_path) {
                        Ok(value) => {
                            configs.insert(file_name_str.to_string(), value);
                        }
                        Err(e) => {
                            eprintln!("读取配置文件 {}/{} 失败: {}", module_name, file_name_str, e);
                        }
                    }
                }
            }
        }
    }
    
    Ok(configs)
}

/// 导出所有配置
#[tauri::command]
pub async fn export_all_configs(app: AppHandle) -> Result<ConfigExport, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    
    let mut configs: HashMap<String, HashMap<String, Value>> = HashMap::new();
    
    // 扫描应用数据目录下的所有子目录
    if let Ok(entries) = fs::read_dir(&app_data_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let dir_name = entry.file_name();
                    let dir_name_str = dir_name.to_string_lossy();
                    
                    // 跳过排除的目录
                    if should_exclude_dir(&dir_name_str) {
                        continue;
                    }
                    
                    let module_dir = entry.path();
                    
                    // 扫描模块目录下的所有配置文件
                    match scan_config_dir(&module_dir, &dir_name_str) {
                        Ok(module_configs) => {
                            if !module_configs.is_empty() {
                                configs.insert(dir_name_str.to_string(), module_configs);
                            }
                        }
                        Err(e) => {
                            eprintln!("扫描模块目录 {} 失败: {}", dir_name_str, e);
                        }
                    }
                }
            }
        }
    }
    
    Ok(ConfigExport {
        timestamp: chrono::Local::now().to_rfc3339(),
        app_version: app.package_info().version.to_string(),
        configs,
    })
}

/// 导入所有配置
#[tauri::command]
pub async fn import_all_configs(
    app: AppHandle,
    config_json: String,
    merge: bool,
) -> Result<String, String> {
    // 解析 JSON 字符串为 ConfigExport 结构
    let config_data: ConfigExport = serde_json::from_str(&config_json)
        .map_err(|e| format!("解析配置数据失败: {}", e))?;
    
    let app_data_dir = get_app_data_dir(&app)?;
    
    let mut imported_count = 0;
    let mut merged_count = 0;
    let mut errors: Vec<String> = Vec::new();
    
    // 写入每个模块的配置文件
    for (module_name, module_configs) in config_data.configs {
        for (file_name, value) in module_configs {
            let config_path = app_data_dir.join(&module_name).join(&file_name);
            
            // 根据 merge 参数决定是覆盖还是合并
            let final_value = if merge && config_path.exists() {
                // 合并模式：读取现有配置并合并
                match read_config_file(&config_path) {
                    Ok(mut existing_value) => {
                        merge_json_values(&mut existing_value, &value);
                        merged_count += 1;
                        existing_value
                    }
                    Err(e) => {
                        // 读取失败，记录错误但继续用新值覆盖
                        eprintln!("读取现有配置失败 {}/{}: {}，将直接覆盖", module_name, file_name, e);
                        value
                    }
                }
            } else {
                // 覆盖模式：直接使用新值
                value
            };
            
            match write_config_file(&config_path, &final_value) {
                Ok(_) => {
                    imported_count += 1;
                }
                Err(e) => {
                    errors.push(format!("{}/{}: {}", module_name, file_name, e));
                }
            }
        }
    }
    
    if errors.is_empty() {
        if merge && merged_count > 0 {
            Ok(format!("成功导入 {} 个配置文件（其中 {} 个已合并）", imported_count, merged_count))
        } else {
            Ok(format!("成功导入 {} 个配置文件", imported_count))
        }
    } else {
        Err(format!(
            "导入了 {} 个配置文件，但有 {} 个错误:\n{}",
            imported_count,
            errors.len(),
            errors.join("\n")
        ))
    }
}

/// 获取配置文件列表
#[tauri::command]
pub async fn list_config_files(app: AppHandle) -> Result<HashMap<String, Vec<String>>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let mut result: HashMap<String, Vec<String>> = HashMap::new();
    
    // 扫描应用数据目录下的所有子目录
    if let Ok(entries) = fs::read_dir(&app_data_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let dir_name = entry.file_name();
                    let dir_name_str = dir_name.to_string_lossy();
                    
                    // 跳过排除的目录
                    if should_exclude_dir(&dir_name_str) {
                        continue;
                    }
                    
                    let module_dir = entry.path();
                    let mut files = Vec::new();
                    
                    if let Ok(file_entries) = fs::read_dir(&module_dir) {
                        for file_entry in file_entries.flatten() {
                            if let Ok(file_type) = file_entry.file_type() {
                                if file_type.is_file() {
                                    let file_name = file_entry.file_name();
                                    let file_name_str = file_name.to_string_lossy();
                                    
                                    // 排除不需要的文件
                                    if !should_exclude_file(&file_name_str) && file_name_str.ends_with(".json") {
                                        files.push(file_name_str.to_string());
                                    }
                                }
                            }
                        }
                    }
                    
                    if !files.is_empty() {
                        result.insert(dir_name_str.to_string(), files);
                    }
                }
            }
        }
    }
    
    Ok(result)
}