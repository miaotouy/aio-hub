use encoding_rs::GBK;
use ignore::overrides::OverrideBuilder;
use ignore::{WalkBuilder, WalkState};
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};
use tauri::{Emitter, State, Window};

// ===== 取消机制 =====

pub struct DirSearchCancellation {
    pub(crate) cancelled: Arc<AtomicBool>,
}

impl DirSearchCancellation {
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

impl Default for DirSearchCancellation {
    fn default() -> Self {
        Self::new()
    }
}

// ===== 搜索请求 =====

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    /// 搜索根目录
    pub root_path: String,
    /// 搜索模式（文本内容）
    pub pattern: String,
    /// 是否使用正则表达式
    pub is_regex: bool,
    /// 是否大小写敏感
    pub case_sensitive: bool,
    /// 是否全词匹配
    pub whole_word: bool,
    /// 包含的 glob 模式列表
    pub include_globs: Vec<String>,
    /// 排除的 glob 模式列表
    pub exclude_globs: Vec<String>,
    /// 是否尊重搜索目录内的 .gitignore
    #[serde(default = "default_true")]
    pub use_gitignore: bool,
    /// 上下文行数（匹配行前后各取 N 行）
    pub context_lines: Option<usize>,
    /// 最大结果数限制
    pub max_results: Option<usize>,
}

fn default_true() -> bool {
    true
}

// ===== 单个匹配项 =====

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    /// 匹配所在行号（1-based）
    pub line_number: usize,
    /// 行内容（完整的一行文本）
    pub line_content: String,
    /// 匹配在行内的起始字符偏移（char 索引）
    pub match_start: usize,
    /// 匹配在行内的结束字符偏移（char 索引）
    pub match_end: usize,
    /// 匹配行之前的 N 行上下文
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_before: Option<Vec<String>>,
    /// 匹配行之后的 N 行上下文
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_after: Option<Vec<String>>,
}

// ===== 单个文件的搜索结果 =====

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchResult {
    /// 文件绝对路径
    pub file_path: String,
    /// 文件相对于搜索根目录的路径
    pub relative_path: String,
    /// 该文件中的所有匹配
    pub matches: Vec<SearchMatch>,
}

// ===== 搜索结果批次（IPC 批处理） =====

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultBatch {
    pub results: Vec<FileSearchResult>,
}

// ===== 搜索进度事件 =====

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchProgress {
    /// 已扫描的文件数
    pub files_scanned: usize,
    /// 已找到匹配的文件数
    pub files_matched: usize,
    /// 总匹配数
    pub total_matches: usize,
    /// 当前正在扫描的文件路径
    pub current_file: Option<String>,
}

// ===== 搜索完成汇总 =====

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSummary {
    /// 总扫描文件数
    pub files_scanned: usize,
    /// 包含匹配的文件数
    pub files_matched: usize,
    /// 总匹配数
    pub total_matches: usize,
    /// 搜索耗时（毫秒）
    pub duration_ms: f64,
    /// 是否被用户取消
    pub cancelled: bool,
}

// ===== 替换请求 =====

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceRequest {
    /// 要替换的文件路径列表（空 = 替换所有搜索结果）
    pub file_paths: Vec<String>,
    /// 搜索模式
    pub pattern: String,
    /// 替换文本
    pub replacement: String,
    /// 是否正则
    pub is_regex: bool,
    /// 是否大小写敏感
    pub case_sensitive: bool,
    /// 是否全词匹配
    pub whole_word: bool,
    /// 是否保留大小写
    pub preserve_case: bool,
}

