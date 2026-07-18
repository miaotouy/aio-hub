// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use super::types::*;
use ignore::WalkBuilder;
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
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

#[derive(Debug, Clone, Default)]
struct LibraryCounts {
    documents: usize,
    chunks: usize,
    sources: usize,
    pending_tasks: usize,
    failed_tasks: usize,
    keyword_chunks: usize,
    vectorized_chunks: usize,
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
                let counts = self.library_counts(
                    &id,
                    &metadata.active_embedding_space_id,
                    metadata.dimension,
                )?;
                let descriptor =
                    self.embedding_space_descriptor(&id, &metadata.active_embedding_space_id)?;
                let keyword_index_status = if counts.keyword_chunks == counts.chunks {
                    "ready"
                } else {
                    "partial"
                };
                let semantic_index_status = if metadata.active_embedding_space_id.is_empty() {
                    "notBuilt"
                } else if counts.vectorized_chunks == counts.chunks {
                    "ready"
                } else {
                    "partial"
                };
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
                    document_count: counts.documents,
                    chunk_count: counts.chunks,
                    source_count: counts.sources,
                    pending_task_count: counts.pending_tasks,
                    failed_task_count: counts.failed_tasks,
                    keyword_index_status: keyword_index_status.to_string(),
                    semantic_index_status: semantic_index_status.to_string(),
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

