use super::*;
use crate::recall::storage::sqlite::SqliteRecallRepository;
use crate::recall::{dispatch_with_caches, RuntimeCaches};
use uuid::Uuid;

fn call(
    repo: &SqliteRecallRepository,
    caches: &RuntimeCaches,
    command: &str,
    args: Value,
) -> Value {
    serde_json::from_str(&dispatch_with_caches(repo, caches, command, &args).unwrap()).unwrap()
}

fn collection(repo: &SqliteRecallRepository, caches: &RuntimeCaches, name: &str) -> Uuid {
    let id = Uuid::new_v4();
    call(
        repo,
        caches,
        "recall_save_base_meta",
        json!({"recallId": id, "meta": {
            "id": id, "name": name, "description": null, "author": null, "icon": null,
            "vectorization": {"isIndexed": false, "lastIndexedAt": null, "modelUsed": "", "dimension": 0, "totalTokens": 0},
            "models": [], "entries": [], "tags": [], "config": {}
        }}),
    );
    id
}

fn entry(
    repo: &SqliteRecallRepository,
    caches: &RuntimeCaches,
    collection: Uuid,
    id: Uuid,
    key: &str,
    content: &str,
    enabled: bool,
) -> Value {
    call(
        repo,
        caches,
        "recall_upsert_entry",
        json!({"recallId": collection, "entry": {
            "id": id, "key": key, "content": content, "enabled": enabled, "contentHash": null,
            "tags": [{"name": "allowed", "weight": 1.0}], "priority": 100
        }}),
    )
}

fn compile(repo: &SqliteRecallRepository, caches: &RuntimeCaches, preset: &str) -> Value {
    call(
        repo,
        caches,
        "recall_compile_retrieval_pipeline",
        json!({"presetId": preset, "runId": "probe", "limit": 6}),
    )
}

fn request(compilation: &Value, collection: Uuid, preset: &str, query: &str) -> Value {
    json!({"query": query, "filters": {"recallIds": [collection], "limit": 6, "tags": ["allowed"], "enabledOnly": true},
        "presetId": preset, "runId": compilation["runId"], "configHash": compilation["configHash"]})
}

#[test]
fn persisted_keyword_search_survives_restart_and_observes_edits_and_deletion() {
    let directory = tempfile::tempdir().unwrap();
    let repo = SqliteRecallRepository::new(directory.path());
    repo.initialize().unwrap();
    let caches = RuntimeCaches::default();
    let id = collection(&repo, &caches, "Memory");
    let other = collection(&repo, &caches, "Other");
    let entry_id = Uuid::new_v4();
    entry(
        &repo,
        &caches,
        id,
        entry_id,
        "Archive",
        "中文检索 Rust ownership",
        true,
    );
    entry(&repo, &caches, id, Uuid::new_v4(), "Rust", "hidden", false);
    entry(
        &repo,
        &caches,
        other,
        Uuid::new_v4(),
        "Rust",
        "other collection",
        true,
    );
    let restarted = RuntimeCaches::default();
    call(&repo, &restarted, "recall_warmup", json!({}));
    let compiled = compile(&repo, &restarted, "algorithmic");
    assert_eq!(compiled["valid"], true);
    let run = || {
        call(
            &repo,
            &restarted,
            "recall_run_retrieval_pipeline",
            json!({"request": request(&compiled, id, "algorithmic", "Rust")}),
        )
    };
    let response = run();
    assert_eq!(response["outcome"], "success");
    assert_eq!(response["results"].as_array().unwrap().len(), 1);
    assert_eq!(response["results"][0]["entry"]["id"], entry_id.to_string());
    assert!(!response["trace"]["steps"].as_array().unwrap().is_empty());
    let cache_input = json!({"query": "Rust", "recallIds": [id], "tags": ["allowed"], "fusionWeights": [0.7, 0.3],
        "limit": 6, "minScore": 0.0, "presetId": "algorithmic", "configHash": compiled["configHash"],
        "embeddingIdentity": "", "assetGeneration": "", "algorithmVersion": compiled["algorithmVersion"]});
    let cache_entry = json!({"results": response["results"], "vector": null});
    call(
        &repo,
        &restarted,
        "recall_retrieval_cache_set",
        json!({"input": cache_input, "entry": cache_entry, "maxItems": 10}),
    );
    assert_eq!(
        call(
            &repo,
            &restarted,
            "recall_retrieval_cache_get",
            json!({"input": cache_input})
        ),
        cache_entry
    );
    assert_eq!(
        call(&repo, &restarted, "recall_retrieval_cache_stats", json!({})),
        1
    );
    let mut different_input = cache_input.clone();
    different_input["configHash"] = json!("other-pipeline");
    assert!(call(
        &repo,
        &restarted,
        "recall_retrieval_cache_get",
        json!({"input": different_input})
    )
    .is_null());
    entry(
        &repo,
        &restarted,
        id,
        entry_id,
        "Archive",
        "中文检索 Python",
        true,
    );
    assert_eq!(run()["outcome"], "empty");
    assert!(call(
        &repo,
        &restarted,
        "recall_retrieval_cache_get",
        json!({"input": cache_input})
    )
    .is_null());
    call(
        &repo,
        &restarted,
        "recall_retrieval_cache_set",
        json!({"input": cache_input, "entry": cache_entry, "maxItems": 10}),
    );
    call(&repo, &restarted, "recall_retrieval_cache_clear", json!({}));
    assert_eq!(
        call(&repo, &restarted, "recall_retrieval_cache_stats", json!({})),
        0
    );
    entry(&repo, &restarted, id, entry_id, "Rust", "restored", true);
    assert_eq!(run()["outcome"], "success");
    call(
        &repo,
        &restarted,
        "recall_delete_entry",
        json!({"recallId": id, "entryId": entry_id}),
    );
    assert_eq!(run()["outcome"], "empty");
}

