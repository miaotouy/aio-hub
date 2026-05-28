//! 文档转换模块
//!
//! 将旧版文档格式（如 .doc）转换为现代格式（如 .docx）。
//! 当前支持 LibreOffice 作为转换后端，架构上预留了多后端扩展能力。

mod config;
mod libreoffice;

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;
use uuid::Uuid;

// 重新导出供 asset_manager 使用的类型和函数
pub use config::{active_document_conversion_config, is_legacy_word_document};

/// 转换器检测结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentConverterCheckResult {
    pub available: bool,
    pub version: Option<String>,
    pub message: Option<String>,
}

/// 导入源准备结果（供 asset_manager 使用）
pub struct PreparedImportSource {
    pub path: PathBuf,
    pub cleanup_dir: Option<PathBuf>,
    pub warnings: Vec<ImportWarning>,
}

impl Drop for PreparedImportSource {
    fn drop(&mut self) {
        if let Some(dir) = &self.cleanup_dir {
            let _ = fs::remove_dir_all(dir);
        }
    }
}

/// 导入时产生的警告信息
#[derive(Debug, Clone)]
pub struct ImportWarning {
    pub code: String,
    pub title: String,
    pub message: String,
    pub source_path: Option<String>,
}

// --- Tauri Commands ---

/// 在常见安装路径中嗅探 LibreOffice 可执行文件
#[tauri::command]
pub async fn detect_libreoffice_path() -> Result<Option<String>, String> {
    Ok(libreoffice::detect_libreoffice_path().await)
}

/// 检查指定路径的文档转换程序是否可用
#[tauri::command]
pub async fn check_asset_manager_document_converter(
    path: String,
) -> Result<DocumentConverterCheckResult, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(DocumentConverterCheckResult {
            available: false,
            version: None,
            message: Some("未配置 LibreOffice 可执行文件路径".to_string()),
        });
    }

    match libreoffice::check_converter(trimmed).await {
        Ok(version) => Ok(DocumentConverterCheckResult {
            available: true,
            version: Some(version),
            message: None,
        }),
        Err(message) => Ok(DocumentConverterCheckResult {
            available: false,
            version: None,
            message: Some(message),
        }),
    }
}

// --- 供 asset_manager 调用的内部 API ---

/// 准备导入源：如果是旧版 DOC 文件且配置了转换器，则自动转换为 DOCX
pub async fn prepare_import_source(
    app: &AppHandle,
    original_path: &Path,
    original_path_str: &str,
    base_dir: &Path,
) -> Result<PreparedImportSource, String> {
    let mime_type = crate::utils::mime::guess_mime_type(original_path);
    if !is_legacy_word_document(original_path, &mime_type) {
        return Ok(PreparedImportSource {
            path: original_path.to_path_buf(),
            cleanup_dir: None,
            warnings: Vec::new(),
        });
    }

    let Some(conv_config) = active_document_conversion_config(app) else {
        log::info!(
            "[DocumentConverter] 检测到旧版 DOC，但未配置转换程序，按原文件入库: {}",
            original_path_str
        );
        let file_name = original_path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| original_path_str.to_string());
        return Ok(PreparedImportSource {
            path: original_path.to_path_buf(),
            cleanup_dir: None,
            warnings: vec![ImportWarning {
                code: "legacyDocConverterNotConfigured".to_string(),
                title: "旧版 DOC 未自动转换".to_string(),
                message: format!(
                    "检测到旧版 Word DOC 文件「{}」，但资产管理器没有启用可用的 LibreOffice 转换程序。文件已按原始 .doc 入库，预览、全文解析或后续处理可能受限。请在资产管理器右上角「文件操作」→「文档转换设置」中开启自动转换，并配置 LibreOffice 的 soffice 可执行文件路径；保存后重新导入该文件即可转换为 DOCX。",
                    file_name
                ),
                source_path: Some(original_path_str.to_string()),
            }],
        });
    };

    let output_dir = base_dir
        .join(".conversion-cache")
        .join(Uuid::new_v4().to_string());
    log::info!(
        "[DocumentConverter] 检测到旧版 DOC，入库前转换为 DOCX: {}",
        original_path_str
    );
    let converted_path =
        libreoffice::convert_legacy_doc_to_docx(original_path, &output_dir, &conv_config).await?;

    Ok(PreparedImportSource {
        path: converted_path,
        cleanup_dir: Some(output_dir),
        warnings: Vec::new(),
    })
}