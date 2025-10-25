use std::fs;
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::io::{Read, Write};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

/// 获取应用数据目录
fn get_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))
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

/// 清单文件结构
#[derive(Serialize, Deserialize)]
struct ZipManifest {
    /// 导出时间戳
    timestamp: String,
    /// 应用版本
    app_version: String,
    /// 导出的文件数量
    file_count: usize,
}

/// 将所有配置导出为 ZIP 压缩包
#[tauri::command]
pub async fn export_all_configs_to_zip(app: AppHandle) -> Result<Vec<u8>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    
    // 在内存中创建 ZIP
    let mut zip_buffer = Vec::new();
    let mut zip = ZipWriter::new(std::io::Cursor::new(&mut zip_buffer));
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(6));
    
    let mut file_count = 0;
    
    // 遍历应用数据目录
    for entry in WalkDir::new(&app_data_dir)
        .into_iter()
        .filter_entry(|e| {
            // 过滤掉不需要的目录
            let file_name = e.file_name().to_string_lossy();
            !should_exclude_dir(&file_name)
        })
    {
        let entry = entry.map_err(|e| format!("遍历目录失败: {}", e))?;
        let path = entry.path();
        
        // 只处理文件
        if path.is_file() {
            let file_name = path.file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| "无效的文件名".to_string())?;
            
            // 跳过不需要的文件
            if should_exclude_file(file_name) {
                continue;
            }
            
            // 计算相对路径
            let relative_path = path.strip_prefix(&app_data_dir)
                .map_err(|e| format!("计算相对路径失败: {}", e))?;
            
            let zip_path_str = relative_path.to_string_lossy()
                .replace('\\', "/"); // 统一使用 Unix 风格路径
            
            // 添加文件到 ZIP
            zip.start_file(&zip_path_str, options)
                .map_err(|e| format!("添加文件到 ZIP 失败: {}", e))?;
            
            let mut file = fs::File::open(path)
                .map_err(|e| format!("打开文件失败 {}: {}", path.display(), e))?;
            
            std::io::copy(&mut file, &mut zip)
                .map_err(|e| format!("写入文件到 ZIP 失败: {}", e))?;
            
            file_count += 1;
        }
    }
    
    // 创建并添加清单文件
    let manifest = ZipManifest {
        timestamp: chrono::Local::now().to_rfc3339(),
        app_version: app.package_info().version.to_string(),
        file_count,
    };
    
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("序列化清单失败: {}", e))?;
    
    zip.start_file("manifest.json", options)
        .map_err(|e| format!("添加清单文件失败: {}", e))?;
    
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| format!("写入清单文件失败: {}", e))?;
    
    // 完成 ZIP 文件
    zip.finish()
        .map_err(|e| format!("完成 ZIP 文件失败: {}", e))?;
    
    // 返回 ZIP 文件的二进制数据
    Ok(zip_buffer)
}

/// 从 ZIP 压缩包导入配置
#[tauri::command]
pub async fn import_all_configs_from_zip(
    app: AppHandle,
    zip_file_path: String,
    merge: bool,
) -> Result<String, String> {
    let zip_path = Path::new(&zip_file_path);
    
    if !zip_path.exists() {
        return Err("ZIP 文件不存在".to_string());
    }
    
    let file = fs::File::open(zip_path)
        .map_err(|e| format!("打开 ZIP 文件失败: {}", e))?;
    
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("解析 ZIP 文件失败: {}", e))?;
    
    // 首先读取清单文件进行校验
    let mut manifest: Option<ZipManifest> = None;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("读取 ZIP 条目失败: {}", e))?;
        
        if file.name() == "manifest.json" {
            let mut content = String::new();
            file.read_to_string(&mut content)
                .map_err(|e| format!("读取清单文件失败: {}", e))?;
            
            manifest = Some(serde_json::from_str(&content)
                .map_err(|e| format!("解析清单文件失败: {}", e))?);
            break;
        }
    }
    
    let manifest = manifest.ok_or_else(|| "ZIP 文件中未找到清单文件".to_string())?;
    
    let app_data_dir = get_app_data_dir(&app)?;
    let mut imported_count = 0;
    let mut merged_count = 0;
    let mut errors: Vec<String> = Vec::new();
    
    // 解压并导入配置文件
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("读取 ZIP 条目失败: {}", e))?;
        
        let file_name = file.name().to_string();
        
        // 跳过清单文件和目录
        if file_name == "manifest.json" || file.is_dir() {
            continue;
        }
        
        // 构建目标路径
        let target_path = app_data_dir.join(&file_name);
        
        // 读取文件内容
        let mut content = Vec::new();
        file.read_to_end(&mut content)
            .map_err(|e| format!("读取文件内容失败 {}: {}", file_name, e))?;
        
        // 根据 merge 参数决定是覆盖还是合并
        let should_write = if merge && target_path.exists() && file_name.ends_with(".json") {
            // 合并模式：对于 JSON 文件，尝试合并
            match (
                fs::read_to_string(&target_path)
                    .and_then(|s| serde_json::from_str::<Value>(&s).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))),
                serde_json::from_slice::<Value>(&content)
            ) {
                (Ok(mut existing), Ok(new_value)) => {
                    merge_json_values(&mut existing, &new_value);
                    content = serde_json::to_vec_pretty(&existing)
                        .map_err(|e| format!("序列化合并后的配置失败: {}", e))?;
                    merged_count += 1;
                    true
                }
                _ => {
                    // 合并失败，直接覆盖
                    eprintln!("合并配置失败 {}，将直接覆盖", file_name);
                    true
                }
            }
        } else {
            // 覆盖模式或非 JSON 文件
            true
        };
        
        if should_write {
            // 确保目标目录存在
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("创建目录失败: {}", e))?;
            }
            
            // 写入文件
            match fs::write(&target_path, &content) {
                Ok(_) => {
                    imported_count += 1;
                }
                Err(e) => {
                    errors.push(format!("{}: {}", file_name, e));
                }
            }
        }
    }
    
    // 构建结果消息
    if errors.is_empty() {
        if merge && merged_count > 0 {
            Ok(format!(
                "成功导入 {} 个文件（其中 {} 个已合并）\n导出时间: {}\n导出版本: {}",
                imported_count,
                merged_count,
                manifest.timestamp,
                manifest.app_version
            ))
        } else {
            Ok(format!(
                "成功导入 {} 个文件\n导出时间: {}\n导出版本: {}",
                imported_count,
                manifest.timestamp,
                manifest.app_version
            ))
        }
    } else {
        Err(format!(
            "导入了 {} 个文件，但有 {} 个错误:\n{}",
            imported_count,
            errors.len(),
            errors.join("\n")
        ))
    }
}