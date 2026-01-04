use crate::utils::mime;
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use content_inspector::{inspect, ContentType};
use lofty::file::TaggedFileExt;
use lofty::probe::Probe;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

// --- 新增的分页、排序和统计相关结构体 ---

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum AssetSortBy {
    Date,
    Name,
    Size,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SortOrder {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAssetsPaginatedPayload {
    pub page: u32,
    pub page_size: u32,
    pub sort_by: AssetSortBy,
    pub sort_order: SortOrder,
    pub filter_type: Option<AssetType>,
    pub filter_origin: Option<AssetOriginType>,
    pub filter_source_module: Option<String>,
    pub search_query: Option<String>,
    #[serde(default)]
    pub show_duplicates_only: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedAssetsResponse {
    /// 当前页的资产列表
    pub items: Vec<Asset>,
    /// 符合筛选条件的总资产数
    pub total_items: u64,
    /// 总页数
    pub total_pages: u32,
    /// 是否有下一页
    pub has_more: bool,
    /// 当前页码
    pub page: u32,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetStats {
    pub total_assets: u64,
    pub total_size: u64,
    pub type_counts: HashMap<AssetType, u64>,
    pub source_module_counts: HashMap<String, u64>,
    pub origin_counts: HashMap<AssetOriginType, u64>,
}

/// 资产的来源类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum AssetOriginType {
    Local,
    Clipboard,
    Network,
    Generated,
}

/// 资产的通用类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum AssetType {
    Image,
    Audio,
    Video,
    Document,
    Other,
}

/// 资产来源信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetOrigin {
    #[serde(rename = "type")]
    pub origin_type: AssetOriginType,
    pub source: String,
    pub source_module: String,
}

/// 衍生数据信息 (例如：转录文本、OCR 结果、翻译等)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DerivedDataInfo {
    /// 衍生数据文件的相对路径 (例如: "transcriptions/uuid.json")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// 最后更新时间 (ISO 8601)
    pub updated_at: String,
    /// 提供者标识 (例如: "whisper-local", "azure-ocr")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// 错误信息 (如果生成失败)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 资产元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    /// 衍生数据映射表，key 为类型 (e.g., "transcription", "ocr")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub derived: Option<HashMap<String, DerivedDataInfo>>,
}
/// 资产对象
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    #[serde(rename = "type")]
    pub asset_type: AssetType,
    pub mime_type: String,
    pub name: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_path: Option<String>,
    pub size: u64,
    pub created_at: String,
    pub source_module: String, // Note: This might become redundant, but keep for now for backwards compat
    pub origins: Vec<AssetOrigin>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<AssetMetadata>,
}

/// 资产导入选项
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetImportOptions {
    #[serde(default = "default_true")]
    pub generate_thumbnail: bool,
    #[serde(default = "default_true")]
    pub enable_deduplication: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<AssetOrigin>,
    /// 指定一个子目录来存储资产，而不是按类型和日期
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subfolder: Option<String>,
    /// 来源模块 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_module: Option<String>,
}

fn default_true() -> bool {
    true
}

impl Default for AssetImportOptions {
    fn default() -> Self {
        Self {
            generate_thumbnail: true,
            enable_deduplication: true,
            origin: None,
            subfolder: None,
            source_module: None,
        }
    }
}
/// 检测文件是否为文本文件
///
/// 使用 content_inspector 库检测文件内容，支持：
/// - UTF-8 文本
/// - 其他常见文本编码
/// - 二进制文件识别
fn is_text_file(path: &Path) -> bool {
    use std::io::Read;

    // 只读取文件的前 8KB 用于检测（避免加载大文件到内存）
    match fs::File::open(path) {
        Ok(mut file) => {
            let mut buffer = vec![0; 8192];
            match file.read(&mut buffer) {
                Ok(n) => {
                    buffer.truncate(n);
                    matches!(
                        inspect(&buffer),
                        ContentType::UTF_8 | ContentType::UTF_8_BOM
                    )
                }
                Err(_) => false,
            }
        }
        Err(_) => false,
    }
}

/// 根据 MIME 类型判断资产类型
///
/// 如果 MIME 类型无法明确分类，会尝试检测文件内容来判断是否为文本文档
fn determine_asset_type(mime: &str, path: Option<&Path>) -> AssetType {
    if mime.starts_with("image/") {
        AssetType::Image
    } else if mime.starts_with("audio/") {
        AssetType::Audio
    } else if mime.starts_with("video/") {
        AssetType::Video
    } else if mime.starts_with("application/pdf")
        || mime.starts_with("application/msword")
        || mime.starts_with("application/vnd.openxmlformats-officedocument")
        || mime.starts_with("text/")
    {
        AssetType::Document
    } else if mime == "application/octet-stream" {
        // 对于未知类型，尝试检测是否为文本文件
        if let Some(file_path) = path {
            if is_text_file(file_path) {
                return AssetType::Document;
            }
        }
        AssetType::Other
    } else {
        AssetType::Other
    }
}

