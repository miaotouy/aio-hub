use futures_util::stream::{self, StreamExt};
use unicode_segmentation::UnicodeSegmentation;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::AppHandle;
use tokio::fs;
use walkdir::WalkDir;

// --- 输出数据结构 ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MatchDetail {
    pub field: String, // "name", "displayName", "description", "presetMessage", "content"
    pub context: String, // 包含匹配项的上下文片段
    pub role: Option<String>, // 如果是消息匹配，记录消息角色
    pub match_offsets: Vec<(usize, usize)>, // 匹配项在 context 中的起止字节偏移 (start, end)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub id: String,
    pub kind: String, // "agent" | "session"
    pub title: String,
    pub matches: Vec<MatchDetail>,
    pub updated_at: Option<String>,
    pub path: String, // 文件相对路径，方便前端引用
}

// --- Agent 相关数据结构 ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialAgent<'a> {
    #[serde(borrow)]
    id: Cow<'a, str>,
    #[serde(borrow)]
    name: Cow<'a, str>,
    #[serde(default, borrow)]
    display_name: Option<Cow<'a, str>>,
    #[serde(default, borrow)]
    description: Option<Cow<'a, str>>,
    #[serde(default, borrow)]
    preset_messages: Option<Vec<PartialMessageNode<'a>>>,
    #[serde(default, borrow)]
    last_used_at: Option<Cow<'a, str>>,
    #[serde(default, borrow)]
    created_at: Option<Cow<'a, str>>,
}

// --- Session 相关数据结构 ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialSession<'a> {
    #[serde(borrow)]
    id: Cow<'a, str>,
    #[serde(borrow)]
    name: Cow<'a, str>,
    #[serde(default, borrow)]
    updated_at: Option<Cow<'a, str>>,
    #[serde(default, borrow)]
    nodes: HashMap<String, PartialMessageNode<'a>>,
}

// --- 通用消息节点结构 ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialMessageNode<'a> {
    #[serde(default, borrow)]
    content: Option<Cow<'a, str>>,
    #[serde(default, borrow)]
    role: Option<Cow<'a, str>>,
    #[serde(default, borrow)]
    name: Option<Cow<'a, str>>, // 预设消息的显示名称
    #[serde(default, borrow)]
    metadata: Option<PartialMetadata<'a>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialMetadata<'a> {
    #[serde(default, borrow)]
    reasoning_content: Option<Cow<'a, str>>,
}

// --- 搜索匹配器 ---

/// 搜索匹配器，封装三种匹配模式的逻辑
enum SearchMatcher {
    /// 单正则匹配（exact 整体匹配 / or 任一关键词匹配）
    Single(Regex),
    /// 多正则全部匹配（and 模式，所有关键词都必须出现）
    All(Vec<Regex>),
}

impl SearchMatcher {
    /// 构建搜索匹配器
    /// query: 原始查询字符串
    /// match_mode: "exact" | "and" | "or"
    fn build(query: &str, match_mode: &str) -> Result<Self, String> {
        match match_mode {
            "and" => {
                let keywords: Vec<&str> = query.split_whitespace().collect();
                if keywords.is_empty() {
                    return Err("查询关键词为空".to_string());
                }
                // 单个关键词退化为 exact 模式
                if keywords.len() == 1 {
                    let re = RegexBuilder::new(&regex::escape(keywords[0]))
                        .case_insensitive(true)
                        .build()
                        .map_err(|e| format!("Invalid regex: {}", e))?;
                    return Ok(SearchMatcher::Single(re));
                }
                let regexes: Result<Vec<Regex>, String> = keywords
                    .iter()
                    .map(|kw| {
                        RegexBuilder::new(&regex::escape(kw))
                            .case_insensitive(true)
                            .build()
                            .map_err(|e| format!("Invalid regex: {}", e))
                    })
                    .collect();
                Ok(SearchMatcher::All(regexes?))
            }
            "or" => {
                let keywords: Vec<&str> = query.split_whitespace().collect();
                if keywords.is_empty() {
                    return Err("查询关键词为空".to_string());
                }
                // 单个关键词退化为 exact 模式
                if keywords.len() == 1 {
                    let re = RegexBuilder::new(&regex::escape(keywords[0]))
                        .case_insensitive(true)
                        .build()
                        .map_err(|e| format!("Invalid regex: {}", e))?;
                    return Ok(SearchMatcher::Single(re));
                }
                // 构建 keyword1|keyword2|keyword3 的正则
                let pattern = keywords
                    .iter()
                    .map(|kw| regex::escape(kw))
                    .collect::<Vec<_>>()
                    .join("|");
                let re = RegexBuilder::new(&pattern)
                    .case_insensitive(true)
                    .build()
                    .map_err(|e| format!("Invalid regex: {}", e))?;
                Ok(SearchMatcher::Single(re))
            }
            // "exact" 或其他值，默认整体匹配
            _ => {
                let re = RegexBuilder::new(&regex::escape(query))
                    .case_insensitive(true)
                    .build()
                    .map_err(|e| format!("Invalid regex: {}", e))?;
                Ok(SearchMatcher::Single(re))
            }
        }
    }

