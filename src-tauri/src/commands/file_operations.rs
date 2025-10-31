use std::fs;
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::time::Instant;
use regex::Regex;
use serde::{Deserialize, Serialize};
use fs_extra;
#[cfg(windows)]
use std::path::Component;
use tokio_util::sync::CancellationToken;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use std::time::SystemTime;
use lazy_static::lazy_static;

// 进度事件结构体
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyProgress {
    pub current_file: String,
    pub copied_bytes: u64,
    pub total_bytes: u64,
    pub progress_percentage: f64,
}

// 操作日志条目
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationLog {
    pub timestamp: u64,
    pub operation_type: String,    // "move" 或 "link-only"
    pub link_type: String,         // "symlink" 或 "link"
    pub source_count: usize,
    pub success_count: usize,
    pub error_count: usize,
    pub errors: Vec<String>,
    pub duration_ms: u128,
    pub target_directory: String,  // 目标目录
    pub source_paths: Vec<String>, // 源文件路径列表
    pub total_size: u64,           // 总文件大小（字节）
    pub processed_files: Vec<String>, // 成功处理的文件名列表
}

// 全局操作日志历史（最多保存100条）
lazy_static! {
    static ref OPERATION_LOGS: Mutex<Vec<OperationLog>> = Mutex::new(Vec::new());
}

// 添加操作日志
fn add_operation_log(log: OperationLog) {
    if let Ok(mut logs) = OPERATION_LOGS.lock() {
        logs.push(log);
        // 只保留最近100条
        if logs.len() > 100 {
            logs.remove(0);
        }
    }
}

// 获取最新的操作日志
#[tauri::command]
pub fn get_latest_operation_log() -> Option<OperationLog> {
    if let Ok(logs) = OPERATION_LOGS.lock() {
        logs.last().cloned()
    } else {
        None
    }
}

// 获取所有操作日志
#[tauri::command]
pub fn get_all_operation_logs() -> Vec<OperationLog> {
    if let Ok(logs) = OPERATION_LOGS.lock() {
        logs.clone()
    } else {
        Vec::new()
    }
}

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
            
            // 过滤并验证 flags
            let mut valid_flags = String::new();
            let mut has_g_flag = false;
            
            for c in flags_part.chars() {
                if c == 'g' {
                    // JavaScript 的 g 标志在 Rust 中不需要（replace_all 已是全局替换）
                    has_g_flag = true;
                } else if "imsuxU".contains(c) {
                    valid_flags.push(c);
                } else {
                    return Err(format!("无效的正则标志: {} - Rust 后端不支持该语法", c));
                }
            }
            
            // 如果原本有 g 标志但被过滤，返回处理后的标志和提示
            if has_g_flag && !flags_part.chars().all(|c| c == 'g') {
                // 有其他有效标志，仅过滤 g
                return Ok((pattern_part.to_string(), valid_flags));
            } else if has_g_flag {
                // 只有 g 标志，使用默认的 m 标志
                return Ok((pattern_part.to_string(), "m".to_string()));
            }
            
            return Ok((pattern_part.to_string(), valid_flags));
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

// 递归计算目录大小
fn calculate_dir_size(dir: &Path) -> Result<u64, std::io::Error> {
    let mut total = 0u64;
    
    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_file() {
                if let Ok(metadata) = path.metadata() {
                    total += metadata.len();
                }
            } else if path.is_dir() {
                total += calculate_dir_size(&path).unwrap_or(0);
            }
        }
    }
    
    Ok(total)
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

