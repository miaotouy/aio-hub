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

use super::repository::RecallRepository;
use super::sqlite::{LegacyImportStateRecord, SqliteRecallRepository};
use crate::recall::core::{RecallCollection, RecallCollectionMeta, RecallEntry};
use crate::recall::io::{get_bases_dir, get_knowledge_root, get_tag_pool_root, get_vectors_dir};
use crate::recall::tag_pool::ModelTagPool;
use blake3::Hasher;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

type CollectionImportData = (
    Vec<CollectionSource>,
    HashMap<Uuid, Vec<RecallEntry>>,
    HashMap<(Uuid, Uuid), RecallEntry>,
);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecallMigrationIssue {
    pub path: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RecallMigrationReport {
    pub source_path: String,
    pub legacy_data_path: String,
    pub source_fingerprint: String,
    pub main_status: String,
    pub vector_status: String,
    pub source_collections: usize,
    pub migrated_collections: usize,
    pub source_entries: usize,
    pub migrated_entries: usize,
    pub skipped_entries: usize,
    pub source_vectors: usize,
    pub migrated_vectors: usize,
    pub pending_vectors: usize,
    pub source_vector_models: usize,
    pub migrated_vector_models: usize,
    pub tag_vector_count: usize,
    pub recovery_instructions: Vec<String>,
    pub issues: Vec<RecallMigrationIssue>,
}

pub struct LegacyFileRecallImporter {
    source_app_data_dir: PathBuf,
    repository: SqliteRecallRepository,
}

impl LegacyFileRecallImporter {
    pub fn new(source_app_data_dir: impl AsRef<Path>, repository: SqliteRecallRepository) -> Self {
        Self {
            source_app_data_dir: source_app_data_dir.as_ref().to_path_buf(),
            repository,
        }
    }

    pub fn import(&self) -> Result<RecallMigrationReport, String> {
        self.repository.initialize()?;
        let source_path = get_bases_dir(&self.source_app_data_dir);
        let legacy_data_path = get_knowledge_root(&self.source_app_data_dir);
        let fingerprint = source_fingerprint(&self.source_app_data_dir)?;
        let source_id = "legacy-file-system-v1";
        if self
            .repository
            .legacy_import_is_completed(false, source_id, &fingerprint)?
            && self
                .repository
                .legacy_import_is_completed(true, source_id, &fingerprint)?
        {
            let mut report = self.read_cached_report(source_id, &fingerprint)?;
            report.source_path = source_path.display().to_string();
            report.legacy_data_path = legacy_data_path.display().to_string();
            if report.main_status.is_empty() {
                report.main_status = "completed".to_string();
            }
            if report.vector_status.is_empty() {
                report.vector_status = "completed".to_string();
            }
            if report.recovery_instructions.is_empty() {
                report.recovery_instructions = recovery_instructions(&report.legacy_data_path);
            }
            return Ok(report);
        }

        let started_at = now();
        let mut report = RecallMigrationReport {
            source_path: source_path.display().to_string(),
            legacy_data_path: legacy_data_path.display().to_string(),
            source_fingerprint: fingerprint.clone(),
            main_status: "running".to_string(),
            vector_status: "running".to_string(),
            recovery_instructions: recovery_instructions(&legacy_data_path.display().to_string()),
            ..Default::default()
        };
        self.repository.record_legacy_import_state(
            false,
            LegacyImportStateRecord {
                source_id,
                source_path: &report.source_path,
                source_fingerprint: Some(&fingerprint),
                status: "running",
                report_json: &serde_json::to_string(&report).unwrap_or_default(),
                started_at: Some(started_at),
                completed_at: None,
                updated_at: started_at,
            },
        )?;
        self.repository.record_legacy_import_state(
            true,
            LegacyImportStateRecord {
                source_id,
                source_path: &report.source_path,
                source_fingerprint: Some(&fingerprint),
                status: "running",
                report_json: &serde_json::to_string(&report).unwrap_or_default(),
                started_at: Some(started_at),
                completed_at: None,
                updated_at: started_at,
            },
        )?;

        let (collections, entries_by_collection, entry_lookup) =
            self.read_collections(&mut report)?;
        for collection in collections {
            let collection_id = collection.meta.id;
            let entries = entries_by_collection
                .get(&collection_id)
                .cloned()
                .unwrap_or_default();
            let imported = RecallCollection {
                meta: collection.meta,
                entries,
            };
            match self
                .repository
                .save_collection(&imported)
                .and_then(|()| self.validate_collection(&imported))
            {
                Ok(()) => {
                    report.migrated_collections += 1;
                    report.migrated_entries += imported.entries.len();
                }
                Err(error) => report.issues.push(RecallMigrationIssue {
                    path: collection.path,
                    message: error,
                }),
            }
        }

        let main_status = if report.migrated_collections == report.source_collections
            && report.migrated_entries == report.source_entries
            && report.skipped_entries == 0
        {
            "completed"
        } else {
            "partial"
        };
        report.main_status = main_status.to_string();
        let vector_issue_start = report.issues.len();
        self.import_vectors(&entry_lookup, &mut report)?;
        self.import_tag_pools(&mut report)?;
        let vector_status =
            if report.pending_vectors == 0 && report.issues.len() == vector_issue_start {
                "completed"
            } else {
                "partial"
            };
        report.vector_status = vector_status.to_string();
        self.repository.record_legacy_import_state(
            true,
            LegacyImportStateRecord {
                source_id,
                source_path: &report.source_path,
                source_fingerprint: Some(&fingerprint),
                status: vector_status,
                report_json: &serde_json::to_string(&report).unwrap_or_default(),
                started_at: Some(started_at),
                completed_at: Some(now()),
                updated_at: now(),
            },
        )?;
        self.repository.record_legacy_import_state(
            false,
            LegacyImportStateRecord {
                source_id,
                source_path: &report.source_path,
                source_fingerprint: Some(&fingerprint),
                status: main_status,
                report_json: &serde_json::to_string(&report).unwrap_or_default(),
                started_at: Some(started_at),
                completed_at: Some(now()),
                updated_at: now(),
            },
        )?;
        Ok(report)
    }

    fn validate_collection(&self, expected: &RecallCollection) -> Result<(), String> {
        let Some(actual) = self.repository.load_collection(expected.meta.id)? else {
            return Err(format!("迁移后找不到集合 {}", expected.meta.id));
        };
        if actual.entries.len() != expected.entries.len() {
            return Err(format!(
                "迁移后条目数不一致: expected {}, got {}",
                expected.entries.len(),
                actual.entries.len()
            ));
        }
        let actual_hashes = actual
            .entries
            .into_iter()
            .map(|entry| (entry.id, entry.content_hash))
            .collect::<HashMap<_, _>>();
        if expected
            .entries
            .iter()
            .any(|entry| actual_hashes.get(&entry.id) != Some(&entry.content_hash))
        {
            return Err("迁移后条目 ID 或 contentHash 校验失败".to_string());
        }
        Ok(())
    }

    fn read_cached_report(
        &self,
        source_id: &str,
        fingerprint: &str,
    ) -> Result<RecallMigrationReport, String> {
        let Some(report_json) =
            self.repository
                .load_legacy_import_report(false, source_id, fingerprint)?
        else {
            return Ok(RecallMigrationReport::default());
        };
        serde_json::from_str(&report_json)
            .map_err(|error| format!("读取已完成的 Recall 迁移报告失败: {error}"))
    }

    fn read_collections(
        &self,
        report: &mut RecallMigrationReport,
    ) -> Result<CollectionImportData, String> {
        let mut collections = Vec::new();
        let mut entries_by_collection = HashMap::new();
        let mut entry_lookup = HashMap::new();
        let mut seen_entry_ids = HashSet::new();
        let bases_dir = get_bases_dir(&self.source_app_data_dir);
        if !bases_dir.exists() {
            return Ok((collections, entries_by_collection, entry_lookup));
        }

        let mut base_paths = fs::read_dir(&bases_dir)
            .map_err(|error| format!("读取旧 Recall 集合目录失败: {error}"))?
            .flatten()
            .filter(|entry| entry.path().is_dir())
            .collect::<Vec<_>>();
        base_paths.sort_by_key(|entry| entry.file_name());
        for base_path in base_paths {
            let path = base_path.path();
            let Some(recall_id) = base_path
                .file_name()
                .to_str()
                .and_then(|value| Uuid::parse_str(value).ok())
            else {
                report.issues.push(RecallMigrationIssue {
                    path: path.display().to_string(),
                    message: "集合目录名不是 UUID，已跳过".to_string(),
                });
                continue;
            };
            report.source_collections += 1;
            let meta_path = path.join("meta.json");
            let meta = match read_json::<RecallCollectionMeta>(&meta_path) {
                Ok(meta) if meta.id == recall_id => meta,
                Ok(meta) => {
                    report.issues.push(RecallMigrationIssue {
                        path: meta_path.display().to_string(),
                        message: format!(
                            "meta.id {} 与目录 ID {} 不一致，已跳过",
                            meta.id, recall_id
                        ),
                    });
                    continue;
                }
                Err(error) => {
                    report.issues.push(RecallMigrationIssue {
                        path: meta_path.display().to_string(),
                        message: error,
                    });
                    continue;
                }
            };
            let mut entries = Vec::new();
            let entries_dir = path.join("entries");
            if entries_dir.exists() {
                let mut entry_paths = fs::read_dir(&entries_dir)
                    .map_err(|error| format!("读取旧条目目录失败: {error}"))?
                    .flatten()
                    .filter(|entry| {
                        entry.path().extension().and_then(|value| value.to_str()) == Some("json")
                    })
                    .collect::<Vec<_>>();
                entry_paths.sort_by_key(|entry| entry.file_name());
                for entry_path in entry_paths {
                    report.source_entries += 1;
                    match read_json::<RecallEntry>(&entry_path.path()) {
                        Ok(entry)
                            if entry_lookup.contains_key(&(recall_id, entry.id))
                                || !seen_entry_ids.insert(entry.id) =>
                        {
                            report.skipped_entries += 1;
                            report.issues.push(RecallMigrationIssue {
                                path: entry_path.path().display().to_string(),
                                message: format!("重复条目 ID {}，已跳过", entry.id),
                            });
                        }
                        Ok(entry) => {
                            entry_lookup.insert((recall_id, entry.id), entry.clone());
                            entries.push(entry);
                        }
                        Err(error) => {
                            report.skipped_entries += 1;
                            report.issues.push(RecallMigrationIssue {
                                path: entry_path.path().display().to_string(),
                                message: error,
                            });
                        }
                    }
                }
            }
            entries_by_collection.insert(recall_id, entries);
            collections.push(CollectionSource {
                path: path.display().to_string(),
                meta,
            });
        }
        Ok((collections, entries_by_collection, entry_lookup))
    }

    fn import_vectors(
        &self,
        entries: &HashMap<(Uuid, Uuid), RecallEntry>,
        report: &mut RecallMigrationReport,
    ) -> Result<(), String> {
        let vectors_root = get_vectors_dir(&self.source_app_data_dir);
        if !vectors_root.exists() {
            return Ok(());
        }
        let model_lookup = self.collect_model_lookup()?;
        let mut source_models = HashSet::new();
        let mut migrated_models = HashSet::new();
        let mut collection_dirs = fs::read_dir(vectors_root)
            .map_err(|error| format!("读取旧向量目录失败: {error}"))?
            .flatten()
            .filter(|entry| entry.path().is_dir())
            .collect::<Vec<_>>();
        collection_dirs.sort_by_key(|entry| entry.file_name());
        for collection_dir in collection_dirs {
            let Some(collection_id) = collection_dir
                .file_name()
                .to_str()
                .and_then(|value| Uuid::parse_str(value).ok())
            else {
                continue;
            };
            let index_path = collection_dir.path().join("models.json");
            let model_index = read_json::<HashMap<String, String>>(&index_path).unwrap_or_default();
            let mut model_dirs = fs::read_dir(collection_dir.path())
                .map_err(|error| format!("读取旧模型目录失败: {error}"))?
                .flatten()
                .filter(|entry| entry.path().is_dir())
                .collect::<Vec<_>>();
            model_dirs.sort_by_key(|entry| entry.file_name());
            for model_dir in model_dirs {
                let safe_model = model_dir.file_name().to_string_lossy().to_string();
                let model_id = model_index
                    .get(&safe_model)
                    .cloned()
                    .or_else(|| model_lookup.get(&safe_model).cloned());
                let Some(model_id) = model_id else {
                    report.issues.push(RecallMigrationIssue {
                        path: model_dir.path().display().to_string(),
                        message: "无法从 safe model ID 反查原始模型 ID，已跳过".to_string(),
                    });
                    continue;
                };
                source_models.insert(model_id.clone());
                let migrated_before = report.migrated_vectors;
                let mut files = fs::read_dir(model_dir.path())
                    .map_err(|error| format!("读取旧向量文件失败: {error}"))?
                    .flatten()
                    .filter(|entry| {
                        entry.path().extension().and_then(|value| value.to_str()) == Some("vec")
                    })
                    .collect::<Vec<_>>();
                files.sort_by_key(|entry| entry.file_name());
                for file in files {
                    report.source_vectors += 1;
                    let Some(entry_id) = file
                        .file_name()
                        .to_str()
                        .map(|value| value.trim_end_matches(".vec"))
                        .and_then(|value| Uuid::parse_str(value).ok())
                    else {
                        report.pending_vectors += 1;
                        continue;
                    };
                    let Some(entry) = entries.get(&(collection_id, entry_id)) else {
                        report.pending_vectors += 1;
                        continue;
                    };
                    let value = match read_json_value(&file.path()) {
                        Ok(value) => value,
                        Err(error) => {
                            report.pending_vectors += 1;
                            report.issues.push(RecallMigrationIssue {
                                path: file.path().display().to_string(),
                                message: error,
                            });
                            continue;
                        }
                    };
                    let vector =
                        match value
                            .get("vector")
                            .and_then(|value| value.as_array())
                            .map(|values| {
                                values
                                    .iter()
                                    .filter_map(|value| value.as_f64().map(|value| value as f32))
                                    .collect::<Vec<_>>()
                            }) {
                            Some(vector) if !vector.is_empty() => vector,
                            _ => {
                                report.pending_vectors += 1;
                                continue;
                            }
                        };
                    if entry.content_hash.is_none() {
                        report.pending_vectors += 1;
                        report.issues.push(RecallMigrationIssue {
                            path: file.path().display().to_string(),
                            message: "源条目缺少 contentHash，向量降级为待重建".to_string(),
                        });
                        continue;
                    }
                    if let Some(vector_hash) = value
                        .get("content_hash")
                        .or_else(|| value.get("contentHash"))
                        .and_then(|value| value.as_str())
                    {
                        if entry.content_hash.as_deref() != Some(vector_hash) {
                            report.pending_vectors += 1;
                            report.issues.push(RecallMigrationIssue {
                                path: file.path().display().to_string(),
                                message: "旧向量 contentHash 与源条目不一致，已降级为待重建"
                                    .to_string(),
                            });
                            continue;
                        }
                    }
                    let tokens = value
                        .get("tokens")
                        .and_then(|value| value.as_u64())
                        .map(|value| value as u32);
                    match self.repository.upsert_entry_vector(
                        collection_id,
                        entry_id,
                        &model_id,
                        &vector,
                        tokens,
                        entry.content_hash.as_deref(),
                        value
                            .get("timestamp")
                            .and_then(|value| value.as_i64())
                            .unwrap_or(entry.updated_at),
                    ) {
                        Ok(()) => report.migrated_vectors += 1,
                        Err(error) => {
                            report.pending_vectors += 1;
                            report.issues.push(RecallMigrationIssue {
                                path: file.path().display().to_string(),
                                message: error,
                            });
                        }
                    }
                }
                if report.migrated_vectors > migrated_before {
                    migrated_models.insert(model_id);
                }
            }
        }
        report.source_vector_models = source_models.len();
        report.migrated_vector_models = migrated_models.len();
        Ok(())
    }

    fn collect_model_lookup(&self) -> Result<HashMap<String, String>, String> {
        let mut lookup = HashMap::new();
        let vectors_root = get_vectors_dir(&self.source_app_data_dir);
        if !vectors_root.exists() {
            return Ok(lookup);
        }
        for collection in fs::read_dir(vectors_root)
            .map_err(|error| format!("读取旧向量目录失败: {error}"))?
            .flatten()
            .filter(|entry| entry.path().is_dir())
        {
            let index =
                read_json::<HashMap<String, String>>(&collection.path().join("models.json"))
                    .unwrap_or_default();
            lookup.extend(index);
        }
        Ok(lookup)
    }

    fn import_tag_pools(&self, report: &mut RecallMigrationReport) -> Result<(), String> {
        let model_lookup = self.collect_model_lookup()?;
        let root = get_tag_pool_root(&self.source_app_data_dir);
        if !root.exists() {
            return Ok(());
        }
        for directory in fs::read_dir(root)
            .map_err(|error| format!("读取旧标签池目录失败: {error}"))?
            .flatten()
            .filter(|entry| entry.path().is_dir())
        {
            let safe_model = directory.file_name().to_string_lossy().to_string();
            let Some(model_id) = model_lookup.get(&safe_model) else {
                report.issues.push(RecallMigrationIssue {
                    path: directory.path().display().to_string(),
                    message: "无法反查标签池模型 ID，已跳过".to_string(),
                });
                continue;
            };
            match ModelTagPool::load(&self.source_app_data_dir, model_id).and_then(|pool| {
                report.tag_vector_count += pool.registry.len();
                self.repository.save_tag_pool(&pool)
            }) {
                Ok(()) => {}
                Err(error) => report.issues.push(RecallMigrationIssue {
                    path: directory.path().display().to_string(),
                    message: error,
                }),
            }
        }
        Ok(())
    }
}

struct CollectionSource {
    path: String,
    meta: RecallCollectionMeta,
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    let bytes = fs::read(path).map_err(|error| format!("读取文件失败: {error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("解析 JSON 失败: {error}"))
}

fn read_json_value(path: &Path) -> Result<serde_json::Value, String> {
    read_json(path)
}

fn source_fingerprint(app_data_dir: &Path) -> Result<String, String> {
    let mut paths = Vec::new();
    for root in [
        get_bases_dir(app_data_dir),
        get_vectors_dir(app_data_dir),
        get_tag_pool_root(app_data_dir),
    ] {
        if !root.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(root)
            .into_iter()
            .flatten()
            .filter(|entry| entry.file_type().is_file())
        {
            paths.push(entry.path().to_path_buf());
        }
    }
    paths.sort();
    let mut hasher = Hasher::new();
    for path in paths {
        hasher.update(path.to_string_lossy().as_bytes());
        let bytes =
            fs::read(&path).map_err(|error| format!("计算迁移指纹时读取文件失败: {error}"))?;
        hasher.update(&bytes);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn recovery_instructions(legacy_data_path: &str) -> Vec<String> {
    vec![
        format!("旧数据目录保留在 {legacy_data_path}，迁移完成后不会自动删除"),
        "恢复前先退出 AIO Hub，并备份 appData/recall/recall.db 与 recall-vectors.db".to_string(),
        "如需重新迁移，请保留旧目录并通过迁移/备份恢复入口执行；不要手工合并数据库文件".to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recall::core::{RecallCollectionMeta, RecallEntry, VectorizationMeta};
    use crate::recall::io::{
        get_recall_dir, get_recall_entries_dir, get_recall_models_index_path,
        get_recall_vector_model_dir, get_safe_model_id,
    };
    use tempfile::tempdir;

    #[test]
    fn imports_legacy_collection_and_is_idempotent() {
        let app_data = tempdir().unwrap();
        let recall_id = Uuid::new_v4();
        let entry_id = Uuid::new_v4();
        let meta = RecallCollectionMeta {
            id: recall_id,
            name: "旧集合".to_string(),
            description: None,
            created_at: 1,
            updated_at: 2,
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
            config: serde_json::json!({}),
        };
        let entry = RecallEntry {
            id: entry_id,
            key: "key".to_string(),
            content: "content".to_string(),
            summary: "summary".to_string(),
            core_tags: Vec::new(),
            tags: Vec::new(),
            assets: Vec::new(),
            priority: 100,
            enabled: true,
            created_at: 3,
            updated_at: 4,
            error_message: None,
            content_hash: Some("hash".to_string()),
            refs: Vec::new(),
            ref_by: Vec::new(),
        };
        let base_dir = get_recall_dir(app_data.path(), &recall_id.to_string());
        fs::create_dir_all(get_recall_entries_dir(
            app_data.path(),
            &recall_id.to_string(),
        ))
        .unwrap();
        fs::write(
            base_dir.join("meta.json"),
            serde_json::to_vec(&meta).unwrap(),
        )
        .unwrap();
        fs::write(
            get_recall_entries_dir(app_data.path(), &recall_id.to_string())
                .join(format!("{entry_id}.json")),
            serde_json::to_vec(&entry).unwrap(),
        )
        .unwrap();
        let model_id = "provider/embedding-model";
        let vector_dir =
            get_recall_vector_model_dir(app_data.path(), &recall_id.to_string(), model_id);
        fs::create_dir_all(&vector_dir).unwrap();
        fs::write(
            get_recall_models_index_path(app_data.path(), &recall_id.to_string()),
            serde_json::to_vec(&HashMap::from([(
                get_safe_model_id(model_id),
                model_id.to_string(),
            )]))
            .unwrap(),
        )
        .unwrap();
        fs::write(
            vector_dir.join(format!("{entry_id}.vec")),
            serde_json::to_vec(&serde_json::json!({
                "entry_id": entry_id,
                "vector": [0.5, 0.25],
                "model": model_id,
                "tokens": 6,
                "contentHash": "hash",
                "timestamp": 5
            }))
            .unwrap(),
        )
        .unwrap();
        let mut tag_pool = ModelTagPool::new(model_id.to_string());
        tag_pool.sync_vectors(vec![("tag".to_string(), vec![0.1, 0.2])]);
        tag_pool.save(app_data.path()).unwrap();

        let repository = SqliteRecallRepository::new(app_data.path());
        repository.initialize().unwrap();
        repository
            .save_collection(&RecallCollection {
                meta: meta.clone(),
                entries: vec![entry.clone()],
            })
            .unwrap();
        let fingerprint = source_fingerprint(app_data.path()).unwrap();
        let source_path = get_bases_dir(app_data.path()).display().to_string();
        for vector_database in [false, true] {
            repository
                .record_legacy_import_state(
                    vector_database,
                    LegacyImportStateRecord {
                        source_id: "legacy-file-system-v1",
                        source_path: &source_path,
                        source_fingerprint: Some(&fingerprint),
                        status: "running",
                        report_json: "{}",
                        started_at: Some(now()),
                        completed_at: None,
                        updated_at: now(),
                    },
                )
                .unwrap();
        }
        let report = LegacyFileRecallImporter::new(app_data.path(), repository.clone())
            .import()
            .unwrap();
        assert_eq!(report.migrated_collections, 1);
        assert_eq!(report.migrated_entries, 1);
        assert_eq!(report.migrated_vectors, 1);
        assert_eq!(report.source_vector_models, 1);
        assert_eq!(report.migrated_vector_models, 1);
        assert_eq!(report.tag_vector_count, 1);
        assert_eq!(report.main_status, "completed");
        assert_eq!(report.vector_status, "completed");
        assert!(report.legacy_data_path.ends_with("knowledge"));
        assert_eq!(report.recovery_instructions.len(), 3);
        assert_eq!(
            repository
                .load_entry(recall_id, entry_id)
                .unwrap()
                .unwrap()
                .content,
            "content"
        );
        assert_eq!(
            repository
                .load_vectors(recall_id, model_id)
                .unwrap()
                .unwrap()
                .0[0]
                .1,
            vec![0.5, 0.25]
        );
        assert_eq!(
            repository.load_tag_pool(model_id).unwrap().registry.len(),
            1
        );
        let second = LegacyFileRecallImporter::new(app_data.path(), repository)
            .import()
            .unwrap();
        assert_eq!(second.migrated_collections, 1);
        assert_eq!(second.main_status, "completed");
        assert_eq!(second.vector_status, "completed");
    }
}
