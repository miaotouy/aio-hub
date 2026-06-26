use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub const DOCUMENT_CONVERSION_TIMEOUT_SECONDS: u64 = 120;

const ASSET_MANAGER_MODULE_NAME: &str = "asset-manager";
const ASSET_MANAGER_CONFIG_FILE: &str = "config.json";

fn default_true() -> bool {
    true
}

fn default_conversion_timeout() -> u64 {
    DOCUMENT_CONVERSION_TIMEOUT_SECONDS
}

fn default_provider() -> String {
    "auto".to_string()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetManagerModuleConfig {
    #[serde(default)]
    pub document_conversion: DocumentConversionConfig,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentConversionConfig {
    #[serde(default = "default_true")]
    pub auto_convert_legacy_doc: bool,
    #[serde(default = "default_provider")]
    pub preferred_provider: String,
    #[serde(default)]
    pub libre_office_path: String,
    #[serde(default)]
    pub abi_word_path: String,
    #[serde(default = "default_conversion_timeout")]
    pub timeout_seconds: u64,
    #[serde(default = "default_true")]
    pub isolated_profile: bool,
}

impl Default for DocumentConversionConfig {
    fn default() -> Self {
        Self {
            auto_convert_legacy_doc: true,
            preferred_provider: default_provider(),
            libre_office_path: String::new(),
            abi_word_path: String::new(),
            timeout_seconds: DOCUMENT_CONVERSION_TIMEOUT_SECONDS,
            isolated_profile: true,
        }
    }
}

pub fn get_asset_manager_config_path(app: &AppHandle) -> PathBuf {
    crate::get_app_data_dir(app.config())
        .join(ASSET_MANAGER_MODULE_NAME)
        .join(ASSET_MANAGER_CONFIG_FILE)
}

pub fn read_document_conversion_config(app: &AppHandle) -> Option<DocumentConversionConfig> {
    let config_path = get_asset_manager_config_path(app);
    let content = fs::read_to_string(config_path).ok()?;
    let config = serde_json::from_str::<AssetManagerModuleConfig>(&content).ok()?;
    Some(config.document_conversion)
}

/// 返回已启用的转换配置，否则返回 None
pub fn active_document_conversion_config(app: &AppHandle) -> Option<DocumentConversionConfig> {
    let config = read_document_conversion_config(app)?;
    if !config.auto_convert_legacy_doc {
        None
    } else {
        Some(config)
    }
}

/// 判断文件是否为旧版 Word DOC 格式
pub fn is_legacy_word_document(path: &Path, mime: &str) -> bool {
    path.extension()
        .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("doc"))
        .unwrap_or(false)
        || mime.starts_with("application/msword")
}

/// 判断文件是否为旧版 PowerPoint PPT 格式
pub fn is_legacy_ppt_document(path: &Path, mime: &str) -> bool {
    path.extension()
        .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("ppt"))
        .unwrap_or(false)
        || mime.starts_with("application/vnd.ms-powerpoint")
}

/// 判断文件是否为旧版 Excel XLS 格式
pub fn is_legacy_excel_document(path: &Path, mime: &str) -> bool {
    path.extension()
        .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("xls"))
        .unwrap_or(false)
        || mime.starts_with("application/vnd.ms-excel")
}
