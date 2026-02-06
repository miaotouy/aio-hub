use crate::knowledge::core::{Caiu, KnowledgeBaseMeta};
use crate::knowledge::io::*;
use crate::knowledge::utils::*;
use rayon::prelude::*;
use std::sync::{Arc, RwLock};
use uuid::Uuid;

type VectorizedModelsMap = std::collections::HashMap<Uuid, Vec<String>>;

/// 快速加载知识库元数据（仅 meta.json，不加载条目内容）
pub fn load_knowledge_base_meta_only(
    _app_data_dir: &std::path::Path,
    kb_path: &std::path::Path,
    _kb_id: Uuid,
) -> Result<Option<crate::knowledge::index::InMemoryBase>, String> {
    let meta_path = kb_path.join("meta.json");
    if !meta_path.exists() {
        return Ok(None);
    }

    let meta_json = std::fs::read_to_string(meta_path).map_err(|e| e.to_string())?;
    let meta: KnowledgeBaseMeta = serde_json::from_str(&meta_json).map_err(|e| e.to_string())?;

    let base = crate::knowledge::index::InMemoryBase::new(meta);
    Ok(Some(base))
}

/// 全量预热单个知识库（加载条目内容和向量）
pub fn warmup_knowledge_base(
    app_data_dir: &std::path::Path,
    base_lock: &Arc<RwLock<crate::knowledge::index::InMemoryBase>>,
    kb_path: &std::path::Path,
) -> Result<(), String> {
    let (kb_id, last_model) = {
        let base = base_lock.read().map_err(|_| "获取读锁失败")?;
        (base.meta.id, base.meta.vectorization.model_used.clone())
    };

    // 1. 加载条目
    let mut entries = Vec::new();
    load_entries_to_vec(kb_path, &kb_id, &mut entries)?;

    // 2. 加载向量
    let mut vectors = Vec::new();
    let mut dimension = 0;
    if !last_model.is_empty() {
        if let Ok(Some((v, d))) = load_vectors_to_vec(app_data_dir, kb_id, &last_model) {
            vectors = v;
            dimension = d;
        }
    }

    // 3. 同步到内存
    let mut base = base_lock.write().map_err(|_| "获取写锁失败")?;
    let kb_name = base.meta.name.clone();
    let entry_count = entries.len();
    let vector_count = vectors.len();

    // 只有当加载的模型与 meta 中记录的一致时才激活向量库
    if !vectors.is_empty() && !last_model.is_empty() {
        base.vector_store
            .rebuild(last_model.clone(), dimension, vectors);
    }

    // 将加载的内容同步到内存，并保留索引中的状态
    for caiu in entries {
        base.sync_entry(caiu);
    }

    base.is_fully_loaded = true;

    // 4. 扫描所有已向量化的模型状态
    if let Ok((model_map, all_models)) =
        scan_all_vectorized_models(app_data_dir, &kb_id.to_string())
    {
        // 更新全局模型列表
        base.meta.models = all_models;

        for (caiu_id, models) in model_map {
            if let Some(pos) = base.meta.entries.iter().position(|e| e.id == caiu_id) {
                let entry = &mut base.meta.entries[pos];
                for m in models {
                    if !entry.vectorized_models.contains(&m) {
                        entry.vectorized_models.push(m);
                    }
                }
                if !entry.vectorized_models.is_empty() {
                    entry.vector_status = "ready".to_string();
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
                kb_id
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
        kb_name,
        kb_id,
        base.meta.entries.iter().filter(|e| e.vector_status == "ready").count()
    );
    let _ = save_kb_meta(app_data_dir, &kb_id.to_string(), &base.meta);

    log::info!(
        "[KB_LOAD] 知识库预热成功: {} (ID: {}), 条目: {}, 向量: {} (模型: {})",
        kb_name,
        kb_id,
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

/// 加载知识库的所有条目到 Vec
pub fn load_entries_to_vec(
    kb_path: &std::path::Path,
    _kb_id: &Uuid,
    out_entries: &mut Vec<Caiu>,
) -> Result<(), String> {
    use ignore::WalkBuilder;

    let entries_dir = kb_path.join("entries");
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
    let entries: Vec<Caiu> = file_paths
        .into_par_iter()
        .filter_map(|path| {
            let content = std::fs::read_to_string(&path).ok()?;
            let mut caiu: Caiu = serde_json::from_str(&content).ok()?;

            // 补全缺失的摘要
            if caiu.summary.is_empty() {
                caiu.summary = generate_summary(&caiu.content);
            }
            Some(caiu)
        })
        .collect();

    *out_entries = entries;
    Ok(())
}

/// 加载知识库的向量数据到 Vec
#[allow(clippy::type_complexity)]
pub fn load_vectors_to_vec(
    app_data_dir: &std::path::Path,
    kb_id: Uuid,
    model_id: &str,
) -> Result<Option<(Vec<(Uuid, Vec<f32>)>, usize)>, String> {
    use ignore::WalkBuilder;

    let model_dir = get_kb_vector_model_dir(app_data_dir, &kb_id.to_string(), model_id);
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
    let vectors: Vec<(Uuid, Vec<f32>)> = vec_file_paths
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

            Some((cid, vec))
        })
        .collect();

    if !vectors.is_empty() {
        let dimension = vectors[0].1.len();
        return Ok(Some((vectors, dimension)));
    }

    Ok(None)
}

/// 扫描知识库下所有已向量化的模型及其覆盖的条目
pub fn scan_all_vectorized_models(
    app_data_dir: &std::path::Path,
    kb_id_str: &str,
) -> Result<(VectorizedModelsMap, Vec<String>), String> {
    let kb_vec_root = get_kb_vectors_root(app_data_dir, kb_id_str);
    if !kb_vec_root.exists() {
        return Ok((std::collections::HashMap::new(), vec![]));
    }

    // 1. 加载模型索引
    let index_path = get_kb_models_index_path(app_data_dir, kb_id_str);
    let models_index: std::collections::HashMap<String, String> = if index_path.exists() {
        let content = std::fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };

    let mut result: std::collections::HashMap<Uuid, Vec<String>> = std::collections::HashMap::new();
    let mut all_models = std::collections::HashSet::new();

    // 2. 遍历物理目录
    if let Ok(dirs) = std::fs::read_dir(kb_vec_root) {
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
                                    result.entry(cid).or_default().push(model_id.clone());
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

/// 删除单个条目的所有相关文件（条目 JSON + 向量文件）
pub fn delete_entry_files(
    app_data_dir: &std::path::Path,
    kb_id_str: &str,
    entry_id: &Uuid,
) -> Result<(), String> {
    let entry_id_str = entry_id.to_string();

    // 删除条目主文件
    if let Err(e) = delete_entry(app_data_dir, kb_id_str, &entry_id_str) {
        log::warn!("[KB] 删除条目文件失败 {}: {}", entry_id_str, e);
    }

    // 清理关联的向量文件 (扫描所有模型目录下的该条目向量)
    let kb_vec_root = get_kb_vectors_root(app_data_dir, kb_id_str);
    if !kb_vec_root.exists() {
        return Ok(());
    }

    // 遍历模型子目录
    if let Ok(model_dirs) = std::fs::read_dir(kb_vec_root) {
        for model_dir in model_dirs.flatten() {
            if model_dir.path().is_dir() {
                let _model_name = model_dir.file_name().into_string().unwrap_or_default();
                let vec_file = model_dir.path().join(format!("{}.vec", entry_id_str));
                if vec_file.exists() {
                    let _ = std::fs::remove_file(vec_file);
                }
            }
        }
    }

    Ok(())
}

/// 更新知识库模型索引表 (vectors/{kb_id}/models.json)
pub fn update_kb_models_index(
    app_data_dir: &std::path::Path,
    kb_id: &str,
    model_id: &str,
) -> Result<(), String> {
    let index_path = get_kb_models_index_path(app_data_dir, kb_id);
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

/// 批量导入/更新条目的核心逻辑
pub fn batch_upsert_entries_logic(
    app_data_dir: &std::path::Path,
    base_lock: &Arc<RwLock<crate::knowledge::index::InMemoryBase>>,
    mut entries: Vec<Caiu>,
    deduplicate: bool,
) -> Result<(Vec<Caiu>, usize), String> {
    let kb_id = {
        let base = base_lock.read().map_err(|_| "获取读锁失败")?;
        base.meta.id
    };
    let kb_id_str = kb_id.to_string();

    // 1. 获取现有的内容哈希集合（用于去重）
    let mut seen_hashes: std::collections::HashSet<String> = if deduplicate {
        let base = base_lock.read().map_err(|_| "获取知识库读锁失败")?;
        base.entries
            .values()
            .filter_map(|e| e.content_hash.clone())
            .collect()
    } else {
        std::collections::HashSet::new()
    };

    // 2. 补全哈希和摘要
    entries.par_iter_mut().for_each(|entry| {
        if entry.content_hash.is_none() || entry.content_hash.as_ref().unwrap().is_empty() {
            entry.content_hash = Some(calculate_content_hash(&entry.content));
        }
        if entry.summary.is_empty() {
            entry.summary = generate_summary(&entry.content);
        }
    });

    // 3. 去重过滤
    let mut duplicate_count = 0;
    let filtered_entries: Vec<Caiu> = entries
        .into_iter()
        .filter(|entry| {
            if let Some(hash) = &entry.content_hash {
                if deduplicate && seen_hashes.contains(hash) {
                    duplicate_count += 1;
                    return false;
                }
                seen_hashes.insert(hash.clone());
            }
            true
        })
        .collect();

    if filtered_entries.is_empty() {
        return Ok((vec![], duplicate_count));
    }

    // 4. 并行写入磁盘
    filtered_entries.par_iter().for_each(|entry| {
        let _ = save_entry(app_data_dir, &kb_id_str, entry);
    });

    // 5. 更新内存数据库
    {
        let mut base = base_lock.write().map_err(|_| "获取知识库写锁失败")?;
        for entry in &filtered_entries {
            base.sync_entry(entry.clone());
        }
    }

    Ok((filtered_entries, duplicate_count))
}
