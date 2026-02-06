use std::sync::{Arc, Mutex, RwLock};
use crate::knowledge::index::InMemoryDatabase;
use crate::knowledge::core::RetrievalEngine;
use crate::knowledge::tag_pool::GlobalTagPoolManager;
use crate::knowledge::search::{KeywordRetrievalEngine, VectorRetrievalEngine, LensRetrievalEngine, BlenderRetrievalEngine};

pub struct KnowledgeState {
    // 互斥锁保护，防止并发写入导致冲突
    pub lock: Mutex<()>,
    /// 内存数据库
    pub imdb: Arc<RwLock<InMemoryDatabase>>,
    /// 检索算法引擎列表，支持热切换
    pub engines: Vec<Box<dyn RetrievalEngine>>,
    /// 全局标签向量池
    pub tag_pool: GlobalTagPoolManager,
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