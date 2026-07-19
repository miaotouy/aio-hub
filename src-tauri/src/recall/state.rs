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
use crate::recall::storage::{LegacyFileRecallImporter, RecallRepository, SqliteRecallRepository};
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
        let importer = LegacyFileRecallImporter::new(app_data_dir, repository.clone());
        if importer.has_legacy_source() {
            let report = importer.import()?;
            if report.main_status != "completed" {
                return Err(format!(
                    "旧 Recall 主数据迁移未完整完成（集合 {}/{}, 条目 {}/{}, 跳过 {}, 问题 {}），已阻止进入可写态",
                    report.migrated_collections,
                    report.source_collections,
                    report.migrated_entries,
                    report.source_entries,
                    report.skipped_entries,
                    report.issues.len()
                ));
            }
            if report.vector_status != "completed" {
                log::warn!(
                    "[Recall] 旧向量迁移未完整完成，Recall 将使用已迁移主数据并等待向量重建: {}/{} migrated, {} pending, {} issues",
                    report.migrated_vectors,
                    report.source_vectors,
                    report.pending_vectors,
                    report.issues.len()
                );
            } else {
                log::info!(
                    "[Recall] 旧数据迁移完成: {} collections, {} entries, {} vectors",
                    report.migrated_collections,
                    report.migrated_entries,
                    report.migrated_vectors
                );
            }
        }
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

    pub fn clear_retrieval_cache(&self) -> Result<(), String> {
        self.retrieval_cache
            .write()
            .map_err(|_| "获取检索缓存写锁失败".to_string())?
            .clear();
        Ok(())
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
    use crate::recall::core::{RecallCollectionMeta, RecallEntry, VectorizationMeta};
    use crate::recall::io::{get_recall_dir, get_recall_entries_dir};
    use std::fs;
    use tempfile::tempdir;
    use uuid::Uuid;

    fn write_legacy_collection(app_data_dir: &Path) -> (Uuid, Uuid) {
        let recall_id = Uuid::new_v4();
        let entry_id = Uuid::new_v4();
        let meta = RecallCollectionMeta {
            id: recall_id,
            name: "旧集合".to_string(),
            description: None,
            created_at: 1,
            updated_at: 2,
            author: None,
            vectorization: VectorizationMeta {
                is_indexed: false,
                last_indexed_at: None,
                model_used: String::new(),
                dimension: 0,
                total_tokens: 0,
            },
            models: Vec::new(),
            tags: Vec::new(),
            icon: None,
            entries: Vec::new(),
            config: serde_json::json!({}),
        };
        let entry = RecallEntry {
            id: entry_id,
            key: "legacy-key".to_string(),
            content: "legacy-content".to_string(),
            summary: "legacy-summary".to_string(),
            core_tags: Vec::new(),
            tags: Vec::new(),
            assets: Vec::new(),
            priority: 100,
            enabled: true,
            created_at: 3,
            updated_at: 4,
            error_message: None,
            content_hash: Some("legacy-hash".to_string()),
            refs: Vec::new(),
            ref_by: Vec::new(),
        };
        let entries_dir = get_recall_entries_dir(app_data_dir, &recall_id.to_string());
        fs::create_dir_all(&entries_dir).unwrap();
        fs::write(
            get_recall_dir(app_data_dir, &recall_id.to_string()).join("meta.json"),
            serde_json::to_vec(&meta).unwrap(),
        )
        .unwrap();
        fs::write(
            entries_dir.join(format!("{entry_id}.json")),
            serde_json::to_vec(&entry).unwrap(),
        )
        .unwrap();
        (recall_id, entry_id)
    }

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

    #[test]
    fn initialization_migrates_legacy_data_before_warmup() {
        let directory = tempdir().unwrap();
        let (recall_id, entry_id) = write_legacy_collection(directory.path());
        let state = RecallState::new();

        state.initialize(directory.path()).unwrap();

        let repository = state.repository().unwrap();
        assert_eq!(
            repository
                .load_entry(recall_id, entry_id)
                .unwrap()
                .unwrap()
                .content,
            "legacy-content"
        );
        assert!(state.imdb.read().unwrap().bases.contains_key(&recall_id));
        let report = LegacyFileRecallImporter::new(
            directory.path(),
            SqliteRecallRepository::new(directory.path()),
        )
        .inspect()
        .unwrap()
        .unwrap();
        assert_eq!(report.main_status, "completed");

        let restarted_state = RecallState::new();
        restarted_state.initialize(directory.path()).unwrap();
        assert_eq!(
            restarted_state
                .repository()
                .unwrap()
                .load_entry(recall_id, entry_id)
                .unwrap()
                .unwrap()
                .content,
            "legacy-content"
        );
    }

    #[test]
    fn initialization_blocks_write_state_after_partial_main_migration() {
        let directory = tempdir().unwrap();
        let invalid_collection = get_recall_dir(directory.path(), &Uuid::new_v4().to_string());
        fs::create_dir_all(&invalid_collection).unwrap();
        fs::write(invalid_collection.join("meta.json"), b"not-json").unwrap();
        let state = RecallState::new();

        let error = state.initialize(directory.path()).unwrap_err();

        assert!(error.contains("已阻止进入可写态"));
        assert!(state.repository().is_err());
    }

    #[test]
    fn clearing_retrieval_cache_removes_cached_results() {
        let state = RecallState::new();
        state.retrieval_cache.write().unwrap().insert(
            "cached".to_string(),
            (
                CachedRetrievalEntry {
                    results: Vec::new(),
                    vector: None,
                },
                1,
            ),
        );

        state.clear_retrieval_cache().unwrap();

        assert!(state.retrieval_cache.read().unwrap().is_empty());
    }
}