// ===== 替换结果 =====

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceResult {
    /// 成功替换的文件数
    pub files_replaced: usize,
    /// 失败的文件数
    pub files_failed: usize,
    /// 总替换次数
    pub total_replacements: usize,
    /// 错误详情
    pub errors: Vec<ReplaceError>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceError {
    pub file_path: String,
    pub error: String,
}

// ===== 辅助函数 =====

/// 构建正则匹配器
fn build_matcher(request: &SearchRequest) -> Result<Regex, String> {
    let pattern = if request.is_regex {
        request.pattern.clone()
    } else {
        // 纯文本模式：转义所有正则特殊字符
        regex::escape(&request.pattern)
    };

    // 全词匹配：添加 \b 边界
    let pattern = if request.whole_word {
        format!(r"\b{}\b", pattern)
    } else {
        pattern
    };

    RegexBuilder::new(&pattern)
        .case_insensitive(!request.case_sensitive)
        .build()
        .map_err(|e| format!("正则表达式无效: {}", e))
}

/// 在文件内容中搜索匹配项
fn search_in_content(
    content: &str,
    matcher: &Regex,
    max_matches: Option<usize>,
    context_lines: usize,
) -> Vec<SearchMatch> {
    let mut matches = Vec::new();
    let lines: Vec<&str> = content.lines().collect();

    for (line_idx, line) in lines.iter().enumerate() {
        let line_number = line_idx + 1; // 1-based

        // 查找该行中的所有匹配
        let mut line_matches: Vec<(usize, usize)> = Vec::new();
        for mat in matcher.find_iter(line) {
            // 字节偏移 → char 索引转换
            let match_start = line[..mat.start()].chars().count();
            let match_end = match_start + line[mat.start()..mat.end()].chars().count();
            line_matches.push((match_start, match_end));
        }

        // 合并重叠区间
        if !line_matches.is_empty() {
            line_matches.sort_by_key(|m| m.0);
            let mut merged: Vec<(usize, usize)> = Vec::new();
            if let Some(first) = line_matches.first().copied() {
                let mut current = first;
                for &next in &line_matches[1..] {
                    if next.0 <= current.1 {
                        current.1 = current.1.max(next.1);
                    } else {
                        merged.push(current);
                        current = next;
                    }
                }
                merged.push(current);
            }

            // 获取上下文行
            let (ctx_before, ctx_after) = if context_lines > 0 {
                let before_start = line_idx.saturating_sub(context_lines);
                let before: Vec<String> = lines[before_start..line_idx]
                    .iter()
                    .map(|l| l.to_string())
                    .collect();

                let after_end = (line_idx + 1 + context_lines).min(lines.len());
                let after: Vec<String> = lines[(line_idx + 1)..after_end]
                    .iter()
                    .map(|l| l.to_string())
                    .collect();

                (Some(before), Some(after))
            } else {
                (None, None)
            };

            // 为每个合并后的匹配区间创建 SearchMatch
            for (start, end) in merged {
                matches.push(SearchMatch {
                    line_number,
                    line_content: line.to_string(),
                    match_start: start,
                    match_end: end,
                    context_before: ctx_before.clone(),
                    context_after: ctx_after.clone(),
                });

                // 检查是否达到最大结果数
                if let Some(max) = max_matches {
                    if matches.len() >= max {
                        return matches;
                    }
                }
            }
        }
    }

    matches
}

/// 尝试将字节解码为字符串：先 UTF-8，失败则尝试 GBK（Windows 中文环境常见编码）
fn decode_to_string(bytes: &[u8]) -> Option<String> {
    // 处理 UTF-8 BOM
    let bytes = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        bytes
    };

    // 尝试 UTF-8
    if let Ok(s) = std::str::from_utf8(bytes) {
        return Some(s.to_string());
    }

    // Fallback: 尝试 GBK (GB2312/GB18030 的超集)
    let (decoded, _, had_errors) = GBK.decode(bytes);
    if !had_errors {
        return Some(decoded.into_owned());
    }

    None
}

/// 单文件大小上限（5MB）
const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024;

// ===== Tauri 命令 =====

