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
use serde_json::Value;
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
    Skipped,
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
    RAG(Box<RagPayload>),
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn payload(execution_path: &str, pipeline_trace: Option<Value>) -> RagPayload {
        RagPayload {
            steps: Vec::new(),
            results: None,
            stats: RagStats {
                duration: 4,
                token_count: None,
                hit_count: Some(0),
                recall_count: Some(0),
            },
            metadata: Some(RagMetadata {
                query: "query".to_string(),
                model_id: String::new(),
                engine_id: (execution_path == "legacy-engine").then(|| "keyword".to_string()),
                recall_ids: Vec::new(),
                execution_path: Some(execution_path.to_string()),
                run_id: None,
                requested_preset_id: None,
                actual_preset_id: None,
                outcome: None,
            }),
            pipeline_trace,
            pipeline_error: None,
        }
    }

    #[test]
    fn rag_payload_keeps_pipeline_fields_optional_for_legacy_events() {
        let serialized = serde_json::to_value(payload("legacy-engine", None)).unwrap();

        assert_eq!(serialized["metadata"]["engineId"], "keyword");
        assert!(serialized.get("pipelineTrace").is_none());
        assert!(serialized.get("pipelineError").is_none());
    }

    #[test]
    fn rag_payload_serializes_versioned_pipeline_trace() {
        let serialized = serde_json::to_value(payload(
            "retrieval-pipeline",
            Some(json!({"traceVersion": "recall-pipeline-trace-v1"})),
        ))
        .unwrap();

        assert!(serialized["metadata"].get("engineId").is_none());
        assert_eq!(
            serialized["pipelineTrace"]["traceVersion"],
            "recall-pipeline-trace-v1"
        );
    }
}
