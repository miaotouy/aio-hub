#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 知识库工具的辅助默认值函数
fn default_priority() -> i32 {
    100
}

fn default_enabled() -> bool {
    true
}

/// 知识库全局工作区配置
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfig {
    pub default_embedding_model: String,
    pub vector_index: VectorIndexConfig,
}

/// 向量索引配置
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VectorIndexConfig {
    /// 索引算法: "hnsw", "flat", "ivf" 等
    pub algorithm: String,
    /// 向量维度，需与 embedding model 输出匹配
    pub dimension: usize,
    /// 距离度量: "cosine", "euclidean", "dot"
    pub metric: String,
    /// HNSW 特定参数: 构建时的邻居数量
    pub ef_construction: Option<usize>,
    /// HNSW 特定参数: 每个节点的最大连接数
    pub m: Option<usize>,
    /// 动态引擎参数存储 (透镜折射率、BM25 参数等)
    #[serde(flatten, default)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

/// 知识库索引（用于列表展示的轻量级元数据）
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBaseIndex {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub entry_count: usize,
    pub last_updated: i64,
    pub path: String, // 相对路径

    // 运行时状态 (不序列化到 JSON)
    #[serde(skip)]
    pub is_loaded: bool,
    #[serde(skip)]
    pub is_vectorized: bool,
}

/// 知识库全局工作区根结构
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeWorkspace {
    pub version: String,
    pub config: WorkspaceConfig,
    pub bases: Vec<KnowledgeBaseIndex>,
}

/// 向量化元数据
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VectorizationMeta {
    #[serde(default)]
    pub is_indexed: bool,
    pub last_indexed_at: Option<i64>,
    #[serde(default)]
    pub model_used: String,
    #[serde(default)]
    pub dimension: usize,
}

/// 知识库元数据
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBaseMeta {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    pub author: Option<String>,
    pub vectorization: VectorizationMeta,
    /// 已向量化的模型列表 (全局缓存)
    #[serde(default)]
    pub models: Vec<String>,
    /// 知识库级别的标签，用于分类
    #[serde(default)]
    pub tags: Vec<String>,
    /// 知识库图标 (Asset ID)
    pub icon: Option<String>,
    /// 条目索引列表 (轻量级，用于快速显示列表)
    #[serde(default)]
    pub entries: Vec<CaiuIndexItem>,
    /// 库级别配置 (万能结构，方便前端扩展)
    #[serde(default)]
    pub config: serde_json::Value,
}

/// 条目索引项 (轻量级，用于列表展示)
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaiuIndexItem {
    pub id: Uuid,
    pub key: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub priority: i32,
    pub updated_at: i64,
    #[serde(default)]
    pub vector_status: String,
    pub content_hash: Option<String>,
    /// 已向量化的模型列表
    #[serde(default)]
    pub vectorized_models: Vec<String>,
}

/// 带权重的标签
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TagWithWeight {
    pub name: String,
    pub weight: f32,
    /// 标签内容的哈希值，用于唯一标识和快速索引
    #[serde(default)]
    pub hash: String,
}

/// 资产引用结构，指向全局 AssetManager 中的资产
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRef {
    /// AssetManager 中的资产 ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// MIME 类型
    pub mime_type: String,
    /// 协议前缀，应为 "appdata://"
    pub protocol: String,
}

/// 原子知识单元 (CAIU)
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Caiu {
    pub id: Uuid,
    pub key: String,     // 用于 [[Key]] 引用
    pub content: String, // Markdown 内容

    #[serde(default)]
    pub summary: String, // 内容摘要

    /// 核心标签 (运行时计算的加权，不持久化)
    #[serde(skip)]
    pub core_tags: Vec<TagWithWeight>,

    /// 普通标签 (用于辅助检索)
    #[serde(default)]
    pub tags: Vec<TagWithWeight>,

    #[serde(default)]
    pub assets: Vec<AssetRef>,

    #[serde(default = "default_priority")]
    pub priority: i32,

    #[serde(default = "default_enabled")]
    pub enabled: bool,

    #[serde(default)]
    pub created_at: i64,

    #[serde(default)]
    pub updated_at: i64,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,

    pub content_hash: Option<String>,
    // 运行时计算的引用关系 (不持久化)
    #[serde(skip)]
    pub refs: Vec<Uuid>,
    #[serde(skip)]
    pub ref_by: Vec<Uuid>,
}

impl Caiu {
    pub fn to_index_item(
        &self,
        vector_status: String,
        vectorized_models: Vec<String>,
    ) -> CaiuIndexItem {
        CaiuIndexItem {
            id: self.id,
            key: self.key.clone(),
            summary: self.summary.clone(),
            tags: self.tags.iter().map(|t| t.name.clone()).collect(),
            priority: self.priority,
            updated_at: self.updated_at,
            vector_status,
            content_hash: self.content_hash.clone(),
            vectorized_models,
        }
    }
}

/// 用于添加/更新条目的输入结构
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaiuInput {
    pub key: String,
    pub content: String,
    #[serde(default)]
    pub tags: Vec<TagWithWeight>,
    #[serde(default)]
    pub assets: Vec<AssetRef>,
    pub priority: Option<i32>,
    pub enabled: Option<bool>,
}

/// 完整知识库结构 (用于全量导入/导出或旧版兼容)
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBase {
    pub meta: KnowledgeBaseMeta,
    pub entries: Vec<Caiu>,
}

/// Tag 之海：所有唯一标签的向量化索引 (透镜检索核心结构)
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TagSea {
    /// tag 哈希 → tag ID 的映射
    pub hash_to_id: std::collections::HashMap<String, u32>,
    /// tag ID → tag 文本 的反向映射
    pub id_to_tag: Vec<String>,
    /// tag ID → embedding 向量
    pub vectors: Vec<Vec<f32>>,
    /// tag ID → 标签本身的语法权重 (例如 #tag::1.5 提取出的 1.5)
    pub syntax_weights: Vec<f32>,
    /// tag ID → 该 tag 关联的所有 (CAIU ID, 该 tag 在此单元中的权重)
    pub tag_to_caiu_weights: std::collections::HashMap<u32, Vec<(Uuid, f32)>>,
}

/// 搜索结果项
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub caiu: Caiu,
    pub score: f32,
    pub match_type: String, // "vector" 或 "keyword"
    pub kb_id: Uuid,
    pub kb_name: String,
    pub highlight: Option<String>, // 匹配片段高亮
}