#[tauri::command]
pub async fn dir_search(
    request: SearchRequest,
    window: Window,
    cancellation: State<'_, DirSearchCancellation>,
) -> Result<SearchSummary, String> {
    // 重置取消标志
    cancellation.reset();

    let start_time = Instant::now();
    let root_path = Path::new(&request.root_path);

    if !root_path.exists() || !root_path.is_dir() {
        return Err(format!("目录不存在: {}", request.root_path));
    }

    if request.pattern.is_empty() {
        return Err("搜索模式不能为空".to_string());
    }

    // 构建匹配器
    let matcher = build_matcher(&request)?;

    // 构建 WalkBuilder
    let mut builder = WalkBuilder::new(root_path);
    builder
        .hidden(false) // 搜索隐藏文件
        .parents(false) // 不向上查找父目录的 .gitignore（避免父级规则误排除搜索目录内容）
        .git_ignore(request.use_gitignore) // 是否尊重搜索目录内的 .gitignore
        .git_global(false) // 不使用全局 gitignore
        .git_exclude(false); // 不使用 .git/info/exclude

    // 应用 include/exclude glob 过滤
    let has_include = !request.include_globs.is_empty();
    let has_exclude = !request.exclude_globs.is_empty();

    if has_include || has_exclude {
        let mut override_builder = OverrideBuilder::new(root_path);

        if has_include {
            // include 模式：只搜索匹配的文件
            for glob in &request.include_globs {
                let trimmed = glob.trim();
                if !trimmed.is_empty() {
                    override_builder
                        .add(trimmed)
                        .map_err(|e| format!("无效的 include glob '{}': {}", trimmed, e))?;
                }
            }
        }

        if has_exclude {
            // exclude 模式：排除匹配的文件
            for glob in &request.exclude_globs {
                let trimmed = glob.trim();
                if !trimmed.is_empty() {
                    override_builder
                        .add(&format!("!{}", trimmed))
                        .map_err(|e| format!("无效的 exclude glob '{}': {}", trimmed, e))?;
                }
            }
        }

        let overrides = override_builder
            .build()
            .map_err(|e| format!("构建 glob 过滤器失败: {}", e))?;
        builder.overrides(overrides);
    }

    // 提取搜索参数（供并行闭包使用，usize 是 Copy 的）
    let context_lines = request.context_lines.unwrap_or(0);

    // 统计变量（原子类型，供并行线程安全访问）
    // max_results: 0 或 None 表示无限制
    let max_results = match request.max_results {
        Some(0) | None => usize::MAX,
        Some(n) => n,
    };
    let total_matches_atomic = Arc::new(AtomicUsize::new(0));
    let files_scanned_atomic = Arc::new(AtomicUsize::new(0));
    let files_matched_atomic = Arc::new(AtomicUsize::new(0));
    let cancelled_flag = cancellation.cancelled.clone();

    // 使用有界 channel 收集并行搜索结果
    // 容量限制为 500，当 channel 满时 walker 线程会自动阻塞等待主线程消费
    // 这是防止 IPC 积压导致 WebView 崩溃的核心背压机制
    let (tx, rx) = mpsc::sync_channel::<FileSearchResult>(500);

    log::info!(
        "[dir-search] 开始搜索: pattern={:?}, root={}, max_results={}, gitignore={}",
        request.pattern,
        request.root_path,
        max_results,
        request.use_gitignore
    );

    // 启动并行遍历
    let root_path_buf = root_path.to_path_buf();
    let walker = builder.build_parallel();

    let walker_handle = std::thread::spawn({
        let total_matches_atomic = total_matches_atomic.clone();
        let files_scanned_atomic = files_scanned_atomic.clone();
        let files_matched_atomic = files_matched_atomic.clone();
        let cancelled_flag = cancelled_flag.clone();

        move || {
            walker.run(|| {
                let tx = tx.clone();
                let matcher = matcher.clone();
                let cancelled_flag = cancelled_flag.clone();
                let total_matches_atomic = total_matches_atomic.clone();
                let files_scanned_atomic = files_scanned_atomic.clone();
                let files_matched_atomic = files_matched_atomic.clone();
                let root_path_buf = root_path_buf.clone();

                Box::new(move |entry| {
                    // 检查取消
                    if cancelled_flag.load(Ordering::Relaxed) {
                        return WalkState::Quit;
                    }

                    // 检查是否已达上限
                    if total_matches_atomic.load(Ordering::Relaxed) >= max_results {
                        return WalkState::Quit;
                    }

                    let entry = match entry {
                        Ok(e) => e,
                        Err(_) => return WalkState::Continue,
                    };

                    // 只处理文件
                    if !entry.file_type().is_some_and(|ft| ft.is_file()) {
                        return WalkState::Continue;
                    }

                    let path = entry.path();

                    // 检查文件大小
                    if let Ok(metadata) = path.metadata() {
                        if metadata.len() > MAX_FILE_SIZE {
                            return WalkState::Continue;
                        }
                    }

                    files_scanned_atomic.fetch_add(1, Ordering::Relaxed);

                    // 读取文件内容
                    let content = match fs::read(path) {
                        Ok(bytes) => bytes,
                        Err(_) => return WalkState::Continue,
                    };

                    // 跳过二进制文件
                    let check_len = content.len().min(8192);
                    if content[..check_len].contains(&0) {
                        return WalkState::Continue;
                    }

                    // 尝试解码为文本
                    let text = match decode_to_string(&content) {
                        Some(s) => s,
                        None => return WalkState::Continue,
                    };

                    // 计算剩余可用的匹配数
                    let current_total = total_matches_atomic.load(Ordering::Relaxed);
                    if current_total >= max_results {
                        return WalkState::Quit;
                    }
                    let remaining = Some(max_results - current_total);

                    // 搜索文件内容
                    let file_matches = search_in_content(&text, &matcher, remaining, context_lines);

                    if !file_matches.is_empty() {
                        let match_count = file_matches.len();
                        total_matches_atomic.fetch_add(match_count, Ordering::Relaxed);
                        files_matched_atomic.fetch_add(1, Ordering::Relaxed);

                        // 计算相对路径
                        let relative_path = path
                            .strip_prefix(&root_path_buf)
                            .unwrap_or(path)
                            .to_string_lossy()
                            .to_string()
                            .replace('\\', "/");

                        let result = FileSearchResult {
                            file_path: path.to_string_lossy().to_string(),
                            relative_path,
                            matches: file_matches,
                        };

                        // 发送到 channel（如果接收端已关闭则停止）
                        if tx.send(result).is_err() {
                            return WalkState::Quit;
                        }
                    }

                    WalkState::Continue
                })
            });
        }
    });

    // 主线程：消费 channel，批量 emit 到前端
    // 使用较大的间隔和批次，给前端渲染留余量
    let mut batch: Vec<FileSearchResult> = Vec::with_capacity(200);
    let mut last_emit = Instant::now();
    let mut last_progress = Instant::now();
    let batch_interval = Duration::from_millis(300);
    let progress_interval = Duration::from_millis(400);

    loop {
        // 主线程也检查取消标志，避免 walker 退出后仍继续 emit 残留数据
        if cancelled_flag.load(Ordering::Relaxed) {
            // 丢弃 channel 中的残留数据
            while rx.try_recv().is_ok() {}
            break;
        }

        // 达到上限后停止发送，丢弃残留
        if total_matches_atomic.load(Ordering::Relaxed) >= max_results {
            // flush 当前 batch 后退出
            if !batch.is_empty() {
                let _ = window.emit(
                    "dir-search-result-batch",
                    &SearchResultBatch {
                        results: std::mem::take(&mut batch),
                    },
                );
            }
            // 丢弃 channel 残留
            while rx.try_recv().is_ok() {}
            break;
        }

        match rx.recv_timeout(Duration::from_millis(80)) {
            Ok(result) => {
                batch.push(result);

                // 批量发送条件：满 200 条或超过 300ms
                if batch.len() >= 200 || last_emit.elapsed() >= batch_interval {
                    let _ = window.emit(
                        "dir-search-result-batch",
                        &SearchResultBatch {
                            results: std::mem::take(&mut batch),
                        },
                    );
                    last_emit = Instant::now();
                }

                // 定期发送进度
                if last_progress.elapsed() >= progress_interval {
                    let progress = SearchProgress {
                        files_scanned: files_scanned_atomic.load(Ordering::Relaxed),
                        files_matched: files_matched_atomic.load(Ordering::Relaxed),
                        total_matches: total_matches_atomic.load(Ordering::Relaxed),
                        current_file: None,
                    };
                    let _ = window.emit("dir-search-progress", &progress);
                    last_progress = Instant::now();
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // 超时：flush 当前 batch（如果有）
                if !batch.is_empty() {
                    let _ = window.emit(
                        "dir-search-result-batch",
                        &SearchResultBatch {
                            results: std::mem::take(&mut batch),
                        },
                    );
                    last_emit = Instant::now();
                }

                // 检查 walker 是否已完成
                if walker_handle.is_finished() {
                    break;
                }

                // 发送进度
                if last_progress.elapsed() >= progress_interval {
                    let progress = SearchProgress {
                        files_scanned: files_scanned_atomic.load(Ordering::Relaxed),
                        files_matched: files_matched_atomic.load(Ordering::Relaxed),
                        total_matches: total_matches_atomic.load(Ordering::Relaxed),
                        current_file: None,
                    };
                    let _ = window.emit("dir-search-progress", &progress);
                    last_progress = Instant::now();
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                break;
            }
        }
    }

    // 立即 drop 接收端，使 walker 线程的 tx.send() 立即返回 Err 并退出
    // 这避免了 walker 线程因 channel 满而阻塞，大幅减少 join 等待时间
    drop(rx);

    // 等待 walker 线程结束（由于 rx 已 drop，线程会很快退出）
    let _ = walker_handle.join();

    // Flush 剩余的 batch
    if !batch.is_empty() {
        let _ = window.emit(
            "dir-search-result-batch",
            &SearchResultBatch {
                results: std::mem::take(&mut batch),
            },
        );
    }

    // 读取最终统计
    let files_scanned = files_scanned_atomic.load(Ordering::Relaxed);
    let files_matched = files_matched_atomic.load(Ordering::Relaxed);
    let total_matches = total_matches_atomic.load(Ordering::Relaxed);
    let duration = start_time.elapsed();
    let cancelled = cancellation.is_cancelled();
    let reached_limit = total_matches >= max_results;

    // 发送最终进度
    let final_progress = SearchProgress {
        files_scanned,
        files_matched,
        total_matches,
        current_file: None,
    };
    let _ = window.emit("dir-search-progress", &final_progress);

    if reached_limit {
        log::info!("[dir-search] 搜索达到上限 {} 条结果，已停止", max_results);
    }

    Ok(SearchSummary {
        files_scanned,
        files_matched,
        total_matches,
        duration_ms: duration.as_secs_f64() * 1000.0,
        cancelled,
    })
}

#[tauri::command]
pub async fn dir_search_cancel(
    cancellation: State<'_, DirSearchCancellation>,
) -> Result<(), String> {
    cancellation.cancel();
    log::info!("[dir-search] 搜索已取消");
    Ok(())
}

#[tauri::command]
pub async fn dir_replace(request: ReplaceRequest) -> Result<ReplaceResult, String> {
    if request.pattern.is_empty() {
        return Err("搜索模式不能为空".to_string());
    }

    if request.file_paths.is_empty() {
        return Err("未指定要替换的文件".to_string());
    }

    // 构建匹配器
    let pattern = if request.is_regex {
        request.pattern.clone()
    } else {
        regex::escape(&request.pattern)
    };

    let pattern = if request.whole_word {
        format!(r"\b{}\b", pattern)
    } else {
        pattern
    };

    let regex = RegexBuilder::new(&pattern)
        .case_insensitive(!request.case_sensitive)
        .build()
        .map_err(|e| format!("正则表达式无效: {}", e))?;

    let mut files_replaced: usize = 0;
    let mut files_failed: usize = 0;
    let mut total_replacements: usize = 0;
    let mut errors: Vec<ReplaceError> = Vec::new();

    for file_path in &request.file_paths {
        let path = Path::new(file_path);

        // 读取文件
        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(e) => {
                files_failed += 1;
                errors.push(ReplaceError {
                    file_path: file_path.clone(),
                    error: format!("读取失败: {}", e),
                });
                continue;
            }
        };

        // 计算替换次数
        let match_count = regex.find_iter(&content).count();
        if match_count == 0 {
            continue;
        }

        // 执行替换
        let new_content = if request.preserve_case {
            let mut result = String::with_capacity(content.len());
            let mut last_end = 0;
            for mat in regex.find_iter(&content) {
                result.push_str(&content[last_end..mat.start()]);
                let matched_text = &content[mat.start()..mat.end()];
                let converted = preserve_case_convert(matched_text, &request.replacement);
                result.push_str(&converted);
                last_end = mat.end();
            }
            result.push_str(&content[last_end..]);
            std::borrow::Cow::Owned(result)
        } else {
            regex.replace_all(&content, request.replacement.as_str())
        };

        // 写回文件
        match fs::write(path, new_content.as_bytes()) {
            Ok(_) => {
                files_replaced += 1;
                total_replacements += match_count;
            }
            Err(e) => {
                files_failed += 1;
                errors.push(ReplaceError {
                    file_path: file_path.clone(),
                    error: format!("写入失败: {}", e),
                });
            }
        }
    }

    log::info!(
        "[dir-search] 替换完成: {} 文件, {} 处替换",
        files_replaced,
        total_replacements
    );

    Ok(ReplaceResult {
        files_replaced,
        files_failed,
        total_replacements,
        errors,
    })
}

// ===== 单项替换请求 =====

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceSingleRequest {
    /// 文件绝对路径
    pub file_path: String,
    /// 匹配所在行号（1-based）
    pub line_number: usize,
    /// 匹配在行内的起始字符偏移（char 索引）
    pub match_start: usize,
    /// 匹配在行内的结束字符偏移（char 索引）
    pub match_end: usize,
    /// 替换文本
    pub replacement: String,
    /// 是否保留大小写
    pub preserve_case: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceSingleResult {
    pub success: bool,
    pub original_text: String,
    pub replaced_text: String,
}

#[tauri::command]
pub async fn dir_replace_single(
    request: ReplaceSingleRequest,
) -> Result<ReplaceSingleResult, String> {
    let path = Path::new(&request.file_path);

    if !path.exists() {
        return Err(format!("文件不存在: {}", request.file_path));
    }

    // 读取文件内容
    let content = fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))?;

    let lines: Vec<&str> = content.lines().collect();

    // 行号是 1-based
    let line_idx = request
        .line_number
        .checked_sub(1)
        .ok_or_else(|| "行号必须大于 0".to_string())?;

    if line_idx >= lines.len() {
        return Err(format!(
            "行号 {} 超出文件范围（共 {} 行）",
            request.line_number,
            lines.len()
        ));
    }

    let target_line = lines[line_idx];

    // 将 char 索引转换为字节索引
    let chars: Vec<char> = target_line.chars().collect();
    if request.match_start > chars.len() || request.match_end > chars.len() {
        return Err(format!(
            "匹配位置超出行范围（行长 {} 字符，请求 {}..{}）",
            chars.len(),
            request.match_start,
            request.match_end
        ));
    }

    let original_text: String = chars[request.match_start..request.match_end]
        .iter()
        .collect();

    // 构建新行内容
    let before: String = chars[..request.match_start].iter().collect();
    let after: String = chars[request.match_end..].iter().collect();

    let actual_replacement = if request.preserve_case {
        preserve_case_convert(&original_text, &request.replacement)
    } else {
        request.replacement.clone()
    };

    let new_line = format!("{}{}{}", before, actual_replacement, after);

    // 重建文件内容
    let mut new_lines: Vec<String> = lines.iter().map(|l| l.to_string()).collect();
    new_lines[line_idx] = new_line;

    // 保留原始行尾符（检测原文件是否以换行结尾）
    let mut new_content = new_lines.join("\n");
    if content.ends_with('\n') {
        new_content.push('\n');
    } else if content.ends_with("\r\n") {
        // 如果原文件使用 CRLF，保持一致
        new_content = new_lines.join("\r\n");
        new_content.push_str("\r\n");
    }

    // 写回文件
    fs::write(path, new_content.as_bytes()).map_err(|e| format!("写入文件失败: {}", e))?;

    log::info!(
        "[dir-search] 单项替换完成: {}:L{} [{}..{}] '{}' -> '{}'",
        request.file_path,
        request.line_number,
        request.match_start,
        request.match_end,
        original_text,
        actual_replacement
    );

    Ok(ReplaceSingleResult {
        success: true,
        original_text,
        replaced_text: actual_replacement,
    })
}

