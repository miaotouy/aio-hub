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

//! 文档转换模块
//!
//! 将旧版文档格式（如 .doc）转换为现代格式（如 .docx）。
//! 支持多个本地转换后端，优先保持导入流程可用。

mod abiword;
mod config;
mod libreoffice;
mod microsoft_office;
mod textutil;

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

// 重新导出供 asset_manager 使用的类型和函数
use config::DocumentConversionConfig;
pub use config::{
    active_document_conversion_config, is_legacy_excel_document, is_legacy_ppt_document,
    is_legacy_word_document,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DocumentConverterProvider {
    Auto,
    LibreOffice,
    MicrosoftWord,
    AbiWord,
    Textutil,
}

/// 转换器检测结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentConverterCheckResult {
    pub available: bool,
    pub version: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentConverterCandidate {
    pub provider: String,
    pub label: String,
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub message: Option<String>,
    pub requires_path: bool,
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

struct ResolvedConverter {
    provider: DocumentConverterProvider,
    config: DocumentConversionConfig,
}

impl DocumentConverterProvider {
    fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::LibreOffice => "libreOffice",
            Self::MicrosoftWord => "microsoftWord",
            Self::AbiWord => "abiWord",
            Self::Textutil => "textutil",
        }
    }
    fn label(self) -> &'static str {
        match self {
            Self::Auto => "自动选择",
            Self::LibreOffice => "LibreOffice",
            Self::MicrosoftWord => "Microsoft Office (Word/PowerPoint/Excel)",
            Self::AbiWord => "AbiWord",
            Self::Textutil => "macOS textutil",
        }
    }

    fn requires_path(self) -> bool {
        matches!(self, Self::LibreOffice | Self::AbiWord)
    }
}

impl<'de> Deserialize<'de> for DocumentConverterProvider {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Ok(parse_provider(&value))
    }
}

fn parse_provider(value: &str) -> DocumentConverterProvider {
    match value {
        "libreOffice" | "libreoffice" | "libre_office" => DocumentConverterProvider::LibreOffice,
        "microsoftWord" | "microsoft_word" | "word" => DocumentConverterProvider::MicrosoftWord,
        "abiWord" | "abiword" | "abi_word" => DocumentConverterProvider::AbiWord,
        "textutil" => DocumentConverterProvider::Textutil,
        _ => DocumentConverterProvider::Auto,
    }
}

fn converter_not_configured_warning(file_name: &str, original_path: &str) -> ImportWarning {
    ImportWarning {
        code: "legacyDocConverterNotConfigured".to_string(),
        title: "旧版 DOC 未自动转换".to_string(),
        message: format!(
            "检测到旧版 Word DOC 文件「{}」，但资产管理器没有启用可用的文档转换依赖。文件已按原始 .doc 入库，预览、全文解析或后续处理可能受限。请在资产管理器右上角「文件操作」→「文档转换设置」中启用自动转换，并配置 LibreOffice、Microsoft Word、AbiWord 或 macOS textutil；保存后重新导入该文件即可转换为 DOCX。",
            file_name
        ),
        source_path: Some(original_path.to_string()),
    }
}

// --- Tauri Commands ---

/// 在常见安装路径中嗅探 LibreOffice 可执行文件
#[tauri::command]
pub async fn detect_libreoffice_path() -> Result<Option<String>, String> {
    Ok(libreoffice::detect_libreoffice_path().await)
}

