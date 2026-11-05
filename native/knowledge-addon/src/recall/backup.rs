// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0 (the "License");

use super::*;
use crate::knowledge::KnowledgeRepository;
use std::path::Path;

pub(super) fn execute(
    repo: &SqliteRecallRepository,
    caches: &RuntimeCaches,
    command: &str,
    args: &Value,
) -> Result<Value> {
    if command.starts_with("_recall_backup_") {
        return internal(repo, caches, command, args);
    }
    let source_path = text(args, "sourcePath")?;
    match command {
        "recall_inspect_backup" => Ok(json!(backup_archive::recall_inspect_backup(
            repo,
            source_path.to_string(),
        )
        .map_err(error)?)),
        "recall_inspect_backups" => Ok(json!(backup_archive::recall_inspect_backups(
            repo,
            source_path.to_string(),
        )
        .map_err(error)?)),
        "recall_import_legacy_backup_to_knowledge" => {
            let source_entry = match args.get("sourceEntry") {
                None | Some(Value::Null) => None,
                Some(Value::String(value)) if !value.is_empty() => Some(value.as_str()),
                _ => return Err(error("sourceEntry 必须是备份容器内的库目录")),
            };
            let app_data = repo
                .main_db_path()
                .parent()
                .and_then(Path::parent)
                .ok_or_else(|| error("Recall 应用数据目录无效"))?;
            let repository = KnowledgeRepository::new(app_data.to_path_buf());
            repository.initialize().map_err(error)?;
            Ok(json!(backup_conversion::import_legacy_backup_to_knowledge(
                &repository,
                Path::new(source_path),
                source_entry,
            )
            .map_err(error)?))
        }
        _ => Err(error(format!(
            "unsupported Recall backup command: {command}"
        ))),
    }
}

use super::backup_archive::*;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;

#[derive(Default)]
pub(super) struct Sessions {
    export: Option<(Uuid, RecallCollectionDtoV1)>,
    import: Option<ImportSession>,
}

