use std::fs;
use std::path::{Path, PathBuf};
use regex::Regex;
use serde::Serialize;

// 格式化文件大小，转换为人类可读的格式
fn format_size(size: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = size as f64;
    let mut unit_index = 0;
    
    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }
    
    if unit_index == 0 {
        format!("{:.0} {}", size, UNITS[unit_index])
    } else {
        format!("{:.2} {}", size, UNITS[unit_index])
    }
}

// gitignore 规则结构，支持否定规则
#[derive(Clone)]
struct IgnoreRule {
    regex: Regex,
    negated: bool,  // true 表示这是一个否定规则（以 ! 开头）
}

// 统计信息结构
struct TreeStats {
    total_dirs: usize,
    total_files: usize,
    filtered_dirs: usize,
    filtered_files: usize,
}

impl TreeStats {
    fn new() -> Self {
        Self {
            total_dirs: 0,
            total_files: 0,
            filtered_dirs: 0,
            filtered_files: 0,
        }
    }
}

// 返回结果结构，包含目录树和统计信息
#[derive(Serialize)]
pub struct DirectoryTreeResult {
    pub tree: String,
    pub stats: DirectoryTreeStats,
}

#[derive(Serialize)]
pub struct DirectoryTreeStats {
    pub total_dirs: usize,
    pub total_files: usize,
    pub filtered_dirs: usize,
    pub filtered_files: usize,
    pub show_files: bool,
    pub show_hidden: bool,
    pub max_depth: String,
    pub filter_count: usize,
}

// 将 gitignore 风格的 glob 模式转换为正则表达式
// 支持 gitignore 的匹配语义：
// - "target" 匹配任何路径下名为 target 的文件或目录
// - "/target" 只匹配根目录下的 target
// - "*.log" 匹配所有 .log 文件
// - "dir/**" 匹配 dir 目录下的所有内容（但不包括 dir 本身）
// - "!important.log" 否定规则，即使之前的规则匹配也不忽略
fn glob_to_regex(pattern: &str) -> Option<IgnoreRule> {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return None;
    }
    
    // 检查是否是否定规则
    let (negated, pattern) = if let Some(stripped) = pattern.strip_prefix('!') {
        (true, stripped)
    } else {
        (false, pattern)
    };
    
    let mut regex_pattern = String::new();
    
    // 处理特殊的 ** 模式
    // 如果模式是 "dir/**"，应该匹配 dir/ 下的所有内容，但不包括 dir 本身
    if pattern.contains("/**") {
        let parts: Vec<&str> = pattern.splitn(2, "/**").collect();
        if parts.len() == 2 {
            let dir_part = parts[0];
            let after_part = parts[1];
            
            // 如果以 / 开头，从根路径匹配
            if let Some(stripped) = dir_part.strip_prefix('/') {
                regex_pattern.push_str(&format!("^{}/", stripped));
            } else {
                // 可以匹配任何路径下的该目录
                regex_pattern.push_str(&format!("(^|.*/){}/", dir_part));
            }
            
            // ** 匹配任意深度的路径
            regex_pattern.push_str(".*");
            
            // 处理 ** 之后的部分
            if !after_part.is_empty() {
                for ch in after_part.chars() {
                    match ch {
                        '*' => regex_pattern.push_str("[^/]*"),
                        '?' => regex_pattern.push_str("[^/]"),
                        '.' => regex_pattern.push_str(r"\."),
                        '/' => regex_pattern.push('/'),
                        _ => regex_pattern.push(ch),
                    }
                }
            }
            
            regex_pattern.push('$');
            return Regex::new(&regex_pattern).ok().map(|regex| IgnoreRule { regex, negated });
        }
    }
    
    // 如果模式以 / 开头，表示从根路径开始匹配
    let starts_with_slash = pattern.starts_with('/');
    let pattern = if starts_with_slash {
        regex_pattern.push('^');
        &pattern[1..]
    } else {
        // 不以 / 开头的模式可以匹配任何路径下的文件
        regex_pattern.push_str("(^|.*/|)");
        pattern
    };
    
    // 转换 glob 模式为正则表达式
    let mut i = 0;
    let chars: Vec<char> = pattern.chars().collect();
    while i < chars.len() {
        match chars[i] {
            '*' => {
                // 检查是否是 **
                if i + 1 < chars.len() && chars[i + 1] == '*' {
                    regex_pattern.push_str(".*");
                    i += 1; // 跳过第二个 *
                } else {
                    regex_pattern.push_str("[^/]*");  // 单个 * 不匹配路径分隔符
                }
            },
            '?' => regex_pattern.push_str("[^/]"),   // ? 不匹配路径分隔符
            '.' => regex_pattern.push_str(r"\."),
            '+' => regex_pattern.push_str(r"\+"),
            '(' => regex_pattern.push_str(r"\("),
            ')' => regex_pattern.push_str(r"\)"),
            '[' => regex_pattern.push_str(r"\["),
            ']' => regex_pattern.push_str(r"\]"),
            '{' => regex_pattern.push_str(r"\{"),
            '}' => regex_pattern.push_str(r"\}"),
            '|' => regex_pattern.push_str(r"\|"),
            '^' => regex_pattern.push_str(r"\^"),
            '$' => regex_pattern.push_str(r"\$"),
            '\\' => regex_pattern.push_str(r"\\"),
            '/' => regex_pattern.push('/'),
            _ => regex_pattern.push(chars[i]),
        }
        i += 1;
    }
    
    // 如果模式以 / 结尾，说明只匹配目录（及其所有内容）
    if pattern.ends_with('/') {
        // 匹配目录本身或其任何子路径
        regex_pattern.push_str(".*$");
    } else {
        // 模式可以匹配完整路径或目录名
        regex_pattern.push_str("(/.*)?$");
    }
    
    Regex::new(&regex_pattern).ok().map(|regex| IgnoreRule { regex, negated })
}

