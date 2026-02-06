use crate::knowledge::core::{KnowledgeBase, KnowledgeBaseMeta};
use crate::knowledge::io::*;
use crate::knowledge::ops::*;
use crate::knowledge::state::KnowledgeState;
use crate::knowledge::utils::*;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[tauri::command]
pub async fn kb_initialize(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    init_workspace(&app_data_dir)?;
    Ok(())
}

#[tauri::command]
pub async fn kb_warmup(app: AppHandle, state: State<'_, KnowledgeState>) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let bases_dir = get_bases_dir(&app_data_dir);

    if !bases_dir.exists() {
        return Ok(());
    }

    let mut imdb = state.imdb.write().map_err(|_| "获取内存数据库写锁失败")?;

    // 使用 ignore 库并行扫描知识库目录
    use ignore::WalkBuilder;
    use rayon::prelude::*;

    let mut kb_paths = Vec::new();
    for result in WalkBuilder::new(bases_dir)
        .max_depth(Some(1))
        .build()
        .flatten()
    {
        if result.path().is_dir() {
            if let Some(kb_id_str) = result.file_name().to_str() {
                if let Ok(kb_id) = Uuid::parse_str(kb_id_str) {
                    kb_paths.push((kb_id, result.path().to_path_buf()));
                }
            }
        }
    }

    // 1. 第一阶段：快速并行加载所有知识库元数据 (meta.json)
    let loaded_bases: Vec<(
        Uuid,
        PathBuf,
        Arc<RwLock<crate::knowledge::index::InMemoryBase>>,
    )> = kb_paths
        .into_par_iter()
        .filter_map(|(kb_id, path)| {
            load_knowledge_base_meta_only(&app_data_dir, &path, kb_id)
                .ok()
                .flatten()
                .map(|base| (kb_id, path, Arc::new(RwLock::new(base))))
        })
        .collect();

    let mut base_locks = Vec::new();
    for (kb_id, path, base_lock) in loaded_bases {
        imdb.bases.insert(kb_id, base_lock.clone());
        base_locks.push((base_lock, path));
    }

    // 2. 第二阶段：异步全量加载条目内容和向量
    let app_data_dir_for_warmup = app_data_dir.clone();
    let imdb_arc = Arc::clone(&state.imdb);
    let tag_pool_manager_global = state.tag_pool.clone();

    tauri::async_runtime::spawn(async move {
        use rayon::prelude::*;
        log::info!(
            "[KB_WARMUP] 开始异步全量加载 {} 个知识库...",
            base_locks.len()
        );

        base_locks.into_par_iter().for_each(|(base_lock, path)| {
            if let Err(e) = warmup_knowledge_base(&app_data_dir_for_warmup, &base_lock, &path) {
                let name = base_lock
                    .read()
                    .map(|b| b.meta.name.clone())
                    .unwrap_or_else(|_| "Unknown".to_string());
                log::error!("[KB_WARMUP] 全量加载知识库失败 [{}]: {}", name, e);
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
            "[KB_WARMUP] 异步全量加载完成. 总计: {} 个知识库, {} 个条目, {} 个向量",
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
pub async fn kb_list_bases(
    state: State<'_, KnowledgeState>,
) -> Result<Vec<KnowledgeBaseMeta>, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    let mut metas = Vec::new();
    for base_lock in imdb.bases.values() {
        let base = base_lock.read().map_err(|_| "获取知识库读锁失败")?;
        metas.push(base.meta.clone());
    }
    metas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(metas)
}

#[tauri::command]
pub async fn kb_load_base_meta(
    state: State<'_, KnowledgeState>,
    kb_id: Uuid,
    model_id: Option<String>,
) -> Result<Option<KnowledgeBaseMeta>, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&kb_id) {
        let base = base_lock.read().map_err(|_| "获取知识库读锁失败")?;
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
pub async fn kb_save_base_meta(
    app: AppHandle,
    state: State<'_, KnowledgeState>,
    kb_id: Uuid,
    meta: KnowledgeBaseMeta,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    save_kb_meta(&app_data_dir, &kb_id.to_string(), &meta)?;

    {
        let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
        if let Some(base_lock) = imdb.bases.get(&kb_id) {
            let mut base = base_lock.write().map_err(|_| "获取知识库写锁失败")?;
            base.meta = meta;
            return Ok(());
        }
    }

    let mut imdb = state.imdb.write().map_err(|_| "获取内存数据库写锁失败")?;
    let base = crate::knowledge::index::InMemoryBase::new(meta);
    imdb.bases.insert(kb_id, Arc::new(RwLock::new(base)));

    Ok(())
}

#[tauri::command]
pub async fn kb_clone_base(
    app: AppHandle,
    state: State<'_, KnowledgeState>,
    kb_id: Uuid,
    new_name: String,
) -> Result<Uuid, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let kb_id_str = kb_id.to_string();
    let new_kb_id = Uuid::new_v4();
    let new_kb_id_str = new_kb_id.to_string();

    let old_kb_dir = get_kb_dir(&app_data_dir, &kb_id_str);
    let new_kb_dir = get_kb_dir(&app_data_dir, &new_kb_id_str);

    if !old_kb_dir.exists() {
        return Err(format!("源知识库不存在: {}", kb_id));
    }

    if !new_kb_dir.exists() {
        std::fs::create_dir_all(&new_kb_dir).map_err(|e| e.to_string())?;
    }

    let options = fs_extra::dir::CopyOptions::new().content_only(true);
    fs_extra::dir::copy(&old_kb_dir, &new_kb_dir, &options)
        .map_err(|e| format!("拷贝知识库目录失败: {}", e))?;

    let old_vec_dir = get_kb_vectors_root(&app_data_dir, &kb_id_str);
    let new_vec_dir = get_kb_vectors_root(&app_data_dir, &new_kb_id_str);
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
            .get(&kb_id)
            .ok_or_else(|| format!("找不到源知识库: {}", kb_id))?;
        let base = base_lock.read().map_err(|_| "获取知识库读锁失败")?;
        base.meta.clone()
    };

    let now = get_now();
    meta.id = new_kb_id;
    meta.name = new_name;
    meta.created_at = now;
    meta.updated_at = now;

    save_kb_meta(&app_data_dir, &new_kb_id_str, &meta)?;

    let mut imdb = state.imdb.write().map_err(|_| "获取内存数据库写锁失败")?;
    if let Some(new_base) = load_knowledge_base_meta_only(&app_data_dir, &new_kb_dir, new_kb_id)? {
        let base_lock = Arc::new(RwLock::new(new_base));
        imdb.bases.insert(new_kb_id, base_lock.clone());

        let app_data_dir_clone = app_data_dir.clone();
        tauri::async_runtime::spawn(async move {
            let _ = warmup_knowledge_base(&app_data_dir_clone, &base_lock, &new_kb_dir);
        });
    }

    Ok(new_kb_id)
}

#[tauri::command]
pub async fn kb_export_base(
    state: State<'_, KnowledgeState>,
    kb_id: Uuid,
) -> Result<KnowledgeBase, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    let base_lock = imdb
        .bases
        .get(&kb_id)
        .ok_or_else(|| format!("找不到知识库: {}", kb_id))?;
    let base = base_lock.read().map_err(|_| "获取知识库读锁失败")?;

    Ok(KnowledgeBase {
        meta: base.meta.clone(),
        entries: base.entries.values().cloned().collect(),
    })
}
