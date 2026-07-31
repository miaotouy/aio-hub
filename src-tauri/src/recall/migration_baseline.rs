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
    RecallCollectionIndex, RecallCollectionMeta, RecallEntry, RecallEntryIndexItem,
    RecallSearchFilters, RecallWorkspace, RetrievalContext, RetrievalRequestSnapshot,
    VectorIndexConfig, VectorizationMeta, WorkspaceConfig,
};
use crate::recall::index::InMemoryDatabase;
use crate::recall::io::{
    get_knowledge_root, get_recall_dir, get_recall_vector_file_path, init_workspace, save_entry,
    save_recall_meta,
};
use crate::recall::ops::{
    load_entries_to_vec, load_knowledge_base_meta_only, load_vectors_to_vec,
    update_recall_models_index, warmup_knowledge_base, warmup_recall_repository,
};
use crate::recall::retrieval_modules::{
    algorithmic_pipeline, comprehensive_pipeline, production_module_registry,
};
use crate::recall::retrieval_pipeline::{
    PipelineRunOutcome, PipelineRunResponse, RecallPresetId, RetrievalArtifactBundle,
    RetrievalArtifacts, RetrievalPipelineCompiler, RetrievalPipelineRunner,
};
use crate::recall::storage::{LegacyFileRecallImporter, RecallRepository, SqliteRecallRepository};
use crate::recall::tag_pool::{GlobalTagPoolManager, ModelTagPool};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::{Arc, RwLock};
use uuid::Uuid;