// Tauri 命令：文件移动和符号链接创建（带进度和取消支持）
#[tauri::command]
pub async fn move_and_link(
    app: AppHandle,
    source_paths: Vec<String>,
    target_dir: String,
    link_type: String,
    cancel_token: tauri::State<'_, Arc<CancellationToken>>
) -> Result<String, String> {
    let start_time = Instant::now();
    let timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    let target_path = PathBuf::from(&target_dir);

    // 确保目标目录存在
    if !target_path.exists() {
        return Err(format!("目标目录不存在: {}", target_dir));
    }

    if !target_path.is_dir() {
        return Err(format!("目标路径不是目录: {}", target_dir));
    }

    let source_count = source_paths.len();
    let mut processed_count = 0;
    let mut errors = Vec::new();
    let mut total_size = 0u64;
    let mut processed_files = Vec::new();

    for source_path_str in &source_paths {
        let source_path = PathBuf::from(&source_path_str);

        // 检查源文件是否存在
        if !source_path.exists() {
            errors.push(format!("源文件不存在: {}", source_path_str));
            continue;
        }

        let file_name = source_path.file_name()
            .ok_or_else(|| format!("无法获取文件名: {}", source_path_str))?
            .to_string_lossy().to_string();

        let target_file_path = target_path.join(&file_name);
        
        // 计算文件/目录大小
        if let Ok(metadata) = source_path.metadata() {
            total_size += if metadata.is_file() {
                metadata.len()
            } else {
                // 目录递归计算大小
                calculate_dir_size(&source_path).unwrap_or(0)
            };
        }

        // 检查目标文件是否已存在
        if target_file_path.exists() {
            errors.push(format!("目标文件已存在: {}", target_file_path.display()));
            continue;
        }

        // 检查是否已取消
        if cancel_token.is_cancelled() {
            return Err("操作已被用户取消".to_string());
        }

        // 检测是否跨盘移动
        let is_cross_dev = is_cross_device(&source_path, &target_path);
        
        // 执行文件移动
        let move_success = if is_cross_dev {
            // 跨盘移动：使用带进度的复制+删除
            let token_clone = cancel_token.inner().clone();
            let app_clone = app.clone();
            let source_name = source_path_str.clone();
            
            let copy_result = if source_path.is_dir() {
                // 目录复制暂不支持进度（fs_extra 的目录复制进度回调较复杂）
                fs_extra::dir::copy(&source_path, &target_path, &fs_extra::dir::CopyOptions::new())
                    .map(|_| ())
            } else {
                // 文件复制支持进度回调
                let options = fs_extra::file::CopyOptions::new();
                fs_extra::file::copy_with_progress(
                    &source_path,
                    &target_file_path,
                    &options,
                    |process: fs_extra::file::TransitProcess| {
                        // 检查取消状态
                        if token_clone.is_cancelled() {
                            // fs_extra 的进度回调不支持中断，只能记录状态
                            // 实际的取消检查在复制完成后进行
                        }
                        
                        // 发送进度事件
                        let progress = CopyProgress {
                            current_file: source_name.clone(),
                            copied_bytes: process.copied_bytes,
                            total_bytes: process.total_bytes,
                            progress_percentage: if process.total_bytes > 0 {
                                (process.copied_bytes as f64 / process.total_bytes as f64) * 100.0
                            } else {
                                0.0
                            },
                        };
                        
                        let _ = app_clone.emit("copy-progress", progress);
                    }
                ).map(|_| ())
            };
            
            match copy_result {
                Ok(_) => {
                    // 复制成功，使用 trash 移入回收站而非直接删除
                    let remove_result = trash::delete(&source_path);
                    
                    match remove_result {
                        Ok(_) => true,
                        Err(e) => {
                            errors.push(format!("移入回收站失败 {}: {}（文件已复制到目标位置）", source_path.display(), e));
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
            processed_files.push(file_name);
        }
        Err(e) => {
            errors.push(format!("创建链接失败 {} -> {}: {}", target_file_path.display(), source_path.display(), e));
        }
    }
}
    }

    let duration = start_time.elapsed();
    
    // 记录操作日志
    let log = OperationLog {
        timestamp,
        operation_type: "move".to_string(),
        link_type: link_type.clone(),
        source_count,
        success_count: processed_count,
        error_count: errors.len(),
        errors: errors.clone(),
        duration_ms: duration.as_millis(),
        target_directory: target_dir.clone(),
        source_paths: source_paths.clone(),
        total_size,
        processed_files,
    };
    add_operation_log(log);

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
    let start_time = Instant::now();
    let timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    let target_path = PathBuf::from(&target_dir);

    // 确保目标目录存在
    if !target_path.exists() {
        return Err(format!("目标目录不存在: {}", target_dir));
    }

    if !target_path.is_dir() {
        return Err(format!("目标路径不是目录: {}", target_dir));
    }

    let source_count = source_paths.len();
    let mut processed_count = 0;
    let mut errors = Vec::new();
    let mut total_size = 0u64;
    let mut processed_files = Vec::new();

    for source_path_str in &source_paths {
        let source_path = PathBuf::from(&source_path_str);

        // 检查源文件是否存在
        if !source_path.exists() {
            errors.push(format!("源文件不存在: {}", source_path_str));
            continue;
        }

        let file_name = source_path.file_name()
            .ok_or_else(|| format!("无法获取文件名: {}", source_path_str))?
            .to_string_lossy().to_string();

        let link_path = target_path.join(&file_name);
        
        // 计算文件/目录大小
        if let Ok(metadata) = source_path.metadata() {
            total_size += if metadata.is_file() {
                metadata.len()
            } else {
                calculate_dir_size(&source_path).unwrap_or(0)
            };
        }

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
                processed_files.push(file_name);
            }
            Err(e) => {
                errors.push(format!("创建链接失败 {} -> {}: {}", source_path.display(), link_path.display(), e));
            }
        }
    }

    let duration = start_time.elapsed();
    
    // 记录操作日志
    let log = OperationLog {
        timestamp,
        operation_type: "link-only".to_string(),
        link_type: link_type.clone(),
        source_count,
        success_count: processed_count,
        error_count: errors.len(),
        errors: errors.clone(),
        duration_ms: duration.as_millis(),
        target_directory: target_dir.clone(),
        source_paths: source_paths.clone(),
        total_size,
        processed_files,
    };
    add_operation_log(log);

    let mut message = format!("成功创建 {} 个链接", processed_count);
    if !errors.is_empty() {
        message.push_str(&format!("，{} 个错误:\n", errors.len()));
        for error in errors {
            message.push_str(&format!("- {}\n", error));
        }
    }

    Ok(message)
}

