use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;
use chrono::Utc;
use sha2::{Digest, Sha256};

/// 资产的来源类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssetOriginType {
    Local,
    Clipboard,
    Network,
}

/// 资产的通用类型
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<AssetOrigin>,
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
        }
    }
}

/// 根据 MIME 类型判断资产类型
fn determine_asset_type(mime: &str) -> AssetType {
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
    } else {
        AssetType::Other
    }
}

/// 根据文件扩展名推断 MIME 类型
pub fn guess_mime_type(path: &Path) -> String {
    if let Some(ext) = path.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        match ext_str.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            "bmp" => "image/bmp",
            "ico" => "image/x-icon",
            "tiff" | "tif" => "image/tiff",
            "avif" => "image/avif",
            "mp3" => "audio/mpeg",
            "wav" => "audio/wav",
            "ogg" => "audio/ogg",
            "flac" => "audio/flac",
            "aac" => "audio/aac",
            "m4a" => "audio/mp4",
            "mp4" => "video/mp4",
            "webm" => "video/webm",
            "avi" => "video/x-msvideo",
            "mov" => "video/quicktime",
            "mkv" => "video/x-matroska",
            "flv" => "video/x-flv",
            "pdf" => "application/pdf",
            "doc" => "application/msword",
            "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xls" => "application/vnd.ms-excel",
            "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "ppt" => "application/vnd.ms-powerpoint",
            "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "txt" => "text/plain",
            "md" => "text/markdown",
            "json" => "application/json",
            "xml" => "application/xml",
            "html" | "htm" => "text/html",
            "css" => "text/css",
            "js" => "application/javascript",
            "ts" => "application/typescript",
            _ => "application/octet-stream",
        }
        .to_string()
    } else {
        "application/octet-stream".to_string()
    }
}

/// 计算文件的 SHA-256 哈希值
fn calculate_file_hash(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path)
        .map_err(|e| format!("读取文件失败: {}", e))?;
    
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let result = hasher.finalize();
    
    Ok(format!("{:x}", result))
}

