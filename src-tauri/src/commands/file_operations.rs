use std::fs;
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::time::Instant;
use regex::Regex;
use serde::{Deserialize, Serialize};
use fs_extra;
use std::path::Component;

// 正则规则结构体
#[derive(Deserialize)]
pub struct RegexRule {
    pub regex: String,
    pub replacement: String,
    pub name: Option<String>,        // 规则名称
    pub preset_name: Option<String>, // 所属预设名称
}

// 解析正则表达式字符串，支持 /pattern/flags 格式
fn parse_regex_pattern(pattern: &str) -> Result<(String, String), String> {
    // 检查是否是 /pattern/flags 格式
    if pattern.starts_with('/') {
        if let Some(end_pos) = pattern[1..].rfind('/') {
            let pattern_part = &pattern[1..end_pos + 1];
            let flags_part = &pattern[end_pos + 2..];
            
            // 验证 flags 只包含合法字符
            for c in flags_part.chars() {
                if !"imsuxU".contains(c) {
                    return Err(format!("无效的正则标志: {}", c));
                }
            }
            
            return Ok((pattern_part.to_string(), flags_part.to_string()));
        }
    }
    
    // 默认使用 m 标志以支持多行匹配
    Ok((pattern.to_string(), "m".to_string()))
}

// 根据标志构建正则表达式
fn build_regex_with_flags(pattern: &str, flags: &str) -> Result<Regex, regex::Error> {
    let mut builder = regex::RegexBuilder::new(pattern);
    
    for flag in flags.chars() {
        match flag {
            'i' => { builder.case_insensitive(true); },
            'm' => { builder.multi_line(true); },
            's' => { builder.dot_matches_new_line(true); },
            'u' => { builder.unicode(true); },
            'x' => { builder.ignore_whitespace(true); },
            'U' => { builder.swap_greed(true); },
            _ => {}
        }
    }
    
    builder.build()
}

// 日志条目结构体
#[derive(Serialize, Clone)]
pub struct LogEntry {
    pub message: String,
    pub level: String, // "info", "warn", "error"
}

// 文件处理结果结构体
#[derive(Serialize)]
pub struct ProcessResult {
    pub success_count: usize,
    pub error_count: usize,
    pub total_matches: usize,
    pub duration_ms: f64,
    pub errors: HashMap<String, String>,
    pub logs: Vec<LogEntry>,
}