/// 计算文件的 SHA-256 哈希值
fn calculate_file_hash(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("读取文件失败: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let result = hasher.finalize();

    Ok(format!("{:x}", result))
}

/// 生成资产的存储路径
/// 格式:
/// - 如果提供了 subfolder: {subfolder}/{UUID}.{扩展名}
/// - 否则: {资产类型}/{年}-{月}/{UUID}.{扩展名}
fn generate_asset_path(
    asset_type: &AssetType,
    original_path: &Path,
    subfolder: Option<&String>,
) -> (String, String) {
    let uuid = Uuid::new_v4().to_string();
    let extension = original_path
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_else(|| "bin".to_string());
    let filename = format!("{}.{}", uuid, extension);

    let relative_path = if let Some(folder) = subfolder {
        // 清理 folder 名称，防止路径遍历攻击
        let safe_folder = folder
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .collect::<String>();
        format!("{}/{}", safe_folder, filename)
    } else {
        let now = Utc::now();
        let year_month = now.format("%Y-%m").to_string();
        let type_dir = match asset_type {
            AssetType::Image => "images",
            AssetType::Audio => "audio",
            AssetType::Video => "videos",
            AssetType::Document => "documents",
            AssetType::Other => "other",
        };
        format!("{}/{}/{}", type_dir, year_month, filename)
    };

    (uuid, relative_path)
}

/// 尝试从配置文件读取自定义资产路径
///
/// 使用 `?` 运算符优雅地处理各种可能失败的步骤，任何一步失败都会返回 None
fn try_get_custom_path_from_config(config_path: &Path) -> Option<String> {
    // 文件不存在就直接返回 None
    if !config_path.exists() {
        return None;
    }

    // 读取配置文件内容，失败则返回 None
    let config_content = fs::read_to_string(config_path).ok()?;

    // 解析 JSON，失败则返回 None
    let config: serde_json::Value = serde_json::from_str(&config_content).ok()?;

    // 链式获取字段值
    let path_str = config
        .get("customAssetPath")? // 获取字段，不存在返回 None
        .as_str()? // 转为字符串，类型不对返回 None
        .to_string();

    // 过滤空字符串
    if path_str.is_empty() {
        None
    } else {
        Some(path_str)
    }
}

/// 获取资产存储根目录
#[tauri::command]
pub fn get_asset_base_path(app: AppHandle) -> Result<String, String> {
    let app_data_dir = crate::get_app_data_dir(app.config());

    let config_path = app_data_dir.join("settings.json");

    // 尝试从配置文件读取自定义路径
    if let Some(custom_path_str) = try_get_custom_path_from_config(&config_path) {
        let custom_dir = PathBuf::from(&custom_path_str);

        // 如果目录不存在则创建
        if !custom_dir.exists() {
            fs::create_dir_all(&custom_dir)
                .map_err(|e| format!("无法创建自定义资产目录 '{}': {}", custom_path_str, e))?;
        }

        return Ok(custom_path_str);
    }

    // 使用默认路径
    let assets_dir = app_data_dir.join("assets");

    // 确保默认目录存在
    if !assets_dir.exists() {
        fs::create_dir_all(&assets_dir).map_err(|e| format!("无法创建默认资产目录: {}", e))?;
    }

    Ok(assets_dir.to_string_lossy().to_string())
}

/// 从文件路径导入资产
#[tauri::command]
pub async fn import_asset_from_path(
    app: AppHandle,
    original_path: String,
    options: Option<AssetImportOptions>,
) -> Result<Asset, String> {
    let opts = options.unwrap_or_default();
    let source_path = PathBuf::from(&original_path);

    if !source_path.exists() {
        return Err(format!("文件不存在: {}", original_path));
    }

    if !source_path.is_file() {
        return Err(format!("路径不是文件: {}", original_path));
    }

    let metadata = source_path
        .metadata()
        .map_err(|e| format!("读取文件元数据失败: {}", e))?;
    let file_size = metadata.len();

    let mime_type = mime::guess_mime_type(&source_path);
    let asset_type = determine_asset_type(&mime_type, Some(&source_path));

    let base_path = get_asset_base_path(app.clone())?;
    let base_dir = PathBuf::from(&base_path);

    // 计算文件哈希（如果启用去重）并检查是否重复
    let file_hash = if opts.enable_deduplication {
        let hash = calculate_file_hash(&source_path)?;

        // 检查当月目录中是否已存在相同哈希的文件（使用索引）
        if let Some(mut existing_asset) =
            check_duplicate_in_current_month(&base_dir, &asset_type, &hash)?
        {
            // 找到重复文件，为其添加新来源并返回更新后的 Asset
            let new_origin = opts.origin.unwrap_or_else(|| AssetOrigin {
                origin_type: AssetOriginType::Local,
                source: original_path.clone(),
                source_module: opts.source_module.unwrap_or_else(|| "unknown".to_string()),
            });

            // 避免重复添加完全相同的来源
            if !existing_asset
                .origins
                .iter()
                .any(|o| o.source_module == new_origin.source_module)
            {
                existing_asset.origins.push(new_origin.clone());

                // 立即更新 Catalog 以持久化新来源
                let asset_id = existing_asset.id.clone();
                update_catalog_in_place(&base_dir, |entries| {
                    if let Some(entry) = entries.iter_mut().find(|e| e.id == asset_id) {
                        entry.origins.push(new_origin.clone());
                    }
                })?;
            }

            // 即使是重复资产，也需要发出事件（用于触发自动转写等功能）
            if let Err(e) = app.emit("asset-imported", &existing_asset) {
                log::error!("发出 asset-imported 事件失败 (重复资产): {}", e);
            }

            return Ok(existing_asset);
        }

        Some(hash)
    } else {
        None
    };

    let (uuid, relative_path) =
        generate_asset_path(&asset_type, &source_path, opts.subfolder.as_ref());
    let target_path = base_dir.join(&relative_path);

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
    }

    fs::copy(&source_path, &target_path).map_err(|e| format!("复制文件失败: {}", e))?;

    let original_name = source_path
        .file_name()
        .ok_or_else(|| "无法获取文件名".to_string())?
        .to_string_lossy()
        .to_string();

    let mut asset_metadata = AssetMetadata {
        width: None,
        height: None,
        duration: None,
        sha256: file_hash.clone(),
        derived: None,
    };

    if matches!(asset_type, AssetType::Image) {
        if let Ok(img) = image::open(&target_path) {
            asset_metadata.width = Some(img.width());
            asset_metadata.height = Some(img.height());
        }
    }

    let thumbnail_path = if opts.generate_thumbnail
        && (matches!(asset_type, AssetType::Image) || matches!(asset_type, AssetType::Audio))
    {
        generate_thumbnail(&target_path, &base_dir, &uuid, &asset_type)?
    } else {
        None
    };

    // 确定 source_module
    let source_module = opts
        .source_module
        .clone()
        .unwrap_or_else(|| "unknown".to_string());

    let origin = opts.origin.unwrap_or_else(|| AssetOrigin {
        origin_type: AssetOriginType::Local,
        source: original_path.clone(),
        source_module: source_module.clone(),
    });

    let asset = Asset {
        id: uuid.clone(),
        asset_type: asset_type.clone(),
        mime_type,
        name: original_name,
        path: relative_path.clone(),
        thumbnail_path,
        size: file_size,
        created_at: Utc::now().to_rfc3339(),
        source_module,
        origins: vec![origin],
        metadata: Some(asset_metadata),
    };

    // 更新月度索引（如果启用去重且有哈希值）
    if let Some(hash) = file_hash {
        let filename = target_path
            .file_name()
            .ok_or("无法获取文件名")?
            .to_string_lossy()
            .to_string();

        if let Err(e) = update_month_index(&base_dir, &asset_type, &hash, &filename) {
            // 索引更新失败不影响导入结果，只记录错误
            log::error!("更新月度索引失败: {}", e);
        }
    }

    // 更新 Catalog 索引
    let catalog_entry = convert_asset_to_catalog_entry(&asset);
    if let Err(e) = append_to_catalog(&base_dir, &catalog_entry) {
        log::error!("更新 Catalog 索引失败: {}", e);
    }

    // 发出 asset-imported 事件，通知前端（用于自动转写等功能）
    if let Err(e) = app.emit("asset-imported", &asset) {
        log::error!("发出 asset-imported 事件失败: {}", e);
    }

    Ok(asset)
}

/// 从字节流导入资产
#[tauri::command]
pub async fn import_asset_from_bytes(
    app: AppHandle,
    bytes: Vec<u8>,
    original_name: String,
    options: Option<AssetImportOptions>,
) -> Result<Asset, String> {
    let opts = options.unwrap_or_default();

    let temp_path = PathBuf::from(&original_name);
    let mime_type = mime::guess_mime_type(&temp_path);
    let asset_type = determine_asset_type(&mime_type, None);

    let base_path = get_asset_base_path(app.clone())?;
    let base_dir = PathBuf::from(&base_path);

    // 计算文件哈希（如果启用去重）并检查是否重复
    let file_hash = if opts.enable_deduplication {
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let hash = format!("{:x}", hasher.finalize());

        // 检查当月目录中是否已存在相同哈希的文件（使用索引）
        if let Some(mut existing_asset) =
            check_duplicate_in_current_month(&base_dir, &asset_type, &hash)?
        {
            // 找到重复文件，为其添加新来源并返回更新后的 Asset
            let new_origin = opts.origin.unwrap_or_else(|| AssetOrigin {
                origin_type: AssetOriginType::Clipboard,
                source: "clipboard".to_string(),
                source_module: opts.source_module.unwrap_or_else(|| "unknown".to_string()),
            });

            if !existing_asset
                .origins
                .iter()
                .any(|o| o.source_module == new_origin.source_module)
            {
                existing_asset.origins.push(new_origin.clone());

                // 立即更新 Catalog 以持久化新来源
                let asset_id = existing_asset.id.clone();
                update_catalog_in_place(&base_dir, |entries| {
                    if let Some(entry) = entries.iter_mut().find(|e| e.id == asset_id) {
                        entry.origins.push(new_origin.clone());
                    }
                })?;
            }

            // 即使是重复资产，也需要发出事件（用于触发自动转写等功能）
            if let Err(e) = app.emit("asset-imported", &existing_asset) {
                log::error!("发出 asset-imported 事件失败 (重复资产): {}", e);
            }

            return Ok(existing_asset);
        }

        Some(hash)
    } else {
        None
    };

    let (uuid, relative_path) =
        generate_asset_path(&asset_type, &temp_path, opts.subfolder.as_ref());
    let target_path = base_dir.join(&relative_path);

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
    }

    fs::write(&target_path, &bytes).map_err(|e| format!("写入文件失败: {}", e))?;

    let file_size = bytes.len() as u64;

    let mut asset_metadata = AssetMetadata {
        width: None,
        height: None,
        duration: None,
        sha256: file_hash.clone(),
        derived: None,
    };

    if matches!(asset_type, AssetType::Image) {
        if let Ok(img) = image::load_from_memory(&bytes) {
            asset_metadata.width = Some(img.width());
            asset_metadata.height = Some(img.height());
        }
    }

    let thumbnail_path = if opts.generate_thumbnail
        && (matches!(asset_type, AssetType::Image) || matches!(asset_type, AssetType::Audio))
    {
        generate_thumbnail(&target_path, &base_dir, &uuid, &asset_type)?
    } else {
        None
    };

    // 确定 source_module
    let source_module = opts
        .source_module
        .clone()
        .unwrap_or_else(|| "unknown".to_string());

    let origin = opts.origin.unwrap_or_else(|| AssetOrigin {
        origin_type: AssetOriginType::Clipboard,
        source: "clipboard".to_string(),
        source_module: source_module.clone(),
    });

    let asset = Asset {
        id: uuid.clone(),
        asset_type: asset_type.clone(),
        mime_type,
        name: original_name,
        path: relative_path.clone(),
        thumbnail_path,
        size: file_size,
        created_at: Utc::now().to_rfc3339(),
        source_module,
        origins: vec![origin],
        metadata: Some(asset_metadata),
    };

    // 更新月度索引（如果启用去重且有哈希值）
    if let Some(hash) = file_hash {
        let filename = target_path
            .file_name()
            .ok_or("无法获取文件名")?
            .to_string_lossy()
            .to_string();

        if let Err(e) = update_month_index(&base_dir, &asset_type, &hash, &filename) {
            // 索引更新失败不影响导入结果，只记录错误
            log::error!("更新月度索引失败: {}", e);
        }
    }

    // 更新 Catalog 索引
    let catalog_entry = convert_asset_to_catalog_entry(&asset);
    if let Err(e) = append_to_catalog(&base_dir, &catalog_entry) {
        log::error!("更新 Catalog 索引失败: {}", e);
    }

    // 发出 asset-imported 事件，通知前端（用于自动转写等功能）
    if let Err(e) = app.emit("asset-imported", &asset) {
        log::error!("发出 asset-imported 事件失败: {}", e);
    }

    Ok(asset)
}

