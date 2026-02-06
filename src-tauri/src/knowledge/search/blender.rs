use crate::knowledge::core::{
    QueryPayload, RetrievalContext, RetrievalEngine, RetrievalEngineInfo, SearchFilters,
    SearchResult,
};
use crate::knowledge::search::vector::cosine_similarity;
use crate::knowledge::tag_pool::ModelTagPool;
use crate::knowledge::tag_sea::TagSea;
use crate::knowledge::utils::{project_onto, projection_coeff, vec_norm_sq, vec_subtract};
use jieba_rs::Jieba;
use lazy_static::lazy_static;
use std::collections::HashMap;
use uuid::Uuid;

lazy_static! {
    static ref JIEBA: Jieba = Jieba::new();
}

pub struct BlenderRetrievalEngine {
    max_residual_layers: usize,
    k_per_layer: usize,
    layer_decay: f32,
    energy_threshold: f32,
}

impl BlenderRetrievalEngine {
    pub fn new() -> Self {
        Self {
            max_residual_layers: 4,
            k_per_layer: 5,
            layer_decay: 0.7,
            energy_threshold: 0.1,
        }
    }

    /// 残差挖掘：递归提取语义向量中的标签投影
    fn residual_mining(
        &self,
        query_vector: &[f32],
        tag_pool: &ModelTagPool,
        max_layers: usize,
        layer_decay: f32,
    ) -> Vec<(String, f32, usize)> {
        let mut residual = query_vector.to_vec();
        let original_energy = vec_norm_sq(query_vector);
        let mut activated_tags = Vec::new();

        if original_energy < 1e-10 {
            return activated_tags;
        }

        for layer in 0..max_layers {
            // 检查残差能量比
            if vec_norm_sq(&residual) / original_energy < self.energy_threshold {
                break;
            }

            let neighbors = tag_pool.search_neighbors(&residual, self.k_per_layer);
            if neighbors.is_empty() {
                break;
            }

            let mut layer_residual_reduction = vec![0.0; residual.len()];

            for (tag_idx, similarity) in neighbors {
                if let (Some(tag_vec), Some(tag_name)) =
                    (tag_pool.get_vector(tag_idx), tag_pool.get_tag_name(tag_idx))
                {
                    let coeff = projection_coeff(&residual, tag_vec);
                    let weight = coeff.abs() * similarity * layer_decay.powi(layer as i32);

                    activated_tags.push((tag_name.clone(), weight, layer));

                    // 累积本层投影分量以便从残差中减去
                    let proj = project_onto(&residual, tag_vec);
                    for (r, p) in layer_residual_reduction.iter_mut().zip(proj) {
                        *r += p;
                    }
                }
            }

            // 更新残差
            residual = vec_subtract(&residual, &layer_residual_reduction);
        }

        activated_tags
    }
}

impl RetrievalEngine for BlenderRetrievalEngine {
    fn id(&self) -> &str {
        "blender"
    }

