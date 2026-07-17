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

use crate::recall::monitor::{
    emit_monitor_event, IndexMetadata, IndexPayload, IndexStats, RecallMonitorEvent,
    RecallMonitorLevel, RecallMonitorStep, RecallStepStatus,
};
use crate::recall::state::RecallState;
use crate::recall::utils::*;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadStats {
    pub loaded_count: usize,
    pub dimension: usize,
    pub model_id: String,
}

#[tauri::command]
pub async fn recall_update_entry_vector(
    app: AppHandle,
    state: State<'_, RecallState>,
    recall_id: Uuid,
    entry_id: Uuid,
    vector: Vec<f32>,
    model: String,
    tokens: Option<u32>,
) -> Result<(), String> {
    let start_time = std::time::Instant::now();
    let _guard = state
        .lock
        .lock()
        .map_err(|_| "获取状态锁失败".to_string())?;
    let repository = state.repository()?;
    let content_hash = repository
        .load_entry(recall_id, entry_id)?
        .and_then(|entry| entry.content_hash);
    repository.upsert_entry_vector(
        recall_id,
        entry_id,
        &model,
        &vector,
        tokens,
        content_hash.as_deref(),
        get_now(),
    )?;

    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&recall_id) {
        let mut base = base_lock.write().map_err(|_| "获取思绪集写锁失败")?;

        // 1. 更新向量矩阵
        if base.vector_store.model_id.is_empty() || base.vector_store.model_id == model {
            if base.vector_store.model_id.is_empty() {
                base.vector_store.model_id = model.clone();
                base.vector_store.dimension = vector.len();
            }
            base.vector_store.update_vector(entry_id, vector);
        }

        // 2. 更新索引中的向量化状态 (仅索引处理状态)
        if !base.meta.models.contains(&model) {
            base.meta.models.push(model.clone());
        }

        if let Some(pos) = base.meta.entries.iter().position(|e| e.id == entry_id) {
            let entry = &mut base.meta.entries[pos];
            entry.vector_status = "ready".to_string();
            if !entry.vectorized_models.contains(&model) {
                entry.vectorized_models.push(model.clone());
            }
            if let Some(t) = tokens {
                entry.total_tokens = t;
            }
        }

        // 3. 累加 token 消耗
        if let Some(t) = tokens {
            base.meta.vectorization.total_tokens += t as u64;
        }
    }

    let duration = start_time.elapsed().as_millis() as u64;

    // 推送向量化完成监控事件
    let _ = emit_monitor_event(
        &app,
        RecallMonitorEvent::Index(IndexPayload {
            steps: vec![RecallMonitorStep {
                name: "向量写入".to_string(),
                status: RecallStepStatus::Completed,
                duration,
                details: Some(format!("条目 {} 向量化完成 (模型: {})", entry_id, model)),
            }],
            stats: IndexStats {
                total_files: 1,
                processed_files: 1,
                total_chunks: 1,
                vectorized_chunks: 1,
                duration,
            },
            metadata: Some(IndexMetadata {
                recall_id: recall_id.to_string(),
                model_id: model.clone(),
                file_patterns: vec![],
            }),
        }),
        RecallMonitorLevel::Debug, // 单个更新使用 Debug 级别，避免干扰
        "向量更新完成",
        &format!("条目 {} 向量化完成", entry_id),
        "Indexer",
    );

    Ok(())
}

