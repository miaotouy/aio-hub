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

use super::migrations::{apply_main_migrations, apply_vector_migrations};
use super::repository::{LoadedVectors, RecallRepository};
use super::vector_blob::{decode_vector, encode_vector};
use crate::recall::core::{RecallCollection, RecallCollectionMeta, RecallEntry, VectorizationMeta};
use crate::recall::tag_pool::ModelTagPool;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::de::DeserializeOwned;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct SqliteRecallRepository {
    recall_root: PathBuf,
    main_db: PathBuf,
    vector_db: PathBuf,
}

pub(crate) struct LegacyImportStateRecord<'a> {
    pub source_id: &'a str,
    pub source_path: &'a str,
    pub source_fingerprint: Option<&'a str>,
    pub status: &'a str,
    pub report_json: &'a str,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub updated_at: i64,
}

impl SqliteRecallRepository {
    pub fn new(app_data_dir: impl AsRef<Path>) -> Self {
        let recall_root = app_data_dir.as_ref().join("recall");
        Self {
            main_db: recall_root.join("recall.db"),
            vector_db: recall_root.join("recall-vectors.db"),
            recall_root,
        }
    }

    fn open_main(&self) -> Result<Connection, String> {
        let connection = Connection::open(&self.main_db)
            .map_err(|error| format!("打开 Recall 主库失败: {error}"))?;
        configure_connection(connection)
    }

    fn open_vectors(&self) -> Result<Connection, String> {
        let connection = Connection::open(&self.vector_db)
            .map_err(|error| format!("打开 Recall 向量库失败: {error}"))?;
        configure_connection(connection)
    }

    pub fn record_legacy_import_state(
        &self,
        vector_database: bool,
        record: LegacyImportStateRecord<'_>,
    ) -> Result<(), String> {
        let connection = if vector_database {
            self.open_vectors()?
        } else {
            self.open_main()?
        };
        connection
            .execute(
                "INSERT INTO legacy_import_state(
                    source_id, source_path, source_fingerprint, status, report_json,
                    started_at, completed_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(source_id) DO UPDATE SET
                    source_path = excluded.source_path,
                    source_fingerprint = excluded.source_fingerprint,
                    status = excluded.status,
                    report_json = excluded.report_json,
                    started_at = excluded.started_at,
                    completed_at = excluded.completed_at,
                    updated_at = excluded.updated_at",
                params![
                    record.source_id,
                    record.source_path,
                    record.source_fingerprint,
                    record.status,
                    record.report_json,
                    record.started_at,
                    record.completed_at,
                    record.updated_at,
                ],
            )
            .map_err(|error| format!("记录 Recall 迁移状态失败: {error}"))?;
        Ok(())
    }

