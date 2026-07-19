// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum KnowledgeSourceKind {
    File,
    Directory,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum KnowledgeIngestTaskStatus {
    Pending,
    Processing,
    Retry,
    Failed,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSource {
    pub id: String,
    pub library_id: String,
    pub kind: KnowledgeSourceKind,
    pub root_path: String,
    pub recursive: bool,
    pub ignore_patterns: Vec<String>,
    pub status: String,
    pub file_count: usize,
    pub pending_task_count: usize,
    pub failed_task_count: usize,
    pub last_scan_at: Option<i64>,
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIngestTask {
    pub id: String,
    pub library_id: String,
    pub source_id: String,
    pub source_file_id: String,
    pub source_path: String,
    pub operation: String,
    pub expected_checksum: String,
    pub file_size: usize,
    pub modified_at: i64,
    pub parser_version: String,
    pub status: KnowledgeIngestTaskStatus,
    pub attempt_count: usize,
    pub max_attempts: usize,
    pub available_at: i64,
    pub lease_token: Option<String>,
    pub lease_expires_at: Option<i64>,
    pub cancel_requested: bool,
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEnqueuePathsRequest {
    pub library_id: String,
    pub paths: Vec<String>,
    pub source_id: Option<String>,
    pub parser_version: String,
    pub max_file_bytes: usize,
    pub max_attempts: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEnqueueFailure {
    pub source_path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEnqueueResult {
    pub task_ids: Vec<String>,
    pub queued: usize,
    pub skipped_unchanged: usize,
    pub skipped_queued: usize,
    pub failures: Vec<KnowledgeEnqueueFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDirectorySourceRequest {
    pub library_id: String,
    pub root_path: String,
    pub recursive: bool,
    pub ignore_patterns: Vec<String>,
    pub parser_version: String,
    pub max_file_bytes: usize,
    pub max_attempts: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCompleteIngestTaskRequest {
    pub library_id: String,
    pub task_id: String,
    pub lease_token: String,
    pub title: Option<String>,
    pub mime_type: Option<String>,
    pub content: String,
    pub source_checksum: String,
    pub parser_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeFailIngestTaskRequest {
    pub library_id: String,
    pub task_id: String,
    pub lease_token: String,
    pub error: String,
    pub retryable: bool,
    pub retry_delay_seconds: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeChunkingConfig {
    #[serde(default = "default_chunk_strategy")]
    pub strategy: String,
    #[serde(default = "default_target_chars")]
    pub target_chars: usize,
    #[serde(default = "default_overlap_chars")]
    pub overlap_chars: usize,
}

impl Default for KnowledgeChunkingConfig {
    fn default() -> Self {
        Self {
            strategy: default_chunk_strategy(),
            target_chars: default_target_chars(),
            overlap_chars: default_overlap_chars(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEmbeddingIndexConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub route_key: String,
    #[serde(default)]
    pub requested_dimensions: Option<usize>,
    #[serde(default = "default_query_task_type")]
    pub query_task_type: String,
    #[serde(default = "default_document_task_type")]
    pub document_task_type: String,
    #[serde(default = "default_encoding_format")]
    pub encoding_format: String,
    #[serde(default = "default_adapter_contract_version")]
    pub adapter_contract_version: usize,
}

impl Default for KnowledgeEmbeddingIndexConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            route_key: String::new(),
            requested_dimensions: None,
            query_task_type: default_query_task_type(),
            document_task_type: default_document_task_type(),
            encoding_format: default_encoding_format(),
            adapter_contract_version: default_adapter_contract_version(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIndexFlags {
    #[serde(default = "default_true")]
    pub keyword: bool,
    #[serde(default)]
    pub semantic: bool,
    #[serde(default = "default_true")]
    pub graph: bool,
}

impl Default for KnowledgeIndexFlags {
    fn default() -> Self {
        Self {
            keyword: true,
            semantic: false,
            graph: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeLibraryIndexConfig {
    #[serde(default = "default_config_schema_version")]
    pub schema_version: usize,
    #[serde(default)]
    pub chunking: KnowledgeChunkingConfig,
    #[serde(default)]
    pub embedding: KnowledgeEmbeddingIndexConfig,
    #[serde(default)]
    pub indexes: KnowledgeIndexFlags,
}

impl Default for KnowledgeLibraryIndexConfig {
    fn default() -> Self {
        Self {
            schema_version: default_config_schema_version(),
            chunking: KnowledgeChunkingConfig::default(),
            embedding: KnowledgeEmbeddingIndexConfig::default(),
            indexes: KnowledgeIndexFlags::default(),
        }
    }
}

impl KnowledgeLibraryIndexConfig {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err(format!(
                "不支持的 Knowledge library config schema: {}",
                self.schema_version
            ));
        }
        if self.chunking.strategy != "fixed" {
            return Err("Knowledge 分块策略当前只支持 fixed".to_string());
        }
        if !(200..=8000).contains(&self.chunking.target_chars) {
            return Err("Knowledge 分块目标字符数必须在 200 到 8000 之间".to_string());
        }
        if self.chunking.overlap_chars >= self.chunking.target_chars
            || self.chunking.overlap_chars > 2000
        {
            return Err("Knowledge 分块重叠必须小于目标字符数且不超过 2000".to_string());
        }
        if !self.indexes.keyword {
            return Err("Knowledge 当前版本必须保留关键词索引".to_string());
        }
        if self.embedding.enabled != self.indexes.semantic {
            return Err("Knowledge 语义索引开关与 Embedding 配置状态必须一致".to_string());
        }
        if self.embedding.enabled && self.embedding.route_key.trim().is_empty() {
            return Err("启用 Knowledge 语义索引时必须指定 Embedding route".to_string());
        }
        let supported_task_types = [
            "RETRIEVAL_QUERY",
            "RETRIEVAL_DOCUMENT",
            "SEMANTIC_SIMILARITY",
            "CLASSIFICATION",
            "CLUSTERING",
        ];
        if !supported_task_types.contains(&self.embedding.query_task_type.as_str())
            || !supported_task_types.contains(&self.embedding.document_task_type.as_str())
        {
            return Err("Knowledge Embedding task type 不受支持".to_string());
        }
        if let Some(dimensions) = self.embedding.requested_dimensions {
            if !(1..=65536).contains(&dimensions) {
                return Err("Knowledge 请求向量维度必须在 1 到 65536 之间".to_string());
            }
        }
        if self.embedding.encoding_format != "float" {
            return Err("Knowledge 当前只支持 float Embedding 编码".to_string());
        }
        if self.embedding.adapter_contract_version != 1 {
            return Err("Knowledge 当前只支持 Embedding adapter contract v1".to_string());
        }
        Ok(())
    }
}

fn default_true() -> bool {
    true
}
fn default_config_schema_version() -> usize {
    1
}
fn default_chunk_strategy() -> String {
    "fixed".to_string()
}
fn default_target_chars() -> usize {
    1000
}
fn default_overlap_chars() -> usize {
    120
}
fn default_query_task_type() -> String {
    "RETRIEVAL_QUERY".to_string()
}
fn default_document_task_type() -> String {
    "RETRIEVAL_DOCUMENT".to_string()
}
fn default_encoding_format() -> String {
    "float".to_string()
}
fn default_adapter_contract_version() -> usize {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeLibrary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub embedding_model_id: String,
    pub active_embedding_space_id: String,
    pub embedding_route_key: String,
    pub embedding_space_descriptor: Option<serde_json::Value>,
    pub dimension: usize,
    pub config: KnowledgeLibraryIndexConfig,
    pub document_count: usize,
    pub chunk_count: usize,
    pub source_count: usize,
    pub pending_task_count: usize,
    pub failed_task_count: usize,
    pub keyword_index_status: String,
    pub semantic_index_status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDocument {
    pub id: String,
    pub library_id: String,
    pub source_path: String,
    pub title: String,
    pub checksum: String,
    pub mime_type: String,
    pub size: usize,
    pub status: String,
    pub tags: Vec<String>,
    pub chunk_count: usize,
    pub vectorized_chunk_count: usize,
    pub source_id: String,
    pub source_file_id: String,
    pub source_checksum: String,
    pub parser_version: String,
    pub version: usize,
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeChunk {
    pub id: String,
    pub library_id: String,
    pub document_id: String,
    pub source_path: String,
    pub title: String,
    pub chunk_index: usize,
    pub content: String,
    pub checksum: String,
    pub heading: Option<String>,
    pub start_offset: usize,
    pub end_offset: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeVectorRecord {
    pub chunk_id: String,
    pub vector: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIndexStatus {
    pub library_id: String,
    pub total_chunks: usize,
    pub vectorized_chunks: usize,
    pub pending_chunks: usize,
    pub keyword_indexed_chunks: usize,
    pub semantic_fallback_chunks: usize,
    pub source_count: usize,
    pub pending_task_count: usize,
    pub failed_task_count: usize,
    pub embedding_model_id: String,
    pub active_embedding_space_id: String,
    pub embedding_route_key: String,
    pub embedding_space_descriptor: Option<serde_json::Value>,
    pub dimension: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum KnowledgeSearchStrategy {
    Auto,
    Keyword,
    Semantic,
    Hybrid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum KnowledgeSignalType {
    KnowledgeBm25,
    KnowledgeVector,
    KnowledgeGraph,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSignal {
    pub signal_type: KnowledgeSignalType,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeResult {
    pub source_type: String,
    pub library_id: String,
    pub library_name: String,
    pub document_id: String,
    pub source_path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub chunk_id: String,
    pub chunk_index: usize,
    pub heading: Option<String>,
    pub content: String,
    pub score: f32,
    pub signals: Vec<KnowledgeSignal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchRequest {
    pub query: String,
    pub library_ids: Vec<String>,
    pub strategy: KnowledgeSearchStrategy,
    pub limit: usize,
    pub min_score: f32,
    pub query_vector: Option<Vec<f32>>,
    pub space_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIngestRequest {
    pub library_id: String,
    pub source_path: String,
    pub title: Option<String>,
    pub mime_type: Option<String>,
    pub content: String,
}
