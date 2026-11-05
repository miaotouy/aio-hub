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
use crate::knowledge::KnowledgeState;
pub use crate::recall::backup_archive::*;
use crate::recall::backup_conversion::import_legacy_backup_to_knowledge;
use crate::recall::core::{AssetRef, RecallCollection};
use crate::recall::index::InMemoryBase;
use crate::recall::state::RecallState;
use chrono::Utc;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

static BACKUP_CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

struct ImportStagingGuard(PathBuf);

impl Drop for ImportStagingGuard {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
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
    export_collection(
        library,
        assets,
        target_directory,
        app.package_info().version.to_string(),
    )
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
    let mut imdb = state.imdb.write().map_err(|_| "获取内存数据库写锁失败")?;
    state.clear_retrieval_cache()?;
    repository.restore_collection(&RecallCollection {
        meta: library.meta.clone(),
        entries: library.entries.clone(),
    })?;
    imdb.bases
        .insert(target_id, Arc::new(RwLock::new(in_memory)));

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
    finish_backup_batch(
        &directory,
        exported_at,
        succeeded,
        failed,
        cancelled,
        app.package_info().version.to_string(),
    )
}

#[tauri::command]
pub fn recall_cancel_backup_operation() {
    BACKUP_CANCEL_REQUESTED.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn recall_inspect_backup(
    _app: AppHandle,
    state: State<'_, RecallState>,
    source_path: String,
) -> Result<BackupInspectResult, String> {
    crate::recall::backup_archive::recall_inspect_backup(state.repository()?.as_ref(), source_path)
}

#[tauri::command]
pub async fn recall_inspect_backups(
    _app: AppHandle,
    state: State<'_, RecallState>,
    source_path: String,
) -> Result<Vec<BackupInspectItem>, String> {
    crate::recall::backup_archive::recall_inspect_backups(state.repository()?.as_ref(), source_path)
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
    import_legacy_backup_to_knowledge(
        state.repository()?.as_ref(),
        Path::new(&source_path),
        source_entry.as_deref(),
    )
}
