// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use super::types::*;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct KnowledgeRepository {
    manifest_path: PathBuf,
    libraries_dir: PathBuf,
}

#[derive(Debug, Clone)]
struct LibraryMetadata {
    config: KnowledgeLibraryIndexConfig,
    active_embedding_space_id: String,
    embedding_route_key: String,
    dimension: usize,
    updated_at: i64,
}

impl KnowledgeRepository {
    pub fn new(app_data_dir: impl AsRef<Path>) -> Self {
        let root = app_data_dir.as_ref().join("knowledge");
        Self {
            manifest_path: root.join("knowledge_meta.db"),
            libraries_dir: root.join("libraries"),
        }
    }

    pub fn initialize(&self) -> Result<(), String> {
        std::fs::create_dir_all(&self.libraries_dir)
            .map_err(|error| format!("创建 Knowledge 数据目录失败: {error}"))?;
        let connection = self.open_manifest()?;
        connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS schema_migrations(
                    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS knowledge_libraries(
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    db_path TEXT NOT NULL,
                    embedding_model_id TEXT NOT NULL DEFAULT '',
                    dimension INTEGER NOT NULL DEFAULT 0,
                    config_json TEXT NOT NULL DEFAULT '{}',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                 );
                 INSERT OR IGNORE INTO schema_migrations(version, name, applied_at)
                 VALUES (1, 'initialize_knowledge_manifest', unixepoch());",
            )
            .map_err(|error| format!("初始化 Knowledge manifest 失败: {error}"))?;
        ensure_column(
            &connection,
            "knowledge_libraries",
            "active_embedding_space_id",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &connection,
            "knowledge_libraries",
            "embedding_route_key",
            "TEXT NOT NULL DEFAULT ''",
        )?;

        let libraries = {
            let mut statement = connection
                .prepare(
                    "SELECT id, db_path, config_json, embedding_model_id, dimension,
                            active_embedding_space_id, embedding_route_key
                     FROM knowledge_libraries",
                )
                .map_err(|error| format!("准备 Knowledge 空间迁移失败: {error}"))?;
            let rows = statement
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                    ))
                })
                .map_err(|error| format!("查询 Knowledge 空间迁移项失败: {error}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("读取 Knowledge 空间迁移项失败: {error}"))?;
            rows
        };
        for (
            id,
            db_path,
            legacy_config,
            legacy_model_id,
            dimension,
            active_space_id,
            legacy_route_key,
        ) in libraries
        {
            let path = PathBuf::from(db_path);
            self.initialize_library(&path)?;
            let route_key = if legacy_route_key.trim().is_empty() {
                legacy_model_id
            } else {
                legacy_route_key
            };
            self.initialize_library_metadata(
                &path,
                &legacy_config,
                &route_key,
                &active_space_id,
                dimension.max(0) as usize,
            )
            .map_err(|error| format!("迁移 Knowledge library {id} metadata 失败: {error}"))?;
        }
        Ok(())
    }

    pub fn create_library(
        &self,
        name: &str,
        description: Option<&str>,
        config: Option<&KnowledgeLibraryIndexConfig>,
    ) -> Result<KnowledgeLibrary, String> {
        let config = config.cloned().unwrap_or_default();
        config.validate()?;
        let config_json = serde_json::to_string(&config)
            .map_err(|error| format!("序列化 Knowledge library 配置失败: {error}"))?;
        let id = Uuid::new_v4().to_string();
        let db_path = self.library_path(&id);
        self.initialize_library(&db_path)?;
        self.initialize_library_metadata(&db_path, &config_json, "", "", 0)?;
        let now = now();
        let manifest_result = self.open_manifest()?.execute(
            "INSERT INTO knowledge_libraries(
                    id, name, description, db_path, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![id, name.trim(), description, db_path.to_string_lossy(), now],
        );
        if let Err(error) = manifest_result {
            let _ = std::fs::remove_file(&db_path);
            return Err(format!("创建 Knowledge library 失败: {error}"));
        }
        self.get_library(&id)?
            .ok_or_else(|| "创建后找不到 Knowledge library".to_string())
    }

    pub fn list_libraries(&self) -> Result<Vec<KnowledgeLibrary>, String> {
        let connection = self.open_manifest()?;
        let mut statement = connection
            .prepare(
                "SELECT id, name, description, created_at, updated_at
                 FROM knowledge_libraries ORDER BY updated_at DESC, id",
            )
            .map_err(|error| format!("准备 Knowledge library 列表失败: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })
            .map_err(|error| format!("查询 Knowledge library 失败: {error}"))?;
        let mut libraries = rows
            .map(|row| {
                let (id, name, description, created_at, manifest_updated_at) =
                    row.map_err(|error| format!("读取 Knowledge library 失败: {error}"))?;
                let metadata = self.read_library_metadata(&id)?;
                let (document_count, chunk_count) = self.library_counts(&id)?;
                let descriptor =
                    self.embedding_space_descriptor(&id, &metadata.active_embedding_space_id)?;
                Ok(KnowledgeLibrary {
                    id,
                    name,
                    description,
                    embedding_model_id: metadata.embedding_route_key.clone(),
                    active_embedding_space_id: metadata.active_embedding_space_id,
                    embedding_route_key: metadata.embedding_route_key,
                    embedding_space_descriptor: descriptor,
                    dimension: metadata.dimension,
                    config: metadata.config,
                    document_count,
                    chunk_count,
                    created_at,
                    updated_at: manifest_updated_at.max(metadata.updated_at),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        libraries.sort_by(|left, right| {
            right
                .updated_at
                .cmp(&left.updated_at)
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(libraries)
    }

    pub fn get_library(&self, id: &str) -> Result<Option<KnowledgeLibrary>, String> {
        Ok(self
            .list_libraries()?
            .into_iter()
            .find(|library| library.id == id))
    }

    pub fn update_library(
        &self,
        id: &str,
        name: &str,
        description: Option<&str>,
    ) -> Result<KnowledgeLibrary, String> {
        if name.trim().is_empty() {
            return Err("Knowledge library 名称不能为空".to_string());
        }
        let changed = self
            .open_manifest()?
            .execute(
                "UPDATE knowledge_libraries
                 SET name = ?2, description = ?3, updated_at = ?4
                 WHERE id = ?1",
                params![id, name.trim(), description, now()],
            )
            .map_err(|error| format!("更新 Knowledge library 失败: {error}"))?;
        if changed == 0 {
            return Err(format!("Knowledge library 不存在: {id}"));
        }
        self.get_library(id)?
            .ok_or_else(|| format!("更新后找不到 Knowledge library: {id}"))
    }

    fn read_library_metadata(&self, library_id: &str) -> Result<LibraryMetadata, String> {
        let path = self.resolve_library_path(library_id)?;
        let (config_json, active_space_id, route_key, dimension, updated_at) = self
            .open_library(&path)?
            .query_row(
                "SELECT config_json, active_embedding_space_id, embedding_route_key,
                        dimension, updated_at
                 FROM library_metadata WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, i64>(4)?,
                    ))
                },
            )
            .map_err(|error| format!("读取 Knowledge library metadata 失败: {error}"))?;
        Ok(LibraryMetadata {
            config: parse_library_config(&config_json)?,
            active_embedding_space_id: active_space_id,
            embedding_route_key: route_key,
            dimension: dimension.max(0) as usize,
            updated_at,
        })
    }

    fn embedding_space_descriptor(
        &self,
        library_id: &str,
        space_id: &str,
    ) -> Result<Option<serde_json::Value>, String> {
        if space_id.is_empty() {
            return Ok(None);
        }
        let path = self.resolve_library_path(library_id)?;
        let descriptor = self
            .open_library(&path)?
            .query_row(
                "SELECT descriptor_json FROM embedding_spaces WHERE id = ?1",
                [space_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| format!("读取 Knowledge embedding space 失败: {error}"))?;
        descriptor
            .map(|value| {
                serde_json::from_str(&value)
                    .map_err(|error| format!("解析 Knowledge embedding descriptor 失败: {error}"))
            })
            .transpose()
    }

    pub fn delete_library(&self, id: &str) -> Result<(), String> {
        let path = self.resolve_library_path(id)?;
        let tombstone = path.with_extension(format!("kdb.delete.{}", Uuid::new_v4()));
        if path.exists() {
            std::fs::rename(&path, &tombstone)
                .map_err(|error| format!("隔离 Knowledge library 文件失败: {error}"))?;
        }
        let deleted = self
            .open_manifest()?
            .execute("DELETE FROM knowledge_libraries WHERE id = ?1", [id])
            .map_err(|error| format!("删除 Knowledge library manifest 失败: {error}"));
        if let Err(error) = deleted {
            if tombstone.exists() {
                let _ = std::fs::rename(&tombstone, &path);
            }
            return Err(error);
        }
        if tombstone.exists() {
            std::fs::remove_file(tombstone)
                .map_err(|error| format!("删除 Knowledge library 文件失败: {error}"))?;
        }
        Ok(())
    }

    pub fn ingest(&self, request: &KnowledgeIngestRequest) -> Result<KnowledgeDocument, String> {
        let config = self
            .get_library(&request.library_id)?
            .ok_or_else(|| format!("Knowledge library 不存在: {}", request.library_id))?
            .config;
        let path = self.resolve_library_path(&request.library_id)?;
        let mut connection = self.open_library(&path)?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Knowledge ingest 事务失败: {error}"))?;
        let existing = transaction
            .query_row(
                "SELECT id, created_at FROM documents WHERE source_path = ?1",
                [&request.source_path],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()
            .map_err(|error| format!("读取 Knowledge document 失败: {error}"))?;
        let document_id = existing
            .as_ref()
            .map(|item| item.0.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let created_at = existing.map(|item| item.1).unwrap_or_else(now);
        let updated_at = now();
        let title = request
            .title
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| source_title(&request.source_path));
        let checksum = blake3::hash(request.content.as_bytes())
            .to_hex()
            .to_string();
        let mime_type = request
            .mime_type
            .clone()
            .unwrap_or_else(|| "text/plain".to_string());
        transaction
            .execute(
                "INSERT INTO documents(
                    id, source_path, title, checksum, mime_type, content, size,
                    status, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'ready', ?8, ?9)
                 ON CONFLICT(source_path) DO UPDATE SET
                    title = excluded.title,
                    checksum = excluded.checksum,
                    mime_type = excluded.mime_type,
                    content = excluded.content,
                    size = excluded.size,
                    status = 'ready',
                    updated_at = excluded.updated_at",
                params![
                    document_id,
                    request.source_path,
                    title,
                    checksum,
                    mime_type,
                    request.content,
                    request.content.len() as i64,
                    created_at,
                    updated_at,
                ],
            )
            .map_err(|error| format!("写入 Knowledge document 失败: {error}"))?;
        replace_document_chunks(
            &transaction,
            &request.library_id,
            &document_id,
            &request.source_path,
            &title,
            &request.content,
            &config,
        )?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge ingest 事务失败: {error}"))?;
        self.touch_library(&request.library_id)?;
        self.get_document(&request.library_id, &document_id)?
            .ok_or_else(|| "导入后找不到 Knowledge document".to_string())
    }

    pub fn list_documents(&self, library_id: &str) -> Result<Vec<KnowledgeDocument>, String> {
        let path = self.resolve_library_path(library_id)?;
        let connection = self.open_library(&path)?;
        let mut statement = connection
            .prepare(
                "SELECT d.id, d.source_path, d.title, d.checksum, d.mime_type, d.size,
                        d.status, d.created_at, d.updated_at, COUNT(c.id)
                 FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
                 GROUP BY d.id ORDER BY d.updated_at DESC, d.id",
            )
            .map_err(|error| format!("准备 Knowledge document 列表失败: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok(KnowledgeDocument {
                    id: row.get(0)?,
                    library_id: library_id.to_string(),
                    source_path: row.get(1)?,
                    title: row.get(2)?,
                    checksum: row.get(3)?,
                    mime_type: row.get(4)?,
                    size: row.get::<_, i64>(5)?.max(0) as usize,
                    status: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    chunk_count: row.get::<_, i64>(9)?.max(0) as usize,
                })
            })
            .map_err(|error| format!("查询 Knowledge document 失败: {error}"))?;
        rows.map(|row| row.map_err(|error| format!("读取 Knowledge document 失败: {error}")))
            .collect()
    }

    pub fn list_chunks(
        &self,
        library_id: &str,
        document_id: Option<&str>,
    ) -> Result<Vec<KnowledgeChunk>, String> {
        let path = self.resolve_library_path(library_id)?;
        let connection = self.open_library(&path)?;
        let mut statement = connection
            .prepare(
                "SELECT c.id, c.document_id, d.source_path, d.title, c.chunk_index,
                        c.content, c.checksum, c.heading, c.start_offset, c.end_offset
                 FROM chunks c JOIN documents d ON d.id = c.document_id
                 WHERE (?1 IS NULL OR c.document_id = ?1)
                 ORDER BY d.updated_at DESC, c.document_id, c.chunk_index",
            )
            .map_err(|error| format!("准备 Knowledge chunk 列表失败: {error}"))?;
        let rows = statement
            .query_map([document_id], chunk_from_row)
            .map_err(|error| format!("查询 Knowledge chunk 列表失败: {error}"))?;
        rows.map(|row| {
            let mut chunk = row.map_err(|error| format!("读取 Knowledge chunk 失败: {error}"))?;
            chunk.library_id = library_id.to_string();
            Ok(chunk)
        })
        .collect()
    }

    pub fn delete_document(&self, library_id: &str, document_id: &str) -> Result<(), String> {
        let path = self.resolve_library_path(library_id)?;
        let mut connection = self.open_library(&path)?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Knowledge document 删除事务失败: {error}"))?;
        transaction
            .execute(
                "DELETE FROM chunks_fts WHERE chunk_id IN (
                    SELECT id FROM chunks WHERE document_id = ?1
                 )",
                [document_id],
            )
            .map_err(|error| format!("清理 Knowledge document FTS 失败: {error}"))?;
        transaction
            .execute(
                "DELETE FROM chunk_edges WHERE source_chunk_id IN (
                    SELECT id FROM chunks WHERE document_id = ?1
                 ) OR target_chunk_id IN (
                    SELECT id FROM chunks WHERE document_id = ?1
                 )",
                [document_id],
            )
            .map_err(|error| format!("清理 Knowledge document graph 失败: {error}"))?;
        transaction
            .execute("DELETE FROM documents WHERE id = ?1", [document_id])
            .map_err(|error| format!("删除 Knowledge document 失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge document 删除事务失败: {error}"))?;
        self.touch_library(library_id)
    }

    pub fn rebuild_library(&self, library_id: &str) -> Result<usize, String> {
        let config = self
            .get_library(library_id)?
            .ok_or_else(|| format!("Knowledge library 不存在: {library_id}"))?
            .config;
        self.apply_library_config_and_rebuild(library_id, &config)
    }

    pub fn apply_library_config_and_rebuild(
        &self,
        library_id: &str,
        config: &KnowledgeLibraryIndexConfig,
    ) -> Result<usize, String> {
        config.validate()?;
        let config_json = serde_json::to_string(config)
            .map_err(|error| format!("序列化 Knowledge library 配置失败: {error}"))?;
        let path = self.resolve_library_path(library_id)?;
        let mut connection = self.open_library(&path)?;
        let documents = {
            let mut statement = connection
                .prepare("SELECT id, source_path, title, content FROM documents ORDER BY id")
                .map_err(|error| format!("准备 Knowledge rebuild 失败: {error}"))?;
            let rows = statement
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                })
                .map_err(|error| format!("读取 Knowledge rebuild 文档失败: {error}"))?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("读取 Knowledge rebuild 文档失败: {error}"))?
        };
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Knowledge rebuild 事务失败: {error}"))?;
        for (document_id, source_path, title, content) in &documents {
            replace_document_chunks(
                &transaction,
                library_id,
                document_id,
                source_path,
                title,
                content,
                config,
            )?;
        }
        let changed = transaction
            .execute(
                "UPDATE library_metadata
                 SET config_json = ?1, active_embedding_space_id = '',
                     embedding_route_key = '', dimension = 0, updated_at = ?2
                 WHERE id = 1",
                params![config_json, now()],
            )
            .map_err(|error| format!("更新 Knowledge library 配置失败: {error}"))?;
        if changed == 0 {
            return Err(format!("Knowledge library metadata 不存在: {library_id}"));
        }
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge rebuild 失败: {error}"))?;
        Ok(documents.len())
    }

    pub fn save_vectors(
        &self,
        library_id: &str,
        space_id: &str,
        descriptor_json: &str,
        route_key: &str,
        records: &[KnowledgeVectorRecord],
    ) -> Result<(), String> {
        if space_id.trim().is_empty() || route_key.trim().is_empty() {
            return Err("Knowledge embedding space 和 route 不能为空".to_string());
        }
        if records.is_empty() {
            return Err("Knowledge chunk vector 批次不能为空".to_string());
        }
        let descriptor: serde_json::Value = serde_json::from_str(descriptor_json)
            .map_err(|error| format!("Knowledge embedding descriptor 非法: {error}"))?;
        if !descriptor.is_object() {
            return Err("Knowledge embedding descriptor 必须为对象".to_string());
        }
        let library = self
            .get_library(library_id)?
            .ok_or_else(|| format!("Knowledge library 不存在: {library_id}"))?;
        let embedding = &library.config.embedding;
        if !embedding.enabled
            || !library.config.indexes.semantic
            || embedding.route_key != route_key
        {
            return Err("Knowledge vector 写入与资料库索引配置不一致".to_string());
        }
        for (field, expected) in [
            ("queryTaskType", embedding.query_task_type.as_str()),
            ("documentTaskType", embedding.document_task_type.as_str()),
            ("encodingFormat", embedding.encoding_format.as_str()),
        ] {
            if descriptor.get(field).and_then(serde_json::Value::as_str) != Some(expected) {
                return Err(format!("Knowledge descriptor {field} 与资料库配置不一致"));
            }
        }
        if descriptor
            .get("adapterContractVersion")
            .and_then(serde_json::Value::as_u64)
            != Some(embedding.adapter_contract_version as u64)
        {
            return Err(
                "Knowledge descriptor adapterContractVersion 与资料库配置不一致".to_string(),
            );
        }
        let path = self.resolve_library_path(library_id)?;
        let mut connection = self.open_library(&path)?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Knowledge vector 事务失败: {error}"))?;
        let existing_descriptor = transaction
            .query_row(
                "SELECT descriptor_json FROM embedding_spaces WHERE id = ?1",
                [space_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| format!("检查 Knowledge embedding space 失败: {error}"))?;
        if let Some(existing) = existing_descriptor {
            let existing: serde_json::Value = serde_json::from_str(&existing)
                .map_err(|error| format!("已有 Knowledge embedding descriptor 非法: {error}"))?;
            if existing != descriptor {
                return Err("相同 Knowledge spaceId 对应了不同 descriptor".to_string());
            }
        }
        transaction
            .execute(
                "INSERT OR IGNORE INTO embedding_spaces(id, descriptor_json, created_at)
                 VALUES (?1, ?2, ?3)",
                params![space_id, descriptor_json, now()],
            )
            .map_err(|error| format!("写入 Knowledge embedding space 失败: {error}"))?;
        let expected_dimension = records.first().map_or(0, |record| record.vector.len());
        if descriptor
            .get("dimensions")
            .and_then(serde_json::Value::as_u64)
            != Some(expected_dimension as u64)
        {
            return Err("Knowledge descriptor 维度与向量不一致".to_string());
        }
        for record in records {
            if record.vector.is_empty() {
                return Err("Knowledge chunk vector 不能为空".to_string());
            }
            if record.vector.len() != expected_dimension {
                return Err("Knowledge chunk vector 维度不一致".to_string());
            }
            transaction
                .execute(
                    "INSERT INTO chunk_vectors(chunk_id, space_id, dimension, vector_blob, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)
                     ON CONFLICT(chunk_id, space_id) DO UPDATE SET
                        dimension = excluded.dimension,
                        vector_blob = excluded.vector_blob,
                        updated_at = excluded.updated_at",
                    params![
                        record.chunk_id,
                        space_id,
                        record.vector.len() as i64,
                        encode_vector(&record.vector),
                        now(),
                    ],
                )
                .map_err(|error| format!("写入 Knowledge vector 失败: {error}"))?;
        }
        let changed = transaction
            .execute(
                "UPDATE library_metadata
                 SET active_embedding_space_id = ?1, embedding_route_key = ?2,
                     dimension = ?3, updated_at = ?4
                 WHERE id = 1",
                params![space_id, route_key, expected_dimension as i64, now()],
            )
            .map_err(|error| format!("更新 Knowledge vector metadata 失败: {error}"))?;
        if changed == 0 {
            return Err(format!("Knowledge library metadata 不存在: {library_id}"));
        }
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge vector 失败: {error}"))?;
        Ok(())
    }

    pub fn get_index_status(&self, library_id: &str) -> Result<KnowledgeIndexStatus, String> {
        let library = self
            .get_library(library_id)?
            .ok_or_else(|| format!("Knowledge library 不存在: {library_id}"))?;
        let path = self.resolve_library_path(library_id)?;
        let connection = self.open_library(&path)?;
        let total_chunks = connection
            .query_row("SELECT COUNT(*) FROM chunks", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|error| format!("读取 Knowledge chunk 数量失败: {error}"))?
            .max(0) as usize;
        let vectorized_chunks =
            if library.active_embedding_space_id.is_empty() || library.dimension == 0 {
                0
            } else {
                connection
                    .query_row(
                        "SELECT COUNT(*)
                     FROM chunk_vectors AS vectors
                     INNER JOIN chunks ON chunks.id = vectors.chunk_id
                     WHERE vectors.space_id = ?1 AND vectors.dimension = ?2",
                        params![library.active_embedding_space_id, library.dimension as i64],
                        |row| row.get::<_, i64>(0),
                    )
                    .map_err(|error| format!("读取 Knowledge vector 覆盖状态失败: {error}"))?
                    .max(0) as usize
            };

        Ok(KnowledgeIndexStatus {
            library_id: library_id.to_string(),
            total_chunks,
            vectorized_chunks,
            pending_chunks: total_chunks.saturating_sub(vectorized_chunks),
            embedding_model_id: library.embedding_model_id,
            active_embedding_space_id: library.active_embedding_space_id,
            embedding_route_key: library.embedding_route_key,
            embedding_space_descriptor: library.embedding_space_descriptor,
            dimension: library.dimension,
        })
    }

    pub fn switch_embedding_route(
        &self,
        library_id: &str,
        space_id: &str,
        route_key: &str,
    ) -> Result<(), String> {
        let library = self
            .get_library(library_id)?
            .ok_or_else(|| format!("Knowledge library 不存在: {library_id}"))?;
        if library.active_embedding_space_id != space_id || space_id.is_empty() {
            return Err("只能为当前 Knowledge embedding space 切换渠道".to_string());
        }
        if route_key.trim().is_empty() {
            return Err("Knowledge embedding route 不能为空".to_string());
        }
        let mut config = library.config;
        config.embedding.enabled = true;
        config.embedding.route_key = route_key.trim().to_string();
        config.indexes.semantic = true;
        config.validate()?;
        let config_json = serde_json::to_string(&config)
            .map_err(|error| format!("序列化 Knowledge library 配置失败: {error}"))?;
        let path = self.resolve_library_path(library_id)?;
        let changed = self
            .open_library(&path)?
            .execute(
                "UPDATE library_metadata
                 SET embedding_route_key = ?1, config_json = ?2, updated_at = ?3
                 WHERE id = 1 AND active_embedding_space_id = ?4",
                params![route_key, config_json, now(), space_id],
            )
            .map_err(|error| format!("切换 Knowledge embedding route 失败: {error}"))?;
        if changed == 0 {
            return Err("Knowledge embedding space 已变化，请刷新后重试".to_string());
        }
        Ok(())
    }

    pub fn search(&self, request: &KnowledgeSearchRequest) -> Result<Vec<KnowledgeResult>, String> {
        let strategy = match request.strategy {
            KnowledgeSearchStrategy::Auto => {
                if request.query_vector.is_some() {
                    KnowledgeSearchStrategy::Hybrid
                } else {
                    KnowledgeSearchStrategy::Keyword
                }
            }
            ref strategy => strategy.clone(),
        };
        if matches!(
            strategy,
            KnowledgeSearchStrategy::Semantic | KnowledgeSearchStrategy::Hybrid
        ) && request.query_vector.is_some()
            && request
                .space_id
                .as_deref()
                .map(str::trim)
                .filter(|space_id| !space_id.is_empty())
                .is_none()
        {
            return Err("预计算 Knowledge 查询向量必须指定 spaceId".to_string());
        }
        if strategy == KnowledgeSearchStrategy::Semantic && request.query_vector.is_none() {
            return Err("Knowledge semantic 检索需要 queryVector".to_string());
        }
        let libraries = if request.library_ids.is_empty() {
            self.list_libraries()?
        } else {
            request
                .library_ids
                .iter()
                .map(|id| {
                    self.get_library(id)?
                        .ok_or_else(|| format!("找不到 Knowledge library: {id}"))
                })
                .collect::<Result<Vec<_>, String>>()?
        };
        let mut results = Vec::new();
        for library in libraries {
            results.extend(self.search_library(&library, request, &strategy)?);
        }
        results.sort_by(|left, right| right.score.total_cmp(&left.score));
        results.retain(|result| result.score >= request.min_score);
        results.truncate(request.limit.max(1));
        Ok(results)
    }

    fn search_library(
        &self,
        library: &KnowledgeLibrary,
        request: &KnowledgeSearchRequest,
        strategy: &KnowledgeSearchStrategy,
    ) -> Result<Vec<KnowledgeResult>, String> {
        let path = self.resolve_library_path(&library.id)?;
        let connection = self.open_library(&path)?;
        let mut candidates: HashMap<String, KnowledgeResult> = HashMap::new();
        if matches!(
            strategy,
            KnowledgeSearchStrategy::Keyword | KnowledgeSearchStrategy::Hybrid
        ) {
            for (chunk, score) in keyword_candidates(&connection, &request.query, request.limit)? {
                let mut result = result_from_chunk(library, chunk, score);
                result.signals.push(KnowledgeSignal {
                    signal_type: KnowledgeSignalType::KnowledgeBm25,
                    score,
                });
                candidates.insert(result.chunk_id.clone(), result);
            }
        }
        if matches!(
            strategy,
            KnowledgeSearchStrategy::Semantic | KnowledgeSearchStrategy::Hybrid
        ) {
            let query_vector = request.query_vector.as_deref().unwrap_or_default();
            for (chunk, score) in vector_candidates(
                &connection,
                query_vector,
                request.space_id.as_deref(),
                request.limit,
            )? {
                candidates
                    .entry(chunk.id.clone())
                    .and_modify(|result| {
                        result.score = if *strategy == KnowledgeSearchStrategy::Hybrid {
                            result.score * 0.6 + score * 0.4
                        } else {
                            score
                        };
                        result.signals.push(KnowledgeSignal {
                            signal_type: KnowledgeSignalType::KnowledgeVector,
                            score,
                        });
                    })
                    .or_insert_with(|| {
                        let mut result = result_from_chunk(library, chunk, score);
                        result.signals.push(KnowledgeSignal {
                            signal_type: KnowledgeSignalType::KnowledgeVector,
                            score,
                        });
                        result
                    });
            }
        }
        apply_graph_expansion(&connection, library, &mut candidates)?;
        Ok(candidates.into_values().collect())
    }

    fn get_document(
        &self,
        library_id: &str,
        document_id: &str,
    ) -> Result<Option<KnowledgeDocument>, String> {
        Ok(self
            .list_documents(library_id)?
            .into_iter()
            .find(|document| document.id == document_id))
    }

    fn library_counts(&self, id: &str) -> Result<(usize, usize), String> {
        let path = self.library_path(id);
        if !path.exists() {
            return Ok((0, 0));
        }
        let connection = self.open_library(&path)?;
        let documents = connection
            .query_row("SELECT COUNT(*) FROM documents", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|error| format!("统计 Knowledge document 失败: {error}"))?;
        let chunks = connection
            .query_row("SELECT COUNT(*) FROM chunks", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|error| format!("统计 Knowledge chunk 失败: {error}"))?;
        Ok((documents.max(0) as usize, chunks.max(0) as usize))
    }

    fn touch_library(&self, id: &str) -> Result<(), String> {
        self.open_manifest()?
            .execute(
                "UPDATE knowledge_libraries SET updated_at = ?2 WHERE id = ?1",
                params![id, now()],
            )
            .map_err(|error| format!("更新 Knowledge library 时间失败: {error}"))?;
        Ok(())
    }

    fn resolve_library_path(&self, id: &str) -> Result<PathBuf, String> {
        Uuid::parse_str(id).map_err(|_| "Knowledge library ID 不是 UUID".to_string())?;
        let path = self
            .open_manifest()?
            .query_row(
                "SELECT db_path FROM knowledge_libraries WHERE id = ?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| format!("读取 Knowledge library 路径失败: {error}"))?
            .ok_or_else(|| format!("找不到 Knowledge library: {id}"))?;
        let resolved = PathBuf::from(path);
        if resolved.parent() != Some(self.libraries_dir.as_path()) {
            return Err("Knowledge library 路径越出受管目录".to_string());
        }
        Ok(resolved)
    }

    fn library_path(&self, id: &str) -> PathBuf {
        self.libraries_dir.join(format!("{id}.kdb"))
    }

    fn open_manifest(&self) -> Result<Connection, String> {
        configure_connection(
            Connection::open(&self.manifest_path)
                .map_err(|error| format!("打开 Knowledge manifest 失败: {error}"))?,
        )
    }

    fn open_library(&self, path: &Path) -> Result<Connection, String> {
        configure_connection(
            Connection::open(path)
                .map_err(|error| format!("打开 Knowledge library 失败: {error}"))?,
        )
    }

    fn initialize_library(&self, path: &Path) -> Result<(), String> {
        let mut connection = self.open_library(path)?;
        connection
            .execute_batch(LIBRARY_SCHEMA)
            .map_err(|error| format!("初始化 Knowledge library 失败: {error}"))?;
        migrate_legacy_chunk_vectors(&mut connection)
    }

    fn initialize_library_metadata(
        &self,
        path: &Path,
        legacy_config_json: &str,
        legacy_route_key: &str,
        legacy_active_space_id: &str,
        legacy_dimension: usize,
    ) -> Result<(), String> {
        let mut connection = self.open_library(path)?;
        let exists = connection
            .query_row(
                "SELECT 1 FROM library_metadata WHERE id = 1",
                [],
                |_| Ok(()),
            )
            .optional()
            .map_err(|error| format!("检查 Knowledge library metadata 失败: {error}"))?
            .is_some();
        if exists {
            return Ok(());
        }

        let mut config = parse_library_config(legacy_config_json)?;
        let mut route_key = legacy_route_key.trim().to_string();
        let mut active_space_id = legacy_active_space_id.trim().to_string();
        if route_key.is_empty() && !active_space_id.is_empty() {
            route_key = config.embedding.route_key.trim().to_string();
        }
        if !route_key.is_empty() {
            config.embedding.enabled = true;
            config.embedding.route_key = route_key.clone();
            config.indexes.semantic = true;
            if active_space_id.is_empty() {
                active_space_id = legacy_space_id(&route_key);
            }
        }
        config.validate()?;
        let config_json = serde_json::to_string(&config)
            .map_err(|error| format!("序列化 Knowledge library metadata 配置失败: {error}"))?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Knowledge library metadata 迁移事务失败: {error}"))?;
        if !active_space_id.is_empty() && !route_key.is_empty() {
            let descriptor = legacy_descriptor_json(&route_key, legacy_dimension as i64);
            transaction
                .execute(
                    "INSERT OR IGNORE INTO embedding_spaces(id, descriptor_json, created_at)
                     VALUES (?1, ?2, ?3)",
                    params![active_space_id, descriptor, now()],
                )
                .map_err(|error| format!("写入 Knowledge legacy space 失败: {error}"))?;
        }
        transaction
            .execute(
                "INSERT INTO library_metadata(
                    id, schema_version, config_json, active_embedding_space_id,
                    embedding_route_key, dimension, updated_at
                 ) VALUES (1, 1, ?1, ?2, ?3, ?4, ?5)",
                params![
                    config_json,
                    active_space_id,
                    route_key,
                    legacy_dimension as i64,
                    now()
                ],
            )
            .map_err(|error| format!("写入 Knowledge library metadata 失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge library metadata 迁移失败: {error}"))
    }

    #[cfg(test)]
    pub fn library_file_path(&self, id: &str) -> PathBuf {
        self.library_path(id)
    }
}