struct OwnedDirectory {
    path: PathBuf,
    canonical: PathBuf,
}
impl Drop for OwnedDirectory {
    fn drop(&mut self) {
        // A replaced staging directory is retained rather than following a redirected path.
        if !redirected(&self.path).unwrap_or(true)
            && fs::canonicalize(&self.path).ok().as_ref() == Some(&self.canonical)
        {
            if let Err(error) = fs::remove_dir_all(&self.path) {
                log::warn!("清理 Recall 备份暂存失败: {error}");
            }
        }
    }
}
fn redirected(path: &Path) -> std::io::Result<bool> {
    let meta = fs::symlink_metadata(path)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Ok(true);
        }
    }
    Ok(meta.file_type().is_symlink())
}
fn staging(repo: &SqliteRecallRepository) -> Result<OwnedDirectory> {
    let root = repo
        .main_db_path()
        .parent()
        .ok_or_else(|| error("Recall 数据目录无效"))?;
    if redirected(root).map_err(error)? {
        return Err(error("Recall 数据目录包含重定向"));
    }
    let parent = root.join("backup-staging");
    match fs::create_dir(&parent) {
        Ok(()) => (),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
        Err(e) => return Err(error(e)),
    }
    if redirected(&parent).map_err(error)? || !parent.is_dir() {
        return Err(error("Recall 备份暂存目录不安全"));
    }
    let path = parent.join(Uuid::new_v4().to_string());
    fs::create_dir(&path).map_err(error)?;
    let canonical = fs::canonicalize(&path).map_err(error)?;
    Ok(OwnedDirectory { path, canonical })
}
struct ImportSession {
    token: Uuid,
    parsed: ParsedBackup,
    source_path: String,
    options: BackupImportOptions,
    fingerprint: String,
    _staging: OwnedDirectory,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssetSource {
    path: Option<String>,
    name: String,
    mime_type: String,
    missing_reason: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoredAsset {
    id: String,
    name: String,
    mime_type: String,
}
fn fingerprint(collection: &Option<RecallCollection>) -> Result<String> {
    Ok(blake3_hex(&serde_json::to_vec(collection).map_err(error)?))
}
fn references(library: &RecallCollectionDtoV1) -> Vec<String> {
    let mut ids = HashSet::new();
    ids.extend(library.meta.icon.iter().cloned());
    for entry in &library.entries {
        ids.extend(entry.assets.iter().map(|asset| asset.id.clone()));
    }
    let mut ids: Vec<_> = ids.into_iter().collect();
    ids.sort();
    ids
}
fn token(args: &Value) -> Result<Uuid> {
    Uuid::parse_str(text(args, "token")?).map_err(error)
}
fn assert_free(sessions: &Sessions) -> Result<()> {
    if sessions.export.is_some() || sessions.import.is_some() {
        return Err(error("已有 Recall 备份操作正在运行"));
    }
    Ok(())
}
fn internal(
    repo: &SqliteRecallRepository,
    caches: &RuntimeCaches,
    command: &str,
    args: &Value,
) -> Result<Value> {
    let mut sessions = caches.backup.lock().map_err(error)?;
    match command {
        "_recall_backup_prepare_export" => {
            assert_free(&sessions)?;
            let id = Uuid::parse_str(text(args, "recallId")?).map_err(error)?;
            let collection = repo
                .load_collection(id)
                .map_err(error)?
                .ok_or_else(|| error(format!("找不到思绪集: {id}")))?;
            let library = RecallCollectionDtoV1 {
                meta: collection.meta,
                entries: collection.entries,
            };
            let ids = references(&library);
            let token = Uuid::new_v4();
            sessions.export = Some((token, library));
            Ok(json!({"token": token, "assetIds": ids}))
        }
        "_recall_backup_discard_export" => {
            let token = token(args)?;
            if sessions.export.as_ref().is_some_and(|(id, _)| *id == token) {
                sessions.export.take();
            }
            Ok(Value::Null)
        }
        "_recall_backup_export" => {
            let token = token(args)?;
            if !sessions.export.as_ref().is_some_and(|(id, _)| *id == token) {
                return Err(error("备份导出会话已失效"));
            }
            let (_, library) = sessions.export.take().unwrap();
            let sources: HashMap<String, AssetSource> =
                decode(args.get("assets").ok_or_else(|| error("missing assets"))?)?;
            let mut assets = Vec::new();
            let mut total = 0u64;
            for id in references(&library) {
                let source = sources.get(&id);
                let (name, mime_type) = source
                    .map(|source| (source.name.clone(), source.mime_type.clone()))
                    .unwrap_or((id.clone(), "application/octet-stream".into()));
                let read = (|| -> std::result::Result<Vec<u8>, String> {
                    let source = source.ok_or_else(|| "资产不存在".to_string())?;
                    let path = source.path.as_deref().ok_or_else(|| {
                        source
                            .missing_reason
                            .clone()
                            .unwrap_or("资产文件缺失".into())
                    })?;
                    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
                    if redirected(Path::new(path)).map_err(|e| e.to_string())? || !meta.is_file() {
                        return Err("资产需为普通文件".into());
                    }
                    if meta.len() > MAX_SINGLE_FILE_SIZE
                        || total.saturating_add(meta.len())
                            > MAX_TOTAL_UNCOMPRESSED_SIZE - MAX_LIBRARY_SIZE
                    {
                        return Err("资产超过备份大小上限".into());
                    }
                    let mut bytes = Vec::new();
                    std::io::Read::read_to_end(
                        &mut std::io::Read::take(
                            fs::File::open(path).map_err(|e| e.to_string())?,
                            MAX_SINGLE_FILE_SIZE + 1,
                        ),
                        &mut bytes,
                    )
                    .map_err(|e| e.to_string())?;
                    if bytes.len() as u64 > MAX_SINGLE_FILE_SIZE {
                        return Err("资产超过备份大小上限".into());
                    }
                    Ok(bytes)
                })();
                let (package_path, sha256, bytes, missing_reason) = match read {
                    Ok(bytes) => {
                        total += bytes.len() as u64;
                        (
                            Some(format!("assets/{}/original.bin", Uuid::new_v4())),
                            Some(sha256_hex(&bytes)),
                            Some(bytes),
                            None,
                        )
                    }
                    Err(reason) => (None, None, None, Some(reason)),
                };
                assets.push(PackageAsset {
                    record: BackupAssetRecord {
                        original_asset_id: id,
                        package_path,
                        name,
                        mime_type,
                        sha256,
                        missing_reason,
                    },
                    bytes,
                });
            }
            Ok(json!(export_collection(
                library,
                assets,
                Path::new(text(args, "targetDirectory")?),
                text(args, "appVersion")?.into()
            )
            .map_err(error)?))
        }
        "_recall_backup_finish_batch" => {
            let succeeded = decode(
                args.get("succeeded")
                    .ok_or_else(|| error("missing succeeded"))?,
            )?;
            let failed = decode(args.get("failed").ok_or_else(|| error("missing failed"))?)?;
            Ok(json!(finish_backup_batch(
                Path::new(text(args, "targetDirectory")?),
                text(args, "exportedAt")?.into(),
                succeeded,
                failed,
                args.get("cancelled")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                text(args, "appVersion")?.into()
            )
            .map_err(error)?))
        }
        "_recall_backup_prepare_import" => {
            assert_free(&sessions)?;
            let source_path = text(args, "sourcePath")?.to_string();
            let source_entry = match args.get("sourceEntry") {
                None | Some(Value::Null) => None,
                Some(Value::String(value)) if !value.is_empty() => Some(value.as_str()),
                _ => return Err(error("sourceEntry 必须是备份容器内的库目录")),
            };
            let mut parsed =
                parse_backup_source(Path::new(&source_path), source_entry).map_err(error)?;
            let options: BackupImportOptions = decode(
                args.get("options")
                    .ok_or_else(|| error("missing options"))?,
            )?;
            let existing = repo
                .load_collection(parsed.library.meta.id)
                .map_err(error)?;
            if existing.is_some() && options.conflict_strategy == BackupConflictStrategy::Cancel {
                return Ok(
                    json!({"skipped": BackupImportReport {source_path,status:"skipped".into(),library_id:None,library_name:parsed.library.meta.name,entry_count:parsed.library.entries.len(),restored_asset_count:0,missing_asset_count:missing_asset_warning_count(&parsed.warnings),replaced_existing:false,imported_as_copy:false,legacy_content_only:parsed.legacy_content_only,vectors_need_rebuild:true,warnings:parsed.warnings}}),
                );
            }
            let fingerprint = fingerprint(&existing)?;
            let owned = staging(repo)?;
            let token = Uuid::new_v4();
            let mut assets = Vec::new();
            if let Some(manifest) = &parsed.manifest {
                for record in &manifest.assets {
                    let Some(package_path) = &record.package_path else {
                        continue;
                    };
                    let bytes = parsed
                        .files
                        .get(package_path)
                        .ok_or_else(|| error("已校验的资产数据缺失"))?;
                    let path = owned.path.join(format!("{}.bin", Uuid::new_v4()));
                    let mut file = fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&path)
                        .map_err(error)?;
                    file.write_all(bytes).map_err(error)?;
                    file.sync_all().map_err(error)?;
                    assets.push(json!({"originalAssetId":record.original_asset_id,"name":record.name,"mimeType":record.mime_type,"path":path.to_string_lossy()}));
                }
            }
            let legacy_ids = if parsed.manifest.is_none() {
                references(&parsed.library)
            } else {
                Vec::new()
            };
            parsed.files.clear();
            sessions.import = Some(ImportSession {
                token,
                parsed,
                source_path,
                options,
                fingerprint,
                _staging: owned,
            });
            Ok(json!({"token":token,"assets":assets,"legacyAssetIds":legacy_ids}))
        }
        "_recall_backup_discard_import" => {
            let token = token(args)?;
            if sessions
                .import
                .as_ref()
                .is_some_and(|session| session.token == token)
            {
                sessions.import.take();
            }
            Ok(Value::Null)
        }
        "_recall_backup_commit_import" => {
            let token = token(args)?;
            if !sessions
                .import
                .as_ref()
                .is_some_and(|session| session.token == token)
            {
                return Err(error("备份恢复会话已失效"));
            }
            let session = sessions.import.take().unwrap();
            let mapping: HashMap<String, RestoredAsset> = decode(
                args.get("assetMap")
                    .ok_or_else(|| error("missing assetMap"))?,
            )?;
            let source_id = session.parsed.library.meta.id;
            let existing = repo.load_collection(source_id).map_err(error)?;
            if fingerprint(&existing)? != session.fingerprint {
                return Err(error("思绪集在备份恢复期间已更新，请重新检查后恢复"));
            }
            let mut library = session.parsed.library.clone();
            let mut warnings = session.parsed.warnings.clone();
            let mut used = HashSet::new();
            if let Some(manifest) = &session.parsed.manifest {
                for asset in &manifest.assets {
                    if asset.package_path.is_some() {
                        if !mapping.contains_key(&asset.original_asset_id) {
                            return Err(error("备份资产尚未恢复，已保留原思绪集"));
                        }
                        used.insert(asset.original_asset_id.clone());
                    }
                }
            } else {
                for id in references(&library) {
                    if mapping.contains_key(&id) {
                        used.insert(id);
                    } else {
                        warnings.push(warning(
                            "missingLegacyAsset",
                            "当前 AssetManager 中找不到 legacy 引用，已移除悬空引用",
                            Some(id),
                        ));
                    }
                }
            }
            for id in &used {
                let asset = &mapping[id];
                if asset.id.is_empty()
                    || asset.id.len() > 255
                    || asset.id.contains(['\\', '/', ':', '\0'])
                {
                    return Err(error("恢复后的资产 ID 无效"));
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
                        mapping.get(&reference.id).map(|asset| core::AssetRef {
                            id: asset.id.clone(),
                            name: asset.name.clone(),
                            mime_type: asset.mime_type.clone(),
                            protocol: "appdata://".into(),
                        })
                    })
                    .collect();
            }
            let copied = existing.is_some()
                && session.options.conflict_strategy == BackupConflictStrategy::Copy;
            if copied {
                library.meta.id = Uuid::new_v4();
                let names: HashSet<_> = repo
                    .list_collections()
                    .map_err(error)?
                    .into_iter()
                    .map(|meta| meta.name)
                    .collect();
                let name = library.meta.name.clone();
                library.meta.name = format!("{name} (导入副本)");
                let mut n = 2;
                while names.contains(&library.meta.name) {
                    library.meta.name = format!("{name} (导入副本 {n})");
                    n += 1;
                }
            }
            if copied
                && repo
                    .load_collection(library.meta.id)
                    .map_err(error)?
                    .is_some()
            {
                return Err(error("恢复副本 ID 已存在，请重试"));
            }
            reset_derived_state(&mut library.meta, &library.entries);
            validate_library(&library).map_err(error)?;
            caches.pipeline.invalidate()?;
            caches.retrieval_cache.lock().map_err(error)?.clear();
            caches.loaded_vectors.lock().map_err(error)?.clear();
            repo.restore_collection(&RecallCollection {
                meta: library.meta.clone(),
                entries: library.entries.clone(),
            })
            .map_err(error)?;
            // After durable commit, only infallible response assembly remains. Asset rollback is safe on every returned error.
            Ok(json!(BackupImportReport {
                source_path: session.source_path.clone(),
                status: "success".into(),
                library_id: Some(library.meta.id.to_string()),
                library_name: library.meta.name,
                entry_count: library.entries.len(),
                restored_asset_count: used.len(),
                missing_asset_count: missing_asset_warning_count(&warnings),
                replaced_existing: existing.is_some()
                    && session.options.conflict_strategy == BackupConflictStrategy::Replace,
                imported_as_copy: copied,
                legacy_content_only: session.parsed.legacy_content_only,
                vectors_need_rebuild: true,
                warnings
            }))
        }
        _ => Err(error(format!(
            "unsupported Recall backup operation: {command}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    fn seed(repo: &SqliteRecallRepository) -> RecallCollection {
        let id = Uuid::new_v4();
        let entry:RecallEntry=serde_json::from_value(json!({"id":Uuid::new_v4(),"key":"Backup title","content":"Original backup searchable content","summary":"summary","tags":[{"name":"stable","weight":1.0}],"assets":[{"id":"old-asset","name":"original.bin","mimeType":"application/octet-stream","protocol":"appdata://"},{"id":"missing-asset","name":"missing.bin","mimeType":"application/octet-stream","protocol":"appdata://"}]})).unwrap();
        let meta:RecallCollectionMeta=serde_json::from_value(json!({"id":id,"name":"Backup sample","description":"description","icon":"old-asset","vectorization":{"isIndexed":false,"lastIndexedAt":null,"modelUsed":"","dimension":0,"totalTokens":0}})).unwrap();
        let collection = RecallCollection {
            meta,
            entries: vec![entry],
        };
        repo.save_collection(&collection).unwrap();
        collection
    }
    fn call(
        repo: &SqliteRecallRepository,
        caches: &RuntimeCaches,
        command: &str,
        args: Value,
    ) -> Value {
        execute(repo, caches, command, &args).unwrap()
    }
    fn package(
        repo: &SqliteRecallRepository,
        caches: &RuntimeCaches,
        id: Uuid,
        target: &Path,
    ) -> String {
        let snapshot = call(
            repo,
            caches,
            "_recall_backup_prepare_export",
            json!({"recallId":id}),
        );
        let original = target.join("source.bin");
        fs::write(&original, b"original exact bytes").unwrap();
        let result = call(
            repo,
            caches,
            "_recall_backup_export",
            json!({"token":snapshot["token"],"targetDirectory":target,"appVersion":"test","assets":{"old-asset":{"path":original,"name":"original.bin","mimeType":"application/octet-stream","missingReason":null}}}),
        );
        assert_eq!(result["assetCount"], 1);
        assert_eq!(result["warnings"].as_array().unwrap().len(), 1);
        result["outputPath"].as_str().unwrap().to_string()
    }
    #[test]
    fn backup_snapshot_and_asset_restore_preserve_content_ids_and_conflict_choices() {
        let dir = tempdir().unwrap();
        let repo = SqliteRecallRepository::new(dir.path());
        repo.initialize().unwrap();
        let caches = RuntimeCaches::default();
        let original = seed(&repo);
        let snapshot = call(
            &repo,
            &caches,
            "_recall_backup_prepare_export",
            json!({"recallId":original.meta.id}),
        );
        let mut changed = original.clone();
        changed.meta.name = "Changed after snapshot".into();
        repo.save_collection(&changed).unwrap();
        let result = call(
            &repo,
            &caches,
            "_recall_backup_export",
            json!({"token":snapshot["token"],"targetDirectory":dir.path(),"appVersion":"test","assets":{}}),
        );
        let inspected = parse_backup(Path::new(result["outputPath"].as_str().unwrap())).unwrap();
        assert_eq!(inspected.library.meta.name, original.meta.name);
        let source = package(&repo, &caches, original.meta.id, dir.path());
        let skipped = call(
            &repo,
            &caches,
            "_recall_backup_prepare_import",
            json!({"sourcePath":source,"options":{"conflictStrategy":"cancel"}}),
        );
        assert_eq!(skipped["skipped"]["status"], "skipped");
        assert!(caches.backup.lock().unwrap().import.is_none());
        let prepared = call(
            &repo,
            &caches,
            "_recall_backup_prepare_import",
            json!({"sourcePath":source,"options":{"conflictStrategy":"copy"}}),
        );
        assert_eq!(
            fs::read(prepared["assets"][0]["path"].as_str().unwrap()).unwrap(),
            b"original exact bytes"
        );
        let report = call(
            &repo,
            &caches,
            "_recall_backup_commit_import",
            json!({"token":prepared["token"],"assetMap":{"old-asset":{"id":"restored-asset","name":"original.bin","mimeType":"application/octet-stream"}}}),
        );
        assert_eq!(report["importedAsCopy"], true);
        assert_eq!(report["missingAssetCount"], 1);
        assert_eq!(report["restoredAssetCount"], 1);
        let copy = repo
            .load_collection(Uuid::parse_str(report["libraryId"].as_str().unwrap()).unwrap())
            .unwrap()
            .unwrap();
        assert_eq!(copy.entries[0].id, original.entries[0].id);
        assert_eq!(copy.entries[0].content, original.entries[0].content);
        assert_eq!(copy.entries[0].assets.len(), 1);
        assert_eq!(copy.meta.icon.as_deref(), Some("restored-asset"));
        assert!(copy.meta.name.ends_with("(导入副本)"));
        let retained = repo.load_collection(original.meta.id).unwrap().unwrap();
        assert_eq!(
            serde_json::to_value(&retained.entries).unwrap(),
            serde_json::to_value(&original.entries).unwrap()
        );
        assert!(!Path::new(prepared["assets"][0]["path"].as_str().unwrap()).exists());
        let prepared = call(
            &repo,
            &caches,
            "_recall_backup_prepare_import",
            json!({"sourcePath":source,"options":{"conflictStrategy":"replace"}}),
        );
        let report = call(
            &repo,
            &caches,
            "_recall_backup_commit_import",
            json!({"token":prepared["token"],"assetMap":{"old-asset":{"id":"replaced-asset","name":"original.bin","mimeType":"application/octet-stream"}}}),
        );
        assert_eq!(report["replacedExisting"], true);
        assert_eq!(report["libraryId"], original.meta.id.to_string());
        assert_eq!(
            repo.load_collection(original.meta.id)
                .unwrap()
                .unwrap()
                .meta
                .icon
                .as_deref(),
            Some("replaced-asset")
        );
    }
    #[test]
    fn restore_rejects_stale_collection_or_missing_asset_mapping_and_releases_staging() {
        let dir = tempdir().unwrap();
        let repo = SqliteRecallRepository::new(dir.path());
        repo.initialize().unwrap();
        let caches = RuntimeCaches::default();
        let original = seed(&repo);
        let source = package(&repo, &caches, original.meta.id, dir.path());
        let prepared = call(
            &repo,
            &caches,
            "_recall_backup_prepare_import",
            json!({"sourcePath":source,"options":{"conflictStrategy":"replace"}}),
        );
        let staged = prepared["assets"][0]["path"].as_str().unwrap().to_string();
        assert!(execute(
            &repo,
            &caches,
            "_recall_backup_commit_import",
            &json!({"token":Uuid::new_v4(),"assetMap":{}})
        )
        .unwrap_err()
        .reason
        .contains("失效"));
        assert!(Path::new(&staged).is_file());
        assert!(execute(
            &repo,
            &caches,
            "_recall_backup_commit_import",
            &json!({"token":prepared["token"],"assetMap":{}})
        )
        .unwrap_err()
        .reason
        .contains("尚未恢复"));
        assert!(!Path::new(&staged).exists());
        let prepared = call(
            &repo,
            &caches,
            "_recall_backup_prepare_import",
            json!({"sourcePath":source,"options":{"conflictStrategy":"replace"}}),
        );
        let staged = prepared["assets"][0]["path"].as_str().unwrap().to_string();
        let mut changed = original.clone();
        changed.entries[0].content = "Edited while assets were being restored".into();
        repo.save_collection(&changed).unwrap();
        assert!(execute(&repo,&caches,"_recall_backup_commit_import",&json!({"token":prepared["token"],"assetMap":{"old-asset":{"id":"restored","name":"original.bin","mimeType":"application/octet-stream"}}})).unwrap_err().reason.contains("已更新"));
        assert!(!Path::new(&staged).exists());
        assert_eq!(
            repo.load_collection(original.meta.id)
                .unwrap()
                .unwrap()
                .entries[0]
                .content,
            changed.entries[0].content
        );
        let prepared = call(
            &repo,
            &caches,
            "_recall_backup_prepare_import",
            json!({"sourcePath":source,"options":{"conflictStrategy":"copy"}}),
        );
        let staged = prepared["assets"][0]["path"].as_str().unwrap().to_string();
        call(
            &repo,
            &caches,
            "_recall_backup_discard_import",
            json!({"token":prepared["token"]}),
        );
        assert!(!Path::new(&staged).exists());
    }
}
