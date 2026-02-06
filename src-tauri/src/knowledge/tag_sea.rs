use crate::knowledge::index::db::InMemoryBase;
use crate::knowledge::tag_pool::ModelTagPool;
use std::collections::HashMap;
use uuid::Uuid;

/// TagSea: 标签海，整合了向量空间、关联权重和语法权重的数据结构
#[allow(dead_code)]
pub struct TagSea {
    /// 模型标签池引用
    pub tag_pool: ModelTagPool,
    /// 标签名 -> 关联的 CAIU ID 及权重
    pub tag_to_caiu_weights: HashMap<String, Vec<(Uuid, f32)>>,
    /// 标签名 -> 静态语法权重
    pub tag_syntax_weights: HashMap<String, f32>,
    /// 标签名 -> 信息熵权重 (IDF-like)
    pub tag_entropy_weights: HashMap<String, f32>,
}

impl TagSea {
    /// 从内存库和标签池构建 TagSea
    #[allow(dead_code)]
    pub fn build(base: &InMemoryBase, tag_pool: ModelTagPool) -> Self {
        let mut tag_to_caiu_weights: HashMap<String, Vec<(Uuid, f32)>> = HashMap::new();
        let mut tag_syntax_weights: HashMap<String, f32> = HashMap::new();
        let total_caius = base.entries.len() as f32;

        for caiu in base.entries.values() {
            // 合并 core_tags 和普通 tags
            let all_tags = caiu.core_tags.iter().chain(caiu.tags.iter());
            for tag_ref in all_tags {
                // 1. 提取关联权重 (使用标签在条目中的权重)
                tag_to_caiu_weights
                    .entry(tag_ref.name.clone())
                    .or_default()
                    .push((caiu.id, tag_ref.weight));

                // 2. 使用标签自带的权重 (记录最大权重作为语法参考)
                let current_weight = tag_syntax_weights
                    .entry(tag_ref.name.clone())
                    .or_insert(0.0);
                if tag_ref.weight > *current_weight {
                    *current_weight = tag_ref.weight;
                }
            }
        }

        // 3. 计算信息熵权重 (稀缺度)
        let mut tag_entropy_weights = HashMap::new();
        for (tag_name, caius) in &tag_to_caiu_weights {
            let doc_freq = caius.len() as f32;
            // IDF 公式: log(N / (df + 1)) + 1
            let idf = (total_caius / (doc_freq + 1.0)).ln() + 1.0;
            tag_entropy_weights.insert(tag_name.clone(), idf);
        }

        Self {
            tag_pool,
            tag_to_caiu_weights,
            tag_syntax_weights,
            tag_entropy_weights,
        }
    }

    /// 计算透镜检索引力中心 (Lens Center)
    /// 逻辑：对 required_tags 的向量进行复合加权平均 (语法权重 * 信息熵权重)
    #[allow(dead_code)]
    pub fn compute_lens_center(&self, required_tags: &[String]) -> Option<Vec<f32>> {
        if required_tags.is_empty() || self.tag_pool.dimension == 0 {
            return None;
        }

        let mut center = vec![0.0; self.tag_pool.dimension];
        let mut total_weight = 0.0;

        for tag_name in required_tags {
            if let Some(&idx) = self.tag_pool.registry.get(tag_name) {
                let start = idx * self.tag_pool.dimension;
                let vector = &self.tag_pool.vectors[start..start + self.tag_pool.dimension];

                // 复合权重 = 静态语法权重 * 信息熵权重
                let syntax_w = *self.tag_syntax_weights.get(tag_name).unwrap_or(&1.0);
                let entropy_w = *self.tag_entropy_weights.get(tag_name).unwrap_or(&1.0);
                let weight = syntax_w * entropy_w;

                for i in 0..self.tag_pool.dimension {
                    center[i] += vector[i] * weight;
                }
                total_weight += weight;
            }
        }

        if total_weight > 0.0 {
            for val in center.iter_mut() {
                *val /= total_weight;
            }
            Some(center)
        } else {
            None
        }
    }
}
