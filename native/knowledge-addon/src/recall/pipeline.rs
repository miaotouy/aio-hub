// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0 (the "License");

use super::core::{RecallSearchFilters, RetrievalContext, RetrievalRequestSnapshot};
use super::index::{InMemoryBase, InMemoryDatabase};
use super::retrieval_modules::{
    algorithmic_pipeline, builtin_preset_summaries, comprehensive_pipeline,
    production_module_registry,
};
use super::retrieval_pipeline::{
    PipelineExecutionId, RecallPresetId, RetrievalArtifactBundle, RetrievalArtifacts,
    RetrievalModuleRegistry, RetrievalPipelineCompiler, RetrievalPipelineRunner,
    RetrievalPipelineV1,
};
use super::storage::repository::RecallRepository;
use super::tag_pool::GlobalTagPoolManager;
use super::{decode, error, text};
use napi::bindgen_prelude::*;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex, RwLock};

#[derive(Clone, PartialEq, Eq)]
struct ModelBinding {
    storage_id: String,
    signature: String,
}

impl ModelBinding {
    fn from_bundle(bundle: &RetrievalArtifactBundle) -> Option<Self> {
        let storage_id = bundle
            .embedding_space
            .as_deref()
            .filter(|id| !id.is_empty())
            .or(bundle
                .model_signature
                .as_deref()
                .filter(|id| !id.is_empty()))?;
        Some(Self {
            storage_id: storage_id.to_string(),
            signature: bundle
                .model_signature
                .as_deref()
                .filter(|id| !id.is_empty())
                .unwrap_or(storage_id)
                .to_string(),
        })
    }
}

struct ReadModel {
    binding: Option<ModelBinding>,
    db: Arc<RwLock<InMemoryDatabase>>,
    tag_pools: GlobalTagPoolManager,
}

pub(super) struct Runtime {
    modules: Arc<RetrievalModuleRegistry>,
    read_model: Mutex<Option<ReadModel>>,
}

impl Default for Runtime {
    fn default() -> Self {
        Self {
            modules: Arc::new(
                production_module_registry().expect("built-in Recall modules must be valid"),
            ),
            read_model: Mutex::new(None),
        }
    }
}

impl Runtime {
    pub(super) fn invalidate(&self) -> Result<()> {
        *self.read_model.lock().map_err(error)? = None;
        Ok(())
    }

    pub(super) fn warmup(&self, repo: &dyn RecallRepository) -> Result<()> {
        self.invalidate()?;
        self.context(repo, String::new(), RecallSearchFilters::default(), None)?;
        Ok(())
    }

    fn context(
        &self,
        repo: &dyn RecallRepository,
        query: String,
        filters: RecallSearchFilters,
        binding: Option<ModelBinding>,
    ) -> Result<RetrievalContext> {
        let mut cached = self.read_model.lock().map_err(error)?;
        if cached.as_ref().is_none_or(|model| model.binding != binding) {
            let mut db = InMemoryDatabase::new();
            for meta in repo.list_collections().map_err(error)? {
                let id = meta.id;
                let default_model = meta.vectorization.model_used.clone();
                let mut base = InMemoryBase::new(meta);
                for entry in repo.load_entries(id).map_err(error)? {
                    base.sync_entry(entry);
                }
                base.is_fully_loaded = true;
                let storage_id = binding
                    .as_ref()
                    .map(|value| value.storage_id.as_str())
                    .unwrap_or(&default_model);
                if !storage_id.is_empty() {
                    if let Some((vectors, dimension, tokens)) =
                        repo.load_vectors(id, storage_id).map_err(error)?
                    {
                        // Persistent vectors use model IDs; the immutable bundle also identifies
                        // the active profile route. Bind this read view to both without rewriting storage.
                        let signature = binding
                            .as_ref()
                            .map(|value| value.signature.as_str())
                            .unwrap_or(storage_id);
                        base.vector_store.rebuild(
                            signature.to_string(),
                            dimension,
                            tokens,
                            vectors,
                        );
                        base.refresh_vector_status();
                    }
                }
                db.bases.insert(id, Arc::new(RwLock::new(base)));
            }
            let tag_pools = GlobalTagPoolManager::new();
            let pools = repo
                .list_tag_pool_models()
                .map_err(error)?
                .into_iter()
                .map(|model_id| repo.load_tag_pool(&model_id))
                .collect::<std::result::Result<Vec<_>, _>>()
                .map_err(error)?;
            tag_pools.replace_pools(pools).map_err(error)?;
            if let Some(binding) = &binding {
                let mut pools = tag_pools.pools.write().map_err(error)?;
                if let Some(pool) = pools.get(&binding.storage_id).cloned() {
                    pools.insert(binding.signature.clone(), pool);
                }
            }
            *cached = Some(ReadModel {
                binding,
                db: Arc::new(RwLock::new(db)),
                tag_pools,
            });
        }
        let model = cached
            .as_ref()
            .ok_or_else(|| error("Recall read model is unavailable"))?;
        let app_data_dir = repo
            .main_db_path()
            .parent()
            .and_then(|path| path.parent())
            .ok_or_else(|| error("Recall data directory is unavailable"))?
            .to_path_buf();
        Ok(RetrievalContext {
            db: model.db.clone(),
            tag_pool_manager: model.tag_pools.clone(),
            app_data_dir,
            request: Some(RetrievalRequestSnapshot { query, filters }),
        })
    }