/// 生成资产的存储路径
/// 格式: {资产类型}/{年}-{月}/{UUID}.{扩展名}
fn generate_asset_path(asset_type: &AssetType, original_path: &Path) -> (String, String) {
    let now = Utc::now();
    let year_month = now.format("%Y-%m").to_string();
    let uuid = Uuid::new_v4().to_string();
    
    let type_dir = match asset_type {
        AssetType::Image => "images",
        AssetType::Audio => "audio",
        AssetType::Video => "videos",
        AssetType::Document => "documents",
        AssetType::Other => "other",
    };
    
    let extension = original_path
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_else(|| "bin".to_string());
    
    let filename = format!("{}.{}", uuid, extension);
    let relative_path = format!("{}/{}/{}", type_dir, year_month, filename);
    
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
        .get("customAssetPath")?  // 获取字段，不存在返回 None
        .as_str()?                // 转为字符串，类型不对返回 None
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
    let app_data_dir = app.path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    
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
        fs::create_dir_all(&assets_dir)
            .map_err(|e| format!("无法创建默认资产目录: {}", e))?;
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
    
    let metadata = source_path.metadata()
        .map_err(|e| format!("读取文件元数据失败: {}", e))?;
    let file_size = metadata.len();
    
    let mime_type = guess_mime_type(&source_path);
    let asset_type = determine_asset_type(&mime_type);
    
    let file_hash = if opts.enable_deduplication {
        Some(calculate_file_hash(&source_path)?)
    } else {
        None
    };
    
    let (uuid, relative_path) = generate_asset_path(&asset_type, &source_path);
    
    let base_path = get_asset_base_path(app.clone())?;
    let base_dir = PathBuf::from(&base_path);
    let target_path = base_dir.join(&relative_path);
    
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目标目录失败: {}", e))?;
    }
    
    fs::copy(&source_path, &target_path)
        .map_err(|e| format!("复制文件失败: {}", e))?;
    
    let original_name = source_path
        .file_name()
        .ok_or_else(|| "无法获取文件名".to_string())?
        .to_string_lossy()
        .to_string();
    
    let mut asset_metadata = AssetMetadata {
        width: None,
        height: None,
        duration: None,
        sha256: file_hash,
    };
    
    if matches!(asset_type, AssetType::Image) {
        if let Ok(img) = image::open(&target_path) {
            asset_metadata.width = Some(img.width());
            asset_metadata.height = Some(img.height());
        }
    }
    
    let thumbnail_path = if opts.generate_thumbnail && matches!(asset_type, AssetType::Image) {
        generate_thumbnail(&target_path, &base_dir, &uuid)?
    } else {
        None
    };
    
    let origin = opts.origin.or_else(|| Some(AssetOrigin {
        origin_type: AssetOriginType::Local,
        source: original_path.clone(),
    }));
    
    let asset = Asset {
        id: uuid,
        asset_type,
        mime_type,
        name: original_name,
        path: relative_path,
        thumbnail_path,
        size: file_size,
        created_at: Utc::now().to_rfc3339(),
        origin,
        metadata: Some(asset_metadata),
    };
    
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
    let mime_type = guess_mime_type(&temp_path);
    let asset_type = determine_asset_type(&mime_type);
    
    let file_hash = if opts.enable_deduplication {
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        Some(format!("{:x}", hasher.finalize()))
    } else {
        None
    };
    
    let (uuid, relative_path) = generate_asset_path(&asset_type, &temp_path);
    
    let base_path = get_asset_base_path(app.clone())?;
    let base_dir = PathBuf::from(&base_path);
    let target_path = base_dir.join(&relative_path);
    
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目标目录失败: {}", e))?;
    }
    
    fs::write(&target_path, &bytes)
        .map_err(|e| format!("写入文件失败: {}", e))?;
    
    let file_size = bytes.len() as u64;
    
    let mut asset_metadata = AssetMetadata {
        width: None,
        height: None,
        duration: None,
        sha256: file_hash,
    };
    
    if matches!(asset_type, AssetType::Image) {
        if let Ok(img) = image::load_from_memory(&bytes) {
            asset_metadata.width = Some(img.width());
            asset_metadata.height = Some(img.height());
        }
    }
    
    let thumbnail_path = if opts.generate_thumbnail && matches!(asset_type, AssetType::Image) {
        generate_thumbnail(&target_path, &base_dir, &uuid)?
    } else {
        None
    };
    
    let origin = opts.origin.or_else(|| Some(AssetOrigin {
        origin_type: AssetOriginType::Clipboard,
        source: "clipboard".to_string(),
    }));
    
    let asset = Asset {
        id: uuid,
        asset_type,
        mime_type,
        name: original_name,
        path: relative_path,
        thumbnail_path,
        size: file_size,
        created_at: Utc::now().to_rfc3339(),
        origin,
        metadata: Some(asset_metadata),
    };
    
    Ok(asset)
}

/// 生成缩略图
fn generate_thumbnail(
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
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建缩略图目录失败: {}", e))?;
    }
    
    thumbnail.save_with_format(&thumbnail_path, image::ImageFormat::Jpeg)
        .map_err(|e| format!("保存缩略图失败: {}", e))?;
    
    Ok(Some(thumbnail_relative))
}

/// 根据相对路径读取资产的二进制数据
#[tauri::command]
pub fn get_asset_binary(
    app: AppHandle,
    relative_path: String,
) -> Result<Vec<u8>, String> {
    let base_path = get_asset_base_path(app)?;
    let base_dir = PathBuf::from(&base_path);
    let file_path = base_dir.join(&relative_path);
    
    if !file_path.starts_with(&base_dir) {
        return Err("非法的文件路径".to_string());
    }
    
    if !file_path.exists() {
        return Err(format!("文件不存在: {}", relative_path));
    }
    
    fs::read(&file_path)
        .map_err(|e| format!("读取文件失败: {}", e))
}
