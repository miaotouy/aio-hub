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

use crate::recall::retrieval_cache;
pub use crate::recall::retrieval_cache::RetrievalCacheInput;
use crate::recall::state::{CachedRetrievalEntry, RecallState};
use tauri::State;

#[tauri::command]
pub async fn recall_retrieval_cache_get(
    state: State<'_, RecallState>,
    input: RetrievalCacheInput,
) -> Result<Option<CachedRetrievalEntry>, String> {
    let mut cache = state
        .retrieval_cache
        .write()
        .map_err(|_| "获取检索缓存写锁失败".to_string())?;
    Ok(retrieval_cache::get(&mut cache, &input))
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
    retrieval_cache::set(&mut cache, &input, entry, max_items);
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