const LIBRARY_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS library_metadata(
  id INTEGER PRIMARY KEY CHECK(id = 1),
  schema_version INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  active_embedding_space_id TEXT NOT NULL DEFAULT '',
  embedding_route_key TEXT NOT NULL DEFAULT '',
  dimension INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS documents(
  id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  checksum TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  content TEXT NOT NULL,
  size INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks(
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  checksum TEXT NOT NULL,
  heading TEXT,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  UNIQUE(document_id, chunk_index),
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON chunks(document_id, chunk_index);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id UNINDEXED, content, heading, tokenize='unicode61'
);
CREATE TABLE IF NOT EXISTS embedding_spaces(
  id TEXT PRIMARY KEY,
  descriptor_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chunk_vectors(
  chunk_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(chunk_id, space_id),
  FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS chunk_edges(
  source_chunk_id TEXT NOT NULL,
  target_chunk_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  PRIMARY KEY(source_chunk_id, target_chunk_id, relation)
);
"#;

fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| format!("检查 Knowledge manifest 列失败: {error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("查询 Knowledge manifest 列失败: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读取 Knowledge manifest 列失败: {error}"))?;
    if !columns.iter().any(|candidate| candidate == column) {
        connection
            .execute(
                &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
                [],
            )
            .map_err(|error| format!("迁移 Knowledge manifest 列 {column} 失败: {error}"))?;
    }
    Ok(())
}

fn migrate_legacy_chunk_vectors(connection: &mut Connection) -> Result<(), String> {
    let columns = {
        let mut statement = connection
            .prepare("PRAGMA table_info(chunk_vectors)")
            .map_err(|error| format!("检查 Knowledge vector schema 失败: {error}"))?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|error| format!("查询 Knowledge vector schema 失败: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取 Knowledge vector schema 失败: {error}"))?;
        columns
    };
    if !columns.iter().any(|column| column == "model_id") {
        return Ok(());
    }

    let legacy_models = {
        let mut statement = connection
            .prepare(
                "SELECT model_id, COALESCE(MAX(dimension), 0)
                 FROM chunk_vectors GROUP BY model_id",
            )
            .map_err(|error| format!("准备 Knowledge legacy vector 迁移失败: {error}"))?;
        let models = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|error| format!("查询 Knowledge legacy vector 失败: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取 Knowledge legacy vector 失败: {error}"))?;
        models
    };

    let transaction = connection
        .transaction()
        .map_err(|error| format!("开启 Knowledge legacy vector 迁移失败: {error}"))?;
    transaction
        .execute_batch(
            "CREATE TABLE chunk_vectors_v2(
               chunk_id TEXT NOT NULL,
               space_id TEXT NOT NULL,
               dimension INTEGER NOT NULL,
               vector_blob BLOB NOT NULL,
               updated_at INTEGER NOT NULL,
               PRIMARY KEY(chunk_id, space_id),
               FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
             );",
        )
        .map_err(|error| format!("创建 Knowledge vector v2 表失败: {error}"))?;
    for (route_key, dimension) in legacy_models {
        let space_id = legacy_space_id(&route_key);
        let descriptor = legacy_descriptor_json(&route_key, dimension.max(0));
        transaction
            .execute(
                "INSERT OR IGNORE INTO embedding_spaces(id, descriptor_json, created_at)
                 VALUES (?1, ?2, ?3)",
                params![space_id, descriptor, now()],
            )
            .map_err(|error| format!("迁移 Knowledge legacy space 失败: {error}"))?;
        transaction
            .execute(
                "INSERT INTO chunk_vectors_v2(
                    chunk_id, space_id, dimension, vector_blob, updated_at
                 )
                 SELECT chunk_id, ?1, dimension, vector_blob, updated_at
                 FROM chunk_vectors WHERE model_id = ?2",
                params![space_id, route_key],
            )
            .map_err(|error| format!("迁移 Knowledge legacy vector 失败: {error}"))?;
    }
    transaction
        .execute_batch(
            "DROP TABLE chunk_vectors;
             ALTER TABLE chunk_vectors_v2 RENAME TO chunk_vectors;",
        )
        .map_err(|error| format!("替换 Knowledge vector 表失败: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("提交 Knowledge legacy vector 迁移失败: {error}"))
}

fn legacy_space_id(route_key: &str) -> String {
    format!("legacy-route:{}", legacy_route_hash(route_key))
}

fn parse_library_config(value: &str) -> Result<KnowledgeLibraryIndexConfig, String> {
    let config = if value.trim().is_empty() {
        KnowledgeLibraryIndexConfig::default()
    } else {
        serde_json::from_str(value)
            .map_err(|error| format!("解析 Knowledge library 配置失败: {error}"))?
    };
    config.validate()?;
    Ok(config)
}

fn legacy_descriptor_json(route_key: &str, dimension: i64) -> String {
    serde_json::json!({
        "schemaVersion": 1,
        "model": {
            "canonicalId": format!("legacy-route/{}", legacy_route_hash(route_key))
        },
        "dimensions": dimension,
        "encodingFormat": "float",
        "similarity": "cosine",
        "adapterContractVersion": 1
    })
    .to_string()
}

fn legacy_route_hash(route_key: &str) -> String {
    let digest = Sha256::digest(route_key.as_bytes());
    format!("{digest:x}")
}

fn replace_document_chunks(
    transaction: &Transaction<'_>,
    library_id: &str,
    document_id: &str,
    source_path: &str,
    title: &str,
    content: &str,
    config: &KnowledgeLibraryIndexConfig,
) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM chunks_fts WHERE chunk_id IN (
                SELECT id FROM chunks WHERE document_id = ?1
             )",
            [document_id],
        )
        .map_err(|error| format!("清理 Knowledge FTS chunk 失败: {error}"))?;
    transaction
        .execute(
            "DELETE FROM chunk_edges WHERE source_chunk_id IN (
                SELECT id FROM chunks WHERE document_id = ?1
             ) OR target_chunk_id IN (
                SELECT id FROM chunks WHERE document_id = ?1
             )",
            [document_id],
        )
        .map_err(|error| format!("清理 Knowledge graph 失败: {error}"))?;
    transaction
        .execute("DELETE FROM chunks WHERE document_id = ?1", [document_id])
        .map_err(|error| format!("清理 Knowledge chunks 失败: {error}"))?;
    let chunks = chunk_document(library_id, document_id, source_path, title, content, config);
    for chunk in &chunks {
        transaction
            .execute(
                "INSERT INTO chunks(
                    id, document_id, chunk_index, content, checksum, heading,
                    start_offset, end_offset
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    chunk.id,
                    chunk.document_id,
                    chunk.chunk_index as i64,
                    chunk.content,
                    chunk.checksum,
                    chunk.heading,
                    chunk.start_offset as i64,
                    chunk.end_offset as i64,
                ],
            )
            .map_err(|error| format!("写入 Knowledge chunk 失败: {error}"))?;
        transaction
            .execute(
                "INSERT INTO chunks_fts(chunk_id, content, heading) VALUES (?1, ?2, ?3)",
                params![chunk.id, chunk.content, chunk.heading],
            )
            .map_err(|error| format!("写入 Knowledge FTS chunk 失败: {error}"))?;
    }
    if config.indexes.graph {
        for pair in chunks.windows(2) {
            for (source, target, relation) in [
                (&pair[0].id, &pair[1].id, "next"),
                (&pair[1].id, &pair[0].id, "prev"),
            ] {
                transaction
                    .execute(
                        "INSERT INTO chunk_edges(source_chunk_id, target_chunk_id, relation)
                         VALUES (?1, ?2, ?3)",
                        params![source, target, relation],
                    )
                    .map_err(|error| format!("写入 Knowledge graph edge 失败: {error}"))?;
            }
        }
    }
    Ok(())
}

