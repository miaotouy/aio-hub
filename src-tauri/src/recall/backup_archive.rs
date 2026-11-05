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

//! Shared Recall backup formats, validation and inspection for desktop hosts.

use crate::recall::core::{RecallCollection, RecallCollectionMeta, RecallEntry};
use crate::recall::storage::RecallRepository;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Cursor, Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub(crate) const RECALL_BACKUP_FORMAT: &str = "aiohub.recall-collection";
pub(crate) const RECALL_BACKUP_VERSION: u32 = 1;
pub(crate) const RECALL_BACKUP_COLLECTION_FORMAT: &str =
    "aiohub.recall-collection-backup-collection";
pub(crate) const RECALL_DATA_SCHEMA_VERSION: u32 = 1;
pub(crate) const RECALL_CONFIG_SCHEMA_VERSION: u32 = 1;
pub(crate) const LEGACY_BACKUP_FORMAT: &str = "aiohub.knowledge-library";
pub(crate) const LEGACY_BACKUP_VERSION: u32 = 1;
pub(crate) const LEGACY_BACKUP_COLLECTION_FORMAT: &str =
    "aiohub.knowledge-library-backup-collection";
pub(crate) const MAX_FILE_COUNT: usize = 4096;
pub(crate) const MAX_SINGLE_FILE_SIZE: u64 = 256 * 1024 * 1024;
pub(crate) const MAX_TOTAL_UNCOMPRESSED_SIZE: u64 = 1024 * 1024 * 1024;
pub(crate) const MAX_LIBRARY_SIZE: u64 = 64 * 1024 * 1024;
pub(crate) const MAX_COMPRESSION_RATIO: u64 = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileRecord {
    pub path: String,
    pub size: u64,
    pub blake3: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupAssetRecord {
    pub original_asset_id: String,
    pub package_path: Option<String>,
    pub name: String,
    pub mime_type: String,
    pub sha256: Option<String>,
    pub missing_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecallCollectionBackupManifestV1 {
    pub format: String,
    pub format_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data_schema_version: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config_schema_version: Option<u32>,
    pub exported_at: String,
    pub app_version: String,
    #[serde(alias = "libraryId")]
    pub collection_id: String,
    #[serde(alias = "libraryName")]
    pub collection_name: String,
    pub entry_count: usize,
    pub asset_count: usize,
    pub files: Vec<BackupFileRecord>,
    pub assets: Vec<BackupAssetRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecallCollectionDtoV1 {
    pub(crate) meta: RecallCollectionMeta,
    pub(crate) entries: Vec<RecallEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupWarning {
    pub code: String,
    pub message: String,
    pub asset_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInspectResult {
    pub source_path: String,
    pub source_entry: Option<String>,
    pub format: String,
    pub format_version: u32,
    pub data_schema_version: Option<u32>,
    pub config_schema_version: Option<u32>,
    pub library_id: String,
    pub library_name: String,
    pub entry_count: usize,
    pub asset_count: usize,
    pub has_conflict: bool,
    pub conflicting_library_name: Option<String>,
    pub conflicting_entry_count: Option<usize>,
    pub legacy_content_only: bool,
    pub warnings: Vec<BackupWarning>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInspectItem {
    pub source_entry: Option<String>,
    pub library_name: String,
    pub inspect: Option<BackupInspectResult>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BackupConflictStrategy {
    Copy,
    Replace,
    Cancel,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupImportOptions {
    pub conflict_strategy: BackupConflictStrategy,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupImportReport {
    pub source_path: String,
    pub status: String,
    pub library_id: Option<String>,
    pub library_name: String,
    pub entry_count: usize,
    pub restored_asset_count: usize,
    pub missing_asset_count: usize,
    pub replaced_existing: bool,
    pub imported_as_copy: bool,
    pub legacy_content_only: bool,
    pub vectors_need_rebuild: bool,
    pub warnings: Vec<BackupWarning>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyKnowledgeImportReport {
    pub status: String,
    pub library_id: String,
    pub library_name: String,
    pub document_count: usize,
    pub skipped_entry_count: usize,
    pub warnings: Vec<BackupWarning>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExportResult {
    pub library_id: String,
    pub library_name: String,
    pub output_path: String,
    pub entry_count: usize,
    pub asset_count: usize,
    pub warnings: Vec<BackupWarning>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupBatchExportResult {
    pub exported_at: String,
    pub target_directory: String,
    pub output_path: String,
    pub succeeded: Vec<BackupExportResult>,
    pub failed: Vec<BackupExportFailure>,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExportFailure {
    pub library_id: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupProgressEvent {
    pub(crate) operation: &'static str,
    pub(crate) current: usize,
    pub(crate) total: usize,
    pub(crate) failed: usize,
    pub(crate) library_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupIndex {
    pub(crate) format: String,
    pub(crate) format_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) data_schema_version: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) config_schema_version: Option<u32>,
    pub(crate) exported_at: String,
    pub(crate) app_version: String,
    #[serde(alias = "backupCount")]
    pub(crate) collection_count: usize,
    pub(crate) failed_count: usize,
    #[serde(alias = "backups")]
    pub(crate) collections: Vec<BackupIndexEntry>,
    pub(crate) failures: Vec<BackupExportFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupIndexEntry {
    pub(crate) path: String,
    #[serde(alias = "libraryId")]
    pub(crate) collection_id: String,
    #[serde(alias = "libraryName")]
    pub(crate) collection_name: String,
    pub(crate) entry_count: usize,
    pub(crate) asset_count: usize,
    pub(crate) warnings: Vec<BackupWarning>,
}

pub(crate) struct PackageAsset {
    pub(crate) record: BackupAssetRecord,
    pub(crate) bytes: Option<Vec<u8>>,
}

pub(crate) struct ParsedBackup {
    pub(crate) library: RecallCollectionDtoV1,
    pub(crate) manifest: Option<RecallCollectionBackupManifestV1>,
    pub(crate) files: HashMap<String, Vec<u8>>,
    pub(crate) format: String,
    pub(crate) legacy_content_only: bool,
    pub(crate) warnings: Vec<BackupWarning>,
}

pub(crate) fn warning(
    code: &str,
    message: impl Into<String>,
    asset_id: Option<String>,
) -> BackupWarning {
    BackupWarning {
        code: code.to_string(),
        message: message.into(),
        asset_id,
    }
}

pub(crate) fn missing_asset_warning_count(warnings: &[BackupWarning]) -> usize {
    warnings
        .iter()
        .filter(|item| item.code.contains("missing") || item.code == "missingAsset")
        .count()
}

pub(crate) fn blake3_hex(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

pub(crate) fn validate_manifest_version(
    manifest: &RecallCollectionBackupManifestV1,
) -> Result<(), String> {
    match manifest.format.as_str() {
        RECALL_BACKUP_FORMAT
            if manifest.format_version == RECALL_BACKUP_VERSION
                && manifest.data_schema_version == Some(RECALL_DATA_SCHEMA_VERSION)
                && manifest.config_schema_version == Some(RECALL_CONFIG_SCHEMA_VERSION) =>
        {
            Ok(())
        }
        LEGACY_BACKUP_FORMAT if manifest.format_version == LEGACY_BACKUP_VERSION => Ok(()),
        _ => Err(format!(
            "不支持的备份格式或版本: {} v{} (data schema {:?}, config schema {:?})",
            manifest.format,
            manifest.format_version,
            manifest.data_schema_version,
            manifest.config_schema_version
        )),
    }
}

pub(crate) fn validate_backup_index_version(index: &BackupIndex) -> Result<(), String> {
    match index.format.as_str() {
        RECALL_BACKUP_COLLECTION_FORMAT
            if index.format_version == RECALL_BACKUP_VERSION
                && index.data_schema_version == Some(RECALL_DATA_SCHEMA_VERSION)
                && index.config_schema_version == Some(RECALL_CONFIG_SCHEMA_VERSION) =>
        {
            Ok(())
        }
        LEGACY_BACKUP_COLLECTION_FORMAT if index.format_version == LEGACY_BACKUP_VERSION => Ok(()),
        _ => Err(format!(
            "不支持的多库备份格式或版本: {} v{} (data schema {:?}, config schema {:?})",
            index.format,
            index.format_version,
            index.data_schema_version,
            index.config_schema_version
        )),
    }
}

pub(crate) fn collection_data_file_name(format: &str) -> Result<&'static str, String> {
    match format {
        RECALL_BACKUP_FORMAT | RECALL_BACKUP_COLLECTION_FORMAT => Ok("collection.json"),
        LEGACY_BACKUP_FORMAT | LEGACY_BACKUP_COLLECTION_FORMAT => Ok("library.json"),
        _ => Err(format!("无法确定备份主数据文件: {format}")),
    }
}

pub(crate) fn collection_root_directory(format: &str) -> Result<&'static str, String> {
    match format {
        RECALL_BACKUP_COLLECTION_FORMAT => Ok("collections"),
        LEGACY_BACKUP_COLLECTION_FORMAT => Ok("libraries"),
        _ => Err(format!("无法确定多库备份目录: {format}")),
    }
}

pub(crate) fn is_safe_package_path(path: &str) -> bool {
    if path.is_empty() || path.contains(['\\', ':']) || Path::new(path).is_absolute() {
        return false;
    }
    Path::new(path)
        .components()
        .all(|part| matches!(part, Component::Normal(_)))
}

pub(crate) fn safe_file_component(value: &str, fallback: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
            {
                '_'
            } else {
                ch
            }
        })
        .collect();
    let trimmed = sanitized.trim().trim_end_matches(['.', ' ']);
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.chars().take(80).collect()
    }
}

pub(crate) fn unique_output_path(directory: &Path, stem: &str, extension: &str) -> PathBuf {
    let first = directory.join(format!("{}.{}", stem, extension));
    if !first.exists() {
        return first;
    }
    for index in 2..=9999 {
        let candidate = directory.join(format!("{}_{}.{}", stem, index, extension));
        if !candidate.exists() {
            return candidate;
        }
    }
    directory.join(format!("{}_{}.{}", stem, Uuid::new_v4(), extension))
}

pub(crate) fn reset_derived_state(meta: &mut RecallCollectionMeta, entries: &[RecallEntry]) {
    meta.vectorization.is_indexed = false;
    meta.vectorization.last_indexed_at = None;
    meta.vectorization.model_used.clear();
    meta.vectorization.dimension = 0;
    meta.vectorization.total_tokens = 0;
    meta.models.clear();
    meta.entries = entries
        .iter()
        .map(|entry| entry.to_index_item("none".to_string(), Vec::new(), 0))
        .collect();
}

pub(crate) fn validate_library(library: &RecallCollectionDtoV1) -> Result<(), String> {
    let mut ids = HashSet::new();
    for entry in &library.entries {
        if !ids.insert(entry.id) {
            return Err(format!("备份包含重复条目 ID: {}", entry.id));
        }
    }
    if library.meta.entries.len() != library.entries.len() {
        return Err(format!(
            "元数据条目数 {} 与内容条目数 {} 不一致",
            library.meta.entries.len(),
            library.entries.len()
        ));
    }
    let index_ids: HashSet<Uuid> = library.meta.entries.iter().map(|entry| entry.id).collect();
    if index_ids != ids {
        return Err("元数据条目索引与备份主数据内容不一致".to_string());
    }
    Ok(())
}

pub(crate) fn write_backup_zip(
    path: &Path,
    manifest: &RecallCollectionBackupManifestV1,
    library_bytes: &[u8],
    assets: &[PackageAsset],
) -> Result<(), String> {
    let file = File::create(path).map_err(|error| format!("创建备份临时文件失败: {}", error))?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    let data_file_name = collection_data_file_name(&manifest.format)?;
    writer
        .start_file(data_file_name, options)
        .map_err(|error| format!("写入 {data_file_name} 失败: {error}"))?;
    writer
        .write_all(library_bytes)
        .map_err(|error| format!("写入 {data_file_name} 失败: {error}"))?;
    for asset in assets {
        if let (Some(package_path), Some(bytes)) = (&asset.record.package_path, &asset.bytes) {
            writer
                .start_file(package_path, options)
                .map_err(|error| format!("写入资产 {} 失败: {}", package_path, error))?;
            writer
                .write_all(bytes)
                .map_err(|error| format!("写入资产 {} 失败: {}", package_path, error))?;
        }
    }
    let manifest_bytes = serde_json::to_vec_pretty(manifest)
        .map_err(|error| format!("序列化备份清单失败: {}", error))?;
    writer
        .start_file("manifest.json", options)
        .map_err(|error| format!("写入 manifest.json 失败: {}", error))?;
    writer
        .write_all(&manifest_bytes)
        .map_err(|error| format!("写入 manifest.json 失败: {}", error))?;
    let file = writer
        .finish()
        .map_err(|error| format!("关闭备份 ZIP 失败: {}", error))?;
    file.sync_all()
        .map_err(|error| format!("同步备份文件失败: {}", error))?;
    Ok(())
}

pub(crate) fn parse_aio_backup(path: &Path) -> Result<ParsedBackup, String> {
    let file = File::open(path).map_err(|error| format!("打开备份文件失败: {}", error))?;
    parse_aio_backup_reader(file)
}

pub(crate) fn parse_aio_backup_reader<R: Read + Seek>(reader: R) -> Result<ParsedBackup, String> {
    let mut archive =
        ZipArchive::new(reader).map_err(|error| format!("读取备份 ZIP 失败: {}", error))?;
    if archive.is_empty() || archive.len() > MAX_FILE_COUNT {
        return Err(format!("备份文件数量超出限制: {}", archive.len()));
    }

    let mut names = HashSet::new();
    let mut total_size = 0_u64;
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取 ZIP 条目失败: {}", error))?;
        let name = file.name().to_string();
        if !is_safe_package_path(&name) || !names.insert(name.clone()) {
            return Err(format!("备份包含不安全或重复路径: {}", name));
        }
        if file.is_dir() {
            return Err(format!("备份包含未声明目录条目: {}", name));
        }
        if file
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(format!("备份包含符号链接: {}", name));
        }
        if file.size() > MAX_SINGLE_FILE_SIZE {
            return Err(format!("备份条目超过单文件上限: {}", name));
        }
        if file.size() > 1024 * 1024
            && (file.compressed_size() == 0
                || file.size() / file.compressed_size().max(1) > MAX_COMPRESSION_RATIO)
        {
            return Err(format!("备份条目压缩比异常: {}", name));
        }
        total_size = total_size
            .checked_add(file.size())
            .ok_or_else(|| "备份总大小溢出".to_string())?;
        if total_size > MAX_TOTAL_UNCOMPRESSED_SIZE {
            return Err("备份解压总大小超过限制".to_string());
        }
    }
    if !names.contains("manifest.json") {
        return Err("备份缺少 manifest.json".to_string());
    }

    let manifest: RecallCollectionBackupManifestV1 = {
        let mut file = archive
            .by_name("manifest.json")
            .map_err(|error| format!("读取 manifest.json 失败: {}", error))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|error| format!("读取 manifest.json 失败: {}", error))?;
        serde_json::from_slice(&bytes)
            .map_err(|error| format!("解析 manifest.json 失败: {}", error))?
    };
    validate_manifest_version(&manifest)?;
    let data_file_name = collection_data_file_name(&manifest.format)?;
    if !names.contains(data_file_name) {
        return Err(format!("备份缺少 {data_file_name}"));
    }

    let mut declared = HashSet::new();
    let mut files = HashMap::new();
    for record in &manifest.files {
        if !is_safe_package_path(&record.path)
            || record.path == "manifest.json"
            || !declared.insert(record.path.clone())
        {
            return Err(format!("manifest 包含无效或重复文件路径: {}", record.path));
        }
        let mut file = archive
            .by_name(&record.path)
            .map_err(|_| format!("manifest 声明的文件不存在: {}", record.path))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|error| format!("读取 {} 失败: {}", record.path, error))?;
        if bytes.len() as u64 != record.size || blake3_hex(&bytes) != record.blake3 {
            return Err(format!("文件大小或 BLAKE3 校验失败: {}", record.path));
        }
        files.insert(record.path.clone(), bytes);
    }
    let expected_names: HashSet<String> = declared
        .iter()
        .cloned()
        .chain(std::iter::once("manifest.json".to_string()))
        .collect();
    if names != expected_names {
        return Err("ZIP 实际文件与 manifest 声明不一致".to_string());
    }
    let library_bytes = files
        .get(data_file_name)
        .ok_or_else(|| format!("manifest 未声明 {data_file_name}"))?;
    if library_bytes.len() as u64 > MAX_LIBRARY_SIZE {
        return Err(format!("{data_file_name} 超过解析上限"));
    }
    let library: RecallCollectionDtoV1 = serde_json::from_slice(library_bytes)
        .map_err(|error| format!("解析 {data_file_name} 失败: {error}"))?;
    validate_library(&library)?;
    if manifest.collection_id != library.meta.id.to_string()
        || manifest.collection_name != library.meta.name
        || manifest.entry_count != library.entries.len()
    {
        return Err(format!("manifest 与 {data_file_name} 摘要不一致"));
    }
    let mut asset_ids = HashSet::new();
    let packaged_count = manifest
        .assets
        .iter()
        .filter(|asset| asset.package_path.is_some())
        .count();
    if packaged_count != manifest.asset_count {
        return Err("manifest 的 assetCount 与资产清单不一致".to_string());
    }
    for asset in &manifest.assets {
        if !asset_ids.insert(asset.original_asset_id.clone()) {
            return Err(format!(
                "manifest 包含重复资产 ID: {}",
                asset.original_asset_id
            ));
        }
        if let Some(package_path) = &asset.package_path {
            if !package_path.starts_with("assets/") || !files.contains_key(package_path) {
                return Err(format!("资产包路径无效或不存在: {}", package_path));
            }
            if let Some(expected_sha256) = &asset.sha256 {
                let bytes = files
                    .get(package_path)
                    .ok_or_else(|| format!("找不到资产文件: {}", package_path))?;
                if sha256_hex(bytes) != *expected_sha256 {
                    return Err(format!("资产 SHA-256 校验失败: {}", package_path));
                }
            }
        } else if asset.missing_reason.is_none() {
            return Err(format!("缺失资产未说明原因: {}", asset.original_asset_id));
        }
    }
    let mut warnings: Vec<BackupWarning> = manifest
        .assets
        .iter()
        .filter_map(|asset| {
            asset.missing_reason.as_ref().map(|reason| {
                warning(
                    "missingAsset",
                    reason.clone(),
                    Some(asset.original_asset_id.clone()),
                )
            })
        })
        .collect();
    if manifest.format == LEGACY_BACKUP_FORMAT {
        warnings.insert(
            0,
            warning(
                "legacyRecallBackup",
                "这是重构前由“知识库”模块导出的思绪结构备份；导入时可完整恢复到 Recall / 思绪，或将标题与正文不可逆转换到新版 Knowledge 资料库",
                None,
            ),
        );
    }
    let format = manifest.format.clone();
    Ok(ParsedBackup {
        library,
        manifest: Some(manifest),
        files,
        format,
        legacy_content_only: false,
        warnings,
    })
}

pub(crate) fn read_backup_collection_index(path: &Path) -> Result<Option<BackupIndex>, String> {
    let file = File::open(path).map_err(|error| format!("打开备份容器失败: {}", error))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("读取备份容器 ZIP 失败: {}", error))?;
    if archive.is_empty() || archive.len() > MAX_FILE_COUNT {
        return Err(format!("备份容器文件数量超出限制: {}", archive.len()));
    }

    let mut names = HashSet::new();
    let mut total_size = 0_u64;
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取备份容器条目失败: {}", error))?;
        let name = file.name().to_string();
        if !is_safe_package_path(&name) || !names.insert(name.clone()) {
            return Err(format!("备份容器包含不安全或重复路径: {}", name));
        }
        if file.is_dir() {
            return Err(format!("备份容器包含目录条目: {}", name));
        }
        if file
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(format!("备份容器包含符号链接: {}", name));
        }
        if file.size() > MAX_SINGLE_FILE_SIZE {
            return Err(format!("备份容器条目超过单文件上限: {}", name));
        }
        if file.size() > 1024 * 1024
            && (file.compressed_size() == 0
                || file.size() / file.compressed_size().max(1) > MAX_COMPRESSION_RATIO)
        {
            return Err(format!("备份容器条目压缩比异常: {}", name));
        }
        total_size = total_size
            .checked_add(file.size())
            .ok_or_else(|| "备份容器总大小溢出".to_string())?;
        if total_size > MAX_TOTAL_UNCOMPRESSED_SIZE {
            return Err("备份容器解压总大小超过限制".to_string());
        }
    }
    if !names.contains("backup-index.json") {
        return Ok(None);
    }

    let index: BackupIndex = {
        let mut file = archive
            .by_name("backup-index.json")
            .map_err(|error| format!("读取 backup-index.json 失败: {}", error))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|error| format!("读取 backup-index.json 失败: {}", error))?;
        serde_json::from_slice(&bytes)
            .map_err(|error| format!("解析 backup-index.json 失败: {}", error))?
    };
    validate_backup_index_version(&index)?;
    if index.collection_count != index.collections.len()
        || index.failed_count != index.failures.len()
    {
        return Err("backup-index.json 的数量摘要不一致".to_string());
    }
    let data_file_name = collection_data_file_name(&index.format)?;
    let root_directory = collection_root_directory(&index.format)?;

    let mut prefixes = HashSet::new();
    let mut library_ids = HashSet::new();
    for backup in &index.collections {
        let components: Vec<_> = Path::new(&backup.path).components().collect();
        if !is_safe_package_path(&backup.path)
            || components.len() != 2
            || components.first() != Some(&Component::Normal(root_directory.as_ref()))
            || !prefixes.insert(backup.path.clone())
            || !library_ids.insert(backup.collection_id.clone())
        {
            return Err(format!(
                "backup-index.json 包含无效或重复库路径: {}",
                backup.path
            ));
        }
        if !names.contains(&format!("{}/manifest.json", backup.path))
            || !names.contains(&format!("{}/{}", backup.path, data_file_name))
        {
            return Err(format!("备份容器中的库目录不完整: {}", backup.path));
        }
    }
    for name in names
        .iter()
        .filter(|name| name.as_str() != "backup-index.json")
    {
        if !prefixes
            .iter()
            .any(|prefix| name.starts_with(&format!("{}/", prefix)))
        {
            return Err(format!("备份容器包含索引未声明的文件: {}", name));
        }
    }
    Ok(Some(index))
}

pub(crate) fn collection_entry_bytes(path: &Path, prefix: &str) -> Result<Vec<u8>, String> {
    let file = File::open(path).map_err(|error| format!("打开备份容器失败: {}", error))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("读取备份容器 ZIP 失败: {}", error))?;
    let prefix = format!("{}/", prefix);
    let cursor = Cursor::new(Vec::new());
    let mut writer = ZipWriter::new(cursor);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    let mut copied = 0;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取备份容器条目失败: {}", error))?;
        let Some(relative_path) = file.name().strip_prefix(&prefix) else {
            continue;
        };
        if relative_path.is_empty() || !is_safe_package_path(relative_path) {
            return Err(format!("备份容器包含无效库内路径: {}", file.name()));
        }
        writer
            .start_file(relative_path, options)
            .map_err(|error| format!("重建单库备份条目失败: {}", error))?;
        std::io::copy(&mut file, &mut writer)
            .map_err(|error| format!("读取单库备份条目失败: {}", error))?;
        copied += 1;
    }
    if copied == 0 {
        return Err(format!("备份容器中找不到库目录: {}", prefix));
    }
    let cursor = writer
        .finish()
        .map_err(|error| format!("完成单库备份重建失败: {}", error))?;
    Ok(cursor.into_inner())
}

