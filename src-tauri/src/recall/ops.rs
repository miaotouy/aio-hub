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

use crate::recall::core::{RecallCollectionMeta, RecallEntry};
use crate::recall::io::*;
use crate::recall::storage::RecallRepository;
use crate::recall::tag_pool::GlobalTagPoolManager;
use crate::recall::utils::*;
use rayon::prelude::*;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};
use uuid::Uuid;

#[allow(dead_code)]
type VectorizedModelsMap = std::collections::HashMap<Uuid, (Vec<String>, u32)>;

/// 从 Recall repository 恢复完整运行时读模型。
///
/// 该函数只消费数据库真源。旧文件系统仅可由迁移和恢复流程访问，不能作为
/// repository warmup 的隐式降级来源。
pub fn warmup_recall_repository(
    repository: &dyn RecallRepository,
    imdb: &Arc<RwLock<crate::recall::index::InMemoryDatabase>>,
    tag_pool_manager: &GlobalTagPoolManager,
) -> Result<(), String> {
    let collection_metas = repository.list_collections()?;
    let mut loaded_bases = HashMap::with_capacity(collection_metas.len());
    let mut model_ids = HashSet::new();

    for collection_meta in collection_metas {
        let collection_id = collection_meta.id;
        let Some(collection) = repository.load_collection(collection_id)? else {
            return Err(format!("Recall repository 中缺少集合 {collection_id}"));
        };

        let active_model = collection.meta.vectorization.model_used.clone();
        model_ids.extend(collection.meta.models.iter().cloned());
        if !active_model.is_empty() {
            model_ids.insert(active_model.clone());
        }

        let mut base = crate::recall::index::InMemoryBase::new(collection.meta);
        if !active_model.is_empty() {
            if let Some((vectors, dimension, total_tokens)) =
                repository.load_vectors(collection_id, &active_model)?
            {
                base.vector_store
                    .rebuild(active_model, dimension, total_tokens, vectors);
            }
        }
        for entry in collection.entries {
            base.sync_entry(entry);
        }
        base.is_fully_loaded = true;
        loaded_bases.insert(collection_id, Arc::new(RwLock::new(base)));
    }

    let mut loaded_pools = Vec::with_capacity(model_ids.len());
    for model_id in model_ids {
        let pool = repository.load_tag_pool(&model_id)?;
        if !pool.registry.is_empty() {
            loaded_pools.push(pool);
        }
    }

    tag_pool_manager.replace_pools(loaded_pools)?;
    let mut database = imdb.write().map_err(|_| "获取内存数据库写锁失败")?;
    database.bases = loaded_bases;
    Ok(())
}

/// 快速加载思绪集元数据（仅 meta.json，不加载条目内容）
#[allow(dead_code)]
pub fn load_knowledge_base_meta_only(
    _app_data_dir: &std::path::Path,
    recall_path: &std::path::Path,
    _recall_id: Uuid,
) -> Result<Option<crate::recall::index::InMemoryBase>, String> {
    let meta_path = recall_path.join("meta.json");
    if !meta_path.exists() {
        return Ok(None);
    }

    let meta_json = std::fs::read_to_string(meta_path).map_err(|e| e.to_string())?;
    let meta: RecallCollectionMeta = serde_json::from_str(&meta_json).map_err(|e| e.to_string())?;

    let base = crate::recall::index::InMemoryBase::new(meta);
    Ok(Some(base))
}