/// 搜索过滤器
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilters {
    pub kb_ids: Option<Vec<Uuid>>,
    pub tags: Option<Vec<String>>,
    pub limit: Option<usize>,
    pub min_score: Option<f32>,
    pub enabled_only: Option<bool>,
    /// 透镜检索：纹理 (coarse/fine)
    pub texture: Option<String>,
    /// 透镜检索：折射率 (0.0 - 1.0)
    pub refraction_index: Option<f32>,
    /// 透镜检索：显式约束标签
    pub required_tags: Option<Vec<String>>,
    /// 透镜检索：上下文投射向量 (用于能量衰减)
    pub history_vectors: Option<Vec<Vec<f32>>>,
    /// 向量检索：BM25 k1
    pub k1: Option<f32>,
    /// 向量检索：BM25 b
    pub b: Option<f32>,
    /// 捕获其他动态引擎参数
    #[serde(flatten, default)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

impl Default for SearchFilters {
    fn default() -> Self {
        Self {
            kb_ids: None,
            tags: None,
            limit: Some(20),
            min_score: None,
            enabled_only: Some(true),
            texture: None,
            refraction_index: None,
            required_tags: None,
            history_vectors: None,
            k1: None,
            b: None,
            extra: std::collections::HashMap::new(),
        }
    }
}

/// 检索上下文，提供引擎运行所需的环境信息
pub struct RetrievalContext {
    /// 内存数据库的引用
    pub db: std::sync::Arc<std::sync::RwLock<crate::knowledge::index::InMemoryDatabase>>,
    /// 标签池管理器引用
    pub tag_pool_manager: crate::knowledge::tag_pool::GlobalTagPoolManager,
    /// 应用数据目录 (用于加载标签池)
    pub app_data_dir: std::path::PathBuf,
}

/// 检索查询负载，支持文本或向量
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum QueryPayload {
    Text(String),
    Vector {
        vector: Vec<f32>,
        model: String,
        /// 可选的原始查询文本，用于字面量加权 (Hybrid Search)
        query: Option<String>,
    },
}

/// 检索算法引擎元数据
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalEngineInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    /// 支持的 Payload 类型: "text", "vector"
    pub supported_payload_types: Vec<String>,
    /// 是否需要配置 Embedding 模型
    #[serde(default)]
    pub requires_embedding: bool,
    /// 引擎支持的自定义参数描述 (符合前端 SettingItem 结构)
    #[serde(default)]
    pub parameters: Vec<serde_json::Value>,
}