pub(crate) fn parse_backup_collection_entry(
    path: &Path,
    prefix: &str,
) -> Result<ParsedBackup, String> {
    let bytes = collection_entry_bytes(path, prefix)?;
    parse_aio_backup_reader(Cursor::new(bytes))
}

pub(crate) fn validate_backup_index_entry(
    backup: &BackupIndexEntry,
    parsed: &ParsedBackup,
) -> Result<(), String> {
    if parsed.library.meta.id.to_string() != backup.collection_id
        || parsed.library.meta.name != backup.collection_name
        || parsed.library.entries.len() != backup.entry_count
        || parsed
            .manifest
            .as_ref()
            .map(|item| item.asset_count)
            .unwrap_or(0)
            != backup.asset_count
    {
        return Err(format!(
            "backup-index.json 与库目录摘要不一致: {}",
            backup.path
        ));
    }
    Ok(())
}

pub(crate) fn validate_backup_collection(path: &Path) -> Result<BackupIndex, String> {
    let index = read_backup_collection_index(path)?
        .ok_or_else(|| "备份 ZIP 缺少 backup-index.json".to_string())?;
    for backup in &index.collections {
        let parsed = parse_backup_collection_entry(path, &backup.path)?;
        validate_backup_index_entry(backup, &parsed)?;
    }
    Ok(index)
}

