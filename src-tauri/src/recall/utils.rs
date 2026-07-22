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

use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn get_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// 计算内容的 SHA-256 哈希值（与前端保持一致）
pub fn calculate_content_hash(content: &str) -> String {
    if content.is_empty() {
        return String::new();
    }
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// 自动生成内容摘要 (截取前 120 字符并清理 Markdown)
pub fn generate_summary(content: &str) -> String {
    let plain_text = content
        .lines()
        .filter(|line| !line.trim().starts_with('#')) // 过滤标题
        .collect::<Vec<_>>()
        .join(" ");

    let summary: String = plain_text.chars().take(120).collect();
    if plain_text.chars().count() > 120 {
        format!("{}...", summary.trim())
    } else {
        summary.trim().to_string()
    }
}

/// 从内容中提取标签 (Tag: xxx 或 标签: xxx)
pub fn extract_tags_from_content(content: &str) -> Vec<String> {
    use regex::Regex;
    // 匹配 Tag: 或 标签: 开头的行 (忽略大小写)
    let re = Regex::new(r"(?im)^(?:tags?|标签)\s*[:：]\s*(.+)$").unwrap();
    if let Some(caps) = re.captures(content) {
        if let Some(tags_str) = caps.get(1) {
            return tags_str
                .as_str()
                .split([',', '，', ';', '；'])
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
        }
    }
    vec![]
}

/// 从内容中提取标题 (Markdown 第一个一级标题)
pub fn extract_title_from_content(content: &str) -> Option<String> {
    use regex::Regex;
    let re = Regex::new(r"(?m)^#+\s+(.+)$").unwrap();
    re.captures(content)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().trim().to_string()))
}

pub fn cosine_similarity(left: &[f32], right: &[f32]) -> f32 {
    let dot_product: f32 = left.iter().zip(right).map(|(a, b)| a * b).sum();
    let left_norm = left.iter().map(|value| value * value).sum::<f32>().sqrt();
    let right_norm = right.iter().map(|value| value * value).sum::<f32>().sqrt();
    if left_norm > 0.0 && right_norm > 0.0 {
        dot_product / (left_norm * right_norm)
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cosine_similarity_handles_normal_and_zero_vectors() {
        assert!((cosine_similarity(&[1.0, 0.0], &[0.5, 0.5]) - 0.70710677).abs() < 1e-6);
        assert_eq!(cosine_similarity(&[0.0, 0.0], &[1.0, 0.0]), 0.0);
    }
}