fn chunk_document(
    library_id: &str,
    document_id: &str,
    source_path: &str,
    title: &str,
    content: &str,
    config: &KnowledgeLibraryIndexConfig,
) -> Vec<KnowledgeChunk> {
    let target_chars = config.chunking.target_chars;
    let overlap_chars = config.chunking.overlap_chars;
    let boundaries = content
        .char_indices()
        .map(|(index, _)| index)
        .chain([content.len()])
        .collect::<Vec<_>>();
    let mut chunks = Vec::new();
    let mut start_char = 0;
    let mut heading: Option<String> = None;
    while start_char + 1 < boundaries.len() {
        let end_char = (start_char + target_chars).min(boundaries.len() - 1);
        let start = boundaries[start_char];
        let end = boundaries[end_char];
        let text = content[start..end].trim();
        if text.is_empty() {
            break;
        }
        for line in text.lines() {
            if let Some(value) = line.trim().strip_prefix('#') {
                let value = value.trim_start_matches('#').trim();
                if !value.is_empty() {
                    heading = Some(value.to_string());
                    break;
                }
            }
        }
        let chunk_index = chunks.len();
        let id = Uuid::new_v4().to_string();
        chunks.push(KnowledgeChunk {
            id,
            library_id: library_id.to_string(),
            document_id: document_id.to_string(),
            source_path: source_path.to_string(),
            title: title.to_string(),
            chunk_index,
            content: text.to_string(),
            checksum: blake3::hash(text.as_bytes()).to_hex().to_string(),
            heading: heading.clone(),
            start_offset: start,
            end_offset: end,
        });
        if end_char == boundaries.len() - 1 {
            break;
        }
        start_char = end_char.saturating_sub(overlap_chars);
    }
    chunks
}

