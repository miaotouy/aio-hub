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

use crate::recall::state::{CachedRetrievalEntry, RecallState};
use sha2::{Digest, Sha256};
use tauri::State;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalCacheInput {
    pub query: String,
    pub recall_ids: Vec<String>,
    pub tags: Vec<String>,
    pub fusion_weights: [f32; 2],
    pub limit: u32,
    pub min_score: f32,
    pub preset_id: String,
    pub config_hash: String,
    pub embedding_identity: String,
    pub asset_generation: String,
    pub algorithm_version: String,
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn build_cache_key(input: &RetrievalCacheInput) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.query.as_bytes());
    hasher.update(b"\0");

    let mut recall_ids = input.recall_ids.clone();
    recall_ids.sort();
    hasher.update(recall_ids.join(",").as_bytes());
    hasher.update(b"\0");

    let mut tags = input.tags.clone();
    tags.sort();
    hasher.update(tags.join(",").as_bytes());
    hasher.update(b"\0");

    for weight in input.fusion_weights {
        hasher.update(weight.to_le_bytes());
    }
    hasher.update(b"\0");

    hasher.update(input.limit.to_le_bytes());
    hasher.update(b"\0");
    hasher.update(input.min_score.to_le_bytes());
    hasher.update(b"\0");
    hasher.update(input.preset_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(input.config_hash.as_bytes());
    hasher.update(b"\0");
    hasher.update(input.embedding_identity.as_bytes());
    hasher.update(b"\0");
    hasher.update(input.asset_generation.as_bytes());
    hasher.update(b"\0");
    hasher.update(input.algorithm_version.as_bytes());

    format!("{:x}", hasher.finalize())
}

#[tauri::command]
pub async fn recall_retrieval_cache_get(
    state: State<'_, RecallState>,
    input: RetrievalCacheInput,
) -> Result<Option<CachedRetrievalEntry>, String> {
    let key = build_cache_key(&input);
    let mut cache = state
        .retrieval_cache
        .write()
        .map_err(|_| "获取检索缓存写锁失败".to_string())?;

    if let Some((entry, ts)) = cache.get_mut(&key) {
        *ts = now_secs();
        return Ok(Some(entry.clone()));
    }

    Ok(None)
}

#[tauri::command]
pub async fn recall_retrieval_cache_set(
    state: State<'_, RecallState>,
    input: RetrievalCacheInput,
    entry: CachedRetrievalEntry,
    max_items: usize,
) -> Result<(), String> {
    let mut cache = state
        .retrieval_cache
        .write()
        .map_err(|_| "获取检索缓存写锁失败".to_string())?;

    if max_items == 0 {
        cache.clear();
        return Ok(());
    }

    let key = build_cache_key(&input);
    let now = now_secs();

    if cache.len() >= max_items {
        let mut items: Vec<(String, u64)> =
            cache.iter().map(|(k, (_, ts))| (k.clone(), *ts)).collect();
        items.sort_by_key(|(_, ts)| *ts);

        let delete_count = (max_items / 5).max(1);
        for (k, _) in items.iter().take(delete_count) {
            cache.remove(k);
        }
    }

    cache.insert(key, (entry, now));
    Ok(())
}

#[tauri::command]
pub async fn recall_retrieval_cache_clear(state: State<'_, RecallState>) -> Result<(), String> {
    state.clear_retrieval_cache()
}

#[tauri::command]
pub async fn recall_retrieval_cache_stats(state: State<'_, RecallState>) -> Result<usize, String> {
    let cache = state
        .retrieval_cache
        .read()
        .map_err(|_| "获取检索缓存读锁失败".to_string())?;
    Ok(cache.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> RetrievalCacheInput {
        RetrievalCacheInput {
            query: "query".to_string(),
            recall_ids: vec!["collection".to_string()],
            tags: vec![],
            fusion_weights: [0.7, 0.3],
            limit: 5,
            min_score: 0.3,
            preset_id: "comprehensive".to_string(),
            config_hash: "pipeline-config-v1".to_string(),
            embedding_identity: "profile:model".to_string(),
            asset_generation: "generation-a".to_string(),
            algorithm_version: "recall-pipeline-comprehensive-v1".to_string(),
        }
    }

    #[test]
    fn cache_key_separates_preset_config_and_algorithm_versions() {
        let baseline = input();
        let mut different_preset = input();
        different_preset.preset_id = "algorithmic".to_string();
        let mut different_config = input();
        different_config.config_hash = "pipeline-config-v2".to_string();
        let mut different_version = input();
        different_version.algorithm_version = "recall-pipeline-comprehensive-v2".to_string();
        let mut different_generation = input();
        different_generation.asset_generation = "generation-b".to_string();

        assert_ne!(
            build_cache_key(&baseline),
            build_cache_key(&different_preset)
        );
        assert_ne!(
            build_cache_key(&baseline),
            build_cache_key(&different_config)
        );
        assert_ne!(
            build_cache_key(&baseline),
            build_cache_key(&different_version)
        );
        assert_ne!(
            build_cache_key(&baseline),
            build_cache_key(&different_generation)
        );
    }

    #[test]
    fn cache_key_separates_fusion_weights() {
        let baseline = input();
        let mut different_weights = input();
        different_weights.fusion_weights = [0.6, 0.4];

        assert_ne!(
            build_cache_key(&baseline),
            build_cache_key(&different_weights)
        );
    }
}
