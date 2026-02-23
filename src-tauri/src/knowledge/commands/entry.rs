use crate::knowledge::core::Caiu;
use crate::knowledge::io::*;
use crate::knowledge::monitor::{
    emit_monitor_event, IndexMetadata, IndexPayload, IndexStats, KbMonitorEvent, KbMonitorLevel,
    KbMonitorStep, KbStepStatus,
};
use crate::knowledge::ops::*;
use crate::knowledge::state::KnowledgeState;
use crate::knowledge::utils::*;
use rayon::prelude::*;
use tauri::{AppHandle, Manager, State};
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
    pub entries: Vec<Caiu>,
    pub skipped_count: usize,
    pub duplicate_count: usize,
}

#[tauri::command]
pub async fn kb_load_entry(
    state: State<'_, KnowledgeState>,
    kb_id: Uuid,
    entry_id: Uuid,
) -> Result<Option<Caiu>, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&kb_id) {
        let base = base_lock.read().map_err(|_| "获取知识库读锁失败")?;
        if let Some(entry) = base.entries.get(&entry_id).cloned() {
            Ok(Some(entry))
        } else {
            Ok(None)
        }
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn kb_get_entries(
    state: State<'_, KnowledgeState>,
    ids: Vec<Uuid>,
) -> Result<Vec<serde_json::Value>, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    let mut results = Vec::new();

    // 遍历所有知识库查找对应的 ID
    for base_lock in imdb.bases.values() {
        let base = base_lock.read().map_err(|_| "获取知识库读锁失败")?;
        for id in &ids {
            if let Some(entry) = base.entries.get(id) {
                // 转换为前端需要的格式，包含 kb_name 和 kb_id
                results.push(serde_json::json!({
                    "id": entry.id,
                    "key": entry.key,
                    "content": entry.content,
                    "tags": entry.tags,
                    "kb_id": base.meta.id,
                    "kb_name": base.meta.name,
                }));
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn kb_list_entry_ids(
    state: State<'_, KnowledgeState>,
    kb_id: Uuid,
) -> Result<Vec<Uuid>, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&kb_id) {
        let base = base_lock.read().map_err(|_| "获取知识库读锁失败")?;
        Ok(base.entries.keys().cloned().collect())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn kb_upsert_entry(
    app: AppHandle,
    state: State<'_, KnowledgeState>,
    kb_id: Uuid,
    mut entry: Caiu,
    config: Option<ImportConfig>,
) -> Result<Caiu, String> {
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
                    crate::knowledge::core::TagWithWeight {
                        name,
                        weight: 1.0,
                        hash,
                    }
                })
                .collect();
        }
    }

    let new_hash = calculate_content_hash(&entry.content);
    if entry.content_hash.as_ref() != Some(&new_hash) {
        // 内容变动，清理旧向量文件
        let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let _ =
            crate::knowledge::ops::delete_entry_files(&app_data_dir, &kb_id.to_string(), &entry.id);
    }
    entry.content_hash = Some(new_hash);

    if entry.summary.is_empty() {
        entry.summary = generate_summary(&entry.content);
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    save_entry(&app_data_dir, &kb_id.to_string(), &entry)?;

    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&kb_id) {
        let mut base = base_lock.write().map_err(|_| "获取知识库写锁失败")?;
        base.sync_entry(entry.clone());

        // 同步持久化元数据索引
        log::debug!(
            "[KB_ENTRY] 条目更新，同步元数据索引: kb={}, entry={}",
            kb_id,
            entry.id
        );
        let _ = save_kb_meta(&app_data_dir, &kb_id.to_string(), &base.meta);
    }

    let duration = start_time.elapsed().as_millis() as u64;
    // 发送监控事件
    let _ = emit_monitor_event(
        &app,
        KbMonitorEvent::Index(IndexPayload {
            steps: vec![KbMonitorStep {
                name: "条目更新".to_string(),
                status: KbStepStatus::Completed,
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
                kb_id: kb_id.to_string(),
                model_id: "".to_string(),
                file_patterns: vec![],
            }),
        }),
        KbMonitorLevel::Info,
        "条目更新完成",
        &format!("条目 \"{}\" 已保存", entry.key),
        "Indexer",
    );

    Ok(entry)
}