pub(crate) fn write_backup_collection(
    path: &Path,
    index: &BackupIndex,
    packages: &[(String, PathBuf)],
) -> Result<(), String> {
    let file =
        File::create(path).map_err(|error| format!("创建多库备份临时文件失败: {}", error))?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    for (prefix, package_path) in packages {
        let package_file =
            File::open(package_path).map_err(|error| format!("打开暂存单库备份失败: {}", error))?;
        let mut package = ZipArchive::new(package_file)
            .map_err(|error| format!("读取暂存单库备份失败: {}", error))?;
        for entry_index in 0..package.len() {
            let mut entry = package
                .by_index(entry_index)
                .map_err(|error| format!("读取暂存单库备份条目失败: {}", error))?;
            let output_name = format!("{}/{}", prefix, entry.name());
            writer
                .start_file(&output_name, options)
                .map_err(|error| format!("写入多库备份条目 {} 失败: {}", output_name, error))?;
            std::io::copy(&mut entry, &mut writer)
                .map_err(|error| format!("复制多库备份条目 {} 失败: {}", output_name, error))?;
        }
    }
    let index_bytes = serde_json::to_vec_pretty(index)
        .map_err(|error| format!("序列化多库备份索引失败: {}", error))?;
    writer
        .start_file("backup-index.json", options)
        .map_err(|error| format!("写入多库备份索引失败: {}", error))?;
    writer
        .write_all(&index_bytes)
        .map_err(|error| format!("写入多库备份索引失败: {}", error))?;
    let file = writer
        .finish()
        .map_err(|error| format!("关闭多库备份 ZIP 失败: {}", error))?;
    file.sync_all()
        .map_err(|error| format!("同步多库备份文件失败: {}", error))?;
    Ok(())
}