    fn info(&self) -> RetrievalEngineInfo {
        RetrievalEngineInfo {
            id: self.id().to_string(),
            name: "融合检索".to_string(),
            description: "基于残差挖掘与多信号共振的融合检索引擎".to_string(),
            icon: Some("lucide:blend".to_string()),
            supported_payload_types: vec!["vector".to_string()],
            requires_embedding: true,
            parameters: vec![
                serde_json::json!({
                    "id": "limit",
                    "label": "检索数量 (Top-K)",
                    "component": "SliderWithInput",
                    "modelPath": "limit",
                    "defaultValue": 20,
                    "props": { "min": 1, "max": 100, "step": 1, "size": "small" }
                }),
                serde_json::json!({
                    "id": "minScore",
                    "label": "最低分数",
                    "component": "SliderWithInput",
                    "modelPath": "minScore",
                    "defaultValue": 0.0,
                    "props": { "min": 0, "max": 1, "step": 0.01, "size": "small" }
                }),
                serde_json::json!({
                    "id": "maxResidualLayers",
                    "label": "残差深度",
                    "component": "SliderWithInput",
                    "modelPath": "maxResidualLayers",
                    "defaultValue": 4,
                    "hint": "残差挖掘最大深度",
                    "props": { "min": 1, "max": 8, "step": 1, "size": "small" }
                }),
                serde_json::json!({
                    "id": "layerDecay",
                    "label": "层衰减系数",
                    "component": "SliderWithInput",
                    "modelPath": "layerDecay",
                    "defaultValue": 0.7,
                    "hint": "每层衰减系数",
                    "props": { "min": 0.1, "max": 1.0, "step": 0.05, "size": "small" }
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
        let (query_vector, model, raw_query) = match payload {
            QueryPayload::Vector {
                vector,
                model,
                query,
            } => (vector, model, query),
            _ => {
                log::warn!("[BLENDER_SEARCH] 载荷类型不匹配，Blender 搜索需要 Vector 载荷");
                return Ok(vec![]);
            }
        };

        log::info!(
            "[BLENDER_SEARCH] 开始融合检索: model={}, dim={}, query={:?}",
            model,
            query_vector.len(),
            raw_query
        );

        let imdb = context.db.read().map_err(|_| "获取内存数据库读锁失败")?;
        let mut all_results = Vec::new();

        // 获取标签池
        let tag_pool_lock = context
            .tag_pool_manager
            .get_pool(&context.app_data_dir, model)
            .ok();

        // 确保标签池索引已构建 (如果存在)
        if let Some(ref lock) = tag_pool_lock {
            let mut pool = lock.write().map_err(|_| "获取标签池写锁失败")?;
            if pool.index.is_none() && !pool.registry.is_empty() {
                pool.rebuild_index();
            }
        }

        let tag_pool = tag_pool_lock.and_then(|lock| lock.read().ok().map(|g| g.clone()));

        // 获取引擎参数
        let max_layers = filters
            .extra
            .get("maxResidualLayers")
            .and_then(|v| v.as_u64())
            .map(|v| v as usize)
            .unwrap_or(self.max_residual_layers);

        let layer_decay = filters
            .extra
            .get("layerDecay")
            .and_then(|v| v.as_f64())
            .map(|v| v as f32)
            .unwrap_or(self.layer_decay);

        let limit = filters.limit.unwrap_or(20);
        let min_score = filters.min_score.unwrap_or(0.0);

        for (kb_id, base_lock) in &imdb.bases {
            if let Some(ref kb_ids) = filters.kb_ids {
                if !kb_ids.contains(kb_id) {
                    continue;
                }
            }

            let mut base = base_lock.write().map_err(|_| "获取知识库写锁失败")?;

            // 检查模型并按需加载向量
            if base.vector_store.model_id != *model && !model.is_empty() {
                if let Ok(Some((vectors, dimension, total_tokens))) =
                    crate::knowledge::ops::load_vectors_to_vec(&context.app_data_dir, *kb_id, model)
                {
                    base.vector_store
                        .rebuild(model.clone(), dimension, total_tokens, vectors);
                }
            }

            // --- Phase 1: 信号发射 ---

            // 1a. Literal Signal
            let mut literal_scores: HashMap<Uuid, f32> = HashMap::new();
            if let Some(ref q_text) = raw_query {
                // 文本索引搜索
                let text_results = base.text_index.search(q_text);
                for (id, score) in text_results {
                    literal_scores.insert(id, score);
                }

                // 标题匹配加成
                let q_lower = q_text.to_lowercase();
                for caiu in base.entries.values() {
                    let key_lower = caiu.key.to_lowercase();
                    if key_lower == q_lower {
                        *literal_scores.entry(caiu.id).or_insert(0.0) += 10.0;
                    } else if key_lower.contains(&q_lower) {
                        *literal_scores.entry(caiu.id).or_insert(0.0) += 5.0;
                    }
                }
            }

            // 1b. Semantic Signal
            let mut semantic_scores: HashMap<Uuid, f32> = HashMap::new();
            let dimension = base.vector_store.dimension;
            if dimension > 0 && dimension == query_vector.len() {
                use rayon::prelude::*;

                let avg_doc_len = if !base.entries.is_empty() {
                    base.entries
                        .values()
                        .map(|e| e.content.len())
                        .sum::<usize>() as f32
                        / base.entries.len() as f32
                } else {
                    500.0
                };

                let k1 = 1.2;
                let b = 0.75;

                let s_results: Vec<(Uuid, f32)> = base
                    .vector_store
                    .ids
                    .par_iter()
                    .enumerate()
                    .filter_map(|(i, id)| {
                        let start = i * dimension;
                        let end = start + dimension;
                        let stored_vec = &base.vector_store.data[start..end];
                        let sim = cosine_similarity(query_vector, stored_vec);

                        let doc_len =
                            base.entries.get(id).map(|e| e.content.len()).unwrap_or(0) as f32;
                        let l_factor = 1.0 - b + b * (doc_len / avg_doc_len);
                        let adjusted_score = (sim * (k1 + 1.0)) / (sim + k1 * l_factor);

                        Some((*id, adjusted_score))
                    })
                    .collect();

                for (id, score) in s_results {
                    semantic_scores.insert(id, score);
                }
            }

            // 1c. Gravitational Signal
            let mut gravitational_scores: HashMap<Uuid, f32> = HashMap::new();
            if let Some(ref pool) = tag_pool {
                // Phase 2: 残差挖掘
                let activated_tags =
                    self.residual_mining(query_vector, pool, max_layers, layer_decay);

                // 标签->条目映射 (TagSea)
                let tag_sea = TagSea::build(&base, pool.clone());
                for (tag_name, tag_weight, _layer) in activated_tags {
                    if let Some(caiu_list) = tag_sea.tag_to_caiu_weights.get(&tag_name) {
                        for (caiu_id, caiu_tag_weight) in caiu_list {
                            let idf = tag_sea
                                .tag_entropy_weights
                                .get(&tag_name)
                                .cloned()
                                .unwrap_or(1.0);
                            *gravitational_scores.entry(*caiu_id).or_insert(0.0) +=
                                tag_weight * caiu_tag_weight * idf;
                        }
                    }
                }
            }

            // --- Phase 3: 蛛网共振 ---
            let mut candidates: std::collections::HashSet<Uuid> =
                literal_scores.keys().cloned().collect();
            candidates.extend(semantic_scores.keys().cloned());
            candidates.extend(gravitational_scores.keys().cloned());

            let query_word_count = if let Some(ref q) = raw_query {
                JIEBA.cut(q, false).len()
            } else {
                0
            };
            let entropy = (query_word_count as f32 / 10.0).min(1.0);

            let (w_literal, w_semantic, w_gravity);
            if raw_query.is_some() {
                w_literal = 0.4 * (1.0 - entropy) + 0.1 * entropy;
                w_semantic = 0.2 * (1.0 - entropy) + 0.5 * entropy;
                w_gravity = 0.4 * (1.0 - entropy) + 0.4 * entropy;
            } else {
                w_literal = 0.0;
                w_semantic = 0.55;
                w_gravity = 0.45;
            }

            let max_literal = literal_scores
                .values()
                .cloned()
                .fold(0.0f32, f32::max)
                .max(1e-10);
            let max_semantic = semantic_scores
                .values()
                .cloned()
                .fold(0.0f32, f32::max)
                .max(1e-10);
            let max_gravity = gravitational_scores
                .values()
                .cloned()
                .fold(0.0f32, f32::max)
                .max(1e-10);

            let mut kb_results = Vec::new();
            for id in candidates {
                let caiu = match base.entries.get(&id) {
                    Some(c) => c,
                    None => continue,
                };

                if filters.enabled_only.unwrap_or(true) && !caiu.enabled {
                    continue;
                }

                let l_score = literal_scores.get(&id).copied().unwrap_or(0.0);
                let s_score = semantic_scores.get(&id).copied().unwrap_or(0.0);
                let g_score = gravitational_scores.get(&id).copied().unwrap_or(0.0);

                let mut activation_count = 0;
                if l_score > 0.0 {
                    activation_count += 1;
                }
                if s_score > 0.3 {
                    activation_count += 1;
                }
                if g_score > 0.0 {
                    activation_count += 1;
                }

                let resonance_boost = match activation_count {
                    3 => 1.3,
                    2 => 1.1,
                    1 => 0.9,
                    _ => 0.0,
                };

                if resonance_boost <= 0.0 {
                    continue;
                }

                let norm_literal = l_score / max_literal;
                let norm_semantic = s_score / max_semantic;
                let norm_gravity = g_score / max_gravity;

                let priority_boost = (caiu.priority as f32 / 100.0).log10().max(0.0) * 0.1;

                let final_score = (w_literal * norm_literal
                    + w_semantic * norm_semantic
                    + w_gravity * norm_gravity)
                    * resonance_boost
                    * (1.0 + priority_boost);

                kb_results.push(SearchResult {
                    caiu: caiu.clone(),
                    score: final_score,
                    match_type: "blender".to_string(),
                    kb_id: *kb_id,
                    kb_name: base.meta.name.clone(),
                    highlight: None,
                });
            }

            // 库级别截断
            kb_results.sort_by(|a, b| {
                b.score
                    .partial_cmp(&a.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            let kb_search_top_k = base
                .meta
                .config
                .get("searchTopK")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);
            if let Some(k) = kb_search_top_k {
                kb_results.truncate(k);
            }
            all_results.extend(kb_results);
        }

        // --- Phase 4: 坍缩输出 ---
        all_results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        if !all_results.is_empty() {
            let max_score = all_results[0].score;
            if max_score > 0.0 {
                for r in all_results.iter_mut() {
                    r.score /= max_score;
                }
            }
        }

        let final_results: Vec<_> = all_results
            .into_iter()
            .filter(|r| r.score >= min_score)
            .take(limit)
            .collect();

        log::info!(
            "[BLENDER_SEARCH] 检索完成: 命中总数={}, 返回数={}, 最高分={:?}",
            final_results.len(),
            final_results.len(),
            final_results.first().map(|r| r.score)
        );

        Ok(final_results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::knowledge::core::Caiu;

    #[test]
    fn test_blender_engine_info() {
        let engine = BlenderRetrievalEngine::new();
        let info = engine.info();
        assert_eq!(info.id, "blender");
        assert!(info.parameters.len() >= 4);
    }

    #[test]
    fn test_priority_boost_logic() {
        // 验证 priority_boost 是否按预期工作 (乘法增强)
        let caiu = Caiu {
            id: Uuid::new_v4(),
            key: "test".to_string(),
            content: "content".to_string(),
            summary: String::new(),
            core_tags: vec![],
            tags: vec![],
            assets: vec![],
            priority: 200, // log10(200/100) * 0.1 = log10(2) * 0.1 ≈ 0.03
            enabled: true,
            created_at: 0,
            updated_at: 0,
            error_message: None,
            content_hash: None,
            refs: vec![],
            ref_by: vec![],
        };

        let resonance_boost = 1.3;
        let score_sum = 0.8; // w*norm 累加值

        let priority_boost = (caiu.priority as f32 / 100.0).log10().max(0.0) * 0.1;
        let final_score = score_sum * resonance_boost * (1.0 + priority_boost);

        assert!(final_score > score_sum * resonance_boost);
        println!("Final score with priority boost: {}", final_score);
    }
}
