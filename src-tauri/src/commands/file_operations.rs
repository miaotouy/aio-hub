use std::fs;
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use regex::Regex;
use serde::{Deserialize, Serialize};

// 正则规则结构体
#[derive(Deserialize)]
pub struct RegexRule {
    pub regex: String,
    pub replacement: String,
}

// 文件处理结果结构体
#[derive(Serialize)]
pub struct ProcessResult {
    pub success_count: usize,
    pub error_count: usize,
    pub errors: HashMap<String, String>,
}

// Tauri 命令：批量处理文件应用正则规则
#[tauri::command]
pub async fn process_files_with_regex(
    file_paths: Vec<String>,
    output_dir: String,
    rules: Vec<RegexRule>
) -> Result<ProcessResult, String> {
    let output_path = PathBuf::from(&output_dir);
    
    // 确保输出目录存在
    if !output_path.exists() {
        fs::create_dir_all(&output_path)
            .map_err(|e| format!("创建输出目录失败: {}", e))?;
    }
    
    if !output_path.is_dir() {
        return Err(format!("输出路径不是目录: {}", output_dir));
    }
    
    // 编译所有正则表达式
    let compiled_rules: Result<Vec<(Regex, String)>, String> = rules.iter()
        .map(|rule| {
            Regex::new(&rule.regex)
                .map(|r| (r, rule.replacement.clone()))
                .map_err(|e| format!("无效的正则表达式 '{}': {}", rule.regex, e))
        })
        .collect();
    
    let compiled_rules = compiled_rules?;
    
    // 收集所有需要处理的文件
    let mut all_files = Vec::new();
    for path_str in file_paths {
        let path = PathBuf::from(&path_str);
        if path.is_file() {
            all_files.push(path);
        } else if path.is_dir() {
            collect_files_recursive(&path, &mut all_files)?;
        }
    }
    
    // 处理每个文件
    let mut success_count = 0;
    let mut error_count = 0;
    let mut errors = HashMap::new();
    
    for file_path in all_files {
        match process_single_file(&file_path, &output_path, &compiled_rules) {
            Ok(_) => success_count += 1,
            Err(e) => {
                error_count += 1;
                errors.insert(file_path.display().to_string(), e);
            }
        }
    }
    
    Ok(ProcessResult {
        success_count,
        error_count,
        errors,
    })
}

// 递归收集目录中的所有文件
fn collect_files_recursive(dir: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    if dir.is_dir() {
        let entries = fs::read_dir(dir)
            .map_err(|e| format!("读取目录失败 {}: {}", dir.display(), e))?;
        
        for entry in entries {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let path = entry.path();
            
            if path.is_file() {
                files.push(path);
            } else if path.is_dir() {
                collect_files_recursive(&path, files)?;
            }
        }
    }
    Ok(())
}

// 处理单个文件
fn process_single_file(
    file_path: &Path,
    output_dir: &Path,
    rules: &[(Regex, String)]
) -> Result<(), String> {
    // 读取文件内容
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("读取文件失败: {}", e))?;
    
    // 应用所有正则规则
    let mut processed = content;
    for (regex, replacement) in rules {
        processed = regex.replace_all(&processed, replacement.as_str()).to_string();
    }
    
    // 构造输出文件路径（保持原文件名）
    let file_name = file_path.file_name()
        .ok_or_else(|| "无法获取文件名".to_string())?;
    let output_file = output_dir.join(file_name);
    
    // 写入处理后的内容
    fs::write(&output_file, processed)
        .map_err(|e| format!("写入文件失败: {}", e))?;
    
    Ok(())
}