pub(crate) fn parse_legacy_backup(path: &Path) -> Result<ParsedBackup, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("读取导入文件失败: {}", error))?;
    if metadata.len() > MAX_LIBRARY_SIZE {
        return Err("legacy 导入文件超过大小限制".to_string());
    }
    let bytes = fs::read(path).map_err(|error| format!("读取导入文件失败: {}", error))?;
    let (legacy, format) = match serde_json::from_slice::<RecallCollection>(&bytes) {
        Ok(value) => (value, "legacy-json"),
        Err(json_error) => match serde_yaml::from_slice::<RecallCollection>(&bytes) {
            Ok(value) => (value, "legacy-yaml"),
            Err(yaml_error) => {
                return Err(format!(
                    "文件既不是有效的 .aio-recall/.aio-kb，也不是兼容的 JSON/YAML（JSON: {}; YAML: {}）",
                    json_error, yaml_error
                ));
            }
        },
    };
    let mut library = RecallCollectionDtoV1 {
        meta: legacy.meta,
        entries: legacy.entries,
    };
    reset_derived_state(&mut library.meta, &library.entries);
    validate_library(&library)?;
    Ok(ParsedBackup {
        library,
        manifest: None,
        files: HashMap::new(),
        format: format.to_string(),
        legacy_content_only: true,
        warnings: vec![
            warning(
                "legacyRecallBackup",
                "这是重构前由“知识库”模块导出的思绪结构数据；导入时可完整恢复到 Recall / 思绪，或将标题与正文不可逆转换到新版 Knowledge 资料库",
                None,
            ),
            warning(
                "legacyContentOnly",
                "legacy JSON/YAML 不包含资产二进制，仅恢复内容与当前环境仍可找到的资产引用",
                None,
            ),
        ],
    })
}

