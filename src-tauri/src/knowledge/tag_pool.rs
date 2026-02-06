use crate::knowledge::io::get_model_tag_pool_dir;
use hnsw_rs::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, RwLock};

/// 模型特定的标签池
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct ModelTagPool {
    /// 模型标识
    pub model_id: String,
    /// 标签文本 -> 索引 ID
    pub registry: HashMap<String, usize>,
    /// 索引 ID -> 标签文本 (反向映射，用于搜索结果转换)
    #[serde(default)]
    pub id_to_name: Vec<String>,
    /// 向量维度
    pub dimension: usize,
    /// 展平的向量数据
    pub vectors: Vec<f32>,
    /// HNSW 索引（不序列化）
    #[serde(skip)]
    pub index: Option<Arc<Hnsw<'static, f32, DistCosine>>>,
}

impl std::fmt::Debug for ModelTagPool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ModelTagPool")
            .field("model_id", &self.model_id)
            .field("registry_len", &self.registry.len())
            .field("dimension", &self.dimension)
            .field("vectors_len", &self.vectors.len())
            .field("has_index", &self.index.is_some())
            .finish()
    }
}

impl ModelTagPool {
    pub fn new(model_id: String) -> Self {
        Self {
            model_id,
            ..Default::default()
        }
    }

    /// 加载模型标签池
    pub fn load(app_data_dir: &Path, model_id: &str) -> Result<Self, String> {
        let pool_dir = get_model_tag_pool_dir(app_data_dir, model_id);
        let registry_path = pool_dir.join("registry.json");
        let vectors_path = pool_dir.join("vectors.bin");

        if !registry_path.exists() {
            return Ok(Self::new(model_id.to_string()));
        }

        let registry_json = fs::read_to_string(registry_path).map_err(|e| e.to_string())?;
        let registry: HashMap<String, usize> =
            serde_json::from_str(&registry_json).map_err(|e| e.to_string())?;

        let mut vectors = Vec::new();
        let mut dimension = 0;
        if vectors_path.exists() {
            let bytes = fs::read(vectors_path).map_err(|e| e.to_string())?;
            // 假设是 f32 的原始字节
            vectors = bytes
                .chunks_exact(4)
                .map(|chunk| f32::from_le_bytes(chunk.try_into().unwrap()))
                .collect();

            if !registry.is_empty() {
                dimension = vectors.len() / registry.len();
                if vectors.len() % registry.len() != 0 {
                    log::error!(
                        "[TagPool] 向量数据长度与注册表不匹配: {} / {}",
                        vectors.len(),
                        registry.len()
                    );
                }
            }
        }

        // 构建反向映射
        let mut id_to_name = vec![String::new(); registry.len()];
        for (name, &idx) in &registry {
            if idx < id_to_name.len() {
                id_to_name[idx] = name.clone();
            }
        }

        let pool = Self {
            model_id: model_id.to_string(),
            registry,
            id_to_name,
            dimension,
            vectors,
            index: None,
        };
        log::info!("[TagPool] 已从磁盘加载标签数据: {} ({} 个标签)", model_id, pool.registry.len());
        Ok(pool)
    }

    /// 保存模型标签池
    pub fn save(&self, app_data_dir: &Path) -> Result<(), String> {
        let pool_dir = get_model_tag_pool_dir(app_data_dir, &self.model_id);
        fs::create_dir_all(&pool_dir).map_err(|e| e.to_string())?;

        let registry_path = pool_dir.join("registry.json");
        let vectors_path = pool_dir.join("vectors.bin");

        let registry_json =
            serde_json::to_string_pretty(&self.registry).map_err(|e| e.to_string())?;
        fs::write(registry_path, registry_json).map_err(|e| e.to_string())?;

        let bytes: Vec<u8> = self
            .vectors
            .iter()
            .flat_map(|&f| f.to_le_bytes().to_vec())
            .collect();
        fs::write(vectors_path, bytes).map_err(|e| e.to_string())?;

        Ok(())
    }

