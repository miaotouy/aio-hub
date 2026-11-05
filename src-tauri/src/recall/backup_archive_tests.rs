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

use super::*;
use crate::knowledge::KnowledgeRepository;
use crate::recall::backup_conversion::import_legacy_backup_to_knowledge;
use crate::recall::core::VectorizationMeta;
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
    let state = KnowledgeRepository::new(directory.path().to_path_buf());
    state.initialize().unwrap();

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
    let knowledge_state = KnowledgeRepository::new(knowledge_data.path().to_path_buf());
    knowledge_state.initialize().unwrap();
    let single_report = import_legacy_backup_to_knowledge(&knowledge_state, &single, None).unwrap();
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
    let baseline: serde_json::Value = serde_json::from_str(include_str!(
        "../../../src/tools/recall/__fixtures__/recall-migration-baseline-v1.json"
    ))
    .unwrap();
    let mut collection = baseline["collections"][0].clone();
    let entries = serde_json::from_value(collection["entries"].take()).unwrap();
    collection["entries"] = serde_json::json!([]);
    collection["vectorization"] = serde_json::to_value(empty_library().meta.vectorization).unwrap();
    let mut library = RecallCollectionDtoV1 {
        meta: serde_json::from_value(collection).unwrap(),
        entries,
    };
    reset_derived_state(&mut library.meta, &library.entries);
    let directory = tempdir().unwrap();

    let staged = directory.path().join("current-file-layout");
    write_staged_library(&staged, &library).unwrap();
    let reread = read_library_directory(&staged).unwrap();
    assert_eq!(reread.meta.id, library.meta.id);
    assert_eq!(reread.entries.len(), library.entries.len());

    let library_bytes = serde_json::to_vec_pretty(&library).unwrap();
    let manifest = manifest_for(&library, &library_bytes);
    let aio_path = directory.path().join("baseline.aio-recall");
    write_backup_zip(&aio_path, &manifest, &library_bytes, &[]).unwrap();
    let aio = parse_backup(&aio_path).unwrap();
    assert_eq!(aio.library.meta.id, library.meta.id);
    assert_eq!(aio.library.entries.len(), library.entries.len());
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
        assert_eq!(parsed.library.meta.id, library.meta.id);
        assert_eq!(parsed.library.entries.len(), library.entries.len());
        assert!(parsed.legacy_content_only);
    }
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

#[test]
fn inspection_verifies_assets_and_reports_persisted_conflicts_without_changes() {
    let directory = tempdir().unwrap();
    let repository = crate::recall::storage::SqliteRecallRepository::new(directory.path());
    repository.initialize().unwrap();
    let path = directory.path().join("with-asset.aio-recall");
    let library = empty_library();
    let mut existing = RecallCollection {
        meta: library.meta.clone(),
        entries: Vec::new(),
    };
    existing.meta.name = "Current saved collection".into();
    repository.save_collection(&existing).unwrap();
    let before =
        serde_json::to_value(repository.load_collection(library.meta.id).unwrap()).unwrap();
    let library_bytes = serde_json::to_vec_pretty(&library).unwrap();
    let bytes = b"original asset bytes".to_vec();
    let record = BackupAssetRecord {
        original_asset_id: "asset-original".into(),
        package_path: Some("assets/asset-original/original.bin".into()),
        name: "original.bin".into(),
        mime_type: "application/octet-stream".into(),
        sha256: Some(sha256_hex(&bytes)),
        missing_reason: None,
    };
    let mut manifest = manifest_for(&library, &library_bytes);
    manifest.asset_count = 1;
    manifest.assets = vec![record.clone()];
    manifest.files.push(BackupFileRecord {
        path: record.package_path.clone().unwrap(),
        size: bytes.len() as u64,
        blake3: blake3_hex(&bytes),
    });
    let assets = [PackageAsset {
        record,
        bytes: Some(bytes),
    }];
    write_backup_zip(&path, &manifest, &library_bytes, &assets).unwrap();
    let inspected = recall_inspect_backup(&repository, path.to_string_lossy().into()).unwrap();
    assert!(inspected.has_conflict);
    assert_eq!(
        inspected.conflicting_library_name.as_deref(),
        Some(existing.meta.name.as_str())
    );
    assert_eq!(inspected.conflicting_entry_count, Some(0));
    assert_eq!(inspected.asset_count, 1);
    assert_eq!(inspected.library_id, library.meta.id.to_string());
    manifest.assets[0].sha256 = Some("0".repeat(64));
    write_backup_zip(&path, &manifest, &library_bytes, &assets).unwrap();
    let error = recall_inspect_backup(&repository, path.to_string_lossy().into()).unwrap_err();
    assert!(error.contains("SHA-256"), "{error}");
    assert_eq!(
        serde_json::to_value(repository.load_collection(library.meta.id).unwrap()).unwrap(),
        before
    );
    assert_eq!(
        repository
            .load_collection(library.meta.id)
            .unwrap()
            .unwrap()
            .meta
            .name,
        existing.meta.name
    );
}

