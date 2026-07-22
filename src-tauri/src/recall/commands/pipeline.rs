// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use crate::recall::core::{RecallSearchFilters, RetrievalContext, RetrievalRequestSnapshot};
use crate::recall::monitor::{
    emit_monitor_event, RagMetadata, RagPayload, RagResult, RagStats, RecallMonitorEvent,
    RecallMonitorLevel, RecallMonitorStep, RecallStepStatus,
};
use crate::recall::retrieval_modules::{
    algorithmic_pipeline, builtin_preset_summaries, comprehensive_pipeline,
};
use crate::recall::retrieval_pipeline::{
    PipelineCompileResult, PipelineRunOutcome, PipelineRunResponse, PresetSummary, RecallPresetId,
    RetrievalArtifactBundle, RetrievalArtifacts, RetrievalPipelineCompiler,
    RetrievalPipelineRunner, TraceStepStatus,
};
use crate::recall::state::RecallState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::{AppHandle, State};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalPipelineRunRequest {
    pub query: String,
    pub filters: RecallSearchFilters,
    pub preset_id: RecallPresetId,
    pub requested_preset_id: Option<RecallPresetId>,
    pub fallback_preset_id: Option<RecallPresetId>,
    pub fallback_reason: Option<String>,
    pub run_id: String,
    pub config_hash: String,
    pub bundle: Option<RetrievalArtifactBundle>,
}

#[tauri::command]
pub async fn recall_list_retrieval_presets() -> Result<Vec<PresetSummary>, String> {
    Ok(builtin_preset_summaries())
}

#[tauri::command]
pub async fn recall_compile_retrieval_pipeline(
    state: State<'_, RecallState>,
    preset_id: RecallPresetId,
    run_id: String,
    limit: Option<usize>,
) -> Result<PipelineCompileResult, String> {
    let pipeline = executable_pipeline(preset_id, limit)?;
    Ok(
        RetrievalPipelineCompiler::new(state.pipeline_modules.clone())
            .compile(&pipeline, run_id)
            .result,
    )
}

#[tauri::command]
pub async fn recall_run_retrieval_pipeline(
    app: AppHandle,
    state: State<'_, RecallState>,
    request: RetrievalPipelineRunRequest,
) -> Result<PipelineRunResponse, String> {
    let started_at = std::time::Instant::now();
    let RetrievalPipelineRunRequest {
        query,
        filters,
        preset_id,
        requested_preset_id,
        fallback_preset_id,
        fallback_reason,
        run_id,
        config_hash,
        bundle,
    } = request;
    let monitor_query = query.clone();
    let monitor_recall_ids = filters
        .recall_ids
        .as_ref()
        .map(|ids| ids.iter().map(ToString::to_string).collect::<Vec<_>>())
        .unwrap_or_default();
    let monitor_model_id = bundle
        .as_ref()
        .and_then(|value| value.embedding_space.clone())
        .unwrap_or_default();
    let requested_preset_id = requested_preset_id.unwrap_or(preset_id);
    let pipeline = executable_pipeline(preset_id, filters.limit)?;
    let compiled =
        RetrievalPipelineCompiler::new(state.pipeline_modules.clone()).compile(&pipeline, run_id);
    let context = RetrievalContext {
        db: state.imdb.clone(),
        tag_pool_manager: state.tag_pool.clone(),
        app_data_dir: crate::get_app_data_dir(app.config()),
        request: Some(RetrievalRequestSnapshot { query, filters }),
    };
    let runner = RetrievalPipelineRunner;
    let response = if let Some(response) = runner.validate_fallback(
        &compiled,
        requested_preset_id,
        preset_id,
        fallback_preset_id,
        fallback_reason.as_deref(),
    ) {
        response
    } else if let Some(response) =
        runner.validate_config_hash(&compiled, &config_hash, requested_preset_id, preset_id)
    {
        response
    } else {
        runner.run(
            &compiled,
            &context,
            RetrievalArtifacts::default(),
            bundle.as_ref(),
            requested_preset_id,
            preset_id,
            fallback_reason,
        )
    };
    emit_pipeline_monitor(
        &app,
        &monitor_query,
        &monitor_recall_ids,
        &monitor_model_id,
        started_at.elapsed().as_millis() as u64,
        &response,
    );
    Ok(response)
}

fn enum_name(value: &impl Serialize) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_else(|| "unknown".to_string())
}