    pub fn enqueue_paths(
        &self,
        request: &KnowledgeEnqueuePathsRequest,
    ) -> Result<KnowledgeEnqueueResult, String> {
        if request.parser_version.trim().is_empty() {
            return Err("Knowledge parser version 不能为空".to_string());
        }
        let path = self.resolve_library_path(&request.library_id)?;
        let max_file_bytes = request.max_file_bytes.max(1);
        let max_attempts = request.max_attempts.clamp(1, 10);
        let mut failures = Vec::new();
        let mut inspected = Vec::new();
        let mut seen = HashSet::new();
        for source_path in &request.paths {
            match inspect_stable_file(source_path, max_file_bytes) {
                Ok(file) if seen.insert(file.source_path.clone()) => inspected.push(file),
                Ok(_) => {}
                Err(error) => failures.push(KnowledgeEnqueueFailure {
                    source_path: source_path.clone(),
                    message: error,
                }),
            }
        }

        let mut connection = self.open_library(&path)?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| format!("开启 Knowledge ingest 入队事务失败: {error}"))?;
        let mut task_ids = Vec::new();
        let mut skipped_unchanged = 0;
        let mut skipped_queued = 0;
        for file in inspected {
            let source_id = ensure_source_for_file(
                &transaction,
                request.source_id.as_deref(),
                &file.source_path,
            )?;
            let source_file = transaction
                .query_row(
                    "SELECT id, current_checksum, status, parser_version
                     FROM knowledge_source_files
                     WHERE source_id = ?1 AND source_path = ?2",
                    params![source_id, file.source_path],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                        ))
                    },
                )
                .optional()
                .map_err(|error| format!("读取 Knowledge source file 失败: {error}"))?;
            if source_file
                .as_ref()
                .is_some_and(|(_, checksum, status, parser_version)| {
                    checksum == &file.checksum
                        && status == "ready"
                        && parser_version == &request.parser_version
                })
            {
                skipped_unchanged += 1;
                continue;
            }
            let source_file_id = source_file
                .as_ref()
                .map(|item| item.0.clone())
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let already_queued = transaction
                .query_row(
                    "SELECT 1 FROM knowledge_ingest_tasks
                     WHERE source_file_id = ?1 AND expected_checksum = ?2
                       AND operation = 'upsert' AND parser_version = ?3
                       AND status IN ('pending', 'processing', 'retry')
                     LIMIT 1",
                    params![source_file_id, file.checksum, request.parser_version],
                    |_| Ok(()),
                )
                .optional()
                .map_err(|error| format!("检查 Knowledge ingest 重复任务失败: {error}"))?
                .is_some();
            if already_queued {
                skipped_queued += 1;
                continue;
            }
            let timestamp = now();
            transaction
                .execute(
                    "INSERT INTO knowledge_source_files(
                        id, source_id, source_path, observed_checksum,
                        file_size, modified_at, status, created_at, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?7)
                     ON CONFLICT(source_id, source_path) DO UPDATE SET
                        observed_checksum = excluded.observed_checksum,
                        file_size = excluded.file_size,
                        modified_at = excluded.modified_at,
                        status = 'pending', last_error = NULL,
                        updated_at = excluded.updated_at",
                    params![
                        source_file_id,
                        source_id,
                        file.source_path,
                        file.checksum,
                        file.file_size as i64,
                        file.modified_at,
                        timestamp
                    ],
                )
                .map_err(|error| format!("写入 Knowledge source file 失败: {error}"))?;
            let task_id = Uuid::new_v4().to_string();
            transaction
                .execute(
                    "INSERT INTO knowledge_ingest_tasks(
                        id, source_id, source_file_id, source_path, operation,
                        expected_checksum, file_size, modified_at, parser_version,
                        status, attempt_count, max_attempts, available_at,
                        cancel_requested, created_at, updated_at
                     ) VALUES (
                        ?1, ?2, ?3, ?4, 'upsert', ?5, ?6, ?7, ?8,
                        'pending', 0, ?9, ?10, 0, ?10, ?10
                     )",
                    params![
                        task_id,
                        source_id,
                        source_file_id,
                        file.source_path,
                        file.checksum,
                        file.file_size as i64,
                        file.modified_at,
                        request.parser_version,
                        max_attempts as i64,
                        timestamp
                    ],
                )
                .map_err(|error| format!("写入 Knowledge ingest task 失败: {error}"))?;
            task_ids.push(task_id);
        }
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge ingest 入队失败: {error}"))?;
        Ok(KnowledgeEnqueueResult {
            queued: task_ids.len(),
            task_ids,
            skipped_unchanged,
            skipped_queued,
            failures,
        })
    }

    pub fn list_sources(&self, library_id: &str) -> Result<Vec<KnowledgeSource>, String> {
        let path = self.resolve_library_path(library_id)?;
        let connection = self.open_library(&path)?;
        let mut statement = connection
            .prepare(
                "SELECT s.id, s.kind, s.root_path, s.recursive, s.ignore_json,
                        s.status, s.last_scan_at, s.last_error, s.created_at, s.updated_at,
                        COUNT(DISTINCT f.id),
                        COUNT(DISTINCT CASE WHEN t.status IN ('pending', 'processing', 'retry')
                                           THEN t.id END),
                        COUNT(DISTINCT CASE WHEN t.status = 'failed' THEN t.id END)
                 FROM knowledge_sources s
                 LEFT JOIN knowledge_source_files f ON f.source_id = s.id
                 LEFT JOIN knowledge_ingest_tasks t ON t.source_id = s.id
                 GROUP BY s.id ORDER BY s.updated_at DESC, s.id",
            )
            .map_err(|error| format!("准备 Knowledge source 列表失败: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                let kind = parse_source_kind(&row.get::<_, String>(1)?)?;
                let ignore_json = row.get::<_, String>(4)?;
                Ok(KnowledgeSource {
                    id: row.get(0)?,
                    library_id: library_id.to_string(),
                    kind,
                    root_path: row.get(2)?,
                    recursive: row.get::<_, i64>(3)? != 0,
                    ignore_patterns: serde_json::from_str(&ignore_json).unwrap_or_default(),
                    status: row.get(5)?,
                    last_scan_at: row.get(6)?,
                    last_error: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                    file_count: row.get::<_, i64>(10)?.max(0) as usize,
                    pending_task_count: row.get::<_, i64>(11)?.max(0) as usize,
                    failed_task_count: row.get::<_, i64>(12)?.max(0) as usize,
                })
            })
            .map_err(|error| format!("查询 Knowledge source 失败: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取 Knowledge source 失败: {error}"))
    }

    pub fn list_ingest_tasks(
        &self,
        library_id: &str,
        limit: usize,
    ) -> Result<Vec<KnowledgeIngestTask>, String> {
        let path = self.resolve_library_path(library_id)?;
        let connection = self.open_library(&path)?;
        let mut statement = connection
            .prepare(
                "SELECT id, source_id, source_file_id, source_path, operation,
                        expected_checksum, file_size, modified_at, parser_version,
                        status, attempt_count, max_attempts, available_at,
                        lease_token, lease_expires_at, cancel_requested, last_error,
                        created_at, updated_at
                 FROM knowledge_ingest_tasks
                 ORDER BY created_at DESC, id LIMIT ?1",
            )
            .map_err(|error| format!("准备 Knowledge ingest task 列表失败: {error}"))?;
        let rows = statement
            .query_map([limit.clamp(1, 1000) as i64], |row| {
                ingest_task_from_row(library_id, row)
            })
            .map_err(|error| format!("查询 Knowledge ingest task 失败: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取 Knowledge ingest task 失败: {error}"))
    }

    pub fn claim_ingest_task(
        &self,
        library_id: &str,
        lease_seconds: usize,
    ) -> Result<Option<KnowledgeIngestTask>, String> {
        let path = self.resolve_library_path(library_id)?;
        let mut connection = self.open_library(&path)?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| format!("开启 Knowledge ingest claim 事务失败: {error}"))?;
        let timestamp = now();
        transaction
            .execute(
                "UPDATE knowledge_ingest_tasks
                 SET status = CASE
                       WHEN cancel_requested = 1 THEN 'cancelled'
                       WHEN attempt_count >= max_attempts THEN 'failed'
                       ELSE 'retry'
                     END,
                     available_at = ?1, lease_token = NULL, lease_expires_at = NULL,
                     last_error = CASE
                       WHEN cancel_requested = 1 THEN last_error
                       ELSE '任务 lease 已过期，等待恢复'
                     END,
                     updated_at = ?1
                 WHERE status = 'processing' AND lease_expires_at <= ?1",
                [timestamp],
            )
            .map_err(|error| format!("恢复 Knowledge 过期 ingest lease 失败: {error}"))?;
        transaction
            .execute(
                "UPDATE knowledge_source_files
                 SET status = COALESCE((
                       SELECT t.status FROM knowledge_ingest_tasks t
                       WHERE t.source_file_id = knowledge_source_files.id
                       ORDER BY t.updated_at DESC, t.id DESC LIMIT 1
                     ), status),
                     last_error = (
                       SELECT t.last_error FROM knowledge_ingest_tasks t
                       WHERE t.source_file_id = knowledge_source_files.id
                       ORDER BY t.updated_at DESC, t.id DESC LIMIT 1
                     ),
                     updated_at = ?1
                 WHERE id IN (
                   SELECT source_file_id FROM knowledge_ingest_tasks
                   WHERE updated_at = ?1 AND lease_token IS NULL
                     AND status IN ('retry', 'failed', 'cancelled')
                 )",
                [timestamp],
            )
            .map_err(|error| format!("同步 Knowledge 过期 source file 状态失败: {error}"))?;
        let task_id = transaction
            .query_row(
                "SELECT id FROM knowledge_ingest_tasks
                 WHERE status IN ('pending', 'retry')
                   AND available_at <= ?1 AND cancel_requested = 0
                 ORDER BY available_at, created_at, id LIMIT 1",
                [timestamp],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| format!("选择 Knowledge ingest task 失败: {error}"))?;
        let Some(task_id) = task_id else {
            transaction
                .commit()
                .map_err(|error| format!("提交空 Knowledge ingest claim 失败: {error}"))?;
            return Ok(None);
        };
        let lease_token = Uuid::new_v4().to_string();
        let lease_expires_at = timestamp + lease_seconds.clamp(30, 3600) as i64;
        transaction
            .execute(
                "UPDATE knowledge_ingest_tasks
                 SET status = 'processing', attempt_count = attempt_count + 1,
                     lease_token = ?2, lease_expires_at = ?3, updated_at = ?4
                 WHERE id = ?1",
                params![task_id, lease_token, lease_expires_at, timestamp],
            )
            .map_err(|error| format!("领取 Knowledge ingest task 失败: {error}"))?;
        transaction
            .execute(
                "UPDATE knowledge_source_files SET status = 'processing', updated_at = ?2
                 WHERE id = (
                   SELECT source_file_id FROM knowledge_ingest_tasks WHERE id = ?1
                 )",
                params![task_id, timestamp],
            )
            .map_err(|error| format!("更新 Knowledge source file 处理状态失败: {error}"))?;
        let task = transaction
            .query_row(
                "SELECT id, source_id, source_file_id, source_path, operation,
                        expected_checksum, file_size, modified_at, parser_version,
                        status, attempt_count, max_attempts, available_at,
                        lease_token, lease_expires_at, cancel_requested, last_error,
                        created_at, updated_at
                 FROM knowledge_ingest_tasks WHERE id = ?1",
                [&task_id],
                |row| ingest_task_from_row(library_id, row),
            )
            .map_err(|error| format!("读取已领取 Knowledge ingest task 失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge ingest claim 失败: {error}"))?;
        Ok(Some(task))
    }

    pub fn fail_ingest_task(
        &self,
        request: &KnowledgeFailIngestTaskRequest,
    ) -> Result<KnowledgeIngestTask, String> {
        let path = self.resolve_library_path(&request.library_id)?;
        let mut connection = self.open_library(&path)?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| format!("开启 Knowledge ingest fail 事务失败: {error}"))?;
        let timestamp = now();
        let (source_file_id, attempt_count, max_attempts, cancel_requested) = transaction
            .query_row(
                "SELECT source_file_id, attempt_count, max_attempts, cancel_requested
                 FROM knowledge_ingest_tasks
                 WHERE id = ?1 AND status = 'processing' AND lease_token = ?2
                   AND lease_expires_at > ?3",
                params![request.task_id, request.lease_token, timestamp],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)? != 0,
                    ))
                },
            )
            .optional()
            .map_err(|error| format!("校验 Knowledge ingest fail lease 失败: {error}"))?
            .ok_or_else(|| "Knowledge ingest task lease 已失效".to_string())?;
        let next_status = if cancel_requested {
            "cancelled"
        } else if request.retryable && attempt_count < max_attempts {
            "retry"
        } else {
            "failed"
        };
        transaction
            .execute(
                "UPDATE knowledge_ingest_tasks
                 SET status = ?3, available_at = ?4, lease_token = NULL,
                     lease_expires_at = NULL, last_error = ?5, updated_at = ?6
                 WHERE id = ?1 AND lease_token = ?2",
                params![
                    request.task_id,
                    request.lease_token,
                    next_status,
                    timestamp + request.retry_delay_seconds.min(3600) as i64,
                    request.error,
                    timestamp
                ],
            )
            .map_err(|error| format!("更新 Knowledge ingest fail 状态失败: {error}"))?;
        transaction
            .execute(
                "UPDATE knowledge_source_files
                 SET status = ?2, last_error = ?3, updated_at = ?4 WHERE id = ?1",
                params![source_file_id, next_status, request.error, timestamp],
            )
            .map_err(|error| format!("更新 Knowledge source file 失败状态失败: {error}"))?;
        let task = transaction
            .query_row(
                "SELECT id, source_id, source_file_id, source_path, operation,
                        expected_checksum, file_size, modified_at, parser_version,
                        status, attempt_count, max_attempts, available_at,
                        lease_token, lease_expires_at, cancel_requested, last_error,
                        created_at, updated_at
                 FROM knowledge_ingest_tasks WHERE id = ?1",
                [&request.task_id],
                |row| ingest_task_from_row(&request.library_id, row),
            )
            .map_err(|error| format!("读取失败后的 Knowledge ingest task 失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge ingest fail 失败: {error}"))?;
        Ok(task)
    }

    pub fn cancel_ingest_task(&self, library_id: &str, task_id: &str) -> Result<(), String> {
        let path = self.resolve_library_path(library_id)?;
        let mut connection = self.open_library(&path)?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| format!("开启 Knowledge ingest cancel 事务失败: {error}"))?;
        let timestamp = now();
        let changed = transaction
            .execute(
                "UPDATE knowledge_ingest_tasks
                 SET cancel_requested = 1,
                     status = CASE WHEN status IN ('pending', 'retry')
                                   THEN 'cancelled' ELSE status END,
                     updated_at = ?2
                 WHERE id = ?1 AND status IN ('pending', 'processing', 'retry')",
                params![task_id, timestamp],
            )
            .map_err(|error| format!("取消 Knowledge ingest task 失败: {error}"))?;
        if changed == 0 {
            return Err("Knowledge ingest task 不存在或已结束".to_string());
        }
        transaction
            .execute(
                "UPDATE knowledge_source_files
                 SET status = CASE
                       WHEN (SELECT status FROM knowledge_ingest_tasks WHERE id = ?1) = 'cancelled'
                       THEN 'cancelled' ELSE status END,
                     updated_at = ?2
                 WHERE id = (
                   SELECT source_file_id FROM knowledge_ingest_tasks WHERE id = ?1
                 )",
                params![task_id, timestamp],
            )
            .map_err(|error| format!("同步 Knowledge source file 取消状态失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge ingest cancel 失败: {error}"))?;
        Ok(())
    }

    pub fn retry_ingest_task(
        &self,
        library_id: &str,
        task_id: &str,
    ) -> Result<KnowledgeIngestTask, String> {
        let path = self.resolve_library_path(library_id)?;
        let mut connection = self.open_library(&path)?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| format!("开启 Knowledge ingest retry 事务失败: {error}"))?;
        let timestamp = now();
        let changed = transaction
            .execute(
                "UPDATE knowledge_ingest_tasks
                 SET status = 'pending', attempt_count = 0, available_at = ?2,
                     lease_token = NULL, lease_expires_at = NULL,
                     cancel_requested = 0, last_error = NULL, updated_at = ?2
                 WHERE id = ?1 AND status = 'failed'",
                params![task_id, timestamp],
            )
            .map_err(|error| format!("重试 Knowledge ingest task 失败: {error}"))?;
        if changed == 0 {
            return Err("Knowledge ingest task 不存在或当前不可重试".to_string());
        }
        transaction
            .execute(
                "UPDATE knowledge_source_files
                 SET status = 'pending', last_error = NULL, updated_at = ?2
                 WHERE id = (
                   SELECT source_file_id FROM knowledge_ingest_tasks WHERE id = ?1
                 )",
                params![task_id, timestamp],
            )
            .map_err(|error| format!("更新 Knowledge source file 重试状态失败: {error}"))?;
        let task = transaction
            .query_row(
                "SELECT id, source_id, source_file_id, source_path, operation,
                        expected_checksum, file_size, modified_at, parser_version,
                        status, attempt_count, max_attempts, available_at,
                        lease_token, lease_expires_at, cancel_requested, last_error,
                        created_at, updated_at
                 FROM knowledge_ingest_tasks WHERE id = ?1",
                [task_id],
                |row| ingest_task_from_row(library_id, row),
            )
            .map_err(|error| format!("读取重试后的 Knowledge ingest task 失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge ingest retry 失败: {error}"))?;
        Ok(task)
    }

    pub fn complete_ingest_task(
        &self,
        request: &KnowledgeCompleteIngestTaskRequest,
    ) -> Result<Option<KnowledgeDocument>, String> {
        if request.parser_version.trim().is_empty() {
            return Err("Knowledge parser version 不能为空".to_string());
        }
        let path = self.resolve_library_path(&request.library_id)?;
        let mut connection = self.open_library(&path)?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| format!("开启 Knowledge ingest complete 事务失败: {error}"))?;
        let timestamp = now();
        let task = transaction
            .query_row(
                "SELECT source_file_id, source_path, operation, expected_checksum,
                        cancel_requested, lease_expires_at, parser_version
                 FROM knowledge_ingest_tasks
                 WHERE id = ?1 AND status = 'processing' AND lease_token = ?2",
                params![request.task_id, request.lease_token],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)? != 0,
                        row.get::<_, Option<i64>>(5)?,
                        row.get::<_, String>(6)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| format!("校验 Knowledge ingest complete lease 失败: {error}"))?
            .ok_or_else(|| "Knowledge ingest task lease 已失效".to_string())?;
        if task.4 || task.5.is_none_or(|expires_at| expires_at <= timestamp) {
            return Err("Knowledge ingest task 已取消或 lease 已过期".to_string());
        }

        let document_id = if task.2 == "delete" {
            let document_id = transaction
                .query_row(
                    "SELECT document_id FROM knowledge_source_files WHERE id = ?1",
                    [&task.0],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()
                .map_err(|error| format!("读取待删除 Knowledge document 失败: {error}"))?
                .flatten();
            transaction
                .execute(
                    "DELETE FROM knowledge_semantic_fallback_chunks WHERE source_file_id = ?1",
                    [&task.0],
                )
                .map_err(|error| format!("删除 Knowledge 语义回退快照失败: {error}"))?;
            if let Some(document_id) = document_id.as_deref() {
                transaction
                    .execute("DELETE FROM documents WHERE id = ?1", [document_id])
                    .map_err(|error| format!("删除缺失来源 Knowledge document 失败: {error}"))?;
            }
            transaction
                .execute(
                    "UPDATE knowledge_source_files
                     SET current_checksum = '', document_id = NULL, status = 'missing',
                         parser_version = '', last_error = NULL, updated_at = ?2
                     WHERE id = ?1",
                    params![task.0, timestamp],
                )
                .map_err(|error| format!("更新缺失 Knowledge source file 失败: {error}"))?;
            None
        } else {
            if request.content.trim().is_empty() {
                return Err("Knowledge document 内容不能为空".to_string());
            }
            if request.source_checksum != task.3 {
                return Err("解析结果的原始文件 checksum 与入队快照不一致".to_string());
            }
            if request.parser_version != task.6 {
                return Err("解析结果的 parser version 与入队快照不一致".to_string());
            }
            let observed_checksum = transaction
                .query_row(
                    "SELECT observed_checksum FROM knowledge_source_files WHERE id = ?1",
                    [&task.0],
                    |row| row.get::<_, String>(0),
                )
                .map_err(|error| format!("读取 Knowledge source checksum 失败: {error}"))?;
            if observed_checksum != task.3 {
                return Err("Knowledge source 已在任务处理期间发生变化".to_string());
            }
            let config_json = transaction
                .query_row(
                    "SELECT config_json FROM library_metadata WHERE id = 1",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .map_err(|error| format!("读取 Knowledge ingest 配置失败: {error}"))?;
            let config = parse_library_config(&config_json)?;
            let existing = transaction
                .query_row(
                    "SELECT id, created_at, version FROM documents WHERE source_path = ?1",
                    [&task.1],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, i64>(2)?,
                        ))
                    },
                )
                .optional()
                .map_err(|error| format!("读取 Knowledge document 版本失败: {error}"))?;
            let document_id = existing
                .as_ref()
                .map(|item| item.0.clone())
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let created_at = existing.as_ref().map_or(timestamp, |item| item.1);
            let version = existing.as_ref().map_or(1, |item| item.2.saturating_add(1));
            let title = request
                .title
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| source_title(&task.1));
            let content_checksum = blake3::hash(request.content.as_bytes())
                .to_hex()
                .to_string();
            let mime_type = request
                .mime_type
                .clone()
                .unwrap_or_else(|| "text/plain".to_string());
            if existing.is_some() {
                preserve_semantic_fallback(&transaction, &task.0, &document_id)?;
            }
            transaction
                .execute(
                    "INSERT INTO documents(
                        id, source_path, title, checksum, mime_type, content, size,
                        status, created_at, updated_at, source_file_id, source_checksum,
                        parser_version, version, last_error
                     ) VALUES (
                        ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'ready', ?8, ?9,
                        ?10, ?11, ?12, ?13, NULL
                     )
                     ON CONFLICT(source_path) DO UPDATE SET
                        title = excluded.title, checksum = excluded.checksum,
                        mime_type = excluded.mime_type, content = excluded.content,
                        size = excluded.size, status = 'ready', updated_at = excluded.updated_at,
                        source_file_id = excluded.source_file_id,
                        source_checksum = excluded.source_checksum,
                        parser_version = excluded.parser_version,
                        version = excluded.version, last_error = NULL",
                    params![
                        document_id,
                        task.1,
                        title,
                        content_checksum,
                        mime_type,
                        request.content,
                        request.content.len() as i64,
                        created_at,
                        timestamp,
                        task.0,
                        request.source_checksum,
                        request.parser_version,
                        version,
                    ],
                )
                .map_err(|error| format!("写入 Knowledge document 新版本失败: {error}"))?;
            replace_document_chunks(
                &transaction,
                &request.library_id,
                &document_id,
                &task.1,
                &title,
                &request.content,
                &config,
            )?;
            transaction
                .execute(
                    "UPDATE knowledge_source_files
                     SET current_checksum = ?2, parser_version = ?3, document_id = ?4,
                         status = 'ready', last_error = NULL, updated_at = ?5
                     WHERE id = ?1",
                    params![
                        task.0,
                        request.source_checksum,
                        request.parser_version,
                        document_id,
                        timestamp,
                    ],
                )
                .map_err(|error| format!("提交 Knowledge source file 新版本失败: {error}"))?;
            Some(document_id)
        };
        transaction
            .execute(
                "UPDATE knowledge_ingest_tasks
                 SET status = 'completed', parser_version = ?3, lease_token = NULL,
                     lease_expires_at = NULL, last_error = NULL, updated_at = ?4
                 WHERE id = ?1 AND lease_token = ?2",
                params![
                    request.task_id,
                    request.lease_token,
                    request.parser_version,
                    timestamp,
                ],
            )
            .map_err(|error| format!("完成 Knowledge ingest task 失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge ingest complete 失败: {error}"))?;
        let _ = self.touch_library(&request.library_id);
        match document_id {
            Some(document_id) => self.get_document(&request.library_id, &document_id),
            None => Ok(None),
        }
    }

    pub fn add_directory_source(
        &self,
        request: &KnowledgeDirectorySourceRequest,
    ) -> Result<KnowledgeEnqueueResult, String> {
        let root = canonical_directory(&request.root_path)?;
        validate_ignore_patterns(&root, &request.ignore_patterns)?;
        let path = self.resolve_library_path(&request.library_id)?;
        let connection = self.open_library(&path)?;
        let source_id = Uuid::new_v4().to_string();
        let timestamp = now();
        connection
            .execute(
                "INSERT INTO knowledge_sources(
                    id, kind, root_path, recursive, ignore_json, status,
                    created_at, updated_at
                 ) VALUES (?1, 'directory', ?2, ?3, ?4, 'active', ?5, ?5)
                 ON CONFLICT(kind, root_path) DO UPDATE SET
                    recursive = excluded.recursive, ignore_json = excluded.ignore_json,
                    status = 'active', last_error = NULL, updated_at = excluded.updated_at",
                params![
                    source_id,
                    normalized_external_path(&root),
                    request.recursive as i64,
                    serde_json::to_string(&request.ignore_patterns)
                        .map_err(|error| format!("序列化 Knowledge ignore 规则失败: {error}"))?,
                    timestamp,
                ],
            )
            .map_err(|error| format!("创建 Knowledge directory source 失败: {error}"))?;
        let actual_source_id = connection
            .query_row(
                "SELECT id FROM knowledge_sources WHERE kind = 'directory' AND root_path = ?1",
                [normalized_external_path(&root)],
                |row| row.get::<_, String>(0),
            )
            .map_err(|error| format!("读取 Knowledge directory source 失败: {error}"))?;
        self.rescan_directory_source(
            &request.library_id,
            &actual_source_id,
            request.max_file_bytes,
            request.max_attempts,
            &request.parser_version,
        )
    }

    pub fn rescan_directory_source(
        &self,
        library_id: &str,
        source_id: &str,
        max_file_bytes: usize,
        max_attempts: usize,
        parser_version: &str,
    ) -> Result<KnowledgeEnqueueResult, String> {
        let path = self.resolve_library_path(library_id)?;
        let connection = self.open_library(&path)?;
        let (root_path, recursive, ignore_json) = connection
            .query_row(
                "SELECT root_path, recursive, ignore_json FROM knowledge_sources
                 WHERE id = ?1 AND kind = 'directory'",
                [source_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)? != 0,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| format!("读取 Knowledge directory source 失败: {error}"))?
            .ok_or_else(|| format!("Knowledge directory source 不存在: {source_id}"))?;
        let root = canonical_directory(&root_path)?;
        let ignore_patterns: Vec<String> = serde_json::from_str(&ignore_json)
            .map_err(|error| format!("读取 Knowledge ignore 规则失败: {error}"))?;
        let mut builder = WalkBuilder::new(&root);
        builder
            .hidden(false)
            .parents(false)
            .git_ignore(false)
            .git_global(false)
            .git_exclude(false)
            .follow_links(false);
        if !recursive {
            builder.max_depth(Some(1));
        }
        if let Some(overrides) = build_ignore_overrides(&root, &ignore_patterns)? {
            builder.overrides(overrides);
        }
        let mut paths = Vec::new();
        let mut walk_failures = Vec::new();
        for entry in builder.build() {
            match entry {
                Ok(entry) if entry.file_type().is_some_and(|kind| kind.is_file()) => {
                    paths.push(normalized_external_path(entry.path()));
                }
                Ok(_) => {}
                Err(error) => walk_failures.push(KnowledgeEnqueueFailure {
                    source_path: root_path.clone(),
                    message: format!("遍历目录失败: {error}"),
                }),
            }
        }
        let mut result = self.enqueue_paths(&KnowledgeEnqueuePathsRequest {
            library_id: library_id.to_string(),
            paths: paths.clone(),
            source_id: Some(source_id.to_string()),
            parser_version: parser_version.to_string(),
            max_file_bytes,
            max_attempts,
        })?;
        result.failures.extend(walk_failures);

        let scan_id = Uuid::new_v4().to_string();
        let timestamp = now();
        let mut connection = self.open_library(&path)?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| format!("开启 Knowledge directory scan 事务失败: {error}"))?;
        for source_path in paths {
            transaction
                .execute(
                    "UPDATE knowledge_source_files SET last_seen_scan = ?3, updated_at = ?4
                     WHERE source_id = ?1 AND source_path = ?2",
                    params![source_id, source_path, scan_id, timestamp],
                )
                .map_err(|error| format!("标记 Knowledge directory scan 文件失败: {error}"))?;
        }
        let missing = {
            let mut statement = transaction
                .prepare(
                    "SELECT id, source_path FROM knowledge_source_files
                     WHERE source_id = ?1 AND last_seen_scan != ?2 AND status != 'missing'",
                )
                .map_err(|error| format!("准备 Knowledge 缺失文件列表失败: {error}"))?;
            let rows = statement
                .query_map(params![source_id, scan_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|error| format!("查询 Knowledge 缺失文件失败: {error}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("读取 Knowledge 缺失文件失败: {error}"))?;
            rows
        };
        for (source_file_id, source_path) in missing {
            let already_queued = transaction
                .query_row(
                    "SELECT 1 FROM knowledge_ingest_tasks
                     WHERE source_file_id = ?1 AND operation = 'delete'
                       AND status IN ('pending', 'processing', 'retry') LIMIT 1",
                    [&source_file_id],
                    |_| Ok(()),
                )
                .optional()
                .map_err(|error| format!("检查 Knowledge delete task 失败: {error}"))?
                .is_some();
            if already_queued {
                continue;
            }
            let task_id = Uuid::new_v4().to_string();
            transaction
                .execute(
                    "INSERT INTO knowledge_ingest_tasks(
                        id, source_id, source_file_id, source_path, operation,
                        status, attempt_count, max_attempts, available_at,
                        cancel_requested, created_at, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, 'delete', 'pending', 0, ?5, ?6, 0, ?6, ?6)",
                    params![
                        task_id,
                        source_id,
                        source_file_id,
                        source_path,
                        max_attempts.clamp(1, 10) as i64,
                        timestamp,
                    ],
                )
                .map_err(|error| format!("创建 Knowledge delete task 失败: {error}"))?;
            transaction
                .execute(
                    "UPDATE knowledge_source_files SET status = 'pending', updated_at = ?2
                     WHERE id = ?1",
                    params![source_file_id, timestamp],
                )
                .map_err(|error| format!("更新 Knowledge 缺失文件状态失败: {error}"))?;
            result.task_ids.push(task_id);
            result.queued += 1;
        }
        transaction
            .execute(
                "UPDATE knowledge_sources
                 SET status = 'active', last_scan_at = ?2, last_error = ?3, updated_at = ?2
                 WHERE id = ?1",
                params![
                    source_id,
                    timestamp,
                    result
                        .failures
                        .first()
                        .map(|failure| failure.message.as_str()),
                ],
            )
            .map_err(|error| format!("更新 Knowledge directory scan 状态失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge directory scan 失败: {error}"))?;
        Ok(result)
    }

    pub fn remove_source(&self, library_id: &str, source_id: &str) -> Result<(), String> {
        let path = self.resolve_library_path(library_id)?;
        let mut connection = self.open_library(&path)?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| format!("开启 Knowledge source 删除事务失败: {error}"))?;
        transaction
            .execute(
                "DELETE FROM knowledge_semantic_fallback_chunks
                 WHERE source_file_id IN (
                    SELECT id FROM knowledge_source_files WHERE source_id = ?1
                 )",
                [source_id],
            )
            .map_err(|error| format!("删除 Knowledge source 语义回退快照失败: {error}"))?;
        transaction
            .execute(
                "DELETE FROM documents WHERE id IN (
                    SELECT document_id FROM knowledge_source_files
                    WHERE source_id = ?1 AND document_id IS NOT NULL
                 )",
                [source_id],
            )
            .map_err(|error| format!("删除 Knowledge source documents 失败: {error}"))?;
        let changed = transaction
            .execute("DELETE FROM knowledge_sources WHERE id = ?1", [source_id])
            .map_err(|error| format!("删除 Knowledge source 失败: {error}"))?;
        if changed == 0 {
            return Err(format!("Knowledge source 不存在: {source_id}"));
        }
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge source 删除失败: {error}"))?;
        let _ = self.touch_library(library_id);
        Ok(())
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
        let active_space_id = connection
            .query_row(
                "SELECT active_embedding_space_id FROM library_metadata WHERE id = 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .map_err(|error| format!("读取 Knowledge document 活动空间失败: {error}"))?;
        let mut statement = connection
            .prepare(
                "SELECT d.id, d.source_path, d.title, d.checksum, d.mime_type, d.size,
                        d.status, d.created_at, d.updated_at, COUNT(DISTINCT c.id),
                        COUNT(DISTINCT v.chunk_id), COALESCE(f.source_id, ''),
                        d.source_file_id, d.source_checksum, d.parser_version,
                        d.version, COALESCE(d.last_error, f.last_error)
                 FROM documents d
                 LEFT JOIN chunks c ON c.document_id = d.id
                 LEFT JOIN chunk_vectors v ON v.chunk_id = c.id AND v.space_id = ?1
                 LEFT JOIN knowledge_source_files f ON f.id = d.source_file_id
                 GROUP BY d.id ORDER BY d.updated_at DESC, d.id",
            )
            .map_err(|error| format!("准备 Knowledge document 列表失败: {error}"))?;
        let rows = statement
            .query_map([active_space_id], |row| {
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
                    vectorized_chunk_count: row.get::<_, i64>(10)?.max(0) as usize,
                    source_id: row.get(11)?,
                    source_file_id: row.get(12)?,
                    source_checksum: row.get(13)?,
                    parser_version: row.get(14)?,
                    version: row.get::<_, i64>(15)?.max(0) as usize,
                    last_error: row.get(16)?,
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

    pub fn list_unvectorized_chunks(
        &self,
        library_id: &str,
        space_id: &str,
    ) -> Result<Vec<KnowledgeChunk>, String> {
        if space_id.trim().is_empty() {
            return self.list_chunks(library_id, None);
        }
        let path = self.resolve_library_path(library_id)?;
        let connection = self.open_library(&path)?;
        let mut statement = connection
            .prepare(
                "SELECT c.id, c.document_id, d.source_path, d.title, c.chunk_index,
                        c.content, c.checksum, c.heading, c.start_offset, c.end_offset
                 FROM chunks c JOIN documents d ON d.id = c.document_id
                 WHERE NOT EXISTS (
                    SELECT 1 FROM chunk_vectors v
                    WHERE v.chunk_id = c.id AND v.space_id = ?1
                 )
                 ORDER BY d.updated_at DESC, c.document_id, c.chunk_index",
            )
            .map_err(|error| format!("准备 Knowledge 待向量化 chunk 列表失败: {error}"))?;
        let rows = statement
            .query_map([space_id], chunk_from_row)
            .map_err(|error| format!("查询 Knowledge 待向量化 chunk 失败: {error}"))?;
        rows.map(|row| {
            let mut chunk =
                row.map_err(|error| format!("读取 Knowledge 待向量化 chunk 失败: {error}"))?;
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
            .execute(
                "DELETE FROM knowledge_semantic_fallback_chunks
                 WHERE source_file_id = (
                    SELECT source_file_id FROM documents WHERE id = ?1
                 )",
                [document_id],
            )
            .map_err(|error| format!("清理 Knowledge document 语义回退失败: {error}"))?;
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
        transaction
            .execute("DELETE FROM knowledge_semantic_fallback_chunks", [])
            .map_err(|error| format!("清理 Knowledge 语义回退快照失败: {error}"))?;
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
        transaction
            .execute(
                "DELETE FROM knowledge_semantic_fallback_chunks
                 WHERE space_id = ?1 AND source_file_id IN (
                    SELECT d.source_file_id
                    FROM documents d
                    WHERE d.source_file_id != ''
                      AND EXISTS (
                        SELECT 1 FROM knowledge_semantic_fallback_chunks fallback
                        WHERE fallback.source_file_id = d.source_file_id
                          AND fallback.space_id = ?1
                      )
                      AND (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) > 0
                      AND (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) =
                          (SELECT COUNT(*)
                           FROM chunks c
                           JOIN chunk_vectors v ON v.chunk_id = c.id
                           WHERE c.document_id = d.id AND v.space_id = ?1)
                 )",
                [space_id],
            )
            .map_err(|error| format!("切换 Knowledge 新语义版本失败: {error}"))?;
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
        let keyword_indexed_chunks = connection
            .query_row("SELECT COUNT(*) FROM chunks_fts", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|error| format!("读取 Knowledge FTS 覆盖状态失败: {error}"))?
            .max(0) as usize;
        let semantic_fallback_chunks = connection
            .query_row(
                "SELECT COUNT(*) FROM knowledge_semantic_fallback_chunks",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|error| format!("读取 Knowledge 语义回退状态失败: {error}"))?
            .max(0) as usize;
        let (source_count, pending_task_count, failed_task_count) = connection
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM knowledge_sources),
                   (SELECT COUNT(*) FROM knowledge_ingest_tasks
                    WHERE status IN ('pending', 'processing', 'retry')),
                   (SELECT COUNT(*) FROM knowledge_ingest_tasks WHERE status = 'failed')",
                [],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?.max(0) as usize,
                        row.get::<_, i64>(1)?.max(0) as usize,
                        row.get::<_, i64>(2)?.max(0) as usize,
                    ))
                },
            )
            .map_err(|error| format!("读取 Knowledge 来源和队列状态失败: {error}"))?;

        Ok(KnowledgeIndexStatus {
            library_id: library_id.to_string(),
            total_chunks,
            vectorized_chunks,
            pending_chunks: total_chunks.saturating_sub(vectorized_chunks),
            keyword_indexed_chunks,
            semantic_fallback_chunks,
            source_count,
            pending_task_count,
            failed_task_count,
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

    fn library_counts(
        &self,
        id: &str,
        space_id: &str,
        dimension: usize,
    ) -> Result<LibraryCounts, String> {
        let path = self.library_path(id);
        if !path.exists() {
            return Ok(LibraryCounts::default());
        }
        let connection = self.open_library(&path)?;
        connection
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM documents),
                   (SELECT COUNT(*) FROM chunks),
                   (SELECT COUNT(*) FROM knowledge_sources),
                   (SELECT COUNT(*) FROM knowledge_ingest_tasks
                    WHERE status IN ('pending', 'processing', 'retry')),
                   (SELECT COUNT(*) FROM knowledge_ingest_tasks WHERE status = 'failed'),
                   (SELECT COUNT(*) FROM chunks_fts),
                   (SELECT COUNT(*) FROM chunk_vectors v
                    JOIN chunks c ON c.id = v.chunk_id
                    WHERE v.space_id = ?1 AND v.dimension = ?2)",
                params![space_id, dimension as i64],
                |row| {
                    Ok(LibraryCounts {
                        documents: row.get::<_, i64>(0)?.max(0) as usize,
                        chunks: row.get::<_, i64>(1)?.max(0) as usize,
                        sources: row.get::<_, i64>(2)?.max(0) as usize,
                        pending_tasks: row.get::<_, i64>(3)?.max(0) as usize,
                        failed_tasks: row.get::<_, i64>(4)?.max(0) as usize,
                        keyword_chunks: row.get::<_, i64>(5)?.max(0) as usize,
                        vectorized_chunks: row.get::<_, i64>(6)?.max(0) as usize,
                    })
                },
            )
            .map_err(|error| format!("统计 Knowledge library 摘要失败: {error}"))
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
        ensure_column(
            &connection,
            "documents",
            "source_file_id",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &connection,
            "documents",
            "source_checksum",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &connection,
            "documents",
            "parser_version",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &connection,
            "documents",
            "version",
            "INTEGER NOT NULL DEFAULT 1",
        )?;
        ensure_column(&connection, "documents", "last_error", "TEXT")?;
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
CREATE TABLE IF NOT EXISTS knowledge_sources(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('file', 'directory')),
  root_path TEXT NOT NULL,
  recursive INTEGER NOT NULL DEFAULT 0,
  ignore_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  last_scan_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(kind, root_path)
);
CREATE TABLE IF NOT EXISTS knowledge_source_files(
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  observed_checksum TEXT NOT NULL DEFAULT '',
  current_checksum TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  modified_at INTEGER NOT NULL DEFAULT 0,
  parser_version TEXT NOT NULL DEFAULT '',
  document_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  last_seen_scan TEXT NOT NULL DEFAULT '',
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(source_id, source_path),
  FOREIGN KEY(source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_knowledge_source_files_source
ON knowledge_source_files(source_id, status, source_path);
CREATE TABLE IF NOT EXISTS knowledge_ingest_tasks(
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_file_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete')),
  expected_checksum TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  modified_at INTEGER NOT NULL DEFAULT 0,
  parser_version TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN (
    'pending', 'processing', 'retry', 'failed', 'completed', 'cancelled'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  available_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_expires_at INTEGER,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  FOREIGN KEY(source_file_id) REFERENCES knowledge_source_files(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_knowledge_ingest_tasks_claim
ON knowledge_ingest_tasks(status, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_ingest_tasks_source
ON knowledge_ingest_tasks(source_id, status, source_path);
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
CREATE TABLE IF NOT EXISTS knowledge_semantic_fallback_chunks(
  source_file_id TEXT NOT NULL,
  original_chunk_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  title TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  checksum TEXT NOT NULL,
  heading TEXT,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  space_id TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(source_file_id, original_chunk_id, space_id)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_semantic_fallback_space
ON knowledge_semantic_fallback_chunks(space_id, source_file_id);
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

#[derive(Debug, Clone)]
struct InspectedKnowledgeFile {
    source_path: String,
    checksum: String,
    file_size: usize,
    modified_at: i64,
}

fn normalized_external_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    value
        .strip_prefix(r"\\?\")
        .unwrap_or(value.as_ref())
        .to_string()
}

fn canonical_directory(source_path: &str) -> Result<PathBuf, String> {
    let canonical =
        std::fs::canonicalize(source_path).map_err(|error| format!("解析目录路径失败: {error}"))?;
    if !canonical.is_dir() {
        return Err("路径不是目录".to_string());
    }
    Ok(canonical)
}

fn build_ignore_overrides(
    root: &Path,
    patterns: &[String],
) -> Result<Option<ignore::overrides::Override>, String> {
    if patterns.iter().all(|pattern| pattern.trim().is_empty()) {
        return Ok(None);
    }
    let mut builder = ignore::overrides::OverrideBuilder::new(root);
    for pattern in patterns {
        let pattern = pattern.trim();
        if !pattern.is_empty() {
            builder
                .add(&format!("!{pattern}"))
                .map_err(|error| format!("非法 Knowledge ignore 规则「{pattern}」: {error}"))?;
        }
    }
    builder
        .build()
        .map(Some)
        .map_err(|error| format!("构建 Knowledge ignore 规则失败: {error}"))
}

fn validate_ignore_patterns(root: &Path, patterns: &[String]) -> Result<(), String> {
    build_ignore_overrides(root, patterns).map(|_| ())
}

fn modified_timestamp(metadata: &std::fs::Metadata) -> Result<i64, String> {
    let duration = metadata
        .modified()
        .map_err(|error| format!("读取文件修改时间失败: {error}"))?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("文件修改时间早于 Unix epoch: {error}"))?;
    Ok(duration.as_millis().min(i64::MAX as u128) as i64)
}

fn inspect_stable_file(
    source_path: &str,
    max_file_bytes: usize,
) -> Result<InspectedKnowledgeFile, String> {
    let canonical =
        std::fs::canonicalize(source_path).map_err(|error| format!("解析文件路径失败: {error}"))?;
    let before =
        std::fs::metadata(&canonical).map_err(|error| format!("读取文件状态失败: {error}"))?;
    if !before.is_file() {
        return Err("路径不是文件".to_string());
    }
    if before.len() > max_file_bytes as u64 {
        return Err(format!(
            "文件大小 {} 字节超过限制 {} 字节",
            before.len(),
            max_file_bytes
        ));
    }
    let before_modified = modified_timestamp(&before)?;
    let mut file = File::open(&canonical).map_err(|error| format!("打开文件失败: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("计算文件 checksum 失败: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let after =
        std::fs::metadata(&canonical).map_err(|error| format!("复查文件状态失败: {error}"))?;
    let after_modified = modified_timestamp(&after)?;
    if before.len() != after.len() || before_modified != after_modified {
        return Err("文件在 checksum 计算期间发生变化，请稍后重试".to_string());
    }
    Ok(InspectedKnowledgeFile {
        source_path: normalized_external_path(&canonical),
        checksum: format!("{:x}", hasher.finalize()),
        file_size: after.len() as usize,
        modified_at: after_modified,
    })
}

fn ensure_source_for_file(
    transaction: &Transaction<'_>,
    requested_source_id: Option<&str>,
    source_path: &str,
) -> Result<String, String> {
    if let Some(source_id) = requested_source_id {
        let (kind, root_path) = transaction
            .query_row(
                "SELECT kind, root_path FROM knowledge_sources WHERE id = ?1",
                [source_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|error| format!("读取 Knowledge source 失败: {error}"))?
            .ok_or_else(|| format!("Knowledge source 不存在: {source_id}"))?;
        let source = Path::new(source_path);
        let root = Path::new(&root_path);
        let belongs = if kind == "directory" {
            source.starts_with(root)
        } else {
            source == root
        };
        if !belongs {
            return Err("文件路径不属于指定 Knowledge source".to_string());
        }
        return Ok(source_id.to_string());
    }

    let existing = transaction
        .query_row(
            "SELECT id FROM knowledge_sources WHERE kind = 'file' AND root_path = ?1",
            [source_path],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("查找 Knowledge file source 失败: {error}"))?;
    if let Some(source_id) = existing {
        return Ok(source_id);
    }
    let source_id = Uuid::new_v4().to_string();
    let timestamp = now();
    transaction
        .execute(
            "INSERT INTO knowledge_sources(
                id, kind, root_path, recursive, ignore_json, status,
                created_at, updated_at
             ) VALUES (?1, 'file', ?2, 0, '[]', 'active', ?3, ?3)",
            params![source_id, source_path, timestamp],
        )
        .map_err(|error| format!("创建 Knowledge file source 失败: {error}"))?;
    Ok(source_id)
}

fn parse_source_kind(value: &str) -> rusqlite::Result<KnowledgeSourceKind> {
    match value {
        "file" => Ok(KnowledgeSourceKind::File),
        "directory" => Ok(KnowledgeSourceKind::Directory),
        _ => Err(rusqlite::Error::InvalidQuery),
    }
}

fn parse_ingest_task_status(value: &str) -> rusqlite::Result<KnowledgeIngestTaskStatus> {
    match value {
        "pending" => Ok(KnowledgeIngestTaskStatus::Pending),
        "processing" => Ok(KnowledgeIngestTaskStatus::Processing),
        "retry" => Ok(KnowledgeIngestTaskStatus::Retry),
        "failed" => Ok(KnowledgeIngestTaskStatus::Failed),
        "completed" => Ok(KnowledgeIngestTaskStatus::Completed),
        "cancelled" => Ok(KnowledgeIngestTaskStatus::Cancelled),
        _ => Err(rusqlite::Error::InvalidQuery),
    }
}

fn ingest_task_from_row(
    library_id: &str,
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<KnowledgeIngestTask> {
    Ok(KnowledgeIngestTask {
        id: row.get(0)?,
        library_id: library_id.to_string(),
        source_id: row.get(1)?,
        source_file_id: row.get(2)?,
        source_path: row.get(3)?,
        operation: row.get(4)?,
        expected_checksum: row.get(5)?,
        file_size: row.get::<_, i64>(6)?.max(0) as usize,
        modified_at: row.get(7)?,
        parser_version: row.get(8)?,
        status: parse_ingest_task_status(&row.get::<_, String>(9)?)?,
        attempt_count: row.get::<_, i64>(10)?.max(0) as usize,
        max_attempts: row.get::<_, i64>(11)?.max(0) as usize,
        available_at: row.get(12)?,
        lease_token: row.get(13)?,
        lease_expires_at: row.get(14)?,
        cancel_requested: row.get::<_, i64>(15)? != 0,
        last_error: row.get(16)?,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
    })
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

fn preserve_semantic_fallback(
    transaction: &Transaction<'_>,
    source_file_id: &str,
    document_id: &str,
) -> Result<(), String> {
    let space_id = transaction
        .query_row(
            "SELECT active_embedding_space_id FROM library_metadata WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| format!("读取 Knowledge 活动语义空间失败: {error}"))?;
    if space_id.is_empty() {
        return Ok(());
    }
    let (chunk_count, vector_count) = transaction
        .query_row(
            "SELECT COUNT(c.id), COUNT(v.chunk_id)
             FROM chunks c
             LEFT JOIN chunk_vectors v ON v.chunk_id = c.id AND v.space_id = ?2
             WHERE c.document_id = ?1",
            params![document_id, space_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        )
        .map_err(|error| format!("读取 Knowledge 旧语义覆盖失败: {error}"))?;
    if vector_count == 0 {
        return Ok(());
    }
    let has_fallback = transaction
        .query_row(
            "SELECT 1 FROM knowledge_semantic_fallback_chunks
             WHERE source_file_id = ?1 LIMIT 1",
            [source_file_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|error| format!("检查 Knowledge 语义回退快照失败: {error}"))?
        .is_some();
    if has_fallback && vector_count < chunk_count {
        return Ok(());
    }
    transaction
        .execute(
            "DELETE FROM knowledge_semantic_fallback_chunks WHERE source_file_id = ?1",
            [source_file_id],
        )
        .map_err(|error| format!("清理 Knowledge 旧语义回退快照失败: {error}"))?;
    transaction
        .execute(
            "INSERT INTO knowledge_semantic_fallback_chunks(
                source_file_id, original_chunk_id, document_id, source_path, title,
                chunk_index, content, checksum, heading, start_offset, end_offset,
                space_id, dimension, vector_blob, created_at
             )
             SELECT ?1, c.id, c.document_id, d.source_path, d.title,
                    c.chunk_index, c.content, c.checksum, c.heading,
                    c.start_offset, c.end_offset, v.space_id, v.dimension,
                    v.vector_blob, ?4
             FROM chunks c
             JOIN documents d ON d.id = c.document_id
             JOIN chunk_vectors v ON v.chunk_id = c.id AND v.space_id = ?3
             WHERE c.document_id = ?2",
            params![source_file_id, document_id, space_id, now()],
        )
        .map_err(|error| format!("保存 Knowledge 语义回退快照失败: {error}"))?;
    Ok(())
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
             WHERE v.space_id = ?1
               AND NOT EXISTS (
                 SELECT 1 FROM knowledge_semantic_fallback_chunks fallback
                 WHERE fallback.source_file_id = d.source_file_id
                   AND fallback.space_id = ?1
               )",
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
    let mut vectors = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读取 Knowledge vector 结果失败: {error}"))?;
    let mut fallback_statement = connection
        .prepare(
            "SELECT original_chunk_id, document_id, source_path, title, chunk_index,
                    content, checksum, heading, start_offset, end_offset,
                    dimension, vector_blob
             FROM knowledge_semantic_fallback_chunks WHERE space_id = ?1",
        )
        .map_err(|error| format!("准备 Knowledge 语义回退检索失败: {error}"))?;
    let fallback_rows = fallback_statement
        .query_map([space_id], |row| {
            let chunk = chunk_from_row(row)?;
            let dimension = row.get::<_, i64>(10)?.max(0) as usize;
            let blob = row.get::<_, Vec<u8>>(11)?;
            Ok((chunk, decode_vector(&blob, dimension)))
        })
        .map_err(|error| format!("执行 Knowledge 语义回退检索失败: {error}"))?;
    vectors.extend(
        fallback_rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取 Knowledge 语义回退结果失败: {error}"))?,
    );
    let mut results = vectors
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

    fn enqueue_file(
        repository: &KnowledgeRepository,
        library_id: &str,
        path: &Path,
    ) -> KnowledgeEnqueueResult {
        repository
            .enqueue_paths(&KnowledgeEnqueuePathsRequest {
                library_id: library_id.to_string(),
                paths: vec![normalized_external_path(path)],
                source_id: None,
                parser_version: "test-parser-v1".to_string(),
                max_file_bytes: 1024 * 1024,
                max_attempts: 3,
            })
            .unwrap()
    }

    fn complete_claimed_task(
        repository: &KnowledgeRepository,
        task: &KnowledgeIngestTask,
        content: &str,
    ) -> Option<KnowledgeDocument> {
        repository
            .complete_ingest_task(&KnowledgeCompleteIngestTaskRequest {
                library_id: task.library_id.clone(),
                task_id: task.id.clone(),
                lease_token: task.lease_token.clone().unwrap(),
                title: None,
                mime_type: Some("text/plain".to_string()),
                content: content.to_string(),
                source_checksum: task.expected_checksum.clone(),
                parser_version: "test-parser-v1".to_string(),
            })
            .unwrap()
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

    #[test]
    fn ingest_queue_persists_completion_and_skips_unchanged_files() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let library = repository.create_library("Queue", None, None).unwrap();
        let source_path = directory.path().join("queue.txt");
        std::fs::write(&source_path, "persistent queue content").unwrap();

        let enqueued = enqueue_file(&repository, &library.id, &source_path);
        assert_eq!(enqueued.queued, 1);
        let task = repository
            .claim_ingest_task(&library.id, 60)
            .unwrap()
            .unwrap();
        let document =
            complete_claimed_task(&repository, &task, "persistent queue content").unwrap();
        assert_eq!(document.status, "ready");
        assert_eq!(document.source_checksum, task.expected_checksum);
        assert_eq!(document.parser_version, "test-parser-v1");
        assert_eq!(document.version, 1);
        assert_eq!(document.vectorized_chunk_count, 0);
        let summary = repository.get_library(&library.id).unwrap().unwrap();
        assert_eq!(summary.source_count, 1);
        assert_eq!(summary.pending_task_count, 0);
        assert_eq!(summary.failed_task_count, 0);
        assert_eq!(summary.keyword_index_status, "ready");
        assert_eq!(summary.semantic_index_status, "notBuilt");
        assert_eq!(
            repository.list_ingest_tasks(&library.id, 10).unwrap()[0].status,
            KnowledgeIngestTaskStatus::Completed
        );

        let unchanged = enqueue_file(&repository, &library.id, &source_path);
        assert_eq!(unchanged.queued, 0);
        assert_eq!(unchanged.skipped_unchanged, 1);
        drop(repository);

        let reopened = KnowledgeRepository::new(directory.path());
        reopened.initialize().unwrap();
        assert_eq!(reopened.list_documents(&library.id).unwrap().len(), 1);
        assert_eq!(
            reopened.list_ingest_tasks(&library.id, 10).unwrap()[0].status,
            KnowledgeIngestTaskStatus::Completed
        );
    }

    #[test]
    fn ingest_queue_recovers_expired_leases_and_honors_retry_and_cancel() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let library = repository.create_library("Recovery", None, None).unwrap();
        let first_path = directory.path().join("first.txt");
        std::fs::write(&first_path, "first").unwrap();
        enqueue_file(&repository, &library.id, &first_path);
        let first = repository
            .claim_ingest_task(&library.id, 60)
            .unwrap()
            .unwrap();
        repository
            .open_library(&repository.resolve_library_path(&library.id).unwrap())
            .unwrap()
            .execute(
                "UPDATE knowledge_ingest_tasks SET lease_expires_at = ?2 WHERE id = ?1",
                params![first.id, now() - 1],
            )
            .unwrap();
        let recovered = repository
            .claim_ingest_task(&library.id, 60)
            .unwrap()
            .unwrap();
        assert_eq!(recovered.id, first.id);
        assert_eq!(recovered.attempt_count, 2);
        let retry = repository
            .fail_ingest_task(&KnowledgeFailIngestTaskRequest {
                library_id: library.id.clone(),
                task_id: recovered.id.clone(),
                lease_token: recovered.lease_token.unwrap(),
                error: "temporary read error".to_string(),
                retryable: true,
                retry_delay_seconds: 0,
            })
            .unwrap();
        assert_eq!(retry.status, KnowledgeIngestTaskStatus::Retry);
        let last_attempt = repository
            .claim_ingest_task(&library.id, 60)
            .unwrap()
            .unwrap();
        let failed = repository
            .fail_ingest_task(&KnowledgeFailIngestTaskRequest {
                library_id: library.id.clone(),
                task_id: last_attempt.id,
                lease_token: last_attempt.lease_token.unwrap(),
                error: "repeated read error".to_string(),
                retryable: true,
                retry_delay_seconds: 0,
            })
            .unwrap();
        assert_eq!(failed.status, KnowledgeIngestTaskStatus::Failed);
        let retried = repository
            .retry_ingest_task(&library.id, &failed.id)
            .unwrap();
        assert_eq!(retried.status, KnowledgeIngestTaskStatus::Pending);
        assert_eq!(retried.attempt_count, 0);
        repository
            .cancel_ingest_task(&library.id, &retried.id)
            .unwrap();

        let second_path = directory.path().join("second.txt");
        std::fs::write(&second_path, "second").unwrap();
        let second = enqueue_file(&repository, &library.id, &second_path);
        repository
            .cancel_ingest_task(&library.id, &second.task_ids[0])
            .unwrap();
        let cancelled = repository
            .list_ingest_tasks(&library.id, 10)
            .unwrap()
            .into_iter()
            .find(|task| task.id == second.task_ids[0])
            .unwrap();
        assert_eq!(cancelled.status, KnowledgeIngestTaskStatus::Cancelled);
    }

    #[test]
    fn ingest_queue_isolates_file_failures() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path().join("app"));
        repository.initialize().unwrap();
        let library = repository.create_library("Isolation", None, None).unwrap();
        let first_path = directory.path().join("bad.txt");
        let second_path = directory.path().join("good.txt");
        std::fs::write(&first_path, "bad content").unwrap();
        std::fs::write(&second_path, "good content").unwrap();
        let queued = repository
            .enqueue_paths(&KnowledgeEnqueuePathsRequest {
                library_id: library.id.clone(),
                paths: vec![
                    normalized_external_path(&first_path),
                    normalized_external_path(&second_path),
                ],
                source_id: None,
                parser_version: "test-parser-v1".to_string(),
                max_file_bytes: 1024 * 1024,
                max_attempts: 3,
            })
            .unwrap();
        assert_eq!(queued.queued, 2);
        let failed_task = repository
            .claim_ingest_task(&library.id, 60)
            .unwrap()
            .unwrap();
        repository
            .fail_ingest_task(&KnowledgeFailIngestTaskRequest {
                library_id: library.id.clone(),
                task_id: failed_task.id,
                lease_token: failed_task.lease_token.unwrap(),
                error: "file parse failed".to_string(),
                retryable: false,
                retry_delay_seconds: 0,
            })
            .unwrap();
        let successful_task = repository
            .claim_ingest_task(&library.id, 60)
            .unwrap()
            .unwrap();
        complete_claimed_task(&repository, &successful_task, "good content");

        assert_eq!(repository.list_documents(&library.id).unwrap().len(), 1);
        let statuses = repository
            .list_ingest_tasks(&library.id, 10)
            .unwrap()
            .into_iter()
            .map(|task| task.status)
            .collect::<Vec<_>>();
        assert!(statuses.contains(&KnowledgeIngestTaskStatus::Failed));
        assert!(statuses.contains(&KnowledgeIngestTaskStatus::Completed));
    }

    #[test]
    fn directory_rescan_queues_missing_file_deletion() {
        let directory = tempdir().unwrap();
        let source_root = directory.path().join("source");
        std::fs::create_dir(&source_root).unwrap();
        let source_path = source_root.join("guide.txt");
        std::fs::write(&source_path, "directory source").unwrap();
        let repository = KnowledgeRepository::new(directory.path().join("app"));
        repository.initialize().unwrap();
        let library = repository.create_library("Directory", None, None).unwrap();
        let added = repository
            .add_directory_source(&KnowledgeDirectorySourceRequest {
                library_id: library.id.clone(),
                root_path: normalized_external_path(&source_root),
                recursive: true,
                ignore_patterns: vec!["*.tmp".to_string()],
                parser_version: "test-parser-v1".to_string(),
                max_file_bytes: 1024 * 1024,
                max_attempts: 3,
            })
            .unwrap();
        assert_eq!(added.queued, 1);
        let upsert = repository
            .claim_ingest_task(&library.id, 60)
            .unwrap()
            .unwrap();
        complete_claimed_task(&repository, &upsert, "directory source");

        std::fs::remove_file(&source_path).unwrap();
        let source = repository.list_sources(&library.id).unwrap().remove(0);
        let rescanned = repository
            .rescan_directory_source(&library.id, &source.id, 1024 * 1024, 3, "test-parser-v1")
            .unwrap();
        assert_eq!(rescanned.queued, 1);
        let deletion = repository
            .claim_ingest_task(&library.id, 60)
            .unwrap()
            .unwrap();
        assert_eq!(deletion.operation, "delete");
        complete_claimed_task(&repository, &deletion, "");
        assert!(repository.list_documents(&library.id).unwrap().is_empty());
    }

    #[test]
    fn queued_update_keeps_old_semantic_version_until_new_vectors_are_complete() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path().join("app"));
        repository.initialize().unwrap();
        let library = repository
            .create_library("Versions", None, Some(&semantic_config("route-a")))
            .unwrap();
        let source_path = directory.path().join("version.txt");
        std::fs::write(&source_path, "old semantic evidence").unwrap();
        enqueue_file(&repository, &library.id, &source_path);
        let first_task = repository
            .claim_ingest_task(&library.id, 60)
            .unwrap()
            .unwrap();
        let first_document =
            complete_claimed_task(&repository, &first_task, "old semantic evidence").unwrap();
        let old_chunks = repository
            .list_chunks(&library.id, Some(&first_document.id))
            .unwrap();
        repository
            .save_vectors(
                &library.id,
                "space-a",
                semantic_descriptor(),
                "route-a",
                &old_chunks
                    .iter()
                    .map(|chunk| KnowledgeVectorRecord {
                        chunk_id: chunk.id.clone(),
                        vector: vec![1.0, 0.0],
                    })
                    .collect::<Vec<_>>(),
            )
            .unwrap();

        std::fs::write(&source_path, "new keyword evidence").unwrap();
        enqueue_file(&repository, &library.id, &source_path);
        let update_task = repository
            .claim_ingest_task(&library.id, 60)
            .unwrap()
            .unwrap();
        complete_claimed_task(&repository, &update_task, "new keyword evidence");
        assert_eq!(
            repository
                .list_unvectorized_chunks(&library.id, "space-a")
                .unwrap()
                .len(),
            1
        );
        let keyword_results = repository
            .search(&KnowledgeSearchRequest {
                query: "new keyword".to_string(),
                library_ids: vec![library.id.clone()],
                strategy: KnowledgeSearchStrategy::Keyword,
                limit: 5,
                min_score: 0.0,
                query_vector: None,
                space_id: None,
            })
            .unwrap();
        assert!(keyword_results[0].content.contains("new keyword"));
        let old_semantic = repository
            .search(&KnowledgeSearchRequest {
                query: "semantic".to_string(),
                library_ids: vec![library.id.clone()],
                strategy: KnowledgeSearchStrategy::Semantic,
                limit: 5,
                min_score: 0.0,
                query_vector: Some(vec![1.0, 0.0]),
                space_id: Some("space-a".to_string()),
            })
            .unwrap();
        assert!(old_semantic[0].content.contains("old semantic"));

        let new_chunks = repository
            .list_chunks(&library.id, Some(&first_document.id))
            .unwrap();
        repository
            .save_vectors(
                &library.id,
                "space-a",
                semantic_descriptor(),
                "route-a",
                &new_chunks
                    .iter()
                    .map(|chunk| KnowledgeVectorRecord {
                        chunk_id: chunk.id.clone(),
                        vector: vec![1.0, 0.0],
                    })
                    .collect::<Vec<_>>(),
            )
            .unwrap();
        assert!(repository
            .list_unvectorized_chunks(&library.id, "space-a")
            .unwrap()
            .is_empty());
        let new_semantic = repository
            .search(&KnowledgeSearchRequest {
                query: "new".to_string(),
                library_ids: vec![library.id.clone()],
                strategy: KnowledgeSearchStrategy::Semantic,
                limit: 5,
                min_score: 0.0,
                query_vector: Some(vec![1.0, 0.0]),
                space_id: Some("space-a".to_string()),
            })
            .unwrap();
        assert!(new_semantic[0].content.contains("new keyword"));
        let fallback_count = repository
            .open_library(&repository.resolve_library_path(&library.id).unwrap())
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM knowledge_semantic_fallback_chunks",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap();
        assert_eq!(fallback_count, 0);
    }
}
