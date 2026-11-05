// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

use super::*;
use entry_import::{monitor_message, scan_files, ImportConfig, ImportOutcome};

pub(super) fn import(
    repo: &SqliteRecallRepository,
    caches: &RuntimeCaches,
    a: &Value,
) -> Result<Value> {
    let id = Uuid::parse_str(text(a, "recallId")?).map_err(error)?;
    let paths: Vec<String> = decode(a.get("paths").ok_or_else(|| error("missing paths"))?)?;
    let config: ImportConfig = decode(a.get("config").ok_or_else(|| error("missing config"))?)?;
    let deduplicate: bool = decode(
        a.get("deduplicate")
            .ok_or_else(|| error("missing deduplicate"))?,
    )?;
    let total = paths.len();
    let started = std::time::Instant::now();
    let send = |processed, chunks, outcome| {
        caches.emit(
            "recall-monitor",
            json!(monitor_message(
                id,
                total,
                processed,
                chunks,
                started.elapsed().as_millis() as u64,
                outcome
            )),
        )
    };
    send(0, 0, ImportOutcome::Scanning);
    let result = (|| {
        if repo.load_collection(id).map_err(error)?.is_none() {
            return Err(error("找不到目标思绪集"));
        }
        let candidates = scan_files(&paths, &config, |processed, chunks| {
            send(processed, chunks, ImportOutcome::Scanning)
        });
        let skipped = total - candidates.len();
        persist_batch_entries(repo, caches, id, candidates, deduplicate, skipped)
    })();
    match &result {
        Ok(result) => send(
            total,
            result.entries.len(),
            ImportOutcome::Completed {
                skipped: result.skipped_count,
                duplicates: result.duplicate_count,
            },
        ),
        Err(error) => send(0, 0, ImportOutcome::Failed(error.to_string())),
    }
    Ok(json!(result?))
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
    fn file_import_preserves_options_counts_duplicates_and_refreshes_retrieval() {
        let directory = tempfile::tempdir().unwrap();
        let repo = SqliteRecallRepository::new(directory.path());
        repo.initialize().unwrap();
        let caches = RuntimeCaches::default();
        let id = Uuid::new_v4();
        call(
            &repo,
            &caches,
            "recall_save_base_meta",
            json!({"recallId": id, "meta": {"id": id, "name": "Files", "vectorization": {"isIndexed": false, "lastIndexedAt": null, "modelUsed": "", "dimension": 0, "totalTokens": 0}}}),
        );
        let content = "# Rust 导入笔记\n标签：检索，文件; Rust\n持久化 ownership 内容";
        let source = directory.path().join("source.note.md");
        let duplicate = directory.path().join("duplicate.md");
        let plain = directory.path().join("README");
        let binary = directory.path().join("binary.bin");
        let invalid = directory.path().join("invalid.txt");
        let missing = directory.path().join("missing.md");
        let folder = directory.path().join("folder.md");
        std::fs::write(&source, content).unwrap();
        std::fs::write(&duplicate, content).unwrap();
        std::fs::write(&plain, "extensionless text").unwrap();
        std::fs::write(&binary, [0, 1, 2, 255]).unwrap();
        std::fs::write(&invalid, [255, 254, 255]).unwrap();
        std::fs::create_dir(&folder).unwrap();
        let paths = vec![
            source.clone(),
            duplicate,
            plain,
            binary,
            invalid,
            missing,
            folder,
        ]
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>();
        let compilation = call(
            &repo,
            &caches,
            "recall_compile_retrieval_pipeline",
            json!({"presetId": "algorithmic", "runId": "import", "limit": 6}),
        );
        let query = json!({"request": {"query": "ownership", "presetId": "algorithmic", "runId": "import", "configHash": compilation["configHash"], "filters": {"recallIds": [id]}}});
        assert_eq!(
            call(
                &repo,
                &caches,
                "recall_run_retrieval_pipeline",
                query.clone()
            )["outcome"],
            "empty"
        );
        let args = json!({"recallId": id, "paths": paths, "deduplicate": true, "config": {"autoExtractTags": true, "autoExtractTitle": true}});
        let imported = call(&repo, &caches, "recall_batch_import_files", args.clone());
        assert_eq!(imported["skippedCount"], 4);
        assert_eq!(imported["duplicateCount"], 1);
        assert_eq!(imported["entries"].as_array().unwrap().len(), 2);
        let entry = &imported["entries"][0];
        assert_eq!(entry["key"], "Rust 导入笔记");
        assert_eq!(entry["content"], content);
        assert_eq!(entry["contentHash"], content_hash(content));
        assert_eq!(entry["tags"][0]["name"], "检索");
        assert_eq!(entry["tags"][0]["hash"], content_hash("检索"));
        assert_eq!(entry["tags"].as_array().unwrap().len(), 3);
        assert!(!entry["summary"].as_str().unwrap().contains('#'));
        let events = caches
            .events
            .lock()
            .unwrap()
            .drain(..)
            .map(|e| serde_json::from_str::<Value>(&e).unwrap())
            .collect::<Vec<_>>();
        assert!(events
            .iter()
            .any(|e| e["payload"]["payload"]["stats"]["processedFiles"] == 5));
        let completed = &events.last().unwrap()["payload"];
        assert_eq!(completed["type"], "Index");
        assert_eq!(completed["level"], "success");
        assert_eq!(completed["payload"]["stats"]["totalFiles"], 7);
        assert_eq!(completed["payload"]["stats"]["processedFiles"], 7);
        assert_eq!(completed["payload"]["stats"]["totalChunks"], 2);
        assert_eq!(completed["payload"]["metadata"]["recallId"], id.to_string());
        assert_eq!(
            call(&repo, &caches, "recall_run_retrieval_pipeline", query)["results"][0]["entry"]
                ["id"],
            entry["id"]
        );
        let repeated = call(&repo, &caches, "recall_batch_import_files", args);
        assert_eq!(repeated["entries"].as_array().unwrap().len(), 0);
        assert_eq!(repeated["duplicateCount"], 3);
        let plain_import = call(
            &repo,
            &caches,
            "recall_batch_import_files",
            json!({"recallId": id, "paths": [source], "deduplicate": false, "config": {"autoExtractTags": false, "autoExtractTitle": false}}),
        );
        assert_eq!(plain_import["entries"][0]["key"], "source");
        assert!(plain_import["entries"][0]["tags"]
            .as_array()
            .unwrap()
            .is_empty());
        assert_eq!(repo.load_entries(id).unwrap().len(), 3);
        let missing_args = json!({"recallId": Uuid::new_v4(), "paths": [], "deduplicate": true, "config": {"autoExtractTags": true, "autoExtractTitle": true}});
        assert!(
            dispatch_with_caches(&repo, &caches, "recall_batch_import_files", &missing_args)
                .unwrap_err()
                .to_string()
                .contains("目标思绪集")
        );
        let failure: Value =
            serde_json::from_str(caches.events.lock().unwrap().back().unwrap()).unwrap();
        assert_eq!(failure["payload"]["level"], "error");
        assert_eq!(
            SqliteRecallRepository::new(directory.path())
                .load_entries(id)
                .unwrap()
                .len(),
            3
        );
    }
}