// Tauri 命令：文件移动和符号链接创建
#[tauri::command]
pub async fn move_and_link(source_paths: Vec<String>, target_dir: String, link_type: String) -> Result<String, String> {
    let target_path = PathBuf::from(&target_dir);

    // 确保目标目录存在
    if !target_path.exists() {
        return Err(format!("目标目录不存在: {}", target_dir));
    }

    if !target_path.is_dir() {
        return Err(format!("目标路径不是目录: {}", target_dir));
    }

    let mut processed_count = 0;
    let mut errors = Vec::new();

    for source_path_str in source_paths {
        let source_path = PathBuf::from(&source_path_str);

        // 检查源文件是否存在
        if !source_path.exists() {
            errors.push(format!("源文件不存在: {}", source_path_str));
            continue;
        }

        let file_name = source_path.file_name()
            .ok_or_else(|| format!("无法获取文件名: {}", source_path_str))?
            .to_string_lossy().to_string();

        let target_file_path = target_path.join(file_name);

        // 检查目标文件是否已存在
        if target_file_path.exists() {
            errors.push(format!("目标文件已存在: {}", target_file_path.display()));
            continue;
        }

        // 执行文件移动
        match fs::rename(&source_path, &target_file_path) {
            Ok(_) => {
                // 文件移动成功，现在创建链接
                let link_result = if link_type == "symlink" {
                    // 创建符号链接
                    #[cfg(windows)]
                    {
                        if target_file_path.is_dir() {
                            std::os::windows::fs::symlink_dir(&target_file_path, &source_path)
                        } else {
                            std::os::windows::fs::symlink_file(&target_file_path, &source_path)
                        }
                    }
                    #[cfg(unix)]
                    {
                        std::os::unix::fs::symlink(&target_file_path, &source_path)
                    }
                } else {
                    // 创建硬链接
                    fs::hard_link(&target_file_path, &source_path)
                };

                match link_result {
                    Ok(_) => {
                        processed_count += 1;
                    }
                    Err(e) => {
                        errors.push(format!("创建链接失败 {} -> {}: {}", target_file_path.display(), source_path.display(), e));
                    }
                }
            }
            Err(e) => {
                errors.push(format!("移动文件失败 {} -> {}: {}", source_path.display(), target_file_path.display(), e));
            }
        }
    }

    let mut message = format!("成功处理 {} 个文件", processed_count);
    if !errors.is_empty() {
        message.push_str(&format!("，{} 个错误:\n", errors.len()));
        for error in errors {
            message.push_str(&format!("- {}\n", error));
        }
    }

    Ok(message)
}

// Tauri 命令：仅创建链接（不移动文件）
#[tauri::command]
pub async fn create_links_only(source_paths: Vec<String>, target_dir: String, link_type: String) -> Result<String, String> {
    let target_path = PathBuf::from(&target_dir);

    // 确保目标目录存在
    if !target_path.exists() {
        return Err(format!("目标目录不存在: {}", target_dir));
    }

    if !target_path.is_dir() {
        return Err(format!("目标路径不是目录: {}", target_dir));
    }

    let mut processed_count = 0;
    let mut errors = Vec::new();

    for source_path_str in source_paths {
        let source_path = PathBuf::from(&source_path_str);

        // 检查源文件是否存在
        if !source_path.exists() {
            errors.push(format!("源文件不存在: {}", source_path_str));
            continue;
        }

        let file_name = source_path.file_name()
            .ok_or_else(|| format!("无法获取文件名: {}", source_path_str))?
            .to_string_lossy().to_string();

        let link_path = target_path.join(file_name);

        // 检查链接位置是否已存在
        if link_path.exists() {
            errors.push(format!("目标位置已存在文件: {}", link_path.display()));
            continue;
        }

        // 创建链接
        let link_result = if link_type == "symlink" {
            // 创建符号链接
            #[cfg(windows)]
            {
                if source_path.is_dir() {
                    std::os::windows::fs::symlink_dir(&source_path, &link_path)
                } else {
                    std::os::windows::fs::symlink_file(&source_path, &link_path)
                }
            }
            #[cfg(unix)]
            {
                std::os::unix::fs::symlink(&source_path, &link_path)
            }
        } else {
            // 硬链接不支持目录，且要求在同一文件系统
            if source_path.is_dir() {
                errors.push(format!("硬链接不支持目录: {}", source_path.display()));
                continue;
            }
            fs::hard_link(&source_path, &link_path)
        };

        match link_result {
            Ok(_) => {
                processed_count += 1;
            }
            Err(e) => {
                errors.push(format!("创建链接失败 {} -> {}: {}", source_path.display(), link_path.display(), e));
            }
        }
    }

    let mut message = format!("成功创建 {} 个链接", processed_count);
    if !errors.is_empty() {
        message.push_str(&format!("，{} 个错误:\n", errors.len()));
        for error in errors {
            message.push_str(&format!("- {}\n", error));
        }
    }

    Ok(message)
}

// Tauri 命令：检查路径是否为目录
#[tauri::command]
pub fn is_directory(path: String) -> Result<bool, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!("路径不存在: {}", path.display()));
    }
    Ok(path.is_dir())
}