#[tauri::command]
pub async fn kb_delete_entry(
    app: AppHandle,
    state: State<'_, KnowledgeState>,
    kb_id: Uuid,
    entry_id: Uuid,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    crate::knowledge::ops::delete_entry_files(&app_data_dir, &kb_id.to_string(), &entry_id)?;

    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&kb_id) {
        let mut base = base_lock.write().map_err(|_| "获取知识库写锁失败")?;
        base.remove_entry(&entry_id);

        // 同步持久化元数据索引
        log::debug!(
            "[KB_ENTRY] 条目删除，同步元数据索引: kb={}, entry={}",
            kb_id,
            entry_id
        );
        let _ = save_kb_meta(&app_data_dir, &kb_id.to_string(), &base.meta);
    }
    Ok(())
}

#[tauri::command]
pub async fn kb_batch_import_files(
    app: AppHandle,
    state: State<'_, KnowledgeState>,
    kb_id: Uuid,
    paths: Vec<String>,
    deduplicate: bool,
    config: ImportConfig,
) -> Result<BatchImportResult, String> {
    let start_time = std::time::Instant::now();
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let total_paths = paths.len();

    // 发送开始索引监控事件
    let _ = emit_monitor_event(
        &app,
        KbMonitorEvent::Index(IndexPayload {
            steps: vec![KbMonitorStep {
                name: "文件扫描".to_string(),
                status: KbStepStatus::Running,
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
                kb_id: kb_id.to_string(),
                model_id: "".to_string(), // 导入阶段暂无模型
                file_patterns: vec![],
            }),
        }),
        KbMonitorLevel::Info,
        "开始导入文件",
        &format!("正在处理 {} 个文件", total_paths),
        "Indexer",
    );

    let candidates: Vec<Caiu> = paths
        .into_par_iter()
        .enumerate()
        .filter_map(|(idx, path_str)| {
            let path = std::path::Path::new(&path_str);

            // 进度推送 (每处理 5 个文件推送一次，避免过于频繁)
            if idx > 0 && idx % 5 == 0 {
                let _ = emit_monitor_event(
                    &app,
                    KbMonitorEvent::Index(IndexPayload {
                        steps: vec![KbMonitorStep {
                            name: "文件扫描".to_string(),
                            status: KbStepStatus::Running,
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
                            kb_id: kb_id.to_string(),
                            model_id: "".to_string(),
                            file_patterns: vec![],
                        }),
                    }),
                    KbMonitorLevel::Info,
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
                        crate::knowledge::core::TagWithWeight {
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

            Some(Caiu {
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

    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    let base_lock = imdb
        .bases
        .get(&kb_id)
        .ok_or_else(|| "找不到知识库".to_string())?;

    let (entries, duplicate_count) =
        batch_upsert_entries_logic(&app_data_dir, base_lock, candidates, deduplicate)?;

    let duration = start_time.elapsed().as_millis() as u64;
    let imported_count = entries.len();

    // 发送完成监控事件
    let _ = emit_monitor_event(
        &app,
        KbMonitorEvent::Index(IndexPayload {
            steps: vec![
                KbMonitorStep {
                    name: "文件扫描".to_string(),
                    status: KbStepStatus::Completed,
                    duration: duration / 2, // 估算
                    details: Some(format!("扫描到 {} 个文件", total_paths)),
                },
                KbMonitorStep {
                    name: "文本提取".to_string(),
                    status: KbStepStatus::Completed,
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
                kb_id: kb_id.to_string(),
                model_id: "".to_string(),
                file_patterns: vec![],
            }),
        }),
        KbMonitorLevel::Success,
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
pub async fn kb_batch_upsert_entries(
    app: AppHandle,
    state: State<'_, KnowledgeState>,
    kb_id: Uuid,
    mut entries: Vec<Caiu>,
    deduplicate: bool,
    config: Option<ImportConfig>,
) -> Result<BatchImportResult, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

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
                        crate::knowledge::core::TagWithWeight {
                            name,
                            weight: 1.0,
                            hash,
                        }
                    })
                    .collect();
            }
        }
    });

    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    let base_lock = imdb
        .bases
        .get(&kb_id)
        .ok_or_else(|| "找不到知识库".to_string())?;

    let (filtered_entries, duplicate_count) =
        batch_upsert_entries_logic(&app_data_dir, base_lock, entries, deduplicate)?;

    Ok(BatchImportResult {
        entries: filtered_entries,
        skipped_count: 0,
        duplicate_count,
    })
}

#[tauri::command]
pub async fn kb_batch_patch_entries(
    app: AppHandle,
    state: State<'_, KnowledgeState>,
    kb_id: Uuid,
    entry_ids: Vec<Uuid>,
    patch: crate::knowledge::core::CaiuPatch,
) -> Result<usize, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let kb_id_str = kb_id.to_string();
    let now = crate::knowledge::utils::get_now();

    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    let base_lock = imdb
        .bases
        .get(&kb_id)
        .ok_or_else(|| "找不到知识库".to_string())?;

    // 1. 用读锁读取所有需要更新的条目（内存优先，回退到磁盘）
    let entries_to_update: Vec<Caiu> = {
        let base = base_lock.read().map_err(|_| "获取知识库读锁失败")?;
        let entries_dir = crate::knowledge::io::get_kb_entries_dir(&app_data_dir, &kb_id_str);
        let mut result = Vec::new();
        for id in &entry_ids {
            if let Some(entry) = base.entries.get(id) {
                result.push(entry.clone());
            } else {
                // 内存中没有，尝试从磁盘加载
                let entry_path = entries_dir.join(format!("{}.json", id));
                if entry_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&entry_path) {
                        if let Ok(entry) = serde_json::from_str::<Caiu>(&content) {
                            result.push(entry);
                        }
                    }
                }
            }
        }
        result
    };

    if entries_to_update.is_empty() {
        return Ok(0);
    }

    // 2. 应用 patch
    let updated_entries: Vec<Caiu> = entries_to_update
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

    // 3. 并行写磁盘
    updated_entries.par_iter().for_each(|entry| {
        let _ = crate::knowledge::io::save_entry(&app_data_dir, &kb_id_str, entry);
    });

    let updated_count = updated_entries.len();

    // 4. 批量更新内存 + 一次性保存 meta
    {
        let mut base = base_lock.write().map_err(|_| "获取知识库写锁失败")?;
        for entry in updated_entries {
            base.sync_entry(entry);
        }
        let _ = crate::knowledge::io::save_kb_meta(&app_data_dir, &kb_id_str, &base.meta);
    }

    log::info!(
        "[KB_ENTRY] 批量 patch 完成: kb={}, 更新 {} 个条目",
        kb_id_str,
        updated_count
    );

    Ok(updated_count)
}

#[tauri::command]
pub async fn kb_batch_delete_entries(
    app: AppHandle,
    state: State<'_, KnowledgeState>,
    kb_id: Uuid,
    entry_ids: Vec<Uuid>,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let kb_id_str = kb_id.to_string();

    for entry_id in &entry_ids {
        crate::knowledge::ops::delete_entry_files(&app_data_dir, &kb_id_str, entry_id)?;
    }

    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    if let Some(base_lock) = imdb.bases.get(&kb_id) {
        let mut base = base_lock.write().map_err(|_| "获取知识库写锁失败")?;
        for entry_id in &entry_ids {
            base.remove_entry(entry_id);
        }

        // 同步持久化元数据索引
        log::debug!("[KB_ENTRY] 批量条目删除，同步元数据索引: kb={}", kb_id_str);
        let _ = save_kb_meta(&app_data_dir, &kb_id_str, &base.meta);
    }
    Ok(())
}
