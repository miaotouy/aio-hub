// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

// Phase 0 freezes this contract before the Phase 1 runner consumes it.
#![allow(dead_code)]

use crate::recall::core::{RecallResult, RecallSignalType, RetrievalContext};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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

    pub fn contains(&self, key: ArtifactKey) -> bool {
        self.entries.contains_key(&key)
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
    pub depends_on: Option<Vec<String>>,
    pub params: Value,
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

pub trait RetrievalModule: Send + Sync {
    fn info(&self) -> RetrievalModuleInfo;

    fn execute(
        &self,
        context: &RetrievalContext,
        artifacts: &mut RetrievalArtifacts,
        params: &Value,
        trace: &mut PipelineTraceV1,
    ) -> Result<(), RetrievalModuleError>;
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
}
