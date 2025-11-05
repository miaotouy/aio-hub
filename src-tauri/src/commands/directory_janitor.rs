use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use regex::Regex;
use tauri::{Emitter, State};
use crate::events::DirectoryScanProgress;

// 全局扫描取消标志
pub struct ScanCancellation {
    cancelled: Arc<AtomicBool>,
}

impl ScanCancellation {
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

impl Default for ScanCancellation {
    fn default() -> Self {
        Self::new()
    }
}

// 全局清理取消标志
pub struct CleanupCancellation {
    cancelled: Arc<AtomicBool>,
}

impl CleanupCancellation {
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

impl Default for CleanupCancellation {
    fn default() -> Self {
        Self::new()
    }
}

// 项目信息结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemInfo {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64, // Unix timestamp in seconds
}

// 统计信息结构
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Statistics {
    pub total_items: usize,
    pub total_size: u64,
    pub total_dirs: usize,
    pub total_files: usize,
}

// 分析结果结构
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResult {
    pub items: Vec<ItemInfo>,
    pub statistics: Statistics,
}

// 清理结果结构
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    pub success_count: usize,
    pub error_count: usize,
    pub freed_space: u64,
    pub errors: Vec<String>,
}

// 过滤条件结构
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterCriteria {
    pub name_pattern: Option<String>,
    pub min_age_days: Option<u32>,
    pub min_size_mb: Option<u64>,
    pub max_depth: Option<usize>,
}

// 递归计算目录大小（复用自 file_operations.rs 的逻辑）
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

// 获取文件/目录的修改时间
fn get_modified_time(path: &Path) -> Result<u64, std::io::Error> {
    let metadata = path.metadata()?;
    let modified = metadata.modified()?;
    let duration = modified.duration_since(SystemTime::UNIX_EPOCH)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    Ok(duration.as_secs())
}

// 检查路径是否匹配名称模式（支持通配符）
fn matches_name_pattern(name: &str, pattern: &str) -> bool {
    // 简单的通配符转换为正则表达式
    // * -> .*
    // ? -> .
    let regex_pattern = pattern
        .replace(".", r"\.")
        .replace("*", ".*")
        .replace("?", ".");
    
    if let Ok(regex) = Regex::new(&format!("^{}$", regex_pattern)) {
        regex.is_match(name)
    } else {
        false
    }
}

// 递归分析目录
fn analyze_directory_recursive(
    dir: &Path,
    root: &Path,
    criteria: &FilterCriteria,
    current_depth: usize,
    items: &mut Vec<ItemInfo>,
    window: Option<&tauri::Window>,
    scanned_count: &mut usize,
    cancellation: &ScanCancellation,
) -> Result<(), String> {
    // 检查是否已取消
    if cancellation.is_cancelled() {
        return Err("扫描已被用户取消".to_string());
    }
    // 检查深度限制
    if let Some(max_depth) = criteria.max_depth {
        if current_depth >= max_depth {
            return Ok(());
        }
    }
    
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("读取目录失败 {}: {}", dir.display(), e))?;
    
    let current_time = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        
        // 跳过隐藏文件（以 . 开头）
        if name.starts_with('.') {
            continue;
        }
        
        let is_dir = path.is_dir();
        
        // 获取大小
        let size = if is_dir {
            calculate_dir_size(&path).unwrap_or(0)
        } else {
            path.metadata().ok().map(|m| m.len()).unwrap_or(0)
        };
        
        // 获取修改时间
        let modified = get_modified_time(&path).unwrap_or(0);
        
        // 应用过滤条件
        let mut matches = true;
        
        // 名称模式过滤
        if let Some(ref pattern) = criteria.name_pattern {
            if !pattern.is_empty() {
                matches = matches && matches_name_pattern(&name, pattern);
            }
        }
        
        // 最小年龄过滤（修改时间早于 N 天前）
        if let Some(min_age_days) = criteria.min_age_days {
            let age_seconds = current_time.saturating_sub(modified);
            let age_days = age_seconds / 86400; // 86400 秒 = 1 天
            matches = matches && (age_days >= min_age_days as u64);
        }
        
        // 最小大小过滤（大于 N MB）
        if let Some(min_size_mb) = criteria.min_size_mb {
            let size_mb = size / (1024 * 1024);
            matches = matches && (size_mb >= min_size_mb);
        }
        
        // 如果匹配，添加到结果列表
        if matches {
            items.push(ItemInfo {
                path: path.to_string_lossy().to_string(),
                name,
                is_dir,
                size,
                modified,
            });
        }
        
        // 更新扫描计数并发送进度事件
        *scanned_count += 1;
        
        // 每扫描 10 个项目发送一次进度事件
        if let Some(window) = window {
            if *scanned_count % 10 == 0 {
                let progress = DirectoryScanProgress {
                    current_path: path.to_string_lossy().to_string(),
                    scanned_count: *scanned_count,
                    current_depth,
                    found_items: items.len(),
                };
                
                if let Err(e) = window.emit("directory-scan-progress", progress) {
                    eprintln!("发送进度事件失败: {}", e);
                }
            }
        }
        
        // 如果是目录，递归处理（无论是否匹配，都要递归扫描子目录）
        if is_dir {
            analyze_directory_recursive(&path, root, criteria, current_depth + 1, items, window, scanned_count, cancellation)?;
        }
    }
    
    Ok(())
}

