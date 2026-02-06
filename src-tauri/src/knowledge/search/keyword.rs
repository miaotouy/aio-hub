use crate::knowledge::core::{RetrievalContext, RetrievalEngine, SearchFilters, SearchResult};

pub struct KeywordRetrievalEngine;

impl KeywordRetrievalEngine {
    pub fn new() -> Self {
        Self
    }
}

impl RetrievalEngine for KeywordRetrievalEngine {
    fn id(&self) -> &str {
        "keyword"
    }

    fn info(&self) -> crate::knowledge::core::RetrievalEngineInfo {
        crate::knowledge::core::RetrievalEngineInfo {
            id: self.id().to_string(),
            name: "关键词检索".to_string(),
            description: "基于倒排索引的传统关键词匹配检索，精确查询字面匹配项。".to_string(),
            icon: Some("lucide:search".to_string()),
            supported_payload_types: vec!["text".to_string()],
            requires_embedding: false,
            parameters: vec![
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
        let query = match payload {
            crate::knowledge::core::QueryPayload::Text(t) => t,
            _ => return Ok(vec![]),
        };

        log::info!("[KEYWORD_SEARCH] 开始检索: query='{}'", query);

        let imdb = context.db.read().map_err(|_| "获取内存数据库读锁失败")?;
        let mut results = Vec::new();
        let query_lower = query.to_lowercase();
        let mut kb_min_scores = std::collections::HashMap::new();

        for (kb_id, base_lock) in &imdb.bases {
            // 过滤器：知识库 ID
            if let Some(ref kb_ids) = filters.kb_ids {
                if !kb_ids.contains(kb_id) {
                    continue;
                }
            }

            let base = base_lock.read().map_err(|_| "获取知识库读锁失败")?;

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

            // 使用倒排索引获取候选集
            let candidate_ids = base.text_index.search(query);
            log::debug!(
                "[KEYWORD_SEARCH] 知识库候选命中: kb={}, count={}",
                kb_id,
                candidate_ids.len()
            );

            let mut kb_results = Vec::new();
            for (caiu_id, score_from_index) in candidate_ids {
                if let Some(caiu) = base.entries.get(&caiu_id) {
                    // 过滤器：仅启用
                    if filters.enabled_only.unwrap_or(true) && !caiu.enabled {
                        continue;
                    }

                    // 过滤器：标签
                    if let Some(ref filter_tags) = filters.tags {
                        let has_tag = caiu.tags.iter().any(|t| filter_tags.contains(&t.name))
                            || caiu.core_tags.iter().any(|t| filter_tags.contains(&t.name));
                        if !has_tag {
                            continue;
                        }
                    }

                    let mut score = score_from_index;

                    // 额外的 Key 匹配加权 (倒排索引可能已经处理了，但这里可以做精确加权)
                    if caiu.key.to_lowercase().contains(&query_lower) {
                        score += 10.0;
                    }
                    let highlight = Some(extract_highlight(&caiu.content, &query_lower));
                    kb_results.push(SearchResult {
                        caiu: caiu.clone(),
                        score,
                        match_type: "keyword".to_string(),
                        kb_id: *kb_id,
                        kb_name: base.meta.name.clone(),
                        highlight,
                    });
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

        // 排序
        results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // 归一化分数：使用 log 缩放将词频分数压缩到 0-1 范围
        // 这样可以让关键词检索的分数与向量检索的相似度在量级上更接近
        if !results.is_empty() {
            let max_score = results[0].score;
            if max_score > 0.0 {
                for result in results.iter_mut() {
                    // 使用 log(1 + score) / log(1 + max_score) 进行非线性归一化
                    // 这样可以压缩高分，同时保持相对排序
                    result.score = (1.0 + result.score).ln() / (1.0 + max_score).ln();
                }
            }
        }

        // 应用库级别或全局的最小分数过滤 (归一化后执行)
        results.retain(|r| {
            // 优先使用库级别配置，其次是全局过滤器
            let effective_min_score = kb_min_scores.get(&r.kb_id).cloned().or(filters.min_score);
            if let Some(min_score) = effective_min_score {
                if r.score < min_score {
                    return false;
                }
            }
            true
        });

        // 限制数量
        let total_found = results.len();
        if let Some(limit) = filters.limit {
            results.truncate(limit);
        }

        log::info!(
            "[KEYWORD_SEARCH] 检索完成: 总命中={}, 返回={}, 归一化后最高分={:?}",
            total_found,
            results.len(),
            results.first().map(|r| r.score)
        );

        Ok(results)
    }
}

fn extract_highlight(content: &str, query_lower: &str) -> String {
    let content_lower = content.to_lowercase();

    if let Some(pos) = content_lower.find(query_lower) {
        let start = pos.saturating_sub(30);
        let end = std::cmp::min(content.len(), pos + query_lower.len() + 60);

        // 确保不会在字符中间截断 (UTF-8 安全)
        let mut start_idx = start;
        while start_idx > 0 && !content.is_char_boundary(start_idx) {
            start_idx -= 1;
        }
        let mut end_idx = end;
        while end_idx < content.len() && !content.is_char_boundary(end_idx) {
            end_idx += 1;
        }

        let mut snippet = content[start_idx..end_idx].to_string();
        if start_idx > 0 {
            snippet = format!("...{}", snippet);
        }
        if end_idx < content.len() {
            snippet = format!("{}...", snippet);
        }
        snippet
    } else {
        content.chars().take(100).collect()
    }
}
