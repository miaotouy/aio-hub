// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

use std::sync::{Arc, Mutex, atomic};
use std::thread;
use std::time::Duration;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State, Emitter, WindowEvent, DragDropEvent, PhysicalPosition};
use regex::Regex;
use std::collections::HashMap;

#[derive(Clone, serde::Serialize)]
struct FileDropPayload {
    paths: Vec<PathBuf>,
    position: PhysicalPosition<f64>,
}
use tauri_plugin_clipboard_manager::ClipboardExt; // 导入 ClipboardExt
use tauri_plugin_global_shortcut::GlobalShortcutExt; // 导入 GlobalShortcutExt

// 定义一个结构体来管理监听状态
struct ClipboardMonitorState {
    should_run: Arc<atomic::AtomicBool>,
    last_content: Arc<Mutex<String>>,
}

// Tauri 命令：启动剪贴板监听
#[tauri::command]
fn start_clipboard_monitor(app_handle: AppHandle, state: State<ClipboardMonitorState>) {
    let should_run = state.should_run.clone();
    let last_content = state.last_content.clone();
    should_run.store(true, atomic::Ordering::SeqCst);

    thread::spawn(move || {
        let mut last_clipboard_text = last_content.lock().unwrap().clone();
        while should_run.load(atomic::Ordering::SeqCst) {
            let clipboard_manager = app_handle.clipboard(); // clipboard() returns Clipboard directly, not Result
            if let Ok(current_content) = clipboard_manager.read_text() {
                if !current_content.is_empty() && current_content != last_clipboard_text {
                    last_clipboard_text = current_content.clone();
                    *last_content.lock().unwrap() = current_content.clone();
                    // 发送事件到前端
                    app_handle.emit("clipboard-changed", current_content).unwrap(); // changed emit_all() to emit()
                }
            }
            thread::sleep(Duration::from_millis(500)); // 每500毫秒检查一次
        }
    });
}

// Tauri 命令：停止剪贴板监听
#[tauri::command]
fn stop_clipboard_monitor(state: State<ClipboardMonitorState>) {
    state.should_run.store(false, atomic::Ordering::SeqCst);
}

// Tauri 命令：获取剪贴板内容类型（需要更复杂的逻辑来实现）
// 暂时只返回文本类型，后续可以扩展识别 JSON, Base64, Image 等
#[tauri::command]
fn get_clipboard_content_type(state: State<ClipboardMonitorState>) -> String {
    let content = state.last_content.lock().unwrap();
    if content.starts_with("{") && content.ends_with("}") {
        "json".to_string()
    } else if content.len() > 100 && content.ends_with("==") && content.contains("/") { // 粗略判断 base64
        "base64".to_string()
    } else {
        "text".to_string()
    }
}

// 正则规则结构体
#[derive(serde::Deserialize)]
struct RegexRule {
    regex: String,
    replacement: String,
}

// 文件处理结果结构体
#[derive(serde::Serialize)]
struct ProcessResult {
    success_count: usize,
    error_count: usize,
    errors: HashMap<String, String>,
}

// Tauri 命令：批量处理文件应用正则规则
#[tauri::command]
async fn process_files_with_regex(
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
async fn move_and_link(source_paths: Vec<String>, target_dir: String, link_type: String) -> Result<String, String> {
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

// 将 gitignore 风格的 glob 模式转换为正则表达式
// 支持 gitignore 的匹配语义：
// - "target" 匹配任何路径下名为 target 的文件或目录
// - "/target" 只匹配根目录下的 target
// - "*.log" 匹配所有 .log 文件
fn glob_to_regex(pattern: &str) -> Option<Regex> {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return None;
    }
    
    let mut regex_pattern = String::new();
    
    // 如果模式以 / 开头，表示从根路径开始匹配
    let starts_with_slash = pattern.starts_with('/');
    let pattern = if starts_with_slash {
        &pattern[1..]
    } else {
        // 不以 / 开头的模式可以匹配任何路径下的文件
        regex_pattern.push_str("(^|.*/|)");
        pattern
    };
    
    // 转换 glob 模式为正则表达式
    for ch in pattern.chars() {
        match ch {
            '*' => regex_pattern.push_str("[^/]*"),  // * 不匹配路径分隔符
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
            _ => regex_pattern.push(ch),
        }
    }
    
    // 模式可以匹配完整路径或目录名
    regex_pattern.push_str("(/.*)?$");
    
    Regex::new(&regex_pattern).ok()
}

// 递归收集所有 .gitignore 文件的规则
fn collect_gitignore_patterns(root: &Path) -> Vec<String> {
    let mut patterns = Vec::new();
    
    fn collect_recursive(dir: &Path, patterns: &mut Vec<String>) {
        let gitignore_path = dir.join(".gitignore");
        if gitignore_path.exists() {
            if let Ok(content) = fs::read_to_string(&gitignore_path) {
                for line in content.lines() {
                    let line = line.trim();
                    // 跳过空行和注释
                    if !line.is_empty() && !line.starts_with('#') {
                        // 移除行尾的空格和斜杠
                        let pattern = line.trim_end_matches('/').to_string();
                        if !patterns.contains(&pattern) {
                            patterns.push(pattern);
                        }
                    }
                }
            }
        }
        
        // 递归处理子目录
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    // 跳过常见的不需要扫描的目录
                    if !file_name.starts_with('.') && file_name != "node_modules" && file_name != "target" {
                        collect_recursive(&path, patterns);
                    }
                }
            }
        }
    }
    
    collect_recursive(root, &mut patterns);
    patterns
}

