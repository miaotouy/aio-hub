// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

use super::*;
use storage::legacy_import::{
    LegacyFileRecallImporter, RecallMigrationConfirmation, RecallMigrationProgress,
    RecallMigrationReport, LEGACY_MIGRATION_PROGRESS_EVENT, LEGACY_RECALL_MIGRATION_ID,
};

pub(super) static LOCK: Mutex<()> = Mutex::new(());

pub(super) fn is_mutation(command: &str) -> bool {
    matches!(
        command,
        "recall_run_legacy_migration"
            | "recall_confirm_legacy_cleanup"
            | "recall_debug_reset_legacy_migration"
    )
}

fn progress(caches: &RuntimeCaches, phase: &str, report: Option<&RecallMigrationReport>) {
    caches.emit(
        LEGACY_MIGRATION_PROGRESS_EVENT,
        json!(RecallMigrationProgress::new(phase, report)),
    );
}

pub(super) fn execute(
    repo: &SqliteRecallRepository,
    caches: &RuntimeCaches,
    command: &str,
    a: &Value,
) -> Result<Value> {
    let app_data = repo
        .main_db_path()
        .parent()
        .and_then(|p| p.parent())
        .ok_or_else(|| error("Recall 应用数据目录无效"))?
        .to_path_buf();
    let importer = LegacyFileRecallImporter::new(&app_data, SqliteRecallRepository::new(&app_data));
    match command {
        "recall_inspect_legacy_migration" => Ok(json!(importer.inspect().map_err(error)?)),
        "recall_preview_legacy_migration" => Ok(json!(importer.preview().map_err(error)?)),
        "recall_run_legacy_migration" => {
            let confirmation: RecallMigrationConfirmation = decode(
                a.get("confirmation")
                    .ok_or_else(|| error("missing confirmation"))?,
            )?;
            if !confirmation.confirmed {
                return Err(error("必须明确确认后才能执行旧 Recall 数据迁移"));
            }
            if confirmation.migration_id != LEGACY_RECALL_MIGRATION_ID {
                return Err(error("迁移 ID 不匹配，请重新打开迁移流程"));
            }
            let inspected = importer
                .inspect()
                .map_err(error)?
                .ok_or_else(|| error("未检测到可迁移的旧 Recall 数据"))?;
            if inspected.source_fingerprint != confirmation.source_fingerprint {
                return Err(error("旧 Recall 数据指纹已变化，请重新检测并确认迁移方案"));
            }
            caches.pipeline.invalidate()?;
            caches.retrieval_cache.lock().map_err(error)?.clear();
            caches.loaded_vectors.lock().map_err(error)?.clear();
            caches.tag_pools.lock().map_err(error)?.clear();
            progress(caches, "main", None);
            let report = importer
                .import_with_progress(|phase, report| progress(caches, phase, Some(report)))
                .map_err(error)?;
            warmup(repo, caches)?;
            progress(caches, "completed", Some(&report));
            Ok(json!(report))
        }
        "recall_confirm_legacy_cleanup" => {
            if a.get("confirmed").and_then(Value::as_bool) != Some(true) {
                return Err(error("必须明确确认后才能清理旧 Recall 目录"));
            }
            Ok(json!(importer
                .confirm_cleanup(text(a, "sourceFingerprint")?)
                .map_err(error)?))
        }
        "recall_debug_reset_legacy_migration" => {
            if !cfg!(debug_assertions) {
                return Err(error("迁移调试重置仅在开发构建中可用"));
            }
            repo.clear_legacy_import_state(storage::legacy_import::LEGACY_RECALL_SOURCE_ID)
                .map_err(error)?;
            Ok(Value::Null)
        }
        _ => Err(error("未知旧 Recall 迁移命令")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(
        repo: &SqliteRecallRepository,
        caches: &RuntimeCaches,
        command: &str,
        args: Value,
    ) -> Value {
        serde_json::from_str(&dispatch_with_caches(repo, caches, command, &args).unwrap()).unwrap()
    }

    #[test]
    fn migration_requires_current_confirmation_refreshes_search_and_cleans_only_owned_sources() {
        let directory = tempfile::tempdir().unwrap();
        let repo = SqliteRecallRepository::new(directory.path());
        repo.initialize().unwrap();
        let caches = RuntimeCaches::default();
        let id = Uuid::new_v4();
        let entry_id = Uuid::new_v4();
        let base = io::get_recall_dir(directory.path(), &id.to_string());
        let entries = io::get_recall_entries_dir(directory.path(), &id.to_string());
        std::fs::create_dir_all(&entries).unwrap();
        let meta = json!({"id": id, "name": "Legacy", "vectorization": {"isIndexed": false, "lastIndexedAt": null, "modelUsed": "", "dimension": 0, "totalTokens": 0}});
        let entry: RecallEntry = decode(
            &json!({"id": entry_id, "key": "Rust", "content": "Rust ownership", "enabled": true}),
        )
        .unwrap();
        std::fs::write(base.join("meta.json"), meta.to_string()).unwrap();
        let entry_path = entries.join(format!("{entry_id}.json"));
        std::fs::write(&entry_path, serde_json::to_vec(&entry).unwrap()).unwrap();
        // Prime the empty read model before migration, protecting post-import refresh.
        call(&repo, &caches, "recall_warmup", json!({}));
        let preview = call(&repo, &caches, "recall_preview_legacy_migration", json!({}));
        let mut args = json!({"confirmation": {"migrationId": preview["migrationId"], "sourceFingerprint": preview["sourceFingerprint"], "confirmed": false}});
        assert!(
            dispatch_with_caches(&repo, &caches, "recall_run_legacy_migration", &args)
                .unwrap_err()
                .to_string()
                .contains("明确确认")
        );
        args["confirmation"]["confirmed"] = json!(true);
        args["confirmation"]["sourceFingerprint"] = json!("stale");
        assert!(
            dispatch_with_caches(&repo, &caches, "recall_run_legacy_migration", &args)
                .unwrap_err()
                .to_string()
                .contains("指纹已变化")
        );
        assert!(repo.list_collections().unwrap().is_empty());
        args["confirmation"]["sourceFingerprint"] = preview["sourceFingerprint"].clone();
        let report = call(&repo, &caches, "recall_run_legacy_migration", args.clone());
        assert_eq!(report["mainStatus"], "completed");
        assert_eq!(report["migratedEntries"], 1);
        let events: Vec<Value> = caches
            .events
            .lock()
            .unwrap()
            .drain(..)
            .map(|v| serde_json::from_str(&v).unwrap())
            .collect();
        assert_eq!(events.last().unwrap()["payload"]["phase"], "completed");
        assert!(events.iter().any(|e| e["payload"]["phase"] == "verify"));
        assert!(events
            .iter()
            .all(|e| e["event"] == LEGACY_MIGRATION_PROGRESS_EVENT));
        let compiled = call(
            &repo,
            &caches,
            "recall_compile_retrieval_pipeline",
            json!({"presetId": "algorithmic", "runId": "migration", "limit": 6}),
        );
        let result = call(
            &repo,
            &caches,
            "recall_run_retrieval_pipeline",
            json!({"request": {"query": "Rust", "filters": {"recallIds": [id]}, "presetId": "algorithmic", "runId": "migration", "configHash": compiled["configHash"]}}),
        );
        assert_eq!(result["results"][0]["entry"]["id"], entry_id.to_string());
        call(&repo, &caches, "recall_run_legacy_migration", args);
        assert_eq!(repo.load_entries(id).unwrap().len(), 1);
        assert!(entry_path.exists());
        let cleanup =
            json!({"sourceFingerprint": preview["sourceFingerprint"], "confirmed": false});
        assert!(
            dispatch_with_caches(&repo, &caches, "recall_confirm_legacy_cleanup", &cleanup)
                .is_err()
        );
        std::fs::write(&entry_path, "changed").unwrap();
        let cleanup = json!({"sourceFingerprint": preview["sourceFingerprint"], "confirmed": true});
        assert!(
            dispatch_with_caches(&repo, &caches, "recall_confirm_legacy_cleanup", &cleanup)
                .unwrap_err()
                .to_string()
                .contains("指纹已变化")
        );
        std::fs::write(&entry_path, serde_json::to_vec(&entry).unwrap()).unwrap();
        let knowledge = io::get_knowledge_root(directory.path()).join("knowledge_meta.db");
        std::fs::write(&knowledge, "keep").unwrap();
        let removed = call(&repo, &caches, "recall_confirm_legacy_cleanup", cleanup);
        assert!(!removed.as_array().unwrap().is_empty());
        assert_eq!(std::fs::read_to_string(&knowledge).unwrap(), "keep");
        assert_eq!(repo.load_entries(id).unwrap().len(), 1);
        assert!(call(&repo, &caches, "recall_inspect_legacy_migration", json!({})).is_null());
    }
}
