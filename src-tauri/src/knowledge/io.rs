use crate::knowledge::core::{Caiu, KnowledgeBaseMeta};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

/// 知识库根目录名称
const KNOWLEDGE_DIR: &str = "knowledge";
/// 知识库文件存放子目录
const BASES_DIR: &str = "bases";
/// 向量存储子目录
const VECTORS_DIR: &str = "vectors";
/// 全局标签池子目录
const TAG_POOL_DIR: &str = "tag_pool";

/// 获取知识库根目录
pub fn get_knowledge_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(KNOWLEDGE_DIR)
}

/// 获取知识库文件存放目录 (bases/)
pub fn get_bases_dir(app_data_dir: &Path) -> PathBuf {
    get_knowledge_root(app_data_dir).join(BASES_DIR)
}

/// 获取特定知识库目录 (bases/{kb_id}/)
pub fn get_kb_dir(app_data_dir: &Path, kb_id: &str) -> PathBuf {
    get_bases_dir(app_data_dir).join(kb_id)
}

/// 获取特定知识库的条目目录 (bases/{kb_id}/entries/)
pub fn get_kb_entries_dir(app_data_dir: &Path, kb_id: &str) -> PathBuf {
    get_kb_dir(app_data_dir, kb_id).join("entries")
}

/// 获取向量存储目录
pub fn get_vectors_dir(app_data_dir: &Path) -> PathBuf {
    get_knowledge_root(app_data_dir).join(VECTORS_DIR)
}

/// 获取全局标签池根目录
pub fn get_tag_pool_root(app_data_dir: &Path) -> PathBuf {
    get_knowledge_root(app_data_dir).join(TAG_POOL_DIR)
}

/// 生成安全的文件系统目录名（处理特殊字符并加哈希防止冲突）
pub fn get_safe_model_id(model_id: &str) -> String {
    // 1. 提取人类可读前缀 (取前 20 位，过滤非法字符)
    let prefix: String = model_id
        .chars()
        .take(20)
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();

    // 2. 计算完整名字的哈希，防止前缀一样导致冲突
    let mut hasher = DefaultHasher::new();
    model_id.hash(&mut hasher);
    let hash_val = hasher.finish();

    // 3. 组合：prefix + hash 的十六进制
    format!("{}_{:x}", prefix, hash_val)
}

/// 获取特定模型的标签池目录
pub fn get_model_tag_pool_dir(app_data_dir: &Path, model_id: &str) -> PathBuf {
    let safe_model = get_safe_model_id(model_id);
    get_tag_pool_root(app_data_dir).join(safe_model)
}

/// 获取特定知识库的向量根目录 (vectors/{kb_id}/)
pub fn get_kb_vectors_root(app_data_dir: &Path, kb_id: &str) -> PathBuf {
    get_vectors_dir(app_data_dir).join(kb_id)
}

/// 获取知识库向量模型索引文件路径 (vectors/{kb_id}/models.json)
pub fn get_kb_models_index_path(app_data_dir: &Path, kb_id: &str) -> PathBuf {
    get_kb_vectors_root(app_data_dir, kb_id).join("models.json")
}

/// 获取特定知识库下特定模型的向量目录 (vectors/{kb_id}/{safe_model}/)
pub fn get_kb_vector_model_dir(app_data_dir: &Path, kb_id: &str, model_id: &str) -> PathBuf {
    let safe_model = get_safe_model_id(model_id);
    get_kb_vectors_root(app_data_dir, kb_id).join(safe_model)
}

/// 获取特定向量文件的路径 (vectors/{kb_id}/{safe_model}/{caiu_id}.vec)
#[allow(dead_code)]
pub fn get_kb_vector_file_path(
    app_data_dir: &Path,
    kb_id: &str,
    model_id: &str,
    caiu_id: &str,
) -> PathBuf {
    get_kb_vector_model_dir(app_data_dir, kb_id, model_id).join(format!("{}.vec", caiu_id))
}

/// 初始化知识库工作区目录结构
pub fn init_workspace(app_data_dir: &Path) -> Result<(), String> {
    let root = get_knowledge_root(app_data_dir);
    let bases = get_bases_dir(app_data_dir);
    let vectors = get_vectors_dir(app_data_dir);
    let tag_pool = get_tag_pool_root(app_data_dir);

    fs::create_dir_all(&root).map_err(|e| format!("创建知识库根目录失败: {}", e))?;
    fs::create_dir_all(&bases).map_err(|e| format!("创建知识库存储目录失败: {}", e))?;
    fs::create_dir_all(&vectors).map_err(|e| format!("创建知识库向量目录失败: {}", e))?;
    fs::create_dir_all(&tag_pool).map_err(|e| format!("创建全局标签池目录失败: {}", e))?;

    Ok(())
}

/// 保存单个条目到磁盘
pub fn save_entry(app_data_dir: &Path, kb_id: &str, entry: &Caiu) -> Result<(), String> {
    let entries_dir = get_kb_entries_dir(app_data_dir, kb_id);
    if !entries_dir.exists() {
        fs::create_dir_all(&entries_dir).map_err(|e| format!("创建条目目录失败: {}", e))?;
    }

    let path = entries_dir.join(format!("{}.json", entry.id));
    let json = serde_json::to_string_pretty(entry).map_err(|e| format!("序列化条目失败: {}", e))?;
    fs::write(path, json).map_err(|e| format!("写入条目文件失败: {}", e))?;

    Ok(())
}

/// 从磁盘删除单个条目 (仅 JSON)
pub fn delete_entry(app_data_dir: &Path, kb_id: &str, entry_id: &str) -> Result<(), String> {
    let path = get_kb_entries_dir(app_data_dir, kb_id).join(format!("{}.json", entry_id));
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("删除条目文件失败: {}", e))?;
    }
    Ok(())
}

/// 保存知识库元数据到磁盘
pub fn save_kb_meta(
    app_data_dir: &Path,
    kb_id: &str,
    meta: &KnowledgeBaseMeta,
) -> Result<(), String> {
    let kb_dir = get_kb_dir(app_data_dir, kb_id);
    if !kb_dir.exists() {
        fs::create_dir_all(&kb_dir).map_err(|e| format!("创建知识库目录失败: {}", e))?;
    }

    let path = kb_dir.join("meta.json");
    let json =
        serde_json::to_string_pretty(meta).map_err(|e| format!("序列化元数据失败: {}", e))?;
    
    match fs::write(&path, json) {
        Ok(_) => {
            log::debug!("[KB_IO] 成功保存元数据索引: {}", path.display());
            Ok(())
        }
        Err(e) => {
            let err_msg = format!("写入元数据文件失败 {}: {}", path.display(), e);
            log::error!("[KB_IO] {}", err_msg);
            Err(err_msg)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_init_workspace() {
        let dir = tempdir().unwrap();
        let app_data_dir = dir.path();

        init_workspace(app_data_dir).unwrap();
        assert!(get_knowledge_root(app_data_dir).exists());
        assert!(get_bases_dir(app_data_dir).exists());
        assert!(get_vectors_dir(app_data_dir).exists());
    }
}