pub(crate) fn parse_backup(path: &Path) -> Result<ParsedBackup, String> {
    if !path.is_file() {
        return Err(format!("导入文件不存在: {}", path.display()));
    }
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("aio-recall" | "aio-kb") => parse_aio_backup(path),
        _ => parse_aio_backup(path).or_else(|_| parse_legacy_backup(path)),
    }
}

pub(crate) fn parse_backup_source(
    path: &Path,
    source_entry: Option<&str>,
) -> Result<ParsedBackup, String> {
    match source_entry {
        Some(prefix) => {
            let index = read_backup_collection_index(path)?
                .ok_or_else(|| "备份 ZIP 缺少 backup-index.json".to_string())?;
            let index_entry = index
                .collections
                .iter()
                .find(|entry| entry.path == prefix)
                .ok_or_else(|| format!("backup-index.json 未声明库目录: {}", prefix))?;
            let parsed = parse_backup_collection_entry(path, prefix)?;
            validate_backup_index_entry(index_entry, &parsed)?;
            Ok(parsed)
        }
        None => parse_backup(path),
    }
}

pub(crate) fn is_legacy_recall_format(format: &str) -> bool {
    matches!(format, LEGACY_BACKUP_FORMAT | "legacy-json" | "legacy-yaml")
}

pub(crate) fn inspect_parsed_backup(
    repository: &dyn RecallRepository,
    source_path: String,
    source_entry: Option<String>,
    parsed: ParsedBackup,
) -> Result<BackupInspectResult, String> {
    let conflict = repository.load_collection(parsed.library.meta.id)?;
    let (has_conflict, conflicting_library_name, conflicting_entry_count) = conflict
        .map(|collection| {
            (
                true,
                Some(collection.meta.name),
                Some(collection.entries.len()),
            )
        })
        .unwrap_or((false, None, None));
    let asset_count = parsed
        .manifest
        .as_ref()
        .map(|manifest| manifest.asset_count)
        .unwrap_or(0);
    let format_version = parsed
        .manifest
        .as_ref()
        .map(|manifest| manifest.format_version)
        .unwrap_or(0);
    let data_schema_version = parsed
        .manifest
        .as_ref()
        .and_then(|manifest| manifest.data_schema_version);
    let config_schema_version = parsed
        .manifest
        .as_ref()
        .and_then(|manifest| manifest.config_schema_version);
    Ok(BackupInspectResult {
        source_path,
        source_entry,
        format: parsed.format,
        format_version,
        data_schema_version,
        config_schema_version,
        library_id: parsed.library.meta.id.to_string(),
        library_name: parsed.library.meta.name,
        entry_count: parsed.library.entries.len(),
        asset_count,
        has_conflict,
        conflicting_library_name,
        conflicting_entry_count,
        legacy_content_only: parsed.legacy_content_only,
        warnings: parsed.warnings,
    })
}

