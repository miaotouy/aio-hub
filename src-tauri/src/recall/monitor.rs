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

use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// 监控消息级别
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RecallMonitorLevel {
    Info,
    #[allow(dead_code)]
    Warn,
    #[allow(dead_code)]
    Error,
    Success,
    #[allow(dead_code)]
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
    #[allow(dead_code)]
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
    pub engine_id: String,
    pub recall_ids: Vec<String>,
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

/// 链式处理追踪数据结构
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainPayload {
    pub steps: Vec<RecallMonitorStep>,
    pub metadata: Option<ChainMetadata>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainMetadata {
    pub chain_type: String,
    pub parameters: HashMap<String, serde_json::Value>,
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
    RAG(RagPayload),
    Index(IndexPayload),
    #[allow(dead_code)]
    Chain(ChainPayload),
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

/// 发送监控事件到前端
///
/// 事件名为 "recall-monitor"
pub fn emit_monitor_event(
    app: &AppHandle,
    event: RecallMonitorEvent,
    level: RecallMonitorLevel,
    title: &str,
    summary: &str,
    module: &str,
) -> Result<(), String> {
    let message = RecallMonitorMessage {
        id: Uuid::new_v4().to_string(),
        level,
        timestamp: Utc::now().timestamp_millis(),
        title: title.to_string(),
        summary: summary.to_string(),
        module: module.to_string(),
        event,
    };

    app.emit("recall-monitor", &message)
        .map_err(|e| format!("Failed to emit monitor event: {}", e))
}

/// 发送心跳包
#[tauri::command]
pub async fn recall_monitor_heartbeat(app: AppHandle) -> Result<(), String> {
    emit_monitor_event(
        &app,
        RecallMonitorEvent::System(SystemPayload {
            stats: None,
            metadata: Some(
                [("heartbeat".to_string(), serde_json::Value::Bool(true))]
                    .into_iter()
                    .collect(),
            ),
        }),
        RecallMonitorLevel::Info,
        "心跳消息",
        "监控系统运行中",
        "System",
    )
}
