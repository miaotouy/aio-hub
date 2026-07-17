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
use crate::recall::io::*;
use crate::recall::ops::*;
use crate::recall::state::RecallState;
use crate::recall::utils::*;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

fn remove_dir_if_exists(path: &Path, description: &str) -> Result<(), String> {
    match std::fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("删除{}失败: {}", description, error)),
    }
}

fn delete_base_directories(app_data_dir: &Path, recall_id: &str) -> Result<(), String> {
    // Delete vectors first so a base directory is never removed while its
    // vector cleanup has already failed.
    remove_dir_if_exists(
        &get_recall_vectors_root(app_data_dir, recall_id),
        "思绪集向量目录",
    )?;
    remove_dir_if_exists(&get_recall_dir(app_data_dir, recall_id), "思绪集目录")
}

#[tauri::command]
pub async fn recall_initialize(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    init_workspace(&app_data_dir)?;
    Ok(())
}

#[tauri::command]
pub async fn recall_warmup(app: AppHandle, state: State<'_, RecallState>) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let bases_dir = get_bases_dir(&app_data_dir);

    if !bases_dir.exists() {
        return Ok(());
    }

    let mut imdb = state.imdb.write().map_err(|_| "获取内存数据库写锁失败")?;

    // 使用 ignore 库并行扫描思绪集目录
    use ignore::WalkBuilder;
    use rayon::prelude::*;

    let mut recall_paths = Vec::new();
    for result in WalkBuilder::new(bases_dir)
        .max_depth(Some(1))
        .build()
        .flatten()
    {
        if result.path().is_dir() {
            if let Some(recall_id_str) = result.file_name().to_str() {
                if let Ok(recall_id) = Uuid::parse_str(recall_id_str) {
                    recall_paths.push((recall_id, result.path().to_path_buf()));
                }
            }
        }
    }

    // 1. 第一阶段：快速并行加载所有思绪集元数据 (meta.json)
    let loaded_bases: Vec<(
        Uuid,
        PathBuf,
        Arc<RwLock<crate::recall::index::InMemoryBase>>,
    )> = recall_paths
        .into_par_iter()
        .filter_map(|(recall_id, path)| {
            load_knowledge_base_meta_only(&app_data_dir, &path, recall_id)
                .ok()
                .flatten()
                .map(|base| (recall_id, path, Arc::new(RwLock::new(base))))
        })
        .collect();

    let mut base_locks = Vec::new();
    for (recall_id, path, base_lock) in loaded_bases {
        imdb.bases.insert(recall_id, base_lock.clone());
        base_locks.push((base_lock, path));
    }

    // 2. 第二阶段：异步全量加载条目内容和向量
    let app_data_dir_for_warmup = app_data_dir.clone();
    let imdb_arc = Arc::clone(&state.imdb);
    let tag_pool_manager_global = state.tag_pool.clone();

    tauri::async_runtime::spawn(async move {
        use rayon::prelude::*;
        log::info!(
            "[KB_WARMUP] 开始异步全量加载 {} 个思绪集...",
            base_locks.len()
        );

        base_locks.into_par_iter().for_each(|(base_lock, path)| {
            if let Err(e) = warmup_knowledge_base(&app_data_dir_for_warmup, &base_lock, &path) {
                let name = base_lock
                    .read()
                    .map(|b| b.meta.name.clone())
                    .unwrap_or_else(|_| "Unknown".to_string());
                log::error!("[KB_WARMUP] 全量加载思绪集失败 [{}]: {}", name, e);
            }
        });

        // 统计最终状态
        let imdb = imdb_arc.read().unwrap();
        let total_entries: usize = imdb
            .bases
            .values()
            .map(|lock| lock.read().unwrap().entries.len())
            .sum();
        let total_vectors: usize = imdb
            .bases
            .values()
            .map(|lock| lock.read().unwrap().vector_store.ids.len())
            .sum();

        log::info!(
            "[KB_WARMUP] 异步全量加载完成. 总计: {} 个思绪集, {} 个条目, {} 个向量",
            imdb.bases.len(),
            total_entries,
            total_vectors
        );
    });

    // 预热标签池
    let tag_pool_root = get_tag_pool_root(&app_data_dir);
    if tag_pool_root.exists() {
        if let Ok(pool_entries) = std::fs::read_dir(&tag_pool_root) {
            for pool_entry in pool_entries.flatten() {
                if pool_entry.path().is_dir() {
                    let model_id = pool_entry.file_name().into_string().unwrap_or_default();
                    let app_data_dir_for_pool = app_data_dir.clone();
                    let tag_pool_manager = tag_pool_manager_global.clone();

                    tauri::async_runtime::spawn(async move {
                        log::info!("[KB_WARMUP] 正在后台预热标签池: {}", model_id);
                        if let Ok(pool_lock) =
                            tag_pool_manager.get_pool(&app_data_dir_for_pool, &model_id)
                        {
                            let mut pool = pool_lock.write().unwrap();
                            pool.rebuild_index();
                        }
                    });
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn recall_list_bases(
    state: State<'_, RecallState>,
) -> Result<Vec<RecallCollectionMeta>, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    let mut metas = Vec::new();
    for base_lock in imdb.bases.values() {
        let base = base_lock.read().map_err(|_| "获取思绪集读锁失败")?;
        metas.push(base.meta.clone());
    }
    metas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(metas)
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
        Ok(None)
    }
}

#[tauri::command]
pub async fn recall_save_base_meta(
    app: AppHandle,
    state: State<'_, RecallState>,
    recall_id: Uuid,
    meta: RecallCollectionMeta,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    save_recall_meta(&app_data_dir, &recall_id.to_string(), &meta)?;

    {
        let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
        if let Some(base_lock) = imdb.bases.get(&recall_id) {
            let mut base = base_lock.write().map_err(|_| "获取思绪集写锁失败")?;
            base.meta = meta;
            return Ok(());
        }
    }

    let mut imdb = state.imdb.write().map_err(|_| "获取内存数据库写锁失败")?;
    let base = crate::recall::index::InMemoryBase::new(meta);
    imdb.bases.insert(recall_id, Arc::new(RwLock::new(base)));

    Ok(())
}

#[tauri::command]
pub async fn recall_delete_base(
    app: AppHandle,
    state: State<'_, RecallState>,
    recall_id: Uuid,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let recall_id_string = recall_id.to_string();

    delete_base_directories(&app_data_dir, &recall_id_string)?;

    state
        .imdb
        .write()
        .map_err(|_| "获取内存数据库写锁失败")?
        .bases
        .remove(&recall_id);

    state
        .retrieval_cache
        .write()
        .map_err(|_| "获取检索缓存写锁失败")?
        .clear();

    Ok(())
}

#[tauri::command]
pub async fn recall_clone_base(
    app: AppHandle,
    state: State<'_, RecallState>,
    recall_id: Uuid,
    new_name: String,
) -> Result<Uuid, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let recall_id_str = recall_id.to_string();
    let new_recall_id = Uuid::new_v4();
    let new_recall_id_str = new_recall_id.to_string();

    let old_recall_dir = get_recall_dir(&app_data_dir, &recall_id_str);
    let new_recall_dir = get_recall_dir(&app_data_dir, &new_recall_id_str);

    if !old_recall_dir.exists() {
        return Err(format!("源思绪集不存在: {}", recall_id));
    }

    if !new_recall_dir.exists() {
        std::fs::create_dir_all(&new_recall_dir).map_err(|e| e.to_string())?;
    }

    let options = fs_extra::dir::CopyOptions::new().content_only(true);
    fs_extra::dir::copy(&old_recall_dir, &new_recall_dir, &options)
        .map_err(|e| format!("拷贝思绪集目录失败: {}", e))?;

    let old_vec_dir = get_recall_vectors_root(&app_data_dir, &recall_id_str);
    let new_vec_dir = get_recall_vectors_root(&app_data_dir, &new_recall_id_str);
    if old_vec_dir.exists() {
        if !new_vec_dir.exists() {
            std::fs::create_dir_all(&new_vec_dir).map_err(|e| e.to_string())?;
        }
        fs_extra::dir::copy(&old_vec_dir, &new_vec_dir, &options)
            .map_err(|e| format!("拷贝向量目录失败: {}", e))?;
    }

    let mut meta = {
        let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
        let base_lock = imdb
            .bases
            .get(&recall_id)
            .ok_or_else(|| format!("找不到源思绪集: {}", recall_id))?;
        let base = base_lock.read().map_err(|_| "获取思绪集读锁失败")?;
        base.meta.clone()
    };

    let now = get_now();
    meta.id = new_recall_id;
    meta.name = new_name;
    meta.created_at = now;
    meta.updated_at = now;

    save_recall_meta(&app_data_dir, &new_recall_id_str, &meta)?;

    let mut imdb = state.imdb.write().map_err(|_| "获取内存数据库写锁失败")?;
    if let Some(new_base) =
        load_knowledge_base_meta_only(&app_data_dir, &new_recall_dir, new_recall_id)?
    {
        let base_lock = Arc::new(RwLock::new(new_base));
        imdb.bases.insert(new_recall_id, base_lock.clone());

        let app_data_dir_clone = app_data_dir.clone();
        tauri::async_runtime::spawn(async move {
            let _ = warmup_knowledge_base(&app_data_dir_clone, &base_lock, &new_recall_dir);
        });
    }

    Ok(new_recall_id)
}

#[tauri::command]
pub async fn recall_export_base(
    state: State<'_, RecallState>,
    recall_id: Uuid,
) -> Result<RecallCollection, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    let base_lock = imdb
        .bases
        .get(&recall_id)
        .ok_or_else(|| format!("找不到思绪集: {}", recall_id))?;
    let base = base_lock.read().map_err(|_| "获取思绪集读锁失败")?;

    Ok(RecallCollection {
        meta: base.meta.clone(),
        entries: base.entries.values().cloned().collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::delete_base_directories;
    use crate::recall::io::{get_recall_dir, get_recall_vectors_root};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn delete_base_directories_removes_base_and_vectors() {
        let app_data_dir = tempdir().unwrap();
        let recall_id = "60f7ad7e-9a59-4b25-bad0-e87a74dcf622";
        let base_dir = get_recall_dir(app_data_dir.path(), recall_id);
        let vector_dir = get_recall_vectors_root(app_data_dir.path(), recall_id);

        fs::create_dir_all(base_dir.join("entries")).unwrap();
        fs::create_dir_all(vector_dir.join("model")).unwrap();
        fs::write(base_dir.join("meta.json"), "{}").unwrap();
        fs::write(vector_dir.join("model").join("entry.vec"), b"vector").unwrap();

        delete_base_directories(app_data_dir.path(), recall_id).unwrap();

        assert!(!base_dir.exists());
        assert!(!vector_dir.exists());
    }

    #[test]
    fn delete_base_directories_is_idempotent() {
        let app_data_dir = tempdir().unwrap();

        delete_base_directories(app_data_dir.path(), "60f7ad7e-9a59-4b25-bad0-e87a74dcf622")
            .unwrap();
    }
}
