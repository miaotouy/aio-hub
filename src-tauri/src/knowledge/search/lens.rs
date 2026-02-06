/// 算法灵感来自 Lionsky
use crate::knowledge::core::{
    QueryPayload, RetrievalContext, RetrievalEngine, RetrievalEngineInfo, SearchFilters,
    SearchResult,
};
use crate::knowledge::tag_sea::TagSea;
use nalgebra::{DMatrix, DVector};
use std::collections::HashMap;
use uuid::Uuid;

pub struct LensRetrievalEngine;

impl LensRetrievalEngine {
    pub fn new() -> Self {
        Self
    }
}

impl RetrievalEngine for LensRetrievalEngine {
    fn id(&self) -> &str {
        "lens"
    }

    fn info(&self) -> RetrievalEngineInfo {
        RetrievalEngineInfo {
            id: self.id().to_string(),
            name: "透镜检索".to_string(),
            description:
                "基于光学透镜现象的多阶段检索算法，通过标签折射和图谱编织实现精准上下文感知搜索。"
                    .to_string(),
            icon: Some("lucide:telescope".to_string()),
            supported_payload_types: vec!["vector".to_string()],
            requires_embedding: true,
            parameters: vec![
                serde_json::json!({
                    "id": "texture",
                    "label": "检索纹理",
                    "component": "ElRadioGroup",
                    "modelPath": "texture",
                    "defaultValue": "coarse",
                    "hint": "颗粒 (Coarse) 聚焦核心关联，纤维 (Fine) 引入更多语义扩散",
                    "props": {
                        "type": "button",
                        "size": "small",
                        "class": "full-width-radio"
                    },
                    "options": [
                        { "label": "颗粒 (Coarse)", "value": "coarse" },
                        { "label": "纤维 (Fine)", "value": "fine" }
                    ]
                }),
                serde_json::json!({
                    "id": "refractionIndex",
                    "label": "折射率 ({{ (localSettings.vectorIndex.refractionIndex * 100).toFixed(0) }}%)",
                    "component": "SliderWithInput",
                    "modelPath": "refractionIndex",
                    "defaultValue": 0.5,
                    "hint": "控制标签约束的引力强度",
                    "props": {
                        "min": 0,
                        "max": 1,
                        "step": 0.05,
                        "size": "small"
                    }
                }),
                serde_json::json!({
                    "id": "limit",
                    "label": "检索数量 (Top-K: {{ localSettings.vectorIndex.limit }})",
                    "component": "SliderWithInput",
                    "modelPath": "limit",
                    "defaultValue": 20,
                    "hint": "返回最相关的结果条数",
                    "props": {
                        "min": 1,
                        "max": 100,
                        "step": 1,
                        "size": "small"
                    }
                }),
                serde_json::json!({
                    "id": "minScore",
                    "label": "最低相关性分数 ({{ (localSettings.vectorIndex.minScore * 100).toFixed(0) }}%)",
                    "component": "SliderWithInput",
                    "modelPath": "minScore",
                    "defaultValue": 0.0,
                    "hint": "过滤掉分数低于此值的检索结果",
                    "props": {
                        "min": 0,
                        "max": 1,
                        "step": 0.01,
                        "size": "small"
                    }
                }),
            ],
        }
    }