    pub fn legacy_import_is_completed(
        &self,
        vector_database: bool,
        source_id: &str,
        source_fingerprint: &str,
    ) -> Result<bool, String> {
        let connection = if vector_database {
            self.open_vectors()?
        } else {
            self.open_main()?
        };
        connection
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM legacy_import_state
                    WHERE source_id = ?1 AND source_fingerprint = ?2 AND status = 'completed'
                )",
                params![source_id, source_fingerprint],
                |row| row.get(0),
            )
            .map_err(|error| format!("读取 Recall 迁移状态失败: {error}"))
    }

    pub fn load_legacy_import_report(
        &self,
        vector_database: bool,
        source_id: &str,
        source_fingerprint: &str,
    ) -> Result<Option<String>, String> {
        let connection = if vector_database {
            self.open_vectors()?
        } else {
            self.open_main()?
        };
        connection
            .query_row(
                "SELECT report_json FROM legacy_import_state
                 WHERE source_id = ?1 AND source_fingerprint = ?2 AND status = 'completed'",
                params![source_id, source_fingerprint],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| format!("读取 Recall 迁移报告失败: {error}"))
    }

    pub fn clear_legacy_import_state(&self, source_id: &str) -> Result<(), String> {
        for vector_database in [false, true] {
            let connection = if vector_database {
                self.open_vectors()?
            } else {
                self.open_main()?
            };
            connection
                .execute(
                    "DELETE FROM legacy_import_state WHERE source_id = ?1",
                    [source_id],
                )
                .map_err(|error| format!("重置 Recall 迁移状态失败: {error}"))?;
        }
        Ok(())
    }

    fn load_collection_row(
        connection: &Connection,
        collection_id: Uuid,
    ) -> Result<Option<CollectionRow>, String> {
        connection
            .query_row(
                "SELECT id, name, description, author, icon, tags_json, config_json,
                        created_at, updated_at, active_model_id, active_model_last_indexed_at
                 FROM recall_collections WHERE id = ?1",
                [collection_id.to_string()],
                CollectionRow::from_row,
            )
            .optional()
            .map_err(|error| format!("读取 Recall 集合失败: {error}"))
    }

    fn collection_meta(
        &self,
        connection: &Connection,
        row: CollectionRow,
    ) -> Result<RecallCollectionMeta, String> {
        let entries = self.load_entries_from(connection, row.id)?;
        let vector_models = self.load_collection_models(row.id)?;
        let active_model =
            if !row.active_model_id.is_empty() && vector_models.contains(&row.active_model_id) {
                row.active_model_id
            } else {
                vector_models.first().cloned().unwrap_or_default()
            };
        let active_stats = self.load_model_stats(row.id, &active_model)?;
        let vectorization = VectorizationMeta {
            is_indexed: active_stats.is_some(),
            last_indexed_at: active_stats
                .as_ref()
                .and_then(|stats| stats.2)
                .or(row.active_model_last_indexed_at),
            model_used: active_model,
            dimension: active_stats.as_ref().map_or(0, |stats| stats.0),
            total_tokens: active_stats.map_or(0, |stats| stats.1),
        };

        let mut meta = RecallCollectionMeta {
            id: row.id,
            name: row.name,
            description: row.description,
            created_at: row.created_at,
            updated_at: row.updated_at,
            author: row.author,
            vectorization,
            models: vector_models,
            tags: decode_json(&row.tags_json, "集合标签")?,
            icon: row.icon,
            entries: Vec::new(),
            config: decode_json(&row.config_json, "集合配置")?,
        };

        for entry in entries {
            let (models, tokens) = self.load_entry_vector_state(entry.id, &entry.content_hash)?;
            let status = if models.is_empty() {
                "none".to_string()
            } else {
                "ready".to_string()
            };
            meta.entries
                .push(entry.to_index_item(status, models, tokens));
        }
        Ok(meta)
    }

    fn load_entries_from(
        &self,
        connection: &Connection,
        collection_id: Uuid,
    ) -> Result<Vec<RecallEntry>, String> {
        let mut statement = connection
            .prepare(
                "SELECT id, key, content, summary, tags_json, assets_json, priority, enabled,
                        content_hash, created_at, updated_at
                 FROM recall_entries WHERE collection_id = ?1 ORDER BY updated_at DESC, id",
            )
            .map_err(|error| format!("准备 Recall 条目查询失败: {error}"))?;
        let rows = statement
            .query_map([collection_id.to_string()], EntryRow::from_row)
            .map_err(|error| format!("查询 Recall 条目失败: {error}"))?;

        rows.map(|row| {
            row.map_err(|error| format!("读取 Recall 条目失败: {error}"))?
                .into_entry()
        })
        .collect()
    }

    fn load_collection_models(&self, collection_id: Uuid) -> Result<Vec<String>, String> {
        let connection = self.open_vectors()?;
        let mut statement = connection
            .prepare(
                "SELECT model_id FROM recall_models WHERE collection_id = ?1
                 ORDER BY last_indexed_at DESC, model_id",
            )
            .map_err(|error| format!("准备 Recall 模型查询失败: {error}"))?;
        let models = statement
            .query_map([collection_id.to_string()], |row| row.get(0))
            .map_err(|error| format!("查询 Recall 模型失败: {error}"))?
            .map(|row| row.map_err(|error| format!("读取 Recall 模型失败: {error}")))
            .collect();
        models
    }

    fn load_model_stats(
        &self,
        collection_id: Uuid,
        model_id: &str,
    ) -> Result<Option<(usize, u64, Option<i64>)>, String> {
        if model_id.is_empty() {
            return Ok(None);
        }
        let connection = self.open_vectors()?;
        connection
            .query_row(
                "SELECT dimension, total_tokens, last_indexed_at
                 FROM recall_models WHERE collection_id = ?1 AND model_id = ?2",
                params![collection_id.to_string(), model_id],
                |row| {
                    let dimension = row.get::<_, i64>(0)?;
                    let total_tokens = row.get::<_, i64>(1)?;
                    Ok((
                        dimension.max(0) as usize,
                        total_tokens.max(0) as u64,
                        row.get(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| format!("读取 Recall 活动模型统计失败: {error}"))
    }

    fn load_entry_vector_state(
        &self,
        entry_id: Uuid,
        content_hash: &Option<String>,
    ) -> Result<(Vec<String>, u32), String> {
        let connection = self.open_vectors()?;
        let mut statement = connection
            .prepare(
                "SELECT model_id, tokens, content_hash
                 FROM recall_entry_vectors WHERE entry_id = ?1 ORDER BY model_id",
            )
            .map_err(|error| format!("准备条目向量状态查询失败: {error}"))?;
        let mut models = Vec::new();
        let mut tokens = 0_u32;
        let rows = statement
            .query_map([entry_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(|error| format!("查询条目向量状态失败: {error}"))?;
        for row in rows {
            let (model, row_tokens, row_hash) =
                row.map_err(|error| format!("读取条目向量状态失败: {error}"))?;
            if row_hash.as_ref() == content_hash.as_ref() {
                models.push(model);
                tokens = tokens.saturating_add(row_tokens.max(0) as u32);
            }
        }
        Ok((models, tokens))
    }

    fn upsert_entries_transaction(
        transaction: &Transaction<'_>,
        collection_id: Uuid,
        entries: &[RecallEntry],
    ) -> Result<(), String> {
        let collection_id = collection_id.to_string();
        for entry in entries {
            let tags_json =
                serde_json::to_string(&entry.tags).map_err(|error| error.to_string())?;
            let assets_json =
                serde_json::to_string(&entry.assets).map_err(|error| error.to_string())?;
            transaction
                .execute(
                    "INSERT INTO recall_entries(
                        id, collection_id, key, content, summary, tags_json, assets_json,
                        priority, enabled, content_hash, created_at, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                     ON CONFLICT(id) DO UPDATE SET
                        collection_id = excluded.collection_id,
                        key = excluded.key,
                        content = excluded.content,
                        summary = excluded.summary,
                        tags_json = excluded.tags_json,
                        assets_json = excluded.assets_json,
                        priority = excluded.priority,
                        enabled = excluded.enabled,
                        content_hash = excluded.content_hash,
                        created_at = excluded.created_at,
                        updated_at = excluded.updated_at",
                    params![
                        entry.id.to_string(),
                        collection_id,
                        entry.key,
                        entry.content,
                        entry.summary,
                        tags_json,
                        assets_json,
                        entry.priority,
                        entry.enabled,
                        entry.content_hash,
                        entry.created_at,
                        entry.updated_at,
                    ],
                )
                .map_err(|error| format!("写入 Recall 条目 {} 失败: {error}", entry.id))?;
        }
        Ok(())
    }
}

impl RecallRepository for SqliteRecallRepository {
    fn initialize(&self) -> Result<(), String> {
        std::fs::create_dir_all(&self.recall_root)
            .map_err(|error| format!("创建 Recall 数据目录失败: {error}"))?;
        let mut main = self.open_main()?;
        apply_main_migrations(&mut main)?;
        let mut vectors = self.open_vectors()?;
        apply_vector_migrations(&mut vectors)
    }

    fn main_db_path(&self) -> &Path {
        &self.main_db
    }

    fn vector_db_path(&self) -> &Path {
        &self.vector_db
    }

    fn list_collections(&self) -> Result<Vec<RecallCollectionMeta>, String> {
        let connection = self.open_main()?;
        let mut statement = connection
            .prepare(
                "SELECT id, name, description, author, icon, tags_json, config_json,
                        created_at, updated_at, active_model_id, active_model_last_indexed_at
                 FROM recall_collections ORDER BY updated_at DESC, id",
            )
            .map_err(|error| format!("准备 Recall 集合列表失败: {error}"))?;
        let rows = statement
            .query_map([], CollectionRow::from_row)
            .map_err(|error| format!("查询 Recall 集合列表失败: {error}"))?;
        rows.map(|row| {
            let row = row.map_err(|error| format!("读取 Recall 集合失败: {error}"))?;
            self.collection_meta(&connection, row)
        })
        .collect()
    }

    fn load_collection(&self, collection_id: Uuid) -> Result<Option<RecallCollection>, String> {
        let connection = self.open_main()?;
        let Some(row) = Self::load_collection_row(&connection, collection_id)? else {
            return Ok(None);
        };
        let meta = self.collection_meta(&connection, row)?;
        let entries = self.load_entries_from(&connection, collection_id)?;
        Ok(Some(RecallCollection { meta, entries }))
    }

    fn save_collection(&self, collection: &RecallCollection) -> Result<(), String> {
        let old_entries = self
            .load_entries(collection.meta.id)?
            .into_iter()
            .map(|entry| (entry.id, entry.content_hash))
            .collect::<std::collections::HashMap<_, _>>();
        let mut connection = self.open_main()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Recall 集合事务失败: {error}"))?;
        let meta = &collection.meta;
        let tags_json = serde_json::to_string(&meta.tags).map_err(|error| error.to_string())?;
        let config_json = serde_json::to_string(&meta.config).map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO recall_collections(
                    id, name, description, author, icon, tags_json, config_json,
                    created_at, updated_at, active_model_id, active_model_last_indexed_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    description = excluded.description,
                    author = excluded.author,
                    icon = excluded.icon,
                    tags_json = excluded.tags_json,
                    config_json = excluded.config_json,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    active_model_id = excluded.active_model_id,
                    active_model_last_indexed_at = excluded.active_model_last_indexed_at",
                params![
                    meta.id.to_string(),
                    meta.name,
                    meta.description,
                    meta.author,
                    meta.icon,
                    tags_json,
                    config_json,
                    meta.created_at,
                    meta.updated_at,
                    meta.vectorization.model_used,
                    meta.vectorization.last_indexed_at,
                ],
            )
            .map_err(|error| format!("写入 Recall 集合失败: {error}"))?;
        transaction
            .execute(
                "DELETE FROM recall_entries WHERE collection_id = ?1",
                [meta.id.to_string()],
            )
            .map_err(|error| format!("清理 Recall 集合旧条目失败: {error}"))?;
        Self::upsert_entries_transaction(&transaction, meta.id, &collection.entries)?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Recall 集合事务失败: {error}"))?;
        let stale_entry_ids = old_entries
            .into_iter()
            .filter_map(|(entry_id, old_hash)| {
                let replacement = collection.entries.iter().find(|entry| entry.id == entry_id);
                match replacement {
                    Some(entry) if entry.content_hash == old_hash => None,
                    _ => Some(entry_id),
                }
            })
            .collect::<Vec<_>>();
        self.delete_vectors_for_entries(collection.meta.id, &stale_entry_ids)?;
        Ok(())
    }

    fn delete_collection(&self, collection_id: Uuid) -> Result<(), String> {
        let main = self.open_main()?;
        main.execute(
            "DELETE FROM recall_collections WHERE id = ?1",
            [collection_id.to_string()],
        )
        .map_err(|error| format!("删除 Recall 集合失败: {error}"))?;
        let mut vectors = self.open_vectors()?;
        let transaction = vectors
            .transaction()
            .map_err(|error| format!("开启 Recall 向量清理事务失败: {error}"))?;
        transaction
            .execute(
                "DELETE FROM recall_entry_vectors WHERE collection_id = ?1",
                [collection_id.to_string()],
            )
            .map_err(|error| format!("清理 Recall 集合向量失败: {error}"))?;
        transaction
            .execute(
                "DELETE FROM recall_models WHERE collection_id = ?1",
                [collection_id.to_string()],
            )
            .map_err(|error| format!("清理 Recall 集合模型统计失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Recall 向量清理失败: {error}"))
    }

    fn load_entries(&self, collection_id: Uuid) -> Result<Vec<RecallEntry>, String> {
        let connection = self.open_main()?;
        self.load_entries_from(&connection, collection_id)
    }

    fn load_entry(
        &self,
        collection_id: Uuid,
        entry_id: Uuid,
    ) -> Result<Option<RecallEntry>, String> {
        let connection = self.open_main()?;
        connection
            .query_row(
                "SELECT id, key, content, summary, tags_json, assets_json, priority, enabled,
                        content_hash, created_at, updated_at
                 FROM recall_entries WHERE collection_id = ?1 AND id = ?2",
                params![collection_id.to_string(), entry_id.to_string()],
                EntryRow::from_row,
            )
            .optional()
            .map_err(|error| format!("读取 Recall 条目失败: {error}"))?
            .map(EntryRow::into_entry)
            .transpose()
    }

    fn upsert_entry(&self, collection_id: Uuid, entry: &RecallEntry) -> Result<(), String> {
        self.upsert_entries(collection_id, std::slice::from_ref(entry))
    }

    fn upsert_entries(&self, collection_id: Uuid, entries: &[RecallEntry]) -> Result<(), String> {
        let old_hashes = self
            .load_entries(collection_id)?
            .into_iter()
            .map(|entry| (entry.id, entry.content_hash))
            .collect::<std::collections::HashMap<_, _>>();
        let mut connection = self.open_main()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Recall 条目事务失败: {error}"))?;
        Self::upsert_entries_transaction(&transaction, collection_id, entries)?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Recall 条目事务失败: {error}"))?;
        let changed_entry_ids = entries
            .iter()
            .filter(|entry| old_hashes.get(&entry.id) != Some(&entry.content_hash))
            .map(|entry| entry.id)
            .collect::<Vec<_>>();
        self.delete_vectors_for_entries(collection_id, &changed_entry_ids)?;
        Ok(())
    }

    fn delete_entries(&self, collection_id: Uuid, entry_ids: &[Uuid]) -> Result<(), String> {
        if entry_ids.is_empty() {
            return Ok(());
        }
        let placeholders = std::iter::repeat_n("?", entry_ids.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "DELETE FROM recall_entries WHERE collection_id = ?1 AND id IN ({placeholders})"
        );
        let mut connection = self.open_main()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Recall 条目删除事务失败: {error}"))?;
        let mut values = Vec::with_capacity(entry_ids.len() + 1);
        values.push(collection_id.to_string());
        values.extend(entry_ids.iter().map(Uuid::to_string));
        let refs = values.iter().map(String::as_str).collect::<Vec<_>>();
        transaction
            .execute(&sql, rusqlite::params_from_iter(refs))
            .map_err(|error| format!("删除 Recall 条目失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Recall 条目删除失败: {error}"))?;
        self.delete_vectors_for_entries(collection_id, entry_ids)
    }

    fn upsert_entry_vector(
        &self,
        collection_id: Uuid,
        entry_id: Uuid,
        model_id: &str,
        vector: &[f32],
        tokens: Option<u32>,
        content_hash: Option<&str>,
        updated_at: i64,
    ) -> Result<(), String> {
        if model_id.trim().is_empty() {
            return Err("向量模型 ID 不能为空".to_string());
        }
        let dimension = vector.len();
        if dimension == 0 {
            return Err("向量不能为空".to_string());
        }
        let mut connection = self.open_vectors()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Recall 向量事务失败: {error}"))?;
        let existing_dimension = transaction
            .query_row(
                "SELECT dimension FROM recall_entry_vectors
                 WHERE collection_id = ?1 AND model_id = ?2 LIMIT 1",
                params![collection_id.to_string(), model_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|error| format!("读取 Recall 模型维度失败: {error}"))?;
        if existing_dimension.is_some_and(|value| value != dimension as i64) {
            return Err(format!(
                "同一集合与模型的向量维度不一致: expected {}, got {}",
                existing_dimension.unwrap_or_default(),
                dimension
            ));
        }
        transaction
            .execute(
                "INSERT INTO recall_entry_vectors(
                    collection_id, entry_id, model_id, dimension, vector_blob,
                    tokens, content_hash, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(collection_id, entry_id, model_id) DO UPDATE SET
                    dimension = excluded.dimension,
                    vector_blob = excluded.vector_blob,
                    tokens = excluded.tokens,
                    content_hash = excluded.content_hash,
                    updated_at = excluded.updated_at",
                params![
                    collection_id.to_string(),
                    entry_id.to_string(),
                    model_id,
                    dimension as i64,
                    encode_vector(vector),
                    tokens.unwrap_or_default() as i64,
                    content_hash,
                    updated_at,
                ],
            )
            .map_err(|error| format!("写入 Recall 条目向量失败: {error}"))?;
        transaction
            .execute(
                "INSERT INTO recall_models(collection_id, model_id, dimension, total_tokens, last_indexed_at)
                 SELECT collection_id, model_id, MAX(dimension), COALESCE(SUM(tokens), 0), MAX(updated_at)
                 FROM recall_entry_vectors WHERE collection_id = ?1 AND model_id = ?2
                 GROUP BY collection_id, model_id
                 ON CONFLICT(collection_id, model_id) DO UPDATE SET
                    dimension = excluded.dimension,
                    total_tokens = excluded.total_tokens,
                    last_indexed_at = excluded.last_indexed_at",
                params![collection_id.to_string(), model_id],
            )
            .map_err(|error| format!("更新 Recall 模型统计失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Recall 向量事务失败: {error}"))
    }

    fn load_vectors(
        &self,
        collection_id: Uuid,
        model_id: &str,
    ) -> Result<Option<LoadedVectors>, String> {
        let connection = self.open_vectors()?;
        let mut statement = connection
            .prepare(
                "SELECT entry_id, dimension, vector_blob, tokens
                 FROM recall_entry_vectors
                 WHERE collection_id = ?1 AND model_id = ?2 ORDER BY entry_id",
            )
            .map_err(|error| format!("准备 Recall 向量查询失败: {error}"))?;
        let rows = statement
            .query_map(params![collection_id.to_string(), model_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, Vec<u8>>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .map_err(|error| format!("查询 Recall 向量失败: {error}"))?;
        let mut loaded = Vec::new();
        let mut dimension = None;
        let mut tokens = 0_usize;
        for row in rows {
            let (entry_id, row_dimension, blob, row_tokens) =
                row.map_err(|error| format!("读取 Recall 向量失败: {error}"))?;
            let row_dimension = usize::try_from(row_dimension)
                .map_err(|_| format!("向量维度无效: {row_dimension}"))?;
            if dimension.is_some_and(|value| value != row_dimension) {
                return Err(format!("同一模型存在不一致向量维度: {model_id}"));
            }
            dimension = Some(row_dimension);
            let entry_id = Uuid::parse_str(&entry_id)
                .map_err(|error| format!("向量 entry ID 无效 {entry_id}: {error}"))?;
            loaded.push((entry_id, decode_vector(&blob, row_dimension)?));
            tokens = tokens.saturating_add(row_tokens.max(0) as usize);
        }
        Ok((!loaded.is_empty()).then_some((loaded, dimension.unwrap_or_default(), tokens)))
    }

    fn delete_vectors_for_entries(
        &self,
        collection_id: Uuid,
        entry_ids: &[Uuid],
    ) -> Result<(), String> {
        if entry_ids.is_empty() {
            return Ok(());
        }
        let placeholders = std::iter::repeat_n("?", entry_ids.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "DELETE FROM recall_entry_vectors WHERE collection_id = ?1 AND entry_id IN ({placeholders})"
        );
        let mut connection = self.open_vectors()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Recall 向量清理事务失败: {error}"))?;
        let mut values = Vec::with_capacity(entry_ids.len() + 1);
        values.push(collection_id.to_string());
        values.extend(entry_ids.iter().map(Uuid::to_string));
        let refs = values.iter().map(String::as_str).collect::<Vec<_>>();
        transaction
            .execute(&sql, rusqlite::params_from_iter(refs))
            .map_err(|error| format!("清理 Recall 条目向量失败: {error}"))?;
        transaction
            .execute(
                "DELETE FROM recall_models
                 WHERE collection_id = ?1
                   AND NOT EXISTS(
                     SELECT 1 FROM recall_entry_vectors v
                     WHERE v.collection_id = recall_models.collection_id
                       AND v.model_id = recall_models.model_id
                   )",
                [collection_id.to_string()],
            )
            .map_err(|error| format!("清理 Recall 模型统计失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Recall 向量清理失败: {error}"))
    }

    fn clear_vectors_except_model(
        &self,
        collection_id: Option<Uuid>,
        keep_model_id: &str,
    ) -> Result<u32, String> {
        let mut connection = self.open_vectors()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Recall 模型清理事务失败: {error}"))?;
        let deleted = if let Some(collection_id) = collection_id {
            transaction
                .execute(
                    "DELETE FROM recall_entry_vectors WHERE collection_id = ?1 AND model_id <> ?2",
                    params![collection_id.to_string(), keep_model_id],
                )
                .map_err(|error| format!("清理 Recall 向量失败: {error}"))?
        } else {
            transaction
                .execute(
                    "DELETE FROM recall_entry_vectors WHERE model_id <> ?1",
                    [keep_model_id],
                )
                .map_err(|error| format!("清理 Recall 向量失败: {error}"))?
        };
        transaction
            .execute(
                "DELETE FROM recall_models
                 WHERE NOT EXISTS(
                   SELECT 1 FROM recall_entry_vectors v
                   WHERE v.collection_id = recall_models.collection_id
                     AND v.model_id = recall_models.model_id
                 )",
                [],
            )
            .map_err(|error| format!("清理 Recall 模型索引失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Recall 模型清理失败: {error}"))?;
        Ok(deleted as u32)
    }

    fn load_tag_pool(&self, model_id: &str) -> Result<ModelTagPool, String> {
        let connection = self.open_vectors()?;
        let mut statement = connection
            .prepare(
                "SELECT tag, tag_index, dimension, vector_blob
                 FROM recall_tag_vectors WHERE model_id = ?1 ORDER BY tag_index",
            )
            .map_err(|error| format!("准备 Recall 标签池查询失败: {error}"))?;
        let rows = statement
            .query_map([model_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, Vec<u8>>(3)?,
                ))
            })
            .map_err(|error| format!("查询 Recall 标签池失败: {error}"))?;
        let mut pool = ModelTagPool::new(model_id.to_string());
        for row in rows {
            let (tag, index, dimension, blob) =
                row.map_err(|error| format!("读取 Recall 标签向量失败: {error}"))?;
            let index = usize::try_from(index).map_err(|_| format!("标签索引无效: {index}"))?;
            if index != pool.id_to_name.len() {
                return Err(format!(
                    "标签索引不连续: expected {}, got {}",
                    pool.id_to_name.len(),
                    index
                ));
            }
            let dimension =
                usize::try_from(dimension).map_err(|_| format!("标签维度无效: {dimension}"))?;
            if pool.dimension != 0 && pool.dimension != dimension {
                return Err(format!("标签池存在不一致维度: {model_id}"));
            }
            pool.dimension = dimension;
            let vector = decode_vector(&blob, dimension)?;
            pool.registry.insert(tag.clone(), index);
            pool.id_to_name.push(tag);
            pool.vectors.extend(vector);
        }
        Ok(pool)
    }

    fn save_tag_pool(&self, pool: &ModelTagPool) -> Result<(), String> {
        let mut entries = pool
            .registry
            .iter()
            .map(|(tag, index)| (*index, tag))
            .collect::<Vec<_>>();
        entries.sort_by_key(|(index, _)| *index);
        for (expected, (index, _)) in entries.iter().enumerate() {
            if expected != *index {
                return Err(format!("标签索引不连续: expected {expected}, got {index}"));
            }
        }
        if pool.dimension != 0 && pool.vectors.len() != entries.len() * pool.dimension {
            return Err(format!("标签池向量长度与维度不匹配: {}", pool.model_id));
        }

        let mut connection = self.open_vectors()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Recall 标签池事务失败: {error}"))?;
        transaction
            .execute(
                "DELETE FROM recall_tag_vectors WHERE model_id = ?1",
                [pool.model_id.as_str()],
            )
            .map_err(|error| format!("清理 Recall 旧标签池失败: {error}"))?;
        for (index, tag) in entries {
            let vector = pool
                .get_vector(index)
                .ok_or_else(|| format!("标签 {} 缺少向量", tag))?;
            transaction
                .execute(
                    "INSERT INTO recall_tag_vectors(
                        model_id, tag, tag_index, dimension, vector_blob, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, unixepoch())",
                    params![
                        pool.model_id,
                        tag,
                        index as i64,
                        pool.dimension as i64,
                        encode_vector(vector),
                    ],
                )
                .map_err(|error| format!("写入 Recall 标签向量失败: {error}"))?;
        }
        transaction
            .commit()
            .map_err(|error| format!("提交 Recall 标签池事务失败: {error}"))
    }
}

fn configure_connection(connection: Connection) -> Result<Connection, String> {
    connection
        .execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
        .map_err(|error| format!("配置 Recall SQLite 连接失败: {error}"))?;
    Ok(connection)
}

fn decode_json<T: DeserializeOwned>(value: &str, field: &str) -> Result<T, String> {
    serde_json::from_str(value).map_err(|error| format!("解析 {field} JSON 失败: {error}"))
}

struct CollectionRow {
    id: Uuid,
    name: String,
    description: Option<String>,
    author: Option<String>,
    icon: Option<String>,
    tags_json: String,
    config_json: String,
    created_at: i64,
    updated_at: i64,
    active_model_id: String,
    active_model_last_indexed_at: Option<i64>,
}

impl CollectionRow {
    fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        let id: String = row.get(0)?;
        Ok(Self {
            id: Uuid::parse_str(&id).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?,
            name: row.get(1)?,
            description: row.get(2)?,
            author: row.get(3)?,
            icon: row.get(4)?,
            tags_json: row.get(5)?,
            config_json: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            active_model_id: row.get(9)?,
            active_model_last_indexed_at: row.get(10)?,
        })
    }
}

struct EntryRow {
    id: Uuid,
    key: String,
    content: String,
    summary: String,
    tags_json: String,
    assets_json: String,
    priority: i32,
    enabled: bool,
    content_hash: Option<String>,
    created_at: i64,
    updated_at: i64,
}

impl EntryRow {
    fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        let id: String = row.get(0)?;
        Ok(Self {
            id: Uuid::parse_str(&id).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?,
            key: row.get(1)?,
            content: row.get(2)?,
            summary: row.get(3)?,
            tags_json: row.get(4)?,
            assets_json: row.get(5)?,
            priority: row.get(6)?,
            enabled: row.get(7)?,
            content_hash: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    }

    fn into_entry(self) -> Result<RecallEntry, String> {
        Ok(RecallEntry {
            id: self.id,
            key: self.key,
            content: self.content,
            summary: self.summary,
            core_tags: Vec::new(),
            tags: decode_json(&self.tags_json, "条目标签")?,
            assets: decode_json(&self.assets_json, "条目资产")?,
            priority: self.priority,
            enabled: self.enabled,
            created_at: self.created_at,
            updated_at: self.updated_at,
            error_message: None,
            content_hash: self.content_hash,
            refs: Vec::new(),
            ref_by: Vec::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recall::core::{AssetRef, RecallCollectionMeta, TagWithWeight};
    use tempfile::tempdir;

    fn collection(id: Uuid) -> RecallCollection {
        let entry_id = Uuid::new_v4();
        RecallCollection {
            meta: RecallCollectionMeta {
                id,
                name: "测试思绪".to_string(),
                description: Some("描述".to_string()),
                created_at: 11,
                updated_at: 12,
                author: Some("author".to_string()),
                vectorization: VectorizationMeta {
                    is_indexed: false,
                    last_indexed_at: None,
                    model_used: String::new(),
                    dimension: 0,
                    total_tokens: 0,
                },
                models: Vec::new(),
                tags: vec!["project".to_string()],
                icon: Some("asset-icon".to_string()),
                entries: Vec::new(),
                config: serde_json::json!({"mode": "semantic"}),
            },
            entries: vec![RecallEntry {
                id: entry_id,
                key: "entry-key".to_string(),
                content: "原始内容".to_string(),
                summary: "摘要".to_string(),
                core_tags: Vec::new(),
                tags: vec![TagWithWeight {
                    name: "tag".to_string(),
                    weight: 1.25,
                    hash: "hash".to_string(),
                }],
                assets: vec![AssetRef {
                    id: "asset".to_string(),
                    name: "file.txt".to_string(),
                    mime_type: "text/plain".to_string(),
                    protocol: "appdata://".to_string(),
                }],
                priority: 7,
                enabled: false,
                created_at: 13,
                updated_at: 14,
                error_message: None,
                content_hash: Some("hash-content".to_string()),
                refs: Vec::new(),
                ref_by: Vec::new(),
            }],
        }
    }

    #[test]
    fn initializes_two_independent_databases_and_migrations() {
        let directory = tempdir().unwrap();
        let repository = SqliteRecallRepository::new(directory.path());
        repository.initialize().unwrap();
        repository.initialize().unwrap();

        assert!(repository.main_db_path().is_file());
        assert!(repository.vector_db_path().is_file());
        let main = Connection::open(repository.main_db_path()).unwrap();
        let vector = Connection::open(repository.vector_db_path()).unwrap();
        assert_eq!(
            main.query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            vector
                .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }

    #[test]
    fn collection_and_entry_round_trip_preserves_ids_and_source_fields() {
        let directory = tempdir().unwrap();
        let repository = SqliteRecallRepository::new(directory.path());
        repository.initialize().unwrap();
        let collection = collection(Uuid::new_v4());

        repository.save_collection(&collection).unwrap();
        let loaded = repository
            .load_collection(collection.meta.id)
            .unwrap()
            .unwrap();
        assert_eq!(loaded.meta.id, collection.meta.id);
        assert_eq!(loaded.meta.created_at, 11);
        assert!(loaded.meta.vectorization.model_used.is_empty());
        assert_eq!(loaded.entries[0].id, collection.entries[0].id);
        assert_eq!(loaded.entries[0].tags[0].weight, 1.25);
        assert_eq!(repository.list_collections().unwrap().len(), 1);
    }

    #[test]
    fn vectors_are_content_addressed_and_tag_pool_round_trips() {
        let directory = tempdir().unwrap();
        let repository = SqliteRecallRepository::new(directory.path());
        repository.initialize().unwrap();
        let mut collection = collection(Uuid::new_v4());
        repository.save_collection(&collection).unwrap();
        let entry = &collection.entries[0];

        repository
            .upsert_entry_vector(
                collection.meta.id,
                entry.id,
                "model-a",
                &[1.0, 2.0],
                Some(9),
                entry.content_hash.as_deref(),
                20,
            )
            .unwrap();
        let loaded = repository
            .load_vectors(collection.meta.id, "model-a")
            .unwrap()
            .unwrap();
        assert_eq!(loaded.0[0].0, entry.id);
        assert_eq!(loaded.0[0].1, vec![1.0, 2.0]);
        assert_eq!(loaded.1, 2);
        assert_eq!(loaded.2, 9);

        collection.meta.vectorization = VectorizationMeta {
            is_indexed: true,
            last_indexed_at: Some(20),
            model_used: "model-a".to_string(),
            dimension: 2,
            total_tokens: 9,
        };
        collection.meta.models = vec!["model-a".to_string()];
        repository.save_collection(&collection).unwrap();
        let reloaded = repository
            .load_collection(collection.meta.id)
            .unwrap()
            .unwrap();
        assert_eq!(reloaded.meta.vectorization.model_used, "model-a");
        assert_eq!(reloaded.meta.vectorization.dimension, 2);
        assert_eq!(reloaded.meta.vectorization.total_tokens, 9);

        let mut pool = ModelTagPool::new("model-a".to_string());
        pool.sync_vectors(vec![("tag".to_string(), vec![0.5, 0.25])]);
        repository.save_tag_pool(&pool).unwrap();
        let loaded_pool = repository.load_tag_pool("model-a").unwrap();
        assert_eq!(loaded_pool.registry.get("tag"), Some(&0));
        assert_eq!(loaded_pool.get_vector(0), Some(&[0.5, 0.25][..]));
    }

    #[test]
    fn deleting_entries_removes_derived_vectors() {
        let directory = tempdir().unwrap();
        let repository = SqliteRecallRepository::new(directory.path());
        repository.initialize().unwrap();
        let collection = collection(Uuid::new_v4());
        repository.save_collection(&collection).unwrap();
        let entry = &collection.entries[0];
        repository
            .upsert_entry_vector(
                collection.meta.id,
                entry.id,
                "model-a",
                &[1.0],
                None,
                entry.content_hash.as_deref(),
                20,
            )
            .unwrap();
        repository
            .delete_entries(collection.meta.id, &[entry.id])
            .unwrap();
        assert!(repository
            .load_vectors(collection.meta.id, "model-a")
            .unwrap()
            .is_none());
    }

    #[test]
    fn batch_upsert_rolls_back_every_entry_when_one_write_fails() {
        let directory = tempdir().unwrap();
        let repository = SqliteRecallRepository::new(directory.path());
        repository.initialize().unwrap();
        let mut stored = collection(Uuid::new_v4());
        stored.entries.clear();
        repository.save_collection(&stored).unwrap();

        let connection = Connection::open(repository.main_db_path()).unwrap();
        connection
            .execute_batch(
                "CREATE TRIGGER fail_recall_batch
                 BEFORE INSERT ON recall_entries
                 WHEN NEW.key = 'force-rollback'
                 BEGIN
                   SELECT RAISE(ABORT, 'forced batch failure');
                 END;",
            )
            .unwrap();

        let mut first = collection(Uuid::new_v4()).entries.remove(0);
        first.key = "persist-only-if-whole-batch-succeeds".to_string();
        let mut second = first.clone();
        second.id = Uuid::new_v4();
        second.key = "force-rollback".to_string();

        assert!(repository
            .upsert_entries(stored.meta.id, &[first, second])
            .is_err());
        assert!(repository.load_entries(stored.meta.id).unwrap().is_empty());
    }
}
