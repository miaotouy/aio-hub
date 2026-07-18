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

use crate::recall::core::{RecallResult, RetrievalEngine};
use crate::recall::index::InMemoryDatabase;
use crate::recall::ops::warmup_recall_repository;
use crate::recall::search::{
    AssociativeRecallEngine, BlenderRetrievalEngine, KeywordRetrievalEngine, LensRetrievalEngine,
    SemanticRecallEngine, VectorRetrievalEngine,
};
use crate::recall::storage::{RecallRepository, SqliteRecallRepository};
use crate::recall::tag_pool::GlobalTagPoolManager;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, RwLock};

pub type EmbeddingCache = HashMap<String, (Vec<f32>, u64)>;

/// 缓存的检索结果（含可选查询向量）
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedRetrievalEntry {
    pub results: Vec<RecallResult>,
    pub vector: Option<Vec<f32>>,
}

/// Key 为 SHA-256 字符串，Value 为 (结果, 最后访问时间戳)
pub type RetrievalCache = HashMap<String, (CachedRetrievalEntry, u64)>;

pub struct RecallState {
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
    /// Recall SQLite 持久化真源，由 Tauri 应用启动周期初始化。
    pub repository: Arc<RwLock<Option<Arc<dyn RecallRepository>>>>,
}

impl RecallState {
    pub fn new() -> Self {
        // 注册默认引擎
        let engines: Vec<Box<dyn RetrievalEngine>> = vec![
            Box::new(KeywordRetrievalEngine::new()),
            Box::new(VectorRetrievalEngine::new()),
            Box::new(LensRetrievalEngine::new()),
            Box::new(BlenderRetrievalEngine::new()),
            Box::new(SemanticRecallEngine::new()),
            Box::new(AssociativeRecallEngine::new()),
        ];

        Self {
            lock: Mutex::new(()),
            imdb: Arc::new(RwLock::new(InMemoryDatabase::new())),
            engines,
            tag_pool: GlobalTagPoolManager::new(),
            embedding_cache: Arc::new(RwLock::new(HashMap::new())),
            retrieval_cache: Arc::new(RwLock::new(HashMap::new())),
            repository: Arc::new(RwLock::new(None)),
        }
    }

    /// 幂等初始化 SQLite repository 并从持久化真源恢复内存读模型。
    pub fn initialize(&self, app_data_dir: &Path) -> Result<(), String> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "获取 Recall 初始化锁失败".to_string())?;

        if self
            .repository
            .read()
            .map_err(|_| "获取 Recall repository 读锁失败".to_string())?
            .is_some()
        {
            return Ok(());
        }

        let repository = SqliteRecallRepository::new(app_data_dir);
        repository.initialize()?;
        warmup_recall_repository(&repository, &self.imdb, &self.tag_pool)?;

        let mut slot = self
            .repository
            .write()
            .map_err(|_| "获取 Recall repository 写锁失败".to_string())?;
        *slot = Some(Arc::new(repository));
        Ok(())
    }

    pub fn repository(&self) -> Result<Arc<dyn RecallRepository>, String> {
        self.repository
            .read()
            .map_err(|_| "获取 Recall repository 读锁失败".to_string())?
            .clone()
            .ok_or_else(|| "Recall repository 尚未初始化".to_string())
    }

    pub fn get_engine(&self, id: &str) -> Option<&dyn RetrievalEngine> {
        self.engines
            .iter()
            .find(|e| e.id() == id)
            .map(|e| e.as_ref())
    }
}

impl Default for RecallState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn initialization_is_idempotent() {
        let directory = tempdir().unwrap();
        let state = RecallState::new();

        state.initialize(directory.path()).unwrap();
        let first = state.repository().unwrap();
        state.initialize(directory.path()).unwrap();
        let second = state.repository().unwrap();

        assert!(Arc::ptr_eq(&first, &second));
        assert!(first.main_db_path().is_file());
        assert!(first.vector_db_path().is_file());
    }
}