pub(crate) fn recall_inspect_backup(
    repository: &dyn RecallRepository,
    source_path: String,
) -> Result<BackupInspectResult, String> {
    let path = PathBuf::from(&source_path);
    let parsed = parse_backup(&path)?;
    inspect_parsed_backup(repository, source_path, None, parsed)
}

pub(crate) fn recall_inspect_backups(
    repository: &dyn RecallRepository,
    source_path: String,
) -> Result<Vec<BackupInspectItem>, String> {
    let path = PathBuf::from(&source_path);
    if path.extension().and_then(|extension| extension.to_str()) != Some("zip") {
        return recall_inspect_backup(repository, source_path).map(|result| {
            vec![BackupInspectItem {
                source_entry: result.source_entry.clone(),
                library_name: result.library_name.clone(),
                inspect: Some(result),
                error: None,
            }]
        });
    }
    let index = read_backup_collection_index(&path)?
        .ok_or_else(|| "备份 ZIP 缺少 backup-index.json".to_string())?;
    if index.collections.is_empty() {
        return Err("多库备份容器不包含可导入的思绪集".to_string());
    }
    let mut results = Vec::with_capacity(index.collections.len());
    for backup in index.collections {
        let source_entry = backup.path.clone();
        let inspected = parse_backup_collection_entry(&path, &source_entry).and_then(|parsed| {
            validate_backup_index_entry(&backup, &parsed)?;
            inspect_parsed_backup(
                repository,
                source_path.clone(),
                Some(source_entry.clone()),
                parsed,
            )
        });
        match inspected {
            Ok(inspect) => results.push(BackupInspectItem {
                source_entry: Some(source_entry),
                library_name: inspect.library_name.clone(),
                inspect: Some(inspect),
                error: None,
            }),
            Err(error) => results.push(BackupInspectItem {
                source_entry: Some(source_entry),
                library_name: backup.collection_name,
                inspect: None,
                error: Some(error),
            }),
        }
    }
    Ok(results)
}