/// 月度哈希索引结构
/// 存储格式: { "sha256_hash": ["uuid1.ext", "uuid2.ext"] }
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MonthHashIndex {
    #[serde(flatten)]
    entries: HashMap<String, Vec<String>>,
}

impl MonthHashIndex {
    fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    fn from_file(index_path: &Path) -> Result<Self, String> {
        if !index_path.exists() {
            return Ok(Self::new());
        }

        let content =
            fs::read_to_string(index_path).map_err(|e| format!("读取索引文件失败: {}", e))?;

        serde_json::from_str(&content).map_err(|e| format!("解析索引文件失败: {}", e))
    }

    fn save(&self, index_path: &Path) -> Result<(), String> {
        let content =
            serde_json::to_string_pretty(self).map_err(|e| format!("序列化索引失败: {}", e))?;

        if let Some(parent) = index_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建索引目录失败: {}", e))?;
        }

        fs::write(index_path, content).map_err(|e| format!("写入索引文件失败: {}", e))
    }

    fn get(&self, hash: &str) -> Option<&Vec<String>> {
        self.entries.get(hash)
    }

    fn insert(&mut self, hash: String, filename: String) {
        self.entries.entry(hash).or_default().push(filename);
    }
}

/// 检查当月目录中是否已存在相同哈希的文件（使用索引优化）
/// 返回已存在的 Asset 信息（如果找到）
fn check_duplicate_in_current_month(
    base_dir: &Path,
    asset_type: &AssetType,
    file_hash: &str,
) -> Result<Option<Asset>, String> {
    use std::io::{BufRead, BufReader};

    let now = Utc::now();
    let year_month = now.format("%Y-%m").to_string();

    let type_dir = match asset_type {
        AssetType::Image => "images",
        AssetType::Audio => "audio",
        AssetType::Video => "videos",
        AssetType::Document => "documents",
        AssetType::Other => "other",
    };

    let month_dir = base_dir.join(type_dir).join(&year_month);

    // 如果目录不存在，说明没有重复
    if !month_dir.exists() {
        return Ok(None);
    }

    // 读取索引文件
    let index_path = month_dir.join(".index.json");
    let index = MonthHashIndex::from_file(&index_path)?;

    // 查询索引
    if let Some(filenames) = index.get(file_hash) {
        if let Some(filename) = filenames.first() {
            let file_path = month_dir.join(filename);

            // 验证文件是否仍然存在
            if !file_path.exists() {
                return Ok(None);
            }

            // 从文件名提取 UUID（去除扩展名）
            let asset_id = file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .ok_or("无法解析文件名")?;

            // 尝试从 Catalog 中读取完整的资产信息（包括 origins）
            let catalog_path = get_catalog_path(base_dir)?;
            if catalog_path.exists() {
                let catalog_file = fs::File::open(&catalog_path)
                    .map_err(|e| format!("无法打开 Catalog 文件: {}", e))?;
                let reader = BufReader::new(catalog_file);

                // 在 Catalog 中查找对应的条目
                for line_content in reader.lines().map_while(Result::ok) {
                    if line_content.trim().is_empty() {
                        continue;
                    }
                    if let Ok(mut entry) = serde_json::from_str::<CatalogEntry>(&line_content) {
                        if entry.id == asset_id {
                            // 找到了！迁移旧数据并返回完整的 Asset
                            entry.migrate_if_needed();
                            return Ok(Some(convert_entry_to_asset(entry, base_dir)));
                        }
                    }
                }
            }

            // 如果 Catalog 中没有找到，回退到从文件系统构建（但会丢失 origins）
            log::warn!(
                "在 Catalog 中未找到资产 {}，使用文件系统信息重建（将丢失来源信息）",
                asset_id
            );
            return Ok(Some(build_asset_from_path(&file_path, base_dir)?));
        }
    }

    Ok(None)
}

/// 更新月度哈希索引
fn update_month_index(
    base_dir: &Path,
    asset_type: &AssetType,
    file_hash: &str,
    filename: &str,
) -> Result<(), String> {
    let now = Utc::now();
    let year_month = now.format("%Y-%m").to_string();

    let type_dir = match asset_type {
        AssetType::Image => "images",
        AssetType::Audio => "audio",
        AssetType::Video => "videos",
        AssetType::Document => "documents",
        AssetType::Other => "other",
    };

    let month_dir = base_dir.join(type_dir).join(&year_month);
    let index_path = month_dir.join(".index.json");

    // 读取现有索引
    let mut index = MonthHashIndex::from_file(&index_path)?;

    // 添加新条目
    index.insert(file_hash.to_string(), filename.to_string());

    // 保存索引
    index.save(&index_path)?;

    Ok(())
}

/// 生成缩略图
fn generate_thumbnail(
    source_path: &Path,
    base_dir: &Path,
    uuid: &str,
    asset_type: &AssetType,
) -> Result<Option<String>, String> {
    match asset_type {
        AssetType::Image => generate_image_thumbnail(source_path, base_dir, uuid),
        AssetType::Audio => generate_audio_thumbnail(source_path, base_dir, uuid),
        _ => Ok(None),
    }
}

/// 生成图片缩略图
fn generate_image_thumbnail(
    source_path: &Path,
    base_dir: &Path,
    uuid: &str,
) -> Result<Option<String>, String> {
    let img = match image::open(source_path) {
        Ok(img) => img,
        Err(_) => return Ok(None),
    };

    if img.width() <= 400 && img.height() <= 400 {
        return Ok(None);
    }

    let thumbnail = img.thumbnail(400, 400);

    let thumbnail_relative = format!(".thumbnails/{}.jpg", uuid);
    let thumbnail_path = base_dir.join(&thumbnail_relative);

    if let Some(parent) = thumbnail_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建缩略图目录失败: {}", e))?;
    }

    // 将图像转换为 RGB8 格式以去除 Alpha 通道，因为 JPEG 不支持透明度
    thumbnail
        .to_rgb8()
        .save_with_format(&thumbnail_path, image::ImageFormat::Jpeg)
        .map_err(|e| format!("保存缩略图失败: {}", e))?;

    Ok(Some(thumbnail_relative))
}

/// 保存前端生成的缩略图
#[tauri::command]
pub async fn save_asset_thumbnail(
    app: AppHandle,
    asset_id: String,
    base64_data: String,
) -> Result<Asset, String> {
    let base_path = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path);

    // 1. 解码 Base64 数据
    // 前端传来的通常带有 "data:image/jpeg;base64," 前缀，需要去掉
    let base64_str = if let Some(index) = base64_data.find(',') {
        &base64_data[index + 1..]
    } else {
        &base64_data
    };

    let image_data = general_purpose::STANDARD
        .decode(base64_str)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;

    // 2. 保存缩略图文件
    let thumbnail_relative = format!(".thumbnails/{}.jpg", asset_id);
    let thumbnail_path = base_dir.join(&thumbnail_relative);

    if let Some(parent) = thumbnail_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建缩略图目录失败: {}", e))?;
    }

    fs::write(&thumbnail_path, &image_data).map_err(|e| format!("写入缩略图文件失败: {}", e))?;

    // 3. 更新 Asset 信息
    let mut updated_asset: Option<Asset> = None;

    update_catalog_in_place(&base_dir, |entries| {
        for entry in entries.iter_mut() {
            if entry.id == asset_id {
                // 实际上 convert_entry_to_asset 会自动检查文件是否存在来设置 thumbnail_path
                // 这里我们不需要修改 entry 的字段，只需要触发一次保存和重新读取即可
                updated_asset = Some(convert_entry_to_asset(entry.clone(), &base_dir));
                break;
            }
        }
    })?;

    updated_asset.ok_or_else(|| format!("找不到 ID 为 '{}' 的资产", asset_id))
}