/// 检测当前系统可用的文档转换依赖
#[tauri::command]
pub async fn detect_asset_manager_document_converters(
) -> Result<Vec<DocumentConverterCandidate>, String> {
    let libre_office_path = libreoffice::detect_libreoffice_path().await;
    let libre_office = match &libre_office_path {
        Some(path) => match libreoffice::check_converter(path).await {
            Ok(version) => candidate(
                DocumentConverterProvider::LibreOffice,
                true,
                Some(path.clone()),
                Some(version),
                None,
            ),
            Err(message) => candidate(
                DocumentConverterProvider::LibreOffice,
                false,
                Some(path.clone()),
                None,
                Some(message),
            ),
        },
        None => candidate(
            DocumentConverterProvider::LibreOffice,
            false,
            None,
            None,
            Some("未检测到 LibreOffice soffice".to_string()),
        ),
    };

    let microsoft_word = match microsoft_office::check_converter().await {
        Ok(version) => candidate(
            DocumentConverterProvider::MicrosoftWord,
            true,
            None,
            Some(version),
            None,
        ),
        Err(message) => candidate(
            DocumentConverterProvider::MicrosoftWord,
            false,
            None,
            None,
            Some(message),
        ),
    };

    let abi_word_path = abiword::detect_abiword_path().await;
    let abi_word = match &abi_word_path {
        Some(path) => match abiword::check_converter(path).await {
            Ok(version) => candidate(
                DocumentConverterProvider::AbiWord,
                true,
                Some(path.clone()),
                Some(version),
                None,
            ),
            Err(message) => candidate(
                DocumentConverterProvider::AbiWord,
                false,
                Some(path.clone()),
                None,
                Some(message),
            ),
        },
        None => candidate(
            DocumentConverterProvider::AbiWord,
            false,
            None,
            None,
            Some("未检测到 AbiWord".to_string()),
        ),
    };

    let textutil = match textutil::check_converter().await {
        Ok(version) => candidate(
            DocumentConverterProvider::Textutil,
            true,
            None,
            Some(version),
            None,
        ),
        Err(message) => candidate(
            DocumentConverterProvider::Textutil,
            false,
            None,
            None,
            Some(message),
        ),
    };

    Ok(vec![libre_office, microsoft_word, abi_word, textutil])
}

