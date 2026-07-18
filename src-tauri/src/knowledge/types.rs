// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use serde::{Deserialize, Serialize};

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
    pub config: serde_json::Value,
    pub document_count: usize,
    pub chunk_count: usize,
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
    pub chunk_count: usize,
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
