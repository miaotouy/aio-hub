// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use crate::recall::core::{RecallSearchFilters, RetrievalContext, RetrievalRequestSnapshot};
use crate::recall::retrieval_modules::{
    algorithmic_pipeline, builtin_preset_summaries, comprehensive_pipeline,
};
use crate::recall::retrieval_pipeline::{
    PipelineCompileResult, PipelineRunResponse, PresetSummary, RecallPresetId,
    RetrievalArtifactBundle, RetrievalArtifacts, RetrievalPipelineCompiler,
    RetrievalPipelineRunner,
};
use crate::recall::state::RecallState;
use serde::Deserialize;
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
    if let Some(response) = runner.validate_fallback(
        &compiled,
        requested_preset_id,
        preset_id,
        fallback_preset_id,
        fallback_reason.as_deref(),
    ) {
        return Ok(response);
    }
    if let Some(response) =
        runner.validate_config_hash(&compiled, &config_hash, requested_preset_id, preset_id)
    {
        return Ok(response);
    }
    Ok(runner.run(
        &compiled,
        &context,
        RetrievalArtifacts::default(),
        bundle.as_ref(),
        requested_preset_id,
        preset_id,
        fallback_reason,
    ))
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