fn keyword_candidates(
    connection: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<(KnowledgeChunk, f32)>, String> {
    let terms = query
        .split_whitespace()
        .filter(|term| !term.is_empty())
        .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
        .collect::<Vec<_>>();
    if terms.is_empty() {
        return Ok(Vec::new());
    }
    let fts_query = terms.join(" OR ");
    let mut statement = connection
        .prepare(
            "SELECT c.id, c.document_id, d.source_path, d.title, c.chunk_index,
                    c.content, c.checksum, c.heading, c.start_offset, c.end_offset,
                    bm25(chunks_fts)
             FROM chunks_fts
             JOIN chunks c ON c.id = chunks_fts.chunk_id
             JOIN documents d ON d.id = c.document_id
             WHERE chunks_fts MATCH ?1
             ORDER BY bm25(chunks_fts) LIMIT ?2",
        )
        .map_err(|error| format!("准备 Knowledge BM25 检索失败: {error}"))?;
    let rows = statement
        .query_map(params![fts_query, limit.max(1) as i64], |row| {
            let rank = row.get::<_, f64>(10)? as f32;
            Ok((chunk_from_row(row)?, 1.0 / (1.0 + rank.abs())))
        })
        .map_err(|error| format!("执行 Knowledge BM25 检索失败: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读取 Knowledge BM25 结果失败: {error}"))
}

fn vector_candidates(
    connection: &Connection,
    query_vector: &[f32],
    space_id: Option<&str>,
    limit: usize,
) -> Result<Vec<(KnowledgeChunk, f32)>, String> {
    if query_vector.is_empty() {
        return Ok(Vec::new());
    }
    let mut statement = connection
        .prepare(
            "SELECT c.id, c.document_id, d.source_path, d.title, c.chunk_index,
                    c.content, c.checksum, c.heading, c.start_offset, c.end_offset,
                    v.dimension, v.vector_blob
             FROM chunk_vectors v
             JOIN chunks c ON c.id = v.chunk_id
             JOIN documents d ON d.id = c.document_id
             WHERE v.space_id = ?1",
        )
        .map_err(|error| format!("准备 Knowledge vector 检索失败: {error}"))?;
    let rows = statement
        .query_map([space_id], |row| {
            let chunk = chunk_from_row(row)?;
            let dimension = row.get::<_, i64>(10)?.max(0) as usize;
            let blob = row.get::<_, Vec<u8>>(11)?;
            Ok((chunk, decode_vector(&blob, dimension)))
        })
        .map_err(|error| format!("执行 Knowledge vector 检索失败: {error}"))?;
    let mut results = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读取 Knowledge vector 结果失败: {error}"))?
        .into_iter()
        .filter_map(|(chunk, vector)| {
            (vector.len() == query_vector.len())
                .then(|| (chunk, cosine_similarity(query_vector, &vector)))
        })
        .collect::<Vec<_>>();
    results.sort_by(|left, right| right.1.total_cmp(&left.1));
    results.truncate(limit.max(1));
    Ok(results)
}

fn apply_graph_expansion(
    connection: &Connection,
    library: &KnowledgeLibrary,
    candidates: &mut HashMap<String, KnowledgeResult>,
) -> Result<(), String> {
    let seeds = candidates
        .values()
        .map(|result| (result.chunk_id.clone(), result.score))
        .collect::<Vec<_>>();
    for (chunk_id, seed_score) in seeds {
        let mut statement = connection
            .prepare(
                "SELECT c.id, c.document_id, d.source_path, d.title, c.chunk_index,
                        c.content, c.checksum, c.heading, c.start_offset, c.end_offset
                 FROM chunk_edges e
                 JOIN chunks c ON c.id = e.target_chunk_id
                 JOIN documents d ON d.id = c.document_id
                 WHERE e.source_chunk_id = ?1",
            )
            .map_err(|error| format!("准备 Knowledge graph 扩散失败: {error}"))?;
        let rows = statement
            .query_map([chunk_id], chunk_from_row)
            .map_err(|error| format!("执行 Knowledge graph 扩散失败: {error}"))?;
        for row in rows {
            let chunk = row.map_err(|error| format!("读取 Knowledge graph 结果失败: {error}"))?;
            let graph_score = seed_score * 0.08;
            candidates.entry(chunk.id.clone()).or_insert_with(|| {
                let mut result = result_from_chunk(library, chunk, graph_score);
                result.signals.push(KnowledgeSignal {
                    signal_type: KnowledgeSignalType::KnowledgeGraph,
                    score: graph_score,
                });
                result
            });
        }
    }
    Ok(())
}

fn result_from_chunk(
    library: &KnowledgeLibrary,
    chunk: KnowledgeChunk,
    score: f32,
) -> KnowledgeResult {
    KnowledgeResult {
        source_type: "knowledge".to_string(),
        library_id: library.id.clone(),
        library_name: library.name.clone(),
        document_id: chunk.document_id,
        source_path: chunk.source_path,
        title: chunk.title,
        chunk_id: chunk.id,
        chunk_index: chunk.chunk_index,
        heading: chunk.heading,
        content: chunk.content,
        score,
        signals: Vec::new(),
    }
}

fn chunk_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeChunk> {
    Ok(KnowledgeChunk {
        id: row.get(0)?,
        library_id: String::new(),
        document_id: row.get(1)?,
        source_path: row.get(2)?,
        title: row.get(3)?,
        chunk_index: row.get::<_, i64>(4)?.max(0) as usize,
        content: row.get(5)?,
        checksum: row.get(6)?,
        heading: row.get(7)?,
        start_offset: row.get::<_, i64>(8)?.max(0) as usize,
        end_offset: row.get::<_, i64>(9)?.max(0) as usize,
    })
}

fn configure_connection(connection: Connection) -> Result<Connection, String> {
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
        )
        .map_err(|error| format!("配置 Knowledge SQLite 连接失败: {error}"))?;
    Ok(connection)
}

