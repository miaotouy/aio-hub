// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use crate::recall::core::{
    RecallEntry, RecallResult, RecallSignal, RecallSignalType, RetrievalContext,
    RetrievalRequestSnapshot,
};
use crate::recall::index::tokenize_query;
use crate::recall::retrieval_pipeline::{
    AllowedOverride, ArtifactKey, CandidateSignal, ExternalRequirementKind, FailurePolicy,
    PipelineCandidate, PipelineErrorCode, PipelineTraceV1, PresetStability, PresetSummary,
    PresetVisibility, RecallPresetId, RetrievalArtifact, RetrievalArtifacts, RetrievalModule,
    RetrievalModuleError, RetrievalModuleInfo, RetrievalModuleOutput, RetrievalModuleRegistry,
    RetrievalPhase, RetrievalPipelineNodeV1, RetrievalPipelineV1, PIPELINE_SCHEMA_VERSION,
};
use crate::recall::search::lens::LensRetrievalEngine;
use crate::recall::search::vector::cosine_similarity;
use crate::recall::tag_sea::TagSea;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

pub const ALGORITHMIC_PIPELINE_VERSION: &str = "recall-pipeline-algorithmic-v1";
const MODULE_VERSION: &str = "1";
const DEFAULT_CANDIDATE_BUDGET: usize = 80;
const DEFAULT_LIMIT: usize = 6;

fn module_info(
    id: &str,
    phase: RetrievalPhase,
    requires: Vec<ArtifactKey>,
    provides: Vec<ArtifactKey>,
    parameter_schema: Value,
) -> RetrievalModuleInfo {
    RetrievalModuleInfo {
        id: id.to_string(),
        version: MODULE_VERSION.to_string(),
        phase,
        requires,
        provides,
        external_requirements: Vec::new(),
        parameter_schema,
    }
}

fn execution_error(message: impl Into<String>) -> RetrievalModuleError {
    RetrievalModuleError {
        code: PipelineErrorCode::ModuleExecutionFailed,
        message: message.into(),
        node_id: None,
        details: None,
    }
}

fn external_artifact_error(message: impl Into<String>) -> RetrievalModuleError {
    RetrievalModuleError {
        code: PipelineErrorCode::ExternalArtifactInvalid,
        message: message.into(),
        node_id: None,
        details: None,
    }
}

fn request(context: &RetrievalContext) -> Result<&RetrievalRequestSnapshot, RetrievalModuleError> {
    context
        .request
        .as_ref()
        .ok_or_else(|| execution_error("retrieval pipeline request snapshot is missing"))
}

fn normalized_query(artifacts: &RetrievalArtifacts) -> Result<String, RetrievalModuleError> {
    match artifacts.get(ArtifactKey::NormalizedQuery) {
        Some(RetrievalArtifact::NormalizedQuery(query)) => Ok(query.clone()),
        _ => Err(execution_error(
            "normalized query artifact has the wrong type",
        )),
    }
}

fn ranked_candidates(
    artifacts: &RetrievalArtifacts,
) -> Result<Vec<PipelineCandidate>, RetrievalModuleError> {
    match artifacts.get(ArtifactKey::RankedCandidates) {
        Some(RetrievalArtifact::RankedCandidates(candidates)) => Ok(candidates.clone()),
        _ => Err(execution_error(
            "ranked candidates artifact has the wrong type",
        )),
    }
}

fn stable_sort(candidates: &mut [PipelineCandidate]) {
    candidates.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.recall_id.cmp(&right.recall_id))
            .then_with(|| left.entry_id.cmp(&right.entry_id))
    });
}

fn entry_matches_policy(
    recall_id: Uuid,
    entry: &RecallEntry,
    request: &RetrievalRequestSnapshot,
) -> bool {
    if request
        .filters
        .recall_ids
        .as_ref()
        .is_some_and(|ids| !ids.contains(&recall_id))
    {
        return false;
    }
    if request.filters.enabled_only.unwrap_or(true) && !entry.enabled {
        return false;
    }
    if let Some(tags) = &request.filters.tags {
        if !entry.tags.iter().any(|tag| tags.contains(&tag.name))
            && !entry.core_tags.iter().any(|tag| tags.contains(&tag.name))
        {
            return false;
        }
    }
    true
}

pub struct QueryNormalizeModule;

impl RetrievalModule for QueryNormalizeModule {
    fn info(&self) -> RetrievalModuleInfo {
        module_info(
            "query-normalize",
            RetrievalPhase::Prepare,
            Vec::new(),
            vec![ArtifactKey::NormalizedQuery],
            json!({"type": "object", "additionalProperties": false}),
        )
    }

    fn execute(
        &self,
        context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        _params: &Value,
        _trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
        let query = request(context)?
            .query
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        artifacts.insert(RetrievalArtifact::NormalizedQuery(query));
        Ok(RetrievalModuleOutput::default())
    }
}

pub struct QueryTokenizeModule;

impl RetrievalModule for QueryTokenizeModule {
    fn info(&self) -> RetrievalModuleInfo {
        module_info(
            "query-tokenize",
            RetrievalPhase::Prepare,
            vec![ArtifactKey::NormalizedQuery],
            vec![ArtifactKey::QueryTokens],
            json!({"type": "object", "additionalProperties": false}),
        )
    }

    fn execute(
        &self,
        _context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        _params: &Value,
        _trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
        let tokens = tokenize_query(&normalized_query(artifacts)?);
        artifacts.insert(RetrievalArtifact::QueryTokens(tokens));
        Ok(RetrievalModuleOutput::default())
    }
}

pub struct KeywordRecallModule;

impl RetrievalModule for KeywordRecallModule {
    fn info(&self) -> RetrievalModuleInfo {
        module_info(
            "keyword-recall",
            RetrievalPhase::Retrieve,
            vec![ArtifactKey::NormalizedQuery, ArtifactKey::QueryTokens],
            vec![ArtifactKey::CandidateSignals],
            json!({
                "type": "object",
                "required": ["candidateBudget"],
                "properties": {
                    "candidateBudget": {"type": "integer", "minimum": 1, "maximum": 10000}
                },
                "additionalProperties": false
            }),
        )
    }