// Tauri 命令：批量处理文件应用正则规则
#[tauri::command]
pub async fn process_files_with_regex(
    file_paths: Vec<String>,
    output_dir: String,
    rules: Vec<RegexRule>,
    force_txt: Option<bool>,
    filename_suffix: Option<String>
) -> Result<ProcessResult, String> {
    let start_time = Instant::now();
    let force_txt = force_txt.unwrap_or(false);
    let filename_suffix = filename_suffix.unwrap_or_default();
    let output_path = PathBuf::from(&output_dir);
    let mut logs = Vec::new();
    
    // 添加日志辅助函数
    let mut add_log = |message: String, level: &str| {
        println!("{}", message);
        logs.push(LogEntry {
            message,
            level: level.to_string(),
        });
    };
    
    add_log("========== 正则文件处理开始 ==========".to_string(), "info");
    add_log(format!("输出目录: {}", output_dir), "info");
    add_log(format!("规则数量: {}", rules.len()), "info");
    add_log(format!("强制 TXT: {}", force_txt), "info");
    if !filename_suffix.is_empty() {
        add_log(format!("文件后缀: {}", filename_suffix), "info");
    }
    
    // 确保输出目录存在
    if !output_path.exists() {
        fs::create_dir_all(&output_path)
            .map_err(|e| format!("创建输出目录失败: {}", e))?;
    }
    
    if !output_path.is_dir() {
        return Err(format!("输出路径不是目录: {}", output_dir));
    }
    
    // 编译所有正则表达式
    add_log("--- 编译正则表达式 ---".to_string(), "info");
    let mut compiled_rules_vec = Vec::new();
    let mut skipped_count = 0;
    
    for (idx, rule) in rules.iter().enumerate() {
        // 构建规则标识（用于日志和错误消息）
        let rule_label = match (&rule.preset_name, &rule.name) {
            (Some(preset), Some(name)) => format!("[{}] {}", preset, name),
            (Some(preset), None) => format!("[{}] 规则 {}", preset, idx + 1),
            (None, Some(name)) => name.clone(),
            (None, None) => format!("规则 {}", idx + 1),
        };
        
        let (pattern, flags) = match parse_regex_pattern(&rule.regex) {
            Ok(result) => result,
            Err(e) => {
                add_log(format!("⚠ {} 跳过: {} - Rust 后端不支持该语法", rule_label, e), "warn");
                skipped_count += 1;
                continue;
            }
        };
        
        add_log(format!("{}: /{}/{} -> \"{}\"", rule_label, pattern, flags, rule.replacement), "info");
        
        match build_regex_with_flags(&pattern, &flags) {
            Ok(r) => {
                compiled_rules_vec.push((r, rule.replacement.clone(), pattern, flags));
            }
            Err(e) => {
                add_log(format!("⚠ {} 跳过: 无效的正则表达式 '{}' - {} (Rust 后端不支持)", rule_label, rule.regex, e), "warn");
                skipped_count += 1;
            }
        }
    }
    
    if skipped_count > 0 {
        add_log(format!("已跳过 {} 条 Rust 后端不支持的规则", skipped_count), "warn");
    }
    
    if compiled_rules_vec.is_empty() {
        return Err("所有规则都无法在 Rust 后端编译，请检查规则语法".to_string());
    }
    
    // 收集所有需要处理的文件
    add_log("--- 收集文件 ---".to_string(), "info");
    let mut all_files = Vec::new();
    for path_str in &file_paths {
        let path = PathBuf::from(path_str);
        if path.is_file() {
            all_files.push(path);
        } else if path.is_dir() {
            collect_files_recursive(&path, &mut all_files)?;
        }
    }
    add_log(format!("找到 {} 个文件待处理", all_files.len()), "info");
    
    // 处理每个文件
    add_log("--- 处理文件 ---".to_string(), "info");
    let mut success_count = 0;
    let mut error_count = 0;
    let mut errors = HashMap::new();
    let mut total_matches = 0;
    
    for (idx, file_path) in all_files.iter().enumerate() {
        let file_name = file_path.display().to_string();
        match process_single_file(file_path, &output_path, &compiled_rules_vec, force_txt, &filename_suffix) {
            Ok(matches) => {
                success_count += 1;
                total_matches += matches;
                add_log(format!("[{}/{}] {}: 成功 (匹配 {} 次)", idx + 1, all_files.len(), file_name, matches), "info");
            },
            Err(e) => {
                error_count += 1;
                errors.insert(file_name.clone(), e.clone());
                add_log(format!("[{}/{}] {}: 失败 - {}", idx + 1, all_files.len(), file_name, e), "error");
            }
        }
    }
    
    let duration = start_time.elapsed();
    let duration_ms = duration.as_secs_f64() * 1000.0;
    
    add_log("========== 处理完成 ==========".to_string(), "info");
    add_log(format!("成功: {} 个文件", success_count), "info");
    add_log(format!("失败: {} 个文件", error_count), if error_count > 0 { "warn" } else { "info" });
    add_log(format!("总匹配次数: {}", total_matches), "info");
    add_log(format!("总耗时: {:.2}ms", duration_ms), "info");
    add_log("================================".to_string(), "info");
    
    Ok(ProcessResult {
        success_count,
        error_count,
        total_matches,
        duration_ms,
        errors,
        logs,
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

// 处理单个文件，返回总匹配次数
fn process_single_file(
    file_path: &Path,
    output_dir: &Path,
    rules: &[(Regex, String, String, String)], // (regex, replacement, pattern, flags)
    force_txt: bool,
    filename_suffix: &str
) -> Result<usize, String> {
    // 读取文件内容
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("读取文件失败: {}", e))?;
    
    let original_len = content.len();
    
    // 应用所有正则规则
    let mut processed = content.clone();
    let mut total_matches = 0;
    
    for (regex, replacement, _pattern, _flags) in rules {
        let before = processed.clone();
        let matches = regex.find_iter(&before).count();
        if matches > 0 {
            processed = regex.replace_all(&processed, replacement.as_str()).to_string();
            total_matches += matches;
        }
    }
    
    let final_len = processed.len();
    let text_changed = content != processed;
    
    // 构造输出文件路径
    let original_name = file_path.file_stem()
        .ok_or_else(|| "无法获取文件名".to_string())?
        .to_string_lossy();
    
    let extension = if force_txt {
        "txt".to_string()
    } else {
        file_path.extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_else(|| "txt".to_string())
    };
    
    let final_name = if filename_suffix.is_empty() {
        format!("{}.{}", original_name, extension)
    } else {
        format!("{}{}.{}", original_name, filename_suffix, extension)
    };
    
    let output_file = output_dir.join(final_name);
    
    // 写入处理后的内容
    fs::write(&output_file, &processed)
        .map_err(|e| format!("写入文件失败: {}", e))?;
    
    // 如果文本发生变化，输出详细统计
    if text_changed {
        let len_diff = final_len as i64 - original_len as i64;
        let sign = if len_diff >= 0 { "+" } else { "" };
        println!("    原始长度: {} 字符, 处理后: {} 字符 ({}{})",
                 original_len, final_len, sign, len_diff);
    }
    
    Ok(total_matches)
}

// 检测是否跨盘/跨设备移动
fn is_cross_device(source: &Path, target_dir: &Path) -> bool {
    #[cfg(windows)]
    {
        // Windows: 比较盘符（如 C:\ 和 E:\）
        let source_prefix = source.components().find_map(|c| {
            if let Component::Prefix(prefix) = c {
                Some(prefix.as_os_str().to_owned())
            } else {
                None
            }
        });
        
        let target_prefix = target_dir.components().find_map(|c| {
            if let Component::Prefix(prefix) = c {
                Some(prefix.as_os_str().to_owned())
            } else {
                None
            }
        });
        
        source_prefix != target_prefix
    }
    
    #[cfg(unix)]
    {
        // Unix: 比较设备 ID
        use std::os::unix::fs::MetadataExt;
        if let (Ok(source_meta), Ok(target_meta)) = (source.metadata(), target_dir.metadata()) {
            source_meta.dev() != target_meta.dev()
        } else {
            false
        }
    }
    
    #[cfg(not(any(windows, unix)))]
    {
        false
    }
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

        // 检测是否跨盘移动
        let is_cross_dev = is_cross_device(&source_path, &target_path);
        
        // 执行文件移动
        let move_success = if is_cross_dev {
            // 跨盘移动：使用复制+删除
            let copy_result = if source_path.is_dir() {
                fs_extra::dir::copy(&source_path, &target_path, &fs_extra::dir::CopyOptions::new())
                    .map(|_| ())
            } else {
                fs_extra::file::copy(&source_path, &target_file_path, &fs_extra::file::CopyOptions::new())
                    .map(|_| ())
            };
            
            match copy_result {
                Ok(_) => {
                    // 复制成功，删除源文件
                    let remove_result = if source_path.is_dir() {
                        fs::remove_dir_all(&source_path)
                    } else {
                        fs::remove_file(&source_path)
                    };
                    
                    match remove_result {
                        Ok(_) => true,
                        Err(e) => {
                            errors.push(format!("删除源文件失败 {}: {}（文件已复制到目标位置）", source_path.display(), e));
                            false
                        }
                    }
                }
                Err(e) => {
                    errors.push(format!("跨盘复制文件失败 {} -> {}: {}", source_path.display(), target_file_path.display(), e));
                    false
                }
            }
        } else {
            // 同盘移动：使用快速的 rename
            match fs::rename(&source_path, &target_file_path) {
                Ok(_) => true,
                Err(e) => {
                    errors.push(format!("移动文件失败 {} -> {}: {}", source_path.display(), target_file_path.display(), e));
                    false
                }
            }
        };

        if move_success {
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

// Tauri 命令：读取文件为base64
#[tauri::command]
pub fn read_file_as_base64(path: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};
    
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    
    let bytes = fs::read(file_path)
        .map_err(|e| format!("读取文件失败: {}", e))?;
    
    Ok(general_purpose::STANDARD.encode(&bytes))
}