/// 检索算法引擎 Trait
/// 实现此 Trait 即可接入知识库的检索系统，支持热切换
pub trait RetrievalEngine: Send + Sync {
    /// 获取引擎唯一标识 (如 "keyword", "vector", "lens")
    fn id(&self) -> &str;

    /// 获取引擎元数据
    fn info(&self) -> RetrievalEngineInfo;

    /// 执行检索逻辑
    fn search(
        &self,
        payload: &QueryPayload,
        filters: &SearchFilters,
        context: &RetrievalContext,
    ) -> Result<Vec<SearchResult>, String>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json;

    #[test]
    fn test_workspace_serialization() {
        let config = WorkspaceConfig {
            default_embedding_model: "text-embedding-3-small".to_string(),
            vector_index: VectorIndexConfig {
                algorithm: "hnsw".to_string(),
                dimension: 1536,
                metric: "cosine".to_string(),
                ef_construction: Some(200),
                m: Some(16),
                extra: std::collections::HashMap::new(),
            },
        };

        let workspace = KnowledgeWorkspace {
            version: "1.0.0".to_string(),
            config,
            bases: vec![KnowledgeBaseIndex {
                id: Uuid::new_v4(),
                name: "Test Base".to_string(),
                description: Some("A test knowledge base".to_string()),
                entry_count: 0,
                last_updated: 1706600000,
                path: "bases/test_base.json".to_string(),
                is_loaded: false,
                is_vectorized: false,
            }],
        };

        let json = serde_json::to_string_pretty(&workspace).unwrap();
        println!("Workspace JSON: {}", json);

        let deserialized: KnowledgeWorkspace = serde_json::from_str(&json).unwrap();
        assert_eq!(workspace.version, deserialized.version);
        assert_eq!(workspace.bases.len(), deserialized.bases.len());
        assert_eq!(workspace.bases[0].id, deserialized.bases[0].id);
    }

    #[test]
    fn test_knowledge_base_serialization() {
        let kb_id = Uuid::new_v4();
        let caiu_id = Uuid::new_v4();

        let kb = KnowledgeBase {
            meta: KnowledgeBaseMeta {
                id: kb_id,
                name: "My Knowledge".to_string(),
                description: None,
                created_at: 1706600000,
                updated_at: 1706600000,
                author: Some("Gugu".to_string()),
                vectorization: VectorizationMeta {
                    is_indexed: false,
                    last_indexed_at: None,
                    model_used: "".to_string(),
                    dimension: 0,
                },
                models: vec![],
                tags: vec!["personal".to_string()],
                icon: None,
                entries: vec![],
                config: serde_json::json!({}),
            },
            entries: vec![Caiu {
                id: caiu_id,
                key: "Rust".to_string(),
                content: "Rust is a systems programming language.".to_string(),
                summary: "Rust overview".to_string(),
                core_tags: vec![],
                tags: vec![],
                assets: vec![],
                priority: 100,
                enabled: true,
                created_at: 1706600000,
                updated_at: 1706600000,
                error_message: None,
                content_hash: None,
                refs: vec![],
                ref_by: vec![],
            }],
        };

        let json = serde_json::to_string_pretty(&kb).unwrap();
        println!("KnowledgeBase JSON: {}", json);

        let deserialized: KnowledgeBase = serde_json::from_str(&json).unwrap();
        assert_eq!(kb.meta.id, deserialized.meta.id);
        assert_eq!(kb.entries.len(), deserialized.entries.len());
        assert_eq!(kb.entries[0].key, "Rust");
        assert_eq!(deserialized.entries[0].priority, 100);
        assert_eq!(deserialized.entries[0].enabled, true);
    }

    #[test]
    fn test_caiu_default_values() {
        let json = format!(
            r#"{{
            "id": "{}",
            "key": "Test",
            "content": "Content"
        }}"#,
            Uuid::new_v4()
        );

        let deserialized: Caiu = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.priority, 100);
        assert_eq!(deserialized.enabled, true);
        assert!(deserialized.core_tags.is_empty());
        assert!(deserialized.tags.is_empty());
        assert!(deserialized.assets.is_empty());
    }
}