    fn execute(
        &self,
        context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        params: &Value,
        _trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
        let normalized_query = normalized_query(artifacts)?;
        let tokens = match artifacts.get(ArtifactKey::QueryTokens) {
            Some(RetrievalArtifact::QueryTokens(tokens)) => tokens.clone(),
            _ => return Err(execution_error("query tokens artifact has the wrong type")),
        };
        let request = request(context)?;
        let budget = params["candidateBudget"].as_u64().unwrap_or(1) as usize;
        let database = context
            .db
            .read()
            .map_err(|_| execution_error("failed to read Recall database"))?;
        let mut signals_by_candidate: BTreeMap<(Uuid, Uuid), Vec<CandidateSignal>> =
            BTreeMap::new();

        for (recall_id, base_lock) in &database.bases {
            if request
                .filters
                .recall_ids
                .as_ref()
                .is_some_and(|ids| !ids.contains(recall_id))
            {
                continue;
            }
            let base = base_lock
                .read()
                .map_err(|_| execution_error("failed to read Recall collection"))?;
            let index_scores: BTreeMap<Uuid, f32> = base
                .text_index
                .search_tokens(&normalized_query, &tokens)
                .into_iter()
                .collect();
            let mut candidate_ids: BTreeSet<Uuid> = index_scores.keys().copied().collect();
            if !normalized_query.is_empty() {
                candidate_ids.extend(base.entries.iter().filter_map(|(entry_id, entry)| {
                    entry
                        .key
                        .to_lowercase()
                        .contains(&normalized_query)
                        .then_some(*entry_id)
                }));
            }

            for entry_id in candidate_ids {
                let Some(entry) = base.entries.get(&entry_id) else {
                    continue;
                };
                if !entry_matches_policy(*recall_id, entry, request) {
                    continue;
                }
                let output = signals_by_candidate
                    .entry((*recall_id, entry_id))
                    .or_default();
                if let Some(score) = index_scores
                    .get(&entry_id)
                    .copied()
                    .filter(|score| *score > 0.0)
                {
                    output.push(CandidateSignal {
                        recall_id: *recall_id,
                        entry_id,
                        signal_type: RecallSignalType::Keyword,
                        raw_score: score,
                        normalized_score: None,
                        source_module_id: "keyword-recall".to_string(),
                        details: json!({"source": "inverted-index"}),
                    });
                }
                if !normalized_query.is_empty()
                    && entry.key.to_lowercase().contains(&normalized_query)
                {
                    output.push(CandidateSignal {
                        recall_id: *recall_id,
                        entry_id,
                        signal_type: RecallSignalType::Key,
                        raw_score: 10.0,
                        normalized_score: None,
                        source_module_id: "keyword-recall".to_string(),
                        details: json!({"source": "key-contains"}),
                    });
                }
            }
        }

        let total_candidates = signals_by_candidate.len();
        let mut candidate_scores: Vec<((Uuid, Uuid), f32)> = signals_by_candidate
            .iter()
            .map(|(id, signals)| (*id, signals.iter().map(|signal| signal.raw_score).sum()))
            .collect();
        candidate_scores.sort_by(|left, right| {
            right
                .1
                .total_cmp(&left.1)
                .then_with(|| left.0.cmp(&right.0))
        });
        let kept: BTreeSet<(Uuid, Uuid)> = candidate_scores
            .into_iter()
            .take(budget)
            .map(|(id, _)| id)
            .collect();
        let signals = signals_by_candidate
            .into_iter()
            .filter(|(id, _)| kept.contains(id))
            .flat_map(|(_, signals)| signals)
            .collect();
        artifacts.append_candidate_signals(signals);

        let trimmed = total_candidates.saturating_sub(kept.len());
        Ok(RetrievalModuleOutput {
            candidate_trimmed: Some(trimmed),
            trim_reason: (trimmed > 0).then(|| "candidateBudget".to_string()),
        })
    }
}

pub struct ContentVectorRecallModule;

impl RetrievalModule for ContentVectorRecallModule {
    fn info(&self) -> RetrievalModuleInfo {
        let mut info = module_info(
            "content-vector-recall",
            RetrievalPhase::Retrieve,
            vec![ArtifactKey::QueryEmbedding],
            vec![ArtifactKey::CandidateSignals],
            json!({
                "type": "object",
                "required": ["candidateBudget"],
                "properties": {
                    "candidateBudget": {"type": "integer", "minimum": 1, "maximum": 10000}
                },
                "additionalProperties": false
            }),
        );
        info.external_requirements = vec![ExternalRequirementKind::QueryEmbedding];
        info
    }

    fn execute(
        &self,
        context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        params: &Value,
        _trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
        let query_embedding = match artifacts.get(ArtifactKey::QueryEmbedding) {
            Some(RetrievalArtifact::QueryEmbedding(vector)) if !vector.is_empty() => vector.clone(),
            _ => {
                return Err(external_artifact_error(
                    "query embedding artifact is missing or empty",
                ))
            }
        };
        let bundle = artifacts.bundle().ok_or_else(|| {
            external_artifact_error("query embedding is missing its immutable artifact bundle")
        })?;
        let model_signature = bundle
            .model_signature
            .as_deref()
            .filter(|value| !value.is_empty());
        let request = request(context)?;
        let budget = params["candidateBudget"].as_u64().unwrap_or(1) as usize;
        let database = context
            .db
            .read()
            .map_err(|_| execution_error("failed to read Recall database"))?;
        let mut candidates = Vec::new();

        for (recall_id, base_lock) in &database.bases {
            if request
                .filters
                .recall_ids
                .as_ref()
                .is_some_and(|ids| !ids.contains(recall_id))
            {
                continue;
            }
            let base = base_lock
                .read()
                .map_err(|_| execution_error("failed to read Recall collection"))?;
            if base.vector_store.dimension != query_embedding.len()
                || base.vector_store.dimension == 0
                || (model_signature.is_some_and(|model| {
                    !base.vector_store.model_id.is_empty() && base.vector_store.model_id != model
                }))
            {
                continue;
            }
            for (index, entry_id) in base.vector_store.ids.iter().enumerate() {
                let Some(entry) = base.entries.get(entry_id) else {
                    continue;
                };
                if !entry_matches_policy(*recall_id, entry, request) {
                    continue;
                }
                let start = index * base.vector_store.dimension;
                let end = start + base.vector_store.dimension;
                let Some(stored_vector) = base.vector_store.data.get(start..end) else {
                    return Err(execution_error(
                        "Recall vector matrix is internally inconsistent",
                    ));
                };
                let score = cosine_similarity(&query_embedding, stored_vector);
                if !score.is_finite() || score <= 0.0 {
                    continue;
                }
                candidates.push(CandidateSignal {
                    recall_id: *recall_id,
                    entry_id: *entry_id,
                    signal_type: RecallSignalType::ContentVector,
                    raw_score: score,
                    normalized_score: None,
                    source_module_id: "content-vector-recall".to_string(),
                    details: json!({
                        "modelSignature": bundle.model_signature,
                        "embeddingSpace": bundle.embedding_space,
                        "source": "content-vector"
                    }),
                });
            }
        }

        candidates.sort_by(|left, right| {
            right
                .raw_score
                .total_cmp(&left.raw_score)
                .then_with(|| left.recall_id.cmp(&right.recall_id))
                .then_with(|| left.entry_id.cmp(&right.entry_id))
        });
        let total_candidates = candidates.len();
        candidates.truncate(budget);
        let trimmed = total_candidates.saturating_sub(candidates.len());
        artifacts.append_candidate_signals(candidates);
        Ok(RetrievalModuleOutput {
            candidate_trimmed: Some(trimmed),
            trim_reason: (trimmed > 0).then(|| "candidateBudget".to_string()),
        })
    }
}

