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
use crate::knowledge::core::{AssetRef, Caiu, KnowledgeBase, KnowledgeBaseMeta};
use crate::knowledge::index::InMemoryBase;
use crate::knowledge::io::{get_bases_dir, get_kb_dir, get_knowledge_root};
use crate::knowledge::state::KnowledgeState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Cursor, Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const BACKUP_FORMAT: &str = "aiohub.knowledge-library";
const BACKUP_VERSION: u32 = 1;
const BACKUP_COLLECTION_FORMAT: &str = "aiohub.knowledge-library-backup-collection";
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
pub struct KnowledgeLibraryBackupManifestV1 {
    pub format: String,
    pub format_version: u32,
    pub exported_at: String,
    pub app_version: String,
    pub library_id: String,
    pub library_name: String,
    pub entry_count: usize,
    pub asset_count: usize,
    pub files: Vec<BackupFileRecord>,
    pub assets: Vec<BackupAssetRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeLibraryDtoV1 {
    meta: KnowledgeBaseMeta,
    entries: Vec<Caiu>,
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
    exported_at: String,
    app_version: String,
    backup_count: usize,
    failed_count: usize,
    backups: Vec<BackupIndexEntry>,
    failures: Vec<BackupExportFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupIndexEntry {
    path: String,
    library_id: String,
    library_name: String,
    entry_count: usize,
    asset_count: usize,
    warnings: Vec<BackupWarning>,
}

struct PackageAsset {
    record: BackupAssetRecord,
    bytes: Option<Vec<u8>>,
}

struct ParsedBackup {
    library: KnowledgeLibraryDtoV1,
    manifest: Option<KnowledgeLibraryBackupManifestV1>,
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

fn blake3_hex(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
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

fn reset_derived_state(meta: &mut KnowledgeBaseMeta, entries: &[Caiu]) {
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

fn validate_library(library: &KnowledgeLibraryDtoV1) -> Result<(), String> {
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
        return Err("元数据条目索引与 library.json 内容不一致".to_string());
    }
    Ok(())
}

fn read_library_directory(kb_dir: &Path) -> Result<KnowledgeLibraryDtoV1, String> {
    let meta_path = kb_dir.join("meta.json");
    let meta_bytes = fs::read(&meta_path)
        .map_err(|error| format!("读取知识库元数据失败 {}: {}", meta_path.display(), error))?;
    let mut meta: KnowledgeBaseMeta = serde_json::from_slice(&meta_bytes)
        .map_err(|error| format!("解析知识库元数据失败: {}", error))?;
    let entries_dir = kb_dir.join("entries");
    let mut entries = Vec::new();
    if entries_dir.exists() {
        let mut paths = Vec::new();
        for item in
            fs::read_dir(&entries_dir).map_err(|error| format!("读取条目目录失败: {}", error))?
        {
            let path = item
                .map_err(|error| format!("枚举知识库条目失败: {}", error))?
                .path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
                paths.push(path);
            }
        }
        paths.sort();
        for path in paths {
            let bytes = fs::read(&path)
                .map_err(|error| format!("读取条目失败 {}: {}", path.display(), error))?;
            let entry: Caiu = serde_json::from_slice(&bytes)
                .map_err(|error| format!("解析条目失败 {}: {}", path.display(), error))?;
            entries.push(entry);
        }
    }
    reset_derived_state(&mut meta, &entries);
    let library = KnowledgeLibraryDtoV1 { meta, entries };
    validate_library(&library)?;
    Ok(library)
}

fn collect_package_assets(
    app: &AppHandle,
    catalog: &AssetCatalog,
    library: &KnowledgeLibraryDtoV1,
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
    manifest: &KnowledgeLibraryBackupManifestV1,
    library_bytes: &[u8],
    assets: &[PackageAsset],
) -> Result<(), String> {
    let file = File::create(path).map_err(|error| format!("创建备份临时文件失败: {}", error))?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    writer
        .start_file("library.json", options)
        .map_err(|error| format!("写入 library.json 失败: {}", error))?;
    writer
        .write_all(library_bytes)
        .map_err(|error| format!("写入 library.json 失败: {}", error))?;
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
    catalog: &AssetCatalog,
    kb_id: Uuid,
    target_directory: &Path,
) -> Result<BackupExportResult, String> {
    if !target_directory.is_dir() {
        return Err(format!("导出目标不是目录: {}", target_directory.display()));
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let kb_dir = get_kb_dir(&app_data_dir, &kb_id.to_string());
    if !kb_dir.is_dir() {
        return Err(format!("找不到知识库持久化目录: {}", kb_id));
    }
    let library = read_library_directory(&kb_dir)?;
    if library.meta.id != kb_id {
        return Err("知识库目录 ID 与 meta.json ID 不一致".to_string());
    }
    let assets = collect_package_assets(app, catalog, &library)?;
    let library_bytes = serde_json::to_vec_pretty(&library)
        .map_err(|error| format!("序列化 library.json 失败: {}", error))?;
    if library_bytes.len() as u64 > MAX_LIBRARY_SIZE {
        return Err("library.json 超过备份大小上限".to_string());
    }
    let mut files = vec![BackupFileRecord {
        path: "library.json".to_string(),
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
    let manifest = KnowledgeLibraryBackupManifestV1 {
        format: BACKUP_FORMAT.to_string(),
        format_version: BACKUP_VERSION,
        exported_at,
        app_version: app.package_info().version.to_string(),
        library_id: kb_id.to_string(),
        library_name: library.meta.name.clone(),
        entry_count: library.entries.len(),
        asset_count: assets.iter().filter(|asset| asset.bytes.is_some()).count(),
        files,
        assets: assets.iter().map(|asset| asset.record.clone()).collect(),
    };
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let stem = format!(
        "{}_aio-kb-v{}_{}",
        safe_file_component(&library.meta.name, "knowledge-library"),
        BACKUP_VERSION,
        timestamp
    );
    let output_path = unique_output_path(target_directory, &stem, "aio-kb");
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
        library_id: kb_id.to_string(),
        library_name: library.meta.name,
        output_path: output_path.to_string_lossy().to_string(),
        entry_count: library.entries.len(),
        asset_count: manifest.asset_count,
        warnings,
    })
}

fn list_persisted_library_ids(app_data_dir: &Path) -> Result<Vec<Uuid>, String> {
    let bases_dir = get_bases_dir(app_data_dir);
    if !bases_dir.exists() {
        return Ok(Vec::new());
    }

    let entries =
        fs::read_dir(&bases_dir).map_err(|error| format!("读取知识库存储目录失败: {}", error))?;
    let mut ids = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| format!("读取知识库存储条目失败: {}", error))?;
        if !entry
            .file_type()
            .map_err(|error| format!("读取知识库存储条目类型失败: {}", error))?
            .is_dir()
        {
            continue;
        }
        if let Some(id) = entry
            .file_name()
            .to_str()
            .and_then(|name| Uuid::parse_str(name).ok())
        {
            ids.push(id);
        }
    }
    ids.sort();
    Ok(ids)
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
    if !names.contains("manifest.json") || !names.contains("library.json") {
        return Err("备份缺少 manifest.json 或 library.json".to_string());
    }

    let manifest: KnowledgeLibraryBackupManifestV1 = {
        let mut file = archive
            .by_name("manifest.json")
            .map_err(|error| format!("读取 manifest.json 失败: {}", error))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|error| format!("读取 manifest.json 失败: {}", error))?;
        serde_json::from_slice(&bytes)
            .map_err(|error| format!("解析 manifest.json 失败: {}", error))?
    };
    if manifest.format != BACKUP_FORMAT || manifest.format_version != BACKUP_VERSION {
        return Err(format!(
            "不支持的备份格式或版本: {} v{}",
            manifest.format, manifest.format_version
        ));
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
        .get("library.json")
        .ok_or_else(|| "manifest 未声明 library.json".to_string())?;
    if library_bytes.len() as u64 > MAX_LIBRARY_SIZE {
        return Err("library.json 超过解析上限".to_string());
    }
    let library: KnowledgeLibraryDtoV1 = serde_json::from_slice(library_bytes)
        .map_err(|error| format!("解析 library.json 失败: {}", error))?;
    validate_library(&library)?;
    if manifest.library_id != library.meta.id.to_string()
        || manifest.library_name != library.meta.name
        || manifest.entry_count != library.entries.len()
    {
        return Err("manifest 与 library.json 摘要不一致".to_string());
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
    Ok(ParsedBackup {
        library,
        manifest: Some(manifest),
        files,
        format: BACKUP_FORMAT.to_string(),
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
    if index.format != BACKUP_COLLECTION_FORMAT || index.format_version != BACKUP_VERSION {
        return Err(format!(
            "不支持的多库备份格式或版本: {} v{}",
            index.format, index.format_version
        ));
    }
    if index.backup_count != index.backups.len() || index.failed_count != index.failures.len() {
        return Err("backup-index.json 的数量摘要不一致".to_string());
    }

    let mut prefixes = HashSet::new();
    let mut library_ids = HashSet::new();
    for backup in &index.backups {
        let components: Vec<_> = Path::new(&backup.path).components().collect();
        if !is_safe_package_path(&backup.path)
            || components.len() != 2
            || components.first() != Some(&Component::Normal("libraries".as_ref()))
            || !prefixes.insert(backup.path.clone())
            || !library_ids.insert(backup.library_id.clone())
        {
            return Err(format!(
                "backup-index.json 包含无效或重复库路径: {}",
                backup.path
            ));
        }
        if !names.contains(&format!("{}/manifest.json", backup.path))
            || !names.contains(&format!("{}/library.json", backup.path))
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
    if parsed.library.meta.id.to_string() != backup.library_id
        || parsed.library.meta.name != backup.library_name
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
    for backup in &index.backups {
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
    let (legacy, format) = match serde_json::from_slice::<KnowledgeBase>(&bytes) {
        Ok(value) => (value, "legacy-json"),
        Err(json_error) => match serde_yaml::from_slice::<KnowledgeBase>(&bytes) {
            Ok(value) => (value, "legacy-yaml"),
            Err(yaml_error) => {
                return Err(format!(
                    "文件既不是有效的 .aio-kb，也不是兼容的 JSON/YAML（JSON: {}; YAML: {}）",
                    json_error, yaml_error
                ));
            }
        },
    };
    let mut library = KnowledgeLibraryDtoV1 {
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
        warnings: vec![warning(
            "legacyContentOnly",
            "legacy JSON/YAML 不包含资产二进制，仅恢复内容与当前环境仍可找到的资产引用",
            None,
        )],
    })
}

fn parse_backup(path: &Path) -> Result<ParsedBackup, String> {
    if !path.is_file() {
        return Err(format!("导入文件不存在: {}", path.display()));
    }
    if path.extension().and_then(|ext| ext.to_str()) == Some("aio-kb") {
        parse_aio_backup(path)
    } else {
        parse_aio_backup(path).or_else(|_| parse_legacy_backup(path))
    }
}

fn parse_backup_source(path: &Path, source_entry: Option<&str>) -> Result<ParsedBackup, String> {
    match source_entry {
        Some(prefix) => {
            let index = read_backup_collection_index(path)?
                .ok_or_else(|| "备份 ZIP 缺少 backup-index.json".to_string())?;
            let index_entry = index
                .backups
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

fn imported_copy_name(state: &KnowledgeState, source_name: &str) -> Result<String, String> {
    let imdb = state.imdb.read().map_err(|_| "获取内存数据库读锁失败")?;
    let names: HashSet<String> = imdb
        .bases
        .values()
        .filter_map(|base| base.read().ok().map(|base| base.meta.name.clone()))
        .collect();
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

fn write_staged_library(directory: &Path, library: &KnowledgeLibraryDtoV1) -> Result<(), String> {
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
    library: &mut KnowledgeLibraryDtoV1,
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
    state: &KnowledgeState,
    catalog: &AssetCatalog,
    source_path: &Path,
    source_entry: Option<&str>,
    options: BackupImportOptions,
    created_asset_ids: &mut Vec<String>,
) -> Result<BackupImportReport, String> {
    let parsed = parse_backup_source(source_path, source_entry)?;
    let original_id = parsed.library.meta.id;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let original_target = get_kb_dir(&app_data_dir, &original_id.to_string());
    let has_conflict = original_target.exists();
    if has_conflict && options.conflict_strategy == BackupConflictStrategy::Cancel {
        return Ok(BackupImportReport {
            source_path: source_path.to_string_lossy().to_string(),
            status: "skipped".to_string(),
            library_id: None,
            library_name: parsed.library.meta.name,
            entry_count: parsed.library.entries.len(),
            restored_asset_count: 0,
            missing_asset_count: parsed.warnings.len(),
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
    let target_dir = get_kb_dir(&app_data_dir, &target_id.to_string());
    if target_dir.exists() && !has_conflict {
        return Err(format!("目标知识库已存在: {}", target_id));
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

    let operation_dir = get_knowledge_root(&app_data_dir)
        .join(".import-staging")
        .join(Uuid::new_v4().to_string());
    let _staging_guard = ImportStagingGuard(operation_dir.clone());
    let staged_dir = operation_dir.join("library");
    write_staged_library(&staged_dir, &library)?;
    fs::create_dir_all(get_bases_dir(&app_data_dir))
        .map_err(|error| format!("创建知识库目录失败: {}", error))?;

    let mut in_memory = InMemoryBase::new(library.meta.clone());
    for entry in &library.entries {
        in_memory.sync_entry(entry.clone());
    }
    in_memory.is_fully_loaded = true;

    let previous_dir = operation_dir.join("previous");
    let mut imdb = state.imdb.write().map_err(|_| "获取内存数据库写锁失败")?;
    if target_dir.exists() {
        if options.conflict_strategy != BackupConflictStrategy::Replace {
            return Err(format!("目标知识库已存在且未选择替换: {}", target_id));
        }
        fs::rename(&target_dir, &previous_dir)
            .map_err(|error| format!("暂存现有知识库失败: {}", error))?;
    }
    if let Err(error) = fs::rename(&staged_dir, &target_dir) {
        if previous_dir.exists() {
            let _ = fs::rename(&previous_dir, &target_dir);
        }
        return Err(format!("提交恢复知识库失败: {}", error));
    }
    imdb.bases
        .insert(target_id, Arc::new(RwLock::new(in_memory)));
    drop(imdb);

    let missing_asset_count = warnings
        .iter()
        .filter(|item| item.code.contains("missing") || item.code == "missingAsset")
        .count();
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
pub async fn kb_export_backup(
    app: AppHandle,
    catalog: State<'_, AssetCatalog>,
    kb_id: Uuid,
    target_directory: String,
) -> Result<BackupExportResult, String> {
    export_one(&app, &catalog, kb_id, Path::new(&target_directory))
}

#[tauri::command]
pub async fn kb_export_backups(
    app: AppHandle,
    catalog: State<'_, AssetCatalog>,
    kb_ids: Vec<Uuid>,
    target_directory: String,
) -> Result<BackupBatchExportResult, String> {
    BACKUP_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
    let directory = PathBuf::from(&target_directory);
    if !directory.is_dir() {
        return Err(format!("导出目标不是目录: {}", directory.display()));
    }
    let ids = if kb_ids.is_empty() {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        list_persisted_library_ids(&app_data_dir)?
    } else {
        let mut unique = HashSet::new();
        kb_ids.into_iter().filter(|id| unique.insert(*id)).collect()
    };
    let exported_at = Utc::now().to_rfc3339();
    let staging_dir = directory.join(format!(".aio-kb-export.{}", Uuid::new_v4()));
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
            "kb-backup-progress",
            BackupProgressEvent {
                operation: "export",
                current: index,
                total,
                failed: failed.len(),
                library_id: id.to_string(),
            },
        );
        match export_one(&app, &catalog, id, &staging_dir) {
            Ok(result) => succeeded.push(result),
            Err(error) => failed.push(BackupExportFailure {
                library_id: id.to_string(),
                error,
            }),
        }
        let _ = app.emit(
            "kb-backup-progress",
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
    for result in &succeeded {
        let base_name = safe_file_component(&result.library_name, "knowledge-library");
        let mut folder_name = base_name.clone();
        for suffix in 2..=9999 {
            let candidate = format!("libraries/{}", folder_name);
            if used_paths.insert(candidate.clone()) {
                packages.push((candidate.clone(), PathBuf::from(&result.output_path)));
                index_entries.push(BackupIndexEntry {
                    path: candidate,
                    library_id: result.library_id.clone(),
                    library_name: result.library_name.clone(),
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
        format: BACKUP_COLLECTION_FORMAT.to_string(),
        format_version: 1,
        exported_at: exported_at.clone(),
        app_version: app.package_info().version.to_string(),
        backup_count: succeeded.len(),
        failed_count: failed.len(),
        backups: index_entries,
        failures: failed.clone(),
    };
    let file_label = if succeeded.len() == 1 {
        safe_file_component(&succeeded[0].library_name, "knowledge-library")
    } else {
        "多个知识库".to_string()
    };
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let stem = format!("{}_aio-kb-v{}_{}", file_label, BACKUP_VERSION, timestamp);
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
    for (result, entry) in succeeded.iter_mut().zip(index.backups.iter()) {
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
pub fn kb_cancel_backup_operation() {
    BACKUP_CANCEL_REQUESTED.store(true, Ordering::SeqCst);
}

fn inspect_parsed_backup(
    app: &AppHandle,
    source_path: String,
    source_entry: Option<String>,
    parsed: ParsedBackup,
) -> Result<BackupInspectResult, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let target_dir = get_kb_dir(&app_data_dir, &parsed.library.meta.id.to_string());
    let (has_conflict, conflicting_library_name, conflicting_entry_count) = if target_dir.exists() {
        let meta_path = target_dir.join("meta.json");
        let bytes = fs::read(&meta_path).map_err(|error| {
            format!(
                "读取冲突知识库元数据失败 {}: {}",
                meta_path.display(),
                error
            )
        })?;
        let meta: KnowledgeBaseMeta = serde_json::from_slice(&bytes)
            .map_err(|error| format!("解析冲突知识库元数据失败: {}", error))?;
        (true, Some(meta.name), Some(meta.entries.len()))
    } else {
        (false, None, None)
    };
    let asset_count = parsed
        .manifest
        .as_ref()
        .map(|manifest| manifest.asset_count)
        .unwrap_or(0);
    Ok(BackupInspectResult {
        source_path,
        source_entry,
        format: parsed.format,
        format_version: parsed
            .manifest
            .as_ref()
            .map(|manifest| manifest.format_version)
            .unwrap_or(0),
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
pub async fn kb_inspect_backup(
    app: AppHandle,
    source_path: String,
) -> Result<BackupInspectResult, String> {
    let path = PathBuf::from(&source_path);
    let parsed = parse_backup(&path)?;
    inspect_parsed_backup(&app, source_path, None, parsed)
}

#[tauri::command]
pub async fn kb_inspect_backups(
    app: AppHandle,
    source_path: String,
) -> Result<Vec<BackupInspectItem>, String> {
    let path = PathBuf::from(&source_path);
    if path.extension().and_then(|extension| extension.to_str()) != Some("zip") {
        return kb_inspect_backup(app, source_path).await.map(|result| {
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
    if index.backups.is_empty() {
        return Err("多库备份容器不包含可导入的知识库".to_string());
    }
    let mut results = Vec::with_capacity(index.backups.len());
    for backup in index.backups {
        let source_entry = backup.path.clone();
        let inspected = parse_backup_collection_entry(&path, &source_entry).and_then(|parsed| {
            validate_backup_index_entry(&backup, &parsed)?;
            inspect_parsed_backup(
                &app,
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
                library_name: backup.library_name,
                inspect: None,
                error: Some(error),
            }),
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn kb_import_backup(
    app: AppHandle,
    state: State<'_, KnowledgeState>,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::knowledge::core::VectorizationMeta;
    use tempfile::tempdir;

    fn empty_library() -> KnowledgeLibraryDtoV1 {
        KnowledgeLibraryDtoV1 {
            meta: KnowledgeBaseMeta {
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
        let entry = Caiu {
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
    fn sanitizes_backup_file_names() {
        assert_eq!(safe_file_component("a:b/c", "fallback"), "a_b_c");
        assert_eq!(safe_file_component("...", "fallback"), "fallback");
    }

    #[test]
    fn lists_persisted_libraries_without_using_warmup_state() {
        let directory = tempdir().unwrap();
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let bases_dir = get_bases_dir(directory.path());
        fs::create_dir_all(bases_dir.join(first.to_string())).unwrap();
        fs::create_dir_all(bases_dir.join(second.to_string())).unwrap();
        fs::create_dir_all(bases_dir.join("not-a-library")).unwrap();
        fs::write(bases_dir.join("README.txt"), b"ignored").unwrap();

        let mut expected = vec![first, second];
        expected.sort();
        assert_eq!(
            list_persisted_library_ids(directory.path()).unwrap(),
            expected
        );
    }

    fn manifest_for(
        library: &KnowledgeLibraryDtoV1,
        library_bytes: &[u8],
    ) -> KnowledgeLibraryBackupManifestV1 {
        KnowledgeLibraryBackupManifestV1 {
            format: BACKUP_FORMAT.to_string(),
            format_version: BACKUP_VERSION,
            exported_at: "2026-07-17T00:00:00Z".to_string(),
            app_version: "test".to_string(),
            library_id: library.meta.id.to_string(),
            library_name: library.meta.name.clone(),
            entry_count: library.entries.len(),
            asset_count: 0,
            files: vec![BackupFileRecord {
                path: "library.json".to_string(),
                size: library_bytes.len() as u64,
                blake3: blake3_hex(library_bytes),
            }],
            assets: Vec::new(),
        }
    }

    #[test]
    fn backup_zip_round_trip_validates_manifest_and_library() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("empty.aio-kb");
        let library = empty_library();
        let library_bytes = serde_json::to_vec_pretty(&library).unwrap();
        let manifest = manifest_for(&library, &library_bytes);

        write_backup_zip(&path, &manifest, &library_bytes, &[]).unwrap();
        let parsed = parse_aio_backup(&path).unwrap();

        assert_eq!(parsed.library.meta.id, library.meta.id);
        assert!(!parsed.legacy_content_only);
    }

    #[test]
    fn backup_collection_round_trip_uses_library_directories() {
        let directory = tempdir().unwrap();
        let mut packages = Vec::new();
        let mut entries = Vec::new();
        for (index, folder) in ["Empty", "Empty_2"].into_iter().enumerate() {
            let package_path = directory.path().join(format!("{}.aio-kb", index));
            let library = empty_library();
            let library_bytes = serde_json::to_vec_pretty(&library).unwrap();
            let manifest = manifest_for(&library, &library_bytes);
            write_backup_zip(&package_path, &manifest, &library_bytes, &[]).unwrap();
            packages.push((format!("libraries/{}", folder), package_path));
            entries.push(BackupIndexEntry {
                path: format!("libraries/{}", folder),
                library_id: library.meta.id.to_string(),
                library_name: library.meta.name,
                entry_count: 0,
                asset_count: 0,
                warnings: Vec::new(),
            });
        }
        let index = BackupIndex {
            format: BACKUP_COLLECTION_FORMAT.to_string(),
            format_version: BACKUP_VERSION,
            exported_at: "2026-07-17T00:00:00Z".to_string(),
            app_version: "test".to_string(),
            backup_count: entries.len(),
            failed_count: 0,
            backups: entries,
            failures: Vec::new(),
        };
        let path = directory.path().join("collection.zip");
        write_backup_collection(&path, &index, &packages).unwrap();
        let parsed_index = validate_backup_collection(&path).unwrap();
        assert_eq!(parsed_index.backup_count, 2);
        assert!(parse_backup_collection_entry(&path, "libraries/Empty")
            .unwrap()
            .manifest
            .is_some());
    }

    #[test]
    fn rejects_checksum_mismatch_before_import() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("broken.aio-kb");
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
        let path = directory.path().join("traversal.aio-kb");
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
        let legacy = KnowledgeBase {
            meta: library.meta,
            entries: library.entries,
        };
        let json_path = directory.path().join("legacy.json");
        let yaml_path = directory.path().join("legacy.yaml");
        fs::write(&json_path, serde_json::to_vec_pretty(&legacy).unwrap()).unwrap();
        fs::write(&yaml_path, serde_yaml::to_string(&legacy).unwrap()).unwrap();

        assert!(parse_legacy_backup(&json_path).unwrap().legacy_content_only);
        assert!(parse_legacy_backup(&yaml_path).unwrap().legacy_content_only);
    }
}