    fn search(
        &self,
        payload: &QueryPayload,
        filters: &SearchFilters,
        context: &RetrievalContext,
    ) -> Result<Vec<SearchResult>, String> {
        let (query_vector, model) = match payload {
            QueryPayload::Vector {
                vector,
                model,
                query: _,
            } => (vector, model),
            _ => {
                log::warn!("[LENS_SEARCH] 载荷类型不匹配，透镜搜索需要 Vector 载荷");
                return Ok(vec![]);
            }
        };

        log::info!(
            "[LENS_SEARCH] 开始透镜检索: model={}, dim={}, top_k={:?}",
            model,
            query_vector.len(),
            filters.limit
        );

        let imdb = context.db.read().map_err(|_| "获取内存数据库读锁失败")?;
        let mut all_results = Vec::new();
        let mut kb_min_scores = std::collections::HashMap::new();

        // 获取标签池
        let pool_lock = match context
            .tag_pool_manager
            .get_pool(&context.app_data_dir, model)
        {
            Ok(lock) => lock,
            Err(_) => return Ok(vec![]),
        };

        // 确保索引已构建
        {
            let mut pool = pool_lock.write().map_err(|_| "获取标签池写锁失败")?;
            if pool.index.is_none() && !pool.registry.is_empty() {
                log::info!("[LENS_SEARCH] 标签池索引为空，尝试自动重建...");
                pool.rebuild_index();
            }
        }

        let tag_pool = pool_lock.read().map_err(|_| "获取标签池读锁失败")?.clone();

        for (kb_id, base_lock) in &imdb.bases {
            // 过滤器：知识库 ID
            if let Some(ref kb_ids) = filters.kb_ids {
                if !kb_ids.contains(kb_id) {
                    continue;
                }
            }

            let mut base = base_lock.write().map_err(|_| "获取知识库写锁失败")?;

            // 获取库级别配置覆盖
            if let Some(min_score) = base
                .meta
                .config
                .get("minScore")
                .and_then(|v| v.as_f64())
                .map(|v| v as f32)
            {
                kb_min_scores.insert(*kb_id, min_score);
            }

            let kb_search_top_k = base
                .meta
                .config
                .get("searchTopK")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);

            // 检查模型是否匹配，如果不匹配且 query_model 不为空，尝试按需加载
            // 注意：透镜检索主要依赖标签池向量，条目向量仅作为补充（当前版本甚至未直接使用条目向量进行距离计算）
            // 因此即使条目向量加载失败，也不应跳过该知识库
            if base.vector_store.model_id != *model && !model.is_empty() {
                log::info!(
                    "[LENS_SEARCH] 模型不匹配，尝试按需加载条目向量: kb={}, current={}, target={}",
                    kb_id,
                    base.vector_store.model_id,
                    model
                );

                if let Ok(Some((vectors, dimension, total_tokens))) =
                    crate::knowledge::ops::load_vectors_to_vec(&context.app_data_dir, *kb_id, model)
                {
                    log::info!(
                        "[LENS_SEARCH] 按需加载条目向量成功: kb={}, count={}, dim={}, tokens={}",
                        kb_id,
                        vectors.len(),
                        dimension,
                        total_tokens
                    );
                    base.vector_store
                        .rebuild(model.clone(), dimension, total_tokens, vectors);
                } else {
                    log::debug!(
                        "[LENS_SEARCH] 磁盘未发现条目匹配向量，但透镜检索将继续使用标签关联: kb={}, target={}",
                        kb_id,
                        model
                    );
                }
            }

            // 构建 TagSea
            let tag_sea = TagSea::build(&base, tag_pool.clone());
            log::debug!(
                "[LENS_SEARCH] TagSea 构建完成: kb={}, tags={}, relations={}",
                kb_id,
                tag_sea.tag_pool.registry.len(),
                tag_sea.tag_to_caiu_weights.len()
            );

            // 执行透镜检索算法流程
            let mut kb_results = self.execute_lens_pipeline(
                query_vector,
                filters,
                &tag_sea,
                &base,
                *kb_id,
                base.meta.name.clone(),
            )?;

            // 应用库级别 TopK 截断
            kb_results.sort_by(|a, b| {
                b.score
                    .partial_cmp(&a.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            if let Some(limit) = kb_search_top_k {
                kb_results.truncate(limit);
            }
            all_results.extend(kb_results);
        }

        // 全局评分归一化与去重
        all_results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // 归一化分数：透镜检索的能量传播值通常很小，需要进行归一化处理
        // 使用简单的线性归一化，让最高分接近 1.0
        if !all_results.is_empty() {
            let max_score = all_results[0].score;
            if max_score > 0.0 {
                for result in all_results.iter_mut() {
                    result.score /= max_score;
                }
            }
        }

        // 应用库级别或全局的最小分数过滤 (归一化后执行)
        all_results.retain(|r| {
            // 优先使用库级别配置，其次是全局过滤器
            let effective_min_score = kb_min_scores.get(&r.kb_id).cloned().or(filters.min_score);
            if let Some(min_score) = effective_min_score {
                if r.score < min_score {
                    return false;
                }
            }
            true
        });

        let total_found = all_results.len();
        let limit = filters.limit.unwrap_or(20);
        let final_results: Vec<_> = all_results.into_iter().take(limit).collect();

        log::info!(
            "[LENS_SEARCH] 检索完成: 总命中={}, 返回={}, 归一化后最高分={:?}",
            total_found,
            final_results.len(),
            final_results.first().map(|r| r.score)
        );

        Ok(final_results)
    }
}

impl LensRetrievalEngine {
    /// 执行透镜检索核心流水线
    fn execute_lens_pipeline(
        &self,
        query_vector: &[f32],
        filters: &SearchFilters,
        tag_sea: &TagSea,
        base: &crate::knowledge::index::db::InMemoryBase,
        kb_id: Uuid,
        kb_name: String,
    ) -> Result<Vec<SearchResult>, String> {
        // Phase 1: 上下文投射 (Context Projection)
        // 计算投影向量：当前查询向量 + 衰减后的历史消息向量
        let mut projected_vector = query_vector.to_vec();
        if let Some(history) = &filters.history_vectors {
            let tau = 0.5; // 衰减系数
            for (i, h_vec) in history.iter().rev().enumerate() {
                let decay = (-tau * (i as f32 + 1.0)).exp();
                for (j, val) in h_vec.iter().enumerate() {
                    if j < projected_vector.len() {
                        projected_vector[j] += val * decay;
                    }
                }
            }
            // 重新归一化
            let norm: f32 = projected_vector.iter().map(|v| v * v).sum::<f32>().sqrt();
            if norm > 0.0 {
                for v in projected_vector.iter_mut() {
                    *v /= norm;
                }
            }
        }

        // Phase 2: 透镜折射 (Lens Refraction)
        // 核心逻辑：如果没有显式约束标签，则从空间中寻找最近的“语义引力点”进行自动折射
        let mut refracted_vector = projected_vector;
        if let Some(required_tags) = &filters.required_tags {
            if !required_tags.is_empty() {
                if let Some(lens_center) = tag_sea.compute_lens_center(required_tags) {
                    let refraction_index = filters.refraction_index.unwrap_or(0.6);
                    refracted_vector =
                        self.apply_refraction(&refracted_vector, &lens_center, refraction_index);
                }
            }
        } else {
            // 自动折射：寻找最近的 3 个标签作为临时引力中心
            let auto_neighbors = tag_sea.tag_pool.search_neighbors(&refracted_vector, 3);
            if !auto_neighbors.is_empty() {
                let mut auto_tags = Vec::new();
                for (idx, _) in auto_neighbors {
                    if let Some(name) = tag_sea.tag_pool.get_tag_name(idx) {
                        auto_tags.push(name.clone());
                    }
                }
                if let Some(lens_center) = tag_sea.compute_lens_center(&auto_tags) {
                    // 自动折射率较低，保持灵活性
                    refracted_vector = self.apply_refraction(&refracted_vector, &lens_center, 0.3);
                }
            }
        }

        // Phase 3: 图谱编织 (Graph Weaving)
        // 捕获 80 个邻居节点
        let neighbors = tag_sea.tag_pool.search_neighbors(&refracted_vector, 80);
        if neighbors.is_empty() {
            log::warn!("[LENS_PIPELINE] 图谱编织失败：未找到邻居标签");
            return Ok(vec![]);
        }
        log::debug!("[LENS_PIPELINE] 命中邻居标签数: {}", neighbors.len());

        // 构建亲和力矩阵 A
        let n = neighbors.len();
        let mut affinity_matrix = DMatrix::zeros(n, n);
        let texture = filters.texture.as_deref().unwrap_or("coarse");

        for i in 0..n {
            for j in 0..n {
                let (idx_i, _) = neighbors[i];
                let (idx_j, _) = neighbors[j];

                let vec_i = tag_sea.tag_pool.get_vector(idx_i).ok_or("获取向量失败")?;
                let vec_j = tag_sea.tag_pool.get_vector(idx_j).ok_or("获取向量失败")?;

                let mut sim = self.cosine_similarity(vec_i, vec_j);

                // 质感处理 (Texture Processing)
                sim = if texture == "fine" {
                    sim.sqrt() // 纤维感 (Fine)
                } else {
                    sim.powi(2) // 颗粒感 (Coarse)
                };

                affinity_matrix[(i, j)] = sim;
            }
        }

        // Phase 4: 空间反转 (Space Inversion)
        let mut laplacian = DMatrix::zeros(n, n);
        for i in 0..n {
            let row_sum: f32 = affinity_matrix.row(i).sum();
            for j in 0..n {
                if i == j {
                    laplacian[(i, j)] = row_sum - affinity_matrix[(i, j)];
                } else {
                    laplacian[(i, j)] = -affinity_matrix[(i, j)];
                }
            }
        }

        // 使用 SVD 计算正则化伪逆 (L^T L + λI)^{-1} L^T
        // 实际上对于拉普拉斯矩阵，直接对 L 进行 SVD 更稳
        let lambda = 0.01;
        let l_t_l = laplacian.transpose() * &laplacian;
        let n_dim = l_t_l.nrows();
        let mut target_matrix = l_t_l;
        for i in 0..n_dim {
            target_matrix[(i, i)] += lambda;
        }

        let svd = target_matrix.svd(true, true);
        let inversion_matrix = svd
            .solve(&laplacian.transpose(), 1e-6)
            .map_err(|_| "SVD 求解失败")?;

        let mut initial_energy = DVector::zeros(n);
        for i in 0..n {
            let (_, sim) = neighbors[i];
            initial_energy[i] = sim;
        }

        let propagated_energy = inversion_matrix * initial_energy;
        log::debug!("[LENS_PIPELINE] 空间反转能量传播完成");

        // Phase 5: 内容汇聚 (Content Convergence)
        let mut caiu_scores: HashMap<Uuid, f32> = HashMap::new();
        for i in 0..n {
            let (tag_idx, _) = neighbors[i];
            let tag_name = tag_sea
                .tag_pool
                .get_tag_name(tag_idx)
                .ok_or("获取标签名失败")?;
            let energy = propagated_energy[i];

            if let Some(associated_caius) = tag_sea.tag_to_caiu_weights.get(tag_name) {
                for (caiu_id, weight) in associated_caius {
                    let score = caiu_scores.entry(*caiu_id).or_insert(0.0);
                    *score += energy * weight;
                }
            }
        }

        // 转换为 SearchResult
        let mut results = Vec::new();
        for (caiu_id, score) in caiu_scores {
            if let Some(caiu) = base.entries.get(&caiu_id) {
                if filters.enabled_only.unwrap_or(true) && !caiu.enabled {
                    continue;
                }

                results.push(SearchResult {
                    caiu: caiu.clone(),
                    score,
                    match_type: "lens".to_string(),
                    kb_id,
                    kb_name: kb_name.clone(),
                    highlight: None,
                });
            }
        }

        Ok(results)
    }

    fn apply_refraction(&self, vector: &[f32], center: &[f32], index: f32) -> Vec<f32> {
        let mut refracted: Vec<f32> = vector
            .iter()
            .zip(center.iter())
            .map(|(v, c)| (1.0 - index) * v + index * c)
            .collect();

        // 归一化 (Normalize)
        let norm: f32 = refracted.iter().map(|v| v * v).sum::<f32>().sqrt();
        if norm > 0.0 {
            for v in refracted.iter_mut() {
                *v /= norm;
            }
        }
        refracted
    }

    fn cosine_similarity(&self, v1: &[f32], v2: &[f32]) -> f32 {
        let dot_product: f32 = v1.iter().zip(v2.iter()).map(|(a, b)| a * b).sum();
        let norm_v1: f32 = v1.iter().map(|v| v * v).sum::<f32>().sqrt();
        let norm_v2: f32 = v2.iter().map(|v| v * v).sum::<f32>().sqrt();

        if norm_v1 > 0.0 && norm_v2 > 0.0 {
            dot_product / (norm_v1 * norm_v2)
        } else {
            0.0
        }
    }
}