pub struct TagVectorRecallModule;

impl RetrievalModule for TagVectorRecallModule {
    fn info(&self) -> RetrievalModuleInfo {
        let mut info = module_info(
            "tag-vector-recall",
            RetrievalPhase::Retrieve,
            vec![ArtifactKey::QueryEmbedding],
            vec![ArtifactKey::CandidateSignals],
            json!({
                "type": "object",
                "required": ["candidateBudget", "neighborBudget"],
                "properties": {
                    "candidateBudget": {"type": "integer", "minimum": 1, "maximum": 10000},
                    "neighborBudget": {"type": "integer", "minimum": 1, "maximum": 1000}
                },
                "additionalProperties": false
            }),
        );
        info.external_requirements = vec![ExternalRequirementKind::QueryEmbedding];
        info
    }

    fn execute(
        &self,
        context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        params: &Value,
        _trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
        let query_embedding = match artifacts.get(ArtifactKey::QueryEmbedding) {
            Some(RetrievalArtifact::QueryEmbedding(vector)) if !vector.is_empty() => vector.clone(),
            _ => {
                return Err(external_artifact_error(
                    "query embedding artifact is missing or empty",
                ))
            }
        };
        let model_signature = artifacts
            .bundle()
            .and_then(|bundle| bundle.model_signature.as_deref())
            .filter(|model| !model.is_empty())
            .ok_or_else(|| {
                external_artifact_error("tag vector recall requires a bundle model signature")
            })?
            .to_string();
        let candidate_budget = params["candidateBudget"].as_u64().unwrap_or(1) as usize;
        let neighbor_budget = params["neighborBudget"].as_u64().unwrap_or(1) as usize;
        let request = request(context)?;
        let pool_lock = context
            .tag_pool_manager
            .get_pool(&context.app_data_dir, &model_signature)
            .map_err(execution_error)?;
        let pool = pool_lock
            .read()
            .map_err(|_| execution_error("failed to read Recall tag pool"))?;
        if pool.dimension != query_embedding.len() || pool.dimension == 0 {
            artifacts.append_candidate_signals(Vec::new());
            return Ok(RetrievalModuleOutput::default());
        }
        let tag_scores: BTreeMap<String, f32> = pool
            .search_neighbors(&query_embedding, neighbor_budget)
            .into_iter()
            .filter_map(|(index, distance)| {
                pool.get_tag_name(index)
                    .map(|tag| (tag.clone(), (1.0 - distance).max(0.0)))
            })
            .filter(|(_, score)| *score > 0.0)
            .collect();
        drop(pool);

        let database = context
            .db
            .read()
            .map_err(|_| execution_error("failed to read Recall database"))?;
        let mut signals = Vec::new();
        for (recall_id, base_lock) in &database.bases {
            if request
                .filters
                .recall_ids
                .as_ref()
                .is_some_and(|ids| !ids.contains(recall_id))
            {
                continue;
            }
            let base = base_lock
                .read()
                .map_err(|_| execution_error("failed to read Recall collection"))?;
            for entry in base.entries.values() {
                if !entry_matches_policy(*recall_id, entry, request) {
                    continue;
                }
                let score = entry
                    .tags
                    .iter()
                    .chain(entry.core_tags.iter())
                    .filter_map(|tag| tag_scores.get(&tag.name).copied())
                    .fold(0.0_f32, f32::max);
                if score > 0.0 {
                    signals.push(CandidateSignal {
                        recall_id: *recall_id,
                        entry_id: entry.id,
                        signal_type: RecallSignalType::TagVector,
                        raw_score: score,
                        normalized_score: None,
                        source_module_id: "tag-vector-recall".to_string(),
                        details: json!({
                            "modelSignature": model_signature,
                            "neighborBudget": neighbor_budget,
                            "source": "tag-pool"
                        }),
                    });
                }
            }
        }
        signals.sort_by(|left, right| {
            right
                .raw_score
                .total_cmp(&left.raw_score)
                .then_with(|| left.recall_id.cmp(&right.recall_id))
                .then_with(|| left.entry_id.cmp(&right.entry_id))
        });
        let total = signals.len();
        signals.truncate(candidate_budget);
        let trimmed = total.saturating_sub(signals.len());
        artifacts.append_candidate_signals(signals);
        Ok(RetrievalModuleOutput {
            candidate_trimmed: Some(trimmed),
            trim_reason: (trimmed > 0).then(|| "candidateBudget".to_string()),
        })
    }
}

pub struct LensAssociationRecallModule;

impl RetrievalModule for LensAssociationRecallModule {
    fn info(&self) -> RetrievalModuleInfo {
        let mut info = module_info(
            "lens-association-recall",
            RetrievalPhase::Retrieve,
            vec![ArtifactKey::QueryEmbedding],
            vec![ArtifactKey::CandidateSignals],
            json!({
                "type": "object",
                "required": ["candidateBudget"],
                "properties": {
                    "candidateBudget": {"type": "integer", "minimum": 1, "maximum": 10000}
                },
                "additionalProperties": false
            }),
        );
        info.external_requirements = vec![ExternalRequirementKind::QueryEmbedding];
        info
    }

