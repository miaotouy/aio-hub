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
use crate::recall::state::RecallState;
use tauri::{AppHandle, Manager, State};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseVectorStats {
    pub total: usize,
    pub vectorized: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStats {
    pub total_bases: usize,
    pub total_entries: usize,
    pub vectorized_entries: usize,
    pub total_tokens: usize,
    pub all_discovered_tags: Vec<String>,
    pub tag_usage_stats: std::collections::HashMap<String, usize>,
    pub bases_stats: std::collections::HashMap<String, BaseVectorStats>,
}

#[tauri::command]
pub async fn recall_get_library_stats(
    state: State<'_, RecallState>,
    model_id: String,
) -> Result<LibraryStats, String> {
    log::info!("[KB_STATS] 获取库统计信息, model_id: {}", model_id);
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;

    let recall_count = imdb.bases.len();

    let mut total_entries = 0;
    let mut vectorized_entries = 0;
    let mut total_tokens = 0;
    let mut all_tags_set = std::collections::HashSet::new();
    let mut tag_usage_stats = std::collections::HashMap::new();
    let mut bases_stats = std::collections::HashMap::new();

    for (recall_id, base_lock) in imdb.bases.iter() {
        let base = base_lock.read().map_err(|_| "获取思绪集读锁失败")?;
        let recall_id_str = recall_id.to_string();

        let mut recall_total = 0;
        let mut recall_vectorized = 0;

        let is_model_match = base.vector_store.model_id == model_id;

        for entry in base.entries.values() {
            recall_total += 1;
            for tag in &entry.tags {
                all_tags_set.insert(tag.name.clone());
                *tag_usage_stats.entry(tag.name.clone()).or_insert(0) += 1;
            }

            if is_model_match && base.vector_store.ids.contains(&entry.id) {
                vectorized_entries += 1;
                recall_vectorized += 1;
            }
        }

        total_entries += recall_total;
        total_tokens += base.vector_store.total_tokens;

        bases_stats.insert(
            recall_id_str,
            BaseVectorStats {
                total: recall_total,
                vectorized: recall_vectorized,
            },
        );
    }

    let mut all_discovered_tags: Vec<String> = all_tags_set.into_iter().collect();
    all_discovered_tags.sort();

    log::info!(
        "[KB_STATS] 统计完成: {} 个思绪集, {} 个条目, {} 个已向量化条目, {} 个标签, 总 tokens: {}",
        recall_count,
        total_entries,
        vectorized_entries,
        all_discovered_tags.len(),
        total_tokens
    );

    Ok(LibraryStats {
        total_bases: imdb.bases.len(),
        total_entries,
        vectorized_entries,
        total_tokens,
        all_discovered_tags,
        tag_usage_stats,
        bases_stats,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagPoolStats {
    pub total_tags: usize,
    pub vectorized_tags: usize,
    pub tag_pool_size: u64,
    pub tag_pool_dimension: usize,
}

#[tauri::command]
pub async fn recall_get_tag_pool_stats(
    app: AppHandle,
    state: State<'_, RecallState>,
    model_id: String,
) -> Result<TagPoolStats, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let pool_lock = state.tag_pool.get_pool(&app_data_dir, &model_id)?;
    let pool = pool_lock.read().map_err(|_| "获取池读锁失败")?;

    let pool_dir = get_model_tag_pool_dir(&app_data_dir, &model_id);
    let vectors_path = pool_dir.join("vectors.bin");
    let tag_pool_size = if vectors_path.exists() {
        std::fs::metadata(vectors_path)
            .map(|m| m.len())
            .unwrap_or(0)
    } else {
        0
    };

    Ok(TagPoolStats {
        total_tags: pool.registry.len(),
        vectorized_tags: pool.registry.len(), // 标签池中的每个注册项都对应一个已向量化的标签
        tag_pool_size,
        tag_pool_dimension: pool.dimension,
    })
}

#[tauri::command]
pub async fn recall_get_missing_tags(
    app: AppHandle,
    state: State<'_, RecallState>,
    model_id: String,
    tags: Vec<String>,
) -> Result<Vec<String>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let pool_lock = state.tag_pool.get_pool(&app_data_dir, &model_id)?;
    let pool = pool_lock.read().map_err(|_| "获取池读锁失败")?;
    Ok(pool.get_missing_tags(tags))
}

#[tauri::command]
pub async fn recall_sync_tag_vectors(
    app: AppHandle,
    state: State<'_, RecallState>,
    model_id: String,
    data: Vec<(String, Vec<f32>)>,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let pool_lock = state.tag_pool.get_pool(&app_data_dir, &model_id)?;

    let mut pool = pool_lock.write().map_err(|_| "获取池写锁失败")?;
    pool.sync_vectors(data);
    pool.save(&app_data_dir)?;

    Ok(())
}

#[tauri::command]
pub async fn recall_list_all_tags(
    app: AppHandle,
    state: State<'_, RecallState>,
    model_id: String,
) -> Result<Vec<String>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let pool_lock = state.tag_pool.get_pool(&app_data_dir, &model_id)?;
    let pool = pool_lock.read().map_err(|_| "获取池读锁失败")?;
    let mut tags: Vec<String> = pool.registry.keys().cloned().collect();
    tags.sort();
    Ok(tags)
}

#[tauri::command]
pub async fn recall_rebuild_tag_pool_index(
    app: AppHandle,
    state: State<'_, RecallState>,
    model_id: String,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let pool_lock = state.tag_pool.get_pool(&app_data_dir, &model_id)?;

    let mut pool = pool_lock.write().map_err(|_| "获取池写锁失败")?;
    if pool.index.is_none() && !pool.registry.is_empty() {
        log::info!(
            "[KB] 重建标签池索引: {} (共 {} 个标签)",
            model_id,
            pool.registry.len()
        );
        pool.rebuild_index();
        pool.save(&app_data_dir)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn recall_clear_tag_pool(
    app: AppHandle,
    state: State<'_, RecallState>,
    model_id: String,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    {
        let mut pools = state.tag_pool.pools.write().map_err(|_| "获取池写锁失败")?;
        pools.remove(&model_id);
    }

    let pool_dir = get_model_tag_pool_dir(&app_data_dir, &model_id);
    if pool_dir.exists() {
        std::fs::remove_dir_all(&pool_dir).map_err(|e| format!("删除标签池目录失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn recall_list_tag_pool_models(app: AppHandle) -> Result<Vec<String>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let tag_pool_root = get_tag_pool_root(&app_data_dir);

    let mut model_ids = Vec::new();

    if tag_pool_root.exists() {
        if let Ok(entries) = std::fs::read_dir(&tag_pool_root) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    if let Ok(model_id) = entry.file_name().into_string() {
                        model_ids.push(model_id);
                    }
                }
            }
        }
    }

    model_ids.sort();
    Ok(model_ids)
}

#[tauri::command]
pub async fn recall_clear_other_tag_pools(
    app: AppHandle,
    state: State<'_, RecallState>,
    keep_model_id: String,
) -> Result<u32, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let tag_pool_root = get_tag_pool_root(&app_data_dir);

    let mut cleared_count = 0;

    if tag_pool_root.exists() {
        if let Ok(entries) = std::fs::read_dir(&tag_pool_root) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    if let Ok(model_id) = entry.file_name().into_string() {
                        if model_id != keep_model_id {
                            {
                                let mut pools =
                                    state.tag_pool.pools.write().map_err(|_| "获取池写锁失败")?;
                                pools.remove(&model_id);
                            }

                            if let Err(e) = std::fs::remove_dir_all(entry.path()) {
                                log::error!("[KB] 删除标签池目录失败 {}: {}", model_id, e);
                            } else {
                                cleared_count += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(cleared_count)
}

#[tauri::command]
pub async fn recall_flush_all_tag_pools(
    app: AppHandle,
    state: State<'_, RecallState>,
) -> Result<u32, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let pools = state.tag_pool.pools.read().map_err(|_| "获取池读锁失败")?;

    let mut saved_count = 0;
    for (model_id, pool_lock) in pools.iter() {
        let mut pool = pool_lock.write().map_err(|_| "获取池写锁失败")?;
        if pool.index.is_none() && !pool.registry.is_empty() {
            pool.rebuild_index();
        }
        if let Err(e) = pool.save(&app_data_dir) {
            log::error!("[KB] 保存标签池失败 {}: {}", model_id, e);
        } else {
            saved_count += 1;
        }
    }

    Ok(saved_count)
}
