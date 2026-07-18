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

use crate::recall::core::{RecallCollection, RecallCollectionMeta};
use crate::recall::ops::*;
use crate::recall::state::RecallState;
use crate::recall::utils::*;
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, State};
use uuid::Uuid;

#[tauri::command]
pub async fn recall_initialize(
    app: AppHandle,
    state: State<'_, RecallState>,
) -> Result<(), String> {
    let app_data_dir = crate::get_app_data_dir(app.config());
    state.initialize(&app_data_dir)
}

#[tauri::command]
pub async fn recall_warmup(_app: AppHandle, state: State<'_, RecallState>) -> Result<(), String> {
    let repository = state.repository()?;
    warmup_recall_repository(repository.as_ref(), &state.imdb, &state.tag_pool)?;
    state.clear_retrieval_cache()
}

#[tauri::command]
pub async fn recall_list_bases(
    state: State<'_, RecallState>,
) -> Result<Vec<RecallCollectionMeta>, String> {
    state.repository()?.list_collections()
}

#[tauri::command]
pub async fn recall_load_base_meta(
    state: State<'_, RecallState>,
    recall_id: Uuid,
    model_id: Option<String>,
) -> Result<Option<RecallCollectionMeta>, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&recall_id) {
        let base = base_lock.read().map_err(|_| "获取思绪集读锁失败")?;
        let mut meta = base.get_meta_with_entries();

        // 如果提供了 model_id，根据 vectorized_models 列表动态修正 vector_status
        // 这能解决冷启动时 meta.json 中 vector_status 可能滞后的问题
        if let Some(mid) = &model_id {
            let mut ready_count = 0;
            for entry in &mut meta.entries {
                if entry.vectorized_models.contains(mid) {
                    entry.vector_status = "ready".to_string();
                    ready_count += 1;
                } else if entry.vector_status == "ready" {
                    // 如果索引说 ready 但模型列表里没有该模型，说明是其他模型的 ready，对当前模型应显示 none
                    entry.vector_status = "none".to_string();
                }
            }
            log::info!(
                "[KB_META] 已根据模型 {} 修正条目状态: {} 项就绪",
                mid,
                ready_count
            );
        } else {
            log::debug!("[KB_META] 未提供 model_id，返回原始索引状态");
        }

        Ok(Some(meta))
    } else {
        state
            .repository()?
            .load_collection(recall_id)
            .map(|item| item.map(|collection| collection.meta))
    }
}

#[tauri::command]
pub async fn recall_save_base_meta(
    state: State<'_, RecallState>,
    recall_id: Uuid,
    meta: RecallCollectionMeta,
) -> Result<(), String> {
    let repository = state.repository()?;
    let entries = repository
        .load_collection(recall_id)?
        .map(|collection| collection.entries)
        .unwrap_or_default();
    repository.save_collection(&RecallCollection {
        meta: meta.clone(),
        entries,
    })?;

    let updated_existing = {
        let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
        if let Some(base_lock) = imdb.bases.get(&recall_id) {
            let mut base = base_lock.write().map_err(|_| "获取思绪集写锁失败")?;
            base.meta = meta.clone();
            true
        } else {
            false
        }
    };

    if !updated_existing {
        let mut imdb = state.imdb.write().map_err(|_| "获取内存数据库写锁失败")?;
        let base = crate::recall::index::InMemoryBase::new(meta);
        imdb.bases.insert(recall_id, Arc::new(RwLock::new(base)));
    }

    state.clear_retrieval_cache()
}

#[tauri::command]
pub async fn recall_delete_base(
    state: State<'_, RecallState>,
    recall_id: Uuid,
) -> Result<(), String> {
    state.repository()?.delete_collection(recall_id)?;

    state
        .imdb
        .write()
        .map_err(|_| "获取内存数据库写锁失败")?
        .bases
        .remove(&recall_id);

    state.clear_retrieval_cache()
}

#[tauri::command]
pub async fn recall_clone_base(
    state: State<'_, RecallState>,
    recall_id: Uuid,
    new_name: String,
) -> Result<Uuid, String> {
    let new_recall_id = Uuid::new_v4();
    let repository = state.repository()?;
    let mut collection = repository
        .load_collection(recall_id)?
        .ok_or_else(|| format!("找不到源思绪集: {recall_id}"))?;

    let now = get_now();
    collection.meta.id = new_recall_id;
    collection.meta.name = new_name;
    collection.meta.created_at = now;
    collection.meta.updated_at = now;
    for entry in &mut collection.entries {
        entry.created_at = now;
        entry.updated_at = now;
    }
    repository.save_collection(&collection)?;
    let mut base = crate::recall::index::InMemoryBase::new(collection.meta.clone());
    for entry in collection.entries {
        base.sync_entry(entry);
    }
    base.is_fully_loaded = true;
    state
        .imdb
        .write()
        .map_err(|_| "获取内存数据库写锁失败")?
        .bases
        .insert(new_recall_id, Arc::new(RwLock::new(base)));

    state.clear_retrieval_cache()?;
    Ok(new_recall_id)
}

#[tauri::command]
pub async fn recall_export_base(
    state: State<'_, RecallState>,
    recall_id: Uuid,
) -> Result<RecallCollection, String> {
    state
        .repository()?
        .load_collection(recall_id)?
        .ok_or_else(|| format!("找不到思绪集: {recall_id}"))
}
