// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

use super::*;

pub(super) fn execute(
    repo: &SqliteRecallRepository,
    caches: &RuntimeCaches,
    command: &str,
    a: &Value,
) -> Result<Value> {
    if command == "recall_get_library_stats" {
        return Ok(json!(
            statistics::library_stats(repo, text(a, "modelId")?).map_err(error)?
        ));
    }
    let mut pools = caches.tag_pools.lock().map_err(error)?;
    let mut saved = 0_u32;
    for (model, pool) in pools.iter_mut() {
        if pool.index.is_none() && !pool.registry.is_empty() {
            pool.rebuild_index();
        }
        match repo.save_tag_pool(pool) {
            Ok(()) => saved += 1,
            Err(error) => log::error!("[Recall] 保存标签池失败 {model}: {error}"),
        }
    }
    Ok(json!(saved))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flush_persists_loaded_tag_pools_and_rebuilds_search_for_restart() {
        let directory = tempfile::tempdir().unwrap();
        let repo = SqliteRecallRepository::new(directory.path());
        repo.initialize().unwrap();
        let caches = RuntimeCaches::default();
        let mut pool = tag_pool::ModelTagPool::new("model-a".to_string());
        pool.sync_vectors(vec![("Rust".to_string(), vec![1.0, 0.0])]);
        caches
            .tag_pools
            .lock()
            .unwrap()
            .insert("model-a".to_string(), pool);
        assert!(
            repo.load_tag_pool("model-a")
                .unwrap()
                .get_missing_tags(vec!["Rust".to_string()])
                .len()
                == 1
        );
        assert_eq!(
            dispatch_with_caches(&repo, &caches, "recall_flush_all_tag_pools", &json!({})).unwrap(),
            "1"
        );
        let reloaded = repo.load_tag_pool("model-a").unwrap();
        assert!(reloaded
            .get_missing_tags(vec!["Rust".to_string()])
            .is_empty());
        let restarted = RuntimeCaches::default();
        dispatch_with_caches(&repo, &restarted, "recall_warmup", &json!({})).unwrap();
        let loaded = cached_tag_pool(&repo, &restarted, "model-a").unwrap();
        let found = loaded.search_neighbors(&[1.0, 0.0], 1);
        assert_eq!(found.len(), 1);
        assert_eq!(loaded.get_tag_name(found[0].0).unwrap(), "Rust");
    }
}