    /// 检查文本是否匹配
    fn is_match(&self, text: &str) -> bool {
        match self {
            SearchMatcher::Single(re) => re.is_match(text),
            SearchMatcher::All(regexes) => regexes.iter().all(|re| re.is_match(text)),
        }
    }

    /// 提取匹配上下文
    /// 对于 Single 模式，直接使用该正则提取
    /// 对于 All 模式，使用第一个匹配到的正则提取上下文
        fn extract_context(&self, text: &str, context_len: usize) -> Option<(String, Vec<(usize, usize)>)> {
            match self {
                SearchMatcher::Single(re) => extract_context_with_regex(text, std::slice::from_ref(re), context_len),
                SearchMatcher::All(regexes) => {
                    // 先确认所有关键词都存在
                    if !regexes.iter().all(|re| re.is_match(text)) {
                        return None;
                    }
                    // 使用所有正则提取上下文并标记
                    extract_context_with_regex(text, regexes, context_len)
                }
            }
        }
    }
    
    // --- 辅助函数 ---
    
    /// 使用一组 Regex 提取匹配上下文并返回匹配位置
    /// text: 原始文本
    /// regexes: 预编译的正则表达式列表
    /// context_len: 上下文长度（前后保留的字符数）
    fn extract_context_with_regex(text: &str, regexes: &[Regex], context_len: usize) -> Option<(String, Vec<(usize, usize)>)> {
        // 查找第一个匹配项（任意一个正则匹配到的第一个）
        let mut first_match: Option<regex::Match> = None;
        for re in regexes {
            if let Some(mat) = re.find(text) {
                match first_match {
                    Some(ref current) if mat.start() < current.start() => first_match = Some(mat),
                    None => first_match = Some(mat),
                    _ => {}
                }
            }
        }
    
        let mat = first_match?;
        let match_start_byte = mat.start();
        let match_end_byte = mat.end();
    
        // --- 向前查找上下文起始字节位置 ---
        let mut context_start_byte = match_start_byte;
        let mut chars_before = 0;
        for (byte_idx, _) in text[..match_start_byte].char_indices().rev() {
            context_start_byte = byte_idx;
            chars_before += 1;
            if chars_before >= context_len {
                break;
            }
        }
    
        // --- 向后查找上下文结束字节位置 ---
        let mut context_end_byte = match_end_byte;
        let mut chars_after = 0;
        for (byte_offset, c) in text[match_end_byte..].char_indices() {
            context_end_byte = match_end_byte + byte_offset + c.len_utf8();
            chars_after += 1;
            if chars_after >= context_len {
                break;
            }
        }
    
        // --- 构建结果字符串和偏移量 ---
        let slice = &text[context_start_byte..context_end_byte];
        let mut context = String::with_capacity(slice.len());
        // 收集在此上下文范围内的所有匹配项
        // 注意：我们将字节偏移转换为字符索引，以适配前端 JS 字符串操作
        let mut match_offsets = Vec::new();
        for re in regexes {
            for mat in re.find_iter(slice) {
                let start_char = slice[..mat.start()].graphemes(true).count();
                let end_char = start_char + slice[mat.start()..mat.end()].graphemes(true).count();
                match_offsets.push((start_char, end_char));
            }
        }
        
        // 排序并合并重叠的偏移量（如果有）
        match_offsets.sort_by_key(|m| m.0);
        let mut merged_offsets = Vec::new();
        if !match_offsets.is_empty() {
            let mut current = match_offsets[0];
            for next in match_offsets.into_iter().skip(1) {
                if next.0 <= current.1 {
                    current.1 = current.1.max(next.1);
                } else {
                    merged_offsets.push(current);
                    current = next;
                }
            }
            merged_offsets.push(current);
        }
    
        // 替换换行符，同时保持偏移量有效（换行符替换为单空格，长度不变）
        for c in slice.chars() {
            match c {
                '\n' | '\r' => context.push(' '),
                _ => context.push(c),
            }
        }
    
        Some((context, merged_offsets))
    }

