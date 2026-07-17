// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use super::types::*;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct KnowledgeRepository {
    manifest_path: PathBuf,
    libraries_dir: PathBuf,
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
        Ok(())
    }

    pub fn create_library(
        &self,
        name: &str,
        description: Option<&str>,
    ) -> Result<KnowledgeLibrary, String> {
        let id = Uuid::new_v4().to_string();
        let db_path = self.library_path(&id);
        self.initialize_library(&db_path)?;
        let now = now();
        let manifest_result = self.open_manifest()?.execute(
            "INSERT INTO knowledge_libraries(
                    id, name, description, db_path, embedding_model_id, dimension,
                    config_json, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, '', 0, '{}', ?5, ?5)",
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
                "SELECT id, name, description, embedding_model_id, dimension,
                        config_json, created_at, updated_at
                 FROM knowledge_libraries ORDER BY updated_at DESC, id",
            )
            .map_err(|error| format!("准备 Knowledge library 列表失败: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            })
            .map_err(|error| format!("查询 Knowledge library 失败: {error}"))?;
        rows.map(|row| {
            let (id, name, description, model, dimension, config, created_at, updated_at) =
                row.map_err(|error| format!("读取 Knowledge library 失败: {error}"))?;
            let (document_count, chunk_count) = self.library_counts(&id)?;
            Ok(KnowledgeLibrary {
                id,
                name,
                description,
                embedding_model_id: model,
                dimension: dimension.max(0) as usize,
                config: serde_json::from_str(&config).unwrap_or_else(|_| serde_json::json!({})),
                document_count,
                chunk_count,
                created_at,
                updated_at,
            })
        })
        .collect()
    }

    pub fn get_library(&self, id: &str) -> Result<Option<KnowledgeLibrary>, String> {
        Ok(self
            .list_libraries()?
            .into_iter()
            .find(|library| library.id == id))
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
            )?;
        }
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge rebuild 失败: {error}"))?;
        self.touch_library(library_id)?;
        Ok(documents.len())
    }

    pub fn save_vectors(
        &self,
        library_id: &str,
        model_id: &str,
        records: &[KnowledgeVectorRecord],
    ) -> Result<(), String> {
        let path = self.resolve_library_path(library_id)?;
        let mut connection = self.open_library(&path)?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开启 Knowledge vector 事务失败: {error}"))?;
        for record in records {
            if record.vector.is_empty() {
                return Err("Knowledge chunk vector 不能为空".to_string());
            }
            transaction
                .execute(
                    "INSERT INTO chunk_vectors(chunk_id, model_id, dimension, vector_blob, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)
                     ON CONFLICT(chunk_id, model_id) DO UPDATE SET
                        dimension = excluded.dimension,
                        vector_blob = excluded.vector_blob,
                        updated_at = excluded.updated_at",
                    params![
                        record.chunk_id,
                        model_id,
                        record.vector.len() as i64,
                        encode_vector(&record.vector),
                        now(),
                    ],
                )
                .map_err(|error| format!("写入 Knowledge vector 失败: {error}"))?;
        }
        transaction
            .commit()
            .map_err(|error| format!("提交 Knowledge vector 失败: {error}"))?;
        let dimension = records.first().map_or(0, |record| record.vector.len());
        self.open_manifest()?
            .execute(
                "UPDATE knowledge_libraries SET embedding_model_id = ?2, dimension = ?3,
                 updated_at = ?4 WHERE id = ?1",
                params![library_id, model_id, dimension as i64, now()],
            )
            .map_err(|error| format!("更新 Knowledge vector 配置失败: {error}"))?;
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
                request.model_id.as_deref(),
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
        self.open_library(path)?
            .execute_batch(LIBRARY_SCHEMA)
            .map_err(|error| format!("初始化 Knowledge library 失败: {error}"))
    }

    #[cfg(test)]
    pub fn library_file_path(&self, id: &str) -> PathBuf {
        self.library_path(id)
    }
}

const LIBRARY_SCHEMA: &str = r#"
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
CREATE TABLE IF NOT EXISTS chunk_vectors(
  chunk_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(chunk_id, model_id),
  FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS chunk_edges(
  source_chunk_id TEXT NOT NULL,
  target_chunk_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  PRIMARY KEY(source_chunk_id, target_chunk_id, relation)
);
"#;

fn replace_document_chunks(
    transaction: &Transaction<'_>,
    library_id: &str,
    document_id: &str,
    source_path: &str,
    title: &str,
    content: &str,
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
    let chunks = chunk_document(library_id, document_id, source_path, title, content);
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
    Ok(())
}

fn chunk_document(
    library_id: &str,
    document_id: &str,
    source_path: &str,
    title: &str,
    content: &str,
) -> Vec<KnowledgeChunk> {
    const TARGET_CHARS: usize = 1000;
    const OVERLAP_CHARS: usize = 120;
    let boundaries = content
        .char_indices()
        .map(|(index, _)| index)
        .chain([content.len()])
        .collect::<Vec<_>>();
    let mut chunks = Vec::new();
    let mut start_char = 0;
    let mut heading: Option<String> = None;
    while start_char + 1 < boundaries.len() {
        let end_char = (start_char + TARGET_CHARS).min(boundaries.len() - 1);
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
        start_char = end_char.saturating_sub(OVERLAP_CHARS);
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
    model_id: Option<&str>,
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
             WHERE (?1 IS NULL OR v.model_id = ?1)",
        )
        .map_err(|error| format!("准备 Knowledge vector 检索失败: {error}"))?;
    let rows = statement
        .query_map([model_id], |row| {
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

    #[test]
    fn library_document_chunk_and_source_round_trip() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let library = repository.create_library("Docs", None).unwrap();
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
                model_id: None,
            })
            .unwrap();
        assert_eq!(results[0].source_type, "knowledge");
        assert_eq!(results[0].source_path, "docs/guide.md");
        assert_eq!(results[0].heading.as_deref(), Some("Installation"));
    }

    #[test]
    fn reingest_replaces_chunks_and_vector_search_is_isolated_per_library() {
        let directory = tempdir().unwrap();
        let repository = KnowledgeRepository::new(directory.path());
        repository.initialize().unwrap();
        let first = repository.create_library("First", None).unwrap();
        let second = repository.create_library("Second", None).unwrap();
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
                model_id: None,
            })
            .unwrap()[0]
            .chunk_id
            .clone();
        repository
            .save_vectors(
                &first.id,
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
                model_id: Some("model".to_string()),
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
        let library = repository.create_library("Delete", None).unwrap();
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
                model_id: None,
            })
            .unwrap()[0]
            .chunk_id
            .clone();
        repository
            .save_vectors(
                &library.id,
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
}