/// 生成音频封面缩略图
fn generate_audio_thumbnail(
    source_path: &Path,
    base_dir: &Path,
    uuid: &str,
) -> Result<Option<String>, String> {
    // 使用 Probe 读取文件，这样更健壮
    let tagged_file = match Probe::open(source_path) {
        Ok(probe) => match probe.read() {
            Ok(tf) => tf,
            Err(_) => return Ok(None),
        },
        Err(_) => return Ok(None),
    };

    // 尝试获取标签
    let tag = match tagged_file.primary_tag() {
        Some(tag) => tag,
        None => match tagged_file.first_tag() {
            Some(tag) => tag,
            None => return Ok(None),
        },
    };

    // 获取图片列表
    let pictures = tag.pictures();
    if pictures.is_empty() {
        return Ok(None);
    }

    // 取第一张图片
    let picture = &pictures[0];
    let data = picture.data();

    // 加载图片数据
    let img = match image::load_from_memory(data) {
        Ok(img) => img,
        Err(_) => return Ok(None),
    };

    // 生成缩略图
    let thumbnail = img.thumbnail(400, 400);

    let thumbnail_relative = format!(".thumbnails/{}.jpg", uuid);
    let thumbnail_path = base_dir.join(&thumbnail_relative);

    if let Some(parent) = thumbnail_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建缩略图目录失败: {}", e))?;
    }

    // 保存
    thumbnail
        .to_rgb8()
        .save_with_format(&thumbnail_path, image::ImageFormat::Jpeg)
        .map_err(|e| format!("保存音频封面失败: {}", e))?;

    Ok(Some(thumbnail_relative))
}

/// 根据相对路径读取资产的二进制数据
#[tauri::command]
pub fn get_asset_binary(app: AppHandle, relative_path: String) -> Result<Vec<u8>, String> {
    let base_path = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path);
    let file_path = base_dir.join(&relative_path);

    if !file_path.starts_with(&base_dir) {
        return Err("非法的文件路径".to_string());
    }

    if !file_path.exists() {
        return Err(format!("文件不存在: {}", relative_path));
    }

    fs::read(&file_path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 列出所有已导入的资产
#[tauri::command]
pub fn list_all_assets(app: AppHandle) -> Result<Vec<Asset>, String> {
    let base_path_str = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path_str);
    let mut assets = Vec::new();

    let asset_types = ["images", "audio", "videos", "documents", "other"];

    for type_dir_str in &asset_types {
        let type_dir = base_dir.join(type_dir_str);
        if !type_dir.exists() || !type_dir.is_dir() {
            continue;
        }

        for year_month_entry in fs::read_dir(&type_dir)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            let year_month_path = year_month_entry.path();
            if !year_month_path.is_dir() {
                continue;
            }

            for file_entry in fs::read_dir(&year_month_path)
                .map_err(|e| e.to_string())?
                .flatten()
            {
                let file_path = file_entry.path();
                if !file_path.is_file() {
                    continue;
                }

                // 跳过索引文件
                if file_path.file_name() == Some(".index.json".as_ref()) {
                    continue;
                }

                if let Ok(asset) = build_asset_from_path(&file_path, &base_dir) {
                    assets.push(asset);
                }
            }
        }
    }

    Ok(assets)
}

/// 从文件路径构建 Asset 对象
fn build_asset_from_path(file_path: &Path, base_dir: &Path) -> Result<Asset, String> {
    let metadata = file_path.metadata().map_err(|e| e.to_string())?;
    let relative_path = file_path
        .strip_prefix(base_dir)
        .map_err(|e| e.to_string())?;

    let mime_type = mime::guess_mime_type(file_path);
    let asset_type = determine_asset_type(&mime_type, Some(file_path));

    let uuid = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("无法解析文件名")?
        .to_string();

    let file_hash = calculate_file_hash(file_path).ok();

    let asset_metadata = AssetMetadata {
        width: None,
        height: None,
        duration: None,
        sha256: file_hash,
        derived: None,
    };

    Ok(Asset {
        id: uuid,
        asset_type,
        mime_type,
        name: file_path.file_name().unwrap().to_string_lossy().to_string(),
        path: relative_path.to_string_lossy().replace("\\", "/"),
        thumbnail_path: None, // TODO: 检查缩略图是否存在
        size: metadata.len(),
        created_at: metadata
            .created()
            .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
            .unwrap_or_default(),
        source_module: "unknown".to_string(), // 从文件系统重建时无法确定来源模块
        origins: vec![],                      // 无法从文件系统确定来源
        metadata: Some(asset_metadata),
    })
}
/// 根据相对路径读取文本文件内容
///
/// 该函数会自动检测文件是否为文本文件，并尝试以 UTF-8 编码读取
#[tauri::command]
pub fn read_text_file(app: AppHandle, relative_path: String) -> Result<String, String> {
    let base_path = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path);
    let file_path = base_dir.join(&relative_path);

    if !file_path.starts_with(&base_dir) {
        return Err("非法的文件路径".to_string());
    }

    if !file_path.exists() {
        return Err(format!("文件不存在: {}", relative_path));
    }

    // 检测是否为文本文件
    if !is_text_file(&file_path) {
        return Err("文件不是有效的文本文件".to_string());
    }

    fs::read_to_string(&file_path).map_err(|e| format!("读取文本文件失败: {}", e))
}

/// 重建索引进度信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildIndexProgress {
    pub current: usize,
    pub total: usize,
    pub current_type: String,
}

/// 为所有已存在的资产文件重建哈希索引
///
/// 该函数会扫描所有资产目录，计算每个文件的哈希值，并更新对应月份的索引文件
/// 同时通过事件系统向前端报告进度
#[tauri::command]
pub async fn rebuild_hash_index(app: AppHandle) -> Result<String, String> {
    let base_path = get_asset_base_path(app.clone())?;
    let base_dir = PathBuf::from(&base_path);

    let asset_type_dirs = ["images", "audio", "videos", "documents", "other"];

    // 第一步：统计总文件数
    let mut total_files = 0usize;
    for type_dir_str in &asset_type_dirs {
        let type_dir = base_dir.join(type_dir_str);
        if !type_dir.exists() || !type_dir.is_dir() {
            continue;
        }

        for year_month_entry in fs::read_dir(&type_dir)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            let year_month_path = year_month_entry.path();
            if !year_month_path.is_dir() {
                continue;
            }

            for file_entry in fs::read_dir(&year_month_path)
                .map_err(|e| e.to_string())?
                .flatten()
            {
                let file_path = file_entry.path();
                if file_path.is_file() && file_path.file_name() != Some(".index.json".as_ref()) {
                    total_files += 1;
                }
            }
        }
    }

    // 第二步：处理文件并报告进度
    let mut current_processed = 0usize;
    let mut errors = Vec::new();

    for type_dir_str in &asset_type_dirs {
        let type_dir = base_dir.join(type_dir_str);
        if !type_dir.exists() || !type_dir.is_dir() {
            continue;
        }

        // 遍历年-月目录
        for year_month_entry in fs::read_dir(&type_dir)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            let year_month_path = year_month_entry.path();
            if !year_month_path.is_dir() {
                continue;
            }

            // 为当前月份目录创建全新的索引
            let index_path = year_month_path.join(".index.json");
            let mut new_index = MonthHashIndex::new();

            // 遍历该月份目录下的所有文件
            for file_entry in fs::read_dir(&year_month_path)
                .map_err(|e| e.to_string())?
                .flatten()
            {
                let file_path = file_entry.path();

                // 跳过索引文件本身和非文件项
                if !file_path.is_file() || file_path.file_name() == Some(".index.json".as_ref()) {
                    continue;
                }

                current_processed += 1;

                // 发送进度事件
                let progress = RebuildIndexProgress {
                    current: current_processed,
                    total: total_files,
                    current_type: type_dir_str.to_string(),
                };
                let _ = app.emit("rebuild-index-progress", &progress);

                // 计算文件哈希
                match calculate_file_hash(&file_path) {
                    Ok(hash) => {
                        if let Some(filename) = file_path.file_name() {
                            let filename_str = filename.to_string_lossy().to_string();
                            new_index.insert(hash, filename_str);
                        }
                    }
                    Err(e) => {
                        errors.push(format!(
                            "计算文件 {} 的哈希失败: {}",
                            file_path.display(),
                            e
                        ));
                    }
                }
            }

            // 保存全新的索引
            if let Err(e) = new_index.save(&index_path) {
                errors.push(format!("保存索引文件 {} 失败: {}", index_path.display(), e));
            }
        }
    }

    // 构建结果消息
    let mut result = format!(
        "索引重建完成！共处理和索引了 {} 个文件。",
        current_processed
    );

    if !errors.is_empty() {
        result.push_str(&format!("\n\n遇到 {} 个错误：\n", errors.len()));
        for (i, error) in errors.iter().take(10).enumerate() {
            result.push_str(&format!("{}. {}\n", i + 1, error));
        }
        if errors.len() > 10 {
            result.push_str(&format!("... 以及其他 {} 个错误\n", errors.len() - 10));
        }
    }

    Ok(result)
}

