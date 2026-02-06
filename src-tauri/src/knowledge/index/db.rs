use super::inverted_index::TextInvertedIndex;
use super::vector_matrix::VectorMatrix;
use crate::knowledge::core::{Caiu, CaiuIndexItem, KnowledgeBaseMeta};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use uuid::Uuid;

/// 内存数据库根结构
pub struct InMemoryDatabase {
    /// 所有的知识库，按 ID 索引
    pub bases: HashMap<Uuid, Arc<RwLock<InMemoryBase>>>,
}

impl InMemoryDatabase {
    pub fn new() -> Self {
        Self {
            bases: HashMap::new(),
        }
    }
}

/// 知识库实例的内存表示
pub struct InMemoryBase {
    pub meta: KnowledgeBaseMeta,
    /// 是否已完成全量内容加载 (entries/*.json)
    pub is_fully_loaded: bool,
    /// 原始条目存储：ID -> Caiu (全量缓存)
    pub entries: HashMap<Uuid, Caiu>,
    /// 快速 Key 索引：Key -> ID (用于处理 [[Key]] 引用)
    pub key_to_id: HashMap<String, Uuid>,
    /// 文本索引系统 (用于 Keyword 引擎)
    pub text_index: TextInvertedIndex,
    /// 向量存储系统 (用于基础 Vector 引擎)
    #[allow(dead_code)]
    pub vector_store: VectorMatrix,
}

impl InMemoryBase {
    pub fn new(meta: KnowledgeBaseMeta) -> Self {
        Self {
            meta,
            is_fully_loaded: false,
            entries: HashMap::new(),
            key_to_id: HashMap::new(),
            text_index: TextInvertedIndex::new(),
            vector_store: VectorMatrix::new(),
        }
    }

    /// 增量同步一个条目
    pub fn sync_entry(&mut self, caiu: Caiu) {
        let id = caiu.id;

        // 1. 更新 Key 映射
        if !caiu.key.is_empty() {
            self.key_to_id.insert(caiu.key.clone(), id);
        }

        // 2. 更新文本索引
        self.text_index.index_caiu(&caiu);

        // 3. 更新元数据中的索引项 (保持同步)
        // 注意：条目内容加载不应覆盖索引中的 vector_status
        // 但我们需要根据内存中已加载的向量库状态进行实时补偿
        let is_vectorized = self.vector_store.ids.contains(&id);
        let current_model = self.vector_store.model_id.clone();

        if let Some(pos) = self.meta.entries.iter().position(|e| e.id == id) {
            let existing = &mut self.meta.entries[pos];
            existing.key = caiu.key.clone();
            existing.summary = caiu.summary.clone();
            existing.tags = caiu.tags.iter().map(|t| t.name.clone()).collect();
            existing.priority = caiu.priority;
            existing.updated_at = caiu.updated_at;

            // 如果内容哈希变了，说明内容已更新，向量状态失效
            // 注意：只有当两个哈希都存在且不相等时，才视为内容变动
            // 如果新加载的条目没有哈希（可能是旧数据），我们保守地保留索引中的状态
            let content_changed = match (&existing.content_hash, &caiu.content_hash) {
                (Some(h1), Some(h2)) => h1 != h2,
                _ => false, // 任何一个哈希缺失，都不主动降级状态
            };

            if content_changed {
                log::info!(
                    "[KB_SYNC] 条目内容变动，重置向量状态: {} ({} -> {})",
                    id,
                    existing.content_hash.as_deref().unwrap_or("none"),
                    caiu.content_hash.as_deref().unwrap_or("none")
                );
                existing.content_hash = caiu.content_hash.clone();
                existing.vector_status = "none".to_string();
                existing.vectorized_models.clear();
            } else if is_vectorized {
                // 如果内容没变，且内存中已有向量，确保状态为 ready
                existing.vector_status = "ready".to_string();
                if !current_model.is_empty() && !existing.vectorized_models.contains(&current_model)
                {
                    existing.vectorized_models.push(current_model);
                }
            }
        } else {
            // 新条目
            let status = if is_vectorized {
                "ready".to_string()
            } else {
                "none".to_string()
            };
            let vectorized_models = if is_vectorized && !current_model.is_empty() {
                vec![current_model]
            } else {
                vec![]
            };

            let index_item = CaiuIndexItem {
                id: caiu.id,
                key: caiu.key.clone(),
                summary: caiu.summary.clone(),
                tags: caiu.tags.iter().map(|t| t.name.clone()).collect(),
                priority: caiu.priority,
                updated_at: caiu.updated_at,
                vector_status: status,
                content_hash: caiu.content_hash.clone(),
                vectorized_models,
                total_tokens: 0,
            };
            self.meta.entries.push(index_item);
        }

        // 4. 更新原始存储
        self.entries.insert(id, caiu);
    }

    /// 获取包含条目索引的元数据
    pub fn get_meta_with_entries(&self) -> KnowledgeBaseMeta {
        // 无论是否全量加载，都直接返回 meta
        // - 未加载时：meta.entries 来自 meta.json 的反序列化
        // - 已加载时：meta.entries 在 sync_entry 时已实时更新
        self.meta.clone()
    }

    /// 根据当前加载的向量矩阵刷新所有索引项的状态
    /// 返回是否有状态发生了改变
    pub fn refresh_vector_status(&mut self) -> bool {
        let current_model = self.vector_store.model_id.clone();
        if current_model.is_empty() {
            return false;
        }

        let mut changed = false;
        for entry in &mut self.meta.entries {
            if self.vector_store.ids.contains(&entry.id) {
                if entry.vector_status != "ready" {
                    entry.vector_status = "ready".to_string();
                    changed = true;
                }
                if !entry.vectorized_models.contains(&current_model) {
                    entry.vectorized_models.push(current_model.clone());
                    changed = true;
                }
            }
        }
        changed
    }

    /// 删除一个条目
    pub fn remove_entry(&mut self, id: &Uuid) {
        // 1. 从条目详情缓存中移除
        if let Some(caiu) = self.entries.remove(id) {
            // 2. 从 Key 索引中移除
            if !caiu.key.is_empty() {
                self.key_to_id.remove(&caiu.key);
            }
            // 3. 从文本倒排索引中移除
            self.text_index.remove_caiu(id);
            // 4. 从向量矩阵中移除
            self.vector_store.remove_vector(id);
            // 5. 从元数据索引列表中移除
            self.meta.entries.retain(|e| e.id != *id);
        }
    }
}