#[cfg(test)]
#[path = "backup_archive_tests.rs"]
mod tests;

pub(crate) fn export_collection(
    library: RecallCollectionDtoV1,
    assets: Vec<PackageAsset>,
    target_directory: &Path,
    app_version: String,
) -> Result<BackupExportResult, String> {
    if !target_directory.is_dir() {
        return Err(format!("导出目标不是目录: {}", target_directory.display()));
    }
    validate_library(&library)?;
    let recall_id = library.meta.id;
    let data_file_name = collection_data_file_name(RECALL_BACKUP_FORMAT)?;
    let library_bytes = serde_json::to_vec_pretty(&library)
        .map_err(|error| format!("序列化 {data_file_name} 失败: {error}"))?;
    if library_bytes.len() as u64 > MAX_LIBRARY_SIZE {
        return Err(format!("{data_file_name} 超过备份大小上限"));
    }
    let mut files = vec![BackupFileRecord {
        path: data_file_name.to_string(),
        size: library_bytes.len() as u64,
        blake3: blake3_hex(&library_bytes),
    }];
    for asset in &assets {
        if let (Some(path), Some(bytes)) = (&asset.record.package_path, &asset.bytes) {
            files.push(BackupFileRecord {
                path: path.clone(),
                size: bytes.len() as u64,
                blake3: blake3_hex(bytes),
            });
        }
    }
    let exported_at = Utc::now().to_rfc3339();
    let manifest = RecallCollectionBackupManifestV1 {
        format: RECALL_BACKUP_FORMAT.to_string(),
        format_version: RECALL_BACKUP_VERSION,
        data_schema_version: Some(RECALL_DATA_SCHEMA_VERSION),
        config_schema_version: Some(RECALL_CONFIG_SCHEMA_VERSION),
        exported_at,
        app_version: app_version,
        collection_id: recall_id.to_string(),
        collection_name: library.meta.name.clone(),
        entry_count: library.entries.len(),
        asset_count: assets.iter().filter(|asset| asset.bytes.is_some()).count(),
        files,
        assets: assets.iter().map(|asset| asset.record.clone()).collect(),
    };
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let stem = format!(
        "{}_aio-recall-v{}_{}",
        safe_file_component(&library.meta.name, "recall-collection"),
        RECALL_BACKUP_VERSION,
        timestamp
    );
    let output_path = unique_output_path(target_directory, &stem, "aio-recall");
    let temp_path = target_directory.join(format!(".{}.{}.tmp", stem, Uuid::new_v4()));
    let write_result = write_backup_zip(&temp_path, &manifest, &library_bytes, &assets)
        .and_then(|_| parse_aio_backup(&temp_path).map(|_| ()))
        .and_then(|_| {
            fs::rename(&temp_path, &output_path)
                .map_err(|error| format!("提交备份文件失败: {}", error))
        });
    if let Err(error) = write_result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    let warnings = manifest
        .assets
        .iter()
        .filter_map(|asset| {
            asset.missing_reason.as_ref().map(|reason| {
                warning(
                    "missingAsset",
                    reason.clone(),
                    Some(asset.original_asset_id.clone()),
                )
            })
        })
        .collect();
    Ok(BackupExportResult {
        library_id: recall_id.to_string(),
        library_name: library.meta.name,
        output_path: output_path.to_string_lossy().to_string(),
        entry_count: library.entries.len(),
        asset_count: manifest.asset_count,
        warnings,
    })
}

