use crate::knowledge::state::{CachedRetrievalEntry, KnowledgeState};
use sha2::{Digest, Sha256};
use tauri::State;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalCacheInput {
    pub query: String,
    pub kb_ids: Vec<String>,
    pub tags: Vec<String>,
    pub limit: u32,
    pub min_score: f32,
    pub engine_id: String,
    pub model_id: String,
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

    let mut kb_ids = input.kb_ids.clone();
    kb_ids.sort();
    hasher.update(kb_ids.join(",").as_bytes());
    hasher.update(b"\0");

    let mut tags = input.tags.clone();
    tags.sort();
    hasher.update(tags.join(",").as_bytes());
    hasher.update(b"\0");

    hasher.update(input.limit.to_le_bytes());
    hasher.update(b"\0");
    hasher.update(input.min_score.to_le_bytes());
    hasher.update(b"\0");
    hasher.update(input.engine_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(input.model_id.as_bytes());

    format!("{:x}", hasher.finalize())
}

#[tauri::command]
pub async fn kb_retrieval_cache_get(
    state: State<'_, KnowledgeState>,
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
pub async fn kb_retrieval_cache_set(
    state: State<'_, KnowledgeState>,
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
pub async fn kb_retrieval_cache_clear(state: State<'_, KnowledgeState>) -> Result<(), String> {
    let mut cache = state
        .retrieval_cache
        .write()
        .map_err(|_| "获取检索缓存写锁失败".to_string())?;
    cache.clear();
    Ok(())
}

#[tauri::command]
pub async fn kb_retrieval_cache_stats(state: State<'_, KnowledgeState>) -> Result<usize, String> {
    let cache = state
        .retrieval_cache
        .read()
        .map_err(|_| "获取检索缓存读锁失败".to_string())?;
    Ok(cache.len())
}