    /// 同步一批标签向量（不立即重建索引）
    pub fn sync_vectors(&mut self, pairs: Vec<(String, Vec<f32>)>) {
        for (tag, vector) in pairs {
            if self.dimension == 0 {
                self.dimension = vector.len();
            }
            if vector.len() != self.dimension {
                log::warn!(
                    "[TagPool] 向量维度不匹配: expected {}, got {}",
                    self.dimension,
                    vector.len()
                );
                continue;
            }

            if let Some(&idx) = self.registry.get(&tag) {
                // 更新现有向量
                let start = idx * self.dimension;
                let end = start + self.dimension;
                self.vectors[start..end].copy_from_slice(&vector);
            } else {
                // 添加新标签
                let idx = self.registry.len();
                self.registry.insert(tag.clone(), idx);
                self.id_to_name.push(tag);
                self.vectors.extend_from_slice(&vector);
            }
        }
        // 标记索引需要重建，但不立即执行
        self.index = None;
    }

    /// 检查缺失的标签
    pub fn get_missing_tags(&self, tags: Vec<String>) -> Vec<String> {
        tags.into_iter()
            .filter(|t| !self.registry.contains_key(t))
            .collect()
    }

    /// 重建 HNSW 索引
    pub fn rebuild_index(&mut self) {
        if self.registry.is_empty() || self.dimension == 0 {
            self.index = None;
            return;
        }

        log::info!("[TagPool] 开始构筑 HNSW 索引: {} ({} 个标签)", self.model_id, self.registry.len());
        let start_time = std::time::Instant::now();

        let max_elements = self.registry.len();
        let m = 16;
        let ef_construction = 200;

        let hnsw = Hnsw::new(m, max_elements, 16, ef_construction, DistCosine);

        // 准备数据
        // hnsw_rs 要求数据为 &Vec<T>
        let data: Vec<Vec<f32>> = self
            .registry
            .values()
            .map(|&idx| {
                let start = idx * self.dimension;
                self.vectors[start..start + self.dimension].to_vec()
            })
            .collect();

        let ids: Vec<usize> = self.registry.values().cloned().collect();
        let refs: Vec<(&Vec<f32>, usize)> = data.iter().zip(ids.iter()).map(|(v, &id)| (v, id)).collect();

        hnsw.parallel_insert(&refs);
        self.index = Some(Arc::new(hnsw));
        log::info!("[TagPool] HNSW 索引构筑完成，耗时: {:?}", start_time.elapsed());
    }

    /// 搜索邻居
    #[allow(dead_code)]
    pub fn search_neighbors(&self, query_vector: &[f32], k: usize) -> Vec<(usize, f32)> {
        let Some(index) = &self.index else {
            return Vec::new();
        };

        let ef_search = k.max(50);
        let results = index.search(query_vector, k, ef_search);

        results
            .into_iter()
            .map(|res| (res.d_id, res.distance))
            .collect()
    }

    /// 获取指定索引的向量
    pub fn get_vector(&self, idx: usize) -> Option<&[f32]> {
        if self.dimension == 0 {
            return None;
        }
        let start = idx * self.dimension;
        let end = start + self.dimension;
        if end <= self.vectors.len() {
            Some(&self.vectors[start..end])
        } else {
            None
        }
    }

    /// 获取指定索引的标签名
    pub fn get_tag_name(&self, idx: usize) -> Option<&String> {
        self.id_to_name.get(idx)
    }
}

/// 全局标签池管理器
#[derive(Clone)]
pub struct GlobalTagPoolManager {
    /// 当前加载的模型池 (模型 ID -> 池)
    pub pools: Arc<RwLock<HashMap<String, Arc<RwLock<ModelTagPool>>>>>,
}

impl GlobalTagPoolManager {
    pub fn new() -> Self {
        Self {
            pools: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 获取模型池的引用
    pub fn get_pool(
        &self,
        app_data_dir: &Path,
        model_id: &str,
    ) -> Result<Arc<RwLock<ModelTagPool>>, String> {
        // 1. 先尝试读锁
        {
            let pools = self.pools.read().map_err(|_| "获取池读锁失败")?;
            if let Some(pool) = pools.get(model_id) {
                return Ok(pool.clone());
            }
        }

        // 2. 读锁没命中，上写锁进行加载
        let mut pools = self.pools.write().map_err(|_| "获取池写锁失败")?;
        // 二次检查，防止并发加载
        if let Some(pool) = pools.get(model_id) {
            return Ok(pool.clone());
        }

        let pool = ModelTagPool::load(app_data_dir, model_id)?;
        let pool_arc = Arc::new(RwLock::new(pool));
        pools.insert(model_id.to_string(), pool_arc.clone());
        Ok(pool_arc)
    }
}
