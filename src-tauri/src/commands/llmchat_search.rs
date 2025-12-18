use std::fs;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;
use std::collections::HashMap;

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

/// 提取匹配上下文
/// text: 原始文本
/// query_lower: 搜索关键词（已转小写）
/// context_len: 上下文长度（前后保留的字符数）
fn extract_context(text: &str, query_lower: &str, context_len: usize) -> Option<String> {
    let text_lower = text.to_lowercase();
    if let Some(idx) = text_lower.find(query_lower) {
        // 使用字符索引而不是字节索引，以正确处理 UTF-8
        let chars: Vec<char> = text.chars().collect();
        
        // 找到字符索引（将字节索引转换为字符索引）
        let mut char_idx = 0;
        for (i, _) in text_lower.char_indices() {
            if i == idx {
                break;
            }
            char_idx += 1;
        }
        
        let start = if char_idx > context_len { char_idx - context_len } else { 0 };
        let query_char_len = query_lower.chars().count();
        let end = std::cmp::min(char_idx + query_char_len + context_len, chars.len());
        
        let snippet: String = chars[start..end].iter().collect();
        let mut result = snippet.replace('\n', " ").replace('\r', "");
        
        if start > 0 {
            result = format!("...{}", result);
        }
        if end < chars.len() {
            result = format!("{}...", result);
        }
        Some(result)
    } else {
        None
    }
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

    let query_lower = query.to_lowercase();
    let max_results = limit.unwrap_or(50);
    let mut results: Vec<SearchResult> = Vec::new();

    // 获取 AppData 目录
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let llm_chat_dir = app_data_dir.join("llm-chat");
    
    // 1. 搜索 Agents
    let agents_dir = llm_chat_dir.join("agents");
    if agents_dir.exists() {
        for entry in WalkDir::new(&agents_dir).min_depth(1).max_depth(2) {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            
            if entry.file_type().is_file() && entry.file_name() == "agent.json" {
                let path = entry.path();
                if let Ok(content) = fs::read_to_string(path) {
                    if let Ok(agent) = serde_json::from_str::<PartialAgent>(&content) {
                        let mut matches = Vec::new();

                        // 检查名称
                        if agent.name.to_lowercase().contains(&query_lower) {
                            matches.push(MatchDetail {
                                field: "name".to_string(),
                                context: agent.name.clone(),
                                role: None,
                            });
                        }

                        // 检查显示名称
                        if let Some(display_name) = &agent.display_name {
                            if display_name.to_lowercase().contains(&query_lower) {
                                matches.push(MatchDetail {
                                    field: "displayName".to_string(),
                                    context: display_name.clone(),
                                    role: None,
                                });
                            }
                        }

                        // 检查描述
                        if let Some(desc) = &agent.description {
                            if let Some(ctx) = extract_context(desc, &query_lower, 30) {
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
                                    if name.to_lowercase().contains(&query_lower) {
                                        matches.push(MatchDetail {
                                            field: "presetMessageName".to_string(),
                                            context: name.clone(),
                                            role: msg.role.clone(),
                                        });
                                        matched_count += 1;
                                        continue; // 同一条消息只计一次匹配
                                    }
                                }
                                
                                // 检查消息内容
                                if let Some(content) = &msg.content {
                                    if let Some(ctx) = extract_context(content, &query_lower, 40) {
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

                        if !matches.is_empty() {
                            let title = agent.display_name
                                .as_ref()
                                .unwrap_or(&agent.name)
                                .clone();
                            
                            results.push(SearchResult {
                                id: agent.id.clone(),
                                kind: "agent".to_string(),
                                title,
                                matches,
                                updated_at: agent.last_used_at.or(agent.created_at),
                                path: format!("llm-chat/agents/{}/agent.json", agent.id),
                            });
                        }
                    }
                }
            }
        }
    }

    // 2. 搜索 Sessions
    let sessions_dir = llm_chat_dir.join("sessions");
    if sessions_dir.exists() {
        for entry in WalkDir::new(&sessions_dir).min_depth(1).max_depth(1) {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            
            if entry.file_type().is_file() && entry.path().extension().map_or(false, |ext| ext == "json") {
                let path = entry.path();
                if let Ok(content) = fs::read_to_string(path) {
                    if let Ok(session) = serde_json::from_str::<PartialSession>(&content) {
                        let mut matches = Vec::new();

                        // 检查会话名称
                        if session.name.to_lowercase().contains(&query_lower) {
                            matches.push(MatchDetail {
                                field: "name".to_string(),
                                context: session.name.clone(),
                                role: None,
                            });
                        }

                        // 检查消息内容
                        let mut matched_nodes_count = 0;
                        for (_, node) in &session.nodes {
                            if matched_nodes_count >= 5 { break; }
                            
                            // 检查消息内容
                            if let Some(content) = &node.content {
                                if let Some(ctx) = extract_context(content, &query_lower, 40) {
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
                                    if let Some(ctx) = extract_context(reasoning, &query_lower, 40) {
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

                        if !matches.is_empty() {
                            results.push(SearchResult {
                                id: session.id.clone(),
                                kind: "session".to_string(),
                                title: session.name,
                                matches,
                                updated_at: session.updated_at,
                                path: format!("llm-chat/sessions/{}", path.file_name().unwrap().to_string_lossy()),
                            });
                        }
                    }
                }
            }
        }
    }

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