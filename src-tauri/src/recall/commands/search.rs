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

use crate::recall::core::{
    QueryPayload, RecallResult, RecallSearchFilters, RetrievalContext, RetrievalEngineInfo,
};
use crate::recall::monitor::{
    emit_monitor_event, RagMetadata, RagPayload, RagResult, RagStats, RecallMonitorEvent,
    RecallMonitorLevel, RecallMonitorStep, RecallStepStatus,
};
use crate::recall::state::RecallState;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn recall_list_engines(
    state: State<'_, RecallState>,
) -> Result<Vec<RetrievalEngineInfo>, String> {
    Ok(state.engines.iter().map(|e| e.info()).collect())
}

#[tauri::command]
pub async fn recall_search(
    app: AppHandle,
    state: State<'_, RecallState>,
    query: String,
    filters: RecallSearchFilters,
    engine_id: Option<String>,
    vector_payload: Option<Vec<f32>>,
    model: Option<String>,
) -> Result<Vec<RecallResult>, String> {
    let start_time = std::time::Instant::now();
    let id = engine_id.unwrap_or_else(|| "keyword".to_string());

    log::info!(
        "[KB_SEARCH] 接收检索请求: engine={}, query='{}', recall_ids={:?}, has_vector={}",
        id,
        query,
        filters.recall_ids,
        vector_payload.is_some()
    );

    let engine = state
        .get_engine(&id)
        .ok_or_else(|| format!("找不到检索引擎: {}", id))?;

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let context = RetrievalContext {
        db: state.imdb.clone(),
        tag_pool_manager: state.tag_pool.clone(),
        app_data_dir,
    };

    // 步骤1: 查询向量生成 (如果是预向量化的则耗时极短)
    let vector_gen_start = std::time::Instant::now();
    let payload = if let Some(vector) = vector_payload.as_ref() {
        QueryPayload::Vector {
            vector: vector.clone(),
            model: model.clone().unwrap_or_default(),
            query: if query.is_empty() {
                None
            } else {
                Some(query.clone())
            },
        }
    } else {
        QueryPayload::Text(query.clone())
    };
    let vector_gen_duration = vector_gen_start.elapsed().as_millis() as u64;

    // 步骤2: 向量召回与初步过滤
    let recall_start = std::time::Instant::now();
    let results = engine.search(&payload, &filters, &context)?;
    let recall_duration = recall_start.elapsed().as_millis() as u64;

    // 推送监控事件
    let duration = start_time.elapsed().as_millis() as u64;
    let results_preview: Vec<RagResult> = results
        .iter()
        .take(10)
        .map(|r| RagResult {
            id: r.entry.id.to_string(),
            score: r.score,
            content: r.entry.content.chars().take(200).collect(),
            source: Some(r.recall_name.clone()),
            metadata: None,
        })
        .collect();

    let recall_ids_str: Vec<String> = filters
        .recall_ids
        .as_ref()
        .map(|ids| ids.iter().map(|id| id.to_string()).collect())
        .unwrap_or_default();

    let monitor_payload = RagPayload {
        steps: vec![
            RecallMonitorStep {
                name: "查询向量生成".to_string(),
                status: RecallStepStatus::Completed,
                duration: vector_gen_duration,
                details: Some(format!(
                    "查询类型: {}",
                    if vector_payload.is_some() {
                        "向量查询"
                    } else {
                        "文本查询"
                    }
                )),
            },
            RecallMonitorStep {
                name: "向量召回".to_string(),
                status: RecallStepStatus::Completed,
                duration: recall_duration,
                details: Some(format!("召回 {} 个结果", results.len())),
            },
            RecallMonitorStep {
                name: "上下文构建".to_string(),
                status: RecallStepStatus::Completed,
                duration: duration.saturating_sub(vector_gen_duration + recall_duration),
                details: Some(format!("构建检索上下文，引擎: {}", id)),
            },
        ],
        results: Some(results_preview),
        stats: RagStats {
            duration,
            token_count: None,
            hit_count: Some(results.len() as u32),
            recall_count: Some(results.len() as u32),
        },
        metadata: Some(RagMetadata {
            query: query.clone(),
            model_id: model.unwrap_or_default(),
            engine_id: id.clone(),
            recall_ids: recall_ids_str.clone(),
        }),
    };

    let _ = emit_monitor_event(
        &app,
        RecallMonitorEvent::RAG(monitor_payload),
        RecallMonitorLevel::Info,
        "RAG 检索完成",
        &format!(
            "在 {} 个思绪集中检索到 {} 个结果",
            recall_ids_str.len(),
            results.len()
        ),
        "VectorEngine",
    );

    Ok(results)
}
