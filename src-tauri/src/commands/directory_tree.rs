//! 目录树生成模块
//!
//! 使用 `ignore` crate（ripgrep 核心库）实现高性能并行目录遍历。
//! 支持 .gitignore 规则、自定义过滤模式、深度限制等功能。

use ignore::overrides::OverrideBuilder;
use ignore::WalkBuilder;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

// ============================================================================
// 公共数据结构
// ============================================================================

/// 目录树节点
#[derive(Serialize, Clone, Debug)]
pub struct TreeNode {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub children: Vec<TreeNode>,
    pub error: Option<String>,
}

impl TreeNode {
    fn new(name: String, is_dir: bool) -> Self {
        Self {
            name,
            is_dir,
            size: 0,
            children: Vec::new(),
            error: None,
        }
    }

    fn new_with_size(name: String, is_dir: bool, size: u64) -> Self {
        Self {
            name,
            is_dir,
            size,
            children: Vec::new(),
            error: None,
        }
    }
}

/// 目录树统计信息
#[derive(Serialize, Debug)]
pub struct DirectoryTreeStats {
    pub total_dirs: usize,
    pub total_files: usize,
    pub show_files: bool,
    pub show_hidden: bool,
    pub max_depth: String,
    pub filter_count: usize,
}

/// 目录树生成结果
#[derive(Serialize)]
pub struct DirectoryTreeResult {
    pub structure: TreeNode,
    pub stats: DirectoryTreeStats,
}

// ============================================================================
// 内部数据结构
// ============================================================================

/// 扁平化的文件条目，用于并行收集后构建树
#[derive(Debug, Clone)]
struct FileEntry {
    /// 相对于根目录的路径
    relative_path: PathBuf,
    /// 是否是目录
    is_dir: bool,
    /// 文件大小（目录为 0）
    size: u64,
}

/// 统计计数器（线程安全）
struct AtomicStats {
    total_dirs: AtomicUsize,
    total_files: AtomicUsize,
}

impl AtomicStats {
    fn new() -> Self {
        Self {
            total_dirs: AtomicUsize::new(0),
            total_files: AtomicUsize::new(0),
        }
    }
}

// ============================================================================
// 核心实现
// ============================================================================