// 收集指定目录及其所有父目录（直到根目录）的 .gitignore 规则
fn collect_gitignore_patterns(dir: &Path, root: &Path) -> Vec<String> {
    let mut patterns = Vec::new();
    let mut current = dir;
    
    // 从当前目录向上遍历到根目录
    loop {
        let gitignore_path = current.join(".gitignore");
        if gitignore_path.exists() {
            if let Ok(content) = fs::read_to_string(&gitignore_path) {
                // 计算当前 .gitignore 相对于 root 的路径
                let relative_dir = current.strip_prefix(root)
                    .ok()
                    .and_then(|p| p.to_str())
                    .unwrap_or("")
                    .replace('\\', "/");
                
                for line in content.lines() {
                    let line = line.trim();
                    // 跳过空行和注释
                    if !line.is_empty() && !line.starts_with('#') {
                        let pattern = if line.starts_with('/') && !relative_dir.is_empty() {
                            // 以 / 开头的模式是相对于 .gitignore 所在目录的
                            // 需要将其转换为相对于根目录的路径
                            format!("/{}/{}", relative_dir, &line[1..])
                        } else {
                            line.to_string()
                        };
                        
                        if !patterns.contains(&pattern) {
                            patterns.push(pattern);
                        }
                    }
                }
            }
        }
        
        // 如果已经到达根目录，停止向上遍历
        if current == root {
            break;
        }
        
        // 尝试获取父目录
        match current.parent() {
            Some(parent) if parent.starts_with(root) => current = parent,
            _ => break,
        }
    }
    
    patterns
}

// 检查路径是否应该被忽略
// 按照 gitignore 规则顺序处理，后面的规则可以覆盖前面的规则
fn should_ignore(path: &str, file_name: &str, rules: &[IgnoreRule]) -> bool {
    let mut ignored = false;
    
    // 将 Windows 路径分隔符统一转换为 Unix 风格
    let normalized_path = path.replace('\\', "/");
    
    for rule in rules {
        let matches_filename = rule.regex.is_match(file_name);
        let matches_path = rule.regex.is_match(&normalized_path);
        
        if matches_filename || matches_path {
            // 匹配到规则，根据是否是否定规则来决定
            ignored = !rule.negated;
        }
    }
    
    ignored
}

