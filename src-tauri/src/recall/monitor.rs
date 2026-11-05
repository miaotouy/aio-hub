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
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub use super::monitor_types::*;

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
    use serde_json::{json, Value};

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