/// 全量预热单个思绪集（加载条目内容和向量）
#[allow(dead_code)]
pub fn warmup_knowledge_base(
    app_data_dir: &std::path::Path,
    base_lock: &Arc<RwLock<crate::recall::index::InMemoryBase>>,
    recall_path: &std::path::Path,
) -> Result<(), String> {
    let (recall_id, last_model) = {
        let base = base_lock.read().map_err(|_| "获取读锁失败")?;
        (base.meta.id, base.meta.vectorization.model_used.clone())
    };

    // 1. 加载条目
    let mut entries = Vec::new();
    load_entries_to_vec(recall_path, &recall_id, &mut entries)?;

    // 2. 加载向量
    let mut vectors = Vec::new();
    let mut dimension = 0;
    let mut total_tokens = 0;
    if !last_model.is_empty() {
        if let Ok(Some((v, d, t))) = load_vectors_to_vec(app_data_dir, recall_id, &last_model) {
            vectors = v;
            dimension = d;
            total_tokens = t;
        }
    }

    // 3. 同步到内存
    let mut base = base_lock.write().map_err(|_| "获取写锁失败")?;
    let recall_name = base.meta.name.clone();
    let entry_count = entries.len();
    let vector_count = vectors.len();

    // 只有当加载的模型与 meta 中记录的一致时才激活向量库
    if !vectors.is_empty() && !last_model.is_empty() {
        base.vector_store
            .rebuild(last_model.clone(), dimension, total_tokens, vectors);
    }

    // 将加载的内容同步到内存，并保留索引中的状态
    for entry in entries {
        base.sync_entry(entry);
    }

    base.is_fully_loaded = true;

    // 4. 扫描所有已向量化的模型状态
    if let Ok((model_map, all_models)) =
        scan_all_vectorized_models(app_data_dir, &recall_id.to_string())
    {
        // 更新全局模型列表
        base.meta.models = all_models;

        for (entry_id, (models, tokens)) in model_map {
            if let Some(pos) = base.meta.entries.iter().position(|e| e.id == entry_id) {
                let entry = &mut base.meta.entries[pos];
                for m in models {
                    if !entry.vectorized_models.contains(&m) {
                        entry.vectorized_models.push(m);
                    }
                }
                if !entry.vectorized_models.is_empty() {
                    entry.vector_status = "ready".to_string();
                    entry.total_tokens = tokens;
                }
            }
        }

        // 4.1 自动根据扫描结果更新顶层 vectorization 状态
        // 如果当前没有正在使用的模型，但扫描到了向量，则自动选取一个作为默认
        if base.meta.vectorization.model_used.is_empty() && !base.meta.models.is_empty() {
            let first_model = base.meta.models[0].clone();
            log::info!(
                "[KB_LOAD] 自动激活发现的向量模型: {} (ID: {})",
                first_model,
                recall_id
            );
            base.meta.vectorization.model_used = first_model;
            base.meta.vectorization.is_indexed = true;
            base.meta.vectorization.last_indexed_at = Some(get_now());
            // 维度信息在全量加载时会从向量文件里读到
            if dimension > 0 {
                base.meta.vectorization.dimension = dimension;
            }
        } else if !base.meta.vectorization.model_used.is_empty() {
            // 如果已经有模型了，确保 is_indexed 为 true
            base.meta.vectorization.is_indexed = true;
        }
    }

    // 5. 持久化更新后的元数据到 meta.json，确保下次冷启动时能直接读取到向量化状态
    log::info!(
        "[KB_LOAD] 预热扫描完成，准备更新元数据索引: {} (ID: {}), 向量化条目数: {}",
        recall_name,
        recall_id,
        base.meta
            .entries
            .iter()
            .filter(|e| e.vector_status == "ready")
            .count()
    );
    let _ = save_recall_meta(app_data_dir, &recall_id.to_string(), &base.meta);

    log::info!(
        "[KB_LOAD] 思绪集预热成功: {} (ID: {}), 条目: {}, 向量: {} (模型: {})",
        recall_name,
        recall_id,
        entry_count,
        vector_count,
        if last_model.is_empty() {
            if base.meta.models.is_empty() {
                "无".to_string()
            } else {
                format!("已发现 {} 个模型向量", base.meta.models.len())
            }
        } else {
            last_model
        }
    );

    Ok(())
}