/// 重复文件信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFileInfo {
    /// 文件哈希值
    pub hash: String,
    /// 重复文件的相对路径列表
    pub files: Vec<String>,
    /// 文件总大小（单个文件大小）
    pub size: u64,
    /// 重复文件数量
    pub count: usize,
}

/// 重复文件检测结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFilesResult {
    /// 重复文件组列表
    pub duplicates: Vec<DuplicateFileInfo>,
    /// 总共的重复文件组数
    pub total_groups: usize,
    /// 总共的重复文件数
    pub total_files: usize,
    /// 可节省的空间（字节）
    pub wasted_space: u64,
}

/// 删除资产文件（移动到回收站）
///
/// 该函数会：
/// 1. 将文件移动到系统回收站
/// 2. 删除缩略图（如果存在）
/// 3. 从哈希索引中移除该文件
#[tauri::command]
pub async fn delete_asset(
    app: AppHandle,
    asset_id: String,
    relative_path: String,
) -> Result<(), String> {
    let base_path = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path);
    let file_path = base_dir.join(&relative_path);

    // 安全检查
    if !file_path.starts_with(&base_dir) {
        return Err("非法的文件路径".to_string());
    }

    if !file_path.exists() {
        return Err(format!("文件不存在: {}", relative_path));
    }

    // 1. 移动文件到回收站
    trash::delete(&file_path).map_err(|e| format!("删除文件失败: {}", e))?;

    // 2. 删除缩略图（如果存在）
    let thumbnail_path = base_dir.join(format!(".thumbnails/{}.jpg", asset_id));
    if thumbnail_path.exists() {
        let _ = trash::delete(&thumbnail_path); // 缩略图删除失败不影响主流程
    }

    // 3. 从索引中移除该文件
    if let Some(parent_dir) = file_path.parent() {
        let index_path = parent_dir.join(".index.json");

        if index_path.exists() {
            // 读取索引
            if let Ok(mut index) = MonthHashIndex::from_file(&index_path) {
                // 获取文件名
                if let Some(filename) = file_path.file_name() {
                    let filename_str = filename.to_string_lossy().to_string();

                    // 遍历索引，移除该文件
                    let mut entries_to_remove = Vec::new();
                    for (hash, filenames) in index.entries.iter_mut() {
                        filenames.retain(|f| f != &filename_str);

                        // 如果该哈希下没有文件了，标记删除
                        if filenames.is_empty() {
                            entries_to_remove.push(hash.clone());
                        }
                    }

                    // 移除空的哈希条目
                    for hash in entries_to_remove {
                        index.entries.remove(&hash);
                    }

                    // 保存更新后的索引
                    let _ = index.save(&index_path); // 索引保存失败不影响主流程
                }
            }
        }
    }

    // 4. 从 Catalog 索引中移除
    if let Err(e) = remove_from_catalog(&base_dir, &asset_id) {
        log::error!("从 Catalog 索引中移除失败: {}", e);
    }

    Ok(())
}

/// 查找所有重复的文件
///
/// 直接从索引文件读取哈希值，找出具有相同哈希值的文件组
#[tauri::command]
pub async fn find_duplicate_files(app: AppHandle) -> Result<DuplicateFilesResult, String> {
    let base_path = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path);

    let asset_type_dirs = ["images", "audio", "videos", "documents", "other"];

    // 使用 HashMap 存储哈希值到文件路径列表的映射
    // HashMap<hash, Vec<(relative_path, type_dir, year_month, filename)>>
    let mut hash_map: HashMap<String, Vec<(String, String, String, String)>> = HashMap::new();

    for type_dir_str in &asset_type_dirs {
        let type_dir = base_dir.join(type_dir_str);
        if !type_dir.exists() || !type_dir.is_dir() {
            continue;
        }

        // 遍历年-月目录
        for year_month_entry in fs::read_dir(&type_dir)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            let year_month_path = year_month_entry.path();
            if !year_month_path.is_dir() {
                continue;
            }

            let year_month = year_month_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            // 读取该月份的索引文件
            let index_path = year_month_path.join(".index.json");
            if !index_path.exists() {
                continue;
            }

            let index = MonthHashIndex::from_file(&index_path)?;

            // 遍历索引中的每个条目
            for (hash, filenames) in index.entries.iter() {
                for filename in filenames {
                    let relative_path = format!("{}/{}/{}", type_dir_str, year_month, filename);

                    hash_map.entry(hash.clone()).or_default().push((
                        relative_path,
                        type_dir_str.to_string(),
                        year_month.clone(),
                        filename.clone(),
                    ));
                }
            }
        }
    }

    // 筛选出重复的文件组（哈希值对应的文件数 > 1）
    let mut duplicates = Vec::new();
    let mut total_files = 0;
    let mut wasted_space = 0u64;

    for (hash, files_info) in hash_map.iter() {
        if files_info.len() > 1 {
            // 获取第一个文件的大小作为参考
            let first_file = &files_info[0];
            let first_file_path = base_dir
                .join(&first_file.1)
                .join(&first_file.2)
                .join(&first_file.3);

            let file_size = first_file_path.metadata().map(|m| m.len()).unwrap_or(0);

            let count = files_info.len();

            // 计算浪费的空间（重复文件数 - 1）* 文件大小
            wasted_space += file_size * (count as u64 - 1);
            total_files += count;

            duplicates.push(DuplicateFileInfo {
                hash: hash.clone(),
                files: files_info
                    .iter()
                    .map(|(path, _, _, _)| path.clone())
                    .collect(),
                size: file_size,
                count,
            });
        }
    }

    // 按重复文件数量降序排序
    duplicates.sort_by(|a, b| b.count.cmp(&a.count));

    Ok(DuplicateFilesResult {
        total_groups: duplicates.len(),
        total_files,
        wasted_space,
        duplicates,
    })
}

// --- 新增的懒加载相关命令 ---

/// Catalog 索引中的单个条目结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogEntry {
    id: String,
    path: String,
    name: String,
    size: u64,
    mime_type: String,
    asset_type: AssetType,
    created_at: String,
    #[serde(default = "default_origins")]
    origins: Vec<AssetOrigin>,
    sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    derived: Option<HashMap<String, DerivedDataInfo>>,

    // 旧版本字段，仅用于向后兼容
    #[serde(skip_serializing)]
    source_module: Option<String>,
    #[serde(skip_serializing)]
    origin_type: Option<AssetOriginType>,
}

/// 为旧数据提供默认的空 origins 数组
fn default_origins() -> Vec<AssetOrigin> {
    Vec::new()
}

impl CatalogEntry {
    /// 迁移旧格式数据到新格式
    /// 如果 origins 为空但存在旧字段，则从旧字段构建 origins
    fn migrate_if_needed(&mut self) {
        if self.origins.is_empty() {
            // 如果有旧的 source_module 和 origin_type，创建一个 origin
            if let (Some(module), Some(origin_type)) = (&self.source_module, &self.origin_type) {
                self.origins.push(AssetOrigin {
                    origin_type: origin_type.clone(),
                    source: String::new(), // 旧数据没有记录具体 source
                    source_module: module.clone(),
                });
            } else if let Some(module) = &self.source_module {
                // 如果只有 source_module，使用 Local 作为默认类型
                self.origins.push(AssetOrigin {
                    origin_type: AssetOriginType::Local,
                    source: String::new(),
                    source_module: module.clone(),
                });
            }
        }
    }
}

