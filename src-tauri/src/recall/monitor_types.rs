// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

/// 监控消息级别
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RecallMonitorLevel {
    Info,
    Warn,
    Error,
    Success,
    Debug,
}

/// 步骤状态
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RecallStepStatus {
    #[allow(dead_code)]
    Pending,
    Running,
    Completed,
    Skipped,
    Failed,
}

/// 监控步骤详情
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecallMonitorStep {
    pub name: String,
    pub status: RecallStepStatus,
    pub duration: u64,
    pub details: Option<String>,
}

/// RAG 检索追踪数据结构
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RagPayload {
    pub steps: Vec<RecallMonitorStep>,
    pub results: Option<Vec<RagResult>>,
    pub stats: RagStats,
    pub metadata: Option<RagMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pipeline_trace: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pipeline_error: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RagResult {
    pub id: String,
    pub score: f32,
    pub content: String,
    pub source: Option<String>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RagStats {
    pub duration: u64,
    pub token_count: Option<u32>,
    pub hit_count: Option<u32>,
    pub recall_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RagMetadata {
    pub query: String,
    pub model_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine_id: Option<String>,
    pub recall_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_preset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_preset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<String>,
}

/// 索引生命周期追踪数据结构
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexPayload {
    pub steps: Vec<RecallMonitorStep>,
    pub stats: IndexStats,
    pub metadata: Option<IndexMetadata>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStats {
    pub total_files: u32,
    pub processed_files: u32,
    pub total_chunks: u32,
    pub vectorized_chunks: u32,
    pub duration: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexMetadata {
    pub recall_id: String,
    pub model_id: String,
    pub file_patterns: Vec<String>,
}

/// 系统级消息数据结构
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPayload {
    pub stats: Option<HashMap<String, f64>>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

/// 核心监控事件类型 (Tagged Union)
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "payload")]
pub enum RecallMonitorEvent {
    #[allow(clippy::upper_case_acronyms)]
    RAG(Box<RagPayload>),
    Index(IndexPayload),
    System(SystemPayload),
}

/// 监控消息结构
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecallMonitorMessage {
    pub id: String,
    pub level: RecallMonitorLevel,
    pub timestamp: i64,
    pub title: String,
    pub summary: String,
    pub module: String,
    #[serde(flatten)]
    pub event: RecallMonitorEvent,
}