/// 加载思绪集的所有条目到 Vec
#[allow(dead_code)]
pub fn load_entries_to_vec(
    recall_path: &std::path::Path,
    _recall_id: &Uuid,
    out_entries: &mut Vec<RecallEntry>,
) -> Result<(), String> {
    use ignore::WalkBuilder;

    let entries_dir = recall_path.join("entries");
    if !entries_dir.exists() {
        return Ok(());
    }

    // 1. 扫描所有 JSON 文件
    let mut file_paths = Vec::new();
    for result in WalkBuilder::new(entries_dir)
        .max_depth(Some(1))
        .build()
        .flatten()
    {
        if result.path().extension().and_then(|s| s.to_str()) == Some("json") {
            file_paths.push(result.path().to_path_buf());
        }
    }

    // 2. 并行读取和解析
    let entries: Vec<RecallEntry> = file_paths
        .into_par_iter()
        .filter_map(|path| {
            let content = std::fs::read_to_string(&path).ok()?;
            let mut entry: RecallEntry = serde_json::from_str(&content).ok()?;

            // 补全缺失的摘要
            if entry.summary.is_empty() {
                entry.summary = generate_summary(&entry.content);
            }
            Some(entry)
        })
        .collect();

    *out_entries = entries;
    Ok(())
}

/// 加载思绪集的向量数据到 Vec
#[allow(clippy::type_complexity)]
pub fn load_vectors_to_vec(
    app_data_dir: &std::path::Path,
    recall_id: Uuid,
    model_id: &str,
) -> Result<Option<(Vec<(Uuid, Vec<f32>)>, usize, usize)>, String> {
    use ignore::WalkBuilder;

    let model_dir = get_recall_vector_model_dir(app_data_dir, &recall_id.to_string(), model_id);
    if !model_dir.exists() {
        return Ok(None);
    }

    // 1. 扫描所有 .vec 文件
    let mut vec_file_paths = Vec::new();
    for result in WalkBuilder::new(&model_dir)
        .max_depth(Some(1))
        .build()
        .flatten()
    {
        if result.path().extension().and_then(|s| s.to_str()) == Some("vec") {
            vec_file_paths.push(result.path().to_path_buf());
        }
    }

    if vec_file_paths.is_empty() {
        return Ok(None);
    }

    // 2. 并行解析向量 JSON
    let results: Vec<(Uuid, Vec<f32>, usize)> = vec_file_paths
        .into_par_iter()
        .filter_map(|path| {
            let filename = path.file_name()?.to_str()?;
            let cid_str = filename.trim_end_matches(".vec");
            let cid = Uuid::parse_str(cid_str).ok()?;

            let content = std::fs::read_to_string(&path).ok()?;
            let data: serde_json::Value = serde_json::from_str(&content).ok()?;

            let v_arr = data["vector"].as_array()?;
            let vec: Vec<f32> = v_arr
                .iter()
                .filter_map(|v| v.as_f64().map(|f| f as f32))
                .collect();

            let tokens = data["tokens"].as_u64().unwrap_or(0) as usize;

            Some((cid, vec, tokens))
        })
        .collect();

    if !results.is_empty() {
        let dimension = results[0].1.len();
        let mut total_tokens = 0;
        let mut vectors = Vec::with_capacity(results.len());

        for (id, vec, tokens) in results {
            total_tokens += tokens;
            vectors.push((id, vec));
        }

        return Ok(Some((vectors, dimension, total_tokens)));
    }

    Ok(None)
}