/// 获取 Catalog 索引文件的路径
fn get_catalog_path(base_dir: &Path) -> Result<PathBuf, String> {
    let catalog_dir = base_dir.join(".catalog");
    if !catalog_dir.exists() {
        fs::create_dir_all(&catalog_dir).map_err(|e| format!("无法创建 Catalog 目录: {}", e))?;
    }
    Ok(catalog_dir.join("assets.jsonl"))
}

/// 将 Asset 转换为 CatalogEntry
fn convert_asset_to_catalog_entry(asset: &Asset) -> CatalogEntry {
    CatalogEntry {
        id: asset.id.clone(),
        path: asset.path.clone(),
        name: asset.name.clone(),
        size: asset.size,
        mime_type: asset.mime_type.clone(),
        asset_type: asset.asset_type.clone(),
        created_at: asset.created_at.clone(),
        origins: asset.origins.clone(),
        sha256: asset.metadata.as_ref().and_then(|m| m.sha256.clone()),
        derived: asset.metadata.as_ref().and_then(|m| m.derived.clone()),
        // 旧字段设为 None，仅用于反序列化兼容
        source_module: None,
        origin_type: None,
    }
}

/// 将 CatalogEntry 转换为 Asset
fn convert_entry_to_asset(entry: CatalogEntry, base_dir: &Path) -> Asset {
    let thumbnail_relative = format!(".thumbnails/{}.jpg", entry.id);
    let thumbnail_path = base_dir.join(&thumbnail_relative);

    let source_module = entry
        .origins
        .first()
        .map(|o| o.source_module.clone())
        .unwrap_or_else(|| "unknown".to_string());

    Asset {
        id: entry.id,
        asset_type: entry.asset_type,
        mime_type: entry.mime_type,
        name: entry.name,
        path: entry.path,
        thumbnail_path: if thumbnail_path.exists() {
            Some(thumbnail_relative)
        } else {
            None
        },
        size: entry.size,
        created_at: entry.created_at,
        source_module, // For backward compatibility, use the first one
        origins: entry.origins,
        metadata: Some(AssetMetadata {
            width: None,
            height: None,
            duration: None,
            sha256: entry.sha256,
            derived: entry.derived,
        }),
    }
}

/// 追加条目到 Catalog 文件
fn append_to_catalog(base_dir: &Path, entry: &CatalogEntry) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::{BufWriter, Write};

    let catalog_path = get_catalog_path(base_dir)?;
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(catalog_path)
        .map_err(|e| format!("无法打开 Catalog 文件进行追加: {}", e))?;

    let mut writer = BufWriter::new(file);
    let line =
        serde_json::to_string(entry).map_err(|e| format!("序列化 Catalog 条目失败: {}", e))?;
    writeln!(writer, "{}", line).map_err(|e| format!("写入 Catalog 文件失败: {}", e))?;

    Ok(())
}

/// 从 Catalog 文件中移除条目
fn remove_from_catalog(base_dir: &Path, asset_id_to_delete: &str) -> Result<(), String> {
    use std::io::{BufRead, BufReader, BufWriter, Write};

    let catalog_path = get_catalog_path(base_dir)?;
    if !catalog_path.exists() {
        return Ok(());
    }

    let temp_catalog_path = catalog_path.with_extension("jsonl.tmp");

    let input_file = fs::File::open(&catalog_path)
        .map_err(|e| format!("无法打开 Catalog 文件进行读取: {}", e))?;
    let reader = BufReader::new(input_file);

    let output_file = fs::File::create(&temp_catalog_path)
        .map_err(|e| format!("无法创建临时 Catalog 文件: {}", e))?;
    let mut writer = BufWriter::new(output_file);

    for line in reader.lines() {
        let line_content = line.map_err(|e| format!("读取 Catalog 文件行失败: {}", e))?;
        if line_content.trim().is_empty() {
            continue;
        }

        if let Ok(entry) = serde_json::from_str::<CatalogEntry>(&line_content) {
            if entry.id != asset_id_to_delete {
                writeln!(writer, "{}", line_content)
                    .map_err(|e| format!("写入临时 Catalog 文件失败: {}", e))?;
            }
        } else {
            writeln!(writer, "{}", line_content)
                .map_err(|e| format!("写入临时 Catalog 文件失败: {}", e))?;
        }
    }

    writer
        .flush()
        .map_err(|e| format!("刷新临时 Catalog 文件缓冲区失败: {}", e))?;

    fs::rename(&temp_catalog_path, &catalog_path)
        .map_err(|e| format!("重命名临时 Catalog 文件失败: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn list_assets_paginated(
    app: AppHandle,
    payload: ListAssetsPaginatedPayload,
) -> Result<PaginatedAssetsResponse, String> {
    use std::io::{BufRead, BufReader};

    let base_path = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path);
    let catalog_path = get_catalog_path(&base_dir)?;

    if !catalog_path.exists() {
        return Ok(PaginatedAssetsResponse {
            items: vec![],
            total_items: 0,
            total_pages: 0,
            has_more: false,
            page: payload.page,
        });
    }

    let file =
        fs::File::open(&catalog_path).map_err(|e| format!("无法打开 Catalog 文件: {}", e))?;
    let reader = BufReader::new(file);

    let mut all_entries = Vec::new();
    for line in reader.lines() {
        let line_content = line.map_err(|e| format!("读取 Catalog 文件行失败: {}", e))?;
        if line_content.trim().is_empty() {
            continue;
        }
        let mut entry: CatalogEntry = serde_json::from_str(&line_content)
            .map_err(|e| format!("解析 Catalog 条目失败: {}", e))?;

        // 迁移旧格式数据
        entry.migrate_if_needed();

        all_entries.push(entry);
    }

    // --- 筛选 ---
    // 如果需要筛选重复项，首先计算所有哈希值的出现次数
    let duplicate_hashes: HashSet<String> = if payload.show_duplicates_only {
        let mut hash_counts = HashMap::new();
        for entry in &all_entries {
            if let Some(hash) = &entry.sha256 {
                if !hash.is_empty() {
                    *hash_counts.entry(hash.clone()).or_insert(0) += 1;
                }
            }
        }
        hash_counts
            .into_iter()
            .filter(|(_, count)| *count > 1)
            .map(|(hash, _)| hash)
            .collect()
    } else {
        HashSet::new()
    };

    let filtered_entries: Vec<CatalogEntry> = all_entries
        .into_iter()
        .filter(|entry| {
            let type_match = payload
                .filter_type
                .as_ref()
                .is_none_or(|t| entry.asset_type == *t);

            let origin_match = payload.filter_origin.as_ref().is_none_or(|filter_origin| {
                entry
                    .origins
                    .iter()
                    .any(|o| &o.origin_type == filter_origin)
            });

            let source_module_match =
                payload
                    .filter_source_module
                    .as_ref()
                    .is_none_or(|filter_module| {
                        entry
                            .origins
                            .iter()
                            .any(|o| &o.source_module == filter_module)
                    });

            let search_match = match &payload.search_query {
                Some(query) if !query.is_empty() => {
                    entry.name.to_lowercase().contains(&query.to_lowercase())
                }
                _ => true,
            };

            let duplicates_match = if payload.show_duplicates_only {
                entry
                    .sha256
                    .as_ref()
                    .is_some_and(|hash| !hash.is_empty() && duplicate_hashes.contains(hash))
            } else {
                true
            };

            type_match && origin_match && source_module_match && search_match && duplicates_match
        })
        .collect();

    // --- 排序 ---
    let mut sorted_entries = filtered_entries;
    sorted_entries.sort_by(|a, b| {
        let ordering = match payload.sort_by {
            AssetSortBy::Date => b.created_at.cmp(&a.created_at), // 默认降序
            AssetSortBy::Name => a.name.cmp(&b.name),
            AssetSortBy::Size => b.size.cmp(&a.size), // 默认降序
        };

        if matches!(payload.sort_order, SortOrder::Asc) {
            ordering.reverse()
        } else {
            ordering
        }
    });

    // --- 分页 ---
    let total_items = sorted_entries.len() as u64;
    let page_size = payload.page_size as u64;
    let total_pages = if total_items == 0 {
        0
    } else {
        total_items.div_ceil(page_size)
    } as u32;

    let page_index = payload.page.saturating_sub(1) as u64;
    let start = page_index * page_size;
    let end = (start + page_size).min(total_items);

    let items_for_page = if start < total_items {
        sorted_entries[start as usize..end as usize]
            .iter()
            .map(|entry| convert_entry_to_asset(entry.clone(), &base_dir))
            .collect()
    } else {
        vec![]
    };

    Ok(PaginatedAssetsResponse {
        items: items_for_page,
        total_items,
        total_pages,
        has_more: payload.page < total_pages,
        page: payload.page,
    })
}

#[tauri::command]
pub async fn get_asset_stats(app: AppHandle) -> Result<AssetStats, String> {
    use std::io::{BufRead, BufReader};

    let base_path = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path);
    let catalog_path = get_catalog_path(&base_dir)?;

    if !catalog_path.exists() {
        return Ok(AssetStats::default());
    }

    let file =
        fs::File::open(&catalog_path).map_err(|e| format!("无法打开 Catalog 文件: {}", e))?;
    let reader = BufReader::new(file);

    let mut stats = AssetStats::default();

    for line in reader.lines() {
        let line_content = line.map_err(|e| format!("读取 Catalog 文件行失败: {}", e))?;
        if line_content.trim().is_empty() {
            continue;
        }

        let mut entry: CatalogEntry = serde_json::from_str(&line_content)
            .map_err(|e| format!("解析 Catalog 条目失败: {}", e))?;

        // 迁移旧格式数据
        entry.migrate_if_needed();

        stats.total_assets += 1;
        stats.total_size += entry.size;
        *stats.type_counts.entry(entry.asset_type).or_insert(0) += 1;
        // 统计来源模块和来源方式
        for origin in &entry.origins {
            *stats
                .source_module_counts
                .entry(origin.source_module.clone())
                .or_insert(0) += 1;
            *stats
                .origin_counts
                .entry(origin.origin_type.clone())
                .or_insert(0) += 1;
        }
    }

    Ok(stats)
}