    fn execute(
        &self,
        context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        params: &Value,
        _trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
        let query_embedding = match artifacts.get(ArtifactKey::QueryEmbedding) {
            Some(RetrievalArtifact::QueryEmbedding(vector)) if !vector.is_empty() => vector.clone(),
            _ => {
                return Err(external_artifact_error(
                    "query embedding artifact is missing or empty",
                ))
            }
        };
        let model_signature = artifacts
            .bundle()
            .and_then(|bundle| bundle.model_signature.as_deref())
            .filter(|model| !model.is_empty())
            .ok_or_else(|| {
                external_artifact_error("Lens recall requires a bundle model signature")
            })?
            .to_string();
        let request = request(context)?;
        let budget = params["candidateBudget"].as_u64().unwrap_or(1) as usize;
        let pool_lock = context
            .tag_pool_manager
            .get_pool(&context.app_data_dir, &model_signature)
            .map_err(execution_error)?;
        let pool = {
            let mut pool = pool_lock
                .write()
                .map_err(|_| execution_error("failed to write Recall tag pool"))?;
            if pool.dimension != query_embedding.len() || pool.dimension == 0 {
                artifacts.append_candidate_signals(Vec::new());
                return Ok(RetrievalModuleOutput::default());
            }
            if pool.index.is_none() && !pool.registry.is_empty() {
                pool.rebuild_index();
            }
            pool.clone()
        };

        let database = context
            .db
            .read()
            .map_err(|_| execution_error("failed to read Recall database"))?;
        let engine = LensRetrievalEngine::new();
        let mut signals = Vec::new();
        for (recall_id, base_lock) in &database.bases {
            if request
                .filters
                .recall_ids
                .as_ref()
                .is_some_and(|ids| !ids.contains(recall_id))
            {
                continue;
            }
            let base = base_lock
                .read()
                .map_err(|_| execution_error("failed to read Recall collection"))?;
            let tag_sea = TagSea::build(&base, pool.clone());
            let raw_scores = engine
                .execute_lens_candidate_scores(&query_embedding, &request.filters, &tag_sea)
                .map_err(execution_error)?;
            for (entry_id, raw_score) in raw_scores {
                let Some(entry) = base.entries.get(&entry_id) else {
                    continue;
                };
                if !entry_matches_policy(*recall_id, entry, request) || !raw_score.is_finite() {
                    continue;
                }
                signals.push(CandidateSignal {
                    recall_id: *recall_id,
                    entry_id,
                    signal_type: RecallSignalType::Lens,
                    raw_score,
                    normalized_score: None,
                    source_module_id: "lens-association-recall".to_string(),
                    details: json!({
                        "modelSignature": model_signature,
                        "historyVectorCount": request.filters.history_vectors.as_ref().map_or(0, Vec::len),
                        "texture": request.filters.texture,
                        "source": "lens-association"
                    }),
                });
            }
        }
        signals.sort_by(|left, right| {
            right
                .raw_score
                .total_cmp(&left.raw_score)
                .then_with(|| left.recall_id.cmp(&right.recall_id))
                .then_with(|| left.entry_id.cmp(&right.entry_id))
        });
        let total = signals.len();
        signals.truncate(budget);
        let trimmed = total.saturating_sub(signals.len());
        artifacts.append_candidate_signals(signals);
        Ok(RetrievalModuleOutput {
            candidate_trimmed: Some(trimmed),
            trim_reason: (trimmed > 0).then(|| "candidateBudget".to_string()),
        })
    }
}

pub struct KeywordNormalizeModule;

impl RetrievalModule for KeywordNormalizeModule {
    fn info(&self) -> RetrievalModuleInfo {
        module_info(
            "keyword-normalize",
            RetrievalPhase::Normalize,
            vec![ArtifactKey::CandidateSignals],
            vec![ArtifactKey::NormalizedSignals],
            json!({"type": "object", "additionalProperties": false}),
        )
    }