// 内存中的树节点结构
struct TreeNode {
    name: String,
    is_dir: bool,
    size: u64,
    children: Vec<TreeNode>,
    error: Option<String>, // 记录权限错误等
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
}

// 递归生成目录树参数配置
struct TreeConfig<'a> {
    show_files: bool,
    show_hidden: bool,
    show_size: bool,
    show_dir_size: bool,
    max_depth: usize,
    use_gitignore: bool,
    custom_patterns: &'a [IgnoreRule],
}

// 构建内存树
fn build_tree_recursive(
    root: &Path,
    dir: &Path,
    current_depth: usize,
    config: &TreeConfig,
    stats: &mut TreeStats
) -> TreeNode {
    let dir_name = dir.file_name().unwrap_or_default().to_string_lossy().to_string();
    let mut node = TreeNode::new(dir_name, true);

    // 检查深度限制（0 表示无限制）
    // 注意：即使达到深度限制，如果需要计算大小，我们仍然需要遍历（但不添加到 children）
    // 但为了性能，如果达到了 max_depth 且不需要显示大小（或者只显示当前层大小？不，目录大小通常包含子目录），
    // 这里有一个权衡。通常“目录大小”意味着包含所有子内容。
    // 如果用户设置了 max_depth，他们可能只关心那一层的结构。
    // 为了保持“快速”，如果超过 max_depth，我们就不再深入计算大小了（除非我们想做一个完全准确的 size 工具，但这是目录树工具）。
    // 所以，如果超过深度，我们直接返回，size 记为 0（或者只记当前目录元数据大小）。
    if config.max_depth > 0 && current_depth >= config.max_depth {
        return node;
    }

    // 合并 gitignore 规则和自定义规则
    let mut ignore_patterns: Vec<IgnoreRule> = Vec::new();
    if config.use_gitignore {
        let gitignore_rules: Vec<IgnoreRule> = collect_gitignore_patterns(dir, root)
            .iter()
            .filter_map(|pattern| glob_to_regex(pattern))
            .collect();
        ignore_patterns.extend(gitignore_rules);
    }
    ignore_patterns.extend(config.custom_patterns.iter().cloned());

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => {
            node.error = Some("[权限被拒绝]".to_string());
            return node;
        }
    };

    let mut items: Vec<_> = entries.filter_map(|e| e.ok()).collect();

    // 排序：目录在前
    items.sort_by(|a, b| {
        let a_is_dir = a.path().is_dir();
        let b_is_dir = b.path().is_dir();
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name())
        }
    });

    for entry in items {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        let is_dir = path.is_dir();

        // 统计
        if is_dir { stats.total_dirs += 1; } else { stats.total_files += 1; }

        // 过滤逻辑
        if !config.show_hidden && file_name.starts_with('.') {
            if is_dir { stats.filtered_dirs += 1; } else { stats.filtered_files += 1; }
            continue;
        }

        let full_relative_path = path.strip_prefix(root)
            .ok()
            .and_then(|p| p.to_str())
            .unwrap_or(&file_name);
        
        if should_ignore(full_relative_path, &file_name, &ignore_patterns) {
            if is_dir { stats.filtered_dirs += 1; } else { stats.filtered_files += 1; }
            continue;
        }

        if !config.show_files && path.is_file() {
            stats.filtered_files += 1;
            continue;
        }

        // 处理子节点
        if is_dir {
            let child_node = build_tree_recursive(root, &path, current_depth + 1, config, stats);
            node.size += child_node.size; // 累加子目录大小
            node.children.push(child_node);
        } else {
            let mut size = 0;
            if let Ok(metadata) = fs::metadata(&path) {
                size = metadata.len();
            }
            node.size += size; // 累加文件大小
            
            let mut child_node = TreeNode::new(file_name, false);
            child_node.size = size;
            node.children.push(child_node);
        }
    }

    node
}