#[tauri::command]
pub async fn rebuild_catalog_index(app: AppHandle) -> Result<String, String> {
    use std::io::{BufRead, BufReader, BufWriter, Write};

    let base_path = get_asset_base_path(app.clone())?;
    let base_dir = PathBuf::from(&base_path);
    let catalog_path = get_catalog_path(&base_dir)?;

    // 第一步：读取现有的 Catalog 以保留元数据（如 origins, source_module）
    let mut existing_metadata: HashMap<String, CatalogEntry> = HashMap::new();
    if catalog_path.exists() {
        if let Ok(file) = fs::File::open(&catalog_path) {
            let reader = BufReader::new(file);
            for line in reader.lines().map_while(Result::ok) {
                if line.trim().is_empty() {
                    continue;
                }
                if let Ok(mut entry) = serde_json::from_str::<CatalogEntry>(&line) {
                    entry.migrate_if_needed();
                    existing_metadata.insert(entry.id.clone(), entry);
                }
            }
        }
    }

    let asset_type_dirs = ["images", "audio", "videos", "documents", "other"];
    let mut all_file_paths: Vec<(PathBuf, String)> = Vec::new();

    // 第二步：收集所有文件路径并统计总数
    for type_dir_str in &asset_type_dirs {
        let type_dir = base_dir.join(type_dir_str);
        if !type_dir.exists() || !type_dir.is_dir() {
            continue;
        }

        if let Ok(year_month_entries) = fs::read_dir(&type_dir) {
            for year_month_entry in year_month_entries.flatten() {
                let year_month_path = year_month_entry.path();
                if !year_month_path.is_dir() {
                    continue;
                }

                if let Ok(file_entries) = fs::read_dir(&year_month_path) {
                    for file_entry in file_entries.flatten() {
                        let file_path = file_entry.path();
                        if file_path.is_file()
                            && file_path.file_name() != Some(".index.json".as_ref())
                        {
                            all_file_paths.push((file_path, type_dir_str.to_string()));
                        }
                    }
                }
            }
        }
    }

    let total_files = all_file_paths.len();

    // 第三步：处理文件并写入 Catalog，同时报告进度
    let file =
        fs::File::create(&catalog_path).map_err(|e| format!("无法创建 Catalog 文件: {}", e))?;
    let mut writer = BufWriter::new(file);

    for (current_processed, (file_path, asset_type_str)) in all_file_paths.iter().enumerate() {
        let current_processed = current_processed + 1;

        if let Ok(mut asset) = build_asset_from_path(file_path, &base_dir) {
            // 尝试从旧数据中恢复元数据
            if let Some(old_entry) = existing_metadata.get(&asset.id) {
                asset.origins = old_entry.origins.clone();
                // 保持 source_module 兼容性
                if let Some(first_origin) = asset.origins.first() {
                    asset.source_module = first_origin.source_module.clone();
                }
            }

            let entry = convert_asset_to_catalog_entry(&asset);
            let line = serde_json::to_string(&entry)
                .map_err(|e| format!("序列化 Catalog 条目失败: {}", e))?;
            if let Err(e) = writeln!(writer, "{}", line) {
                log::error!("写入 Catalog 文件失败 for {}: {}", file_path.display(), e);
            }
        }

        // 发送进度事件
        let progress = RebuildIndexProgress {
            current: current_processed,
            total: total_files,
            current_type: asset_type_str.clone(),
        };
        app.emit("rebuild-catalog-progress", &progress)
            .unwrap_or_else(|e| {
                log::error!("Failed to emit rebuild-catalog-progress event: {}", e)
            });
    }

    writer
        .flush()
        .map_err(|e| format!("刷新 Catalog 文件缓冲区失败: {}", e))?;

    Ok(format!("目录索引重建完成，共处理 {} 个资产。", total_files))
}
/// 读取所有 catalog 条目，应用修改，然后将其写回。
fn update_catalog_in_place<F>(base_dir: &Path, mut modifier: F) -> Result<(), String>
where
    F: FnMut(&mut Vec<CatalogEntry>),
{
    use std::io::{BufRead, BufReader, BufWriter, Write};

    let catalog_path = get_catalog_path(base_dir)?;
    let mut entries = Vec::new();

    // 如果文件存在，读取所有条目
    if catalog_path.exists() {
        let file = fs::File::open(&catalog_path)
            .map_err(|e| format!("无法打开 Catalog 文件进行读取: {}", e))?;
        let reader = BufReader::new(file);

        for line in reader.lines() {
            let line_content = line.map_err(|e| format!("读取 Catalog 文件行失败: {}", e))?;
            if !line_content.trim().is_empty() {
                if let Ok(mut entry) = serde_json::from_str::<CatalogEntry>(&line_content) {
                    // 迁移旧格式数据
                    entry.migrate_if_needed();
                    entries.push(entry);
                }
            }
        }
    }

    // 应用修改
    modifier(&mut entries);

    // 将修改后的条目写回
    let temp_catalog_path = catalog_path.with_extension("jsonl.tmp");
    let output_file = fs::File::create(&temp_catalog_path)
        .map_err(|e| format!("无法创建临时 Catalog 文件: {}", e))?;
    let mut writer = BufWriter::new(output_file);

    for entry in entries {
        let line =
            serde_json::to_string(&entry).map_err(|e| format!("序列化 Catalog 条目失败: {}", e))?;
        writeln!(writer, "{}", line).map_err(|e| format!("写入临时 Catalog 文件失败: {}", e))?;
    }

    writer
        .flush()
        .map_err(|e| format!("刷新临时 Catalog 文件缓冲区失败: {}", e))?;

    fs::rename(&temp_catalog_path, &catalog_path)
        .map_err(|e| format!("重命名临时 Catalog 文件失败: {}", e))?;

    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveSourceResult {
    deleted: bool,
    asset: Option<Asset>,
}

/// 从资产中移除一个来源。如果这是最后一个来源，资产将被物理删除。
#[tauri::command]
pub async fn remove_asset_source(
    app: AppHandle,
    asset_id: String,
    source_module: String,
) -> Result<RemoveSourceResult, String> {
    let base_path = get_asset_base_path(app.clone())?;
    let base_dir = PathBuf::from(&base_path);

    let mut result: Option<RemoveSourceResult> = None;
    let mut asset_to_delete: Option<(String, String)> = None;

    update_catalog_in_place(&base_dir, |entries| {
        let mut updated_asset: Option<Asset> = None;

        entries.retain_mut(|entry| {
            if entry.id == asset_id {
                // 找到资产，移除来源
                entry.origins.retain(|o| o.source_module != source_module);

                if entry.origins.is_empty() {
                    // 没有来源了，标记为待删除
                    asset_to_delete = Some((entry.id.clone(), entry.path.clone()));
                    result = Some(RemoveSourceResult {
                        deleted: true,
                        asset: None,
                    });
                    return false; // 从条目列表中移除
                } else {
                    // 仍然有来源，准备返回更新后的资产
                    updated_asset = Some(convert_entry_to_asset(entry.clone(), &base_dir));
                    result = Some(RemoveSourceResult {
                        deleted: false,
                        asset: updated_asset.clone(),
                    });
                    return true; // 保留在条目列表中
                }
            }
            true // 保留其他条目
        });
    })?;

    // 在迭代之后执行物理删除
    if let Some((id, path)) = asset_to_delete {
        // 同步等待物理删除完成，确保数据一致性
        if let Err(e) = delete_asset(app.clone(), id, path).await {
            log::error!("在移除来源期间删除资产文件失败: {}", e);
            // 即使物理删除失败，Catalog 中的条目已被移除，记录错误但继续
        }
    }

    result.ok_or_else(|| format!("找不到 ID 为 '{}' 的资产", asset_id))
}

/// 为现有资产添加一个新来源
#[tauri::command]
pub async fn add_asset_source(
    app: AppHandle,
    asset_id: String,
    origin: AssetOrigin,
) -> Result<Asset, String> {
    let base_path = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path);
    let mut updated_asset: Option<Asset> = None;

    update_catalog_in_place(&base_dir, |entries| {
        for entry in entries.iter_mut() {
            if entry.id == asset_id {
                // 如果来源不存在，则添加新来源
                if !entry
                    .origins
                    .iter()
                    .any(|o| o.source_module == origin.source_module)
                {
                    entry.origins.push(origin.clone());
                }
                updated_asset = Some(convert_entry_to_asset(entry.clone(), &base_dir));
                break;
            }
        }
    })?;

    updated_asset.ok_or_else(|| format!("找不到 ID 为 '{}' 的资产", asset_id))
}