async fn search_agents(base_dir: &Path, matcher: &SearchMatcher) -> Vec<SearchResult> {
    let agents_dir = base_dir.join("agents");
    if !agents_dir.exists() {
        return Vec::new();
    }

    // 收集文件路径
    let paths: Vec<PathBuf> = WalkDir::new(&agents_dir)
        .min_depth(1)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file() && e.file_name() == "agent.json")
        .map(|e| e.path().to_owned())
        .collect();

    // 并发处理
    stream::iter(paths)
        .map(|path| async move {
            let content = fs::read_to_string(&path).await.ok()?;

            // 预过滤：如果全文都不包含关键词，直接跳过昂贵的 JSON 解析
            if !matcher.is_match(&content) {
                return None;
            }

            let agent = serde_json::from_str::<PartialAgent>(&content).ok()?;
            let mut matches = Vec::new();

            // 检查名称
                        if let Some((ctx, offsets)) = matcher.extract_context(&agent.name, 100) {
                            matches.push(MatchDetail {
                                field: "name".to_string(),
                                context: ctx,
                                role: None,
                                match_offsets: offsets,
                            });
                        }
            
                        // 检查显示名称
                        if let Some(display_name) = &agent.display_name {
                            if let Some((ctx, offsets)) = matcher.extract_context(display_name, 100) {
                                matches.push(MatchDetail {
                                    field: "displayName".to_string(),
                                    context: ctx,
                                    role: None,
                                    match_offsets: offsets,
                                });
                            }
                        }
            
                        // 检查描述
                        if let Some(desc) = &agent.description {
                            if let Some((ctx, offsets)) = matcher.extract_context(desc, 60) {
                                matches.push(MatchDetail {
                                    field: "description".to_string(),
                                    context: ctx,
                                    role: None,
                                    match_offsets: offsets,
                                });
                            }
                        }

            // 检查预设消息序列
            if let Some(preset_messages) = &agent.preset_messages {
                let mut matched_count = 0;
                for msg in preset_messages {
                    if matched_count >= 3 {
                        break;
                    }

                    // 检查预设消息的名称
                                        if let Some(name) = &msg.name {
                                            if let Some((ctx, offsets)) = matcher.extract_context(name, 100) {
                                                matches.push(MatchDetail {
                                                    field: "presetMessageName".to_string(),
                                                    context: ctx,
                                                    role: msg.role.as_ref().map(|r| r.to_string()),
                                                    match_offsets: offsets,
                                                });
                                                matched_count += 1;
                                                continue;
                                            }
                                        }
                    
                                        // 检查消息内容
                                        if let Some(content) = &msg.content {
                                            if let Some((ctx, offsets)) = matcher.extract_context(content, 60) {
                                                matches.push(MatchDetail {
                                                    field: "presetMessage".to_string(),
                                                    context: ctx,
                                                    role: msg.role.as_ref().map(|r| r.to_string()),
                                                    match_offsets: offsets,
                                                });
                                                matched_count += 1;
                                            }
                                        }
                }
            }

            if matches.is_empty() {
                return None;
            }

            let title = agent
                .display_name
                .as_ref()
                .unwrap_or(&agent.name)
                .to_string();

            Some(SearchResult {
                id: agent.id.to_string(),
                kind: "agent".to_string(),
                title,
                matches,
                updated_at: agent
                    .last_used_at
                    .or(agent.created_at)
                    .map(|s| s.to_string()),
                path: format!("llm-chat/agents/{}/agent.json", agent.id),
            })
        })
        .buffer_unordered(50) // 并发度 50
        .filter_map(|res| async { res })
        .collect()
        .await
}