/// 使用 ignore crate 并行收集文件列表
fn collect_entries_parallel(
    root: &Path,
    show_files: bool,
    show_hidden: bool,
    max_depth: usize,
    use_gitignore: bool,
    custom_patterns: &[String],
) -> Result<(Vec<FileEntry>, usize, usize), String> {
    let stats = Arc::new(AtomicStats::new());
    let entries: Arc<std::sync::Mutex<Vec<FileEntry>>> =
        Arc::new(std::sync::Mutex::new(Vec::new()));

    // 构建 WalkBuilder
    let mut builder = WalkBuilder::new(root);

    // 配置遍历选项
    builder
        .hidden(!show_hidden) // 是否跳过隐藏文件
        .git_ignore(use_gitignore) // 是否使用 .gitignore
        .git_global(use_gitignore) // 是否使用全局 gitignore
        .git_exclude(use_gitignore) // 是否使用 .git/info/exclude
        .ignore(use_gitignore) // 是否使用 .ignore 文件
        .parents(use_gitignore) // 是否检查父目录的 ignore 文件
        .follow_links(false) // 不跟随符号链接
        .same_file_system(false); // 允许跨文件系统

    // 设置深度限制
    if max_depth > 0 {
        builder.max_depth(Some(max_depth));
    }

    // 添加自定义过滤模式
    if !custom_patterns.is_empty() {
        let mut override_builder = OverrideBuilder::new(root);
        for pattern in custom_patterns {
            // ignore crate 的 override 使用 ! 前缀表示"不忽略"
            // 我们的自定义模式是"要忽略的"，所以需要转换
            let ignore_pattern = if let Some(stripped) = pattern.strip_prefix('!') {
                // 否定规则：不忽略 -> 在 override 中就是正常匹配
                stripped.to_string()
            } else {
                // 正常规则：忽略 -> 在 override 中用 ! 前缀
                format!("!{}", pattern)
            };
            if let Err(e) = override_builder.add(&ignore_pattern) {
                log::warn!("无效的过滤模式 '{}': {}", pattern, e);
            }
        }
        if let Ok(overrides) = override_builder.build() {
            builder.overrides(overrides);
        }
    }

    // 使用并行遍历
    let walker = builder.build_parallel();

    let stats_clone = Arc::clone(&stats);
    let root_path = root.to_path_buf();
    let show_files_flag = show_files;

    // 使用独立作用域确保 entries_clone 在遍历结束后被 drop
    // 这样后续的 Arc::try_unwrap 才能成功
    {
        let entries_clone = Arc::clone(&entries);
        walker.run(|| {
            let stats = Arc::clone(&stats_clone);
            let entries = Arc::clone(&entries_clone);
            let root = root_path.clone();

            Box::new(move |result| {
                match result {
                    Ok(entry) => {
                        let path = entry.path();

                        // 跳过根目录本身
                        if path == root {
                            return ignore::WalkState::Continue;
                        }

                        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

                        // 统计
                        if is_dir {
                            stats.total_dirs.fetch_add(1, Ordering::Relaxed);
                        } else {
                            stats.total_files.fetch_add(1, Ordering::Relaxed);
                        }

                        // 如果不显示文件，跳过文件（但仍然统计）
                        if !show_files_flag && !is_dir {
                            return ignore::WalkState::Continue;
                        }

                        // 获取相对路径
                        let relative_path = match path.strip_prefix(&root) {
                            Ok(p) => p.to_path_buf(),
                            Err(_) => return ignore::WalkState::Continue,
                        };

                        // 获取文件大小
                        let size = if is_dir {
                            0
                        } else {
                            entry.metadata().map(|m| m.len()).unwrap_or(0)
                        };

                        // 添加到列表
                        if let Ok(mut list) = entries.lock() {
                            list.push(FileEntry {
                                relative_path,
                                is_dir,
                                size,
                            });
                        }
                    }
                    Err(e) => {
                        log::warn!("遍历错误: {}", e);
                    }
                }
                ignore::WalkState::Continue
            })
        });
    }

    let total_dirs = stats.total_dirs.load(Ordering::Relaxed);
    let total_files = stats.total_files.load(Ordering::Relaxed);

    let entries = Arc::try_unwrap(entries)
        .map_err(|_| "无法获取条目列表".to_string())?
        .into_inner()
        .map_err(|e| format!("锁错误: {}", e))?;

    Ok((entries, total_dirs, total_files))
}

/// 从扁平列表构建树形结构
fn build_tree_from_entries(root_name: String, mut entries: Vec<FileEntry>) -> TreeNode {
    // 按路径排序，确保父目录在子目录之前
    entries.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    let mut root = TreeNode::new(root_name, true);

    // 使用 HashMap 存储路径到节点的映射，用于快速查找父节点
    // key: 路径字符串, value: 在 children 中的索引路径
    let mut path_index: HashMap<PathBuf, Vec<usize>> = HashMap::new();
    path_index.insert(PathBuf::new(), vec![]); // 根节点

    for entry in entries {
        let parent_path = entry
            .relative_path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_default();

        let name = entry
            .relative_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let node = TreeNode::new_with_size(name, entry.is_dir, entry.size);

        // 找到父节点并添加子节点
        if let Some(parent_indices) = path_index.get(&parent_path).cloned() {
            let child_index = insert_node_at_path(&mut root, &parent_indices, node);

            // 记录新节点的索引路径
            let mut new_indices = parent_indices;
            new_indices.push(child_index);
            path_index.insert(entry.relative_path.clone(), new_indices);
        }
    }

    // 计算目录大小（自底向上累加）
    calculate_dir_sizes(&mut root);

    // 排序：目录在前，然后按名称排序
    sort_tree(&mut root);

    root
}

/// 在指定路径插入节点，返回插入位置的索引
fn insert_node_at_path(root: &mut TreeNode, indices: &[usize], node: TreeNode) -> usize {
    let mut current = root;
    for &idx in indices {
        current = &mut current.children[idx];
    }
    current.children.push(node);
    current.children.len() - 1
}

/// 递归计算目录大小
fn calculate_dir_sizes(node: &mut TreeNode) -> u64 {
    if !node.is_dir {
        return node.size;
    }

    let mut total_size = 0u64;
    for child in &mut node.children {
        total_size += calculate_dir_sizes(child);
    }
    node.size = total_size;
    total_size
}

