// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

use crate::recall::core::RecallEntry;
use crate::recall::monitor::{
    emit_monitor_event, IndexMetadata, IndexPayload, IndexStats, RecallMonitorEvent,
    RecallMonitorLevel, RecallMonitorStep, RecallStepStatus,
};
use crate::recall::state::RecallState;
use crate::recall::utils::*;
use rayon::prelude::*;
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportConfig {
    pub auto_extract_tags: bool,
    pub auto_extract_title: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchImportResult {
    pub entries: Vec<RecallEntry>,
    pub skipped_count: usize,
    pub duplicate_count: usize,
}

#[tauri::command]
pub async fn recall_load_entry(
    state: State<'_, RecallState>,
    recall_id: Uuid,
    entry_id: Uuid,
) -> Result<Option<RecallEntry>, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&recall_id) {
        let base = base_lock.read().map_err(|_| "获取思绪集读锁失败")?;
        if let Some(entry) = base.entries.get(&entry_id).cloned() {
            Ok(Some(entry))
        } else {
            Ok(None)
        }
    } else {
        state.repository()?.load_entry(recall_id, entry_id)
    }
}

#[tauri::command]
pub async fn recall_get_entries(
    state: State<'_, RecallState>,
    ids: Vec<Uuid>,
) -> Result<Vec<serde_json::Value>, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    let mut results = Vec::new();

    // 遍历所有思绪集查找对应的 ID
    for base_lock in imdb.bases.values() {
        let base = base_lock.read().map_err(|_| "获取思绪集读锁失败")?;
        for id in &ids {
            if let Some(entry) = base.entries.get(id) {
                // 转换为前端需要的格式，包含 recall_name 和 recall_id
                results.push(serde_json::json!({
                    "id": entry.id,
                    "key": entry.key,
                    "content": entry.content,
                    "tags": entry.tags,
                    "recall_id": base.meta.id,
                    "recall_name": base.meta.name,
                }));
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn recall_list_entry_ids(
    state: State<'_, RecallState>,
    recall_id: Uuid,
) -> Result<Vec<Uuid>, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&recall_id) {
        let base = base_lock.read().map_err(|_| "获取思绪集读锁失败")?;
        Ok(base.entries.keys().cloned().collect())
    } else {
        Ok(state
            .repository()?
            .load_entries(recall_id)?
            .into_iter()
            .map(|entry| entry.id)
            .collect())
    }
}

#[tauri::command]
pub async fn recall_upsert_entry(
    app: AppHandle,
    state: State<'_, RecallState>,
    recall_id: Uuid,
    mut entry: RecallEntry,
    config: Option<ImportConfig>,
) -> Result<RecallEntry, String> {
    let start_time = std::time::Instant::now();
    if let Some(cfg) = config {
        if cfg.auto_extract_title {
            if let Some(title) = extract_title_from_content(&entry.content) {
                entry.key = title;
            }
        }
        if cfg.auto_extract_tags && entry.tags.is_empty() {
            entry.tags = extract_tags_from_content(&entry.content)
                .into_iter()
                .map(|name| {
                    let hash = calculate_content_hash(&name);
                    crate::recall::core::TagWithWeight {
                        name,
                        weight: 1.0,
                        hash,
                    }
                })
                .collect();
        }
    }

    let new_hash = calculate_content_hash(&entry.content);
    entry.content_hash = Some(new_hash);

    if entry.summary.is_empty() {
        entry.summary = generate_summary(&entry.content);
    }

    let repository = state.repository()?;
    let content_changed = repository
        .load_entry(recall_id, entry.id)?
        .is_some_and(|previous| previous.content_hash != entry.content_hash);
    repository.upsert_entry(recall_id, &entry)?;

    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&recall_id) {
        let mut base = base_lock.write().map_err(|_| "获取思绪集写锁失败")?;
        if content_changed {
            base.remove_entry(&entry.id);
        }
        base.sync_entry(entry.clone());
    }

    let duration = start_time.elapsed().as_millis() as u64;
    // 发送监控事件
    let _ = emit_monitor_event(
        &app,
        RecallMonitorEvent::Index(IndexPayload {
            steps: vec![RecallMonitorStep {
                name: "条目更新".to_string(),
                status: RecallStepStatus::Completed,
                duration,
                details: Some(format!("条目 {} 更新完成", entry.key)),
            }],
            stats: IndexStats {
                total_files: 1,
                processed_files: 1,
                total_chunks: 1,
                vectorized_chunks: 0,
                duration,
            },
            metadata: Some(IndexMetadata {
                recall_id: recall_id.to_string(),
                model_id: "".to_string(),
                file_patterns: vec![],
            }),
        }),
        RecallMonitorLevel::Info,
        "条目更新完成",
        &format!("条目 \"{}\" 已保存", entry.key),
        "Indexer",
    );

    Ok(entry)
}