async fn search_sessions(base_dir: &Path, matcher: &SearchMatcher) -> Vec<SearchResult> {
    let sessions_dir = base_dir.join("sessions");
    if !sessions_dir.exists() {
        return Vec::new();
    }

    // 收集文件路径
    let paths: Vec<PathBuf> = WalkDir::new(&sessions_dir)
        .min_depth(1)
        .max_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_file() && e.path().extension().is_some_and(|ext| ext == "json")
        })
        .map(|e| e.path().to_owned())
        .collect();

    // 并发处理
    stream::iter(paths)
        .map(|path| async move {
            let content = fs::read_to_string(&path).await.ok()?;

            // 预过滤：如果全文都不包含关键词，直接跳过昂贵的 JSON 解析
            if !matcher.is_match(&content) {
                return None;
            }

            let session = serde_json::from_str::<PartialSession>(&content).ok()?;
            let mut matches = Vec::new();

            // 检查会话名称
                        if let Some((ctx, offsets)) = matcher.extract_context(&session.name, 100) {
                            matches.push(MatchDetail {
                                field: "name".to_string(),
                                context: ctx,
                                role: None,
                                match_offsets: offsets,
                            });
                        }
            
                        // 检查消息内容
                        let mut matched_nodes_count = 0;
                        for node in session.nodes.values() {
                            if matched_nodes_count >= 5 {
                                break;
                            }
            
                            // 检查消息内容
                            if let Some(content) = &node.content {
                                if let Some((ctx, offsets)) = matcher.extract_context(content, 60) {
                                    matches.push(MatchDetail {
                                        field: "content".to_string(),
                                        context: ctx,
                                        role: node.role.as_ref().map(|r| r.to_string()),
                                        match_offsets: offsets,
                                    });
                                    matched_nodes_count += 1;
                                }
                            }
            
                            // 检查推理内容
                            if let Some(metadata) = &node.metadata {
                                if let Some(reasoning) = &metadata.reasoning_content {
                                    if let Some((ctx, offsets)) = matcher.extract_context(reasoning, 60) {
                                        matches.push(MatchDetail {
                                            field: "reasoningContent".to_string(),
                                            context: ctx,
                                            role: node.role.as_ref().map(|r| r.to_string()),
                                            match_offsets: offsets,
                                        });
                                        matched_nodes_count += 1;
                                    }
                                }
                            }
                        }

            if matches.is_empty() {
                return None;
            }

            // 获取文件名作为 ID 的一部分或用于路径
            let filename = path.file_name()?.to_string_lossy().to_string();

            Some(SearchResult {
                id: session.id.to_string(),
                kind: "session".to_string(),
                title: session.name.to_string(),
                matches,
                updated_at: session.updated_at.map(|s| s.to_string()),
                path: format!("llm-chat/sessions/{}", filename),
            })
        })
        .buffer_unordered(50) // 并发度 50
        .filter_map(|res| async { res })
        .collect()
        .await
}

// --- 核心命令 ---

#[tauri::command]
pub async fn search_llm_data(
    app: AppHandle,
    query: String,
    limit: Option<usize>,
    scope: Option<String>,
    match_mode: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    let start_time = Instant::now();
    let query = query.trim();

    if query.is_empty() {
        return Ok(Vec::new());
    }

    let scope = scope.unwrap_or_else(|| "all".to_string());
    let match_mode = match_mode.unwrap_or_else(|| "exact".to_string());
    log::info!(
        "[LLM_SEARCH] 开始搜索: '{}' (scope: {}, mode: {})",
        query,
        scope,
        match_mode
    );

    let max_results = limit.unwrap_or(50);

    // 构建搜索匹配器
    let matcher = SearchMatcher::build(query, &match_mode)?;

    // 获取 AppData 目录
    let app_data_dir = crate::get_app_data_dir(app.config());

    let llm_chat_dir = app_data_dir.join("llm-chat");

    let (mut results, agent_count, session_count) = match scope.as_str() {
        "agent" => {
            let agents = search_agents(&llm_chat_dir, &matcher).await;
            let count = agents.len();
            (agents, count, 0)
        }
        "session" => {
            let sessions = search_sessions(&llm_chat_dir, &matcher).await;
            let count = sessions.len();
            (sessions, 0, count)
        }
        _ => {
            // 并行执行 Agent 和 Session 搜索
            let (agents, mut sessions) = tokio::join!(
                search_agents(&llm_chat_dir, &matcher),
                search_sessions(&llm_chat_dir, &matcher)
            );
            let a_count = agents.len();
            let s_count = sessions.len();
            let mut all = agents;
            all.append(&mut sessions);
            (all, a_count, s_count)
        }
    };

    // 排序：匹配数量多的排前面，然后按更新时间倒序
    results.sort_by(|a, b| {
        let count_cmp = b.matches.len().cmp(&a.matches.len());
        if count_cmp != std::cmp::Ordering::Equal {
            return count_cmp;
        }
        b.updated_at.cmp(&a.updated_at)
    });

    // 截取最大数量
    if results.len() > max_results {
        results.truncate(max_results);
    }

    let duration = start_time.elapsed();
    log::info!(
        "[LLM_SEARCH] 搜索完成: '{}' | 耗时: {:?} | 结果: {} (Agents: {}, Sessions: {})",
        query,
        duration,
        results.len(),
        agent_count,
        session_count
    );

    Ok(results)
}
