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

use crate::recall::state::RecallState;
use tauri::{AppHandle, State};

fn repository_pool(
    state: &RecallState,
    model_id: &str,
) -> Result<std::sync::Arc<std::sync::RwLock<crate::recall::tag_pool::ModelTagPool>>, String> {
    let pool = state.repository()?.load_tag_pool(model_id)?;
    state.tag_pool.get_or_insert_pool(pool)
}

#[allow(unused_imports)]
pub use crate::recall::statistics::{BaseVectorStats, LibraryStats};

#[tauri::command]
pub async fn recall_get_library_stats(
    state: State<'_, RecallState>,
    model_id: String,
) -> Result<LibraryStats, String> {
    crate::recall::statistics::library_stats(state.repository()?.as_ref(), &model_id)
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
    _app: AppHandle,
    state: State<'_, RecallState>,
    model_id: String,
) -> Result<TagPoolStats, String> {
    let pool_lock = repository_pool(&state, &model_id)?;
    let pool = pool_lock.read().map_err(|_| "获取池读锁失败")?;

    let tag_pool_size = (pool.vectors.len() * std::mem::size_of::<f32>()) as u64;

    Ok(TagPoolStats {
        total_tags: pool.registry.len(),
        vectorized_tags: pool.registry.len(), // 标签池中的每个注册项都对应一个已向量化的标签
        tag_pool_size,
        tag_pool_dimension: pool.dimension,
    })
}

#[tauri::command]
pub async fn recall_get_missing_tags(
    _app: AppHandle,
    state: State<'_, RecallState>,
    model_id: String,
    tags: Vec<String>,
) -> Result<Vec<String>, String> {
    let pool_lock = repository_pool(&state, &model_id)?;
    let pool = pool_lock.read().map_err(|_| "获取池读锁失败")?;
    Ok(pool.get_missing_tags(tags))
}

#[tauri::command]
pub async fn recall_sync_tag_vectors(
    _app: AppHandle,
    state: State<'_, RecallState>,
    model_id: String,
    data: Vec<(String, Vec<f32>)>,
) -> Result<(), String> {
    let pool_lock = repository_pool(&state, &model_id)?;

    let mut pool = pool_lock.write().map_err(|_| "获取池写锁失败")?;
    pool.sync_vectors(data);
    state.repository()?.save_tag_pool(&pool)?;
    state.clear_retrieval_cache()?;

    Ok(())
}

#[tauri::command]
pub async fn recall_list_all_tags(
    _app: AppHandle,
    state: State<'_, RecallState>,
    model_id: String,
) -> Result<Vec<String>, String> {
    let pool_lock = repository_pool(&state, &model_id)?;
    let pool = pool_lock.read().map_err(|_| "获取池读锁失败")?;
    let mut tags: Vec<String> = pool.registry.keys().cloned().collect();
    tags.sort();
    Ok(tags)
}

#[tauri::command]
pub async fn recall_rebuild_tag_pool_index(
    _app: AppHandle,
    state: State<'_, RecallState>,
    model_id: String,
) -> Result<(), String> {
    let pool_lock = repository_pool(&state, &model_id)?;

    let mut pool = pool_lock.write().map_err(|_| "获取池写锁失败")?;
    if pool.index.is_none() && !pool.registry.is_empty() {
        log::info!(
            "[KB] 重建标签池索引: {} (共 {} 个标签)",
            model_id,
            pool.registry.len()
        );
        pool.rebuild_index();
        state.repository()?.save_tag_pool(&pool)?;
        state.clear_retrieval_cache()?;
    }

    Ok(())
}

#[tauri::command]
pub async fn recall_clear_tag_pool(
    _app: AppHandle,
    state: State<'_, RecallState>,
    model_id: String,
) -> Result<(), String> {
    {
        let mut pools = state.tag_pool.pools.write().map_err(|_| "获取池写锁失败")?;
        pools.remove(&model_id);
    }
    state
        .repository()?
        .save_tag_pool(&crate::recall::tag_pool::ModelTagPool::new(model_id))?;
    state.clear_retrieval_cache()?;

    Ok(())
}

#[tauri::command]
pub async fn recall_list_tag_pool_models(
    _app: AppHandle,
    state: State<'_, RecallState>,
) -> Result<Vec<String>, String> {
    let mut model_ids = state
        .tag_pool
        .pools
        .read()
        .map_err(|_| "获取池读锁失败")?
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    model_ids.sort();
    Ok(model_ids)
}

#[tauri::command]
pub async fn recall_clear_other_tag_pools(
    _app: AppHandle,
    state: State<'_, RecallState>,
    keep_model_id: String,
) -> Result<u32, String> {
    let mut pools = state.tag_pool.pools.write().map_err(|_| "获取池写锁失败")?;
    let removed = pools
        .keys()
        .filter(|model_id| *model_id != &keep_model_id)
        .cloned()
        .collect::<Vec<_>>();
    for model_id in &removed {
        pools.remove(model_id);
    }
    drop(pools);
    for model_id in &removed {
        state
            .repository()?
            .save_tag_pool(&crate::recall::tag_pool::ModelTagPool::new(
                model_id.clone(),
            ))?;
    }
    if !removed.is_empty() {
        state.clear_retrieval_cache()?;
    }
    Ok(removed.len() as u32)
}

#[tauri::command]
pub async fn recall_flush_all_tag_pools(
    _app: AppHandle,
    state: State<'_, RecallState>,
) -> Result<u32, String> {
    let pools = state.tag_pool.pools.read().map_err(|_| "获取池读锁失败")?;

    let mut saved_count = 0;
    let mut rebuilt = false;
    for (model_id, pool_lock) in pools.iter() {
        let mut pool = pool_lock.write().map_err(|_| "获取池写锁失败")?;
        if pool.index.is_none() && !pool.registry.is_empty() {
            pool.rebuild_index();
            rebuilt = true;
        }
        if let Err(e) = state.repository()?.save_tag_pool(&pool) {
            log::error!("[KB] 保存标签池失败 {}: {}", model_id, e);
        } else {
            saved_count += 1;
        }
    }

    drop(pools);
    if rebuilt {
        state.clear_retrieval_cache()?;
    }

    Ok(saved_count)
}
