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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MatchDetail {
    pub field: String, // "name", "prompt", "modelId", "content"
    pub context: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MediaSearchResult {
    pub id: String,
    pub kind: String, // "session" | "task"
    pub title: String,
    pub matches: Vec<MatchDetail>,
    pub updated_at: Option<String>,
    pub path: String,
    pub asset_id: Option<String>,
}

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
    nodes: HashMap<String, PartialNode<'a>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialNode<'a> {
    #[serde(default, borrow)]
    content: Option<Cow<'a, str>>,
    #[serde(default, borrow)]
    metadata: Option<PartialNodeMetadata<'a>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialNodeMetadata<'a> {
    #[serde(default, borrow)]
    task_snapshot: Option<PartialTask<'a>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialTask<'a> {
    #[serde(borrow)]
    id: Cow<'a, str>,
    #[serde(default, borrow)]
    input: Option<PartialTaskInput<'a>>,
    #[serde(default, borrow)]
    result_asset_id: Option<Cow<'a, str>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialTaskInput<'a> {
    #[serde(default, borrow)]
    prompt: Option<Cow<'a, str>>,
    #[serde(default, borrow)]
    model_id: Option<Cow<'a, str>>,
}

fn extract_context(text: &str, re: &Regex, context_len: usize) -> Option<String> {
    let mat = re.find(text)?;
    let match_start_byte = mat.start();
    let match_end_byte = mat.end();

    let mut context_start_byte = match_start_byte;
    let mut chars_before = 0;
    for (byte_idx, _) in text[..match_start_byte].char_indices().rev() {
        context_start_byte = byte_idx;
        chars_before += 1;
        if chars_before >= context_len {
            break;
        }
    }
    let prefix_ellipsis = chars_before >= context_len && context_start_byte > 0;

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

    let slice = &text[context_start_byte..context_end_byte];
    let mut result = String::with_capacity(slice.len() + 8);

    if prefix_ellipsis {
        result.push_str("...");
    }

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

async fn search_media_sessions(base_dir: &Path, re: &Regex) -> Vec<MediaSearchResult> {
    let sessions_dir = base_dir.join("sessions");
    if !sessions_dir.exists() {
        return Vec::new();
    }

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

    stream::iter(paths)
        .map(|path| async move {
            let content = fs::read_to_string(&path).await.ok()?;
            if !re.is_match(&content) {
                return None;
            }

            let session = serde_json::from_str::<PartialSession>(&content).ok()?;
            let mut results = Vec::new();

            // 1. 检查会话标题
            if re.is_match(&session.name) {
                results.push(MediaSearchResult {
                    id: session.id.to_string(),
                    kind: "session".to_string(),
                    title: session.name.to_string(),
                    matches: vec![MatchDetail {
                        field: "name".to_string(),
                        context: session.name.to_string(),
                    }],
                    updated_at: session.updated_at.as_ref().map(|s| s.to_string()),
                    path: format!("media-generator/sessions/{}.json", session.id),
                    asset_id: None,
                });
            }

            // 2. 检查节点中的任务
            for node in session.nodes.values() {
                let mut matches = Vec::new();
                let mut asset_id = None;

                // 检查节点内容 (消息文本)
                if let Some(content) = &node.content {
                    if let Some(ctx) = extract_context(content, re, 40) {
                        matches.push(MatchDetail {
                            field: "content".to_string(),
                            context: ctx,
                        });
                    }
                }

                if let Some(metadata) = &node.metadata {
                    if let Some(task) = &metadata.task_snapshot {
                        asset_id = task.result_asset_id.as_ref().map(|s| s.to_string());
                        if let Some(input) = &task.input {
                            if let Some(prompt) = &input.prompt {
                                if let Some(ctx) = extract_context(prompt, re, 40) {
                                    matches.push(MatchDetail {
                                        field: "prompt".to_string(),
                                        context: ctx,
                                    });
                                }
                            }
                            if let Some(model_id) = &input.model_id {
                                if re.is_match(model_id) {
                                    matches.push(MatchDetail {
                                        field: "modelId".to_string(),
                                        context: model_id.to_string(),
                                    });
                                }
                            }
                        }
                    }
                }

                if !matches.is_empty() {
                    results.push(MediaSearchResult {
                        id: node
                            .metadata
                            .as_ref()
                            .and_then(|m| m.task_snapshot.as_ref())
                            .map(|t| t.id.to_string())
                            .unwrap_or_else(|| session.id.to_string()),
                        kind: "task".to_string(),
                        title: session.name.to_string(),
                        matches,
                        updated_at: session.updated_at.as_ref().map(|s| s.to_string()),
                        path: format!("media-generator/sessions/{}.json", session.id),
                        asset_id,
                    });
                }
            }

            Some(results)
        })
        .buffer_unordered(20)
        .filter_map(|res| async { res })
        .flat_map(stream::iter)
        .collect()
        .await
}

#[tauri::command]
pub async fn search_media_generator_data(
    app: AppHandle,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<MediaSearchResult>, String> {
    let start_time = Instant::now();
    let query = query.trim();

    if query.is_empty() {
        return Ok(Vec::new());
    }

    let max_results = limit.unwrap_or(50);
    let re = RegexBuilder::new(&regex::escape(query))
        .case_insensitive(true)
        .build()
        .map_err(|e| format!("Invalid regex: {}", e))?;

    let app_config_dir = crate::get_app_data_dir(app.config());
    let media_dir = app_config_dir.join("media-generator");

    let mut results = search_media_sessions(&media_dir, &re).await;

    // 排序：优先按匹配项数量，然后按更新时间
    results.sort_by(|a, b| {
        let count_cmp = b.matches.len().cmp(&a.matches.len());
        if count_cmp != std::cmp::Ordering::Equal {
            return count_cmp;
        }
        b.updated_at.cmp(&a.updated_at)
    });

    if results.len() > max_results {
        results.truncate(max_results);
    }

    log::info!(
        "[MEDIA_SEARCH] 搜索完成: '{}' | 耗时: {:?} | 结果: {}",
        query,
        start_time.elapsed(),
        results.len()
    );

    Ok(results)
}
