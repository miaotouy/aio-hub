use futures_util::stream::{self, StreamExt};
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

// --- 辅助函数 ---

/// 使用 Regex 提取匹配上下文
/// text: 原始文本
/// re: 预编译的正则表达式（不区分大小写）
/// context_len: 上下文长度（前后保留的字符数）
///
/// 优化版本：不再收集整个文本的 char_indices，而是从匹配点向前/向后迭代
fn extract_context(text: &str, re: &Regex, context_len: usize) -> Option<String> {
    // 查找第一个匹配项
    let mat = re.find(text)?;
    let match_start_byte = mat.start();
    let match_end_byte = mat.end();

    // --- 向前查找上下文起始字节位置 ---
    // 从 match_start_byte 向前迭代 context_len 个字符
    let mut context_start_byte = match_start_byte;
    let mut chars_before = 0;
    for (byte_idx, _) in text[..match_start_byte].char_indices().rev() {
        context_start_byte = byte_idx;
        chars_before += 1;
        if chars_before >= context_len {
            break;
        }
    }
    // 如果迭代完了还没到 context_len 个字符，说明到了字符串开头
    let prefix_ellipsis = chars_before >= context_len && context_start_byte > 0;

    // --- 向后查找上下文结束字节位置 ---
    // 从 match_end_byte 向后迭代 context_len 个字符
    let mut context_end_byte = match_end_byte;
    let mut chars_after = 0;
    for (byte_offset, c) in text[match_end_byte..].char_indices() {
        context_end_byte = match_end_byte + byte_offset + c.len_utf8();
        chars_after += 1;
        if chars_after >= context_len {
            break;
        }
    }
    let suffix_ellipsis = context_end_byte < text.len();

    // --- 构建结果字符串 ---
    // 直接切片，然后替换换行符
    let slice = &text[context_start_byte..context_end_byte];

    // 预估容量：原始长度 + 可能的省略号(6字节)
    let mut result = String::with_capacity(slice.len() + 8);

    if prefix_ellipsis {
        result.push_str("...");
    }

    // 单次遍历替换换行符
    for c in slice.chars() {
        match c {
            '\n' | '\r' => result.push(' '),
            _ => result.push(c),
        }
    }

    if suffix_ellipsis {
        result.push_str("...");
    }

    Some(result)
}

async fn search_agents(base_dir: &Path, re: &Regex) -> Vec<SearchResult> {
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
            if !re.is_match(&content) {
                return None;
            }

            let agent = serde_json::from_str::<PartialAgent>(&content).ok()?;
            let mut matches = Vec::new();

            // 检查名称
            if re.is_match(&agent.name) {
                matches.push(MatchDetail {
                    field: "name".to_string(),
                    context: agent.name.to_string(),
                    role: None,
                });
            }

            // 检查显示名称
            if let Some(display_name) = &agent.display_name {
                if re.is_match(display_name) {
                    matches.push(MatchDetail {
                        field: "displayName".to_string(),
                        context: display_name.to_string(),
                        role: None,
                    });
                }
            }

            // 检查描述
            if let Some(desc) = &agent.description {
                if let Some(ctx) = extract_context(desc, re, 30) {
                    matches.push(MatchDetail {
                        field: "description".to_string(),
                        context: ctx,
                        role: None,
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
                        if re.is_match(name) {
                            matches.push(MatchDetail {
                                field: "presetMessageName".to_string(),
                                context: name.to_string(),
                                role: msg.role.as_ref().map(|r| r.to_string()),
                            });
                            matched_count += 1;
                            continue;
                        }
                    }

                    // 检查消息内容
                    if let Some(content) = &msg.content {
                        if let Some(ctx) = extract_context(content, re, 40) {
                            matches.push(MatchDetail {
                                field: "presetMessage".to_string(),
                                context: ctx,
                                role: msg.role.as_ref().map(|r| r.to_string()),
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

async fn search_sessions(base_dir: &Path, re: &Regex) -> Vec<SearchResult> {
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
            if !re.is_match(&content) {
                return None;
            }

            let session = serde_json::from_str::<PartialSession>(&content).ok()?;
            let mut matches = Vec::new();

            // 检查会话名称
            if re.is_match(&session.name) {
                matches.push(MatchDetail {
                    field: "name".to_string(),
                    context: session.name.to_string(),
                    role: None,
                });
            }

            // 检查消息内容
            let mut matched_nodes_count = 0;
            // 注意：HashMap 迭代顺序不确定，如果需要稳定排序可能需要先收集 keys
            // 但这里只是搜索，顺序不重要，最后会按匹配数量排序
            for node in session.nodes.values() {
                if matched_nodes_count >= 5 {
                    break;
                }

                // 检查消息内容
                if let Some(content) = &node.content {
                    if let Some(ctx) = extract_context(content, re, 40) {
                        matches.push(MatchDetail {
                            field: "content".to_string(),
                            context: ctx,
                            role: node.role.as_ref().map(|r| r.to_string()),
                        });
                        matched_nodes_count += 1;
                    }
                }

                // 检查推理内容
                if let Some(metadata) = &node.metadata {
                    if let Some(reasoning) = &metadata.reasoning_content {
                        if let Some(ctx) = extract_context(reasoning, re, 40) {
                            matches.push(MatchDetail {
                                field: "reasoningContent".to_string(),
                                context: ctx,
                                role: node.role.as_ref().map(|r| r.to_string()),
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
) -> Result<Vec<SearchResult>, String> {
    let start_time = Instant::now();
    let query = query.trim();

    if query.is_empty() {
        return Ok(Vec::new());
    }

    let scope = scope.unwrap_or_else(|| "all".to_string());
    log::info!("[LLM_SEARCH] 开始搜索: '{}' (scope: {})", query, scope);

    let max_results = limit.unwrap_or(50);

    // 编译正则表达式，不区分大小写
    let re = RegexBuilder::new(&regex::escape(query))
        .case_insensitive(true)
        .build()
        .map_err(|e| format!("Invalid regex: {}", e))?;

    // 获取 AppData 目录
    let app_data_dir = crate::get_app_data_dir(app.config());

    let llm_chat_dir = app_data_dir.join("llm-chat");

    let (mut results, agent_count, session_count) = match scope.as_str() {
        "agent" => {
            let agents = search_agents(&llm_chat_dir, &re).await;
            let count = agents.len();
            (agents, count, 0)
        }
        "session" => {
            let sessions = search_sessions(&llm_chat_dir, &re).await;
            let count = sessions.len();
            (sessions, 0, count)
        }
        _ => {
            // 并行执行 Agent 和 Session 搜索
            let (agents, mut sessions) = tokio::join!(
                search_agents(&llm_chat_dir, &re),
                search_sessions(&llm_chat_dir, &re)
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