#[tauri::command]
pub async fn dir_replace_preview(request: ReplaceRequest) -> Result<Vec<FileSearchResult>, String> {
    if request.pattern.is_empty() {
        return Err("搜索模式不能为空".to_string());
    }

    // 构建匹配器
    let pattern = if request.is_regex {
        request.pattern.clone()
    } else {
        regex::escape(&request.pattern)
    };

    let pattern = if request.whole_word {
        format!(r"\b{}\b", pattern)
    } else {
        pattern
    };

    let regex = RegexBuilder::new(&pattern)
        .case_insensitive(!request.case_sensitive)
        .build()
        .map_err(|e| format!("正则表达式无效: {}", e))?;

    let mut results: Vec<FileSearchResult> = Vec::new();

    for file_path in &request.file_paths {
        let path = Path::new(file_path);

        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let file_matches = search_in_content(&content, &regex, None, 0);

        if !file_matches.is_empty() {
            results.push(FileSearchResult {
                file_path: file_path.clone(),
                relative_path: file_path.clone(),
                matches: file_matches,
            });
        }
    }

    Ok(results)
}

/// 根据原始文本的大小写风格转换替换文本（Preserve Case）
///
/// 识别模式（优先级从高到低）：
/// 1. 全大写 (APPLE) -> 替换文本也转为全大写 (ORANGE)
/// 2. 全小写 (apple) -> 替换文本也转为全小写 (orange)
/// 3. 首字母大写且其余小写 (Apple) -> 替换文本首字母大写其余小写 (Orange)
/// 4. 混合大小写 (camelCase / fOoBaR) -> 逐字符映射大小写模式到替换文本
fn preserve_case_convert(original: &str, replacement: &str) -> String {
    if original.is_empty() || replacement.is_empty() {
        return replacement.to_string();
    }

    let has_alpha = original.chars().any(|c| c.is_alphabetic());
    if !has_alpha {
        return replacement.to_string();
    }

    let is_all_uppercase = original
        .chars()
        .all(|c| !c.is_alphabetic() || c.is_uppercase());
    let is_all_lowercase = original
        .chars()
        .all(|c| !c.is_alphabetic() || c.is_lowercase());

    if is_all_uppercase {
        replacement.to_uppercase()
    } else if is_all_lowercase {
        replacement.to_lowercase()
    } else {
        // 检查是否是首字母大写且其余字母全小写 (Title Case: "Apple", "Hello")
        let alpha_chars: Vec<char> = original.chars().filter(|c| c.is_alphabetic()).collect();
        let is_title_case = alpha_chars.len() > 1
            && alpha_chars[0].is_uppercase()
            && alpha_chars[1..].iter().all(|c| c.is_lowercase());

        if is_title_case {
            let mut r_chars = replacement.chars();
            if let Some(r_first) = r_chars.next() {
                return r_first.to_uppercase().collect::<String>()
                    + &r_chars.collect::<String>().to_lowercase();
            }
        }

        // Fallback: 逐字符映射大小写模式（对齐 VS Code 行为）
        // 将原文每个字符的大小写状态"印"到替换文本对应位置上
        // 替换文本多出的部分保持原样
        let orig_chars: Vec<char> = original.chars().collect();
        let mut result = String::with_capacity(replacement.len());

        for (i, r_char) in replacement.chars().enumerate() {
            if i < orig_chars.len() {
                let o_char = orig_chars[i];
                if o_char.is_uppercase() {
                    result.extend(r_char.to_uppercase());
                } else if o_char.is_lowercase() {
                    result.extend(r_char.to_lowercase());
                } else {
                    // 原文对应位置不是字母（数字、符号等），保持替换字符原样
                    result.push(r_char);
                }
            } else {
                // 替换文本比原文长，多出的字符保持原样
                result.push(r_char);
            }
        }

        result
    }
}
