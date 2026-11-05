// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

use super::storage::RecallRepository;
use std::collections::{HashMap, HashSet};

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseVectorStats {
    pub total: usize,
    pub vectorized: usize,
}

#[derive(Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStats {
    pub total_bases: usize,
    pub total_entries: usize,
    pub vectorized_entries: usize,
    pub total_tokens: usize,
    pub all_discovered_tags: Vec<String>,
    pub tag_usage_stats: HashMap<String, usize>,
    pub bases_stats: HashMap<String, BaseVectorStats>,
}

pub fn library_stats(
    repository: &dyn RecallRepository,
    model_id: &str,
) -> Result<LibraryStats, String> {
    let collections = repository.list_collections()?;
    let mut stats = LibraryStats {
        total_bases: collections.len(),
        ..Default::default()
    };
    for collection in collections {
        let entries = repository.load_entries(collection.id)?;
        let vectors = if model_id.is_empty() {
            None
        } else {
            repository.load_vectors(collection.id, model_id)?
        };
        let (vector_ids, tokens) = vectors
            .map(|(vectors, _, tokens)| {
                (
                    vectors
                        .into_iter()
                        .map(|(id, _)| id)
                        .collect::<HashSet<_>>(),
                    tokens,
                )
            })
            .unwrap_or_default();
        let mut vectorized = 0;
        for entry in &entries {
            for tag in &entry.tags {
                *stats.tag_usage_stats.entry(tag.name.clone()).or_default() += 1;
            }
            vectorized += usize::from(vector_ids.contains(&entry.id));
        }
        stats.total_entries += entries.len();
        stats.vectorized_entries += vectorized;
        stats.total_tokens = stats.total_tokens.saturating_add(tokens);
        stats.bases_stats.insert(
            collection.id.to_string(),
            BaseVectorStats {
                total: entries.len(),
                vectorized,
            },
        );
    }
    stats.all_discovered_tags = stats.tag_usage_stats.keys().cloned().collect();
    stats.all_discovered_tags.sort();
    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recall::{
        core::{RecallCollection, RecallEntry},
        storage::sqlite::SqliteRecallRepository,
    };
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn selected_model_statistics_survive_restart_and_track_entry_changes() {
        let directory = tempfile::tempdir().unwrap();
        let repo = SqliteRecallRepository::new(directory.path());
        repo.initialize().unwrap();
        let id = Uuid::new_v4();
        let other_id = Uuid::new_v4();
        let meta = |id, name| {
            serde_json::from_value(json!({"id": id, "name": name, "vectorization": {"isIndexed": false, "lastIndexedAt": null, "modelUsed": "", "dimension": 0, "totalTokens": 0}})).unwrap()
        };
        let first: RecallEntry = serde_json::from_value(json!({"id": Uuid::new_v4(), "key": "one", "content": "first", "contentHash": "first-hash", "tags": [{"name": "Rust", "weight": 1.0}, {"name": "shared", "weight": 1.0}]})).unwrap();
        let second: RecallEntry = serde_json::from_value(json!({"id": Uuid::new_v4(), "key": "two", "content": "second", "contentHash": "second-hash", "enabled": false, "tags": [{"name": "shared", "weight": 1.0}]})).unwrap();
        repo.save_collection(&RecallCollection {
            meta: meta(id, "first"),
            entries: vec![first.clone(), second.clone()],
        })
        .unwrap();
        repo.save_collection(&RecallCollection {
            meta: meta(other_id, "empty"),
            entries: vec![],
        })
        .unwrap();
        repo.upsert_entry_vector(
            id,
            first.id,
            "model-a",
            &[1.0, 0.0],
            Some(7),
            first.content_hash.as_deref(),
            1,
        )
        .unwrap();
        repo.upsert_entry_vector(
            id,
            second.id,
            "model-b",
            &[0.0, 1.0],
            Some(13),
            second.content_hash.as_deref(),
            1,
        )
        .unwrap();
        let restarted = SqliteRecallRepository::new(directory.path());
        let stats = library_stats(&restarted, "model-a").unwrap();
        assert_eq!(
            (
                stats.total_bases,
                stats.total_entries,
                stats.vectorized_entries,
                stats.total_tokens
            ),
            (2, 2, 1, 7)
        );
        assert_eq!(stats.all_discovered_tags, vec!["Rust", "shared"]);
        assert_eq!(stats.tag_usage_stats["shared"], 2);
        assert_eq!(stats.bases_stats[&other_id.to_string()].total, 0);
        assert_eq!(stats.bases_stats[&id.to_string()].vectorized, 1);
        let other = library_stats(&restarted, "model-b").unwrap();
        assert_eq!((other.vectorized_entries, other.total_tokens), (1, 13));
        for model in ["", "unknown"] {
            let empty = library_stats(&restarted, model).unwrap();
            assert_eq!(
                (
                    empty.total_entries,
                    empty.vectorized_entries,
                    empty.total_tokens
                ),
                (2, 0, 0)
            );
        }
        let mut edited = first.clone();
        edited.content = "changed".to_string();
        edited.content_hash = Some("changed-hash".to_string());
        edited.tags.clear();
        repo.upsert_entry(id, &edited).unwrap();
        let after_edit = library_stats(&restarted, "model-a").unwrap();
        assert_eq!(
            (after_edit.vectorized_entries, after_edit.total_tokens),
            (0, 0)
        );
        assert_eq!(after_edit.all_discovered_tags, vec!["shared"]);
        repo.delete_entries(id, &[second.id]).unwrap();
        let after_delete = library_stats(&restarted, "model-b").unwrap();
        assert_eq!(
            (
                after_delete.total_entries,
                after_delete.vectorized_entries,
                after_delete.total_tokens
            ),
            (1, 0, 0)
        );
        assert!(after_delete.tag_usage_stats.is_empty());
    }
}