    fn execute(
        &self,
        _context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        _params: &Value,
        _trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
        let mut signals = match artifacts.get(ArtifactKey::CandidateSignals) {
            Some(RetrievalArtifact::CandidateSignals(signals)) => signals.clone(),
            _ => {
                return Err(execution_error(
                    "candidate signals artifact has the wrong type",
                ))
            }
        };
        let mut maxima = BTreeMap::<RecallSignalType, f32>::new();
        for signal in &signals {
            let value = signal.raw_score.max(0.0).ln_1p();
            maxima
                .entry(signal.signal_type)
                .and_modify(|maximum| *maximum = maximum.max(value))
                .or_insert(value);
        }
        for signal in &mut signals {
            let maximum = maxima.get(&signal.signal_type).copied().unwrap_or(0.0);
            signal.normalized_score = Some(if maximum > 0.0 {
                signal.raw_score.max(0.0).ln_1p() / maximum
            } else {
                0.0
            });
        }
        artifacts.insert(RetrievalArtifact::NormalizedSignals(signals));
        Ok(RetrievalModuleOutput::default())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignalContribution {
    signal_type: RecallSignalType,
    raw_score: f32,
    normalized_score: f32,
    contribution: f32,
    source_module_id: String,
    details: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CandidateDetails {
    match_type: String,
    signals: Vec<SignalContribution>,
    #[serde(default)]
    priority: Option<i32>,
    #[serde(default)]
    priority_boost: Option<f32>,
}

pub struct WeightedFusionModule;

impl RetrievalModule for WeightedFusionModule {
    fn info(&self) -> RetrievalModuleInfo {
        module_info(
            "weighted-fusion",
            RetrievalPhase::Fuse,
            vec![ArtifactKey::NormalizedSignals],
            vec![ArtifactKey::FusedCandidates],
            json!({
                "type": "object",
                "required": ["keywordWeight", "keyWeight"],
                "properties": {
                    "keywordWeight": {"type": "number", "minimum": 0, "maximum": 1},
                    "keyWeight": {"type": "number", "minimum": 0, "maximum": 1}
                },
                "additionalProperties": false
            }),
        )
    }

    fn execute(
        &self,
        _context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        params: &Value,
        _trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
        let signals = match artifacts.get(ArtifactKey::NormalizedSignals) {
            Some(RetrievalArtifact::NormalizedSignals(signals)) => signals,
            _ => {
                return Err(execution_error(
                    "normalized signals artifact has the wrong type",
                ))
            }
        };
        let keyword_weight = params["keywordWeight"].as_f64().unwrap_or(0.7) as f32;
        let key_weight = params["keyWeight"].as_f64().unwrap_or(0.3) as f32;
        let mut grouped = BTreeMap::<(Uuid, Uuid), Vec<SignalContribution>>::new();
        for signal in signals {
            let weight = match signal.signal_type {
                RecallSignalType::Key => key_weight,
                RecallSignalType::Keyword => keyword_weight,
                _ => 0.0,
            };
            let normalized_score = signal.normalized_score.unwrap_or(0.0);
            grouped
                .entry((signal.recall_id, signal.entry_id))
                .or_default()
                .push(SignalContribution {
                    signal_type: signal.signal_type,
                    raw_score: signal.raw_score,
                    normalized_score,
                    contribution: normalized_score * weight,
                    source_module_id: signal.source_module_id.clone(),
                    details: signal.details.clone(),
                });
        }
        let mut candidates = Vec::with_capacity(grouped.len());
        for ((recall_id, entry_id), signals) in grouped {
            let score = signals.iter().map(|signal| signal.contribution).sum();
            let details = serde_json::to_value(CandidateDetails {
                match_type: "algorithmic".to_string(),
                signals,
                priority: None,
                priority_boost: None,
            })
            .map_err(|error| execution_error(error.to_string()))?;
            candidates.push(PipelineCandidate {
                recall_id,
                entry_id,
                score,
                details,
            });
        }
        stable_sort(&mut candidates);
        artifacts.insert(RetrievalArtifact::FusedCandidates(candidates));
        Ok(RetrievalModuleOutput::default())
    }
}

pub struct PriorityBoostModule;

impl RetrievalModule for PriorityBoostModule {
    fn info(&self) -> RetrievalModuleInfo {
        module_info(
            "priority-boost",
            RetrievalPhase::Rerank,
            vec![ArtifactKey::FusedCandidates],
            vec![ArtifactKey::RankedCandidates],
            json!({"type": "object", "additionalProperties": false}),
        )
    }

    fn execute(
        &self,
        context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        _params: &Value,
        _trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
        let mut candidates = match artifacts.get(ArtifactKey::FusedCandidates) {
            Some(RetrievalArtifact::FusedCandidates(candidates)) => candidates.clone(),
            _ => {
                return Err(execution_error(
                    "fused candidates artifact has the wrong type",
                ))
            }
        };
        let database = context
            .db
            .read()
            .map_err(|_| execution_error("failed to read Recall database"))?;
        for candidate in &mut candidates {
            let base = database
                .bases
                .get(&candidate.recall_id)
                .ok_or_else(|| execution_error("candidate collection is missing"))?
                .read()
                .map_err(|_| execution_error("failed to read Recall collection"))?;
            let entry = base
                .entries
                .get(&candidate.entry_id)
                .ok_or_else(|| execution_error("candidate entry is missing"))?;
            let boost = (entry.priority as f32 / 100.0).log10().max(0.0) * 0.1;
            candidate.score *= 1.0 + boost;
            if let Ok(mut details) =
                serde_json::from_value::<CandidateDetails>(candidate.details.clone())
            {
                details.priority = Some(entry.priority);
                details.priority_boost = Some(boost);
                candidate.details = serde_json::to_value(details)
                    .map_err(|error| execution_error(error.to_string()))?;
            }
        }
        stable_sort(&mut candidates);
        artifacts.insert(RetrievalArtifact::RankedCandidates(candidates));
        Ok(RetrievalModuleOutput::default())
    }
}

pub struct EntryPolicyFilterModule;

impl RetrievalModule for EntryPolicyFilterModule {
    fn info(&self) -> RetrievalModuleInfo {
        module_info(
            "entry-policy-filter",
            RetrievalPhase::Filter,
            vec![ArtifactKey::RankedCandidates],
            vec![ArtifactKey::RankedCandidates],
            json!({"type": "object", "additionalProperties": false}),
        )
    }

    fn execute(
        &self,
        context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        _params: &Value,
        _trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
        let request = request(context)?;
        let candidates = ranked_candidates(artifacts)?;
        let before = candidates.len();
        let database = context
            .db
            .read()
            .map_err(|_| execution_error("failed to read Recall database"))?;
        let filtered = candidates
            .into_iter()
            .filter(|candidate| {
                database
                    .bases
                    .get(&candidate.recall_id)
                    .and_then(|base| base.read().ok())
                    .and_then(|base| {
                        base.entries
                            .get(&candidate.entry_id)
                            .map(|entry| entry_matches_policy(candidate.recall_id, entry, request))
                    })
                    .unwrap_or(false)
            })
            .collect::<Vec<_>>();
        let trimmed = before.saturating_sub(filtered.len());
        artifacts.insert(RetrievalArtifact::RankedCandidates(filtered));
        Ok(RetrievalModuleOutput {
            candidate_trimmed: Some(trimmed),
            trim_reason: (trimmed > 0).then(|| "recallIds/enabledOnly/tags".to_string()),
        })
    }
}

pub struct ScoreThresholdModule;

impl RetrievalModule for ScoreThresholdModule {
    fn info(&self) -> RetrievalModuleInfo {
        module_info(
            "score-threshold",
            RetrievalPhase::Filter,
            vec![ArtifactKey::RankedCandidates],
            vec![ArtifactKey::RankedCandidates],
            json!({"type": "object", "additionalProperties": false}),
        )
    }

    fn execute(
        &self,
        context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        _params: &Value,
        _trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
        let request = request(context)?;
        let candidates = ranked_candidates(artifacts)?;
        let before = candidates.len();
        let database = context
            .db
            .read()
            .map_err(|_| execution_error("failed to read Recall database"))?;
        let filtered = candidates
            .into_iter()
            .filter(|candidate| {
                let collection_minimum = database
                    .bases
                    .get(&candidate.recall_id)
                    .and_then(|base| base.read().ok())
                    .and_then(|base| {
                        base.meta
                            .config
                            .get("minScore")
                            .and_then(Value::as_f64)
                            .map(|value| value as f32)
                    });
                collection_minimum
                    .or(request.filters.min_score)
                    .is_none_or(|minimum| candidate.score >= minimum)
            })
            .collect::<Vec<_>>();
        let trimmed = before.saturating_sub(filtered.len());
        artifacts.insert(RetrievalArtifact::RankedCandidates(filtered));
        Ok(RetrievalModuleOutput {
            candidate_trimmed: Some(trimmed),
            trim_reason: (trimmed > 0).then(|| "finalScoreThreshold".to_string()),
        })
    }
}

pub struct ResultFinalizerModule;

impl RetrievalModule for ResultFinalizerModule {
    fn info(&self) -> RetrievalModuleInfo {
        module_info(
            "result-finalizer",
            RetrievalPhase::Finalize,
            vec![ArtifactKey::NormalizedQuery, ArtifactKey::RankedCandidates],
            vec![ArtifactKey::FinalResults],
            json!({
                "type": "object",
                "required": ["limit"],
                "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 100}},
                "additionalProperties": false
            }),
        )
    }

    fn execute(
        &self,
        context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        params: &Value,
        _trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
        let query = normalized_query(artifacts).unwrap_or_else(|_| {
            context
                .request
                .as_ref()
                .map(|request| request.query.to_lowercase())
                .unwrap_or_default()
        });
        let mut candidates = ranked_candidates(artifacts)?;
        stable_sort(&mut candidates);
        let before = candidates.len();
        let limit = params["limit"].as_u64().unwrap_or(DEFAULT_LIMIT as u64) as usize;
        candidates.truncate(limit);
        let database = context
            .db
            .read()
            .map_err(|_| execution_error("failed to read Recall database"))?;
        let mut results = Vec::with_capacity(candidates.len());
        for candidate in candidates {
            let base = database
                .bases
                .get(&candidate.recall_id)
                .ok_or_else(|| execution_error("candidate collection is missing"))?
                .read()
                .map_err(|_| execution_error("failed to read Recall collection"))?;
            let entry = base
                .entries
                .get(&candidate.entry_id)
                .cloned()
                .ok_or_else(|| execution_error("candidate entry is missing"))?;
            let details = serde_json::from_value::<CandidateDetails>(candidate.details).unwrap_or(
                CandidateDetails {
                    match_type: "pipeline".to_string(),
                    signals: Vec::new(),
                    priority: None,
                    priority_boost: None,
                },
            );
            results.push(RecallResult {
                highlight: Some(extract_highlight(&entry.content, &query)),
                signals: details
                    .signals
                    .iter()
                    .map(|signal| RecallSignal {
                        signal_type: signal.signal_type,
                        score: signal.contribution,
                    })
                    .collect(),
                entry,
                score: candidate.score,
                match_type: details.match_type,
                recall_id: candidate.recall_id,
                recall_name: base.meta.name.clone(),
                trace: None,
            });
        }
        artifacts.insert(RetrievalArtifact::FinalResults(results));
        let trimmed = before.saturating_sub(limit);
        Ok(RetrievalModuleOutput {
            candidate_trimmed: Some(trimmed),
            trim_reason: (trimmed > 0).then(|| "finalLimit".to_string()),
        })
    }
}

fn extract_highlight(content: &str, query: &str) -> String {
    if query.is_empty() {
        return content.chars().take(100).collect();
    }
    let content_lower = content.to_lowercase();
    let Some(position) = content_lower.find(query) else {
        return content.chars().take(100).collect();
    };
    let mut start = position.saturating_sub(30);
    while start > 0 && !content.is_char_boundary(start) {
        start -= 1;
    }
    let mut end = (position + query.len() + 60).min(content.len());
    while end < content.len() && !content.is_char_boundary(end) {
        end += 1;
    }
    format!(
        "{}{}{}",
        if start > 0 { "..." } else { "" },
        &content[start..end],
        if end < content.len() { "..." } else { "" }
    )
}

pub fn production_module_registry() -> Result<RetrievalModuleRegistry, RetrievalModuleError> {
    let mut registry = RetrievalModuleRegistry::default();
    registry.register(QueryNormalizeModule)?;
    registry.register(QueryTokenizeModule)?;
    registry.register(KeywordRecallModule)?;
    registry.register(ContentVectorRecallModule)?;
    registry.register(TagVectorRecallModule)?;
    registry.register(LensAssociationRecallModule)?;
    registry.register(KeywordNormalizeModule)?;
    registry.register(WeightedFusionModule)?;
    registry.register(PriorityBoostModule)?;
    registry.register(EntryPolicyFilterModule)?;
    registry.register(ScoreThresholdModule)?;
    registry.register(ResultFinalizerModule)?;
    Ok(registry)
}

pub fn builtin_preset_summaries() -> Vec<PresetSummary> {
    let limit_override = AllowedOverride {
        key: "limit".to_string(),
        schema: json!({
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": DEFAULT_LIMIT,
            "scope": "finalize"
        }),
    };
    vec![
        PresetSummary {
            id: RecallPresetId::Algorithmic,
            display_name: "算法召回".to_string(),
            description: "离线可用的关键词与字面信号召回".to_string(),
            visibility: PresetVisibility::Product,
            stability: PresetStability::Stable,
            algorithm_version: ALGORITHMIC_PIPELINE_VERSION.to_string(),
            allowed_overrides: vec![limit_override.clone()],
        },
        PresetSummary {
            id: RecallPresetId::Comprehensive,
            display_name: "综合召回".to_string(),
            description: "融合字面、向量、标签与联想信号的召回".to_string(),
            visibility: PresetVisibility::Product,
            stability: PresetStability::Stable,
            algorithm_version: "recall-pipeline-comprehensive-v1".to_string(),
            allowed_overrides: vec![limit_override],
        },
    ]
}

pub fn algorithmic_pipeline(limit: Option<usize>) -> RetrievalPipelineV1 {
    let limit = limit.unwrap_or(DEFAULT_LIMIT);
    let node = |id: &str, module_id: &str, depends_on: Option<Vec<&str>>, params: Value| {
        RetrievalPipelineNodeV1 {
            id: id.to_string(),
            module_id: module_id.to_string(),
            enabled: true,
            depends_on: depends_on.map(|ids| ids.into_iter().map(ToString::to_string).collect()),
            params,
            failure_policy: Some(FailurePolicy::Abort),
        }
    };
    RetrievalPipelineV1 {
        schema_version: PIPELINE_SCHEMA_VERSION,
        id: "algorithmic".to_string(),
        display_name: "算法召回".to_string(),
        algorithm_version: ALGORITHMIC_PIPELINE_VERSION.to_string(),
        candidate_budget: DEFAULT_CANDIDATE_BUDGET,
        expansion_budget: 0,
        nodes: vec![
            node("normalize-query", "query-normalize", None, json!({})),
            node(
                "tokenize-query",
                "query-tokenize",
                Some(vec!["normalize-query"]),
                json!({}),
            ),
            node(
                "retrieve-keyword",
                "keyword-recall",
                Some(vec!["tokenize-query"]),
                json!({"candidateBudget": DEFAULT_CANDIDATE_BUDGET}),
            ),
            node(
                "normalize-keyword",
                "keyword-normalize",
                Some(vec!["retrieve-keyword"]),
                json!({}),
            ),
            node(
                "fuse-signals",
                "weighted-fusion",
                Some(vec!["normalize-keyword"]),
                json!({"keywordWeight": 0.7, "keyWeight": 1.0}),
            ),
            node(
                "boost-priority",
                "priority-boost",
                Some(vec!["fuse-signals"]),
                json!({}),
            ),
            node(
                "filter-policy",
                "entry-policy-filter",
                Some(vec!["boost-priority"]),
                json!({}),
            ),
            node(
                "filter-score",
                "score-threshold",
                Some(vec!["filter-policy"]),
                json!({}),
            ),
            node(
                "finalize-results",
                "result-finalizer",
                Some(vec!["filter-score"]),
                json!({"limit": limit}),
            ),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recall::core::{
        RecallCollectionMeta, RecallEntry, RecallSearchFilters, TagWithWeight, VectorizationMeta,
    };
    use crate::recall::index::{InMemoryBase, InMemoryDatabase};
    use crate::recall::retrieval_pipeline::{
        PipelineRunOutcome, RetrievalPipelineCompiler, RetrievalPipelineRunner,
    };
    use crate::recall::tag_pool::GlobalTagPoolManager;
    use crate::recall::tag_pool::ModelTagPool;
    use std::sync::{Arc, RwLock};

    fn entry(id: Uuid, key: &str, content: &str, enabled: bool, priority: i32) -> RecallEntry {
        RecallEntry {
            id,
            key: key.to_string(),
            content: content.to_string(),
            summary: String::new(),
            core_tags: Vec::new(),
            tags: vec![TagWithWeight {
                name: "allowed".to_string(),
                weight: 1.0,
                hash: String::new(),
            }],
            assets: Vec::new(),
            priority,
            enabled,
            created_at: 1,
            updated_at: 1,
            error_message: None,
            content_hash: None,
            refs: Vec::new(),
            ref_by: Vec::new(),
        }
    }

    fn context(query: &str, limit: usize) -> RetrievalContext {
        let recall_id = Uuid::from_u128(1);
        let mut base = InMemoryBase::new(RecallCollectionMeta {
            id: recall_id,
            name: "fixture".to_string(),
            description: None,
            created_at: 1,
            updated_at: 1,
            author: None,
            vectorization: VectorizationMeta {
                is_indexed: false,
                last_indexed_at: None,
                model_used: String::new(),
                dimension: 0,
                total_tokens: 0,
            },
            models: Vec::new(),
            tags: Vec::new(),
            icon: None,
            entries: Vec::new(),
            config: json!({}),
        });
        base.sync_entry(entry(
            Uuid::from_u128(10),
            "Rust",
            "systems programming",
            true,
            100,
        ));
        base.sync_entry(entry(
            Uuid::from_u128(11),
            "notes",
            "Rust ownership and borrowing",
            true,
            200,
        ));
        base.sync_entry(entry(
            Uuid::from_u128(12),
            "disabled",
            "Rust hidden",
            false,
            100,
        ));
        let mut database = InMemoryDatabase::new();
        database
            .bases
            .insert(recall_id, Arc::new(RwLock::new(base)));
        RetrievalContext {
            db: Arc::new(RwLock::new(database)),
            tag_pool_manager: GlobalTagPoolManager::new(),
            app_data_dir: Default::default(),
            request: Some(RetrievalRequestSnapshot {
                query: query.to_string(),
                filters: RecallSearchFilters {
                    recall_ids: Some(vec![recall_id]),
                    tags: Some(vec!["allowed".to_string()]),
                    limit: Some(limit),
                    min_score: None,
                    enabled_only: Some(true),
                    ..RecallSearchFilters::default()
                },
            }),
        }
    }

    #[test]
    fn algorithmic_pipeline_runs_without_embedding_and_uses_stable_top_k() {
        let registry = Arc::new(production_module_registry().unwrap());
        let compiled = RetrievalPipelineCompiler::new(registry).compile(
            &algorithmic_pipeline(Some(1)),
            "algorithmic-run".to_string(),
        );
        assert!(compiled.result.valid, "{:?}", compiled.result.issues);
        assert!(compiled.result.external_requirements.is_empty());

        let response = RetrievalPipelineRunner.run(
            &compiled,
            &context("Rust", 1),
            RetrievalArtifacts::default(),
            None,
            RecallPresetId::Algorithmic,
            RecallPresetId::Algorithmic,
        );

        assert_eq!(response.outcome, PipelineRunOutcome::Success);
        assert_eq!(response.results.len(), 1);
        assert_eq!(response.results[0].entry.id, Uuid::from_u128(10));
        assert_eq!(response.trace.as_ref().unwrap().final_limit, 1);
        assert!(response
            .trace
            .as_ref()
            .unwrap()
            .external_requirements
            .is_empty());
    }

    #[test]
    fn production_modules_can_run_individually_with_explicit_artifacts() {
        let context = context("  Rust  ownership ", 5);
        let mut artifacts = RetrievalArtifacts::default();
        let mut trace = PipelineTraceV1 {
            trace_version: "test".to_string(),
            run_id: "test".to_string(),
            pipeline_id: "test".to_string(),
            requested_preset_id: None,
            actual_preset_id: None,
            fallback_reason: None,
            algorithm_version: "test".to_string(),
            config_hash: "test".to_string(),
            bundle_id: None,
            candidate_budget: 80,
            expansion_budget: 0,
            final_limit: 5,
            external_requirements: Vec::new(),
            steps: Vec::new(),
        };
        QueryNormalizeModule
            .execute(&context, &mut artifacts, &json!({}), &mut trace)
            .unwrap();
        QueryTokenizeModule
            .execute(&context, &mut artifacts, &json!({}), &mut trace)
            .unwrap();
        KeywordRecallModule
            .execute(
                &context,
                &mut artifacts,
                &json!({"candidateBudget": 80}),
                &mut trace,
            )
            .unwrap();

        assert_eq!(normalized_query(&artifacts).unwrap(), "rust ownership");
        assert!(matches!(
            artifacts.get(ArtifactKey::CandidateSignals),
            Some(RetrievalArtifact::CandidateSignals(signals)) if !signals.is_empty()
        ));
    }

    #[test]
    fn production_algorithmic_preset_matches_the_shared_wire_fixture() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../src/tools/recall/__fixtures__/recall-pipeline-contract-v1.json"
        ))
        .unwrap();
        assert_eq!(
            serde_json::to_value(builtin_preset_summaries()).unwrap(),
            fixture["presetSummaries"]
        );
        assert_eq!(
            serde_json::to_value(algorithmic_pipeline(Some(DEFAULT_LIMIT))).unwrap(),
            fixture["pipeline"]
        );
    }

    #[test]
    fn public_tail_filters_before_stable_finalization() {
        let mut context = context("Rust", 1);
        context.request.as_mut().unwrap().filters.min_score = Some(0.5);
        let recall_id = Uuid::from_u128(1);
        let candidate = |entry_id: u128, score: f32| PipelineCandidate {
            recall_id,
            entry_id: Uuid::from_u128(entry_id),
            score,
            details: json!({"matchType": "algorithmic", "signals": []}),
        };
        let mut artifacts = RetrievalArtifacts::default();
        artifacts.insert(RetrievalArtifact::NormalizedQuery("rust".to_string()));
        artifacts.insert(RetrievalArtifact::RankedCandidates(vec![
            candidate(12, 0.9),
            candidate(10, 0.8),
            candidate(11, 0.4),
        ]));
        let mut trace = PipelineTraceV1 {
            trace_version: "test".to_string(),
            run_id: "test".to_string(),
            pipeline_id: "test".to_string(),
            requested_preset_id: None,
            actual_preset_id: None,
            fallback_reason: None,
            algorithm_version: "test".to_string(),
            config_hash: "test".to_string(),
            bundle_id: None,
            candidate_budget: 80,
            expansion_budget: 0,
            final_limit: 1,
            external_requirements: Vec::new(),
            steps: Vec::new(),
        };

        let policy = EntryPolicyFilterModule
            .execute(&context, &mut artifacts, &json!({}), &mut trace)
            .unwrap();
        let threshold = ScoreThresholdModule
            .execute(&context, &mut artifacts, &json!({}), &mut trace)
            .unwrap();
        ResultFinalizerModule
            .execute(&context, &mut artifacts, &json!({"limit": 1}), &mut trace)
            .unwrap();

        assert_eq!(policy.candidate_trimmed, Some(1));
        assert_eq!(threshold.candidate_trimmed, Some(1));
        assert!(matches!(
            artifacts.get(ArtifactKey::FinalResults),
            Some(RetrievalArtifact::FinalResults(results))
                if results.len() == 1 && results[0].entry.id == Uuid::from_u128(10)
        ));
    }

    fn add_content_vectors(context: &RetrievalContext, model_id: &str) {
        let database = context.db.clone();
        let database = database.write().unwrap();
        let base = database.bases.get(&Uuid::from_u128(1)).unwrap().clone();
        base.write().unwrap().vector_store.rebuild(
            model_id.to_string(),
            2,
            0,
            vec![
                (Uuid::from_u128(10), vec![1.0, 0.0]),
                (Uuid::from_u128(11), vec![0.0, 1.0]),
            ],
        );
    }

    fn add_tag_vectors(context: &RetrievalContext, model_id: &str) {
        let mut pool = ModelTagPool::new(model_id.to_string());
        pool.sync_vectors(vec![("allowed".to_string(), vec![1.0, 0.0])]);
        context.tag_pool_manager.get_or_insert_pool(pool).unwrap();
    }

    #[test]
    fn content_vector_module_requires_a_bundle_and_respects_model_identity() {
        let context = context("Rust", 5);
        add_content_vectors(&context, "model-a");
        let mut artifacts = RetrievalArtifacts::default();
        artifacts.insert(RetrievalArtifact::QueryEmbedding(vec![1.0, 0.0]));
        let mut trace = PipelineTraceV1 {
            trace_version: "test".to_string(),
            run_id: "test".to_string(),
            pipeline_id: "test".to_string(),
            requested_preset_id: None,
            actual_preset_id: None,
            fallback_reason: None,
            algorithm_version: "test".to_string(),
            config_hash: "test".to_string(),
            bundle_id: None,
            candidate_budget: 80,
            expansion_budget: 0,
            final_limit: 5,
            external_requirements: Vec::new(),
            steps: Vec::new(),
        };

        let error = ContentVectorRecallModule
            .execute(
                &context,
                &mut artifacts,
                &json!({"candidateBudget": 5}),
                &mut trace,
            )
            .unwrap_err();
        assert_eq!(error.code, PipelineErrorCode::ExternalArtifactInvalid);

        artifacts.set_bundle(crate::recall::retrieval_pipeline::RetrievalArtifactBundle {
            bundle_id: "bundle-a".to_string(),
            embedding_space: Some("space-a".to_string()),
            model_signature: Some("model-a".to_string()),
            asset_generation: Some("generation-a".to_string()),
            algorithm_version: "test".to_string(),
            query_embedding: Some(vec![1.0, 0.0]),
            query_energy_field: None,
        });
        ContentVectorRecallModule
            .execute(
                &context,
                &mut artifacts,
                &json!({"candidateBudget": 5}),
                &mut trace,
            )
            .unwrap();
        assert!(matches!(
            artifacts.get(ArtifactKey::CandidateSignals),
            Some(RetrievalArtifact::CandidateSignals(signals))
                if signals.len() == 1
                    && signals[0].entry_id == Uuid::from_u128(10)
                    && signals[0].signal_type == RecallSignalType::ContentVector
        ));
    }

    #[test]
    fn tag_vector_module_reads_the_model_matched_tag_pool() {
        let context = context("Rust", 5);
        add_tag_vectors(&context, "model-a");
        let mut artifacts = RetrievalArtifacts::default();
        artifacts.set_bundle(crate::recall::retrieval_pipeline::RetrievalArtifactBundle {
            bundle_id: "bundle-a".to_string(),
            embedding_space: Some("space-a".to_string()),
            model_signature: Some("model-a".to_string()),
            asset_generation: Some("generation-a".to_string()),
            algorithm_version: "test".to_string(),
            query_embedding: Some(vec![1.0, 0.0]),
            query_energy_field: None,
        });
        artifacts.insert(RetrievalArtifact::QueryEmbedding(vec![1.0, 0.0]));
        let mut trace = PipelineTraceV1 {
            trace_version: "test".to_string(),
            run_id: "test".to_string(),
            pipeline_id: "test".to_string(),
            requested_preset_id: None,
            actual_preset_id: None,
            fallback_reason: None,
            algorithm_version: "test".to_string(),
            config_hash: "test".to_string(),
            bundle_id: None,
            candidate_budget: 80,
            expansion_budget: 0,
            final_limit: 5,
            external_requirements: Vec::new(),
            steps: Vec::new(),
        };
        TagVectorRecallModule
            .execute(
                &context,
                &mut artifacts,
                &json!({"candidateBudget": 1, "neighborBudget": 4}),
                &mut trace,
            )
            .unwrap();
        assert!(matches!(
            artifacts.get(ArtifactKey::CandidateSignals),
            Some(RetrievalArtifact::CandidateSignals(signals))
                if signals.len() == 1
                    && signals[0].entry_id == Uuid::from_u128(10)
                    && signals[0].signal_type == RecallSignalType::TagVector
        ));
    }
}
