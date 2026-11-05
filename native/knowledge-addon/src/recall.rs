// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

mod backup;
#[path = "../../../src-tauri/src/recall/backup_archive.rs"]
#[allow(dead_code)] // Export and asset restore adapters are integrated in subsequent batches.
mod backup_archive;
#[path = "../../../src-tauri/src/recall/backup_conversion.rs"]
mod backup_conversion;
#[path = "../../../src-tauri/src/recall/core.rs"]
pub mod core;
#[path = "../../../src-tauri/src/recall/entry_import.rs"]
mod entry_import;
mod files;
#[path = "../../../src-tauri/src/recall/index.rs"]
pub mod index;
#[path = "../../../src-tauri/src/recall/io.rs"]
pub mod io;
mod library;
mod migration;
#[path = "../../../src-tauri/src/recall/monitor_types.rs"]
pub mod monitor_types;
mod pipeline;
#[path = "../../../src-tauri/src/recall/retrieval_cache.rs"]
pub mod retrieval_cache;
#[path = "../../../src-tauri/src/recall/retrieval_modules.rs"]
pub mod retrieval_modules;
#[path = "../../../src-tauri/src/recall/retrieval_pipeline.rs"]
pub mod retrieval_pipeline;
#[path = "../../../src-tauri/src/recall/statistics.rs"]
mod statistics;
#[path = "../../../src-tauri/src/recall/tag_pool.rs"]
pub mod tag_pool;
#[path = "../../../src-tauri/src/recall/utils.rs"]
pub mod utils;

pub mod storage;

use core::{RecallCollection, RecallCollectionMeta, RecallEntry, RecallEntryPatch};
use storage::repository::RecallRepository;
use storage::sqlite::SqliteRecallRepository;

fn error(value: impl std::fmt::Display) -> Error {
    Error::from_reason(value.to_string())
}

fn decode<T: DeserializeOwned>(value: &Value) -> Result<T> {
    serde_json::from_value(value.clone()).map_err(error)
}

fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| error(format!("missing {key}")))
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn content_hash(content: &str) -> String {
    if content.is_empty() {
        return String::new();
    }
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

fn summary(content: &str) -> String {
    let plain = content
        .lines()
        .filter(|line| !line.trim().starts_with('#'))
        .collect::<Vec<_>>()
        .join(" ");
    let mut chars = plain.chars();
    let value = chars.by_ref().take(120).collect::<String>();
    if chars.next().is_some() {
        format!("{}...", value.trim())
    } else {
        value.trim().to_string()
    }
}

#[napi]
pub struct RecallRuntime {
    repository: Arc<SqliteRecallRepository>,
    caches: Arc<RuntimeCaches>,
}

#[derive(Default)]
struct RuntimeCaches {
    operation: Mutex<()>,
    backup: Mutex<backup::Sessions>,
    events: Mutex<std::collections::VecDeque<String>>,
    pipeline: pipeline::Runtime,
    retrieval_cache: Mutex<retrieval_cache::RetrievalCache>,
    loaded_vectors:
        Mutex<std::collections::HashMap<(Uuid, String), (Vec<(Uuid, Vec<f32>)>, usize, usize)>>,
    tag_pools: Mutex<std::collections::HashMap<String, tag_pool::ModelTagPool>>,
    embedding_cache: Mutex<std::collections::HashMap<String, (Vec<f32>, u64)>>,
}

impl RuntimeCaches {
    fn emit(&self, event: &str, payload: Value) {
        let mut events = self.events.lock().unwrap_or_else(|e| e.into_inner());
        if events.len() >= 512 {
            events.pop_front();
        }
        events.push_back(json!({"event": event, "payload": payload}).to_string());
    }
}

#[napi]
impl RecallRuntime {
    #[napi(constructor)]
    pub fn new(data_directory: String) -> Self {
        Self {
            repository: Arc::new(SqliteRecallRepository::new(PathBuf::from(data_directory))),
            caches: Arc::new(RuntimeCaches::default()),
        }
    }

    #[napi]
    pub async fn initialize(&self) -> Result<()> {
        let repository = Arc::clone(&self.repository);
        let caches = Arc::clone(&self.caches);
        tokio::task::spawn_blocking(move || {
            repository.initialize().map_err(error)?;
            dispatch_with_caches(&repository, &caches, "recall_warmup", &json!({}))?;
            Ok(())
        })
        .await
        .map_err(error)?
    }

    #[napi]
    pub fn drain_events(&self) -> Vec<String> {
        self.caches
            .events
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .drain(..)
            .collect()
    }

    #[napi]
    pub async fn execute(&self, command: String, arguments: String) -> Result<String> {
        let args: Value = serde_json::from_str(&arguments).map_err(error)?;
        let repository = Arc::clone(&self.repository);
        let caches = Arc::clone(&self.caches);
        tokio::task::spawn_blocking(move || {
            dispatch_with_caches(&repository, &caches, &command, &args)
        })
        .await
        .map_err(error)?
    }
}

fn warmup(repo: &SqliteRecallRepository, caches: &RuntimeCaches) -> Result<()> {
    caches.retrieval_cache.lock().map_err(error)?.clear();
    caches.loaded_vectors.lock().map_err(error)?.clear();
    caches.tag_pools.lock().map_err(error)?.clear();
    for collection in repo.list_collections().map_err(error)? {
        let _ = repo.load_entries(collection.id).map_err(error)?;
        for model_id in &collection.models {
            if let Some(vectors) = repo.load_vectors(collection.id, model_id).map_err(error)? {
                caches
                    .loaded_vectors
                    .lock()
                    .map_err(error)?
                    .insert((collection.id, model_id.clone()), vectors);
            }
        }
    }
    for model_id in repo.list_tag_pool_models().map_err(error)? {
        let mut pool = repo.load_tag_pool(&model_id).map_err(error)?;
        if !pool.registry.is_empty() {
            pool.rebuild_index();
        }
        caches
            .tag_pools
            .lock()
            .map_err(error)?
            .insert(model_id, pool);
    }
    caches.pipeline.warmup(repo)?;
    Ok(())
}

#[cfg(test)]
fn dispatch(repo: &SqliteRecallRepository, command: &str, a: &Value) -> Result<String> {
    dispatch_with_caches(repo, &RuntimeCaches::default(), command, a)
}

fn dispatch_with_caches(
    repo: &SqliteRecallRepository,
    caches: &RuntimeCaches,
    command: &str,
    a: &Value,
) -> Result<String> {
    // Claim migrations before waiting on general operations so duplicate requests fail promptly.
    let _migration = if migration::is_mutation(command) {
        Some(
            migration::LOCK
                .try_lock()
                .map_err(|_| error("已有旧 Recall 数据迁移任务正在运行"))?,
        )
    } else {
        None
    };
    // Serialize repository writes and read-view replacement across N-API worker threads.
    let _operation = caches.operation.lock().map_err(error)?;
    if matches!(
        command,
        "recall_save_base_meta"
            | "recall_delete_base"
            | "recall_clone_base"
            | "recall_upsert_entry"
            | "recall_delete_entry"
            | "recall_batch_delete_entries"
            | "recall_batch_upsert_entries"
            | "recall_batch_import_files"
            | "recall_flush_all_tag_pools"
            | "recall_batch_patch_entries"
            | "recall_update_entry_vector"
            | "recall_clear_legacy_vectors"
            | "recall_clear_all_other_vectors"
            | "recall_sync_tag_vectors"
            | "recall_rebuild_tag_pool_index"
            | "recall_clear_tag_pool"
            | "recall_clear_other_tag_pools"
    ) {
        // Invalidate before mutating: a failed batch may already have committed some writes.
        caches.pipeline.invalidate()?;
        caches.retrieval_cache.lock().map_err(error)?.clear();
    }
    let value = match command {
        "recall_list_retrieval_presets"
        | "recall_list_retrieval_modules"
        | "recall_get_retrieval_pipeline_template"
        | "recall_compile_retrieval_pipeline"
        | "recall_compile_custom_retrieval_pipeline"
        | "recall_run_retrieval_pipeline"
        | "recall_run_custom_retrieval_pipeline" => caches.pipeline.execute(repo, command, a)?,
        "recall_initialize" => Value::Null,
        "recall_warmup" => {
            warmup(repo, caches)?;
            Value::Null
        }
        "recall_inspect_legacy_migration"
        | "recall_preview_legacy_migration"
        | "recall_run_legacy_migration"
        | "recall_confirm_legacy_cleanup"
        | "recall_debug_reset_legacy_migration" => migration::execute(repo, caches, command, a)?,
        "recall_retrieval_cache_get" => {
            let input = decode(a.get("input").ok_or_else(|| error("missing input"))?)?;
            json!(retrieval_cache::get(
                &mut *caches.retrieval_cache.lock().map_err(error)?,
                &input
            ))
        }
        "recall_retrieval_cache_set" => {
            let input = decode(a.get("input").ok_or_else(|| error("missing input"))?)?;
            let entry = decode(a.get("entry").ok_or_else(|| error("missing entry"))?)?;
            let max_items = decode(a.get("maxItems").ok_or_else(|| error("missing maxItems"))?)?;
            retrieval_cache::set(
                &mut *caches.retrieval_cache.lock().map_err(error)?,
                &input,
                entry,
                max_items,
            );
            Value::Null
        }
        "recall_retrieval_cache_clear" => {
            caches.retrieval_cache.lock().map_err(error)?.clear();
            Value::Null
        }
        "recall_retrieval_cache_stats" => {
            json!(caches.retrieval_cache.lock().map_err(error)?.len())
        }
        "recall_inspect_backup"
        | "recall_inspect_backups"
        | "recall_import_legacy_backup_to_knowledge" => backup::execute(repo, caches, command, a)?,
        command if command.starts_with("_recall_backup_") => {
            backup::execute(repo, caches, command, a)?
        }
        "recall_batch_import_files" => files::import(repo, caches, a)?,
        "recall_get_library_stats" | "recall_flush_all_tag_pools" => {
            library::execute(repo, caches, command, a)?
        }
        "recall_list_bases" => json!(repo.list_collections().map_err(error)?),
        "recall_load_base_meta" => {
            let id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            let mut meta = repo
                .load_collection(id)
                .map_err(error)?
                .map(|collection| collection.meta);
            if let (Some(model), Some(meta)) = (a.get("modelId").and_then(Value::as_str), &mut meta)
            {
                for entry in &mut meta.entries {
                    entry.vector_status =
                        if entry.vectorized_models.iter().any(|item| item == model) {
                            "ready".to_string()
                        } else {
                            "none".to_string()
                        };
                }
            }
            json!(meta)
        }
        "recall_save_base_meta" => {
            let id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            let meta = decode::<RecallCollectionMeta>(
                a.get("meta").ok_or_else(|| error("missing meta"))?,
            )?;
            if meta.id != id {
                return Err(error("recallId 与集合 metadata ID 不匹配"));
            }
            let entries = repo
                .load_collection(id)
                .map_err(error)?
                .map_or_else(Vec::new, |collection| collection.entries);
            repo.save_collection(&RecallCollection { meta, entries })
                .map_err(error)?;
            Value::Null
        }
        "recall_delete_base" => {
            let id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            repo.delete_collection(id).map_err(error)?;
            caches
                .loaded_vectors
                .lock()
                .map_err(error)?
                .retain(|(collection_id, _), _| *collection_id != id);
            Value::Null
        }
        "recall_clone_base" => {
            let source_id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            let mut collection = repo
                .load_collection(source_id)
                .map_err(error)?
                .ok_or_else(|| error(format!("找不到源思绪集: {source_id}")))?;
            let id = Uuid::new_v4();
            let timestamp = now();
            collection.meta.id = id;
            collection.meta.name = text(a, "newName")?.to_string();
            collection.meta.created_at = timestamp;
            collection.meta.updated_at = timestamp;
            for entry in &mut collection.entries {
                entry.created_at = timestamp;
                entry.updated_at = timestamp;
            }
            repo.save_collection(&collection).map_err(error)?;
            json!(id)
        }
        "recall_export_base" => {
            let id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            json!(repo
                .load_collection(id)
                .map_err(error)?
                .ok_or_else(|| error(format!("找不到思绪集: {id}")))?)
        }
        "recall_load_entry" => {
            let collection_id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            let entry_id = Uuid::parse_str(text(a, "entryId")?).map_err(error)?;
            json!(repo.load_entry(collection_id, entry_id).map_err(error)?)
        }
        "recall_list_entry_ids" => {
            let id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            json!(repo
                .load_entries(id)
                .map_err(error)?
                .into_iter()
                .map(|entry| entry.id)
                .collect::<Vec<_>>())
        }
        "recall_upsert_entry" => {
            let id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            let mut entry =
                decode::<RecallEntry>(a.get("entry").ok_or_else(|| error("missing entry"))?)?;
            if let Some(config) = a.get("config") {
                if config.get("autoExtractTitle").and_then(Value::as_bool) == Some(true) {
                    if let Some(title) = extract_title(&entry.content) {
                        entry.key = title;
                    }
                }
                if config.get("autoExtractTags").and_then(Value::as_bool) == Some(true)
                    && entry.tags.is_empty()
                {
                    entry.tags = extract_tags(&entry.content)
                        .into_iter()
                        .map(|name| core::TagWithWeight {
                            hash: content_hash(&name),
                            name,
                            weight: 1.0,
                        })
                        .collect();
                }
            }
            entry.content_hash = Some(content_hash(&entry.content));
            if entry.summary.trim().is_empty() {
                entry.summary = summary(&entry.content);
            }
            if entry.created_at <= 0 {
                entry.created_at = now();
            }
            entry.updated_at = now();
            repo.upsert_entry(id, &entry).map_err(error)?;
            invalidate_loaded_vectors(caches, id)?;
            json!(entry)
        }
        "recall_delete_entry" | "recall_batch_delete_entries" => {
            let id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            let ids = if command == "recall_delete_entry" {
                vec![Uuid::parse_str(text(a, "entryId")?).map_err(error)?]
            } else {
                decode::<Vec<Uuid>>(a.get("entryIds").ok_or_else(|| error("missing entryIds"))?)?
            };
            repo.delete_entries(id, &ids).map_err(error)?;
            invalidate_loaded_vectors(caches, id)?;
            Value::Null
        }
        "recall_batch_upsert_entries" => {
            let id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            let mut entries = decode::<Vec<RecallEntry>>(
                a.get("entries").ok_or_else(|| error("missing entries"))?,
            )?;
            let timestamp = now();
            let config = a.get("config");
            for entry in &mut entries {
                if config
                    .and_then(|value| value.get("autoExtractTitle"))
                    .and_then(Value::as_bool)
                    == Some(true)
                {
                    if let Some(title) = extract_title(&entry.content) {
                        entry.key = title;
                    }
                }
                if config
                    .and_then(|value| value.get("autoExtractTags"))
                    .and_then(Value::as_bool)
                    == Some(true)
                    && entry.tags.is_empty()
                {
                    entry.tags = extract_tags(&entry.content)
                        .into_iter()
                        .map(|name| core::TagWithWeight {
                            hash: content_hash(&name),
                            name,
                            weight: 1.0,
                        })
                        .collect();
                }
                entry.content_hash = Some(content_hash(&entry.content));
                if entry.summary.trim().is_empty() {
                    entry.summary = summary(&entry.content);
                }
                if entry.created_at <= 0 {
                    entry.created_at = timestamp;
                }
                entry.updated_at = timestamp;
            }
            json!(persist_batch_entries(
                repo,
                caches,
                id,
                entries,
                a.get("deduplicate").and_then(Value::as_bool) == Some(true),
                0
            )?)
        }
        "recall_batch_patch_entries" => {
            let collection_id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            let ids =
                decode::<Vec<Uuid>>(a.get("entryIds").ok_or_else(|| error("missing entryIds"))?)?;
            let patch =
                decode::<RecallEntryPatch>(a.get("patch").ok_or_else(|| error("missing patch"))?)?;
            let timestamp = now();
            let mut entries = Vec::new();
            for id in ids {
                if let Some(mut entry) = repo.load_entry(collection_id, id).map_err(error)? {
                    if let Some(value) = patch.enabled {
                        entry.enabled = value;
                    }
                    if let Some(value) = patch.priority {
                        entry.priority = value;
                    }
                    if let Some(value) = &patch.key {
                        entry.key = value.clone();
                    }
                    if let Some(value) = &patch.tags {
                        entry.tags = value.clone();
                    }
                    entry.updated_at = timestamp;
                    entries.push(entry);
                }
            }
            let count = entries.len();
            repo.upsert_entries(collection_id, &entries)
                .map_err(error)?;
            json!(count)
        }
        "recall_get_entries" => {
            let ids = decode::<Vec<Uuid>>(a.get("ids").ok_or_else(|| error("missing ids"))?)?;
            let mut result = Vec::new();
            for meta in repo.list_collections().map_err(error)? {
                for id in &ids {
                    if let Some(entry) = repo.load_entry(meta.id, *id).map_err(error)? {
                        result.push(json!({
                            "id": entry.id,
                            "key": entry.key,
                            "content": entry.content,
                            "summary": entry.summary,
                            "tags": entry.tags,
                            "assets": entry.assets,
                            "priority": entry.priority,
                            "enabled": entry.enabled,
                            "createdAt": entry.created_at,
                            "updatedAt": entry.updated_at,
                            "contentHash": entry.content_hash,
                            "recallId": meta.id,
                            "recallName": meta.name,
                        }));
                    }
                }
            }
            Value::Array(result)
        }
        "recall_update_entry_vector" => {
            let collection_id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            let entry_id = Uuid::parse_str(text(a, "entryId")?).map_err(error)?;
            let model_id = text(a, "model")?;
            let vector =
                decode::<Vec<f32>>(a.get("vector").ok_or_else(|| error("missing vector"))?)?;
            let tokens = a
                .get("tokens")
                .filter(|value| !value.is_null())
                .map(decode::<u32>)
                .transpose()?;
            let content_hash = repo
                .load_entry(collection_id, entry_id)
                .map_err(error)?
                .and_then(|entry| entry.content_hash);
            repo.upsert_entry_vector(
                collection_id,
                entry_id,
                model_id,
                &vector,
                tokens,
                content_hash.as_deref(),
                now(),
            )
            .map_err(error)?;
            if let Some((vectors, dimension, total_tokens)) = caches
                .loaded_vectors
                .lock()
                .map_err(error)?
                .get_mut(&(collection_id, model_id.to_string()))
            {
                if *dimension != vector.len() {
                    return Err(error("已加载向量维度与更新向量不匹配"));
                }
                if let Some((_, existing)) = vectors.iter_mut().find(|(id, _)| *id == entry_id) {
                    existing.clone_from(&vector);
                } else {
                    vectors.push((entry_id, vector.clone()));
                }
                *total_tokens = total_tokens.saturating_add(tokens.unwrap_or_default() as usize);
            }
            Value::Null
        }
        "recall_check_vector_coverage" => {
            let recall_ids = decode::<Vec<Uuid>>(
                a.get("recallIds")
                    .ok_or_else(|| error("missing recallIds"))?,
            )?;
            let model_id = text(a, "modelId")?;
            let mut total_entries = 0;
            let mut cached_entries = 0;
            let mut missing_map = Vec::new();
            for recall_id in recall_ids {
                let entries = repo.load_entries(recall_id).map_err(error)?;
                let vector_ids = repo
                    .load_vectors(recall_id, model_id)
                    .map_err(error)?
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
            json!({
                "totalEntries": total_entries,
                "cachedEntries": cached_entries,
                "missingEntries": missing_map.len(),
                "missingMap": missing_map,
                "estimatedTokens": 0
            })
        }
        "recall_clear_legacy_vectors" => {
            let recall_id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            let model_id = text(a, "currentModel")?;
            let deleted = repo
                .clear_vectors_except_model(Some(recall_id), model_id)
                .map_err(error)?;
            caches
                .loaded_vectors
                .lock()
                .map_err(error)?
                .retain(|(id, model), _| *id != recall_id || model == model_id);
            json!(deleted)
        }
        "recall_clear_all_other_vectors" => {
            let model_id = text(a, "keepModelId")?;
            let deleted = repo
                .clear_vectors_except_model(None, model_id)
                .map_err(error)?;
            caches
                .loaded_vectors
                .lock()
                .map_err(error)?
                .retain(|(_, model), _| model == model_id);
            json!(deleted)
        }
        "recall_load_model_vectors" => {
            let recall_id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
            let model_id = text(a, "modelId")?;
            let loaded = repo
                .load_vectors(recall_id, model_id)
                .map_err(error)?
                .unwrap_or_default();
            let (loaded_count, dimension) = (loaded.0.len(), loaded.1);
            caches
                .loaded_vectors
                .lock()
                .map_err(error)?
                .insert((recall_id, model_id.to_string()), loaded);
            json!({
                "loadedCount": loaded_count,
                "dimension": dimension,
                "modelId": model_id
            })
        }
        "recall_get_missing_tags" => {
            let model_id = text(a, "modelId")?;
            let tags = decode::<Vec<String>>(a.get("tags").ok_or_else(|| error("missing tags"))?)?;
            json!(cached_tag_pool(repo, caches, model_id)?.get_missing_tags(tags))
        }
        "recall_sync_tag_vectors" => {
            let model_id = text(a, "modelId")?.to_string();
            let pairs = decode::<Vec<(String, Vec<f32>)>>(
                a.get("data").ok_or_else(|| error("missing data"))?,
            )?;
            let mut pool = cached_tag_pool(repo, caches, &model_id)?;
            pool.sync_vectors(pairs);
            repo.save_tag_pool(&pool).map_err(error)?;
            caches
                .tag_pools
                .lock()
                .map_err(error)?
                .insert(model_id, pool);
            Value::Null
        }
        "recall_list_all_tags" => {
            let mut tags = cached_tag_pool(repo, caches, text(a, "modelId")?)?
                .registry
                .into_keys()
                .collect::<Vec<_>>();
            tags.sort();
            json!(tags)
        }
        "recall_get_tag_pool_stats" => {
            let pool = cached_tag_pool(repo, caches, text(a, "modelId")?)?;
            json!({
                "totalTags": pool.registry.len(),
                "vectorizedTags": pool.registry.len(),
                "tagPoolSize": (pool.vectors.len() * std::mem::size_of::<f32>()) as u64,
                "tagPoolDimension": pool.dimension
            })
        }
        "recall_rebuild_tag_pool_index" => {
            let model_id = text(a, "modelId")?.to_string();
            let mut pool = cached_tag_pool(repo, caches, &model_id)?;
            if pool.index.is_none() && !pool.registry.is_empty() {
                pool.rebuild_index();
            }
            repo.save_tag_pool(&pool).map_err(error)?;
            caches
                .tag_pools
                .lock()
                .map_err(error)?
                .insert(model_id, pool);
            Value::Null
        }
        "recall_clear_tag_pool" => {
            let model_id = text(a, "modelId")?.to_string();
            let pool = tag_pool::ModelTagPool::new(model_id.clone());
            repo.save_tag_pool(&pool).map_err(error)?;
            caches
                .tag_pools
                .lock()
                .map_err(error)?
                .insert(model_id, pool);
            Value::Null
        }
        "recall_list_tag_pool_models" => {
            json!(repo.list_tag_pool_models().map_err(error)?)
        }
        "recall_clear_other_tag_pools" => {
            let keep_model = text(a, "keepModelId")?;
            let models = repo.list_tag_pool_models().map_err(error)?;
            let removed = models
                .iter()
                .filter(|model| model.as_str() != keep_model)
                .cloned()
                .collect::<Vec<_>>();
            for model in &removed {
                repo.save_tag_pool(&tag_pool::ModelTagPool::new(model.clone()))
                    .map_err(error)?;
            }
            let mut pools = caches.tag_pools.lock().map_err(error)?;
            for model in &removed {
                pools.remove(model);
            }
            json!(removed.len())
        }
        "recall_get_embedding_cache" => {
            let key = embedding_cache_key(text(a, "modelId")?, text(a, "text")?);
            json!(caches
                .embedding_cache
                .lock()
                .map_err(error)?
                .get(&key)
                .map(|(vector, _)| vector.clone()))
        }
        "recall_set_embedding_cache" => {
            let key = embedding_cache_key(text(a, "modelId")?, text(a, "text")?);
            let vector =
                decode::<Vec<f32>>(a.get("vector").ok_or_else(|| error("missing vector"))?)?;
            let max_items = a
                .get("maxItems")
                .and_then(Value::as_u64)
                .unwrap_or_default() as usize;
            let mut cache = caches.embedding_cache.lock().map_err(error)?;
            if cache.len() >= max_items {
                let mut oldest = cache
                    .iter()
                    .map(|(key, (_, timestamp))| (key.clone(), *timestamp))
                    .collect::<Vec<_>>();
                oldest.sort_by_key(|(_, timestamp)| *timestamp);
                let delete_count = (max_items / 5).max(1);
                for (key, _) in oldest.iter().take(delete_count) {
                    cache.remove(key);
                }
            }
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            cache.insert(key, (vector, timestamp));
            Value::Null
        }
        "recall_clear_embedding_cache" => {
            caches.embedding_cache.lock().map_err(error)?.clear();
            Value::Null
        }
        _ => {
            return Err(error(format!(
                "Electron Recall command 尚未迁移: {command}"
            )))
        }
    };
    serde_json::to_string(&value).map_err(error)
}

fn cached_tag_pool(
    repo: &SqliteRecallRepository,
    caches: &RuntimeCaches,
    model_id: &str,
) -> Result<tag_pool::ModelTagPool> {
    if let Some(pool) = caches
        .tag_pools
        .lock()
        .map_err(error)?
        .get(model_id)
        .cloned()
    {
        return Ok(pool);
    }
    let pool = repo.load_tag_pool(model_id).map_err(error)?;
    caches
        .tag_pools
        .lock()
        .map_err(error)?
        .insert(model_id.to_string(), pool.clone());
    Ok(pool)
}

fn persist_batch_entries(
    repo: &SqliteRecallRepository,
    caches: &RuntimeCaches,
    id: Uuid,
    mut entries: Vec<RecallEntry>,
    deduplicate: bool,
    skipped_count: usize,
) -> Result<entry_import::BatchImportResult> {
    let existing_hashes = repo
        .load_entries(id)
        .map_err(error)?
        .into_iter()
        .filter_map(|entry| entry.content_hash)
        .collect::<std::collections::HashSet<_>>();
    let mut seen = existing_hashes;
    let mut duplicate_count = 0;
    entries.retain(|entry| {
        let Some(hash) = &entry.content_hash else {
            return true;
        };
        if !seen.insert(hash.clone()) && deduplicate {
            duplicate_count += 1;
            false
        } else {
            true
        }
    });
    repo.upsert_entries(id, &entries).map_err(error)?;
    invalidate_loaded_vectors(caches, id)?;

    Ok(entry_import::BatchImportResult {
        entries,
        skipped_count,
        duplicate_count,
    })
}

fn invalidate_loaded_vectors(caches: &RuntimeCaches, collection_id: Uuid) -> Result<()> {
    caches
        .loaded_vectors
        .lock()
        .map_err(error)?
        .retain(|(id, _), _| *id != collection_id);
    Ok(())
}

fn embedding_cache_key(model_id: &str, text: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(model_id.as_bytes());
    hasher.update(b"|");
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

use utils::{
    extract_tags_from_content as extract_tags, extract_title_from_content as extract_title,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dispatch_persists_collection_entries_and_deduplicates_batch_imports() {
        let directory = tempfile::tempdir().unwrap();
        let repository = SqliteRecallRepository::new(directory.path());
        repository.initialize().unwrap();
        let collection_id = Uuid::new_v4();
        let meta = json!({
            "id": collection_id,
            "name": "Recall bridge",
            "description": null,
            "author": null,
            "icon": null,
            "tags": [],
            "config": {},
            "createdAt": 1,
            "updatedAt": 1,
            "vectorization": {
                "isIndexed": false,
                "lastIndexedAt": null,
                "modelUsed": "",
                "dimension": 0,
                "totalTokens": 0
            },
            "models": [],
            "entries": []
        });
        dispatch(
            &repository,
            "recall_save_base_meta",
            &json!({"recallId": collection_id, "meta": meta}),
        )
        .unwrap();

        let entry_id = Uuid::new_v4();
        let entry = json!({
            "id": entry_id,
            "key": "Bridge entry",
            "content": "A persisted Recall entry.",
            "summary": "",
            "tags": [],
            "assets": [],
            "priority": 100,
            "enabled": true,
            "createdAt": 1,
            "updatedAt": 1,
            "contentHash": null
        });
        let saved: Value = serde_json::from_str(
            &dispatch(
                &repository,
                "recall_upsert_entry",
                &json!({"recallId": collection_id, "entry": entry}),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(saved["summary"], "A persisted Recall entry.");
        assert_eq!(saved["contentHash"].as_str().unwrap().len(), 64);

        let loaded: Value = serde_json::from_str(
            &dispatch(
                &repository,
                "recall_load_entry",
                &json!({"recallId": collection_id, "entryId": entry_id}),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(loaded["key"], "Bridge entry");

        let first_id = Uuid::new_v4();
        let second_id = Uuid::new_v4();
        let duplicate_entry = |id| {
            json!({
                "id": id,
                "key": "duplicate",
                "content": "same content",
                "summary": "same content",
                "tags": [],
                "assets": [],
                "priority": 100,
                "enabled": true,
                "createdAt": 1,
                "updatedAt": 1,
                "contentHash": null
            })
        };
        let batch: Value = serde_json::from_str(
            &dispatch(
                &repository,
                "recall_batch_upsert_entries",
                &json!({
                    "recallId": collection_id,
                    "entries": [duplicate_entry(first_id), duplicate_entry(second_id)],
                    "deduplicate": true
                }),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(batch["entries"].as_array().unwrap().len(), 1);
        assert_eq!(batch["duplicateCount"], 1);
    }

    #[test]
    fn vector_commands_report_coverage_and_clear_only_unselected_models() {
        let directory = tempfile::tempdir().unwrap();
        let repository = SqliteRecallRepository::new(directory.path());
        repository.initialize().unwrap();
        let collection_id = Uuid::new_v4();
        let meta = json!({
            "id": collection_id,
            "name": "Vector coverage",
            "description": null,
            "author": null,
            "icon": null,
            "tags": [],
            "config": {},
            "createdAt": 1,
            "updatedAt": 1,
            "vectorization": {
                "isIndexed": false,
                "lastIndexedAt": null,
                "modelUsed": "",
                "dimension": 0,
                "totalTokens": 0
            },
            "models": [],
            "entries": []
        });
        dispatch(
            &repository,
            "recall_save_base_meta",
            &json!({"recallId": collection_id, "meta": meta}),
        )
        .unwrap();

        let first_id = Uuid::new_v4();
        let second_id = Uuid::new_v4();
        let make_entry = |id: Uuid| {
            json!({
                "id": id,
                "key": id.to_string(),
                "content": "vectorized content",
                "summary": "vectorized content",
                "tags": [],
                "assets": [],
                "priority": 100,
                "enabled": true,
                "createdAt": 1,
                "updatedAt": 1,
                "contentHash": null
            })
        };
        dispatch(
            &repository,
            "recall_upsert_entry",
            &json!({"recallId": collection_id, "entry": make_entry(first_id)}),
        )
        .unwrap();
        dispatch(
            &repository,
            "recall_upsert_entry",
            &json!({"recallId": collection_id, "entry": make_entry(second_id)}),
        )
        .unwrap();

        for model in ["keep-model", "old-model"] {
            dispatch(
                &repository,
                "recall_update_entry_vector",
                &json!({
                    "recallId": collection_id,
                    "entryId": first_id,
                    "vector": [0.25, 0.75],
                    "model": model,
                    "tokens": 12
                }),
            )
            .unwrap();
        }
        let caches = RuntimeCaches::default();
        let loaded: Value = serde_json::from_str(
            &dispatch_with_caches(
                &repository,
                &caches,
                "recall_load_model_vectors",
                &json!({"recallId": collection_id, "modelId": "keep-model"}),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(loaded["loadedCount"], 1);
        assert_eq!(loaded["dimension"], 2);
        assert_eq!(
            caches.loaded_vectors.lock().unwrap()[&(collection_id, "keep-model".to_string())]
                .0
                .len(),
            1
        );

        let coverage: Value = serde_json::from_str(
            &dispatch(
                &repository,
                "recall_check_vector_coverage",
                &json!({"recallIds": [collection_id], "modelId": "keep-model"}),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(coverage["totalEntries"], 2);
        assert_eq!(coverage["cachedEntries"], 1);
        assert_eq!(coverage["missingEntries"], 1);
        assert_eq!(coverage["missingMap"][0][0], collection_id.to_string());
        assert_eq!(coverage["missingMap"][0][1], second_id.to_string());

        let updated: Value = serde_json::from_str(
            &dispatch(
                &repository,
                "recall_load_entry",
                &json!({"recallId": collection_id, "entryId": first_id}),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(updated["contentHash"].as_str().unwrap().len(), 64);

        let deleted: u32 = serde_json::from_str(
            &dispatch_with_caches(
                &repository,
                &caches,
                "recall_clear_legacy_vectors",
                &json!({"recallId": collection_id, "currentModel": "keep-model"}),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(deleted, 1);
        assert!(repository
            .load_vectors(collection_id, "keep-model")
            .unwrap()
            .is_some());
        assert!(repository
            .load_vectors(collection_id, "old-model")
            .unwrap()
            .is_none());
        assert!(!caches
            .loaded_vectors
            .lock()
            .unwrap()
            .contains_key(&(collection_id, "old-model".to_string())));

        let mut edited = repository
            .load_entry(collection_id, first_id)
            .unwrap()
            .unwrap();
        edited.content.push_str(" updated");
        dispatch_with_caches(
            &repository,
            &caches,
            "recall_upsert_entry",
            &json!({"recallId": collection_id, "entry": edited}),
        )
        .unwrap();
        assert!(repository
            .load_vectors(collection_id, "keep-model")
            .unwrap()
            .is_none());
        assert!(!caches
            .loaded_vectors
            .lock()
            .unwrap()
            .contains_key(&(collection_id, "keep-model".to_string())));
    }

    #[test]
    fn tag_pool_commands_merge_vectors_and_survive_runtime_warmup() {
        let directory = tempfile::tempdir().unwrap();
        let repository = SqliteRecallRepository::new(directory.path());
        repository.initialize().unwrap();
        let caches = RuntimeCaches::default();
        dispatch_with_caches(
            &repository,
            &caches,
            "recall_sync_tag_vectors",
            &json!({"modelId": "embedding-a", "data": [["rust", [1.0, 0.0]], ["sqlite", [0.0, 1.0]]]}),
        )
        .unwrap();
        dispatch_with_caches(
            &repository,
            &caches,
            "recall_sync_tag_vectors",
            &json!({"modelId": "embedding-a", "data": [["rust", [0.5, 0.5]], ["electron", [0.8, 0.2]]]}),
        )
        .unwrap();

        let tags: Value = serde_json::from_str(
            &dispatch_with_caches(
                &repository,
                &caches,
                "recall_list_all_tags",
                &json!({"modelId": "embedding-a"}),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(tags, json!(["electron", "rust", "sqlite"]));
        let missing: Value = serde_json::from_str(
            &dispatch_with_caches(
                &repository,
                &caches,
                "recall_get_missing_tags",
                &json!({"modelId": "embedding-a", "tags": ["rust", "vue"]}),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(missing, json!(["vue"]));
        let stats: Value = serde_json::from_str(
            &dispatch_with_caches(
                &repository,
                &caches,
                "recall_get_tag_pool_stats",
                &json!({"modelId": "embedding-a"}),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(stats["totalTags"], 3);
        assert_eq!(stats["tagPoolDimension"], 2);
        assert_eq!(stats["tagPoolSize"], 24);

        dispatch_with_caches(
            &repository,
            &caches,
            "recall_rebuild_tag_pool_index",
            &json!({"modelId": "embedding-a"}),
        )
        .unwrap();
        assert!(caches.tag_pools.lock().unwrap()["embedding-a"]
            .index
            .is_some());

        let restarted_caches = RuntimeCaches::default();
        dispatch_with_caches(&repository, &restarted_caches, "recall_warmup", &json!({})).unwrap();
        assert_eq!(
            restarted_caches.tag_pools.lock().unwrap()["embedding-a"]
                .registry
                .len(),
            3
        );

        dispatch_with_caches(
            &repository,
            &caches,
            "recall_clear_other_tag_pools",
            &json!({"keepModelId": "embedding-b"}),
        )
        .unwrap();
        assert!(repository.list_tag_pool_models().unwrap().is_empty());

        dispatch_with_caches(
            &repository,
            &caches,
            "recall_set_embedding_cache",
            &json!({
                "modelId": "embedding-a",
                "text": "same prompt",
                "vector": [0.1, 0.9],
                "maxItems": 10
            }),
        )
        .unwrap();
        let cached: Value = serde_json::from_str(
            &dispatch_with_caches(
                &repository,
                &caches,
                "recall_get_embedding_cache",
                &json!({"modelId": "embedding-a", "text": "same prompt"}),
            )
            .unwrap(),
        )
        .unwrap();
        let cached_vector = cached.as_array().unwrap();
        assert!((cached_vector[0].as_f64().unwrap() - 0.1).abs() < 1e-6);
        assert!((cached_vector[1].as_f64().unwrap() - 0.9).abs() < 1e-6);
        let isolated: Value = serde_json::from_str(
            &dispatch_with_caches(
                &repository,
                &caches,
                "recall_get_embedding_cache",
                &json!({"modelId": "embedding-b", "text": "same prompt"}),
            )
            .unwrap(),
        )
        .unwrap();
        assert!(isolated.is_null());
        dispatch_with_caches(
            &repository,
            &caches,
            "recall_clear_embedding_cache",
            &json!({}),
        )
        .unwrap();
        let cleared: Value = serde_json::from_str(
            &dispatch_with_caches(
                &repository,
                &caches,
                "recall_get_embedding_cache",
                &json!({"modelId": "embedding-a", "text": "same prompt"}),
            )
            .unwrap(),
        )
        .unwrap();
        assert!(cleared.is_null());
    }
}