#[tauri::command]
pub async fn recall_delete_entry(
    state: State<'_, RecallState>,
    recall_id: Uuid,
    entry_id: Uuid,
) -> Result<(), String> {
    state.repository()?.delete_entries(recall_id, &[entry_id])?;

    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&recall_id) {
        let mut base = base_lock.write().map_err(|_| "获取思绪集写锁失败")?;
        base.remove_entry(&entry_id);
    }
    Ok(())
}

#[tauri::command]
pub async fn recall_batch_import_files(
    app: AppHandle,
    state: State<'_, RecallState>,
    recall_id: Uuid,
    paths: Vec<String>,
    deduplicate: bool,
    config: ImportConfig,
) -> Result<BatchImportResult, String> {
    let start_time = std::time::Instant::now();

    let total_paths = paths.len();

    // 发送开始索引监控事件
    let _ = emit_monitor_event(
        &app,
        RecallMonitorEvent::Index(IndexPayload {
            steps: vec![RecallMonitorStep {
                name: "文件扫描".to_string(),
                status: RecallStepStatus::Running,
                duration: 0,
                details: Some(format!("准备处理 {} 个文件", total_paths)),
            }],
            stats: IndexStats {
                total_files: total_paths as u32,
                processed_files: 0,
                total_chunks: 0,
                vectorized_chunks: 0,
                duration: 0,
            },
            metadata: Some(IndexMetadata {
                recall_id: recall_id.to_string(),
                model_id: "".to_string(), // 导入阶段暂无模型
                file_patterns: vec![],
            }),
        }),
        RecallMonitorLevel::Info,
        "开始导入文件",
        &format!("正在处理 {} 个文件", total_paths),
        "Indexer",
    );

    let candidates: Vec<RecallEntry> = paths
        .into_par_iter()
        .enumerate()
        .filter_map(|(idx, path_str)| {
            let path = std::path::Path::new(&path_str);

            // 进度推送 (每处理 5 个文件推送一次，避免过于频繁)
            if idx > 0 && idx % 5 == 0 {
                let _ = emit_monitor_event(
                    &app,
                    RecallMonitorEvent::Index(IndexPayload {
                        steps: vec![RecallMonitorStep {
                            name: "文件扫描".to_string(),
                            status: RecallStepStatus::Running,
                            duration: start_time.elapsed().as_millis() as u64,
                            details: Some(format!("正在处理第 {}/{} 个文件", idx + 1, total_paths)),
                        }],
                        stats: IndexStats {
                            total_files: total_paths as u32,
                            processed_files: idx as u32,
                            total_chunks: idx as u32,
                            vectorized_chunks: 0,
                            duration: start_time.elapsed().as_millis() as u64,
                        },
                        metadata: Some(IndexMetadata {
                            recall_id: recall_id.to_string(),
                            model_id: "".to_string(),
                            file_patterns: vec![],
                        }),
                    }),
                    RecallMonitorLevel::Info,
                    "正在导入文件",
                    &format!("处理进度: {}/{}", idx + 1, total_paths),
                    "Indexer",
                );
            }

            if !crate::utils::mime::is_text_file(path) {
                return None;
            }

            let content = std::fs::read_to_string(path).ok()?;
            let filename = path.file_name()?.to_str()?;
            let mut key = filename.split('.').next()?.to_string();

            if config.auto_extract_title {
                if let Some(title) = extract_title_from_content(&content) {
                    key = title;
                }
            }

            let tags = if config.auto_extract_tags {
                extract_tags_from_content(&content)
                    .into_iter()
                    .map(|name| {
                        let hash = calculate_content_hash(&name);
                        crate::recall::core::TagWithWeight {
                            name,
                            weight: 1.0,
                            hash,
                        }
                    })
                    .collect()
            } else {
                vec![]
            };

            let now = get_now();
            let content_hash = calculate_content_hash(&content);

            Some(RecallEntry {
                id: Uuid::new_v4(),
                key,
                content: content.clone(),
                content_hash: Some(content_hash),
                tags,
                core_tags: vec![],
                assets: vec![],
                priority: 100,
                enabled: true,
                created_at: now,
                updated_at: now,
                summary: generate_summary(&content),
                error_message: None,
                refs: vec![],
                ref_by: vec![],
            })
        })
        .collect();

    let skipped_count = total_paths - candidates.len();

    let (entries, duplicate_count) =
        persist_batch_entries(&state, recall_id, candidates, deduplicate)?;

    let duration = start_time.elapsed().as_millis() as u64;
    let imported_count = entries.len();

    // 发送完成监控事件
    let _ = emit_monitor_event(
        &app,
        RecallMonitorEvent::Index(IndexPayload {
            steps: vec![
                RecallMonitorStep {
                    name: "文件扫描".to_string(),
                    status: RecallStepStatus::Completed,
                    duration: duration / 2, // 估算
                    details: Some(format!("扫描到 {} 个文件", total_paths)),
                },
                RecallMonitorStep {
                    name: "文本提取".to_string(),
                    status: RecallStepStatus::Completed,
                    duration: duration / 2, // 估算
                    details: Some(format!("成功提取 {} 个条目", imported_count)),
                },
            ],
            stats: IndexStats {
                total_files: total_paths as u32,
                processed_files: imported_count as u32,
                total_chunks: imported_count as u32,
                vectorized_chunks: 0,
                duration,
            },
            metadata: Some(IndexMetadata {
                recall_id: recall_id.to_string(),
                model_id: "".to_string(),
                file_patterns: vec![],
            }),
        }),
        RecallMonitorLevel::Success,
        "文件导入完成",
        &format!(
            "成功导入 {} 个条目，跳过 {} 个，重复 {} 个",
            imported_count, skipped_count, duplicate_count
        ),
        "Indexer",
    );

    Ok(BatchImportResult {
        entries,
        skipped_count,
        duplicate_count,
    })
}

