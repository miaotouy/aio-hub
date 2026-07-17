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

use crate::recall::io::*;
use crate::recall::monitor::{
    emit_monitor_event, IndexMetadata, IndexPayload, IndexStats, RecallMonitorEvent,
    RecallMonitorLevel, RecallMonitorStep, RecallStepStatus,
};
use crate::recall::ops::*;
use crate::recall::state::RecallState;
use crate::recall::utils::*;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
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
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let recall_id_str = recall_id.to_string();
    let model_dir = get_recall_vector_model_dir(&app_data_dir, &recall_id_str, &model);

    if !model_dir.exists() {
        std::fs::create_dir_all(&model_dir).map_err(|e| e.to_string())?;
        let _ = update_recall_models_index(&app_data_dir, &recall_id_str, &model);
    }

    let vec_file_path =
        get_recall_vector_file_path(&app_data_dir, &recall_id_str, &model, &entry_id.to_string());
    let mut json_obj = serde_json::json!({
        "entry_id": entry_id,
        "vector": vector,
        "model": model,
        "timestamp": get_now()
    });
    if let Some(t) = tokens {
        json_obj["tokens"] = t.into();
    }

    std::fs::write(vec_file_path, json_obj.to_string()).map_err(|e| e.to_string())?;

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

        // 4. 持久化元数据，确保冷启动索引同步
        log::debug!(
            "[KB_VECTOR] 单个向量更新完成，同步元数据索引: recall={}, entry={}, model={}",
            recall_id_str,
            entry_id,
            model
        );
        let _ = save_recall_meta(&app_data_dir, &recall_id_str, &base.meta);
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
    app: AppHandle,
    _state: State<'_, RecallState>,
    recall_id: Uuid,
    current_model: String,
) -> Result<u32, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let recall_vec_root = get_recall_vectors_root(&app_data_dir, &recall_id.to_string());

    if !recall_vec_root.exists() {
        return Ok(0);
    }

    let mut deleted_count = 0;
    let safe_current_model = get_safe_model_id(&current_model);

    let index_path = get_recall_models_index_path(&app_data_dir, &recall_id.to_string());
    let mut models_index: std::collections::HashMap<String, String> = if index_path.exists() {
        std::fs::read_to_string(&index_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };

    let entries = std::fs::read_dir(recall_vec_root).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        if entry.path().is_dir() {
            let dirname = entry.file_name().into_string().unwrap_or_default();

            let should_delete = if let Some(original_id) = models_index.get(&dirname) {
                original_id != &current_model
            } else {
                dirname != safe_current_model
            };

            if should_delete {
                models_index.remove(&dirname);
                if let Ok(files) = std::fs::read_dir(entry.path()) {
                    deleted_count += files.count() as u32;
                }
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
    }

    if let Ok(json) = serde_json::to_string_pretty(&models_index) {
        let _ = std::fs::write(index_path, json);
    }

    Ok(deleted_count)
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
    app: AppHandle,
    state: State<'_, RecallState>,
    recall_ids: Vec<Uuid>,
    model_id: String,
) -> Result<VectorCoverage, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;

    let mut total_entries = 0;
    let mut cached_entries = 0;
    let mut missing_map = Vec::new();

    log::info!(
        "[KB_COVERAGE] 检查向量覆盖率: model={}, recall_count={}",
        model_id,
        recall_ids.len()
    );

    for recall_id in recall_ids {
        if let Some(base_lock) = imdb.bases.get(&recall_id) {
            let base = base_lock.read().map_err(|_| "获取思绪集读锁失败")?;
            log::info!(
                "[KB_COVERAGE] 正在检查思绪集: {} (ID: {})",
                base.meta.name,
                recall_id
            );
            let model_dir =
                get_recall_vector_model_dir(&app_data_dir, &recall_id.to_string(), &model_id);

            for entry_id in base.entries.keys() {
                total_entries += 1;
                let vec_file = model_dir.join(format!("{}.vec", entry_id));
                if vec_file.exists() {
                    cached_entries += 1;
                } else {
                    missing_map.push((recall_id, *entry_id));
                }
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
    app: AppHandle,
    state: State<'_, RecallState>,
    recall_id: Uuid,
    model_id: String,
) -> Result<LoadStats, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
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
        match load_vectors_to_vec(&app_data_dir, recall_id, &model_id) {
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
                    // 如果状态有变化，持久化到磁盘，避免下次启动时显示旧状态
                    log::info!(
                        "[KB_LOAD] 向量状态有变动，同步元数据索引: {} (ID: {}), 模型: {}",
                        recall_name,
                        recall_id,
                        model_id
                    );
                    let _ = save_recall_meta(&app_data_dir, &recall_id.to_string(), &base.meta);
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
    app: AppHandle,
    state: State<'_, RecallState>,
    keep_model_id: String,
) -> Result<u32, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;

    let mut total_deleted = 0;
    let safe_keep_model = get_safe_model_id(&keep_model_id);

    for (recall_id, _base_lock) in imdb.bases.iter() {
        let recall_id_str = recall_id.to_string();
        let recall_vec_root = get_recall_vectors_root(&app_data_dir, &recall_id_str);

        if !recall_vec_root.exists() {
            continue;
        }

        let index_path = get_recall_models_index_path(&app_data_dir, &recall_id_str);
        let mut models_index: std::collections::HashMap<String, String> = if index_path.exists() {
            std::fs::read_to_string(&index_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            std::collections::HashMap::new()
        };

        if let Ok(entries) = std::fs::read_dir(recall_vec_root) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let dirname = entry.file_name().into_string().unwrap_or_default();

                    let is_current = if let Some(original_id) = models_index.get(&dirname) {
                        original_id == &keep_model_id
                    } else {
                        dirname == safe_keep_model
                    };

                    if !is_current {
                        models_index.remove(&dirname);
                        if let Ok(files) = std::fs::read_dir(entry.path()) {
                            total_deleted += files.count() as u32;
                        }
                        let _ = std::fs::remove_dir_all(entry.path());
                    }
                }
            }
        }

        if let Ok(json) = serde_json::to_string_pretty(&models_index) {
            let _ = std::fs::write(index_path, json);
        }
    }

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