// Tauri 命令：生成目录树
#[tauri::command]
async fn generate_directory_tree(
    path: String,
    show_files: bool,
    show_hidden: bool,
    max_depth: usize,
    ignore_patterns: Vec<String>
) -> Result<String, String> {
    let root_path = PathBuf::from(&path);
    
    if !root_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    
    if !root_path.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }
    
    // 检查是否使用 gitignore 模式
    let use_gitignore = ignore_patterns.iter()
        .any(|p| p == "__USE_GITIGNORE__");
    
    // 收集最终的过滤模式
    let all_patterns = if use_gitignore {
        // 使用 gitignore 模式：递归收集所有 .gitignore 文件的规则
        collect_gitignore_patterns(&root_path)
    } else {
        // 使用自定义模式：直接使用用户提供的模式
        ignore_patterns.clone()
    };
    
    // 编译所有忽略模式为正则表达式
    let compiled_patterns: Vec<Regex> = all_patterns.iter()
        .filter(|pattern| !pattern.is_empty() && pattern != &"__USE_GITIGNORE__")
        .filter_map(|pattern| glob_to_regex(pattern))
        .collect();
    
    let mut result = String::new();
    result.push_str(&format!("{}/\n", root_path.file_name().unwrap_or_default().to_string_lossy()));
    
    generate_tree_recursive(
        &root_path,
        &mut result,
        "",
        show_files,
        show_hidden,
        max_depth,
        0,
        &compiled_patterns
    )?;
    
    Ok(result)
}

// 递归生成目录树
fn generate_tree_recursive(
    dir: &Path,
    output: &mut String,
    prefix: &str,
    show_files: bool,
    show_hidden: bool,
    max_depth: usize,
    current_depth: usize,
    ignore_patterns: &[Regex]
) -> Result<(), String> {
    // 检查深度限制（0 表示无限制）
    if max_depth > 0 && current_depth >= max_depth {
        return Ok(());
    }
    
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("读取目录失败 {}: {}", dir.display(), e))?;
    
    let mut items: Vec<_> = entries
        .filter_map(|e| e.ok())
        .collect();
    
    // 排序：目录在前，然后按名称排序
    items.sort_by(|a, b| {
        let a_is_dir = a.path().is_dir();
        let b_is_dir = b.path().is_dir();
        
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name())
        }
    });
    
    let mut visible_items = Vec::new();
    
    // 第一遍：过滤掉需要忽略的项目
    for entry in items.iter() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        
        // 检查是否为隐藏文件
        if !show_hidden && file_name.starts_with('.') {
            continue;
        }
        
        // 检查是否匹配忽略模式
        // 对于每个忽略模式，检查文件名或相对路径
        let relative_path = path.strip_prefix(dir)
            .ok()
            .and_then(|p| p.to_str())
            .unwrap_or(&file_name);
        
        if ignore_patterns.iter().any(|pattern| {
            pattern.is_match(&file_name) || pattern.is_match(relative_path)
        }) {
            continue;
        }
        
        // 如果不显示文件且当前是文件，跳过
        if !show_files && path.is_file() {
            continue;
        }
        
        visible_items.push((entry, file_name));
    }
    
    let visible_count = visible_items.len();
    
    // 第二遍：渲染可见项目
    for (index, (entry, file_name)) in visible_items.iter().enumerate() {
        let path = entry.path();
        let is_last = index == visible_count - 1;
        let connector = if is_last { "└── " } else { "├── " };
        let extension = if is_last { "    " } else { "│   " };
        
        if path.is_dir() {
            output.push_str(&format!("{}{}{}/\n", prefix, connector, file_name));
            
            // 递归处理子目录
            let new_prefix = format!("{}{}", prefix, extension);
            generate_tree_recursive(
                &path,
                output,
                &new_prefix,
                show_files,
                show_hidden,
                max_depth,
                current_depth + 1,
                ignore_patterns
            )?;
        } else {
            output.push_str(&format!("{}{}{}\n", prefix, connector, file_name));
        }
    }
    
    Ok(())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init()) // Add this line
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // .plugin(tauri_plugin_path::init()) // Removed as it's not needed with tauri_plugin_fs
        .manage(ClipboardMonitorState {
            should_run: Arc::new(atomic::AtomicBool::new(false)),
            last_content: Arc::new(Mutex::new(String::new())),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            start_clipboard_monitor,
            stop_clipboard_monitor,
            get_clipboard_content_type,
            move_and_link,
            process_files_with_regex,
            generate_directory_tree
        ])
        // Remove file drop event handling for now as it's causing issues
        .setup(|app| {
            // 注册全局快捷键
            let app_handle = app.handle();
            let main_window = app_handle.get_webview_window("main").unwrap(); // changed get_window() to get_webview_window()
            main_window.set_skip_taskbar(false).unwrap(); // 确保窗口显示在任务栏

            // Register global shortcut with proper API
            app_handle.global_shortcut().register("CmdOrCtrl+Shift+Space").unwrap();
            
            // Handle shortcut events separately if needed
            // For now, we'll comment out the shortcut functionality to get the app running
            /*
            app_handle.global_shortcut().register("CmdOrCtrl+Shift+Space", move || {
                if main_window.is_visible().unwrap() {
                    main_window.hide().unwrap();
                } else {
                    main_window.show().unwrap();
                    main_window.set_focus().unwrap(); // 确保窗口获得焦点
                }
            }).unwrap();
            */
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(event) = event {
                match event {
                    DragDropEvent::Drop { paths, position } => {
                        // We found the event! Now emit it to the frontend with position data.
                        println!("Correctly captured file drop: {:?} at position {:?}", paths, position);
                        window.emit("custom-file-drop", FileDropPayload {
                            paths: paths.clone(),
                            position: position.clone(),
                        }).unwrap();
                    }
                    // We can also handle other drag events if needed, but we'll ignore them for now.
                    _ => {}
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