const BASELINE_JSON: &str =
    include_str!("../../../src/tools/recall/__fixtures__/recall-migration-baseline-v1.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MigrationBaseline {
    pub format: String,
    pub format_version: u32,
    pub collections: Vec<FixtureCollection>,
    pub tag_pools: Vec<FixtureTagPool>,
    pub expected_stats: ExpectedStats,
    pub queries: Vec<FixtureQuery>,
    pub migration_inputs: Vec<String>,
    pub migration_states: HashMap<String, Vec<String>>,
    pub agent_behavior: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixtureCollection {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub author: Option<String>,
    pub tags: Vec<String>,
    pub icon: Option<String>,
    pub config: Value,
    pub active_model_id: String,
    pub entries: Vec<RecallEntry>,
    pub vectors: Vec<FixtureVectorModel>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixtureVectorModel {
    pub model_id: String,
    pub dimension: usize,
    pub records: Vec<FixtureVectorRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixtureVectorRecord {
    pub entry_id: Uuid,
    pub vector: Option<Vec<f32>>,
    pub tokens: u32,
    pub content_hash: String,
    pub corrupted: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixtureTagPool {
    pub model_id: String,
    pub dimension: usize,
    pub tags: Vec<FixtureTagVector>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct FixtureTagVector {
    pub name: String,
    pub vector: Vec<f32>,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExpectedStats {
    pub collection_count: usize,
    pub entry_count: usize,
    pub enabled_entry_count: usize,
    pub asset_ref_count: usize,
    pub vector_model_count: usize,
    pub valid_vector_record_count: usize,
    pub rebuild_required_count: usize,
    pub tag_count: usize,
    pub total_tokens: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixtureQuery {
    pub name: String,
    pub engine_id: String,
    pub payload: FixtureQueryPayload,
    pub filters: FixtureQueryFilters,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub(crate) enum FixtureQueryPayload {
    Text(String),
    Vector {
        vector: Vec<f32>,
        model: String,
        query: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixtureQueryFilters {
    #[serde(default, alias = "recallIds")]
    pub kb_ids: Vec<Uuid>,
    pub tags: Option<Vec<String>>,
    pub required_tags: Option<Vec<String>>,
    pub limit: Option<usize>,
    pub min_score: Option<f32>,
    pub enabled_only: Option<bool>,
}

impl FixtureQueryFilters {
    fn current(&self) -> RecallSearchFilters {
        let mut tags = self
            .tags
            .iter()
            .chain(&self.required_tags)
            .flatten()
            .cloned()
            .collect::<Vec<_>>();
        tags.sort();
        tags.dedup();
        RecallSearchFilters {
            recall_ids: (!self.kb_ids.is_empty()).then(|| self.kb_ids.clone()),
            tags: (!tags.is_empty()).then_some(tags),
            limit: self.limit,
            min_score: self.min_score,
            enabled_only: self.enabled_only,
            ..Default::default()
        }
    }
}

pub(crate) fn fixture() -> MigrationBaseline {
    serde_json::from_str(BASELINE_JSON).expect("migration baseline fixture must be valid")
}

impl FixtureCollection {
    pub(crate) fn meta(&self) -> RecallCollectionMeta {
        let active_model = self
            .vectors
            .iter()
            .find(|model| model.model_id == self.active_model_id);
        let entries = self
            .entries
            .iter()
            .map(|entry| {
                let mut models = Vec::new();
                let mut total_tokens = 0;
                let mut has_corrupt_record = false;
                for model in &self.vectors {
                    if let Some(record) = model
                        .records
                        .iter()
                        .find(|record| record.entry_id == entry.id)
                    {
                        if record.corrupted || record.vector.is_none() {
                            has_corrupt_record = true;
                        } else {
                            models.push(model.model_id.clone());
                            total_tokens += record.tokens;
                        }
                    }
                }
                RecallEntryIndexItem {
                    id: entry.id,
                    key: entry.key.clone(),
                    summary: entry.summary.clone(),
                    tags: entry.tags.iter().map(|tag| tag.name.clone()).collect(),
                    priority: entry.priority,
                    enabled: entry.enabled,
                    updated_at: entry.updated_at,
                    vector_status: if models.is_empty() && has_corrupt_record {
                        "error".to_string()
                    } else if models.is_empty() {
                        "none".to_string()
                    } else {
                        "ready".to_string()
                    },
                    content_hash: entry.content_hash.clone(),
                    vectorized_models: models,
                    total_tokens,
                }
            })
            .collect();
        let active_tokens = active_model
            .map(|model| {
                model
                    .records
                    .iter()
                    .filter(|record| !record.corrupted && record.vector.is_some())
                    .map(|record| record.tokens as u64)
                    .sum()
            })
            .unwrap_or(0);

        RecallCollectionMeta {
            id: self.id,
            name: self.name.clone(),
            description: self.description.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
            author: self.author.clone(),
            vectorization: VectorizationMeta {
                is_indexed: active_model.is_some(),
                last_indexed_at: active_model.map(|_| self.updated_at),
                model_used: self.active_model_id.clone(),
                dimension: active_model.map(|model| model.dimension).unwrap_or(0),
                total_tokens: active_tokens,
            },
            models: self
                .vectors
                .iter()
                .map(|model| model.model_id.clone())
                .collect(),
            tags: self.tags.clone(),
            icon: self.icon.clone(),
            entries,
            config: self.config.clone(),
        }
    }
}

pub(crate) fn materialize_current_file_layout(
    app_data_dir: &Path,
    baseline: &MigrationBaseline,
) -> Result<(), String> {
    init_workspace(app_data_dir)?;
    let workspace = RecallWorkspace {
        version: "2.0.0".to_string(),
        config: WorkspaceConfig {
            default_embedding_model: "baseline/embed-4d".to_string(),
            vector_index: VectorIndexConfig {
                algorithm: "hnsw".to_string(),
                dimension: 4,
                metric: "cosine".to_string(),
                ef_construction: Some(200),
                m: Some(16),
            },
        },
        bases: baseline
            .collections
            .iter()
            .map(|collection| RecallCollectionIndex {
                id: collection.id,
                name: collection.name.clone(),
                description: collection.description.clone(),
                entry_count: collection.entries.len(),
                last_updated: collection.updated_at,
                path: format!("bases/{}", collection.id),
                total_tokens: collection
                    .meta()
                    .entries
                    .iter()
                    .map(|entry| entry.total_tokens as u64)
                    .sum(),
                is_loaded: false,
                is_vectorized: false,
            })
            .collect(),
    };
    let workspace_bytes =
        serde_json::to_vec_pretty(&workspace).map_err(|error| error.to_string())?;
    fs::write(
        get_knowledge_root(app_data_dir).join("workspace.json"),
        workspace_bytes,
    )
    .map_err(|error| error.to_string())?;

    for collection in &baseline.collections {
        let id = collection.id.to_string();
        save_recall_meta(app_data_dir, &id, &collection.meta())?;
        for entry in &collection.entries {
            save_entry(app_data_dir, &id, entry)?;
        }
        for model in &collection.vectors {
            for record in &model.records {
                let path = get_recall_vector_file_path(
                    app_data_dir,
                    &id,
                    &model.model_id,
                    &record.entry_id.to_string(),
                );
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                if record.corrupted {
                    fs::write(&path, b"{corrupt-vector-record")
                        .map_err(|error| error.to_string())?;
                } else {
                    let bytes = serde_json::to_vec_pretty(&serde_json::json!({
                        "vector": record.vector,
                        "tokens": record.tokens,
                        "contentHash": record.content_hash,
                    }))
                    .map_err(|error| error.to_string())?;
                    fs::write(&path, bytes).map_err(|error| error.to_string())?;
                }
            }
            update_recall_models_index(app_data_dir, &id, &model.model_id)?;
        }
    }

    for fixture_pool in &baseline.tag_pools {
        let mut pool = ModelTagPool::new(fixture_pool.model_id.clone());
        pool.sync_vectors(
            fixture_pool
                .tags
                .iter()
                .map(|tag| (tag.name.clone(), tag.vector.clone()))
                .collect(),
        );
        if pool.dimension != fixture_pool.dimension {
            return Err(format!(
                "标签池维度不匹配: expected {}, got {}",
                fixture_pool.dimension, pool.dimension
            ));
        }
        pool.save(app_data_dir)?;
    }
    Ok(())
}

fn computed_stats(baseline: &MigrationBaseline) -> ExpectedStats {
    let models: HashSet<&str> = baseline
        .collections
        .iter()
        .flat_map(|collection| {
            collection
                .vectors
                .iter()
                .map(|model| model.model_id.as_str())
        })
        .collect();
    ExpectedStats {
        collection_count: baseline.collections.len(),
        entry_count: baseline
            .collections
            .iter()
            .map(|collection| collection.entries.len())
            .sum(),
        enabled_entry_count: baseline
            .collections
            .iter()
            .flat_map(|collection| &collection.entries)
            .filter(|entry| entry.enabled)
            .count(),
        asset_ref_count: baseline
            .collections
            .iter()
            .flat_map(|collection| &collection.entries)
            .map(|entry| entry.assets.len())
            .sum(),
        vector_model_count: models.len(),
        valid_vector_record_count: baseline
            .collections
            .iter()
            .flat_map(|collection| &collection.vectors)
            .flat_map(|model| &model.records)
            .filter(|record| !record.corrupted && record.vector.is_some())
            .count(),
        rebuild_required_count: baseline
            .collections
            .iter()
            .flat_map(|collection| &collection.vectors)
            .flat_map(|model| &model.records)
            .filter(|record| record.corrupted || record.vector.is_none())
            .count(),
        tag_count: baseline.tag_pools.iter().map(|pool| pool.tags.len()).sum(),
        total_tokens: baseline
            .collections
            .iter()
            .flat_map(|collection| &collection.vectors)
            .flat_map(|model| &model.records)
            .filter(|record| !record.corrupted && record.vector.is_some())
            .map(|record| record.tokens)
            .sum(),
    }
}

fn build_retrieval_context(app_data_dir: &Path, baseline: &MigrationBaseline) -> RetrievalContext {
    let mut database = InMemoryDatabase::new();
    for collection in &baseline.collections {
        let recall_path = get_recall_dir(app_data_dir, &collection.id.to_string());
        let base = load_knowledge_base_meta_only(app_data_dir, &recall_path, collection.id)
            .expect("baseline metadata should load")
            .expect("baseline collection should exist");
        let base = Arc::new(RwLock::new(base));
        warmup_knowledge_base(app_data_dir, &base, &recall_path)
            .expect("baseline collection should warm up");
        database.bases.insert(collection.id, base);
    }
    let tag_pool_manager = GlobalTagPoolManager::new();
    tag_pool_manager
        .replace_pools(
            baseline
                .tag_pools
                .iter()
                .map(|pool| {
                    ModelTagPool::load(app_data_dir, &pool.model_id)
                        .expect("legacy tag pool should load for the baseline")
                })
                .collect(),
        )
        .expect("legacy tag pools should populate the baseline runtime");
    RetrievalContext {
        db: Arc::new(RwLock::new(database)),
        tag_pool_manager,
        app_data_dir: app_data_dir.to_path_buf(),
        request: None,
    }
}

fn build_repository_retrieval_context(
    app_data_dir: &Path,
    baseline: &MigrationBaseline,
) -> RetrievalContext {
    materialize_current_file_layout(app_data_dir, baseline)
        .expect("baseline file layout should materialize");
    let repository = SqliteRecallRepository::new(app_data_dir);
    let report = LegacyFileRecallImporter::new(app_data_dir, repository)
        .import()
        .expect("baseline should import into the Recall repository");
    assert_eq!(
        report.migrated_collections,
        baseline.expected_stats.collection_count
    );
    assert_eq!(report.migrated_entries, baseline.expected_stats.entry_count);
    fs::remove_dir_all(get_knowledge_root(app_data_dir))
        .expect("legacy directory should be removable after isolated import");

    // Recreate every runtime object to model a process restart.
    let restarted_repository = SqliteRecallRepository::new(app_data_dir);
    restarted_repository.initialize().unwrap();
    let database = Arc::new(RwLock::new(InMemoryDatabase::new()));
    let tag_pool_manager = GlobalTagPoolManager::new();
    warmup_recall_repository(&restarted_repository, &database, &tag_pool_manager)
        .expect("repository warmup should survive a process restart");
    RetrievalContext {
        db: database,
        tag_pool_manager,
        app_data_dir: app_data_dir.to_path_buf(),
        request: None,
    }
}

fn run_pipeline_query(query: &FixtureQuery, context: &RetrievalContext) -> PipelineRunResponse {
    let preset_id = if query.engine_id == "keyword" {
        RecallPresetId::Algorithmic
    } else {
        RecallPresetId::Comprehensive
    };
    let (text, embedding) = match &query.payload {
        FixtureQueryPayload::Text(text) => (text.clone(), None),
        FixtureQueryPayload::Vector {
            vector,
            model,
            query,
        } => (
            query.clone().unwrap_or_default(),
            Some((vector.clone(), model.clone())),
        ),
    };
    let filters = query.filters.current();
    let pipeline = match preset_id {
        RecallPresetId::Algorithmic => algorithmic_pipeline(filters.limit),
        RecallPresetId::Comprehensive => comprehensive_pipeline(filters.limit),
    };
    let compiled = RetrievalPipelineCompiler::new(std::sync::Arc::new(
        production_module_registry().expect("production registry must be valid"),
    ))
    .compile(&pipeline, format!("migration-baseline-{}", query.name));
    let bundle = embedding.map(|(vector, model)| RetrievalArtifactBundle {
        bundle_id: format!("migration-baseline-{}:{model}", query.name),
        embedding_space: Some(model.clone()),
        model_signature: Some(model),
        asset_generation: Some("migration-baseline-v1".to_string()),
        algorithm_version: compiled.result.algorithm_version.clone(),
        query_embedding: Some(vector),
        query_energy_field: None,
    });
    let runtime_context = RetrievalContext {
        db: context.db.clone(),
        tag_pool_manager: context.tag_pool_manager.clone(),
        app_data_dir: context.app_data_dir.clone(),
        request: Some(RetrievalRequestSnapshot {
            query: text,
            filters,
        }),
    };
    RetrievalPipelineRunner.run(
        &compiled,
        &runtime_context,
        RetrievalArtifacts::default(),
        bundle.as_ref(),
        preset_id,
        preset_id,
        None,
    )
}

fn pipeline_snapshots(
    baseline: &MigrationBaseline,
    context: &RetrievalContext,
) -> Vec<(String, Vec<Uuid>)> {
    baseline
        .queries
        .iter()
        .map(|query| {
            let response = run_pipeline_query(query, context);
            assert!(
                matches!(
                    response.outcome,
                    PipelineRunOutcome::Success | PipelineRunOutcome::Empty
                ),
                "baseline pipeline query {} failed: {:?}",
                query.name,
                response.error
            );
            assert!(
                response
                    .results
                    .iter()
                    .all(|result| result.score.is_finite()),
                "query {} returned a non-finite score",
                query.name
            );
            assert!(response.trace.as_ref().is_some_and(|trace| {
                trace.trace_version == "recall-pipeline-trace-v1"
                    && trace.requested_preset_id == Some(response.requested_preset_id)
                    && trace.actual_preset_id == Some(response.actual_preset_id)
            }));
            (
                query.name.clone(),
                response
                    .results
                    .iter()
                    .map(|result| result.entry.id)
                    .collect(),
            )
        })
        .collect()
}

#[test]
fn fixture_records_required_inputs_states_and_statistics() {
    let baseline = fixture();
    assert_eq!(baseline.format, "aiohub.recall-migration-baseline");
    assert_eq!(baseline.format_version, 1);
    assert_eq!(computed_stats(&baseline), baseline.expected_stats);
    assert!(baseline.agent_behavior.is_object());

    let inputs: HashSet<&str> = baseline
        .migration_inputs
        .iter()
        .map(String::as_str)
        .collect();
    assert_eq!(
        inputs,
        HashSet::from([
            "current-file-layout",
            "aio-kb-v1",
            "legacy-json",
            "legacy-yaml",
        ])
    );
    for state in ["success", "partial", "failure"] {
        assert!(
            baseline
                .migration_states
                .get(state)
                .is_some_and(|observables| !observables.is_empty()),
            "migration state {state} must have observable outcomes"
        );
    }
}

#[test]
fn current_file_layout_round_trip_preserves_entries_vectors_and_tokens() {
    let baseline = fixture();
    let temp = tempfile::tempdir().expect("temporary appData should be created");
    materialize_current_file_layout(temp.path(), &baseline)
        .expect("baseline file layout should materialize");

    let workspace_bytes = fs::read(get_knowledge_root(temp.path()).join("workspace.json"))
        .expect("workspace should be readable");
    let workspace: RecallWorkspace =
        serde_json::from_slice(&workspace_bytes).expect("workspace should deserialize");
    assert_eq!(
        workspace.bases.len(),
        baseline.expected_stats.collection_count
    );

    let mut entry_count = 0;
    let mut valid_vector_count = 0;
    let mut total_tokens = 0;
    for collection in &baseline.collections {
        let path = get_recall_dir(temp.path(), &collection.id.to_string());
        let loaded = load_knowledge_base_meta_only(temp.path(), &path, collection.id)
            .expect("metadata load should succeed")
            .expect("collection metadata should exist");
        assert_eq!(loaded.meta.id, collection.id);
        assert_eq!(loaded.meta.entries.len(), collection.entries.len());

        let mut entries = Vec::new();
        load_entries_to_vec(&path, &collection.id, &mut entries)
            .expect("entry load should succeed");
        entry_count += entries.len();
        let loaded_hashes: HashMap<Uuid, Option<String>> = entries
            .into_iter()
            .map(|entry| (entry.id, entry.content_hash))
            .collect();
        for entry in &collection.entries {
            assert_eq!(loaded_hashes.get(&entry.id), Some(&entry.content_hash));
        }

        for model in &collection.vectors {
            let loaded = load_vectors_to_vec(temp.path(), collection.id, &model.model_id)
                .expect("vector load should not fail")
                .expect("vector model directory should exist");
            assert_eq!(loaded.1, model.dimension);
            valid_vector_count += loaded.0.len();
            total_tokens += loaded.2 as u32;
        }
    }
    assert_eq!(entry_count, baseline.expected_stats.entry_count);
    assert_eq!(
        valid_vector_count,
        baseline.expected_stats.valid_vector_record_count
    );
    assert_eq!(total_tokens, baseline.expected_stats.total_tokens);
}

#[test]
fn legacy_query_fixture_runs_through_current_pipelines() {
    let baseline = fixture();
    let temp = tempfile::tempdir().expect("temporary appData should be created");
    materialize_current_file_layout(temp.path(), &baseline)
        .expect("baseline file layout should materialize");
    let context = build_retrieval_context(temp.path(), &baseline);

    assert_eq!(
        pipeline_snapshots(&baseline, &context).len(),
        baseline.queries.len()
    );
}

#[test]
fn repository_restart_preserves_pipeline_snapshots_without_legacy_files() {
    let baseline = fixture();
    let legacy_temp = tempfile::tempdir().expect("temporary legacy appData should be created");
    materialize_current_file_layout(legacy_temp.path(), &baseline)
        .expect("baseline file layout should materialize");
    let legacy_context = build_retrieval_context(legacy_temp.path(), &baseline);
    let expected = pipeline_snapshots(&baseline, &legacy_context);

    let repository_temp =
        tempfile::tempdir().expect("temporary repository appData should be created");
    let repository_context = build_repository_retrieval_context(repository_temp.path(), &baseline);
    assert_eq!(pipeline_snapshots(&baseline, &repository_context), expected);
}
