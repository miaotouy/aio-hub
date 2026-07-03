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

use crate::knowledge::core::{RetrievalEngine, SearchResult};
use crate::knowledge::index::InMemoryDatabase;
use crate::knowledge::search::{
    BlenderRetrievalEngine, KeywordRetrievalEngine, LensRetrievalEngine, VectorRetrievalEngine,
};
use crate::knowledge::tag_pool::GlobalTagPoolManager;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

pub type EmbeddingCache = HashMap<String, (Vec<f32>, u64)>;

/// 缓存的检索结果（含可选查询向量）
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedRetrievalEntry {
    pub results: Vec<SearchResult>,
    pub vector: Option<Vec<f32>>,
}

/// Key 为 SHA-256 字符串，Value 为 (结果, 最后访问时间戳)
pub type RetrievalCache = HashMap<String, (CachedRetrievalEntry, u64)>;

pub struct KnowledgeState {
    // 互斥锁保护，防止并发写入导致冲突
    pub lock: Mutex<()>,
    /// 内存数据库
    pub imdb: Arc<RwLock<InMemoryDatabase>>,
    /// 检索算法引擎列表，支持热切换
    pub engines: Vec<Box<dyn RetrievalEngine>>,
    /// 全局标签向量池
    pub tag_pool: GlobalTagPoolManager,
    /// 全局 Embedding 缓存 (Key 为 model_id + text 的哈希值，Value 为 (向量, 最后访问时间戳))
    pub embedding_cache: Arc<RwLock<EmbeddingCache>>,
    /// 全局 RAG 检索结果缓存（不按 session 隔离）
    pub retrieval_cache: Arc<RwLock<RetrievalCache>>,
}

impl KnowledgeState {
    pub fn new() -> Self {
        // 注册默认引擎
        let engines: Vec<Box<dyn RetrievalEngine>> = vec![
            Box::new(KeywordRetrievalEngine::new()),
            Box::new(VectorRetrievalEngine::new()),
            Box::new(LensRetrievalEngine::new()),
            Box::new(BlenderRetrievalEngine::new()),
        ];

        Self {
            lock: Mutex::new(()),
            imdb: Arc::new(RwLock::new(InMemoryDatabase::new())),
            engines,
            tag_pool: GlobalTagPoolManager::new(),
            embedding_cache: Arc::new(RwLock::new(HashMap::new())),
            retrieval_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn get_engine(&self, id: &str) -> Option<&dyn RetrievalEngine> {
        self.engines
            .iter()
            .find(|e| e.id() == id)
            .map(|e| e.as_ref())
    }
}

impl Default for KnowledgeState {
    fn default() -> Self {
        Self::new()
    }
}
