// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

// Phase 0 freezes this contract before the Phase 1 runner consumes it.
#![allow(dead_code)]

use crate::recall::core::{RecallResult, RecallSignalType, RetrievalContext};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

pub const PIPELINE_SCHEMA_VERSION: u32 = 1;
pub const PIPELINE_TRACE_VERSION: &str = "recall-pipeline-trace-v1";
pub const PIPELINE_CONTRACT_VERSION: &str = "recall-retrieval-pipeline-v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RecallPresetId {
    Algorithmic,
    Comprehensive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RetrievalPhase {
    Prepare,
    Retrieve,
    Normalize,
    Fuse,
    Rerank,
    Filter,
    Finalize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ArtifactKey {
    NormalizedQuery,
    QueryTokens,
    MatchedTags,
    QueryEmbedding,
    QueryEnergyField,
    CandidateSignals,
    NormalizedSignals,
    FusedCandidates,
    RankedCandidates,
    FinalResults,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExternalRequirementKind {
    QueryEmbedding,
    EmbeddingSpace,
    EntryVectors,
    TagPool,
    IndexSnapshot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PipelineErrorCode {
    SchemaVersionUnsupported,
    PresetNotFound,
    ModuleNotFound,
    ParameterInvalid,
    PhaseInvalid,
    DependencyCycle,
    ArtifactMissing,
    ArtifactProviderAmbiguous,
    FinalizerMissing,
    FinalizerDuplicate,
    ExternalRequirementMissing,
    ExternalArtifactInvalid,
    ConfigHashMismatch,
    RunStale,
    RunCancelled,
    ModuleExecutionFailed,
    FallbackNotAllowed,
    LegacyIdUnknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateSignal {
    pub recall_id: Uuid,
    pub entry_id: Uuid,
    pub signal_type: RecallSignalType,
    pub raw_score: f32,
    pub normalized_score: Option<f32>,
    pub source_module_id: String,
    pub details: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineCandidate {
    pub recall_id: Uuid,
    pub entry_id: Uuid,
    pub score: f32,
    pub details: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalArtifactBundle {
    pub bundle_id: String,
    pub embedding_space: Option<String>,
    pub model_signature: Option<String>,
    pub asset_generation: Option<String>,
    pub algorithm_version: String,
    pub query_embedding: Option<Vec<f32>>,
    pub query_energy_field: Option<Value>,
}

#[derive(Debug, Clone)]
pub enum RetrievalArtifact {
    NormalizedQuery(String),
    QueryTokens(Vec<String>),
    MatchedTags(Vec<String>),
    QueryEmbedding(Vec<f32>),
    QueryEnergyField(Value),
    CandidateSignals(Vec<CandidateSignal>),
    NormalizedSignals(Vec<CandidateSignal>),
    FusedCandidates(Vec<PipelineCandidate>),
    RankedCandidates(Vec<PipelineCandidate>),
    FinalResults(Vec<RecallResult>),
}

impl RetrievalArtifact {
    pub fn key(&self) -> ArtifactKey {
        match self {
            Self::NormalizedQuery(_) => ArtifactKey::NormalizedQuery,
            Self::QueryTokens(_) => ArtifactKey::QueryTokens,
            Self::MatchedTags(_) => ArtifactKey::MatchedTags,
            Self::QueryEmbedding(_) => ArtifactKey::QueryEmbedding,
            Self::QueryEnergyField(_) => ArtifactKey::QueryEnergyField,
            Self::CandidateSignals(_) => ArtifactKey::CandidateSignals,
            Self::NormalizedSignals(_) => ArtifactKey::NormalizedSignals,
            Self::FusedCandidates(_) => ArtifactKey::FusedCandidates,
            Self::RankedCandidates(_) => ArtifactKey::RankedCandidates,
            Self::FinalResults(_) => ArtifactKey::FinalResults,
        }
    }
}

#[derive(Debug, Default)]
pub struct RetrievalArtifacts {
    entries: BTreeMap<ArtifactKey, RetrievalArtifact>,
}

impl RetrievalArtifacts {
    pub fn insert(&mut self, artifact: RetrievalArtifact) -> Option<RetrievalArtifact> {
        self.entries.insert(artifact.key(), artifact)
    }

    pub fn get(&self, key: ArtifactKey) -> Option<&RetrievalArtifact> {
        self.entries.get(&key)
    }

    pub fn get_mut(&mut self, key: ArtifactKey) -> Option<&mut RetrievalArtifact> {
        self.entries.get_mut(&key)
    }

    pub fn append_candidate_signals(&mut self, mut values: Vec<CandidateSignal>) {
        match self.entries.get_mut(&ArtifactKey::CandidateSignals) {
            Some(RetrievalArtifact::CandidateSignals(existing)) => existing.append(&mut values),
            _ => {
                self.insert(RetrievalArtifact::CandidateSignals(values));
            }
        }
    }

    pub fn contains(&self, key: ArtifactKey) -> bool {
        self.entries.contains_key(&key)
    }

    fn item_count(&self, key: ArtifactKey) -> Option<usize> {
        self.get(key).map(|artifact| match artifact {
            RetrievalArtifact::NormalizedQuery(_) => 1,
            RetrievalArtifact::QueryTokens(values) | RetrievalArtifact::MatchedTags(values) => {
                values.len()
            }
            RetrievalArtifact::QueryEmbedding(_) | RetrievalArtifact::QueryEnergyField(_) => 1,
            RetrievalArtifact::CandidateSignals(values)
            | RetrievalArtifact::NormalizedSignals(values) => values.len(),
            RetrievalArtifact::FusedCandidates(values)
            | RetrievalArtifact::RankedCandidates(values) => values.len(),
            RetrievalArtifact::FinalResults(values) => values.len(),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalModuleInfo {
    pub id: String,
    pub version: String,
    pub phase: RetrievalPhase,
    pub requires: Vec<ArtifactKey>,
    pub provides: Vec<ArtifactKey>,
    pub external_requirements: Vec<ExternalRequirementKind>,
    pub parameter_schema: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FailurePolicy {
    Abort,
    Skip,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalPipelineNodeV1 {
    pub id: String,
    pub module_id: String,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depends_on: Option<Vec<String>>,
    pub params: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_policy: Option<FailurePolicy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalPipelineV1 {
    pub schema_version: u32,
    pub id: String,
    pub display_name: String,
    pub algorithm_version: String,
    pub candidate_budget: usize,
    pub expansion_budget: usize,
    pub nodes: Vec<RetrievalPipelineNodeV1>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllowedOverride {
    pub key: String,
    pub schema: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PresetVisibility {
    Product,
    Playground,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PresetStability {
    Stable,
    Experimental,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetSummary {
    pub id: RecallPresetId,
    pub display_name: String,
    pub description: String,
    pub visibility: PresetVisibility,
    pub stability: PresetStability,
    pub algorithm_version: String,
    pub allowed_overrides: Vec<AllowedOverride>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RequirementStatus {
    Ready,
    Missing,
    Partial,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineExternalRequirement {
    pub kind: ExternalRequirementKind,
    pub status: RequirementStatus,
    pub blocking: bool,
    pub details: Option<Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum IssueSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineIssue {
    pub severity: IssueSeverity,
    pub node_id: Option<String>,
    pub field_path: Option<String>,
    pub code: PipelineErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledStage {
    pub phase: RetrievalPhase,
    pub node_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineCompileResult {
    pub run_id: String,
    pub valid: bool,
    pub pipeline_id: String,
    pub config_hash: String,
    pub algorithm_version: String,
    pub candidate_budget: usize,
    pub expansion_budget: usize,
    pub external_requirements: Vec<PipelineExternalRequirement>,
    pub issues: Vec<PipelineIssue>,
    pub stages: Vec<CompiledStage>,
    pub module_versions: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TraceStepStatus {
    Completed,
    Skipped,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineTraceStepV1 {
    pub node_id: String,
    pub module_id: String,
    pub phase: RetrievalPhase,
    pub duration_ms: u64,
    pub input_count: Option<usize>,
    pub output_count: Option<usize>,
    pub status: TraceStepStatus,
    pub reason: Option<String>,
    pub candidate_trimmed: Option<usize>,
    pub trim_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineTraceV1 {
    pub trace_version: String,
    pub run_id: String,
    pub pipeline_id: String,
    pub requested_preset_id: Option<RecallPresetId>,
    pub actual_preset_id: Option<RecallPresetId>,
    pub fallback_reason: Option<String>,
    pub algorithm_version: String,
    pub config_hash: String,
    pub bundle_id: Option<String>,
    pub candidate_budget: usize,
    pub expansion_budget: usize,
    pub final_limit: usize,
    pub external_requirements: Vec<ExternalRequirementKind>,
    pub steps: Vec<PipelineTraceStepV1>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineRunError {
    pub code: PipelineErrorCode,
    pub message: String,
    pub node_id: Option<String>,
    pub field_path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PipelineRunOutcome {
    Success,
    Empty,
    Fallback,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PipelineUiState {
    Idle,
    Compiling,
    Blocked,
    Ready,
    Preparing,
    Running,
    Success,
    Empty,
    Fallback,
    Failed,
    Cancelled,
}

impl PipelineUiState {
    pub const ALL: [Self; 11] = [
        Self::Idle,
        Self::Compiling,
        Self::Blocked,
        Self::Ready,
        Self::Preparing,
        Self::Running,
        Self::Success,
        Self::Empty,
        Self::Fallback,
        Self::Failed,
        Self::Cancelled,
    ];

    pub fn can_transition_to(self, next: Self) -> bool {
        use PipelineUiState::{
            Blocked, Cancelled, Compiling, Empty, Failed, Fallback, Idle, Preparing, Ready,
            Running, Success,
        };
        matches!(
            (self, next),
            (Idle, Compiling)
                | (Compiling, Blocked | Ready | Failed)
                | (Blocked, Idle | Compiling)
                | (Ready, Idle | Compiling | Preparing)
                | (Preparing, Compiling | Running | Failed | Cancelled)
                | (
                    Running,
                    Compiling | Success | Empty | Fallback | Failed | Cancelled
                )
                | (
                    Success | Empty | Fallback | Failed | Cancelled,
                    Idle | Compiling
                )
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineRunResponse {
    pub run_id: String,
    pub outcome: PipelineRunOutcome,
    pub requested_preset_id: RecallPresetId,
    pub actual_preset_id: RecallPresetId,
    pub config_hash: String,
    pub results: Vec<RecallResult>,
    pub trace: Option<PipelineTraceV1>,
    pub error: Option<PipelineRunError>,
}

#[derive(Debug, Clone)]
pub struct RetrievalModuleError {
    pub code: PipelineErrorCode,
    pub message: String,
    pub node_id: Option<String>,
    pub details: Option<Value>,
}

impl std::fmt::Display for RetrievalModuleError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for RetrievalModuleError {}

#[derive(Debug, Clone, Default)]
pub struct RetrievalModuleOutput {
    pub candidate_trimmed: Option<usize>,
    pub trim_reason: Option<String>,
}

pub trait RetrievalModule: Send + Sync {
    fn info(&self) -> RetrievalModuleInfo;

    fn execute(
        &self,
        context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        params: &Value,
        trace: &mut PipelineTraceV1,
    ) -> Result<RetrievalModuleOutput, RetrievalModuleError>;
}

/// Registry ownership is explicit so the compiler never resolves modules by a stringly runtime
/// global. Production registration is intentionally deferred until the legacy entry points switch.
#[derive(Default)]
pub struct RetrievalModuleRegistry {
    modules: BTreeMap<String, Arc<dyn RetrievalModule>>,
}

impl RetrievalModuleRegistry {
    pub fn register<M>(&mut self, module: M) -> Result<(), RetrievalModuleError>
    where
        M: RetrievalModule + 'static,
    {
        let info = module.info();
        if self.modules.contains_key(&info.id) {
            return Err(RetrievalModuleError {
                code: PipelineErrorCode::ParameterInvalid,
                message: format!("duplicate retrieval module: {}", info.id),
                node_id: None,
                details: None,
            });
        }
        self.modules.insert(info.id, Arc::new(module));
        Ok(())
    }

    pub fn get(&self, module_id: &str) -> Option<Arc<dyn RetrievalModule>> {
        self.modules.get(module_id).cloned()
    }
}

#[derive(Clone)]
struct CompiledNode {
    node: RetrievalPipelineNodeV1,
    module: Arc<dyn RetrievalModule>,
    info: RetrievalModuleInfo,
}

pub struct CompiledPipeline {
    pub result: PipelineCompileResult,
    nodes: Vec<CompiledNode>,
}

pub struct RetrievalPipelineCompiler {
    registry: Arc<RetrievalModuleRegistry>,
}

impl RetrievalPipelineCompiler {
    pub fn new(registry: Arc<RetrievalModuleRegistry>) -> Self {
        Self { registry }
    }

    pub fn compile(&self, pipeline: &RetrievalPipelineV1, run_id: String) -> CompiledPipeline {
        let mut result = PipelineCompileResult {
            run_id,
            valid: false,
            pipeline_id: pipeline.id.clone(),
            config_hash: config_hash(pipeline),
            algorithm_version: pipeline.algorithm_version.clone(),
            candidate_budget: pipeline.candidate_budget,
            expansion_budget: pipeline.expansion_budget,
            external_requirements: Vec::new(),
            issues: Vec::new(),
            stages: Vec::new(),
            module_versions: BTreeMap::new(),
        };

        if pipeline.schema_version != PIPELINE_SCHEMA_VERSION {
            push_issue(
                &mut result,
                PipelineErrorCode::SchemaVersionUnsupported,
                None,
                Some("schemaVersion".to_string()),
                format!(
                    "pipeline schema version {} is unsupported",
                    pipeline.schema_version
                ),
            );
        }
        if pipeline.candidate_budget == 0 {
            push_issue(
                &mut result,
                PipelineErrorCode::ParameterInvalid,
                None,
                Some("candidateBudget".to_string()),
                "candidateBudget must be greater than zero".to_string(),
            );
        }

        let mut index_by_id = BTreeMap::new();
        for (index, node) in pipeline.nodes.iter().enumerate() {
            if index_by_id.insert(node.id.clone(), index).is_some() {
                push_issue(
                    &mut result,
                    PipelineErrorCode::ParameterInvalid,
                    Some(node.id.clone()),
                    Some("id".to_string()),
                    "pipeline node ids must be unique".to_string(),
                );
            }
        }

        let mut nodes = Vec::new();
        for node in &pipeline.nodes {
            if !node.enabled {
                continue;
            }
            let Some(module) = self.registry.get(&node.module_id) else {
                push_issue(
                    &mut result,
                    PipelineErrorCode::ModuleNotFound,
                    Some(node.id.clone()),
                    Some("moduleId".to_string()),
                    format!("retrieval module '{}' is not registered", node.module_id),
                );
                continue;
            };
            let info = module.info();
            if let Err(message) = validate_params(&info.parameter_schema, &node.params) {
                push_issue(
                    &mut result,
                    PipelineErrorCode::ParameterInvalid,
                    Some(node.id.clone()),
                    Some("params".to_string()),
                    message,
                );
            }
            result
                .module_versions
                .insert(info.id.clone(), info.version.clone());
            nodes.push(CompiledNode {
                node: node.clone(),
                module,
                info,
            });
        }

        let compiled_by_id: BTreeMap<String, usize> = nodes
            .iter()
            .enumerate()
            .map(|(index, node)| (node.node.id.clone(), index))
            .collect();
        let mut dependencies: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for node in &nodes {
            let mut node_dependencies = Vec::new();
            for dependency_id in node.node.depends_on.clone().unwrap_or_default() {
                let Some(&dependency_index) = compiled_by_id.get(&dependency_id) else {
                    push_issue(
                        &mut result,
                        PipelineErrorCode::ArtifactMissing,
                        Some(node.node.id.clone()),
                        Some("dependsOn".to_string()),
                        format!("dependency '{}' is missing or disabled", dependency_id),
                    );
                    continue;
                };
                let dependency = &nodes[dependency_index];
                if dependency.info.phase > node.info.phase {
                    push_issue(
                        &mut result,
                        PipelineErrorCode::PhaseInvalid,
                        Some(node.node.id.clone()),
                        Some("dependsOn".to_string()),
                        format!(
                            "node '{}' in {:?} cannot depend on later {:?} node '{}'",
                            node.node.id, node.info.phase, dependency.info.phase, dependency_id
                        ),
                    );
                }
                if node_dependencies.contains(&dependency_id) {
                    push_issue(
                        &mut result,
                        PipelineErrorCode::ParameterInvalid,
                        Some(node.node.id.clone()),
                        Some("dependsOn".to_string()),
                        format!("dependency '{}' is listed more than once", dependency_id),
                    );
                    continue;
                }
                node_dependencies.push(dependency_id);
            }
            dependencies.insert(node.node.id.clone(), node_dependencies);
        }

        let order = topological_order(&nodes, &dependencies);
        if order.len() != nodes.len() {
            push_issue(
                &mut result,
                PipelineErrorCode::DependencyCycle,
                None,
                Some("dependsOn".to_string()),
                "pipeline dependencies contain a cycle".to_string(),
            );
        }

        let finalizers: Vec<&CompiledNode> = nodes
            .iter()
            .filter(|node| node.info.phase == RetrievalPhase::Finalize)
            .collect();
        match finalizers.len() {
            0 => push_issue(
                &mut result,
                PipelineErrorCode::FinalizerMissing,
                None,
                None,
                "pipeline needs exactly one enabled finalize module".to_string(),
            ),
            1 if !finalizers[0]
                .info
                .provides
                .contains(&ArtifactKey::FinalResults) =>
            {
                push_issue(
                    &mut result,
                    PipelineErrorCode::FinalizerMissing,
                    Some(finalizers[0].node.id.clone()),
                    None,
                    "the finalize module must provide final-results".to_string(),
                )
            }
            1 => {}
            _ => push_issue(
                &mut result,
                PipelineErrorCode::FinalizerDuplicate,
                None,
                None,
                "pipeline can only contain one enabled finalize module".to_string(),
            ),
        }

        if order.len() == nodes.len() {
            for &index in &order {
                let node = &nodes[index];
                let ancestors = ancestor_ids(&node.node.id, &dependencies);
                for required in &node.info.requires {
                    let providers: Vec<&CompiledNode> = ancestors
                        .iter()
                        .filter_map(|id| compiled_by_id.get(id).map(|index| &nodes[*index]))
                        .filter(|provider| provider.info.provides.contains(required))
                        .collect();
                    let latest_providers: Vec<&CompiledNode> = providers
                        .iter()
                        .copied()
                        .filter(|provider| {
                            !providers.iter().any(|other| {
                                provider.node.id != other.node.id
                                    && ancestor_ids(&other.node.id, &dependencies)
                                        .contains(&provider.node.id)
                            })
                        })
                        .collect();
                    let external = is_externally_prepared(*required, &node.info);
                    if latest_providers.is_empty() && !external {
                        push_issue(
                            &mut result,
                            PipelineErrorCode::ArtifactMissing,
                            Some(node.node.id.clone()),
                            Some("requires".to_string()),
                            format!(
                                "required artifact '{:?}' has no upstream provider",
                                required
                            ),
                        );
                    } else if latest_providers.len() > 1 && !is_mergeable_artifact(*required) {
                        push_issue(
                            &mut result,
                            PipelineErrorCode::ArtifactProviderAmbiguous,
                            Some(node.node.id.clone()),
                            Some("requires".to_string()),
                            format!(
                                "required artifact '{:?}' has multiple upstream providers",
                                required
                            ),
                        );
                    } else if let Some(provider) = latest_providers.first() {
                        if provider.node.failure_policy == Some(FailurePolicy::Skip) {
                            push_issue(
                                &mut result,
                                PipelineErrorCode::ParameterInvalid,
                                Some(provider.node.id.clone()),
                                Some("failurePolicy".to_string()),
                                format!(
                                    "node '{}' cannot skip because '{}' requires its artifact",
                                    provider.node.id, node.node.id
                                ),
                            );
                        }
                    }
                }
            }
        }

        let external_kinds: BTreeSet<ExternalRequirementKind> = nodes
            .iter()
            .flat_map(|node| node.info.external_requirements.iter().copied())
            .collect();
        result.external_requirements = external_kinds
            .into_iter()
            .map(|kind| PipelineExternalRequirement {
                kind,
                status: RequirementStatus::Missing,
                blocking: true,
                details: None,
            })
            .collect();

        if result.issues.is_empty() {
            result.valid = true;
            let mut stages: BTreeMap<RetrievalPhase, Vec<String>> = BTreeMap::new();
            for index in &order {
                let node = &nodes[*index];
                stages
                    .entry(node.info.phase)
                    .or_default()
                    .push(node.node.id.clone());
            }
            result.stages = stages
                .into_iter()
                .map(|(phase, node_ids)| CompiledStage { phase, node_ids })
                .collect();
        }

        let ordered_nodes = order
            .into_iter()
            .filter_map(|index| nodes.get(index).cloned())
            .collect();
        CompiledPipeline {
            result,
            nodes: ordered_nodes,
        }
    }
}

pub struct RetrievalPipelineRunner;

impl RetrievalPipelineRunner {
    pub fn run(
        &self,
        compiled: &CompiledPipeline,
        context: &RetrievalContext,
        mut artifacts: RetrievalArtifacts,
        bundle: Option<&RetrievalArtifactBundle>,
        requested_preset_id: RecallPresetId,
        actual_preset_id: RecallPresetId,
    ) -> PipelineRunResponse {
        let trace = new_trace(compiled, bundle, requested_preset_id, actual_preset_id);
        if !compiled.result.valid {
            return failed_response(
                compiled,
                requested_preset_id,
                actual_preset_id,
                trace,
                PipelineErrorCode::ParameterInvalid,
                "pipeline must compile before it can run".to_string(),
                None,
            );
        }
        if compiled
            .result
            .external_requirements
            .iter()
            .any(|requirement| requirement.kind == ExternalRequirementKind::QueryEmbedding)
        {
            if let Some(query_embedding) = bundle.and_then(|bundle| bundle.query_embedding.clone())
            {
                artifacts.insert(RetrievalArtifact::QueryEmbedding(query_embedding));
            }
        }

        let mut trace = trace;
        for node in &compiled.nodes {
            for required in &node.info.requires {
                if !artifacts.contains(*required) {
                    return failed_response(
                        compiled,
                        requested_preset_id,
                        actual_preset_id,
                        trace,
                        PipelineErrorCode::ArtifactMissing,
                        format!(
                            "node '{}' is missing runtime artifact '{:?}'",
                            node.node.id, required
                        ),
                        Some(node.node.id.clone()),
                    );
                }
            }

            let started_at = Instant::now();
            let input_count = node
                .info
                .requires
                .iter()
                .filter_map(|key| artifacts.item_count(*key))
                .sum::<usize>();
            match node
                .module
                .execute(context, &mut artifacts, &node.node.params, &mut trace)
            {
                Ok(output) => trace.steps.push(PipelineTraceStepV1 {
                    node_id: node.node.id.clone(),
                    module_id: node.info.id.clone(),
                    phase: node.info.phase,
                    duration_ms: started_at.elapsed().as_millis() as u64,
                    input_count: (!node.info.requires.is_empty()).then_some(input_count),
                    output_count: Some(
                        node.info
                            .provides
                            .iter()
                            .filter_map(|key| artifacts.item_count(*key))
                            .sum(),
                    ),
                    status: TraceStepStatus::Completed,
                    reason: None,
                    candidate_trimmed: output.candidate_trimmed,
                    trim_reason: output.trim_reason,
                }),
                Err(error) if node.node.failure_policy == Some(FailurePolicy::Skip) => {
                    trace.steps.push(PipelineTraceStepV1 {
                        node_id: node.node.id.clone(),
                        module_id: node.info.id.clone(),
                        phase: node.info.phase,
                        duration_ms: started_at.elapsed().as_millis() as u64,
                        input_count: (!node.info.requires.is_empty()).then_some(input_count),
                        output_count: None,
                        status: TraceStepStatus::Skipped,
                        reason: Some(error.message),
                        candidate_trimmed: None,
                        trim_reason: None,
                    });
                }
                Err(error) => {
                    trace.steps.push(PipelineTraceStepV1 {
                        node_id: node.node.id.clone(),
                        module_id: node.info.id.clone(),
                        phase: node.info.phase,
                        duration_ms: started_at.elapsed().as_millis() as u64,
                        input_count: (!node.info.requires.is_empty()).then_some(input_count),
                        output_count: None,
                        status: TraceStepStatus::Failed,
                        reason: Some(error.message.clone()),
                        candidate_trimmed: None,
                        trim_reason: None,
                    });
                    return failed_response(
                        compiled,
                        requested_preset_id,
                        actual_preset_id,
                        trace,
                        error.code,
                        error.message,
                        error.node_id.or_else(|| Some(node.node.id.clone())),
                    );
                }
            }
        }

        let results = match artifacts.get(ArtifactKey::FinalResults) {
            Some(RetrievalArtifact::FinalResults(results)) => results.clone(),
            _ => {
                return failed_response(
                    compiled,
                    requested_preset_id,
                    actual_preset_id,
                    trace,
                    PipelineErrorCode::ArtifactMissing,
                    "finalize module did not provide final-results".to_string(),
                    None,
                )
            }
        };
        PipelineRunResponse {
            run_id: compiled.result.run_id.clone(),
            outcome: if results.is_empty() {
                PipelineRunOutcome::Empty
            } else {
                PipelineRunOutcome::Success
            },
            requested_preset_id,
            actual_preset_id,
            config_hash: compiled.result.config_hash.clone(),
            results,
            trace: Some(trace),
            error: None,
        }
    }

    pub fn validate_config_hash(
        &self,
        compiled: &CompiledPipeline,
        expected_config_hash: &str,
        requested_preset_id: RecallPresetId,
        actual_preset_id: RecallPresetId,
    ) -> Option<PipelineRunResponse> {
        if compiled.result.config_hash != expected_config_hash {
            return Some(failed_response(
                compiled,
                requested_preset_id,
                actual_preset_id,
                new_trace(compiled, None, requested_preset_id, actual_preset_id),
                PipelineErrorCode::ConfigHashMismatch,
                "compiled pipeline config hash does not match the run request".to_string(),
                None,
            ));
        }
        None
    }
}

fn config_hash(pipeline: &RetrievalPipelineV1) -> String {
    let serialized = serde_json::to_vec(pipeline).unwrap_or_default();
    blake3::hash(&serialized).to_hex().to_string()
}

fn push_issue(
    result: &mut PipelineCompileResult,
    code: PipelineErrorCode,
    node_id: Option<String>,
    field_path: Option<String>,
    message: String,
) {
    result.issues.push(PipelineIssue {
        severity: IssueSeverity::Error,
        node_id,
        field_path,
        code,
        message,
    });
}

fn is_externally_prepared(key: ArtifactKey, info: &RetrievalModuleInfo) -> bool {
    matches!(key, ArtifactKey::QueryEmbedding)
        && info
            .external_requirements
            .contains(&ExternalRequirementKind::QueryEmbedding)
}

fn is_mergeable_artifact(key: ArtifactKey) -> bool {
    matches!(key, ArtifactKey::CandidateSignals)
}

fn topological_order(
    nodes: &[CompiledNode],
    dependencies: &BTreeMap<String, Vec<String>>,
) -> Vec<usize> {
    let node_indices: BTreeMap<String, usize> = nodes
        .iter()
        .enumerate()
        .map(|(index, node)| (node.node.id.clone(), index))
        .collect();
    let mut indegrees: Vec<usize> = nodes
        .iter()
        .map(|node| dependencies.get(&node.node.id).map_or(0, Vec::len))
        .collect();
    let mut dependents: Vec<Vec<usize>> = vec![Vec::new(); nodes.len()];
    for (index, node) in nodes.iter().enumerate() {
        for dependency in dependencies.get(&node.node.id).into_iter().flatten() {
            if let Some(dependency_index) = node_indices.get(dependency) {
                dependents[*dependency_index].push(index);
            }
        }
    }

    let mut ready: BTreeSet<(RetrievalPhase, usize)> = nodes
        .iter()
        .enumerate()
        .filter(|(index, _)| indegrees[*index] == 0)
        .map(|(index, node)| (node.info.phase, index))
        .collect();
    let mut order = Vec::with_capacity(nodes.len());
    while let Some((_, index)) = ready.pop_first() {
        order.push(index);
        for dependent in &dependents[index] {
            indegrees[*dependent] -= 1;
            if indegrees[*dependent] == 0 {
                ready.insert((nodes[*dependent].info.phase, *dependent));
            }
        }
    }
    order
}

fn ancestor_ids(node_id: &str, dependencies: &BTreeMap<String, Vec<String>>) -> BTreeSet<String> {
    fn visit(
        node_id: &str,
        dependencies: &BTreeMap<String, Vec<String>>,
        found: &mut BTreeSet<String>,
    ) {
        for dependency in dependencies.get(node_id).into_iter().flatten() {
            if found.insert(dependency.clone()) {
                visit(dependency, dependencies, found);
            }
        }
    }

    let mut found = BTreeSet::new();
    visit(node_id, dependencies, &mut found);
    found
}

fn validate_params(schema: &Value, params: &Value) -> Result<(), String> {
    let Some(schema_object) = schema.as_object() else {
        return Ok(());
    };
    if schema_object.get("type").and_then(Value::as_str) == Some("object") && !params.is_object() {
        return Err("module params must be an object".to_string());
    }
    let params_object = params
        .as_object()
        .ok_or_else(|| "module params must be an object".to_string())?;
    if let Some(required) = schema_object.get("required").and_then(Value::as_array) {
        for key in required.iter().filter_map(Value::as_str) {
            if !params_object.contains_key(key) {
                return Err(format!("module params.{} is required", key));
            }
        }
    }
    let properties = schema_object
        .get("properties")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if schema_object.get("additionalProperties") == Some(&Value::Bool(false)) {
        for key in params_object.keys() {
            if !properties.contains_key(key) {
                return Err(format!("module params.{} is not allowed", key));
            }
        }
    }
    for (key, property_schema) in properties {
        let Some(value) = params_object.get(&key) else {
            continue;
        };
        let Some(property) = property_schema.as_object() else {
            continue;
        };
        match property.get("type").and_then(Value::as_str) {
            Some("integer") if value.as_i64().is_none() && value.as_u64().is_none() => {
                return Err(format!("module params.{} must be an integer", key));
            }
            Some("number") if value.as_f64().is_none() => {
                return Err(format!("module params.{} must be a number", key));
            }
            Some("string") if value.as_str().is_none() => {
                return Err(format!("module params.{} must be a string", key));
            }
            Some("boolean") if value.as_bool().is_none() => {
                return Err(format!("module params.{} must be a boolean", key));
            }
            _ => {}
        }
        if let Some(number) = value.as_f64() {
            if property
                .get("minimum")
                .and_then(Value::as_f64)
                .is_some_and(|minimum| number < minimum)
            {
                return Err(format!("module params.{} is below minimum", key));
            }
            if property
                .get("maximum")
                .and_then(Value::as_f64)
                .is_some_and(|maximum| number > maximum)
            {
                return Err(format!("module params.{} is above maximum", key));
            }
        }
    }
    Ok(())
}

fn new_trace(
    compiled: &CompiledPipeline,
    bundle: Option<&RetrievalArtifactBundle>,
    requested_preset_id: RecallPresetId,
    actual_preset_id: RecallPresetId,
) -> PipelineTraceV1 {
    PipelineTraceV1 {
        trace_version: PIPELINE_TRACE_VERSION.to_string(),
        run_id: compiled.result.run_id.clone(),
        pipeline_id: compiled.result.pipeline_id.clone(),
        requested_preset_id: Some(requested_preset_id),
        actual_preset_id: Some(actual_preset_id),
        fallback_reason: None,
        algorithm_version: compiled.result.algorithm_version.clone(),
        config_hash: compiled.result.config_hash.clone(),
        bundle_id: bundle.map(|bundle| bundle.bundle_id.clone()),
        candidate_budget: compiled.result.candidate_budget,
        expansion_budget: compiled.result.expansion_budget,
        final_limit: compiled
            .nodes
            .iter()
            .find(|node| node.info.phase == RetrievalPhase::Finalize)
            .and_then(|node| node.node.params.get("limit"))
            .and_then(Value::as_u64)
            .map(|limit| limit as usize)
            .unwrap_or(0),
        external_requirements: compiled
            .result
            .external_requirements
            .iter()
            .map(|requirement| requirement.kind)
            .collect(),
        steps: Vec::new(),
    }
}

fn failed_response(
    compiled: &CompiledPipeline,
    requested_preset_id: RecallPresetId,
    actual_preset_id: RecallPresetId,
    trace: PipelineTraceV1,
    code: PipelineErrorCode,
    message: String,
    node_id: Option<String>,
) -> PipelineRunResponse {
    PipelineRunResponse {
        run_id: compiled.result.run_id.clone(),
        outcome: PipelineRunOutcome::Failed,
        requested_preset_id,
        actual_preset_id,
        config_hash: compiled.result.config_hash.clone(),
        results: Vec::new(),
        trace: Some(trace),
        error: Some(PipelineRunError {
            code,
            message,
            node_id,
            field_path: None,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ContractFixture {
        contract_version: String,
        preset_summaries: Vec<PresetSummary>,
        pipeline: RetrievalPipelineV1,
        compile_result: PipelineCompileResult,
        run_response: PipelineRunResponse,
        ui_transitions: Vec<UiTransitionFixture>,
    }

    #[derive(Deserialize)]
    struct UiTransitionFixture {
        from: PipelineUiState,
        to: Vec<PipelineUiState>,
    }

    const CONTRACT_FIXTURE: &str =
        include_str!("../../../src/tools/recall/__fixtures__/recall-pipeline-contract-v1.json");

    #[test]
    fn shared_wire_fixture_deserializes_with_v1_contract() {
        let fixture: ContractFixture = serde_json::from_str(CONTRACT_FIXTURE).unwrap();
        assert_eq!(fixture.contract_version, PIPELINE_CONTRACT_VERSION);
        assert_eq!(fixture.pipeline.schema_version, PIPELINE_SCHEMA_VERSION);
        assert_eq!(fixture.preset_summaries.len(), 2);
        assert_eq!(fixture.compile_result.run_id, fixture.run_response.run_id);
        assert_eq!(
            fixture.run_response.trace.unwrap().trace_version,
            PIPELINE_TRACE_VERSION
        );
        for transition in fixture.ui_transitions {
            for state in PipelineUiState::ALL {
                assert_eq!(
                    transition.from.can_transition_to(state),
                    transition.to.contains(&state)
                );
            }
        }
    }

    #[test]
    fn artifact_store_uses_the_artifact_variant_as_its_key() {
        let mut artifacts = RetrievalArtifacts::default();
        artifacts.insert(RetrievalArtifact::QueryTokens(vec!["recall".to_string()]));
        assert!(artifacts.contains(ArtifactKey::QueryTokens));
        assert!(!artifacts.contains(ArtifactKey::QueryEmbedding));
    }

    #[test]
    fn wire_enums_use_stable_kebab_case_values() {
        assert_eq!(
            serde_json::to_value(PipelineErrorCode::ExternalRequirementMissing).unwrap(),
            Value::String("external-requirement-missing".to_string())
        );
        assert_eq!(
            serde_json::to_value(RetrievalPhase::Finalize).unwrap(),
            Value::String("finalize".to_string())
        );
    }

    #[derive(Clone)]
    struct TestModule {
        info: RetrievalModuleInfo,
    }

    impl TestModule {
        fn new(
            id: &str,
            phase: RetrievalPhase,
            requires: Vec<ArtifactKey>,
            provides: Vec<ArtifactKey>,
        ) -> Self {
            Self {
                info: RetrievalModuleInfo {
                    id: id.to_string(),
                    version: "test-v1".to_string(),
                    phase,
                    requires,
                    provides,
                    external_requirements: Vec::new(),
                    parameter_schema: serde_json::json!({"type": "object"}),
                },
            }
        }
    }

    impl RetrievalModule for TestModule {
        fn info(&self) -> RetrievalModuleInfo {
            self.info.clone()
        }

        fn execute(
            &self,
            _context: &RetrievalContext,
            artifacts: &mut RetrievalArtifacts,
            _params: &Value,
            _trace: &mut PipelineTraceV1,
        ) -> Result<RetrievalModuleOutput, RetrievalModuleError> {
            for key in &self.info.provides {
                let artifact = match key {
                    ArtifactKey::NormalizedQuery => {
                        RetrievalArtifact::NormalizedQuery("test".to_string())
                    }
                    ArtifactKey::RankedCandidates => {
                        RetrievalArtifact::RankedCandidates(Vec::new())
                    }
                    ArtifactKey::FinalResults => RetrievalArtifact::FinalResults(Vec::new()),
                    ArtifactKey::QueryTokens => RetrievalArtifact::QueryTokens(Vec::new()),
                    ArtifactKey::MatchedTags => RetrievalArtifact::MatchedTags(Vec::new()),
                    ArtifactKey::QueryEmbedding => RetrievalArtifact::QueryEmbedding(Vec::new()),
                    ArtifactKey::QueryEnergyField => {
                        RetrievalArtifact::QueryEnergyField(Value::Null)
                    }
                    ArtifactKey::CandidateSignals => {
                        RetrievalArtifact::CandidateSignals(Vec::new())
                    }
                    ArtifactKey::NormalizedSignals => {
                        RetrievalArtifact::NormalizedSignals(Vec::new())
                    }
                    ArtifactKey::FusedCandidates => RetrievalArtifact::FusedCandidates(Vec::new()),
                };
                artifacts.insert(artifact);
            }
            Ok(RetrievalModuleOutput::default())
        }
    }

    fn test_context() -> RetrievalContext {
        RetrievalContext {
            db: std::sync::Arc::new(std::sync::RwLock::new(
                crate::recall::index::InMemoryDatabase::new(),
            )),
            tag_pool_manager: crate::recall::tag_pool::GlobalTagPoolManager::new(),
            app_data_dir: std::path::PathBuf::new(),
            request: None,
        }
    }

    fn test_registry() -> Arc<RetrievalModuleRegistry> {
        let mut registry = RetrievalModuleRegistry::default();
        registry
            .register(TestModule::new(
                "seed",
                RetrievalPhase::Prepare,
                Vec::new(),
                vec![ArtifactKey::NormalizedQuery],
            ))
            .unwrap();
        registry
            .register(TestModule::new(
                "candidates",
                RetrievalPhase::Retrieve,
                vec![ArtifactKey::NormalizedQuery],
                vec![ArtifactKey::RankedCandidates],
            ))
            .unwrap();
        registry
            .register(TestModule::new(
                "finalizer",
                RetrievalPhase::Finalize,
                vec![ArtifactKey::RankedCandidates],
                vec![ArtifactKey::FinalResults],
            ))
            .unwrap();
        Arc::new(registry)
    }

    fn test_pipeline() -> RetrievalPipelineV1 {
        RetrievalPipelineV1 {
            schema_version: PIPELINE_SCHEMA_VERSION,
            id: "test-pipeline".to_string(),
            display_name: "Test pipeline".to_string(),
            algorithm_version: "test-algorithm-v1".to_string(),
            candidate_budget: 8,
            expansion_budget: 0,
            nodes: vec![
                RetrievalPipelineNodeV1 {
                    id: "seed".to_string(),
                    module_id: "seed".to_string(),
                    enabled: true,
                    depends_on: None,
                    params: serde_json::json!({}),
                    failure_policy: Some(FailurePolicy::Abort),
                },
                RetrievalPipelineNodeV1 {
                    id: "candidates".to_string(),
                    module_id: "candidates".to_string(),
                    enabled: true,
                    depends_on: Some(vec!["seed".to_string()]),
                    params: serde_json::json!({}),
                    failure_policy: Some(FailurePolicy::Abort),
                },
                RetrievalPipelineNodeV1 {
                    id: "finalizer".to_string(),
                    module_id: "finalizer".to_string(),
                    enabled: true,
                    depends_on: Some(vec!["candidates".to_string()]),
                    params: serde_json::json!({"limit": 2}),
                    failure_policy: Some(FailurePolicy::Abort),
                },
            ],
        }
    }

    #[test]
    fn compiler_builds_stable_stages_and_runner_finishes_empty_pipeline() {
        let compiler = RetrievalPipelineCompiler::new(test_registry());
        let compiled = compiler.compile(&test_pipeline(), "run-1".to_string());
        assert!(
            compiled.result.valid,
            "issues: {:?}",
            compiled.result.issues
        );
        assert_eq!(
            compiled
                .result
                .stages
                .iter()
                .map(|stage| stage.phase)
                .collect::<Vec<_>>(),
            vec![
                RetrievalPhase::Prepare,
                RetrievalPhase::Retrieve,
                RetrievalPhase::Finalize
            ]
        );

        let response = RetrievalPipelineRunner.run(
            &compiled,
            &test_context(),
            RetrievalArtifacts::default(),
            None,
            RecallPresetId::Algorithmic,
            RecallPresetId::Algorithmic,
        );
        assert_eq!(response.outcome, PipelineRunOutcome::Empty);
        assert_eq!(response.trace.as_ref().unwrap().steps.len(), 3);
        assert_eq!(response.trace.as_ref().unwrap().final_limit, 2);
    }

    #[test]
    fn compiler_rejects_missing_artifact_and_duplicate_finalizer() {
        let mut registry = RetrievalModuleRegistry::default();
        registry
            .register(TestModule::new(
                "finalizer-a",
                RetrievalPhase::Finalize,
                vec![ArtifactKey::RankedCandidates],
                vec![ArtifactKey::FinalResults],
            ))
            .unwrap();
        registry
            .register(TestModule::new(
                "finalizer-b",
                RetrievalPhase::Finalize,
                Vec::new(),
                vec![ArtifactKey::FinalResults],
            ))
            .unwrap();
        let pipeline = RetrievalPipelineV1 {
            nodes: vec![
                RetrievalPipelineNodeV1 {
                    id: "a".to_string(),
                    module_id: "finalizer-a".to_string(),
                    enabled: true,
                    depends_on: None,
                    params: serde_json::json!({}),
                    failure_policy: None,
                },
                RetrievalPipelineNodeV1 {
                    id: "b".to_string(),
                    module_id: "finalizer-b".to_string(),
                    enabled: true,
                    depends_on: None,
                    params: serde_json::json!({}),
                    failure_policy: None,
                },
            ],
            ..test_pipeline()
        };
        let compiled = RetrievalPipelineCompiler::new(Arc::new(registry))
            .compile(&pipeline, "run-2".to_string());
        assert!(!compiled.result.valid);
        assert!(compiled
            .result
            .issues
            .iter()
            .any(|issue| issue.code == PipelineErrorCode::ArtifactMissing));
        assert!(compiled
            .result
            .issues
            .iter()
            .any(|issue| issue.code == PipelineErrorCode::FinalizerDuplicate));
    }

    #[test]
    fn compiler_rejects_dependency_cycle() {
        let registry = test_registry();
        let mut pipeline = test_pipeline();
        pipeline.nodes[0].depends_on = Some(vec!["candidates".to_string()]);
        let compiled =
            RetrievalPipelineCompiler::new(registry).compile(&pipeline, "run-3".to_string());
        assert!(!compiled.result.valid);
        assert!(compiled
            .result
            .issues
            .iter()
            .any(|issue| issue.code == PipelineErrorCode::DependencyCycle));
    }

    #[test]
    fn compiler_rejects_invalid_module_params() {
        let mut registry = RetrievalModuleRegistry::default();
        let mut finalizer = TestModule::new(
            "finalizer",
            RetrievalPhase::Finalize,
            Vec::new(),
            vec![ArtifactKey::FinalResults],
        );
        finalizer.info.parameter_schema = serde_json::json!({
            "type": "object",
            "required": ["limit"],
            "properties": {
                "limit": { "type": "integer", "minimum": 1, "maximum": 100 }
            },
            "additionalProperties": false
        });
        registry.register(finalizer).unwrap();
        let pipeline = RetrievalPipelineV1 {
            nodes: vec![RetrievalPipelineNodeV1 {
                id: "finalizer".to_string(),
                module_id: "finalizer".to_string(),
                enabled: true,
                depends_on: None,
                params: serde_json::json!({"limit": 0}),
                failure_policy: None,
            }],
            ..test_pipeline()
        };

        let compiled = RetrievalPipelineCompiler::new(Arc::new(registry))
            .compile(&pipeline, "run-4".to_string());
        assert!(!compiled.result.valid);
        assert!(compiled
            .result
            .issues
            .iter()
            .any(|issue| issue.code == PipelineErrorCode::ParameterInvalid));
    }

    #[test]
    fn compiler_allows_parallel_candidate_signal_providers_for_later_merge() {
        let mut registry = RetrievalModuleRegistry::default();
        for module in [
            TestModule::new(
                "seed",
                RetrievalPhase::Prepare,
                Vec::new(),
                vec![ArtifactKey::NormalizedQuery],
            ),
            TestModule::new(
                "branch-a",
                RetrievalPhase::Retrieve,
                vec![ArtifactKey::NormalizedQuery],
                vec![ArtifactKey::CandidateSignals],
            ),
            TestModule::new(
                "branch-b",
                RetrievalPhase::Retrieve,
                vec![ArtifactKey::NormalizedQuery],
                vec![ArtifactKey::CandidateSignals],
            ),
            TestModule::new(
                "merge",
                RetrievalPhase::Normalize,
                vec![ArtifactKey::CandidateSignals],
                vec![ArtifactKey::RankedCandidates],
            ),
            TestModule::new(
                "finalizer",
                RetrievalPhase::Finalize,
                vec![ArtifactKey::RankedCandidates],
                vec![ArtifactKey::FinalResults],
            ),
        ] {
            registry.register(module).unwrap();
        }
        let pipeline = RetrievalPipelineV1 {
            nodes: vec![
                RetrievalPipelineNodeV1 {
                    id: "seed".to_string(),
                    module_id: "seed".to_string(),
                    enabled: true,
                    depends_on: None,
                    params: serde_json::json!({}),
                    failure_policy: None,
                },
                RetrievalPipelineNodeV1 {
                    id: "branch-a".to_string(),
                    module_id: "branch-a".to_string(),
                    enabled: true,
                    depends_on: Some(vec!["seed".to_string()]),
                    params: serde_json::json!({}),
                    failure_policy: None,
                },
                RetrievalPipelineNodeV1 {
                    id: "branch-b".to_string(),
                    module_id: "branch-b".to_string(),
                    enabled: true,
                    depends_on: Some(vec!["seed".to_string()]),
                    params: serde_json::json!({}),
                    failure_policy: None,
                },
                RetrievalPipelineNodeV1 {
                    id: "merge".to_string(),
                    module_id: "merge".to_string(),
                    enabled: true,
                    depends_on: Some(vec!["branch-a".to_string(), "branch-b".to_string()]),
                    params: serde_json::json!({}),
                    failure_policy: None,
                },
                RetrievalPipelineNodeV1 {
                    id: "finalizer".to_string(),
                    module_id: "finalizer".to_string(),
                    enabled: true,
                    depends_on: Some(vec!["merge".to_string()]),
                    params: serde_json::json!({}),
                    failure_policy: None,
                },
            ],
            ..test_pipeline()
        };

        let compiled = RetrievalPipelineCompiler::new(Arc::new(registry))
            .compile(&pipeline, "parallel-merge".to_string());
        assert!(compiled.result.valid, "{:?}", compiled.result.issues);
    }
}