#[tauri::command]
pub async fn recall_batch_upsert_entries(
    _app: AppHandle,
    state: State<'_, RecallState>,
    recall_id: Uuid,
    mut entries: Vec<RecallEntry>,
    deduplicate: bool,
    config: Option<ImportConfig>,
) -> Result<BatchImportResult, String> {
    entries.par_iter_mut().for_each(|entry| {
        if let Some(cfg) = &config {
            if cfg.auto_extract_title {
                if let Some(title) = extract_title_from_content(&entry.content) {
                    entry.key = title;
                }
            }
            if cfg.auto_extract_tags && entry.tags.is_empty() {
                entry.tags = extract_tags_from_content(&entry.content)
                    .into_iter()
                    .map(|name| {
                        let hash = calculate_content_hash(&name);
                        crate::recall::core::TagWithWeight {
                            name,
                            weight: 1.0,
                            hash,
                        }
                    })
                    .collect();
            }
        }
    });

    let (filtered_entries, duplicate_count) =
        persist_batch_entries(&state, recall_id, entries, deduplicate)?;

    Ok(BatchImportResult {
        entries: filtered_entries,
        skipped_count: 0,
        duplicate_count,
    })
}

#[tauri::command]
pub async fn recall_batch_patch_entries(
    _app: AppHandle,
    state: State<'_, RecallState>,
    recall_id: Uuid,
    entry_ids: Vec<Uuid>,
    patch: crate::recall::core::RecallEntryPatch,
) -> Result<usize, String> {
    let now = crate::recall::utils::get_now();

    let repository = state.repository()?;
    let entries_to_update = entry_ids
        .iter()
        .filter_map(|id| repository.load_entry(recall_id, *id).transpose())
        .collect::<Result<Vec<_>, _>>()?;

    if entries_to_update.is_empty() {
        return Ok(0);
    }

    // 2. 应用 patch
    let updated_entries: Vec<RecallEntry> = entries_to_update
        .into_iter()
        .map(|mut entry| {
            if let Some(enabled) = patch.enabled {
                entry.enabled = enabled;
            }
            if let Some(priority) = patch.priority {
                entry.priority = priority;
            }
            if let Some(ref key) = patch.key {
                entry.key = key.clone();
            }
            if let Some(ref tags) = patch.tags {
                entry.tags = tags.clone();
            }
            entry.updated_at = now;
            entry
        })
        .collect();

    repository.upsert_entries(recall_id, &updated_entries)?;
    let updated_count = updated_entries.len();
    if let Some(base_lock) = state
        .imdb
        .read()
        .map_err(|_| "获取内存数据库读锁失败")?
        .bases
        .get(&recall_id)
    {
        let mut base = base_lock.write().map_err(|_| "获取思绪集写锁失败")?;
        for entry in updated_entries {
            base.sync_entry(entry);
        }
    }

    log::info!(
        "[KB_ENTRY] 批量 patch 完成: recall={}, 更新 {} 个条目",
        recall_id,
        updated_count
    );

    Ok(updated_count)
}