fn step_details(step: &crate::recall::retrieval_pipeline::PipelineTraceStepV1) -> String {
    let mut parts = Vec::new();
    if let Some(input) = step.input_count {
        parts.push(format!("input={input}"));
    }
    if let Some(output) = step.output_count {
        parts.push(format!("output={output}"));
    }
    if let Some(trimmed) = step.candidate_trimmed {
        parts.push(format!("trimmed={trimmed}"));
    }
    if let Some(reason) = step.reason.as_deref() {
        parts.push(reason.to_string());
    }
    parts.join(" · ")
}

fn pipeline_result_metadata(result: &crate::recall::core::RecallResult) -> HashMap<String, Value> {
    let relevance_score = result
        .signals
        .iter()
        .map(|signal| signal.score)
        .sum::<f32>();
    HashMap::from([
        ("scoreSemantics".to_string(), json!("ranking-score")),
        ("relevanceScore".to_string(), json!(relevance_score)),
        ("matchType".to_string(), json!(result.match_type)),
        ("signals".to_string(), json!(result.signals)),
    ])
}

fn emit_pipeline_monitor(
    app: &AppHandle,
    query: &str,
    recall_ids: &[String],
    model_id: &str,
    duration: u64,
    response: &PipelineRunResponse,
) {
    let trace_steps = response
        .trace
        .as_ref()
        .map(|trace| {
            trace
                .steps
                .iter()
                .map(|step| RecallMonitorStep {
                    name: format!("{} · {}", enum_name(&step.phase), step.module_id),
                    status: match step.status {
                        TraceStepStatus::Completed => RecallStepStatus::Completed,
                        TraceStepStatus::Skipped => RecallStepStatus::Skipped,
                        TraceStepStatus::Failed => RecallStepStatus::Failed,
                    },
                    duration: step.duration_ms,
                    details: Some(step_details(step)).filter(|value| !value.is_empty()),
                })
                .collect()
        })
        .unwrap_or_default();
    let results = response
        .results
        .iter()
        .take(10)
        .map(|result| RagResult {
            id: result.entry.id.to_string(),
            score: result.score,
            content: result.entry.content.chars().take(200).collect(),
            source: Some(result.recall_name.clone()),
            metadata: Some(pipeline_result_metadata(result)),
        })
        .collect();
    let outcome = enum_name(&response.outcome);
    let requested = enum_name(&response.requested_preset_id);
    let actual = enum_name(&response.actual_preset_id);
    let payload = RagPayload {
        steps: trace_steps,
        results: Some(results),
        stats: RagStats {
            duration,
            token_count: None,
            hit_count: Some(response.results.len() as u32),
            recall_count: Some(response.results.len() as u32),
        },
        metadata: Some(RagMetadata {
            query: query.to_string(),
            model_id: model_id.to_string(),
            engine_id: None,
            recall_ids: recall_ids.to_vec(),
            execution_path: Some("retrieval-pipeline".to_string()),
            run_id: Some(response.run_id.clone()),
            requested_preset_id: Some(requested.clone()),
            actual_preset_id: Some(actual.clone()),
            outcome: Some(outcome.clone()),
        }),
        pipeline_trace: response
            .trace
            .as_ref()
            .and_then(|trace| serde_json::to_value(trace).ok()),
        pipeline_error: response
            .error
            .as_ref()
            .and_then(|error| serde_json::to_value(error).ok()),
    };
    let level = match response.outcome {
        PipelineRunOutcome::Failed | PipelineRunOutcome::Cancelled => RecallMonitorLevel::Error,
        PipelineRunOutcome::Fallback => RecallMonitorLevel::Warn,
        PipelineRunOutcome::Success | PipelineRunOutcome::Empty => RecallMonitorLevel::Success,
    };
    let _ = emit_monitor_event(
        app,
        RecallMonitorEvent::RAG(Box::new(payload)),
        level,
        "检索管线运行完成",
        &format!(
            "{requested} -> {actual} · {outcome} · {} 个结果",
            response.results.len()
        ),
        "RetrievalPipeline",
    );
}

fn executable_pipeline(
    preset_id: RecallPresetId,
    limit: Option<usize>,
) -> Result<crate::recall::retrieval_pipeline::RetrievalPipelineV1, String> {
    match preset_id {
        RecallPresetId::Algorithmic => Ok(algorithmic_pipeline(limit)),
        RecallPresetId::Comprehensive => Ok(comprehensive_pipeline(limit)),
    }
}