fn encode_vector(vector: &[f32]) -> Vec<u8> {
    vector
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect()
}

fn decode_vector(blob: &[u8], dimension: usize) -> Vec<f32> {
    if blob.len() != dimension.saturating_mul(4) {
        return Vec::new();
    }
    blob.chunks_exact(4)
        .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap_or_default()))
        .collect()
}

fn cosine_similarity(left: &[f32], right: &[f32]) -> f32 {
    let dot = left.iter().zip(right).map(|(a, b)| a * b).sum::<f32>();
    let left_norm = left.iter().map(|value| value * value).sum::<f32>().sqrt();
    let right_norm = right.iter().map(|value| value * value).sum::<f32>().sqrt();
    if left_norm == 0.0 || right_norm == 0.0 {
        0.0
    } else {
        (dot / (left_norm * right_norm)).clamp(-1.0, 1.0)
    }
}

fn source_title(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Untitled")
        .to_string()
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn request(library_id: &str, source_path: &str, content: &str) -> KnowledgeIngestRequest {
        KnowledgeIngestRequest {
            library_id: library_id.to_string(),
            source_path: source_path.to_string(),
            title: None,
            mime_type: Some("text/markdown".to_string()),
            content: content.to_string(),
        }
    }

    fn semantic_config(route_key: &str) -> KnowledgeLibraryIndexConfig {
        let mut config = KnowledgeLibraryIndexConfig::default();
        config.embedding.enabled = true;
        config.embedding.route_key = route_key.to_string();
        config.indexes.semantic = true;
        config
    }

    fn semantic_descriptor() -> &'static str {
        r#"{"dimensions":2,"queryTaskType":"RETRIEVAL_QUERY","documentTaskType":"RETRIEVAL_DOCUMENT","encodingFormat":"float","adapterContractVersion":1}"#
    }

    #[test]
    fn library_document_chunk_and_source_round_trip() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let library = repository.create_library("Docs", None, None).unwrap();
        let document = repository
            .ingest(&request(
                &library.id,
                "docs/guide.md",
                "# Installation\nInstall the package with Bun.\n\n# Runtime\nStart the Tauri app.",
            ))
            .unwrap();
        assert_eq!(document.source_path, "docs/guide.md");
        assert!(document.chunk_count > 0);
        let chunks = repository
            .list_chunks(&library.id, Some(&document.id))
            .unwrap();
        assert_eq!(chunks.len(), document.chunk_count);
        assert!(chunks.iter().all(|chunk| chunk.library_id == library.id));

        let results = repository
            .search(&KnowledgeSearchRequest {
                query: "Installation Bun".to_string(),
                library_ids: vec![library.id.clone()],
                strategy: KnowledgeSearchStrategy::Keyword,
                limit: 5,
                min_score: 0.0,
                query_vector: None,
                space_id: None,
            })
            .unwrap();
        assert_eq!(results[0].source_type, "knowledge");
        assert_eq!(results[0].source_path, "docs/guide.md");
        assert_eq!(results[0].heading.as_deref(), Some("Installation"));
    }

    #[test]
    fn runtime_ignores_stale_manifest_index_identity_after_metadata_exists() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let mut config = KnowledgeLibraryIndexConfig::default();
        config.chunking.target_chars = 400;
        config.chunking.overlap_chars = 40;
        let library = repository
            .create_library("Metadata", None, Some(&config))
            .unwrap();
        repository
            .open_manifest()
            .unwrap()
            .execute(
                "UPDATE knowledge_libraries
                 SET config_json = '{\"schemaVersion\":999}',
                     embedding_model_id = 'stale-model', dimension = 777,
                     active_embedding_space_id = 'stale-space',
                     embedding_route_key = 'stale-route'
                 WHERE id = ?1",
                [&library.id],
            )
            .unwrap();

        let loaded = repository.get_library(&library.id).unwrap().unwrap();
        assert_eq!(loaded.config, config);
        assert_eq!(loaded.active_embedding_space_id, "");
        assert_eq!(loaded.embedding_route_key, "");
        assert_eq!(loaded.dimension, 0);
        let stored = repository
            .open_manifest()
            .unwrap()
            .query_row(
                "SELECT config_json, active_embedding_space_id
                 FROM knowledge_libraries WHERE id = ?1",
                [&library.id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .unwrap();
        assert_eq!(stored.0, r#"{"schemaVersion":999}"#);
        assert_eq!(stored.1, "stale-space");
    }

    #[test]
    fn legacy_empty_manifest_config_migrates_to_default_library_metadata() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let library_id = Uuid::new_v4().to_string();
        let library_path = repository.library_path(&library_id);
        repository.initialize_library(&library_path).unwrap();
        repository
            .open_manifest()
            .unwrap()
            .execute(
                "INSERT INTO knowledge_libraries(
                    id, name, db_path, config_json, created_at, updated_at
                 ) VALUES (?1, 'Legacy Empty', ?2, '{}', 1, 1)",
                params![library_id, library_path.to_string_lossy()],
            )
            .unwrap();

        repository.initialize().unwrap();
        let migrated = repository.get_library(&library_id).unwrap().unwrap();
        assert_eq!(migrated.config, KnowledgeLibraryIndexConfig::default());
        let metadata_count = repository
            .open_library(&library_path)
            .unwrap()
            .query_row("SELECT COUNT(*) FROM library_metadata", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        let manifest_config = repository
            .open_manifest()
            .unwrap()
            .query_row(
                "SELECT config_json FROM knowledge_libraries WHERE id = ?1",
                [&library_id],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        assert_eq!(metadata_count, 1);
        assert_eq!(manifest_config, "{}");
    }

    #[test]
    fn create_and_update_library_preserve_the_index_config_snapshot() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let mut config = semantic_config("profile:model");
        config.chunking.target_chars = 400;
        config.chunking.overlap_chars = 40;
        config.embedding.requested_dimensions = Some(768);
        let library = repository
            .create_library("Original", Some("before"), Some(&config))
            .unwrap();
        assert_eq!(library.config, config);
        let manifest_config = repository
            .open_manifest()
            .unwrap()
            .query_row(
                "SELECT config_json FROM knowledge_libraries WHERE id = ?1",
                [&library.id],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        assert_eq!(manifest_config, "{}");

        let updated = repository
            .update_library(&library.id, "Renamed", Some("after"))
            .unwrap();
        assert_eq!(updated.name, "Renamed");
        assert_eq!(updated.description.as_deref(), Some("after"));
        assert_eq!(updated.config, config);
    }

    #[test]
    fn ingest_uses_the_library_chunk_size_and_overlap() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let mut config = KnowledgeLibraryIndexConfig::default();
        config.chunking.target_chars = 200;
        config.chunking.overlap_chars = 50;
        let library = repository
            .create_library("Chunked", None, Some(&config))
            .unwrap();
        let document = repository
            .ingest(&request(&library.id, "chunked.txt", &"x".repeat(450)))
            .unwrap();

        let chunks = repository
            .list_chunks(&library.id, Some(&document.id))
            .unwrap();
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].start_offset, 0);
        assert_eq!(chunks[0].end_offset, 200);
        assert_eq!(chunks[1].start_offset, 150);
        assert_eq!(chunks[2].start_offset, 300);
        assert_eq!(chunks[2].end_offset, 450);
    }

    #[test]
    fn invalid_library_config_is_rejected_without_changing_existing_state() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let library = repository.create_library("Invalid", None, None).unwrap();
        let document = repository
            .ingest(&request(&library.id, "invalid.txt", &"x".repeat(450)))
            .unwrap();
        let before_chunks = repository
            .list_chunks(&library.id, Some(&document.id))
            .unwrap();
        let mut invalid = library.config.clone();
        invalid.chunking.overlap_chars = invalid.chunking.target_chars;

        assert!(repository
            .apply_library_config_and_rebuild(&library.id, &invalid)
            .is_err());
        let after = repository.get_library(&library.id).unwrap().unwrap();
        let after_chunks = repository
            .list_chunks(&library.id, Some(&document.id))
            .unwrap();
        assert_eq!(after.config, library.config);
        assert_eq!(
            after_chunks
                .iter()
                .map(|chunk| &chunk.id)
                .collect::<Vec<_>>(),
            before_chunks
                .iter()
                .map(|chunk| &chunk.id)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn failed_config_rebuild_rolls_back_chunks_vectors_and_metadata_config() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let config = semantic_config("model-a");
        let library = repository
            .create_library("Rollback", None, Some(&config))
            .unwrap();
        let document = repository
            .ingest(&request(&library.id, "rollback.txt", &"x".repeat(450)))
            .unwrap();
        let before_chunks = repository
            .list_chunks(&library.id, Some(&document.id))
            .unwrap();
        repository
            .save_vectors(
                &library.id,
                "space-a",
                semantic_descriptor(),
                "model-a",
                &[KnowledgeVectorRecord {
                    chunk_id: before_chunks[0].id.clone(),
                    vector: vec![1.0, 0.0],
                }],
            )
            .unwrap();
        repository
            .open_library(&repository.library_file_path(&library.id))
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER fail_rebuild_chunk_insert
                 BEFORE INSERT ON chunks
                 BEGIN
                   SELECT RAISE(ABORT, 'forced rebuild failure');
                 END;",
            )
            .unwrap();
        let mut next = config.clone();
        next.chunking.target_chars = 200;
        next.chunking.overlap_chars = 50;

        assert!(repository
            .apply_library_config_and_rebuild(&library.id, &next)
            .is_err());
        let after = repository.get_library(&library.id).unwrap().unwrap();
        let after_chunks = repository
            .list_chunks(&library.id, Some(&document.id))
            .unwrap();
        let status = repository.get_index_status(&library.id).unwrap();
        assert_eq!(after.config, config);
        assert_eq!(status.active_embedding_space_id, "space-a");
        assert_eq!(status.vectorized_chunks, 1);
        assert_eq!(
            after_chunks
                .iter()
                .map(|chunk| &chunk.id)
                .collect::<Vec<_>>(),
            before_chunks
                .iter()
                .map(|chunk| &chunk.id)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn applying_library_config_rebuilds_indexes_and_clears_the_active_vector_space() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let config = semantic_config("model-a");
        let library = repository
            .create_library("Apply", None, Some(&config))
            .unwrap();
        let document = repository
            .ingest(&request(&library.id, "apply.txt", &"x".repeat(450)))
            .unwrap();
        let chunk = repository
            .list_chunks(&library.id, Some(&document.id))
            .unwrap()
            .remove(0);
        repository
            .save_vectors(
                &library.id,
                "space-a",
                semantic_descriptor(),
                "model-a",
                &[KnowledgeVectorRecord {
                    chunk_id: chunk.id,
                    vector: vec![1.0, 0.0],
                }],
            )
            .unwrap();
        let mut next = KnowledgeLibraryIndexConfig::default();
        next.chunking.target_chars = 200;
        next.chunking.overlap_chars = 50;
        next.indexes.graph = false;

        assert_eq!(
            repository
                .apply_library_config_and_rebuild(&library.id, &next)
                .unwrap(),
            1
        );
        let applied = repository.get_library(&library.id).unwrap().unwrap();
        let chunks = repository
            .list_chunks(&library.id, Some(&document.id))
            .unwrap();
        let connection = repository
            .open_library(&repository.library_file_path(&library.id))
            .unwrap();
        let vector_count = connection
            .query_row("SELECT COUNT(*) FROM chunk_vectors", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        let edge_count = connection
            .query_row("SELECT COUNT(*) FROM chunk_edges", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        assert_eq!(applied.config, next);
        assert_eq!(applied.active_embedding_space_id, "");
        assert_eq!(applied.dimension, 0);
        assert_eq!(chunks.len(), 3);
        assert_eq!(vector_count, 0);
        assert_eq!(edge_count, 0);
    }

    #[test]
    fn auto_with_query_vector_reports_keyword_and_vector_signals() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let mut config = semantic_config("model-hybrid");
        config.embedding.requested_dimensions = Some(768);
        let library = repository
            .create_library("Hybrid", None, Some(&config))
            .unwrap();
        let document = repository
            .ingest(&request(
                &library.id,
                "hybrid.md",
                "# Install\nInstall the package with Bun.",
            ))
            .unwrap();
        let chunk = repository
            .list_chunks(&library.id, Some(&document.id))
            .unwrap()
            .remove(0);
        repository
            .save_vectors(
                &library.id,
                "space-hybrid",
                semantic_descriptor(),
                "model-hybrid",
                &[KnowledgeVectorRecord {
                    chunk_id: chunk.id,
                    vector: vec![1.0, 0.0],
                }],
            )
            .unwrap();
        let indexed = repository.get_library(&library.id).unwrap().unwrap();
        assert_eq!(indexed.config.embedding.requested_dimensions, Some(768));
        assert_eq!(indexed.dimension, 2);

        let results = repository
            .search(&KnowledgeSearchRequest {
                query: "Install Bun".to_string(),
                library_ids: vec![library.id],
                strategy: KnowledgeSearchStrategy::Auto,
                limit: 5,
                min_score: 0.0,
                query_vector: Some(vec![1.0, 0.0]),
                space_id: Some("space-hybrid".to_string()),
            })
            .unwrap();

        assert_eq!(results.len(), 1);
        assert!(results[0]
            .signals
            .iter()
            .any(|signal| matches!(signal.signal_type, KnowledgeSignalType::KnowledgeBm25)));
        assert!(results[0]
            .signals
            .iter()
            .any(|signal| matches!(signal.signal_type, KnowledgeSignalType::KnowledgeVector)));
    }

    #[test]
    fn reingest_replaces_chunks_and_vector_search_is_isolated_per_library() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let config = semantic_config("model");
        let first = repository
            .create_library("First", None, Some(&config))
            .unwrap();
        let second = repository.create_library("Second", None, None).unwrap();
        let document = repository
            .ingest(&request(&first.id, "first.md", "alpha beta"))
            .unwrap();
        repository
            .ingest(&request(&first.id, "first.md", "gamma delta"))
            .unwrap();
        let documents = repository.list_documents(&first.id).unwrap();
        assert_eq!(documents.len(), 1);
        assert_eq!(documents[0].id, document.id);

        let chunk_id = repository
            .search(&KnowledgeSearchRequest {
                query: "gamma".to_string(),
                library_ids: vec![first.id.clone()],
                strategy: KnowledgeSearchStrategy::Keyword,
                limit: 1,
                min_score: 0.0,
                query_vector: None,
                space_id: None,
            })
            .unwrap()[0]
            .chunk_id
            .clone();
        repository
            .save_vectors(
                &first.id,
                "legacy-test-space",
                semantic_descriptor(),
                "model",
                &[KnowledgeVectorRecord {
                    chunk_id,
                    vector: vec![1.0, 0.0],
                }],
            )
            .unwrap();
        let semantic = repository
            .search(&KnowledgeSearchRequest {
                query: "rewrite".to_string(),
                library_ids: vec![first.id.clone()],
                strategy: KnowledgeSearchStrategy::Semantic,
                limit: 1,
                min_score: 0.0,
                query_vector: Some(vec![1.0, 0.0]),
                space_id: Some("legacy-test-space".to_string()),
            })
            .unwrap();
        assert_eq!(semantic.len(), 1);

        let second_path = repository.library_file_path(&second.id);
        repository.delete_library(&first.id).unwrap();
        assert!(second_path.exists());
        assert_eq!(repository.list_libraries().unwrap().len(), 1);
    }

    #[test]
    fn deleting_document_removes_fts_vectors_and_graph_edges() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let config = semantic_config("model");
        let library = repository
            .create_library("Delete", None, Some(&config))
            .unwrap();
        let content = format!(
            "# First\n{}\n# Second\n{}",
            "alpha ".repeat(220),
            "beta ".repeat(220)
        );
        let document = repository
            .ingest(&request(&library.id, "delete.md", &content))
            .unwrap();
        assert!(document.chunk_count > 1);

        let first_chunk = repository
            .search(&KnowledgeSearchRequest {
                query: "alpha".to_string(),
                library_ids: vec![library.id.clone()],
                strategy: KnowledgeSearchStrategy::Keyword,
                limit: 1,
                min_score: 0.0,
                query_vector: None,
                space_id: None,
            })
            .unwrap()[0]
            .chunk_id
            .clone();
        repository
            .save_vectors(
                &library.id,
                "legacy-delete-space",
                semantic_descriptor(),
                "model",
                &[KnowledgeVectorRecord {
                    chunk_id: first_chunk,
                    vector: vec![1.0, 0.0],
                }],
            )
            .unwrap();

        repository
            .delete_document(&library.id, &document.id)
            .unwrap();

        let connection = repository
            .open_library(&repository.library_file_path(&library.id))
            .unwrap();
        for table in ["chunks", "chunks_fts", "chunk_vectors", "chunk_edges"] {
            let count = connection
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap();
            assert_eq!(count, 0, "{table} should be empty after deletion");
        }
    }

    #[test]
    fn rebuilding_library_clears_vectors_and_embedding_configuration() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let config = semantic_config("model-a");
        let library = repository
            .create_library("Rebuild", None, Some(&config))
            .unwrap();
        let document = repository
            .ingest(&request(&library.id, "rebuild.md", "alpha beta gamma"))
            .unwrap();
        let chunk = repository
            .list_chunks(&library.id, Some(&document.id))
            .unwrap()
            .remove(0);
        repository
            .save_vectors(
                &library.id,
                "space-a",
                semantic_descriptor(),
                "model-a",
                &[KnowledgeVectorRecord {
                    chunk_id: chunk.id,
                    vector: vec![1.0, 0.0],
                }],
            )
            .unwrap();

        repository.rebuild_library(&library.id).unwrap();

        let rebuilt = repository.get_library(&library.id).unwrap().unwrap();
        assert_eq!(rebuilt.embedding_model_id, "");
        assert_eq!(rebuilt.dimension, 0);
        let connection = repository
            .open_library(&repository.library_file_path(&library.id))
            .unwrap();
        let vector_count = connection
            .query_row("SELECT COUNT(*) FROM chunk_vectors", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        assert_eq!(vector_count, 0);
    }

    #[test]
    fn index_status_tracks_only_the_active_model_coverage() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let config = semantic_config("model-a");
        let library = repository
            .create_library("Coverage", None, Some(&config))
            .unwrap();
        let document = repository
            .ingest(&request(
                &library.id,
                "coverage.md",
                &format!(
                    "# Alpha\n{}\n# Beta\n{}",
                    "alpha ".repeat(220),
                    "beta ".repeat(220)
                ),
            ))
            .unwrap();
        let chunks = repository
            .list_chunks(&library.id, Some(&document.id))
            .unwrap();
        assert!(chunks.len() > 1);

        repository
            .save_vectors(
                &library.id,
                "space-a",
                semantic_descriptor(),
                "model-a",
                &[KnowledgeVectorRecord {
                    chunk_id: chunks[0].id.clone(),
                    vector: vec![1.0, 0.0],
                }],
            )
            .unwrap();
        let partial = repository.get_index_status(&library.id).unwrap();
        assert_eq!(partial.vectorized_chunks, 1);
        assert_eq!(partial.pending_chunks, chunks.len() - 1);

        repository
            .switch_embedding_route(&library.id, "space-a", "model-b")
            .unwrap();
        repository
            .save_vectors(
                &library.id,
                "space-b",
                semantic_descriptor(),
                "model-b",
                &[KnowledgeVectorRecord {
                    chunk_id: chunks[1].id.clone(),
                    vector: vec![0.0, 1.0],
                }],
            )
            .unwrap();
        let switched = repository.get_index_status(&library.id).unwrap();
        assert_eq!(switched.embedding_model_id, "model-b");
        assert_eq!(switched.vectorized_chunks, 1);
        assert_eq!(switched.pending_chunks, chunks.len() - 1);
    }

    #[test]
    fn semantic_search_rejects_precomputed_vector_without_space_id() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        let error = repository
            .search(&KnowledgeSearchRequest {
                query: "query".to_string(),
                library_ids: Vec::new(),
                strategy: KnowledgeSearchStrategy::Semantic,
                limit: 5,
                min_score: 0.0,
                query_vector: Some(vec![1.0, 0.0]),
                space_id: None,
            })
            .unwrap_err();

        assert_eq!(error, "预计算 Knowledge 查询向量必须指定 spaceId");
    }

    #[test]
    fn initialize_migrates_legacy_model_vectors_without_merging_routes() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        std::fs::create_dir_all(&repository.libraries_dir).unwrap();
        let library_id = Uuid::new_v4().to_string();
        let library_path = repository.library_path(&library_id);
        let legacy_library = Connection::open(&library_path).unwrap();
        legacy_library
            .execute_batch(
                "CREATE TABLE chunks(
                   id TEXT PRIMARY KEY,
                   document_id TEXT NOT NULL,
                   chunk_index INTEGER NOT NULL,
                   content TEXT NOT NULL,
                   checksum TEXT NOT NULL,
                   heading TEXT,
                   start_offset INTEGER NOT NULL,
                   end_offset INTEGER NOT NULL,
                   UNIQUE(document_id, chunk_index)
                 );
                 INSERT INTO chunks(
                   id, document_id, chunk_index, content, checksum,
                   start_offset, end_offset
                 ) VALUES ('chunk-a', 'document-a', 0, 'alpha', 'hash', 0, 5);
                 CREATE TABLE chunk_vectors(
                   chunk_id TEXT NOT NULL,
                   model_id TEXT NOT NULL,
                   dimension INTEGER NOT NULL,
                   vector_blob BLOB NOT NULL,
                   updated_at INTEGER NOT NULL,
                   PRIMARY KEY(chunk_id, model_id)
                 );",
            )
            .unwrap();
        legacy_library
            .execute(
                "INSERT INTO chunk_vectors(
                    chunk_id, model_id, dimension, vector_blob, updated_at
                 ) VALUES ('chunk-a', 'profile-a:model-a', 2, ?1, 1)",
                [encode_vector(&[1.0, 0.0])],
            )
            .unwrap();
        drop(legacy_library);

        std::fs::create_dir_all(repository.manifest_path.parent().unwrap()).unwrap();
        let manifest = Connection::open(&repository.manifest_path).unwrap();
        manifest
            .execute_batch(
                "CREATE TABLE knowledge_libraries(
                   id TEXT PRIMARY KEY,
                   name TEXT NOT NULL,
                   description TEXT,
                   db_path TEXT NOT NULL,
                   embedding_model_id TEXT NOT NULL DEFAULT '',
                   dimension INTEGER NOT NULL DEFAULT 0,
                   config_json TEXT NOT NULL DEFAULT '{}',
                   created_at INTEGER NOT NULL,
                   updated_at INTEGER NOT NULL
                 );",
            )
            .unwrap();
        manifest
            .execute(
                "INSERT INTO knowledge_libraries(
                    id, name, db_path, embedding_model_id, dimension,
                    config_json, created_at, updated_at
                 ) VALUES (?1, 'Legacy', ?2, 'profile-a:model-a', 2, '{}', 1, 1)",
                params![library_id, library_path.to_string_lossy()],
            )
            .unwrap();
        drop(manifest);

        repository.initialize().unwrap();
        let migrated = repository.get_library(&library_id).unwrap().unwrap();
        assert_eq!(migrated.embedding_route_key, "profile-a:model-a");
        assert!(migrated.config.embedding.enabled);
        assert!(migrated.config.indexes.semantic);
        assert_eq!(migrated.config.embedding.route_key, "profile-a:model-a");
        let migrated_space_id = migrated.active_embedding_space_id.clone();
        assert!(migrated
            .active_embedding_space_id
            .starts_with("legacy-route:"));
        assert!(
            migrated.embedding_space_descriptor.unwrap()["model"]["canonicalId"]
                .as_str()
                .unwrap()
                .starts_with("legacy-route/")
        );

        let migrated_library = Connection::open(&library_path).unwrap();
        let columns = migrated_library
            .prepare("PRAGMA table_info(chunk_vectors)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(columns.iter().any(|column| column == "space_id"));
        assert!(!columns.iter().any(|column| column == "model_id"));
        let vector_count = migrated_library
            .query_row("SELECT COUNT(*) FROM chunk_vectors", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        assert_eq!(vector_count, 1);
        drop(migrated_library);

        repository
            .open_manifest()
            .unwrap()
            .execute(
                "UPDATE knowledge_libraries
                 SET config_json = '{\"schemaVersion\":999}',
                     embedding_model_id = 'stale:model', dimension = 999,
                     active_embedding_space_id = 'stale-space',
                     embedding_route_key = 'stale:route'
                 WHERE id = ?1",
                [&library_id],
            )
            .unwrap();
        repository.initialize().unwrap();
        let reloaded = repository.get_library(&library_id).unwrap().unwrap();
        assert_eq!(reloaded.embedding_route_key, "profile-a:model-a");
        assert_eq!(reloaded.active_embedding_space_id, migrated_space_id);
        assert_eq!(reloaded.dimension, 2);
        assert_eq!(reloaded.config.embedding.route_key, "profile-a:model-a");
    }
}