#[tauri::command]
pub async fn recall_batch_delete_entries(
    state: State<'_, RecallState>,
    recall_id: Uuid,
    entry_ids: Vec<Uuid>,
) -> Result<(), String> {
    state.repository()?.delete_entries(recall_id, &entry_ids)?;

    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&recall_id) {
        let mut base = base_lock.write().map_err(|_| "获取思绪集写锁失败")?;
        for entry_id in &entry_ids {
            base.remove_entry(entry_id);
        }
    }
    Ok(())
}

fn persist_batch_entries(
    state: &RecallState,
    recall_id: Uuid,
    mut entries: Vec<RecallEntry>,
    deduplicate: bool,
) -> Result<(Vec<RecallEntry>, usize), String> {
    let repository = state.repository()?;
    let mut seen_hashes = if deduplicate {
        repository
            .load_entries(recall_id)?
            .into_iter()
            .filter_map(|entry| entry.content_hash)
            .collect::<std::collections::HashSet<_>>()
    } else {
        std::collections::HashSet::new()
    };
    for entry in &mut entries {
        if entry.content_hash.as_deref().is_none_or(str::is_empty) {
            entry.content_hash = Some(calculate_content_hash(&entry.content));
        }
        if entry.summary.is_empty() {
            entry.summary = generate_summary(&entry.content);
        }
    }
    let mut duplicates = 0;
    entries.retain(|entry| match &entry.content_hash {
        Some(hash) if deduplicate && !seen_hashes.insert(hash.clone()) => {
            duplicates += 1;
            false
        }
        Some(hash) => {
            seen_hashes.insert(hash.clone());
            true
        }
        None => true,
    });
    repository.upsert_entries(recall_id, &entries)?;
    if let Some(base_lock) = state
        .imdb
        .read()
        .map_err(|_| "获取内存数据库读锁失败")?
        .bases
        .get(&recall_id)
    {
        let mut base = base_lock.write().map_err(|_| "获取思绪集写锁失败")?;
        for entry in &entries {
            base.sync_entry(entry.clone());
        }
    }
    Ok((entries, duplicates))
}