/// 递归排序树节点
fn sort_tree(node: &mut TreeNode) {
    // 先递归排序子节点
    for child in &mut node.children {
        sort_tree(child);
    }

    // 排序当前节点的子节点：目录在前，然后按名称排序
    node.children.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
}

// ============================================================================
// macOS Spotlight 支持（可选）
// ============================================================================

#[cfg(target_os = "macos")]
mod spotlight {
    use std::path::{Path, PathBuf};
    use std::process::Command;

    /// 使用 mdfind 快速获取目录下的所有文件
    pub fn query_spotlight(root: &Path) -> Result<Vec<PathBuf>, String> {
        let output = Command::new("mdfind")
            .args(["-onlyin", root.to_str().unwrap_or("."), "."])
            .output()
            .map_err(|e| format!("执行 mdfind 失败: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "mdfind 返回错误: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let paths: Vec<PathBuf> = String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter(|line| !line.is_empty())
            .map(PathBuf::from)
            .filter(|p| p.starts_with(root))
            .collect();

        Ok(paths)
    }

    /// 检查 Spotlight 是否可用
    pub fn is_available() -> bool {
        Command::new("mdfind")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

// ============================================================================
// Tauri 命令
// ============================================================================

/// 生成目录树
///
/// # 参数
/// - `path`: 目标目录路径
/// - `show_files`: 是否显示文件
/// - `show_hidden`: 是否显示隐藏文件
/// - `max_depth`: 最大深度（0 表示无限制）
/// - `ignore_patterns`: 忽略模式列表，特殊值 `__USE_GITIGNORE__` 表示启用 gitignore
#[tauri::command]
pub async fn generate_directory_tree(
    path: String,
    show_files: bool,
    show_hidden: bool,
    max_depth: usize,
    ignore_patterns: Vec<String>,
) -> Result<DirectoryTreeResult, String> {
    let root_path = PathBuf::from(&path);

    if !root_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    if !root_path.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }

    // 解析参数
    let use_gitignore = ignore_patterns.iter().any(|p| p == "__USE_GITIGNORE__");
    let custom_patterns: Vec<String> = ignore_patterns
        .into_iter()
        .filter(|p| !p.is_empty() && p != "__USE_GITIGNORE__")
        .collect();

    // 并行收集文件列表
    let (entries, total_dirs, total_files) = collect_entries_parallel(
        &root_path,
        show_files,
        show_hidden,
        max_depth,
        use_gitignore,
        &custom_patterns,
    )?;

    // 获取根目录名称
    let root_name = root_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    // 构建树形结构
    let structure = build_tree_from_entries(root_name, entries);

    Ok(DirectoryTreeResult {
        structure,
        stats: DirectoryTreeStats {
            total_dirs,
            total_files,
            show_files,
            show_hidden,
            max_depth: if max_depth == 0 {
                "无限制".to_string()
            } else {
                max_depth.to_string()
            },
            filter_count: custom_patterns.len(),
        },
    })
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tree_node_creation() {
        let node = TreeNode::new("test".to_string(), true);
        assert_eq!(node.name, "test");
        assert!(node.is_dir);
        assert_eq!(node.size, 0);
        assert!(node.children.is_empty());
    }

    #[test]
    fn test_build_tree_from_entries() {
        let entries = vec![
            FileEntry {
                relative_path: PathBuf::from("dir1"),
                is_dir: true,
                size: 0,
            },
            FileEntry {
                relative_path: PathBuf::from("dir1/file1.txt"),
                is_dir: false,
                size: 100,
            },
            FileEntry {
                relative_path: PathBuf::from("file2.txt"),
                is_dir: false,
                size: 200,
            },
        ];

        let tree = build_tree_from_entries("root".to_string(), entries);

        assert_eq!(tree.name, "root");
        assert!(tree.is_dir);
        assert_eq!(tree.children.len(), 2);

        // 目录应该在前
        assert!(tree.children[0].is_dir);
        assert_eq!(tree.children[0].name, "dir1");
        assert_eq!(tree.children[0].children.len(), 1);
        assert_eq!(tree.children[0].size, 100); // 目录大小应该是子文件大小之和

        // 文件在后
        assert!(!tree.children[1].is_dir);
        assert_eq!(tree.children[1].name, "file2.txt");
        assert_eq!(tree.children[1].size, 200);

        // 根目录大小应该是所有文件大小之和
        assert_eq!(tree.size, 300);
    }
}
