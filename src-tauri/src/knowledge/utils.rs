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
                .split(|c: char| {
                    c == ',' || c == '，' || c == ';' || c == '；'
                })
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

/// Gram-Schmidt 投影：将 vec 投影到 basis 方向
/// 返回投影向量 proj = (vec·basis / ||basis||²) * basis
pub fn project_onto(vec: &[f32], basis: &[f32]) -> Vec<f32> {
    let dot: f32 = vec.iter().zip(basis).map(|(a, b)| a * b).sum();
    let basis_norm_sq: f32 = basis.iter().map(|v| v * v).sum();
    if basis_norm_sq < 1e-10 {
        return vec![0.0; vec.len()];
    }
    let coeff = dot / basis_norm_sq;
    basis.iter().map(|b| b * coeff).collect()
}

/// 投影系数：vec 在 basis 方向上的投影长度比
pub fn projection_coeff(vec: &[f32], basis: &[f32]) -> f32 {
    let dot: f32 = vec.iter().zip(basis).map(|(a, b)| a * b).sum();
    let basis_norm_sq: f32 = basis.iter().map(|v| v * v).sum();
    if basis_norm_sq < 1e-10 {
        return 0.0;
    }
    dot / basis_norm_sq
}

/// 向量减法：a - b
pub fn vec_subtract(a: &[f32], b: &[f32]) -> Vec<f32> {
    a.iter().zip(b).map(|(x, y)| x - y).collect()
}

/// 向量 L2 范数的平方
pub fn vec_norm_sq(v: &[f32]) -> f32 {
    v.iter().map(|x| x * x).sum()
}

/// 向量归一化（原地修改）
#[allow(dead_code)]
pub fn vec_normalize(v: &mut [f32]) {
    let norm = vec_norm_sq(v).sqrt();
    if norm > 1e-10 {
        for x in v.iter_mut() {
            *x /= norm;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_project_onto() {
        let vec = vec![3.0, 4.0];
        let basis = vec![1.0, 0.0];
        let proj = project_onto(&vec, &basis);
        assert_eq!(proj, vec![3.0, 0.0]);

        let zero_basis = vec![0.0, 0.0];
        let proj_zero = project_onto(&vec, &zero_basis);
        assert_eq!(proj_zero, vec![0.0, 0.0]);
    }

    #[test]
    fn test_vec_subtract() {
        let a = vec![5.0, 10.0];
        let b = vec![2.0, 3.0];
        assert_eq!(vec_subtract(&a, &b), vec![3.0, 7.0]);
    }

    #[test]
    fn test_vec_norm_sq() {
        let v = vec![3.0, 4.0];
        assert_eq!(vec_norm_sq(&v), 25.0);
    }

    #[test]
    fn test_vec_normalize() {
        let mut v = vec![3.0, 4.0];
        vec_normalize(&mut v);
        assert!((v[0] - 0.6).abs() < 1e-6);
        assert!((v[1] - 0.8).abs() < 1e-6);

        let mut zero_vec = vec![0.0, 0.0];
        vec_normalize(&mut zero_vec);
        assert_eq!(zero_vec, vec![0.0, 0.0]);
    }
}