// Tauri 命令：分析目录，返回符合条件的项目
#[tauri::command]
pub async fn analyze_directory_for_cleanup(
    path: String,
    name_pattern: Option<String>,
    min_age_days: Option<u32>,
    min_size_mb: Option<u64>,
    max_depth: Option<usize>,
    window: tauri::Window,
    cancellation: State<'_, ScanCancellation>,
) -> Result<AnalysisResult, String> {
    // 重置取消标志
    cancellation.reset();
    let root_path = PathBuf::from(&path);
    
    if !root_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    
    if !root_path.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }
    
    let criteria = FilterCriteria {
        name_pattern,
        min_age_days,
        min_size_mb,
        max_depth,
    };
    
    let mut items = Vec::new();
    let mut scanned_count = 0;
    
    // 发送开始扫描事件
    let start_progress = DirectoryScanProgress {
        current_path: path.clone(),
        scanned_count: 0,
        current_depth: 0,
        found_items: 0,
    };
    
    if let Err(e) = window.emit("directory-scan-progress", start_progress) {
        eprintln!("发送开始扫描事件失败: {}", e);
    }
    
    analyze_directory_recursive(&root_path, &root_path, &criteria, 0, &mut items, Some(&window), &mut scanned_count, &cancellation)?;
    
    // 发送扫描完成事件
    let end_progress = DirectoryScanProgress {
        current_path: path.clone(),
        scanned_count,
        current_depth: 0,
        found_items: items.len(),
    };
    
    if let Err(e) = window.emit("directory-scan-progress", end_progress) {
        eprintln!("发送扫描完成事件失败: {}", e);
    }
    
    // 计算统计信息
    let total_items = items.len();
    let total_size: u64 = items.iter().map(|item| item.size).sum();
    let total_dirs = items.iter().filter(|item| item.is_dir).count();
    let total_files = items.iter().filter(|item| !item.is_dir).count();
    
    let statistics = Statistics {
        total_items,
        total_size,
        total_dirs,
        total_files,
    };
    
    Ok(AnalysisResult { items, statistics })
}

// Tauri 命令：清理选定的项目（移入回收站）
#[tauri::command]
pub async fn cleanup_items(
    paths: Vec<String>,
    window: tauri::Window,
    cancellation: State<'_, CleanupCancellation>,
) -> Result<CleanupResult, String> {
    // 重置取消标志
    cancellation.reset();
    
    // 定义清理进度事件结构
    #[derive(Clone, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct CleanupProgress {
        current_item: String,
        processed_count: usize,
        total_count: usize,
        success_count: usize,
        error_count: usize,
    }
    
    let mut success_count = 0;
    let mut error_count = 0;
    let mut freed_space = 0u64;
    let mut errors = Vec::new();
    let total_items = paths.len();
    
    for (index, path_str) in paths.iter().enumerate() {
        // 检查是否已取消
        if cancellation.is_cancelled() {
            errors.push("清理已被用户取消".to_string());
            break;
        }
        
        let path = PathBuf::from(path_str);
        
        // 发送清理进度事件
        let progress = CleanupProgress {
            current_item: path_str.clone(),
            processed_count: index + 1,
            total_count: total_items,
            success_count,
            error_count,
        };
        
        if let Err(e) = window.emit("directory-cleanup-progress", progress) {
            eprintln!("发送清理进度事件失败: {}", e);
        }
        
        if !path.exists() {
            errors.push(format!("路径不存在: {}", path_str));
            error_count += 1;
            continue;
        }
        
        // 计算要释放的空间
        let size = if path.is_dir() {
            calculate_dir_size(&path).unwrap_or(0)
        } else {
            path.metadata().ok().map(|m| m.len()).unwrap_or(0)
        };
        
        // 使用 trash crate 移入回收站（复用自 file_operations.rs）
        match trash::delete(&path) {
            Ok(_) => {
                success_count += 1;
                freed_space += size;
            }
            Err(e) => {
                errors.push(format!("移入回收站失败 {}: {}", path_str, e));
                error_count += 1;
            }
        }
    }
    
    Ok(CleanupResult {
        success_count,
        error_count,
        freed_space,
        errors,
    })
}

// Tauri 命令：停止当前扫描
#[tauri::command]
pub async fn stop_directory_scan(cancellation: State<'_, ScanCancellation>) -> Result<(), String> {
    cancellation.cancel();
    Ok(())
}

// Tauri 命令：停止当前清理
#[tauri::command]
pub async fn stop_directory_cleanup(cancellation: State<'_, CleanupCancellation>) -> Result<(), String> {
    cancellation.cancel();
    Ok(())
}