/// 检查指定路径的文档转换程序是否可用
#[tauri::command]
pub async fn check_asset_manager_document_converter(
    provider: Option<String>,
    path: Option<String>,
) -> Result<DocumentConverterCheckResult, String> {
    let provider = provider
        .as_deref()
        .map(parse_provider)
        .unwrap_or(DocumentConverterProvider::LibreOffice);
    let path = path.unwrap_or_default();

    let result = match provider {
        DocumentConverterProvider::Auto => {
            let detected = detect_asset_manager_document_converters().await?;
            if let Some(available) = detected.into_iter().find(|item| item.available) {
                Ok(available.version.unwrap_or(available.label))
            } else {
                Err("未检测到可用的文档转换依赖".to_string())
            }
        }
        DocumentConverterProvider::LibreOffice => libreoffice::check_converter(path.trim()).await,
        DocumentConverterProvider::MicrosoftWord => microsoft_office::check_converter().await,
        DocumentConverterProvider::AbiWord => abiword::check_converter(path.trim()).await,
        DocumentConverterProvider::Textutil => textutil::check_converter().await,
    };

    match result {
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

fn candidate(
    provider: DocumentConverterProvider,
    available: bool,
    path: Option<String>,
    version: Option<String>,
    message: Option<String>,
) -> DocumentConverterCandidate {
    DocumentConverterCandidate {
        provider: provider.as_str().to_string(),
        label: provider.label().to_string(),
        available,
        path,
        version,
        message,
        requires_path: provider.requires_path(),
    }
}

async fn resolve_specific_converter(
    provider: DocumentConverterProvider,
    mut config: DocumentConversionConfig,
) -> Result<ResolvedConverter, String> {
    match provider {
        DocumentConverterProvider::LibreOffice => {
            if config.libre_office_path.trim().is_empty() {
                config.libre_office_path = libreoffice::detect_libreoffice_path()
                    .await
                    .ok_or_else(|| "未检测到 LibreOffice soffice".to_string())?;
            }
            Ok(ResolvedConverter { provider, config })
        }
        DocumentConverterProvider::MicrosoftWord => {
            microsoft_office::check_converter().await?;
            Ok(ResolvedConverter { provider, config })
        }
        DocumentConverterProvider::AbiWord => {
            if config.abi_word_path.trim().is_empty() {
                config.abi_word_path = abiword::detect_abiword_path()
                    .await
                    .ok_or_else(|| "未检测到 AbiWord".to_string())?;
            }
            Ok(ResolvedConverter { provider, config })
        }
        DocumentConverterProvider::Textutil => {
            textutil::check_converter().await?;
            Ok(ResolvedConverter { provider, config })
        }
        DocumentConverterProvider::Auto => resolve_auto_converter(config).await,
    }
}

async fn resolve_auto_converter(
    config: DocumentConversionConfig,
) -> Result<ResolvedConverter, String> {
    let mut configured_libre_office = config.clone();
    if !configured_libre_office.libre_office_path.trim().is_empty()
        && libreoffice::check_converter(&configured_libre_office.libre_office_path)
            .await
            .is_ok()
    {
        return Ok(ResolvedConverter {
            provider: DocumentConverterProvider::LibreOffice,
            config: configured_libre_office,
        });
    }

    if microsoft_office::check_converter().await.is_ok() {
        return Ok(ResolvedConverter {
            provider: DocumentConverterProvider::MicrosoftWord,
            config: config.clone(),
        });
    }

    let mut configured_abi_word = config.clone();
    if !configured_abi_word.abi_word_path.trim().is_empty()
        && abiword::check_converter(&configured_abi_word.abi_word_path)
            .await
            .is_ok()
    {
        return Ok(ResolvedConverter {
            provider: DocumentConverterProvider::AbiWord,
            config: configured_abi_word,
        });
    }

    if let Some(path) = libreoffice::detect_libreoffice_path().await {
        configured_libre_office.libre_office_path = path;
        return Ok(ResolvedConverter {
            provider: DocumentConverterProvider::LibreOffice,
            config: configured_libre_office,
        });
    }

    if let Some(path) = abiword::detect_abiword_path().await {
        configured_abi_word.abi_word_path = path;
        return Ok(ResolvedConverter {
            provider: DocumentConverterProvider::AbiWord,
            config: configured_abi_word,
        });
    }

    if textutil::check_converter().await.is_ok() {
        return Ok(ResolvedConverter {
            provider: DocumentConverterProvider::Textutil,
            config,
        });
    }

    Err("未检测到可用的文档转换依赖".to_string())
}

async fn resolve_converter(config: DocumentConversionConfig) -> Result<ResolvedConverter, String> {
    let preferred = parse_provider(&config.preferred_provider);
    resolve_specific_converter(preferred, config).await
}

async fn convert_legacy_doc_to_docx(
    source_path: &Path,
    output_dir: &Path,
    resolved: &ResolvedConverter,
) -> Result<PathBuf, String> {
    match resolved.provider {
        DocumentConverterProvider::LibreOffice => {
            libreoffice::convert_legacy_doc_to_docx(source_path, output_dir, &resolved.config).await
        }
        DocumentConverterProvider::MicrosoftWord => {
            microsoft_office::convert_legacy_doc_to_docx(source_path, output_dir, &resolved.config)
                .await
        }
        DocumentConverterProvider::AbiWord => {
            abiword::convert_legacy_doc_to_docx(source_path, output_dir, &resolved.config).await
        }
        DocumentConverterProvider::Textutil => {
            textutil::convert_legacy_doc_to_docx(source_path, output_dir, &resolved.config).await
        }
        DocumentConverterProvider::Auto => Err("未解析文档转换后端".to_string()),
    }
}

pub async fn prepare_import_source(
    app: &AppHandle,
    original_path: &Path,
    original_path_str: &str,
    base_dir: &Path,
) -> Result<PreparedImportSource, String> {
    let mime_type = crate::utils::mime::guess_mime_type(original_path);
    let is_doc = is_legacy_word_document(original_path, &mime_type);
    let is_ppt = is_legacy_ppt_document(original_path, &mime_type);
    let is_xls = is_legacy_excel_document(original_path, &mime_type);

    if !is_doc && !is_ppt && !is_xls {
        return Ok(PreparedImportSource {
            path: original_path.to_path_buf(),
            cleanup_dir: None,
            warnings: Vec::new(),
        });
    }

    let doc_type_label = if is_ppt {
        "PPT"
    } else if is_xls {
        "XLS"
    } else {
        "DOC"
    };
    let doc_target_label = if is_ppt {
        "PPTX"
    } else if is_xls {
        "XLSX"
    } else {
        "DOCX"
    };

    let file_name = original_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| original_path_str.to_string());

    let Some(conv_config) = active_document_conversion_config(app) else {
        log::info!(
            "[DocumentConverter] 检测到旧版 {}，但未配置转换程序，按原文件入库: {}",
            doc_type_label,
            original_path_str
        );
        let mut warning = converter_not_configured_warning(&file_name, original_path_str);
        if is_ppt {
            warning.code = "legacyPptConverterNotConfigured".to_string();
            warning.title = "旧版 PPT 未自动转换".to_string();
            warning.message = format!(
                "检测到旧版 PowerPoint PPT 文件「{}」，但资产管理器没有启用可用的文档转换依赖。文件已按原始 .ppt 入库，预览、全文解析或后续处理可能受限。请在资产管理器右上角「文件操作」→「文档转换设置」中启用自动转换，并配置 LibreOffice；保存后重新导入该文件即可转换为 PPTX。",
                file_name
            );
        } else if is_xls {
            warning.code = "legacyXlsConverterNotConfigured".to_string();
            warning.title = "旧版 XLS 未自动转换".to_string();
            warning.message = format!(
                "检测到旧版 Excel XLS 文件「{}」，但资产管理器没有启用可用的文档转换依赖。文件已按原始 .xls 入库，预览、全文解析或后续处理可能受限。请在资产管理器右上角「文件操作」→「文档转换设置」中启用自动转换，并配置 LibreOffice；保存后重新导入该文件即可转换为 XLSX。",
                file_name
            );
        }
        return Ok(PreparedImportSource {
            path: original_path.to_path_buf(),
            cleanup_dir: None,
            warnings: vec![warning],
        });
    };

    let resolved = match resolve_converter(conv_config).await {
        Ok(resolved) => {
            if is_ppt
                && resolved.provider != DocumentConverterProvider::LibreOffice
                && resolved.provider != DocumentConverterProvider::MicrosoftWord
            {
                log::info!(
                    "[DocumentConverter] 检测到旧版 PPT，但当前转换器 {} 不支持 PPT 转换，按原文件入库: {}",
                    resolved.provider.label(),
                    original_path_str
                );
                let mut warning = converter_not_configured_warning(&file_name, original_path_str);
                warning.code = "legacyPptConverterNotSupported".to_string();
                warning.title = "旧版 PPT 未自动转换".to_string();
                warning.message = format!(
                    "检测到旧版 PowerPoint PPT 文件「{}」，但当前配置的转换器 {} 不支持 PPT 转换（仅 LibreOffice 和 Microsoft Office 支持）。文件已按原始 .ppt 入库，预览或后续处理可能受限。请在设置中配置并启用 LibreOffice 或 Microsoft Office 转换器。",
                    file_name,
                    resolved.provider.label()
                );
                return Ok(PreparedImportSource {
                    path: original_path.to_path_buf(),
                    cleanup_dir: None,
                    warnings: vec![warning],
                });
            } else if is_xls
                && resolved.provider != DocumentConverterProvider::LibreOffice
                && resolved.provider != DocumentConverterProvider::MicrosoftWord
            {
                log::info!(
                    "[DocumentConverter] 检测到旧版 XLS，但当前转换器 {} 不支持 XLS 转换，按原文件入库: {}",
                    resolved.provider.label(),
                    original_path_str
                );
                let mut warning = converter_not_configured_warning(&file_name, original_path_str);
                warning.code = "legacyXlsConverterNotSupported".to_string();
                warning.title = "旧版 XLS 未自动转换".to_string();
                warning.message = format!(
                    "检测到旧版 Excel XLS 文件「{}」，但当前配置的转换器 {} 不支持 XLS 转换（仅 LibreOffice 和 Microsoft Office 支持）。文件已按原始 .xls 入库，预览或后续处理可能受限。请在设置中配置并启用 LibreOffice 或 Microsoft Office 转换器。",
                    file_name,
                    resolved.provider.label()
                );
                return Ok(PreparedImportSource {
                    path: original_path.to_path_buf(),
                    cleanup_dir: None,
                    warnings: vec![warning],
                });
            }
            resolved
        }
        Err(message) => {
            log::info!(
                "[DocumentConverter] 检测到旧版 {}，但未找到可用转换依赖，按原文件入库: {} ({})",
                doc_type_label,
                original_path_str,
                message
            );
            let mut warning = converter_not_configured_warning(&file_name, original_path_str);
            if is_ppt {
                warning.code = "legacyPptConverterNotConfigured".to_string();
                warning.title = "旧版 PPT 未自动转换".to_string();
                warning.message = format!(
                    "检测到旧版 PowerPoint PPT 文件「{}」，但资产管理器没有启用可用的文档转换依赖。文件已按原始 .ppt 入库，预览、全文解析或后续处理可能受限。请在资产管理器右上角「文件操作」→「文档转换设置」中启用自动转换，并配置 LibreOffice；保存后重新导入该文件即可转换为 PPTX。",
                    file_name
                );
            } else if is_xls {
                warning.code = "legacyXlsConverterNotConfigured".to_string();
                warning.title = "旧版 XLS 未自动转换".to_string();
                warning.message = format!(
                    "检测到旧版 Excel XLS 文件「{}」，但资产管理器没有启用可用的文档转换依赖。文件已按原始 .xls 入库，预览、全文解析或后续处理可能受限。请在资产管理器右上角「文件操作」→「文档转换设置」中启用自动转换，并配置 LibreOffice；保存后重新导入该文件即可转换为 XLSX。",
                    file_name
                );
            }
            warning.message = format!("{} 当前检测结果：{}。", warning.message, message);
            return Ok(PreparedImportSource {
                path: original_path.to_path_buf(),
                cleanup_dir: None,
                warnings: vec![warning],
            });
        }
    };

    let output_dir = base_dir
        .join(".conversion-cache")
        .join(Uuid::new_v4().to_string());
    log::info!(
        "[DocumentConverter] 检测到旧版 {}，使用 {} 入库前转换为 {}: {}",
        doc_type_label,
        resolved.provider.label(),
        doc_target_label,
        original_path_str
    );

    // 发出 converting 阶段事件，通知前端正在转换文档格式
    super::asset_manager::emit_import_progress(
        app,
        original_path_str,
        "converting",
        Some(format!(
            "使用 {} 转换为 {}",
            resolved.provider.label(),
            doc_target_label
        )),
        None,
    );

    let converted_path = if is_ppt {
        match resolved.provider {
            DocumentConverterProvider::LibreOffice => {
                libreoffice::convert_legacy_ppt_to_pptx(
                    original_path,
                    &output_dir,
                    &resolved.config,
                )
                .await?
            }
            DocumentConverterProvider::MicrosoftWord => {
                microsoft_office::convert_legacy_ppt_to_pptx(
                    original_path,
                    &output_dir,
                    &resolved.config,
                )
                .await?
            }
            _ => return Err("当前转换器不支持 PPT 转换".to_string()),
        }
    } else if is_xls {
        match resolved.provider {
            DocumentConverterProvider::LibreOffice => {
                libreoffice::convert_legacy_xls_to_xlsx(
                    original_path,
                    &output_dir,
                    &resolved.config,
                )
                .await?
            }
            DocumentConverterProvider::MicrosoftWord => {
                microsoft_office::convert_legacy_xls_to_xlsx(
                    original_path,
                    &output_dir,
                    &resolved.config,
                )
                .await?
            }
            _ => return Err("当前转换器不支持 XLS 转换".to_string()),
        }
    } else {
        convert_legacy_doc_to_docx(original_path, &output_dir, &resolved).await?
    };
    Ok(PreparedImportSource {
        path: converted_path,
        cleanup_dir: Some(output_dir),
        warnings: Vec::new(),
    })
}

/// 将旧版文档转换为现代格式，并返回转换后的临时文件路径。
#[tauri::command]
pub async fn convert_legacy_document(
    app: AppHandle,
    path: String,
) -> Result<Option<String>, String> {
    let original_path = Path::new(&path);
    let mime_type = crate::utils::mime::guess_mime_type(original_path);
    let is_doc = is_legacy_word_document(original_path, &mime_type);
    let is_ppt = is_legacy_ppt_document(original_path, &mime_type);
    let is_xls = is_legacy_excel_document(original_path, &mime_type);

    if !is_doc && !is_ppt && !is_xls {
        return Ok(None);
    }

    // 转换后的临时目录，放在 app_data_dir 下的 temp_conversions 目录中
    let app_data_dir = crate::get_app_data_dir(app.config());
    let base_dir = app_data_dir.join("temp_conversions");

    // 确保临时目录存在
    fs::create_dir_all(&base_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    let prepared = prepare_import_source(&app, original_path, &path, &base_dir).await?;

    // 如果转换成功，将文件复制到 base_dir 下的一个持久路径
    let file_name = prepared
        .path
        .file_name()
        .ok_or_else(|| "无法获取转换后的文件名".to_string())?;
    let target_path = base_dir.join(file_name);

    // 如果目标路径已存在，先删除
    if target_path.exists() {
        let _ = fs::remove_file(&target_path);
    }
    fs::copy(&prepared.path, &target_path).map_err(|e| format!("复制转换后的文件失败: {}", e))?;

    Ok(Some(target_path.to_string_lossy().to_string()))
}