// 将树渲染为字符串
fn render_tree(
    node: &TreeNode,
    output: &mut String,
    prefix: &str,
    is_root: bool,
    config: &TreeConfig
) {
    if !is_root {
        // 渲染当前节点（根节点在外部处理，或者这里处理）
        // 但通常根节点不带前缀。
        // 这里我们假设 render_tree 是处理 children 的，或者 process_node
        // 让我们调整逻辑：render_tree 渲染 node 本身及其 children
    }
    
    // 这里的逻辑有点绕，因为原来的递归是 "处理当前目录的 children"。
    // 我们采用类似的逻辑：遍历 children 进行渲染。
    
    let count = node.children.len();
    for (index, child) in node.children.iter().enumerate() {
        let is_last = index == count - 1;
        let connector = if is_last { "└── " } else { "├── " };
        let extension = if is_last { "    " } else { "│   " };
        
        let size_str = if child.is_dir {
             if config.show_dir_size { format!(" ({})", format_size(child.size)) } else { String::new() }
        } else if config.show_size {
            format!(" ({})", format_size(child.size))
        } else {
            String::new()
        };

        let error_str = child.error.as_deref().unwrap_or("");
        let slash = if child.is_dir { "/" } else { "" };
        
        output.push_str(&format!("{}{}{}{}{}{}\n", prefix, connector, child.name, slash, size_str, error_str));
        
        if child.is_dir {
            let new_prefix = format!("{}{}", prefix, extension);
            render_tree(child, output, &new_prefix, false, config);
        }
    }
}

// Tauri 命令：生成目录树
#[tauri::command]
pub async fn generate_directory_tree(
    path: String,
    show_files: bool,
    show_hidden: bool,
    show_size: bool,
    show_dir_size: Option<bool>,
    max_depth: usize,
    ignore_patterns: Vec<String>
) -> Result<DirectoryTreeResult, String> {
    let root_path = PathBuf::from(&path);
    
    if !root_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    
    if !root_path.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }
    
    let use_gitignore = ignore_patterns.iter().any(|p| p == "__USE_GITIGNORE__");
    let custom_patterns: Vec<IgnoreRule> = ignore_patterns.iter()
        .filter(|pattern| !pattern.is_empty() && pattern != &"__USE_GITIGNORE__")
        .filter_map(|pattern| glob_to_regex(pattern))
        .collect();
    
    let mut stats = TreeStats::new();
    let config = TreeConfig {
        show_files,
        show_hidden,
        show_size,
        show_dir_size: show_dir_size.unwrap_or(false),
        max_depth,
        use_gitignore,
        custom_patterns: &custom_patterns,
    };
    
    // 1. 构建树（一次遍历，同时计算大小）
    let root_node = build_tree_recursive(&root_path, &root_path, 0, &config, &mut stats);
    
    // 2. 渲染树
    let mut result = String::new();
    // 渲染根节点
    let root_size_str = if config.show_dir_size { format!(" ({})", format_size(root_node.size)) } else { String::new() };
    result.push_str(&format!("{}/{}\n", root_path.file_name().unwrap_or_default().to_string_lossy(), root_size_str));
    
    render_tree(&root_node, &mut result, "", true, &config);
    
    Ok(DirectoryTreeResult {
        tree: result,
        stats: DirectoryTreeStats {
            total_dirs: stats.total_dirs,
            total_files: stats.total_files,
            filtered_dirs: stats.filtered_dirs,
            filtered_files: stats.filtered_files,
            show_files,
            show_hidden,
            max_depth: if max_depth == 0 { "无限制".to_string() } else { max_depth.to_string() },
            filter_count: custom_patterns.len(),
        },
    })
}