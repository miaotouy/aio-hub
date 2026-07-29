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

use crate::commands::asset_manager::{
    get_asset_for_backup, import_backup_asset, remove_backup_asset, Asset, AssetCatalog,
};
use crate::knowledge::types::KnowledgeIngestRequest;
use crate::knowledge::KnowledgeState;
use crate::recall::core::{AssetRef, RecallCollection, RecallCollectionMeta, RecallEntry};
use crate::recall::index::InMemoryBase;
use crate::recall::state::RecallState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Cursor, Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const RECALL_BACKUP_FORMAT: &str = "aiohub.recall-collection";
const RECALL_BACKUP_VERSION: u32 = 1;
const RECALL_BACKUP_COLLECTION_FORMAT: &str = "aiohub.recall-collection-backup-collection";
const RECALL_DATA_SCHEMA_VERSION: u32 = 1;
const RECALL_CONFIG_SCHEMA_VERSION: u32 = 1;
const LEGACY_BACKUP_FORMAT: &str = "aiohub.knowledge-library";
const LEGACY_BACKUP_VERSION: u32 = 1;
const LEGACY_BACKUP_COLLECTION_FORMAT: &str = "aiohub.knowledge-library-backup-collection";
const MAX_FILE_COUNT: usize = 4096;
const MAX_SINGLE_FILE_SIZE: u64 = 256 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_SIZE: u64 = 1024 * 1024 * 1024;
const MAX_LIBRARY_SIZE: u64 = 64 * 1024 * 1024;
const MAX_COMPRESSION_RATIO: u64 = 200;
static BACKUP_CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

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
struct RecallCollectionDtoV1 {
    meta: RecallCollectionMeta,
    entries: Vec<RecallEntry>,
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

#[derive(Debug, Clone, Serialize)]
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
struct BackupProgressEvent {
    operation: &'static str,
    current: usize,
    total: usize,
    failed: usize,
    library_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupIndex {
    format: String,
    format_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    data_schema_version: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    config_schema_version: Option<u32>,
    exported_at: String,
    app_version: String,
    #[serde(alias = "backupCount")]
    collection_count: usize,
    failed_count: usize,
    #[serde(alias = "backups")]
    collections: Vec<BackupIndexEntry>,
    failures: Vec<BackupExportFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupIndexEntry {
    path: String,
    #[serde(alias = "libraryId")]
    collection_id: String,
    #[serde(alias = "libraryName")]
    collection_name: String,
    entry_count: usize,
    asset_count: usize,
    warnings: Vec<BackupWarning>,
}

struct PackageAsset {
    record: BackupAssetRecord,
    bytes: Option<Vec<u8>>,
}

struct ParsedBackup {
    library: RecallCollectionDtoV1,
    manifest: Option<RecallCollectionBackupManifestV1>,
    files: HashMap<String, Vec<u8>>,
    format: String,
    legacy_content_only: bool,
    warnings: Vec<BackupWarning>,
}

struct ImportStagingGuard(PathBuf);

impl Drop for ImportStagingGuard {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn warning(code: &str, message: impl Into<String>, asset_id: Option<String>) -> BackupWarning {
    BackupWarning {
        code: code.to_string(),
        message: message.into(),
        asset_id,
    }
}

fn missing_asset_warning_count(warnings: &[BackupWarning]) -> usize {
    warnings
        .iter()
        .filter(|item| item.code.contains("missing") || item.code == "missingAsset")
        .count()
}

fn blake3_hex(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn validate_manifest_version(manifest: &RecallCollectionBackupManifestV1) -> Result<(), String> {
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

fn validate_backup_index_version(index: &BackupIndex) -> Result<(), String> {
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

fn collection_data_file_name(format: &str) -> Result<&'static str, String> {
    match format {
        RECALL_BACKUP_FORMAT | RECALL_BACKUP_COLLECTION_FORMAT => Ok("collection.json"),
        LEGACY_BACKUP_FORMAT | LEGACY_BACKUP_COLLECTION_FORMAT => Ok("library.json"),
        _ => Err(format!("无法确定备份主数据文件: {format}")),
    }
}

fn collection_root_directory(format: &str) -> Result<&'static str, String> {
    match format {
        RECALL_BACKUP_COLLECTION_FORMAT => Ok("collections"),
        LEGACY_BACKUP_COLLECTION_FORMAT => Ok("libraries"),
        _ => Err(format!("无法确定多库备份目录: {format}")),
    }
}

fn is_safe_package_path(path: &str) -> bool {
    if path.is_empty() || path.contains(['\\', ':']) || Path::new(path).is_absolute() {
        return false;
    }
    Path::new(path)
        .components()
        .all(|part| matches!(part, Component::Normal(_)))
}

fn safe_file_component(value: &str, fallback: &str) -> String {
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

fn unique_output_path(directory: &Path, stem: &str, extension: &str) -> PathBuf {
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

fn reset_derived_state(meta: &mut RecallCollectionMeta, entries: &[RecallEntry]) {
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

fn validate_library(library: &RecallCollectionDtoV1) -> Result<(), String> {
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

fn read_library_directory(recall_dir: &Path) -> Result<RecallCollectionDtoV1, String> {
    let meta_path = recall_dir.join("meta.json");
    let meta_bytes = fs::read(&meta_path)
        .map_err(|error| format!("读取思绪集元数据失败 {}: {}", meta_path.display(), error))?;
    let mut meta: RecallCollectionMeta = serde_json::from_slice(&meta_bytes)
        .map_err(|error| format!("解析思绪集元数据失败: {}", error))?;
    let entries_dir = recall_dir.join("entries");
    let mut entries = Vec::new();
    if entries_dir.exists() {
        let mut paths = Vec::new();
        for item in
            fs::read_dir(&entries_dir).map_err(|error| format!("读取条目目录失败: {}", error))?
        {
            let path = item
                .map_err(|error| format!("枚举思绪集条目失败: {}", error))?
                .path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
                paths.push(path);
            }
        }
        paths.sort();
        for path in paths {
            let bytes = fs::read(&path)
                .map_err(|error| format!("读取条目失败 {}: {}", path.display(), error))?;
            let entry: RecallEntry = serde_json::from_slice(&bytes)
                .map_err(|error| format!("解析条目失败 {}: {}", path.display(), error))?;
            entries.push(entry);
        }
    }
    reset_derived_state(&mut meta, &entries);
    let library = RecallCollectionDtoV1 { meta, entries };
    validate_library(&library)?;
    Ok(library)
}

fn collect_package_assets(
    app: &AppHandle,
    catalog: &AssetCatalog,
    library: &RecallCollectionDtoV1,
) -> Result<Vec<PackageAsset>, String> {
    let mut refs = HashMap::<String, AssetRef>::new();
    if let Some(icon_id) = &library.meta.icon {
        refs.insert(
            icon_id.clone(),
            AssetRef {
                id: icon_id.clone(),
                name: icon_id.clone(),
                mime_type: String::new(),
                protocol: "appdata://".to_string(),
            },
        );
    }
    for entry in &library.entries {
        for asset in &entry.assets {
            refs.entry(asset.id.clone())
                .or_insert_with(|| asset.clone());
        }
    }

    let mut ids: Vec<String> = refs.keys().cloned().collect();
    ids.sort();
    let mut packaged = Vec::with_capacity(ids.len());
    for id in ids {
        let source_ref = refs.get(&id).expect("asset ref must exist");
        match get_asset_for_backup(app, catalog, &id) {
            Ok(Some((asset, path))) => {
                let bytes = fs::read(&path)
                    .map_err(|error| format!("读取资产失败 {}: {}", path.display(), error))?;
                if bytes.len() as u64 > MAX_SINGLE_FILE_SIZE {
                    packaged.push(PackageAsset {
                        record: BackupAssetRecord {
                            original_asset_id: id.clone(),
                            package_path: None,
                            name: asset.name,
                            mime_type: asset.mime_type,
                            sha256: asset.metadata.and_then(|metadata| metadata.sha256),
                            missing_reason: Some("资产超过单文件备份上限".to_string()),
                        },
                        bytes: None,
                    });
                    continue;
                }
                let name = safe_file_component(&asset.name, "asset.bin");
                let id_hash = blake3_hex(id.as_bytes());
                let logical_id =
                    format!("{}_{}", safe_file_component(&id, "asset"), &id_hash[..12]);
                let package_path = format!("assets/{}/{}", logical_id, name);
                packaged.push(PackageAsset {
                    record: BackupAssetRecord {
                        original_asset_id: id,
                        package_path: Some(package_path),
                        name: asset.name,
                        mime_type: asset.mime_type,
                        sha256: Some(sha256_hex(&bytes)),
                        missing_reason: None,
                    },
                    bytes: Some(bytes),
                });
            }
            Ok(None) => packaged.push(PackageAsset {
                record: BackupAssetRecord {
                    original_asset_id: id.clone(),
                    package_path: None,
                    name: source_ref.name.clone(),
                    mime_type: source_ref.mime_type.clone(),
                    sha256: None,
                    missing_reason: Some("AssetManager 中不存在原始资产文件".to_string()),
                },
                bytes: None,
            }),
            Err(error) => packaged.push(PackageAsset {
                record: BackupAssetRecord {
                    original_asset_id: id.clone(),
                    package_path: None,
                    name: source_ref.name.clone(),
                    mime_type: source_ref.mime_type.clone(),
                    sha256: None,
                    missing_reason: Some(error),
                },
                bytes: None,
            }),
        }
    }
    Ok(packaged)
}

fn write_backup_zip(
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

fn export_one(
    app: &AppHandle,
    state: &RecallState,
    catalog: &AssetCatalog,
    recall_id: Uuid,
    target_directory: &Path,
) -> Result<BackupExportResult, String> {
    if !target_directory.is_dir() {
        return Err(format!("导出目标不是目录: {}", target_directory.display()));
    }
    let collection = state
        .repository()?
        .load_collection(recall_id)?
        .ok_or_else(|| format!("找不到思绪集: {}", recall_id))?;
    let library = RecallCollectionDtoV1 {
        meta: collection.meta,
        entries: collection.entries,
    };
    let assets = collect_package_assets(app, catalog, &library)?;
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
        app_version: app.package_info().version.to_string(),
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

fn parse_aio_backup(path: &Path) -> Result<ParsedBackup, String> {
    let file = File::open(path).map_err(|error| format!("打开备份文件失败: {}", error))?;
    parse_aio_backup_reader(file)
}

fn parse_aio_backup_reader<R: Read + Seek>(reader: R) -> Result<ParsedBackup, String> {
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

fn read_backup_collection_index(path: &Path) -> Result<Option<BackupIndex>, String> {
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

fn collection_entry_bytes(path: &Path, prefix: &str) -> Result<Vec<u8>, String> {
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

fn parse_backup_collection_entry(path: &Path, prefix: &str) -> Result<ParsedBackup, String> {
    let bytes = collection_entry_bytes(path, prefix)?;
    parse_aio_backup_reader(Cursor::new(bytes))
}

fn validate_backup_index_entry(
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

fn validate_backup_collection(path: &Path) -> Result<BackupIndex, String> {
    let index = read_backup_collection_index(path)?
        .ok_or_else(|| "备份 ZIP 缺少 backup-index.json".to_string())?;
    for backup in &index.collections {
        let parsed = parse_backup_collection_entry(path, &backup.path)?;
        validate_backup_index_entry(backup, &parsed)?;
    }
    Ok(index)
}

fn write_backup_collection(
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

fn parse_legacy_backup(path: &Path) -> Result<ParsedBackup, String> {
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

fn parse_backup(path: &Path) -> Result<ParsedBackup, String> {
    if !path.is_file() {
        return Err(format!("导入文件不存在: {}", path.display()));
    }
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("aio-recall" | "aio-kb") => parse_aio_backup(path),
        _ => parse_aio_backup(path).or_else(|_| parse_legacy_backup(path)),
    }
}

fn parse_backup_source(path: &Path, source_entry: Option<&str>) -> Result<ParsedBackup, String> {
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

fn is_legacy_recall_format(format: &str) -> bool {
    matches!(format, LEGACY_BACKUP_FORMAT | "legacy-json" | "legacy-yaml")
}

fn import_legacy_backup_to_knowledge(
    state: &KnowledgeState,
    source_path: &Path,
    source_entry: Option<&str>,
) -> Result<LegacyKnowledgeImportReport, String> {
    let parsed = parse_backup_source(source_path, source_entry)?;
    if !is_legacy_recall_format(&parsed.format) {
        return Err("只有重构前的“知识库”导出可以转换到新版 Knowledge 资料库".to_string());
    }

    let repository = state.repository()?;
    let source_id = parsed.library.meta.id;
    let source_name = parsed.library.meta.name.trim();
    let library_name = if source_name.is_empty() {
        "未命名旧版资料库"
    } else {
        source_name
    };
    let conversion_note = "由重构前的“知识库”导出转换而来；原格式实际使用思绪条目结构。";
    let description = parsed
        .library
        .meta
        .description
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("{value}\n\n{conversion_note}"))
        .unwrap_or_else(|| conversion_note.to_string());
    let library = repository.create_library(library_name, Some(&description), None)?;

    let mut document_count = 0;
    let mut skipped_entry_count = 0;
    let mut asset_count = 0;
    for entry in &parsed.library.entries {
        asset_count += entry.assets.len();
        let content = if entry.content.trim().is_empty() {
            if entry.summary.trim().is_empty() {
                skipped_entry_count += 1;
                continue;
            }
            entry.summary.clone()
        } else {
            entry.content.clone()
        };
        let title = if entry.key.trim().is_empty() {
            format!("旧版条目 {}", entry.id)
        } else {
            entry.key.clone()
        };
        let request = KnowledgeIngestRequest {
            library_id: library.id.clone(),
            source_path: format!("legacy-recall://{source_id}/{}.md", entry.id),
            title: Some(title),
            mime_type: Some("text/markdown".to_string()),
            content,
        };
        if let Err(error) = repository.ingest(&request) {
            return match repository.delete_library(&library.id) {
                Ok(()) => Err(format!(
                    "转换旧版条目 {} 到 Knowledge 失败，已回滚新资料库: {error}",
                    entry.id
                )),
                Err(cleanup_error) => Err(format!(
                    "转换旧版条目 {} 到 Knowledge 失败: {error}；清理新资料库失败: {cleanup_error}",
                    entry.id
                )),
            };
        }
        document_count += 1;
    }

    let mut warnings = vec![warning(
        "legacyKnowledgeConversion",
        "已将旧版条目的标题与 Markdown 正文转换为 Knowledge 文档；标签、优先级、启用状态和条目关联不会成为 Knowledge 字段，此转换结果无法还原完整思绪结构",
        None,
    )];
    if asset_count > 0 {
        warnings.push(warning(
            "legacyKnowledgeAssetsNotConverted",
            format!(
                "旧版条目包含 {asset_count} 个附件引用；Knowledge 转换只保留标题与正文，不导入附件"
            ),
            None,
        ));
    }
    if skipped_entry_count > 0 {
        warnings.push(warning(
            "legacyKnowledgeEmptyEntriesSkipped",
            format!("跳过 {skipped_entry_count} 个正文和摘要均为空的旧版条目"),
            None,
        ));
    }

    Ok(LegacyKnowledgeImportReport {
        status: "success".to_string(),
        library_id: library.id,
        library_name: library.name,
        document_count,
        skipped_entry_count,
        warnings,
    })
}

fn imported_copy_name(state: &RecallState, source_name: &str) -> Result<String, String> {
    let names = state
        .repository()?
        .list_collections()?
        .into_iter()
        .map(|collection| collection.name)
        .collect::<HashSet<_>>();
    let first = format!("{} (导入副本)", source_name);
    if !names.contains(&first) {
        return Ok(first);
    }
    for index in 2..=9999 {
        let candidate = format!("{} (导入副本 {})", source_name, index);
        if !names.contains(&candidate) {
            return Ok(candidate);
        }
    }
    Ok(format!("{} (导入副本 {})", source_name, Uuid::new_v4()))
}

#[allow(dead_code)] // 仅保留给备份格式夹具，运行时恢复直接提交 SQLite repository。
fn write_staged_library(directory: &Path, library: &RecallCollectionDtoV1) -> Result<(), String> {
    let entries_dir = directory.join("entries");
    fs::create_dir_all(&entries_dir)
        .map_err(|error| format!("创建导入 staging 失败: {}", error))?;
    let meta_bytes = serde_json::to_vec_pretty(&library.meta)
        .map_err(|error| format!("序列化恢复元数据失败: {}", error))?;
    fs::write(directory.join("meta.json"), meta_bytes)
        .map_err(|error| format!("写入恢复元数据失败: {}", error))?;
    for entry in &library.entries {
        let bytes = serde_json::to_vec_pretty(entry)
            .map_err(|error| format!("序列化恢复条目失败: {}", error))?;
        fs::write(entries_dir.join(format!("{}.json", entry.id)), bytes)
            .map_err(|error| format!("写入恢复条目失败: {}", error))?;
    }
    let reread = read_library_directory(directory)?;
    if reread.meta.id != library.meta.id || reread.entries.len() != library.entries.len() {
        return Err("staging 复读校验失败".to_string());
    }
    Ok(())
}

fn remap_assets(
    app: &AppHandle,
    catalog: &AssetCatalog,
    parsed: &ParsedBackup,
    library: &mut RecallCollectionDtoV1,
    created_asset_ids: &mut Vec<String>,
    warnings: &mut Vec<BackupWarning>,
) -> Result<usize, String> {
    let mut mapping = HashMap::<String, Asset>::new();
    if let Some(manifest) = &parsed.manifest {
        for asset_record in &manifest.assets {
            let Some(package_path) = &asset_record.package_path else {
                continue;
            };
            let bytes = parsed
                .files
                .get(package_path)
                .ok_or_else(|| format!("找不到已校验资产: {}", package_path))?;
            let imported = import_backup_asset(
                app,
                catalog,
                bytes,
                &asset_record.name,
                &asset_record.mime_type,
            )?;
            if imported.created {
                created_asset_ids.push(imported.asset.id.clone());
            }
            mapping.insert(asset_record.original_asset_id.clone(), imported.asset);
        }
    } else {
        let mut referenced_ids = HashSet::new();
        if let Some(icon) = &library.meta.icon {
            referenced_ids.insert(icon.clone());
        }
        for entry in &library.entries {
            referenced_ids.extend(entry.assets.iter().map(|asset| asset.id.clone()));
        }
        for id in referenced_ids {
            if let Some((asset, _)) = get_asset_for_backup(app, catalog, &id)? {
                mapping.insert(id, asset);
            } else {
                warnings.push(warning(
                    "missingLegacyAsset",
                    "当前 AssetManager 中找不到 legacy 引用，已移除悬空引用",
                    Some(id),
                ));
            }
        }
    }

    library.meta.icon = library
        .meta
        .icon
        .as_ref()
        .and_then(|id| mapping.get(id))
        .map(|asset| asset.id.clone());
    for entry in &mut library.entries {
        entry.assets = entry
            .assets
            .iter()
            .filter_map(|reference| {
                mapping.get(&reference.id).map(|asset| AssetRef {
                    id: asset.id.clone(),
                    name: asset.name.clone(),
                    mime_type: asset.mime_type.clone(),
                    protocol: "appdata://".to_string(),
                })
            })
            .collect();
    }
    Ok(mapping.len())
}

fn import_one(
    app: &AppHandle,
    state: &RecallState,
    catalog: &AssetCatalog,
    source_path: &Path,
    source_entry: Option<&str>,
    options: BackupImportOptions,
    created_asset_ids: &mut Vec<String>,
) -> Result<BackupImportReport, String> {
    let parsed = parse_backup_source(source_path, source_entry)?;
    let original_id = parsed.library.meta.id;
    let repository = state.repository()?;
    let has_conflict = repository.load_collection(original_id)?.is_some();
    if has_conflict && options.conflict_strategy == BackupConflictStrategy::Cancel {
        return Ok(BackupImportReport {
            source_path: source_path.to_string_lossy().to_string(),
            status: "skipped".to_string(),
            library_id: None,
            library_name: parsed.library.meta.name,
            entry_count: parsed.library.entries.len(),
            restored_asset_count: 0,
            missing_asset_count: missing_asset_warning_count(&parsed.warnings),
            replaced_existing: false,
            imported_as_copy: false,
            legacy_content_only: parsed.legacy_content_only,
            vectors_need_rebuild: true,
            warnings: parsed.warnings,
        });
    }

    let mut library = parsed.library.clone();
    let imported_as_copy =
        has_conflict && options.conflict_strategy == BackupConflictStrategy::Copy;
    if imported_as_copy {
        library.meta.id = Uuid::new_v4();
        library.meta.name = imported_copy_name(state, &library.meta.name)?;
    }
    reset_derived_state(&mut library.meta, &library.entries);
    let target_id = library.meta.id;
    if repository.load_collection(target_id)?.is_some() && !has_conflict {
        return Err(format!("目标思绪集已存在: {}", target_id));
    }

    let mut warnings = parsed.warnings.clone();
    let restored_asset_count = remap_assets(
        app,
        catalog,
        &parsed,
        &mut library,
        created_asset_ids,
        &mut warnings,
    )?;
    reset_derived_state(&mut library.meta, &library.entries);
    validate_library(&library)?;

    let mut in_memory = InMemoryBase::new(library.meta.clone());
    for entry in &library.entries {
        in_memory.sync_entry(entry.clone());
    }
    in_memory.is_fully_loaded = true;
    repository.save_collection(&RecallCollection {
        meta: library.meta.clone(),
        entries: library.entries.clone(),
    })?;
    state
        .imdb
        .write()
        .map_err(|_| "获取内存数据库写锁失败")?
        .bases
        .insert(target_id, Arc::new(RwLock::new(in_memory)));
    state.clear_retrieval_cache()?;

    let missing_asset_count = missing_asset_warning_count(&warnings);
    Ok(BackupImportReport {
        source_path: source_path.to_string_lossy().to_string(),
        status: "success".to_string(),
        library_id: Some(target_id.to_string()),
        library_name: library.meta.name,
        entry_count: library.entries.len(),
        restored_asset_count,
        missing_asset_count,
        replaced_existing: has_conflict
            && options.conflict_strategy == BackupConflictStrategy::Replace,
        imported_as_copy,
        legacy_content_only: parsed.legacy_content_only,
        vectors_need_rebuild: true,
        warnings,
    })
}

#[tauri::command]
pub async fn recall_export_backup(
    app: AppHandle,
    state: State<'_, RecallState>,
    catalog: State<'_, AssetCatalog>,
    recall_id: Uuid,
    target_directory: String,
) -> Result<BackupExportResult, String> {
    export_one(
        &app,
        &state,
        &catalog,
        recall_id,
        Path::new(&target_directory),
    )
}

#[tauri::command]
pub async fn recall_export_backups(
    app: AppHandle,
    state: State<'_, RecallState>,
    catalog: State<'_, AssetCatalog>,
    recall_ids: Vec<Uuid>,
    target_directory: String,
) -> Result<BackupBatchExportResult, String> {
    BACKUP_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
    let directory = PathBuf::from(&target_directory);
    if !directory.is_dir() {
        return Err(format!("导出目标不是目录: {}", directory.display()));
    }
    let ids: Vec<Uuid> = if recall_ids.is_empty() {
        state
            .repository()?
            .list_collections()?
            .into_iter()
            .map(|collection| collection.id)
            .collect()
    } else {
        let mut unique = HashSet::new();
        recall_ids
            .into_iter()
            .filter(|id| unique.insert(*id))
            .collect()
    };
    let exported_at = Utc::now().to_rfc3339();
    let staging_dir = directory.join(format!(".aio-recall-export.{}", Uuid::new_v4()));
    fs::create_dir_all(&staging_dir)
        .map_err(|error| format!("创建多库备份暂存目录失败: {}", error))?;
    let _staging_guard = ImportStagingGuard(staging_dir.clone());
    let mut succeeded = Vec::new();
    let mut failed = Vec::new();
    let mut cancelled = false;
    let total = ids.len();
    for (index, id) in ids.into_iter().enumerate() {
        if BACKUP_CANCEL_REQUESTED.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }
        let _ = app.emit(
            "recall-backup-progress",
            BackupProgressEvent {
                operation: "export",
                current: index,
                total,
                failed: failed.len(),
                library_id: id.to_string(),
            },
        );
        match export_one(&app, &state, &catalog, id, &staging_dir) {
            Ok(result) => succeeded.push(result),
            Err(error) => failed.push(BackupExportFailure {
                library_id: id.to_string(),
                error,
            }),
        }
        let _ = app.emit(
            "recall-backup-progress",
            BackupProgressEvent {
                operation: "export",
                current: index + 1,
                total,
                failed: failed.len(),
                library_id: id.to_string(),
            },
        );
    }
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
        app_version: app.package_info().version.to_string(),
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

#[tauri::command]
pub fn recall_cancel_backup_operation() {
    BACKUP_CANCEL_REQUESTED.store(true, Ordering::SeqCst);
}

fn inspect_parsed_backup(
    state: &RecallState,
    source_path: String,
    source_entry: Option<String>,
    parsed: ParsedBackup,
) -> Result<BackupInspectResult, String> {
    let conflict = state
        .repository()?
        .load_collection(parsed.library.meta.id)?;
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

#[tauri::command]
pub async fn recall_inspect_backup(
    _app: AppHandle,
    state: State<'_, RecallState>,
    source_path: String,
) -> Result<BackupInspectResult, String> {
    let path = PathBuf::from(&source_path);
    let parsed = parse_backup(&path)?;
    inspect_parsed_backup(&state, source_path, None, parsed)
}

#[tauri::command]
pub async fn recall_inspect_backups(
    app: AppHandle,
    state: State<'_, RecallState>,
    source_path: String,
) -> Result<Vec<BackupInspectItem>, String> {
    let path = PathBuf::from(&source_path);
    if path.extension().and_then(|extension| extension.to_str()) != Some("zip") {
        return recall_inspect_backup(app, state, source_path)
            .await
            .map(|result| {
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
                &state,
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

#[tauri::command]
pub async fn recall_import_backup(
    app: AppHandle,
    state: State<'_, RecallState>,
    catalog: State<'_, AssetCatalog>,
    source_path: String,
    source_entry: Option<String>,
    options: BackupImportOptions,
) -> Result<BackupImportReport, String> {
    let mut created_asset_ids = Vec::new();
    let result = import_one(
        &app,
        &state,
        &catalog,
        Path::new(&source_path),
        source_entry.as_deref(),
        options,
        &mut created_asset_ids,
    );
    if result.is_err() {
        for asset_id in created_asset_ids {
            if let Err(error) = remove_backup_asset(&app, &catalog, &asset_id) {
                log::warn!(
                    "[KB_BACKUP] 清理失败导入创建的资产失败: asset_id={}, error={}",
                    asset_id,
                    error
                );
            }
        }
    }
    result
}

#[tauri::command]
pub async fn recall_import_legacy_backup_to_knowledge(
    state: State<'_, KnowledgeState>,
    source_path: String,
    source_entry: Option<String>,
) -> Result<LegacyKnowledgeImportReport, String> {
    import_legacy_backup_to_knowledge(&state, Path::new(&source_path), source_entry.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recall::core::VectorizationMeta;
    use crate::recall::migration_baseline::fixture;
    use crate::recall::storage::RecallRepository;
    use tempfile::tempdir;

    fn empty_library() -> RecallCollectionDtoV1 {
        RecallCollectionDtoV1 {
            meta: RecallCollectionMeta {
                id: Uuid::new_v4(),
                name: "Empty".to_string(),
                description: None,
                created_at: 1,
                updated_at: 1,
                author: None,
                vectorization: VectorizationMeta {
                    is_indexed: false,
                    last_indexed_at: None,
                    model_used: String::new(),
                    dimension: 0,
                    total_tokens: 0,
                },
                models: Vec::new(),
                tags: Vec::new(),
                icon: None,
                entries: Vec::new(),
                config: serde_json::Value::Null,
            },
            entries: Vec::new(),
        }
    }

    fn read_zip_json(path: &Path, entry_name: &str) -> serde_json::Value {
        let file = File::open(path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let mut entry = archive.by_name(entry_name).unwrap();
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[test]
    fn rejects_unsafe_package_paths() {
        assert!(!is_safe_package_path("../library.json"));
        assert!(!is_safe_package_path("C:/library.json"));
        assert!(!is_safe_package_path("C:library.json"));
        assert!(!is_safe_package_path("assets\\bad.bin"));
        assert!(!is_safe_package_path("assets/file.bin:stream"));
        assert!(is_safe_package_path("assets/id/file.bin"));
    }

    #[test]
    fn rejects_duplicate_entry_ids() {
        let mut library = empty_library();
        let id = Uuid::new_v4();
        let entry = RecallEntry {
            id,
            key: "key".to_string(),
            content: "content".to_string(),
            summary: String::new(),
            core_tags: Vec::new(),
            tags: Vec::new(),
            assets: Vec::new(),
            priority: 100,
            enabled: true,
            created_at: 1,
            updated_at: 1,
            error_message: None,
            content_hash: None,
            refs: Vec::new(),
            ref_by: Vec::new(),
        };
        library.entries = vec![entry.clone(), entry];
        reset_derived_state(&mut library.meta, &library.entries);
        assert!(validate_library(&library).is_err());
    }

    #[test]
    fn converts_legacy_backup_entries_to_knowledge_documents() {
        let directory = tempdir().unwrap();
        let backup_path = directory.path().join("legacy.aio-kb");
        let mut library = empty_library();
        library.meta.name = "旧文档库".to_string();
        library.meta.description = Some("旧说明".to_string());
        library.entries = vec![RecallEntry {
            id: Uuid::new_v4(),
            key: "安装说明".to_string(),
            content: "# 安装\n\n运行安装程序。".to_string(),
            summary: "安装摘要".to_string(),
            core_tags: Vec::new(),
            tags: Vec::new(),
            assets: Vec::new(),
            priority: 100,
            enabled: true,
            created_at: 1,
            updated_at: 1,
            error_message: None,
            content_hash: None,
            refs: Vec::new(),
            ref_by: Vec::new(),
        }];
        reset_derived_state(&mut library.meta, &library.entries);
        let bytes = serde_json::to_vec_pretty(&library).unwrap();
        write_legacy_backup_zip(&backup_path, &library, &bytes);
        let state = KnowledgeState::initialized_for_test(directory.path());

        let report = import_legacy_backup_to_knowledge(&state, &backup_path, None).unwrap();

        assert_eq!(report.library_name, "旧文档库");
        assert_eq!(report.document_count, 1);
        assert_eq!(report.skipped_entry_count, 0);
        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.code == "legacyKnowledgeConversion"));
    }

    #[test]
    fn sanitizes_backup_file_names() {
        assert_eq!(safe_file_component("a:b/c", "fallback"), "a_b_c");
        assert_eq!(safe_file_component("...", "fallback"), "fallback");
    }

    #[test]
    fn lists_repository_libraries_without_using_warmup_state() {
        let directory = tempdir().unwrap();
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let repository = crate::recall::storage::SqliteRecallRepository::new(directory.path());
        repository.initialize().unwrap();
        for id in [first, second] {
            let mut library = empty_library();
            library.meta.id = id;
            repository
                .save_collection(&RecallCollection {
                    meta: library.meta,
                    entries: Vec::new(),
                })
                .unwrap();
        }

        let mut expected = vec![first, second];
        expected.sort();
        assert_eq!(
            repository
                .list_collections()
                .unwrap()
                .into_iter()
                .map(|collection| collection.id)
                .collect::<Vec<_>>(),
            expected
        );
    }

    fn manifest_for(
        library: &RecallCollectionDtoV1,
        library_bytes: &[u8],
    ) -> RecallCollectionBackupManifestV1 {
        RecallCollectionBackupManifestV1 {
            format: RECALL_BACKUP_FORMAT.to_string(),
            format_version: RECALL_BACKUP_VERSION,
            data_schema_version: Some(RECALL_DATA_SCHEMA_VERSION),
            config_schema_version: Some(RECALL_CONFIG_SCHEMA_VERSION),
            exported_at: "2026-07-17T00:00:00Z".to_string(),
            app_version: "test".to_string(),
            collection_id: library.meta.id.to_string(),
            collection_name: library.meta.name.clone(),
            entry_count: library.entries.len(),
            asset_count: 0,
            files: vec![BackupFileRecord {
                path: "collection.json".to_string(),
                size: library_bytes.len() as u64,
                blake3: blake3_hex(library_bytes),
            }],
            assets: Vec::new(),
        }
    }

    fn write_legacy_backup_zip(path: &Path, library: &RecallCollectionDtoV1, library_bytes: &[u8]) {
        let manifest = serde_json::json!({
            "format": LEGACY_BACKUP_FORMAT,
            "formatVersion": LEGACY_BACKUP_VERSION,
            "exportedAt": "2026-07-17T00:00:00Z",
            "appVersion": "test",
            "libraryId": library.meta.id.to_string(),
            "libraryName": library.meta.name,
            "entryCount": library.entries.len(),
            "assetCount": 0,
            "files": [{
                "path": "library.json",
                "size": library_bytes.len(),
                "blake3": blake3_hex(library_bytes),
            }],
            "assets": [],
        });
        let file = File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o644);
        writer.start_file("library.json", options).unwrap();
        writer.write_all(library_bytes).unwrap();
        writer.start_file("manifest.json", options).unwrap();
        writer
            .write_all(&serde_json::to_vec_pretty(&manifest).unwrap())
            .unwrap();
        writer.finish().unwrap();
    }

    fn write_legacy_backup_collection(
        path: &Path,
        package_path: &Path,
        library: &RecallCollectionDtoV1,
    ) {
        let file = File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o644);
        let package_file = File::open(package_path).unwrap();
        let mut package = ZipArchive::new(package_file).unwrap();
        for index in 0..package.len() {
            let mut entry = package.by_index(index).unwrap();
            writer
                .start_file(format!("libraries/Empty/{}", entry.name()), options)
                .unwrap();
            std::io::copy(&mut entry, &mut writer).unwrap();
        }
        let index = serde_json::json!({
            "format": LEGACY_BACKUP_COLLECTION_FORMAT,
            "formatVersion": LEGACY_BACKUP_VERSION,
            "exportedAt": "2026-07-17T00:00:00Z",
            "appVersion": "test",
            "backupCount": 1,
            "failedCount": 0,
            "backups": [{
                "path": "libraries/Empty",
                "libraryId": library.meta.id.to_string(),
                "libraryName": library.meta.name,
                "entryCount": library.entries.len(),
                "assetCount": 0,
                "warnings": [],
            }],
            "failures": [],
        });
        writer.start_file("backup-index.json", options).unwrap();
        writer
            .write_all(&serde_json::to_vec_pretty(&index).unwrap())
            .unwrap();
        writer.finish().unwrap();
    }

    #[test]
    fn backup_zip_round_trip_validates_manifest_and_collection() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("empty.aio-recall");
        let library = empty_library();
        let library_bytes = serde_json::to_vec_pretty(&library).unwrap();
        let manifest = manifest_for(&library, &library_bytes);

        write_backup_zip(&path, &manifest, &library_bytes, &[]).unwrap();
        let parsed = parse_aio_backup(&path).unwrap();
        let serialized_manifest = read_zip_json(&path, "manifest.json");

        assert_eq!(parsed.library.meta.id, library.meta.id);
        assert_eq!(parsed.format, RECALL_BACKUP_FORMAT);
        assert_eq!(
            parsed.manifest.as_ref().unwrap().data_schema_version,
            Some(RECALL_DATA_SCHEMA_VERSION)
        );
        assert_eq!(
            parsed.manifest.as_ref().unwrap().config_schema_version,
            Some(RECALL_CONFIG_SCHEMA_VERSION)
        );
        assert_eq!(
            serialized_manifest["collectionId"],
            library.meta.id.to_string()
        );
        assert!(serialized_manifest.get("libraryId").is_none());
        assert!(parsed.files.contains_key("collection.json"));
        assert!(!parsed.legacy_content_only);
    }

    #[test]
    fn legacy_aio_kb_v1_remains_readable() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("legacy.aio-kb");
        let library = empty_library();
        let library_bytes = serde_json::to_vec_pretty(&library).unwrap();
        write_legacy_backup_zip(&path, &library, &library_bytes);
        let parsed = parse_backup(&path).unwrap();

        assert_eq!(parsed.library.meta.id, library.meta.id);
        assert_eq!(parsed.format, LEGACY_BACKUP_FORMAT);
        assert_eq!(parsed.manifest.as_ref().unwrap().data_schema_version, None);
        assert!(parsed
            .warnings
            .iter()
            .any(|warning| warning.code == "legacyRecallBackup"));
        assert_eq!(missing_asset_warning_count(&parsed.warnings), 0);
    }

    #[test]
    fn rejects_unknown_recall_schema_versions() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("future.aio-recall");
        let library = empty_library();
        let library_bytes = serde_json::to_vec_pretty(&library).unwrap();
        let mut manifest = manifest_for(&library, &library_bytes);
        manifest.config_schema_version = Some(RECALL_CONFIG_SCHEMA_VERSION + 1);

        write_backup_zip(&path, &manifest, &library_bytes, &[]).unwrap();
        let error = parse_backup(&path).err().unwrap();

        assert!(error.contains("config schema"));
    }

    #[test]
    fn backup_collection_round_trip_uses_collection_directories() {
        let directory = tempdir().unwrap();
        let mut packages = Vec::new();
        let mut entries = Vec::new();
        for (index, folder) in ["Empty", "Empty_2"].into_iter().enumerate() {
            let package_path = directory.path().join(format!("{}.aio-recall", index));
            let library = empty_library();
            let library_bytes = serde_json::to_vec_pretty(&library).unwrap();
            let manifest = manifest_for(&library, &library_bytes);
            write_backup_zip(&package_path, &manifest, &library_bytes, &[]).unwrap();
            packages.push((format!("collections/{}", folder), package_path));
            entries.push(BackupIndexEntry {
                path: format!("collections/{}", folder),
                collection_id: library.meta.id.to_string(),
                collection_name: library.meta.name,
                entry_count: 0,
                asset_count: 0,
                warnings: Vec::new(),
            });
        }
        let index = BackupIndex {
            format: RECALL_BACKUP_COLLECTION_FORMAT.to_string(),
            format_version: RECALL_BACKUP_VERSION,
            data_schema_version: Some(RECALL_DATA_SCHEMA_VERSION),
            config_schema_version: Some(RECALL_CONFIG_SCHEMA_VERSION),
            exported_at: "2026-07-17T00:00:00Z".to_string(),
            app_version: "test".to_string(),
            collection_count: entries.len(),
            failed_count: 0,
            collections: entries,
            failures: Vec::new(),
        };
        let path = directory.path().join("collection.zip");
        write_backup_collection(&path, &index, &packages).unwrap();
        let parsed_index = validate_backup_collection(&path).unwrap();
        let serialized_index = read_zip_json(&path, "backup-index.json");
        assert_eq!(parsed_index.collection_count, 2);
        assert_eq!(serialized_index["collectionCount"], 2);
        assert!(serialized_index.get("backupCount").is_none());
        assert!(serialized_index["collections"][0]
            .get("collectionId")
            .is_some());
        assert!(serialized_index.get("backups").is_none());
        assert!(parse_backup_collection_entry(&path, "collections/Empty")
            .unwrap()
            .manifest
            .is_some());
    }

    #[test]
    fn legacy_multi_library_backup_remains_readable() {
        let directory = tempdir().unwrap();
        let package_path = directory.path().join("legacy.aio-kb");
        let library = empty_library();
        let library_bytes = serde_json::to_vec_pretty(&library).unwrap();
        write_legacy_backup_zip(&package_path, &library, &library_bytes);
        let path = directory.path().join("legacy-collection.zip");
        write_legacy_backup_collection(&path, &package_path, &library);

        let parsed_index = validate_backup_collection(&path).unwrap();
        assert_eq!(parsed_index.format, LEGACY_BACKUP_COLLECTION_FORMAT);
        let parsed = parse_backup_collection_entry(&path, "libraries/Empty").unwrap();
        assert_eq!(parsed.format, LEGACY_BACKUP_FORMAT);
    }

    // Manual regression against real exports produced before the Recall/Knowledge split.
    // The files stay outside the repository because they may contain private user data.
    // Run instructions: src/tools/recall/docs/architecture/storage-migration-contract.md
    #[test]
    #[ignore = "manual real-backup regression requiring AIO_RECALL_LEGACY_SINGLE_BACKUP and AIO_RECALL_LEGACY_MULTI_BACKUP"]
    fn manual_verifies_external_legacy_backup_files() {
        let single = PathBuf::from(
            std::env::var_os("AIO_RECALL_LEGACY_SINGLE_BACKUP")
                .expect("AIO_RECALL_LEGACY_SINGLE_BACKUP must be set"),
        );
        let multiple = PathBuf::from(
            std::env::var_os("AIO_RECALL_LEGACY_MULTI_BACKUP")
                .expect("AIO_RECALL_LEGACY_MULTI_BACKUP must be set"),
        );

        let parsed = parse_backup(&single).unwrap();
        assert_eq!(parsed.format, LEGACY_BACKUP_FORMAT);
        assert!(parsed
            .warnings
            .iter()
            .any(|warning| warning.code == "legacyRecallBackup"));
        assert_eq!(
            parsed.manifest.unwrap().format_version,
            LEGACY_BACKUP_VERSION
        );

        let index = validate_backup_collection(&multiple).unwrap();
        assert_eq!(index.format, LEGACY_BACKUP_COLLECTION_FORMAT);
        assert!(!index.collections.is_empty());
        let parsed = parse_backup_collection_entry(&multiple, &index.collections[0].path).unwrap();
        assert!(parsed
            .warnings
            .iter()
            .any(|warning| warning.code == "legacyRecallBackup"));

        let knowledge_data = tempdir().unwrap();
        let knowledge_state = KnowledgeState::initialized_for_test(knowledge_data.path());
        let single_report =
            import_legacy_backup_to_knowledge(&knowledge_state, &single, None).unwrap();
        assert!(single_report.document_count > 0);
        let multi_report = import_legacy_backup_to_knowledge(
            &knowledge_state,
            &multiple,
            Some(&index.collections[0].path),
        )
        .unwrap();
        assert!(multi_report.document_count > 0);
    }

    #[test]
    fn rejects_checksum_mismatch_before_import() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("broken.aio-recall");
        let library = empty_library();
        let library_bytes = serde_json::to_vec_pretty(&library).unwrap();
        let mut manifest = manifest_for(&library, &library_bytes);
        manifest.files[0].blake3 = "0".repeat(64);

        write_backup_zip(&path, &manifest, &library_bytes, &[]).unwrap();

        let error = parse_aio_backup(&path).err().unwrap();
        assert!(error.contains("BLAKE3"));
    }

    #[test]
    fn rejects_zip_traversal_entries() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("traversal.aio-recall");
        let file = File::create(&path).unwrap();
        let mut writer = ZipWriter::new(file);
        writer
            .start_file("../evil.json", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"{}").unwrap();
        writer.finish().unwrap();

        let error = parse_aio_backup(&path).err().unwrap();
        assert!(error.contains("不安全"));
    }

    #[test]
    fn reads_legacy_json_and_yaml_as_content_only() {
        let directory = tempdir().unwrap();
        let library = empty_library();
        let legacy = RecallCollection {
            meta: library.meta,
            entries: library.entries,
        };
        let json_path = directory.path().join("legacy.json");
        let yaml_path = directory.path().join("legacy.yaml");
        fs::write(&json_path, serde_json::to_vec_pretty(&legacy).unwrap()).unwrap();
        fs::write(&yaml_path, serde_yaml::to_string(&legacy).unwrap()).unwrap();

        for path in [&json_path, &yaml_path] {
            let parsed = parse_legacy_backup(path).unwrap();
            assert!(parsed.legacy_content_only);
            assert!(parsed
                .warnings
                .iter()
                .any(|warning| warning.code == "legacyRecallBackup"));
            assert_eq!(missing_asset_warning_count(&parsed.warnings), 0);
        }
    }

    #[test]
    fn migration_baseline_is_readable_from_all_supported_backup_inputs() {
        let baseline = fixture();
        let collection = &baseline.collections[0];
        let library = RecallCollectionDtoV1 {
            meta: collection.meta(),
            entries: collection.entries.clone(),
        };
        let directory = tempdir().unwrap();

        let staged = directory.path().join("current-file-layout");
        write_staged_library(&staged, &library).unwrap();
        let reread = read_library_directory(&staged).unwrap();
        assert_eq!(reread.meta.id, collection.id);
        assert_eq!(reread.entries.len(), collection.entries.len());

        let library_bytes = serde_json::to_vec_pretty(&library).unwrap();
        let manifest = manifest_for(&library, &library_bytes);
        let aio_path = directory.path().join("baseline.aio-recall");
        write_backup_zip(&aio_path, &manifest, &library_bytes, &[]).unwrap();
        let aio = parse_backup(&aio_path).unwrap();
        assert_eq!(aio.library.meta.id, collection.id);
        assert_eq!(aio.library.entries.len(), collection.entries.len());
        assert!(!aio.legacy_content_only);

        let legacy = RecallCollection {
            meta: library.meta.clone(),
            entries: library.entries.clone(),
        };
        let json_path = directory.path().join("baseline.json");
        let yaml_path = directory.path().join("baseline.yaml");
        fs::write(&json_path, serde_json::to_vec_pretty(&legacy).unwrap()).unwrap();
        fs::write(&yaml_path, serde_yaml::to_string(&legacy).unwrap()).unwrap();
        for path in [&json_path, &yaml_path] {
            let parsed = parse_backup(path).unwrap();
            assert_eq!(parsed.library.meta.id, collection.id);
            assert_eq!(parsed.library.entries.len(), collection.entries.len());
            assert!(parsed.legacy_content_only);
        }
    }
}
