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

use crate::knowledge::core::{
    Caiu, CaiuIndexItem, KnowledgeBaseIndex, KnowledgeBaseMeta, KnowledgeWorkspace, QueryPayload,
    RetrievalContext, RetrievalEngine, SearchFilters, VectorIndexConfig, VectorizationMeta,
    WorkspaceConfig,
};
use crate::knowledge::index::InMemoryDatabase;
use crate::knowledge::io::{
    get_kb_dir, get_kb_vector_file_path, get_knowledge_root, init_workspace, save_entry,
    save_kb_meta,
};
use crate::knowledge::ops::{
    load_entries_to_vec, load_knowledge_base_meta_only, load_vectors_to_vec,
    update_kb_models_index, warmup_knowledge_base,
};
use crate::knowledge::search::{
    BlenderRetrievalEngine, KeywordRetrievalEngine, LensRetrievalEngine, VectorRetrievalEngine,
};
use crate::knowledge::tag_pool::{GlobalTagPoolManager, ModelTagPool};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::{Arc, RwLock};
use uuid::Uuid;

const BASELINE_JSON: &str = include_str!(
    "../../../src/tools/knowledge-base/__fixtures__/recall-migration-baseline-v1.json"
);

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
    pub entries: Vec<Caiu>,
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
    pub payload: QueryPayload,
    pub filters: SearchFilters,
    pub expected_entry_ids: Vec<Uuid>,
    pub expected_match_types: Vec<String>,
}

pub(crate) fn fixture() -> MigrationBaseline {
    serde_json::from_str(BASELINE_JSON).expect("migration baseline fixture must be valid")
}

impl FixtureCollection {
    pub(crate) fn meta(&self) -> KnowledgeBaseMeta {
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
                CaiuIndexItem {
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

        KnowledgeBaseMeta {
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
    let workspace = KnowledgeWorkspace {
        version: "2.0.0".to_string(),
        config: WorkspaceConfig {
            default_embedding_model: "baseline/embed-4d".to_string(),
            vector_index: VectorIndexConfig {
                algorithm: "hnsw".to_string(),
                dimension: 4,
                metric: "cosine".to_string(),
                ef_construction: Some(200),
                m: Some(16),
                extra: HashMap::new(),
            },
        },
        bases: baseline
            .collections
            .iter()
            .map(|collection| KnowledgeBaseIndex {
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
        save_kb_meta(app_data_dir, &id, &collection.meta())?;
        for entry in &collection.entries {
            save_entry(app_data_dir, &id, entry)?;
        }
        for model in &collection.vectors {
            for record in &model.records {
                let path = get_kb_vector_file_path(
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
            update_kb_models_index(app_data_dir, &id, &model.model_id)?;
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
        let kb_path = get_kb_dir(app_data_dir, &collection.id.to_string());
        let base = load_knowledge_base_meta_only(app_data_dir, &kb_path, collection.id)
            .expect("baseline metadata should load")
            .expect("baseline collection should exist");
        let base = Arc::new(RwLock::new(base));
        warmup_knowledge_base(app_data_dir, &base, &kb_path)
            .expect("baseline collection should warm up");
        database.bases.insert(collection.id, base);
    }
    RetrievalContext {
        db: Arc::new(RwLock::new(database)),
        tag_pool_manager: GlobalTagPoolManager::new(),
        app_data_dir: app_data_dir.to_path_buf(),
    }
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
    let workspace: KnowledgeWorkspace =
        serde_json::from_slice(&workspace_bytes).expect("workspace should deserialize");
    assert_eq!(
        workspace.bases.len(),
        baseline.expected_stats.collection_count
    );

    let mut entry_count = 0;
    let mut valid_vector_count = 0;
    let mut total_tokens = 0;
    for collection in &baseline.collections {
        let path = get_kb_dir(temp.path(), &collection.id.to_string());
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
fn retrieval_snapshots_match_all_legacy_engines() {
    let baseline = fixture();
    let temp = tempfile::tempdir().expect("temporary appData should be created");
    materialize_current_file_layout(temp.path(), &baseline)
        .expect("baseline file layout should materialize");
    let context = build_retrieval_context(temp.path(), &baseline);

    for query in &baseline.queries {
        let results = match query.engine_id.as_str() {
            "keyword" => {
                KeywordRetrievalEngine::new().search(&query.payload, &query.filters, &context)
            }
            "vector" => {
                VectorRetrievalEngine::new().search(&query.payload, &query.filters, &context)
            }
            "lens" => LensRetrievalEngine::new().search(&query.payload, &query.filters, &context),
            "blender" => {
                BlenderRetrievalEngine::new().search(&query.payload, &query.filters, &context)
            }
            other => panic!("unknown baseline engine: {other}"),
        }
        .unwrap_or_else(|error| panic!("baseline query {} failed: {error}", query.name));
        let ids: Vec<Uuid> = results.iter().map(|result| result.caiu.id).collect();
        let match_types: Vec<String> = results
            .iter()
            .map(|result| result.match_type.clone())
            .collect();
        assert_eq!(ids, query.expected_entry_ids, "query {}", query.name);
        assert_eq!(
            match_types, query.expected_match_types,
            "query {}",
            query.name
        );
        assert!(
            results.iter().all(|result| result.score.is_finite()),
            "query {} returned a non-finite score",
            query.name
        );
    }
}