// Tauri 命令：检查路径是否存在
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
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

// 文件元数据结构
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub size: u64,
    pub is_file: bool,
    pub is_dir: bool,
    pub modified: Option<u64>,
    pub created: Option<u64>,
}
// Tauri 命令：获取文件元数据
#[tauri::command]
pub fn get_file_metadata(path: String) -> Result<FileMetadata, String> {
    let path = Path::new(&path);
    
    if !path.exists() {
        return Err(format!("路径不存在: {}", path.display()));
    }
    
    let metadata = fs::metadata(path)
        .map_err(|e| format!("获取文件元数据失败: {}", e))?;
    
    let modified = metadata.modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());
    
    let created = metadata.created()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());
    
    Ok(FileMetadata {
        size: metadata.len(),
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
        modified,
        created,
    })
}

// Tauri 命令：读取文件为二进制数据
#[tauri::command]
pub fn read_file_binary(path: String) -> Result<Vec<u8>, String> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    
    let bytes = fs::read(file_path)
        .map_err(|e| format!("读取文件失败: {}", e))?;
    
    Ok(bytes)
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

// Tauri 命令：取消文件移动操作
#[tauri::command]
pub fn cancel_move_operation(cancel_token: tauri::State<'_, Arc<CancellationToken>>) {
    cancel_token.inner().cancel();
}

// 文件验证结果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileValidation {
    pub is_directory: bool,
    pub is_cross_device: bool,
    pub exists: bool,
}

// Tauri 命令：验证文件属性（用于硬链接检查）
#[tauri::command]
pub fn validate_file_for_link(source_path: String, target_dir: String, link_type: String) -> Result<FileValidation, String> {
    let source = PathBuf::from(&source_path);
    let target = PathBuf::from(&target_dir);
    
    if !source.exists() {
        return Ok(FileValidation {
            is_directory: false,
            is_cross_device: false,
            exists: false,
        });
    }
    
    let is_dir = source.is_dir();
    
    // 只有硬链接需要检查跨设备
    let is_cross_dev = if link_type == "link" {
        if target.exists() {
            is_cross_device(&source, &target)
        } else {
            false
        }
    } else {
        false
    };
    
    Ok(FileValidation {
        is_directory: is_dir,
        is_cross_device: is_cross_dev,
        exists: true,
    })
}

// Tauri 命令：保存上传的文件到应用数据目录
#[tauri::command]
pub async fn save_uploaded_file(
    app: AppHandle,
    file_data: Vec<u8>,
    filename: String,
    subdirectory: String,
) -> Result<String, String> {
    use tauri::Manager;
    
    // 获取应用数据目录
    let app_data_dir = app.path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    
    // 创建子目录路径
    let target_dir = app_data_dir.join(&subdirectory);
    
    // 确保目录存在
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    
    // 构建目标文件路径
    let target_file = target_dir.join(&filename);
    
    // 写入文件
    fs::write(&target_file, &file_data)
        .map_err(|e| format!("写入文件失败: {}", e))?;
    
    // 返回相对于应用数据目录的路径
    let relative_path = target_file.strip_prefix(&app_data_dir)
        .map_err(|e| format!("生成相对路径失败: {}", e))?;
    
    Ok(relative_path.to_string_lossy().to_string())
}