pub(crate) fn finish_backup_batch(
    directory: &Path,
    exported_at: String,
    mut succeeded: Vec<BackupExportResult>,
    failed: Vec<BackupExportFailure>,
    cancelled: bool,
    app_version: String,
) -> Result<BackupBatchExportResult, String> {
    let target_directory = directory.to_string_lossy().to_string();
    let mut used_paths = HashSet::new();
    let mut packages = Vec::with_capacity(succeeded.len());
    let mut index_entries = Vec::with_capacity(succeeded.len());
    let root_directory = collection_root_directory(RECALL_BACKUP_COLLECTION_FORMAT)?;
    for result in &succeeded {
        let base_name = safe_file_component(&result.library_name, "recall-collection");
        let mut folder_name = base_name.clone();
        for suffix in 2..=9999 {
            let candidate = format!("{root_directory}/{}", folder_name);
            if used_paths.insert(candidate.clone()) {
                packages.push((candidate.clone(), PathBuf::from(&result.output_path)));
                index_entries.push(BackupIndexEntry {
                    path: candidate,
                    collection_id: result.library_id.clone(),
                    collection_name: result.library_name.clone(),
                    entry_count: result.entry_count,
                    asset_count: result.asset_count,
                    warnings: result.warnings.clone(),
                });
                break;
            }
            folder_name = format!("{}_{}", base_name, suffix);
        }
    }
    if index_entries.len() != succeeded.len() {
        return Err("无法为多库备份生成唯一库目录".to_string());
    }
    let index = BackupIndex {
        format: RECALL_BACKUP_COLLECTION_FORMAT.to_string(),
        format_version: RECALL_BACKUP_VERSION,
        data_schema_version: Some(RECALL_DATA_SCHEMA_VERSION),
        config_schema_version: Some(RECALL_CONFIG_SCHEMA_VERSION),
        exported_at: exported_at.clone(),
        app_version: app_version,
        collection_count: succeeded.len(),
        failed_count: failed.len(),
        collections: index_entries,
        failures: failed.clone(),
    };
    let file_label = if succeeded.len() == 1 {
        safe_file_component(&succeeded[0].library_name, "recall-collection")
    } else {
        "多个思绪集".to_string()
    };
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let stem = format!(
        "{}_aio-recall-v{}_{}",
        file_label, RECALL_BACKUP_VERSION, timestamp
    );
    let output_path = unique_output_path(&directory, &stem, "zip");
    let temp_path = directory.join(format!(".{}.{}.tmp", stem, Uuid::new_v4()));
    let write_result = write_backup_collection(&temp_path, &index, &packages)
        .and_then(|_| validate_backup_collection(&temp_path).map(|_| ()))
        .and_then(|_| {
            fs::rename(&temp_path, &output_path)
                .map_err(|error| format!("提交多库备份文件失败: {}", error))
        });
    if let Err(error) = write_result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    for (result, entry) in succeeded.iter_mut().zip(index.collections.iter()) {
        result.output_path = format!("{}#{}", output_path.to_string_lossy(), entry.path);
    }
    Ok(BackupBatchExportResult {
        exported_at,
        target_directory,
        output_path: output_path.to_string_lossy().to_string(),
        succeeded,
        failed,
        cancelled,
    })
}
