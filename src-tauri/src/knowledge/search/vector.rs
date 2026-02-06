use crate::knowledge::core::{RetrievalContext, RetrievalEngine, SearchFilters, SearchResult};
use std::collections::HashMap;
use uuid::Uuid;

pub struct VectorRetrievalEngine {
    /// BM25-like 参数：饱和度参数，控制相关性的衰减
    k1: f32,
    /// BM25-like 参数：长度归一化参数 (0.0 - 1.0)
    b: f32,
}

impl VectorRetrievalEngine {
    pub fn new() -> Self {
        Self { k1: 1.2, b: 0.75 }
    }
}

impl RetrievalEngine for VectorRetrievalEngine {
    fn id(&self) -> &str {
        "vector"
    }

    fn info(&self) -> crate::knowledge::core::RetrievalEngineInfo {
        crate::knowledge::core::RetrievalEngineInfo {
            id: self.id().to_string(),
            name: "向量检索".to_string(),
            description: "基于 Embedding 的语义空间相似度检索，处理同义词或模糊意图。".to_string(),
            icon: Some("lucide:brain".to_string()),
            supported_payload_types: vec!["vector".to_string()],
            requires_embedding: true,
            parameters: vec![
                serde_json::json!({
                    "id": "vectorK1",
                    "label": "饱和度 (k1: {{ localSettings.vectorIndex.k1 }})",
                    "component": "SliderWithInput",
                    "modelPath": "k1",
                    "defaultValue": 1.2,
                    "hint": "BM25 风格参数：控制词频饱和度，通常为 1.2。值越大，高频词的影响力越持久。",
                    "props": {
                        "min": 0.0,
                        "max": 10.0,
                        "step": 0.1,
                        "size": "small"
                    }
                }),
                serde_json::json!({
                    "id": "vectorB",
                    "label": "长度归一化 (b: {{ localSettings.vectorIndex.b }})",
                    "component": "SliderWithInput",
                    "modelPath": "b",
                    "defaultValue": 0.75,
                    "hint": "BM25 风格参数：控制文档长度对评分的影响 (0.0 - 1.0)。0 表示不考虑长度，1 表示完全归一化。",
                    "props": {
                        "min": 0.0,
                        "max": 1.0,
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
        payload: &crate::knowledge::core::QueryPayload,
        filters: &SearchFilters,
        context: &RetrievalContext,
    ) -> Result<Vec<SearchResult>, String> {
        use crate::knowledge::core::QueryPayload;
        let (query_vector, model, raw_query) = match payload {
            QueryPayload::Vector {
                vector,
                model,
                query,
            } => (vector, model, query),
            _ => {
                log::warn!("[VECTOR_SEARCH] 载荷类型不匹配，向量搜索需要 Vector 载荷");
                return Ok(vec![]);
            }
        };

        log::info!(
            "[VECTOR_SEARCH] 开始向量检索: model={}, dim={}, top_k={:?}",
            model,
            query_vector.len(),
            filters.limit
        );

        let raw_query_lower = raw_query
            .as_ref()
            .map(|q| q.to_lowercase())
            .unwrap_or_default();

        let imdb = context.db.read().map_err(|_| "获取内存数据库读锁失败")?;
        let mut results = Vec::new();
        let top_k = filters.limit.unwrap_or(10);

        // 获取标签池用于辅助检索
        let tag_pool = context
            .tag_pool_manager
            .get_pool(&context.app_data_dir, model)
            .ok()
            .and_then(|lock| lock.read().ok().map(|guard| guard.clone()));

        for (kb_id, base_lock) in &imdb.bases {
            // 过滤器：知识库 ID
            if let Some(ref kb_ids) = filters.kb_ids {
                if !kb_ids.contains(kb_id) {
                    continue;
                }
            }

            let mut base = base_lock.write().map_err(|_| "获取知识库写锁失败")?;

            // 获取库级别配置覆盖
            let kb_min_score = base
                .meta
                .config
                .get("minScore")
                .and_then(|v| v.as_f64())
                .map(|v| v as f32);

            let kb_search_top_k = base
                .meta
                .config
                .get("searchTopK")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);

            // 检查模型是否匹配，如果不匹配且 query_model 不为空，尝试按需加载
            if base.vector_store.model_id != *model && !model.is_empty() {
                log::info!(
                    "[VECTOR_SEARCH] 模型不匹配，尝试按需加载: kb={}, current={}, target={}",
                    kb_id,
                    base.vector_store.model_id,
                    model
                );

                match crate::knowledge::ops::load_vectors_to_vec(
                    &context.app_data_dir,
                    *kb_id,
                    model,
                ) {
                    Ok(Some((vectors, dimension, total_tokens))) => {
                        log::info!(
                            "[VECTOR_SEARCH] 按需加载向量成功: kb={}, count={}, dim={}, tokens={}",
                            kb_id,
                            vectors.len(),
                            dimension,
                            total_tokens
                        );
                        base.vector_store
                            .rebuild(model.clone(), dimension, total_tokens, vectors);
                    }
                    _ => {
                        log::debug!(
                            "[VECTOR_SEARCH] 磁盘未发现匹配向量，跳过: kb={}, target={}",
                            kb_id,
                            model
                        );
                        continue;
                    }
                }
            }

            // 使用连续内存进行并行计算
            let dimension = base.vector_store.dimension;

            // 标签辅助召回 (Tag-First Strategy): 即使内容向量未就绪，标签海也能提供检索能力
            let mut tag_scores: HashMap<Uuid, f32> = HashMap::new();
            if let Some(ref pool) = tag_pool {
                let neighbors = pool.search_neighbors(query_vector, 40);
                for (tag_idx, tag_sim) in neighbors {
                    if let Some(tag_name) = pool.get_tag_name(tag_idx) {
                        // 寻找拥有此标签的条目
                        for caiu in base.entries.values() {
                            if caiu.tags.iter().any(|t| t.name == *tag_name)
                                || caiu.core_tags.iter().any(|t| t.name == *tag_name)
                            {
                                let entry_score = tag_scores.entry(caiu.id).or_insert(0.0);
                                if tag_sim > *entry_score {
                                    *entry_score = tag_sim;
                                }
                            }
                        }
                    }
                }
            }

            // 如果内容向量存储为空，但标签检索有结果，直接返回标签召回结果
            if dimension == 0 {
                log::warn!(
                    "[VECTOR_SEARCH] 知识库向量存储为空，使用纯标签召回: kb={}",
                    kb_id
                );
                for (caiu_id, tag_score) in tag_scores {
                    if let Some(caiu) = base.entries.get(&caiu_id) {
                        if filters.enabled_only.unwrap_or(true) && !caiu.enabled {
                            continue;
                        }
                        if tag_score > 0.5 {
                            results.push(SearchResult {
                                caiu: caiu.clone(),
                                score: tag_score * 0.8,
                                match_type: "tag_vector".to_string(),
                                kb_id: *kb_id,
                                kb_name: base.meta.name.clone(),
                                highlight: None,
                            });
                        }
                    }
                }
                continue;
            }
            if dimension != query_vector.len() {
                log::error!(
                    "[VECTOR_SEARCH] 维度不匹配，跳过: kb={}, base_dim={}, query_dim={}",
                    kb_id,
                    dimension,
                    query_vector.len()
                );
                continue;
            }

            use rayon::prelude::*;

            // 计算平均文档长度（字符数），用于长度归一化
            let avg_doc_len = if !base.entries.is_empty() {
                base.entries
                    .values()
                    .map(|e| e.content.len())
                    .sum::<usize>() as f32
                    / base.entries.len() as f32
            } else {
                500.0
            };

            // 并行计算相似度并应用 BM25 风格的长度奖励/惩罚
            let scores: Vec<(Uuid, f32)> = base
                .vector_store
                .ids
                .par_iter()
                .enumerate()
                .filter_map(|(i, id)| {
                    let start = i * dimension;
                    let end = start + dimension;
                    let stored_vec = &base.vector_store.data[start..end];
                    let cos_sim = cosine_similarity(query_vector, stored_vec);

                    // 基础过滤：优先使用库级别配置，其次是全局过滤器
                    let effective_min_score = kb_min_score.or(filters.min_score);
                    if let Some(min_score) = effective_min_score {
                        if cos_sim < min_score * 0.6 {
                            return None;
                        } // 向量检索允许稍低的基础分，后面会加权
                    }

                    let doc_len = base.entries.get(id).map(|e| e.content.len()).unwrap_or(0) as f32;

                    // 优先使用 filters 中的参数，否则回退到引擎默认值
                    let k1 = filters.k1.unwrap_or(self.k1);
                    let b = filters.b.unwrap_or(self.b);

                    // 仿 BM25 长度归一化因子
                    let l_factor = 1.0 - b + b * (doc_len / avg_doc_len);

                    // 调整后的得分：将余弦相似度映射到非线性空间，并结合长度因子
                    // 这样可以避免长文本仅仅因为包含更多词而在向量空间中获得不公平的优势（或劣势）
                    let adjusted_score = (cos_sim * (k1 + 1.0)) / (cos_sim + k1 * l_factor);

                    Some((*id, adjusted_score))
                })
                .collect();

            // 处理向量匹配结果，并融合标签评分
            let mut matched_ids = std::collections::HashSet::new();
            let mut kb_results = Vec::new();

            for (caiu_id, vector_score) in scores {
                if let Some(caiu) = base.entries.get(&caiu_id) {
                    if filters.enabled_only.unwrap_or(true) && !caiu.enabled {
                        continue;
                    }

                    // 综合评分：内容向量相似度 (80%) + 标签引力权重 (20%)
                    // 向量检索应当以内容为主，标签作为微调
                    let tag_score = tag_scores.get(&caiu_id).cloned().unwrap_or(0.0);

                    // 引入优先级加权
                    let priority_boost = (caiu.priority as f32 / 100.0).log10().max(0.0) * 0.1;

                    // 字面量匹配加成 (Hybrid Boost)
                    let mut literal_boost = 0.0;
                    if !raw_query_lower.is_empty() {
                        if caiu.key.to_lowercase().contains(&raw_query_lower) {
                            literal_boost += 0.2; // 标题匹配加成
                        }
                        if caiu.content.to_lowercase().contains(&raw_query_lower) {
                            literal_boost += 0.05; // 内容匹配加成
                        }
                    }

                    let final_score =
                        vector_score * 0.8 + tag_score * 0.2 + priority_boost + literal_boost;

                    kb_results.push(SearchResult {
                        caiu: caiu.clone(),
                        score: final_score,
                        match_type: "vector".to_string(),
                        kb_id: *kb_id,
                        kb_name: base.meta.name.clone(),
                        highlight: None,
                    });
                    matched_ids.insert(caiu_id);
                }
            }

            // 兜底逻辑：对于只有标签匹配但没有向量匹配（或向量未生成）的条目
            for (caiu_id, tag_score) in tag_scores {
                if matched_ids.contains(&caiu_id) {
                    continue;
                }

                if let Some(caiu) = base.entries.get(&caiu_id) {
                    if filters.enabled_only.unwrap_or(true) && !caiu.enabled {
                        continue;
                    }

                    // 纯标签召回：阈值 0.5，权重 0.6
                    if tag_score > 0.5 {
                        kb_results.push(SearchResult {
                            caiu: caiu.clone(),
                            score: tag_score * 0.6,
                            match_type: "tag_vector".to_string(),
                            kb_id: *kb_id,
                            kb_name: base.meta.name.clone(),
                            highlight: None,
                        });
                    }
                }
            }

            // 应用库级别 TopK 截断
            kb_results.sort_by(|a, b| {
                b.score
                    .partial_cmp(&a.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            if let Some(limit) = kb_search_top_k {
                kb_results.truncate(limit);
            }
            results.extend(kb_results);
        }

        results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // 改进的归一化策略
        if !results.is_empty() {
            let max_score = results[0].score;
            let min_score = results.last().map(|r| r.score).unwrap_or(0.0);
            let range = max_score - min_score;

            for result in results.iter_mut() {
                // 如果分数超过 1.0 (由于 Boost)，进行平滑压缩
                if result.score > 1.0 {
                    result.score = 1.0 - (1.0 / (result.score + 0.5));
                }

                // 确保分数在合理区间，并保留区分度
                if range > 0.001 {
                    // 稍微拉开差距，让 Top 1 更显著
                    let relative_pos = (result.score - min_score) / range;
                    result.score = result.score * 0.9 + relative_pos * 0.1;
                }
            }
        }

        let final_results: Vec<_> = results.into_iter().take(top_k).collect();
        log::info!(
            "[VECTOR_SEARCH] 检索完成: 命中总数={}, 返回数={}, 最高分={:?}",
            final_results.len(),
            final_results.len(),
            final_results.first().map(|r| r.score)
        );

        Ok(final_results)
    }
}

/// 计算余弦相似度
pub fn cosine_similarity(v1: &[f32], v2: &[f32]) -> f32 {
    let dot_product: f32 = v1.iter().zip(v2.iter()).map(|(a, b)| a * b).sum();
    let norm_v1: f32 = v1.iter().map(|v| v * v).sum::<f32>().sqrt();
    let norm_v2: f32 = v2.iter().map(|v| v * v).sum::<f32>().sqrt();

    if norm_v1 > 0.0 && norm_v2 > 0.0 {
        dot_product / (norm_v1 * norm_v2)
    } else {
        0.0
    }
}
