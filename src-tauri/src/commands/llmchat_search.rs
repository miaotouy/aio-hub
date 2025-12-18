use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;
use regex::{Regex, RegexBuilder};
use tokio::fs;
use futures_util::stream::{self, StreamExt};

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
struct PartialAgent {
    id: String,
    name: String,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    preset_messages: Option<Vec<PartialMessageNode>>,
    #[serde(default)]
    last_used_at: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
}

// --- Session 相关数据结构 ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialSession {
    id: String,
    name: String,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    nodes: HashMap<String, PartialMessageNode>,
}

// --- 通用消息节点结构 ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialMessageNode {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    name: Option<String>, // 预设消息的显示名称
    #[serde(default)]
    metadata: Option<PartialMetadata>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialMetadata {
    #[serde(default)]
    reasoning_content: Option<String>,
}

// --- 辅助函数 ---

/// 使用 Regex 提取匹配上下文
/// text: 原始文本
/// re: 预编译的正则表达式（不区分大小写）
/// context_len: 上下文长度（前后保留的字符数）
fn extract_context(text: &str, re: &Regex, context_len: usize) -> Option<String> {
    // 查找第一个匹配项
    let mat = re.find(text)?;
    let start_byte = mat.start();
    let end_byte = mat.end();

    // 优化：直接在原始字符串上操作，避免 to_lowercase 的全量分配
    // 需要处理 UTF-8 字符边界
    
    // 向前倒推寻找起始位置比较复杂，不如收集字符索引
    // 为了性能，我们只在匹配成功后才进行字符遍历
    let char_indices: Vec<(usize, char)> = text.char_indices().collect();
    
    // 找到匹配项在 char_indices 中的索引
    let match_start_char_index = char_indices.iter().position(|(idx, _)| *idx == start_byte)?;
    let match_end_char_index = char_indices.iter().position(|(idx, _)| *idx == end_byte).unwrap_or(char_indices.len());
    let context_start_idx = match_start_char_index.saturating_sub(context_len);
    let context_end_idx = std::cmp::min(match_end_char_index + context_len, char_indices.len());
    
    // 构建结果字符串
    let mut result = String::with_capacity((context_end_idx - context_start_idx) * 4);
    for (_, c) in char_indices.iter().take(context_end_idx).skip(context_start_idx) {
        result.push(*c);
    }
    
    // 清理换行符
    let mut clean_result = result.replace('\n', " ").replace('\r', "");
    
    if context_start_idx > 0 {
        clean_result = format!("...{}", clean_result);
    }
    if context_end_idx < char_indices.len() {
        clean_result = format!("{}...", clean_result);
    }
    
    Some(clean_result)
}

async fn search_agents(
    base_dir: &Path,
    re: &Regex
) -> Vec<SearchResult> {
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
            let agent = serde_json::from_str::<PartialAgent>(&content).ok()?;
            let mut matches = Vec::new();

            // 检查名称
            if re.is_match(&agent.name) {
                matches.push(MatchDetail {
                    field: "name".to_string(),
                    context: agent.name.clone(),
                    role: None,
                });
            }

            // 检查显示名称
            if let Some(display_name) = &agent.display_name {
                if re.is_match(display_name) {
                    matches.push(MatchDetail {
                        field: "displayName".to_string(),
                        context: display_name.clone(),
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
                    if matched_count >= 3 { break; }
                    
                    // 检查预设消息的名称
                    if let Some(name) = &msg.name {
                        if re.is_match(name) {
                            matches.push(MatchDetail {
                                field: "presetMessageName".to_string(),
                                context: name.clone(),
                                role: msg.role.clone(),
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
                                role: msg.role.clone(),
                            });
                            matched_count += 1;
                        }
                    }
                }
            }

            if matches.is_empty() {
                return None;
            }

            let title = agent.display_name
                .as_ref()
                .unwrap_or(&agent.name)
                .clone();
            
            Some(SearchResult {
                id: agent.id.clone(),
                kind: "agent".to_string(),
                title,
                matches,
                updated_at: agent.last_used_at.or(agent.created_at),
                path: format!("llm-chat/agents/{}/agent.json", agent.id),
            })
        })
        .buffer_unordered(10) // 并发度 10
        .filter_map(|res| async { res })
        .collect()
        .await
}

async fn search_sessions(
    base_dir: &Path,
    re: &Regex
) -> Vec<SearchResult> {
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
        .filter(|e| e.file_type().is_file() && e.path().extension().is_some_and(|ext| ext == "json"))
        .map(|e| e.path().to_owned())
        .collect();

    // 并发处理
    stream::iter(paths)
        .map(|path| async move {
            let content = fs::read_to_string(&path).await.ok()?;
            let session = serde_json::from_str::<PartialSession>(&content).ok()?;
            let mut matches = Vec::new();

            // 检查会话名称
            if re.is_match(&session.name) {
                matches.push(MatchDetail {
                    field: "name".to_string(),
                    context: session.name.clone(),
                    role: None,
                });
            }

            // 检查消息内容
            let mut matched_nodes_count = 0;
            // 注意：HashMap 迭代顺序不确定，如果需要稳定排序可能需要先收集 keys
            // 但这里只是搜索，顺序不重要，最后会按匹配数量排序
            for node in session.nodes.values() {
                if matched_nodes_count >= 5 { break; }
                
                // 检查消息内容
                if let Some(content) = &node.content {
                    if let Some(ctx) = extract_context(content, re, 40) {
                        matches.push(MatchDetail {
                            field: "content".to_string(),
                            context: ctx,
                            role: node.role.clone(),
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
                                role: node.role.clone(),
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
                id: session.id.clone(),
                kind: "session".to_string(),
                title: session.name,
                matches,
                updated_at: session.updated_at,
                path: format!("llm-chat/sessions/{}", filename),
            })
        })
        .buffer_unordered(10) // 并发度 10
        .filter_map(|res| async { res })
        .collect()
        .await
}

// --- 核心命令 ---

#[tauri::command]
pub async fn search_llm_data(
    app: AppHandle,
    query: String,
    limit: Option<usize>
) -> Result<Vec<SearchResult>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let max_results = limit.unwrap_or(50);

    // 编译正则表达式，不区分大小写
    let re = RegexBuilder::new(&regex::escape(query))
        .case_insensitive(true)
        .build()
        .map_err(|e| format!("Invalid regex: {}", e))?;

    // 获取 AppData 目录
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let llm_chat_dir = app_data_dir.join("llm-chat");
    
    // 并行执行 Agent 和 Session 搜索
    let (agents, mut sessions) = tokio::join!(
        search_agents(&llm_chat_dir, &re),
        search_sessions(&llm_chat_dir, &re)
    );

    // 合并结果
    let mut results = agents;
    results.append(&mut sessions);

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

    Ok(results)
}