#[test]
fn comprehensive_search_binds_route_signature_to_persisted_model_vectors_and_tags() {
    let directory = tempfile::tempdir().unwrap();
    let repo = SqliteRecallRepository::new(directory.path());
    repo.initialize().unwrap();
    let caches = RuntimeCaches::default();
    let id = collection(&repo, &caches, "Vectors");
    let first = Uuid::new_v4();
    let second = Uuid::new_v4();
    entry(&repo, &caches, id, first, "Alpha", "primary document", true);
    entry(
        &repo,
        &caches,
        id,
        second,
        "Beta",
        "secondary document",
        true,
    );
    for (model, vectors) in [
        ("embed-a", [[1.0, 0.0], [0.0, 1.0]]),
        ("embed-b", [[0.0, 1.0], [1.0, 0.0]]),
    ] {
        for (entry_id, vector) in [first, second].into_iter().zip(vectors) {
            call(
                &repo,
                &caches,
                "recall_update_entry_vector",
                json!({"recallId": id, "entryId": entry_id, "model": model, "vector": vector}),
            );
        }
    }
    call(
        &repo,
        &caches,
        "recall_sync_tag_vectors",
        json!({"modelId": "embed-a", "data": [["allowed", [1.0, 0.0]]]}),
    );
    let restarted = RuntimeCaches::default();
    call(&repo, &restarted, "recall_warmup", json!({}));
    let compiled = compile(&repo, &restarted, "comprehensive");
    let run = |model: &str| {
        let mut req = request(&compiled, id, "comprehensive", "unmatched-query");
        req["bundle"] = json!({"bundleId": "bundle", "embeddingSpace": model, "modelSignature": format!("profile::{model}"),
            "algorithmVersion": compiled["algorithmVersion"], "queryEmbedding": [1.0, 0.0]});
        call(
            &repo,
            &restarted,
            "recall_run_retrieval_pipeline",
            json!({"request": req}),
        )
    };
    let a = run("embed-a");
    assert_eq!(a["outcome"], "success", "{a}");
    assert_eq!(a["results"][0]["entry"]["id"], first.to_string());
    let signals = a["results"][0]["signals"].as_array().unwrap();
    assert!(
        signals
            .iter()
            .any(|signal| signal["signalType"] == "content-vector"),
        "{signals:?}"
    );
    assert!(a["trace"]["steps"]
        .as_array()
        .unwrap()
        .iter()
        .any(|step| step["moduleId"] == "tag-vector-recall"
            && step["outputCount"].as_u64().unwrap_or(0) > 0));
    let b = run("embed-b");
    assert_eq!(b["results"][0]["entry"]["id"], second.to_string());
    assert_eq!(run("missing-model")["outcome"], "empty");
    // Reusing the same binding after a write must rebuild from the changed repository.
    run("embed-b");
    call(
        &repo,
        &restarted,
        "recall_clear_legacy_vectors",
        json!({"recallId": id, "currentModel": "embed-a"}),
    );
    assert_eq!(run("embed-b")["outcome"], "empty");
}

#[test]
fn pipeline_dispatch_enforces_custom_identity_hash_and_explicit_fallback() {
    let directory = tempfile::tempdir().unwrap();
    let repo = SqliteRecallRepository::new(directory.path());
    repo.initialize().unwrap();
    let caches = RuntimeCaches::default();
    let id = collection(&repo, &caches, "Pipeline");
    entry(
        &repo,
        &caches,
        id,
        Uuid::new_v4(),
        "Rust",
        "persisted",
        true,
    );
    let compiled = compile(&repo, &caches, "algorithmic");
    let mut req = request(&compiled, id, "algorithmic", "Rust");
    req["configHash"] = json!("stale");
    let stale = call(
        &repo,
        &caches,
        "recall_run_retrieval_pipeline",
        json!({"request": req}),
    );
    assert_eq!(stale["error"]["code"], "config-hash-mismatch");
    let mut req = request(&compiled, id, "algorithmic", "Rust");
    req["requestedPresetId"] = json!("comprehensive");
    let denied = call(
        &repo,
        &caches,
        "recall_run_retrieval_pipeline",
        json!({"request": req}),
    );
    assert_eq!(denied["error"]["code"], "fallback-not-allowed");
    req["fallbackPresetId"] = json!("algorithmic");
    req["fallbackReason"] = json!("query-embedding-unavailable");
    assert_eq!(
        call(
            &repo,
            &caches,
            "recall_run_retrieval_pipeline",
            json!({"request": req})
        )["outcome"],
        "fallback"
    );
    let pipeline = call(
        &repo,
        &caches,
        "recall_get_retrieval_pipeline_template",
        json!({"presetId": "algorithmic", "limit": 6}),
    );
    let custom = call(
        &repo,
        &caches,
        "recall_compile_custom_retrieval_pipeline",
        json!({"pipeline": pipeline, "runId": "custom"}),
    );
    assert_eq!(custom["pipelineId"], "playground-custom");
    let result = call(
        &repo,
        &caches,
        "recall_run_custom_retrieval_pipeline",
        json!({"request": {
            "query": "Rust", "filters": {"recallIds": [id], "enabledOnly": true}, "pipeline": pipeline,
            "runId": "custom", "configHash": custom["configHash"]
        }}),
    );
    assert_eq!(result["actualPresetId"], "custom");
    assert_eq!(result["outcome"], "success");
    let missing = compile(&repo, &caches, "comprehensive");
    let result = call(
        &repo,
        &caches,
        "recall_run_retrieval_pipeline",
        json!({"request": request(&missing, id, "comprehensive", "Rust")}),
    );
    assert_eq!(result["error"]["code"], "external-requirement-missing");
}