// Tauri 命令：删除文件到回收站
#[tauri::command]
pub async fn delete_file_to_trash(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    
    // 检查文件是否存在
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }
    
    // 使用 trash crate 移到回收站
    trash::delete(&path)
        .map_err(|e| format!("移入回收站失败: {}", e))?;
    
    Ok(format!("文件已移入回收站: {}", file_path))
}

// 正则验证结果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexValidation {
    pub is_valid: bool,
    pub error_message: Option<String>,
    pub parsed_pattern: Option<String>,
    pub parsed_flags: Option<String>,
    pub warning: Option<String>,
}

// Tauri 命令：验证正则表达式的 Rust 兼容性
#[tauri::command]
pub fn validate_regex_pattern(regex: String) -> RegexValidation {
    // 解析正则表达式
    let (pattern, flags) = match parse_regex_pattern(&regex) {
        Ok(result) => result,
        Err(e) => {
            return RegexValidation {
                is_valid: false,
                error_message: Some(e),
                parsed_pattern: None,
                parsed_flags: None,
                warning: None,
            };
        }
    };
    
    // 检查是否有被过滤的 g 标志
    let has_g_warning = regex.contains("/g") && !flags.contains('g');
    
    // 尝试编译正则表达式
    match build_regex_with_flags(&pattern, &flags) {
        Ok(_) => {
            RegexValidation {
                is_valid: true,
                error_message: None,
                parsed_pattern: Some(pattern),
                parsed_flags: Some(flags.clone()),
                warning: if has_g_warning {
                    Some("JavaScript 的 g 标志在 Rust 中不需要（replace_all 已是全局替换），已自动过滤".to_string())
                } else {
                    None
                },
            }
        }
        Err(e) => {
            // 检查是否是常见的不支持特性
            let error_str = e.to_string();
            let error_message = if error_str.contains("look-around") || error_str.contains("look-ahead") || error_str.contains("look-behind") {
                format!("Rust 正则引擎不支持前瞻/后瞻断言 (?=...) (?!...) (?<=...) (?<!...)：{}", e)
            } else if error_str.contains("backreference") {
                format!("Rust 正则引擎不支持反向引用 \\1 \\2 等：{}", e)
            } else {
                format!("无效的正则表达式：{}", e)
            };
            
            RegexValidation {
                is_valid: false,
                error_message: Some(error_message),
                parsed_pattern: Some(pattern),
                parsed_flags: Some(flags),
                warning: None,
            }
        }
    }
}

// Tauri 命令：打开文件所在目录
#[tauri::command]
pub fn open_file_directory(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    
    // 获取文件所在目录
    let dir = if path.is_file() {
        path.parent()
            .ok_or_else(|| "无法获取文件所在目录".to_string())?
    } else if path.is_dir() {
        &path
    } else {
        return Err(format!("路径不存在: {}", file_path));
    };
    
    // 使用系统命令打开目录
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }
    
    Ok(format!("已打开目录: {}", dir.display()))
}

// Tauri 命令：从应用数据目录复制文件
#[tauri::command]
pub async fn copy_file_to_app_data(
    app: AppHandle,
    source_path: String,
    subdirectory: String,
    new_filename: Option<String>,
) -> Result<String, String> {
    use tauri::Manager;
    
    let source = PathBuf::from(&source_path);
    
    // 检查源文件是否存在
    if !source.exists() {
        return Err(format!("源文件不存在: {}", source_path));
    }
    
    if !source.is_file() {
        return Err(format!("源路径不是文件: {}", source_path));
    }
    
    // 获取应用数据目录
    let app_data_dir = app.path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    
    // 创建子目录路径
    let target_dir = app_data_dir.join(&subdirectory);
    
    // 确保目录存在
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    
    // 确定目标文件名
    let filename = new_filename.unwrap_or_else(|| {
        source.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });
    
    // 构建目标文件路径
    let target_file = target_dir.join(&filename);
    
    // 复制文件
    fs::copy(&source, &target_file)
        .map_err(|e| format!("复制文件失败: {}", e))?;
    
    // 返回相对于应用数据目录的路径
    let relative_path = target_file.strip_prefix(&app_data_dir)
        .map_err(|e| format!("生成相对路径失败: {}", e))?;
    
    Ok(relative_path.to_string_lossy().to_string())
}