#[tauri::command]
pub async fn recall_clear_legacy_vectors(
    _app: AppHandle,
    state: State<'_, RecallState>,
    recall_id: Uuid,
    current_model: String,
) -> Result<u32, String> {
    state
        .repository()?
        .clear_vectors_except_model(Some(recall_id), &current_model)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VectorCoverage {
    pub total_entries: usize,
    pub cached_entries: usize,
    pub missing_entries: usize,
    pub missing_map: Vec<(Uuid, Uuid)>,
    pub estimated_tokens: u64,
}

#[tauri::command]
pub async fn recall_check_vector_coverage(
    state: State<'_, RecallState>,
    recall_ids: Vec<Uuid>,
    model_id: String,
) -> Result<VectorCoverage, String> {
    let repository = state.repository()?;

    let mut total_entries = 0;
    let mut cached_entries = 0;
    let mut missing_map = Vec::new();

    log::info!(
        "[KB_COVERAGE] 检查向量覆盖率: model={}, recall_count={}",
        model_id,
        recall_ids.len()
    );

    for recall_id in recall_ids {
        let entries = repository.load_entries(recall_id)?;
        let vector_ids = repository
            .load_vectors(recall_id, &model_id)?
            .map(|(vectors, _, _)| {
                vectors
                    .into_iter()
                    .map(|(id, _)| id)
                    .collect::<std::collections::HashSet<_>>()
            })
            .unwrap_or_default();
        for entry in entries {
            total_entries += 1;
            if vector_ids.contains(&entry.id) {
                cached_entries += 1;
            } else {
                missing_map.push((recall_id, entry.id));
            }
        }
    }

    Ok(VectorCoverage {
        total_entries,
        cached_entries,
        missing_entries: missing_map.len(),
        missing_map,
        estimated_tokens: 0,
    })
}

#[tauri::command]
pub async fn recall_load_model_vectors(
    state: State<'_, RecallState>,
    recall_id: Uuid,
    model_id: String,
) -> Result<LoadStats, String> {
    let repository = state.repository()?;
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;

    if let Some(base_lock) = imdb.bases.get(&recall_id) {
        {
            let base = base_lock.read().map_err(|_| "获取思绪集读锁失败")?;
            if base.vector_store.model_id == model_id && !base.vector_store.ids.is_empty() {
                return Ok(LoadStats {
                    loaded_count: base.vector_store.ids.len(),
                    dimension: base.vector_store.dimension,
                    model_id,
                });
            }
        }

        let mut base = base_lock.write().map_err(|_| "获取思绪集写锁失败")?;
        let recall_name = base.meta.name.clone();
        match repository.load_vectors(recall_id, &model_id) {
            Ok(Some((vectors, dimension, total_tokens))) => {
                log::info!(
                    "[KB_LOAD] 成功加载向量数据: {} (ID: {}), 模型: {}, 数量: {}, 维度: {}, Tokens: {}",
                    recall_name,
                    recall_id,
                    model_id,
                    vectors.len(),
                    dimension,
                    total_tokens
                );
                base.vector_store
                    .rebuild(model_id.clone(), dimension, total_tokens, vectors);
                // 刷新内存索引中的向量状态，确保前端显示一致
                if base.refresh_vector_status() {
                    log::info!(
                        "[RECALL_LOAD] 向量状态已刷新: {} (ID: {}), 模型: {}",
                        recall_name,
                        recall_id,
                        model_id
                    );
                }
            }
            Ok(None) => {
                log::warn!(
                    "[KB_LOAD] 思绪集下未发现该模型的向量文件: {} (ID: {}), 模型: {}",
                    recall_name,
                    recall_id,
                    model_id
                );
            }
            Err(e) => {
                log::error!(
                    "[KB_LOAD] 加载向量文件出错: {} (ID: {}), 模型: {}, 错误: {}",
                    recall_name,
                    recall_id,
                    model_id,
                    e
                );
                return Err(e);
            }
        }

        base.meta.vectorization.model_used = model_id.clone();

        Ok(LoadStats {
            loaded_count: base.vector_store.ids.len(),
            dimension: base.vector_store.dimension,
            model_id,
        })
    } else {
        Err(format!("找不到思绪集: {}", recall_id))
    }
}

#[tauri::command]
pub async fn recall_clear_all_other_vectors(
    _app: AppHandle,
    state: State<'_, RecallState>,
    keep_model_id: String,
) -> Result<u32, String> {
    let total_deleted = state
        .repository()?
        .clear_vectors_except_model(None, &keep_model_id)?;

    log::info!(
        "[KB] 全局清理完成，删除了 {} 个非当前模型的向量文件",
        total_deleted
    );
    Ok(total_deleted)
}

#[tauri::command]
pub async fn recall_get_embedding_cache(
    state: State<'_, RecallState>,
    model_id: String,
    text: String,
) -> Result<Option<Vec<f32>>, String> {
    let mut hasher = Sha256::new();
    hasher.update(model_id.as_bytes());
    hasher.update(b"|"); // 增加分隔符防止碰撞
    hasher.update(text.as_bytes());
    let key = format!("{:x}", hasher.finalize());

    // 尝试获取读锁
    {
        let cache = state
            .embedding_cache
            .read()
            .map_err(|_| "获取缓存读锁失败".to_string())?;
        if let Some((vector, _)) = cache.get(&key) {
            return Ok(Some(vector.clone()));
        }
    }

    Ok(None)
}

#[tauri::command]
pub async fn recall_set_embedding_cache(
    state: State<'_, RecallState>,
    model_id: String,
    text: String,
    vector: Vec<f32>,
    max_items: usize,
) -> Result<(), String> {
    let mut hasher = Sha256::new();
    hasher.update(model_id.as_bytes());
    hasher.update(b"|"); // 增加分隔符防止碰撞
    hasher.update(text.as_bytes());
    let key = format!("{:x}", hasher.finalize());

    let mut cache = state
        .embedding_cache
        .write()
        .map_err(|_| "获取缓存写锁失败".to_string())?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // 容量限制：超过设定上限则删除最旧的 20%
    if cache.len() >= max_items {
        let mut items: Vec<(String, u64)> =
            cache.iter().map(|(k, (_, ts))| (k.clone(), *ts)).collect();
        // 按时间戳升序排序（最旧的在前）
        items.sort_by_key(|(_, ts)| *ts);

        // 计算删除数量 (至少删除 1 个，最多删除 20%)
        let delete_count = (max_items / 5).max(1);
        for (k, _) in items.iter().take(delete_count) {
            cache.remove(k);
        }
    }

    cache.insert(key, (vector, now));
    Ok(())
}

#[tauri::command]
pub async fn recall_clear_embedding_cache(state: State<'_, RecallState>) -> Result<(), String> {
    let mut cache = state
        .embedding_cache
        .write()
        .map_err(|_| "获取缓存写锁失败".to_string())?;
    cache.clear();
    Ok(())
}