    pub(super) fn execute(
        &self,
        repo: &dyn RecallRepository,
        command: &str,
        a: &Value,
    ) -> Result<Value> {
        let compiler = RetrievalPipelineCompiler::new(self.modules.clone());
        Ok(match command {
            "recall_list_retrieval_presets" => json!(builtin_preset_summaries()),
            "recall_list_retrieval_modules" => json!(self.modules.list()),
            "recall_get_retrieval_pipeline_template" => json!(preset_pipeline(a)?),
            "recall_compile_retrieval_pipeline" => json!(
                compiler
                    .compile(&preset_pipeline(a)?, text(a, "runId")?.to_string())
                    .result
            ),
            "recall_compile_custom_retrieval_pipeline" => json!(
                compiler
                    .compile(&custom_pipeline(a)?, text(a, "runId")?.to_string())
                    .result
            ),
            "recall_run_retrieval_pipeline" | "recall_run_custom_retrieval_pipeline" => {
                let request: RunRequest =
                    decode(a.get("request").ok_or_else(|| error("missing request"))?)?;
                let (pipeline, requested, actual) =
                    if command == "recall_run_custom_retrieval_pipeline" {
                        let pipeline = normalize_custom(
                            request
                                .pipeline
                                .clone()
                                .ok_or_else(|| error("missing pipeline"))?,
                        )?;
                        (
                            pipeline,
                            PipelineExecutionId::Custom,
                            PipelineExecutionId::Custom,
                        )
                    } else {
                        let preset = request.preset_id.ok_or_else(|| error("missing presetId"))?;
                        (
                            executable_pipeline(preset, request.filters.limit),
                            request.requested_preset_id.unwrap_or(preset).into(),
                            preset.into(),
                        )
                    };
                let compiled = compiler.compile(&pipeline, request.run_id);
                let runner = RetrievalPipelineRunner;
                if let Some(actual_preset) = request
                    .preset_id
                    .filter(|_| actual != PipelineExecutionId::Custom)
                {
                    if let Some(response) = runner.validate_fallback(
                        &compiled,
                        request.requested_preset_id.unwrap_or(actual_preset),
                        actual_preset,
                        request.fallback_preset_id,
                        request.fallback_reason.as_deref(),
                    ) {
                        return Ok(json!(response));
                    }
                }
                if let Some(response) =
                    runner.validate_config_hash(&compiled, &request.config_hash, requested, actual)
                {
                    return Ok(json!(response));
                }
                let context = self.context(
                    repo,
                    request.query,
                    request.filters,
                    request.bundle.as_ref().and_then(ModelBinding::from_bundle),
                )?;
                json!(runner.run(
                    &compiled,
                    &context,
                    RetrievalArtifacts::default(),
                    request.bundle.as_ref(),
                    requested,
                    actual,
                    request.fallback_reason
                ))
            }
            _ => return Err(error(format!("Unknown Recall pipeline command: {command}"))),
        })
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunRequest {
    query: String,
    filters: RecallSearchFilters,
    preset_id: Option<RecallPresetId>,
    requested_preset_id: Option<RecallPresetId>,
    fallback_preset_id: Option<RecallPresetId>,
    fallback_reason: Option<String>,
    pipeline: Option<RetrievalPipelineV1>,
    run_id: String,
    config_hash: String,
    bundle: Option<RetrievalArtifactBundle>,
}

fn executable_pipeline(preset: RecallPresetId, limit: Option<usize>) -> RetrievalPipelineV1 {
    match preset {
        RecallPresetId::Algorithmic => algorithmic_pipeline(limit),
        RecallPresetId::Comprehensive => comprehensive_pipeline(limit),
    }
}

fn preset_pipeline(a: &Value) -> Result<RetrievalPipelineV1> {
    let preset = decode(a.get("presetId").ok_or_else(|| error("missing presetId"))?)?;
    let limit = a
        .get("limit")
        .filter(|value| !value.is_null())
        .map(decode::<usize>)
        .transpose()?;
    Ok(executable_pipeline(preset, limit))
}

fn custom_pipeline(a: &Value) -> Result<RetrievalPipelineV1> {
    normalize_custom(decode(
        a.get("pipeline").ok_or_else(|| error("missing pipeline"))?,
    )?)
}

fn normalize_custom(mut pipeline: RetrievalPipelineV1) -> Result<RetrievalPipelineV1> {
    if pipeline.nodes.len() > 64 {
        return Err(error(
            "custom Playground pipelines may contain at most 64 nodes",
        ));
    }
    pipeline.id = "playground-custom".to_string();
    pipeline.display_name = "Playground 自定义管线".to_string();
    pipeline.algorithm_version = "recall-playground-custom-v1".to_string();
    Ok(pipeline)
}

#[cfg(test)]
mod tests;