/// 扫描思绪集下所有已向量化的模型及其覆盖的条目
#[allow(dead_code)]
pub fn scan_all_vectorized_models(
    app_data_dir: &std::path::Path,
    recall_id_str: &str,
) -> Result<(VectorizedModelsMap, Vec<String>), String> {
    let recall_vec_root = get_recall_vectors_root(app_data_dir, recall_id_str);
    if !recall_vec_root.exists() {
        return Ok((std::collections::HashMap::new(), vec![]));
    }

    // 1. 加载模型索引
    let index_path = get_recall_models_index_path(app_data_dir, recall_id_str);
    let models_index: std::collections::HashMap<String, String> = if index_path.exists() {
        let content = std::fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };

    let mut result: std::collections::HashMap<Uuid, (Vec<String>, u32)> =
        std::collections::HashMap::new();
    let mut all_models = std::collections::HashSet::new();

    // 2. 遍历物理目录
    if let Ok(dirs) = std::fs::read_dir(recall_vec_root) {
        for entry in dirs.flatten() {
            if entry.path().is_dir() {
                let dirname = entry.file_name().into_string().unwrap_or_default();
                let model_id = models_index
                    .get(&dirname)
                    .cloned()
                    .unwrap_or_else(|| dirname.clone());

                all_models.insert(model_id.clone());

                // 扫描该目录下的所有 .vec 文件
                if let Ok(files) = std::fs::read_dir(entry.path()) {
                    for file in files.flatten() {
                        if file.path().extension().and_then(|s| s.to_str()) == Some("vec") {
                            if let Some(cid_str) = file
                                .file_name()
                                .to_str()
                                .map(|s| s.trim_end_matches(".vec"))
                            {
                                if let Ok(cid) = Uuid::parse_str(cid_str) {
                                    let mut tokens = 0;
                                    // 尝试读取 tokens
                                    if let Ok(content) = std::fs::read_to_string(file.path()) {
                                        if let Ok(data) =
                                            serde_json::from_str::<serde_json::Value>(&content)
                                        {
                                            tokens = data["tokens"].as_u64().unwrap_or(0) as u32;
                                        }
                                    }

                                    let entry_data = result.entry(cid).or_default();
                                    entry_data.0.push(model_id.clone());
                                    // 我们取最大的 token 数（如果有多个模型的话，通常只显示当前模型的，或者累加。
                                    // 这里为了简单，如果已向量化，就累加或者取非零。
                                    if tokens > 0 {
                                        entry_data.1 += tokens;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut all_models_vec: Vec<String> = all_models.into_iter().collect();
    all_models_vec.sort();

    Ok((result, all_models_vec))
}

/// 更新思绪集模型索引表 (vectors/{recall_id}/models.json)
#[allow(dead_code)]
pub fn update_recall_models_index(
    app_data_dir: &std::path::Path,
    recall_id: &str,
    model_id: &str,
) -> Result<(), String> {
    let index_path = get_recall_models_index_path(app_data_dir, recall_id);
    let mut index: std::collections::HashMap<String, String> = if index_path.exists() {
        let content = std::fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };

    let safe_id = get_safe_model_id(model_id);
    index.insert(safe_id, model_id.to_string());

    let json = serde_json::to_string_pretty(&index).map_err(|e| e.to_string())?;
    std::fs::write(index_path, json).map_err(|e| e.to_string())?;
    Ok(())
}


#[cfg(test)]
mod repository_warmup_tests {
    use super::warmup_recall_repository;
    use crate::recall::core::{
        RecallCollection, RecallCollectionMeta, RecallEntry, RecallSearchFilters, RetrievalContext,
        RetrievalRequestSnapshot, VectorizationMeta,
    };
    use crate::recall::index::InMemoryDatabase;
    use crate::recall::retrieval_modules::{algorithmic_pipeline, production_module_registry};
    use crate::recall::retrieval_pipeline::{
        RecallPresetId, RetrievalArtifacts, RetrievalPipelineCompiler, RetrievalPipelineRunner,
    };
    use crate::recall::storage::{RecallRepository, SqliteRecallRepository};
    use crate::recall::tag_pool::{GlobalTagPoolManager, ModelTagPool};
    use std::sync::{Arc, RwLock};
    use tempfile::tempdir;
    use uuid::Uuid;

    #[test]
    fn warmup_reads_the_repository_after_legacy_files_are_removed() {
        let app_data = tempdir().unwrap();
        let repository = SqliteRecallRepository::new(app_data.path());
        repository.initialize().unwrap();

        let collection_id = Uuid::new_v4();
        let entry_id = Uuid::new_v4();
        let entry = RecallEntry {
            id: entry_id,
            key: "database-entry".to_string(),
            content: "数据库成为 Recall 真源".to_string(),
            summary: "数据库真源".to_string(),
            core_tags: vec![],
            tags: vec![],
            assets: vec![],
            priority: 100,
            enabled: true,
            created_at: 10,
            updated_at: 20,
            error_message: None,
            content_hash: Some("entry-hash".to_string()),
            refs: vec![],
            ref_by: vec![],
        };
        repository
            .save_collection(&RecallCollection {
                meta: RecallCollectionMeta {
                    id: collection_id,
                    name: "数据库思绪集".to_string(),
                    description: None,
                    created_at: 10,
                    updated_at: 20,
                    author: None,
                    vectorization: VectorizationMeta {
                        is_indexed: true,
                        last_indexed_at: Some(20),
                        model_used: "model-a".to_string(),
                        dimension: 2,
                        total_tokens: 3,
                    },
                    models: vec!["model-a".to_string()],
                    tags: vec![],
                    icon: None,
                    entries: vec![],
                    config: serde_json::json!({}),
                },
                entries: vec![entry.clone()],
            })
            .unwrap();
        repository
            .upsert_entry_vector(
                collection_id,
                entry_id,
                "model-a",
                &[0.25, 0.75],
                Some(3),
                entry.content_hash.as_deref(),
                20,
            )
            .unwrap();
        let mut tag_pool = ModelTagPool::new("model-a".to_string());
        tag_pool.sync_vectors(vec![("数据库".to_string(), vec![0.5, 0.5])]);
        repository.save_tag_pool(&tag_pool).unwrap();

        let imdb = Arc::new(RwLock::new(InMemoryDatabase::new()));
        let pools = GlobalTagPoolManager::new();
        warmup_recall_repository(&repository, &imdb, &pools).unwrap();

        let database = imdb.read().unwrap();
        let base = database.bases.get(&collection_id).unwrap().read().unwrap();
        assert!(base.is_fully_loaded);
        assert_eq!(base.entries.get(&entry_id).unwrap().content, entry.content);
        assert_eq!(base.vector_store.model_id, "model-a");
        assert_eq!(base.vector_store.ids, vec![entry_id]);
        drop(base);
        drop(database);

        let restored_pool = pools.get_pool(app_data.path(), "model-a").unwrap();
        assert_eq!(
            restored_pool.read().unwrap().registry.get("数据库"),
            Some(&0)
        );

        std::fs::remove_file(repository.vector_db_path()).unwrap();
        let recovered_repository = SqliteRecallRepository::new(app_data.path());
        recovered_repository.initialize().unwrap();
        let recovered_imdb = Arc::new(RwLock::new(InMemoryDatabase::new()));
        warmup_recall_repository(
            &recovered_repository,
            &recovered_imdb,
            &GlobalTagPoolManager::new(),
        )
        .unwrap();

        let recovered_database = recovered_imdb.read().unwrap();
        let recovered_base = recovered_database
            .bases
            .get(&collection_id)
            .unwrap()
            .read()
            .unwrap();
        assert_eq!(
            recovered_base.entries.get(&entry_id).unwrap().content,
            entry.content
        );
        assert!(recovered_base.vector_store.ids.is_empty());
        drop(recovered_base);
        drop(recovered_database);

        let context = RetrievalContext {
            db: recovered_imdb,
            tag_pool_manager: GlobalTagPoolManager::new(),
            app_data_dir: app_data.path().to_path_buf(),
            request: Some(RetrievalRequestSnapshot {
                query: "数据库".to_string(),
                filters: RecallSearchFilters {
                    recall_ids: Some(vec![collection_id]),
                    ..Default::default()
                },
            }),
        };
        let compiled = RetrievalPipelineCompiler::new(Arc::new(
            production_module_registry().expect("production registry should be valid"),
        ))
        .compile(&algorithmic_pipeline(None), "repository-warmup".to_string());
        let response = RetrievalPipelineRunner.run(
            &compiled,
            &context,
            RetrievalArtifacts::default(),
            None,
            RecallPresetId::Algorithmic,
            RecallPresetId::Algorithmic,
            None,
        );
        assert_eq!(response.results[0].entry.id, entry_id);

        recovered_repository
            .upsert_entry_vector(
                collection_id,
                entry_id,
                "model-a",
                &[0.75, 0.25],
                Some(3),
                entry.content_hash.as_deref(),
                30,
            )
            .unwrap();
        assert_eq!(
            recovered_repository
                .load_vectors(collection_id, "model-a")
                .unwrap()
                .unwrap()
                .0[0]
                .1,
            vec![0.75, 0.25]
        );
    }
}
