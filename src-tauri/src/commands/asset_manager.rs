use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;
use chrono::Utc;
use sha2::{Digest, Sha256};
use content_inspector::{inspect, ContentType};
use infer;

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
                    matches!(inspect(&buffer), ContentType::UTF_8 | ContentType::UTF_8_BOM)
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

/// 根据文件内容和扩展名智能推断 MIME 类型
///
/// 优先使用 infer 库通过文件魔数检测，回退到扩展名映射
pub fn guess_mime_type(path: &Path) -> String {
    // 尝试读取文件前 8KB 用于魔数检测
    if let Ok(mut file) = fs::File::open(path) {
        use std::io::Read;
        let mut buffer = vec![0; 8192];
        if let Ok(n) = file.read(&mut buffer) {
            buffer.truncate(n);
            
            // 使用 infer 库通过文件魔数检测
            if let Some(kind) = infer::get(&buffer) {
                return kind.mime_type().to_string();
            }
        }
    }
    
    // 回退到基于扩展名的检测
    if let Some(ext) = path.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        
        // 常见的文本文件扩展名（更全面的列表）
        let text_extensions = [
            // 常规文本
            "txt", "text", "log", "cfg", "conf", "ini", "env",
            // 标记语言
            "md", "markdown", "rst", "adoc", "asciidoc",
            "xml", "html", "htm", "xhtml", "svg",
            // 数据格式
            "json", "yaml", "yml", "toml", "csv", "tsv",
            // 编程语言
            "js", "jsx", "ts", "tsx", "mjs", "cjs",
            "py", "pyw", "pyi", "rb", "php", "java", "kt", "kts",
            "c", "cpp", "cc", "cxx", "h", "hpp", "hxx",
            "cs", "go", "rs", "swift", "m", "mm",
            "scala", "lua", "perl", "pl", "r",
            "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
            // Web
            "css", "scss", "sass", "less", "styl",
            "vue", "svelte", "astro",
            // 配置和脚本
            "gitignore", "dockerignore", "editorconfig",
            "makefile", "cmake", "gradle",
            // 其他
            "sql", "graphql", "proto", "thrift",
        ];
        
        if text_extensions.contains(&ext_str.as_str()) {
            return format!("text/{}", ext_str);
        }
        
        // 已知的特定 MIME 类型映射
        let mime = match ext_str.as_str() {
            // 图片
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            "ico" => "image/x-icon",
            "tiff" | "tif" => "image/tiff",
            "avif" => "image/avif",
            // 音频
            "mp3" => "audio/mpeg",
            "wav" => "audio/wav",
            "ogg" => "audio/ogg",
            "flac" => "audio/flac",
            "aac" => "audio/aac",
            "m4a" => "audio/mp4",
            // 视频
            "mp4" => "video/mp4",
            "webm" => "video/webm",
            "avi" => "video/x-msvideo",
            "mov" => "video/quicktime",
            "mkv" => "video/x-matroska",
            "flv" => "video/x-flv",
            // 文档
            "pdf" => "application/pdf",
            "doc" => "application/msword",
            "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xls" => "application/vnd.ms-excel",
            "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "ppt" => "application/vnd.ms-powerpoint",
            "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            // JSON
            "json" => "application/json",
            // JavaScript/TypeScript
            "js" | "mjs" | "cjs" => "application/javascript",
            "ts" | "tsx" => "application/typescript",
            // 其他
            _ => "application/octet-stream",
        };
        
        mime.to_string()
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
    let asset_type = determine_asset_type(&mime_type, Some(&source_path));
    
    let base_path = get_asset_base_path(app.clone())?;
    let base_dir = PathBuf::from(&base_path);
    
    // 计算文件哈希（如果启用去重）并检查是否重复
    let file_hash = if opts.enable_deduplication {
        let hash = calculate_file_hash(&source_path)?;
        
        // 检查当月目录中是否已存在相同哈希的文件（使用索引）
        if let Some(existing_asset) = check_duplicate_in_current_month(&base_dir, &asset_type, &hash)? {
            // 找到重复文件，直接返回已有的 Asset
            return Ok(existing_asset);
        }
        
        Some(hash)
    } else {
        None
    };
    
    let (uuid, relative_path) = generate_asset_path(&asset_type, &source_path);
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
        sha256: file_hash.clone(),
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
        id: uuid.clone(),
        asset_type: asset_type.clone(),
        mime_type,
        name: original_name,
        path: relative_path.clone(),
        thumbnail_path,
        size: file_size,
        created_at: Utc::now().to_rfc3339(),
        origin,
        metadata: Some(asset_metadata),
    };
    
    // 更新月度索引（如果启用去重且有哈希值）
    if let Some(hash) = file_hash {
        let filename = target_path.file_name()
            .ok_or("无法获取文件名")?
            .to_string_lossy()
            .to_string();
        
        if let Err(e) = update_month_index(&base_dir, &asset_type, &hash, &filename) {
            // 索引更新失败不影响导入结果，只记录错误
            eprintln!("更新月度索引失败: {}", e);
        }
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
    let mime_type = guess_mime_type(&temp_path);
    let asset_type = determine_asset_type(&mime_type, None);
    
    let base_path = get_asset_base_path(app.clone())?;
    let base_dir = PathBuf::from(&base_path);
    
    // 计算文件哈希（如果启用去重）并检查是否重复
    let file_hash = if opts.enable_deduplication {
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let hash = format!("{:x}", hasher.finalize());
        
        // 检查当月目录中是否已存在相同哈希的文件（使用索引）
        if let Some(existing_asset) = check_duplicate_in_current_month(&base_dir, &asset_type, &hash)? {
            // 找到重复文件，直接返回已有的 Asset
            return Ok(existing_asset);
        }
        
        Some(hash)
    } else {
        None
    };
    
    let (uuid, relative_path) = generate_asset_path(&asset_type, &temp_path);
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
        sha256: file_hash.clone(),
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
        id: uuid.clone(),
        asset_type: asset_type.clone(),
        mime_type,
        name: original_name,
        path: relative_path.clone(),
        thumbnail_path,
        size: file_size,
        created_at: Utc::now().to_rfc3339(),
        origin,
        metadata: Some(asset_metadata),
    };
    
    // 更新月度索引（如果启用去重且有哈希值）
    if let Some(hash) = file_hash {
        let filename = target_path.file_name()
            .ok_or("无法获取文件名")?
            .to_string_lossy()
            .to_string();
        
        if let Err(e) = update_month_index(&base_dir, &asset_type, &hash, &filename) {
            // 索引更新失败不影响导入结果，只记录错误
            eprintln!("更新月度索引失败: {}", e);
        }
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

        let content = fs::read_to_string(index_path)
            .map_err(|e| format!("读取索引文件失败: {}", e))?;
        
        serde_json::from_str(&content)
            .map_err(|e| format!("解析索引文件失败: {}", e))
    }

    fn save(&self, index_path: &Path) -> Result<(), String> {
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("序列化索引失败: {}", e))?;
        
        if let Some(parent) = index_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建索引目录失败: {}", e))?;
        }

        fs::write(index_path, content)
            .map_err(|e| format!("写入索引文件失败: {}", e))
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
            if file_path.exists() {
                return Ok(Some(build_asset_from_path(&file_path, base_dir)?));
            }
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

        for year_month_entry in fs::read_dir(&type_dir).map_err(|e| e.to_string())?.flatten() {
            let year_month_path = year_month_entry.path();
            if !year_month_path.is_dir() {
                continue;
            }

            for file_entry in fs::read_dir(&year_month_path).map_err(|e| e.to_string())?.flatten() {
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
    let relative_path = file_path.strip_prefix(base_dir).map_err(|e| e.to_string())?;
    
    let mime_type = guess_mime_type(file_path);
    let asset_type = determine_asset_type(&mime_type, Some(file_path));

    let uuid = file_path.file_stem()
        .and_then(|s| s.to_str())
        .ok_or("无法解析文件名")?
        .to_string();

    let file_hash = calculate_file_hash(file_path).ok();
    
    let asset_metadata = AssetMetadata {
        width: None,
        height: None,
        duration: None,
        sha256: file_hash,
    };

    Ok(Asset {
        id: uuid,
        asset_type,
        mime_type,
        name: file_path.file_name().unwrap().to_string_lossy().to_string(),
        path: relative_path.to_string_lossy().replace("\\", "/"),
        thumbnail_path: None, // TODO: 检查缩略图是否存在
        size: metadata.len(),
        created_at: metadata.created().map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339()).unwrap_or_default(),
        origin: None, // 无法从文件系统确定来源
        metadata: Some(asset_metadata),
    })
}
/// 根据相对路径读取文本文件内容
///
/// 该函数会自动检测文件是否为文本文件，并尝试以 UTF-8 编码读取
#[tauri::command]
pub fn read_text_file(
    app: AppHandle,
    relative_path: String,
) -> Result<String, String> {
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
    
    fs::read_to_string(&file_path)
        .map_err(|e| format!("读取文本文件失败: {}", e))
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
        
        for year_month_entry in fs::read_dir(&type_dir).map_err(|e| e.to_string())?.flatten() {
            let year_month_path = year_month_entry.path();
            if !year_month_path.is_dir() {
                continue;
            }
            
            for file_entry in fs::read_dir(&year_month_path).map_err(|e| e.to_string())?.flatten() {
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
        for year_month_entry in fs::read_dir(&type_dir).map_err(|e| e.to_string())?.flatten() {
            let year_month_path = year_month_entry.path();
            if !year_month_path.is_dir() {
                continue;
            }
            
            // 为当前月份目录创建全新的索引
            let index_path = year_month_path.join(".index.json");
            let mut new_index = MonthHashIndex::new();
            
            // 遍历该月份目录下的所有文件
            for file_entry in fs::read_dir(&year_month_path).map_err(|e| e.to_string())?.flatten() {
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
    trash::delete(&file_path)
        .map_err(|e| format!("删除文件失败: {}", e))?;
    
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
        for year_month_entry in fs::read_dir(&type_dir).map_err(|e| e.to_string())?.flatten() {
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
                    
                    hash_map.entry(hash.clone())
                        .or_default()
                        .push((
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
            
            let file_size = first_file_path.metadata()
                .map(|m| m.len())
                .unwrap_or(0);
            
            let count = files_info.len();
            
            // 计算浪费的空间（重复文件数 - 1）* 文件大小
            wasted_space += file_size * (count as u64 - 1);
            total_files += count;
            
            duplicates.push(DuplicateFileInfo {
                hash: hash.clone(),
                files: files_info.iter().map(|(path, _, _, _)| path.clone()).collect(),
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
