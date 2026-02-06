use crate::knowledge::core::Caiu;
use jieba_rs::Jieba;
use lazy_static::lazy_static;
use std::collections::HashMap;
use uuid::Uuid;

lazy_static! {
    static ref JIEBA: Jieba = Jieba::new();
}

/// 文本倒排索引，用于关键词和标签检索
pub struct TextInvertedIndex {
    /// 标签索引：Tag -> CaiuIDs
    pub tag_index: HashMap<String, Vec<Uuid>>,
    /// 词项索引：Term -> (CaiuID, Frequency)
    pub term_index: HashMap<String, Vec<(Uuid, u32)>>,
}

impl TextInvertedIndex {
    pub fn new() -> Self {
        Self {
            tag_index: HashMap::new(),
            term_index: HashMap::new(),
        }
    }

    /// 对一个条目进行索引
    pub fn index_caiu(&mut self, caiu: &Caiu) {
        let id = caiu.id;

        // 1. 处理标签
        for tag in &caiu.tags {
            self.tag_index.entry(tag.name.clone()).or_default().push(id);
        }

        // 2. 处理内容分词
        let words = JIEBA.cut(&caiu.content, false);
        let mut frequencies: HashMap<String, u32> = HashMap::new();

        for word in words {
            let word = word.trim().to_lowercase();
            if word.is_empty() || word.len() < 2 {
                continue;
            } // 忽略单字和空白
            *frequencies.entry(word).or_insert(0) += 1;
        }

        for (term, freq) in frequencies {
            self.term_index.entry(term).or_default().push((id, freq));
        }
    }

    /// 移除一个条目的索引
    pub fn remove_caiu(&mut self, id: &Uuid) {
        // 移除标签索引中的 ID
        for ids in self.tag_index.values_mut() {
            ids.retain(|&x| x != *id);
        }
        // 移除词项索引中的 ID
        for entries in self.term_index.values_mut() {
            entries.retain(|&(x, _)| x != *id);
        }
    }

    /// 搜索关键词，返回 (条目 ID, 评分) 列表
    pub fn search(&self, query: &str) -> Vec<(Uuid, f32)> {
        let query_lower = query.to_lowercase();
        let mut scores: HashMap<Uuid, f32> = HashMap::new();

        // 1. 尝试标签匹配 (如果 query 本身就是一个标签)
        if let Some(ids) = self.tag_index.get(&query_lower) {
            for id in ids {
                *scores.entry(*id).or_insert(0.0) += 5.0;
            }
        }

        // 2. 分词搜索
        let words = JIEBA.cut(&query_lower, false);
        for word in words {
            let word = word.trim();
            if word.is_empty() {
                continue;
            }

            if let Some(entries) = self.term_index.get(word) {
                for (id, freq) in entries {
                    // 基础评分：词频
                    *scores.entry(*id).or_insert(0.0) += *freq as f32;
                }
            }
        }

        let mut result: Vec<(Uuid, f32)> = scores.into_iter().collect();
        result.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        result
    }
}