#[test]
fn container_inspection_isolates_invalid_packages_and_checks_selected_entry() {
    let directory = tempdir().unwrap();
    let repository = crate::recall::storage::SqliteRecallRepository::new(directory.path());
    repository.initialize().unwrap();
    let mut packages = Vec::new();
    let mut collections = Vec::new();
    for (position, folder) in ["valid", "corrupt", "wrong-summary"]
        .into_iter()
        .enumerate()
    {
        let library = empty_library();
        let bytes = serde_json::to_vec_pretty(&library).unwrap();
        let mut manifest = manifest_for(&library, &bytes);
        if position == 1 {
            manifest.files[0].blake3 = "0".repeat(64);
        }
        let path = directory.path().join(format!("{folder}.aio-recall"));
        write_backup_zip(&path, &manifest, &bytes, &[]).unwrap();
        let prefix = format!("collections/{folder}");
        packages.push((prefix.clone(), path));
        collections.push(BackupIndexEntry {
            path: prefix,
            collection_id: library.meta.id.to_string(),
            collection_name: library.meta.name,
            entry_count: if position == 2 { 1 } else { 0 },
            asset_count: 0,
            warnings: Vec::new(),
        });
    }
    let index = BackupIndex {
        format: RECALL_BACKUP_COLLECTION_FORMAT.into(),
        format_version: RECALL_BACKUP_VERSION,
        data_schema_version: Some(RECALL_DATA_SCHEMA_VERSION),
        config_schema_version: Some(RECALL_CONFIG_SCHEMA_VERSION),
        exported_at: "2026-11-05T00:00:00Z".into(),
        app_version: "test".into(),
        collection_count: 3,
        failed_count: 0,
        collections,
        failures: Vec::new(),
    };
    let path = directory.path().join("multiple.zip");
    write_backup_collection(&path, &index, &packages).unwrap();
    let results = recall_inspect_backups(&repository, path.to_string_lossy().into()).unwrap();
    assert_eq!(results.len(), 3);
    assert!(results[0].inspect.is_some());
    assert!(results[0].error.is_none());
    assert_eq!(
        results[0].source_entry.as_deref(),
        Some("collections/valid")
    );
    assert!(results[1].error.as_deref().unwrap().contains("BLAKE3"));
    assert!(results[2].error.as_deref().unwrap().contains("摘要不一致"));
    assert!(parse_backup_source(&path, Some("collections/valid")).is_ok());
    assert!(parse_backup_source(&path, Some("collections/corrupt")).is_err());
    assert!(parse_backup_source(&path, Some("collections/wrong-summary")).is_err());
    assert!(parse_backup_source(&path, Some("collections/undeclared")).is_err());
    assert!(repository.list_collections().unwrap().is_empty());
}

#[test]
fn legacy_conversion_preserves_document_content_and_rejects_invalid_inputs_before_creation() {
    let directory = tempdir().unwrap();
    let repository = KnowledgeRepository::new(directory.path().to_path_buf());
    repository.initialize().unwrap();
    let mut library = empty_library();
    let entry: RecallEntry = serde_json::from_value(serde_json::json!({
        "id": Uuid::new_v4(), "key": "正文标题", "content": "# 原始 Markdown\n\n中文正文 🚀", 
        "summary": "摘要内容", "assets": [{ "id": "lost-asset", "name": "example.png", "mimeType": "image/png", "protocol": "appdata://" }]
    })).unwrap();
    let mut summary_only = entry.clone();
    summary_only.id = Uuid::new_v4();
    summary_only.key.clear();
    summary_only.content.clear();
    summary_only.assets.clear();
    let mut empty = summary_only.clone();
    empty.id = Uuid::new_v4();
    empty.summary.clear();
    library.entries = vec![entry.clone(), summary_only.clone(), empty];
    reset_derived_state(&mut library.meta, &library.entries);
    let bytes = serde_json::to_vec_pretty(&library).unwrap();
    let current = directory.path().join("current.aio-recall");
    write_backup_zip(&current, &manifest_for(&library, &bytes), &bytes, &[]).unwrap();
    assert!(
        import_legacy_backup_to_knowledge(&repository, &current, None)
            .unwrap_err()
            .contains("只有重构前")
    );
    let corrupt = directory.path().join("corrupt.aio-kb");
    fs::write(&corrupt, b"invalid ZIP bytes").unwrap();
    assert!(import_legacy_backup_to_knowledge(&repository, &corrupt, None).is_err());
    assert!(repository.list_libraries().unwrap().is_empty());
    let legacy = directory.path().join("legacy.aio-kb");
    write_legacy_backup_zip(&legacy, &library, &bytes);
    let original_backup = fs::read(&legacy).unwrap();
    let report = import_legacy_backup_to_knowledge(&repository, &legacy, None).unwrap();
    assert_eq!(report.document_count, 2);
    assert_eq!(report.skipped_entry_count, 1);
    let documents = repository.list_documents(&report.library_id).unwrap();
    assert_eq!(documents.len(), 2);
    let original = documents.iter().find(|doc| doc.title == entry.key).unwrap();
    assert_eq!(
        original.source_path,
        format!("legacy-recall://{}/{}.md", library.meta.id, entry.id)
    );
    assert_eq!(original.checksum, blake3_hex(entry.content.as_bytes()));
    let summary = documents
        .iter()
        .find(|doc| {
            doc.source_path
                .ends_with(&format!("/{}.md", summary_only.id))
        })
        .unwrap();
    assert_eq!(summary.title, format!("旧版条目 {}", summary_only.id));
    assert_eq!(
        summary.checksum,
        blake3_hex(summary_only.summary.as_bytes())
    );
    assert!(report
        .warnings
        .iter()
        .any(|warning| warning.code == "legacyKnowledgeAssetsNotConverted"));
    assert!(report
        .warnings
        .iter()
        .any(|warning| warning.code == "legacyKnowledgeEmptyEntriesSkipped"));
    assert_eq!(fs::read(&legacy).unwrap(), original_backup);
}