/// 完全删除资产（移除所有来源并删除文件）
#[tauri::command]
pub async fn remove_asset_completely(app: AppHandle, asset_id: String) -> Result<(), String> {
    let base_path = get_asset_base_path(app.clone())?;
    let base_dir = PathBuf::from(&base_path);

    let mut asset_to_delete: Option<(String, String)> = None;

    // 从 Catalog 中移除并获取资产信息
    update_catalog_in_place(&base_dir, |entries| {
        entries.retain(|entry| {
            if entry.id == asset_id {
                asset_to_delete = Some((entry.id.clone(), entry.path.clone()));
                false // 从列表中移除
            } else {
                true // 保留其他条目
            }
        });
    })?;

    // 执行物理删除
    if let Some((id, path)) = asset_to_delete {
        delete_asset(app.clone(), id, path).await?;
    } else {
        return Err(format!("找不到 ID 为 '{}' 的资产", asset_id));
    }

    Ok(())
}

/// 批量完全删除资产（移除所有来源并删除文件）
#[tauri::command]
pub async fn remove_assets_completely(
    app: AppHandle,
    asset_ids: Vec<String>,
) -> Result<Vec<String>, String> {
    let base_path = get_asset_base_path(app.clone())?;
    let base_dir = PathBuf::from(&base_path);

    let mut assets_to_delete: Vec<(String, String)> = Vec::new();
    let asset_ids_set: HashSet<String> = asset_ids.into_iter().collect();

    // 批量从 Catalog 中移除并收集需要删除的资产信息
    update_catalog_in_place(&base_dir, |entries| {
        entries.retain(|entry| {
            if asset_ids_set.contains(&entry.id) {
                assets_to_delete.push((entry.id.clone(), entry.path.clone()));
                false // 从列表中移除
            } else {
                true // 保留其他条目
            }
        });
    })?;

    // 批量执行物理删除
    let mut failed_ids = Vec::new();
    for (id, path) in assets_to_delete {
        if let Err(e) = delete_asset(app.clone(), id.clone(), path).await {
            log::error!("删除资产 {} 失败: {}", id, e);
            failed_ids.push(id);
        }
    }

    if failed_ids.is_empty() {
        Ok(vec![])
    } else {
        Ok(failed_ids)
    }
}

/// 根据哈希值查找资产
/// 根据哈希值在当月索引中查找资产
///
/// 仅在当前月份的目录中查找，以支持按月滚动的清理策略。
/// 如果提供了 source_to_add，且找到了资产，会将该来源添加到资产中。
#[tauri::command]
pub async fn find_asset_by_hash(
    app: AppHandle,
    hash: String,
    source_to_add: Option<AssetOrigin>,
) -> Result<Option<Asset>, String> {
    let base_path = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path);

    // 遍历所有资产类型，只检查当月索引
    // 这样可以避免全量扫描 Catalog，且符合按月管理的策略
    let asset_types = [
        AssetType::Image,
        AssetType::Audio,
        AssetType::Video,
        AssetType::Document,
        AssetType::Other,
    ];

    for asset_type in &asset_types {
        // check_duplicate_in_current_month 已经封装了读取当月索引、验证文件存在、读取 Catalog 信息的逻辑
        if let Ok(Some(asset)) = check_duplicate_in_current_month(&base_dir, asset_type, &hash) {
            // 找到了！
            let asset_id = asset.id.clone();

            // 如果需要添加来源，则更新 Catalog
            if let Some(origin) = source_to_add {
                let mut updated_asset: Option<Asset> = None;

                update_catalog_in_place(&base_dir, |entries| {
                    for entry in entries.iter_mut() {
                        if entry.id == asset_id {
                            // 如果来源不存在，则添加新来源
                            if !entry
                                .origins
                                .iter()
                                .any(|o| o.source_module == origin.source_module)
                            {
                                entry.origins.push(origin.clone());
                            }
                            updated_asset = Some(convert_entry_to_asset(entry.clone(), &base_dir));
                            break;
                        }
                    }
                })?;

                return Ok(updated_asset);
            } else {
                // 不需要添加来源，直接返回找到的 Asset
                return Ok(Some(asset));
            }
        }
    }

    Ok(None)
}

/// 更新资产的衍生数据信息
#[tauri::command]
pub async fn update_asset_derived_data(
    app: AppHandle,
    asset_id: String,
    key: String,
    data: DerivedDataInfo,
) -> Result<Asset, String> {
    let base_path = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path);
    let mut updated_asset: Option<Asset> = None;

    update_catalog_in_place(&base_dir, |entries| {
        for entry in entries.iter_mut() {
            if entry.id == asset_id {
                // 初始化 derived map 如果不存在
                if entry.derived.is_none() {
                    entry.derived = Some(HashMap::new());
                }

                // 更新数据
                if let Some(derived_map) = &mut entry.derived {
                    derived_map.insert(key.clone(), data.clone());
                }

                updated_asset = Some(convert_entry_to_asset(entry.clone(), &base_dir));
                break;
            }
        }
    })?;

    updated_asset.ok_or_else(|| format!("找不到 ID 为 '{}' 的资产", asset_id))
}

/// 根据 ID 获取单个资产
#[tauri::command]
pub async fn get_asset_by_id(
    app: AppHandle,
    asset_id: String,
) -> Result<Option<Asset>, String> {
    use std::io::{BufRead, BufReader};

    let base_path = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path);
    let catalog_path = get_catalog_path(&base_dir)?;

    if !catalog_path.exists() {
        return Ok(None);
    }

    let file =
        fs::File::open(&catalog_path).map_err(|e| format!("无法打开 Catalog 文件: {}", e))?;
    let reader = BufReader::new(file);

    for line in reader.lines() {
        let line_content = line.map_err(|e| format!("读取 Catalog 文件行失败: {}", e))?;
        if line_content.trim().is_empty() {
            continue;
        }
        if let Ok(mut entry) = serde_json::from_str::<CatalogEntry>(&line_content) {
            if entry.id == asset_id {
                entry.migrate_if_needed();
                let asset = convert_entry_to_asset(entry, &base_dir);
                return Ok(Some(asset));
            }
        }
    }

    Ok(None)
}
