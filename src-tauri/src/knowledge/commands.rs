// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use super::repository::KnowledgeRepository;
use super::types::*;
use super::KnowledgeState;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn knowledge_initialize(
    app: AppHandle,
    state: State<'_, KnowledgeState>,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let repository = Arc::new(KnowledgeRepository::new(app_data_dir));
    repository.initialize()?;
    state.set_repository(repository)
}

#[tauri::command]
pub async fn knowledge_create_library(
    state: State<'_, KnowledgeState>,
    name: String,
    description: Option<String>,
    config: Option<KnowledgeLibraryIndexConfig>,
) -> Result<KnowledgeLibrary, String> {
    if name.trim().is_empty() {
        return Err("Knowledge library 名称不能为空".to_string());
    }
    state
        .repository()?
        .create_library(&name, description.as_deref(), config.as_ref())
}

#[tauri::command]
pub async fn knowledge_update_library(
    state: State<'_, KnowledgeState>,
    library_id: String,
    name: String,
    description: Option<String>,
) -> Result<KnowledgeLibrary, String> {
    state
        .repository()?
        .update_library(&library_id, &name, description.as_deref())
}

#[tauri::command]
pub async fn knowledge_apply_library_config(
    state: State<'_, KnowledgeState>,
    library_id: String,
    config: KnowledgeLibraryIndexConfig,
) -> Result<usize, String> {
    state
        .repository()?
        .apply_library_config_and_rebuild(&library_id, &config)
}

#[tauri::command]
pub async fn knowledge_list_libraries(
    state: State<'_, KnowledgeState>,
) -> Result<Vec<KnowledgeLibrary>, String> {
    state.repository()?.list_libraries()
}

#[tauri::command]
pub async fn knowledge_delete_library(
    state: State<'_, KnowledgeState>,
    library_id: String,
) -> Result<(), String> {
    state.repository()?.delete_library(&library_id)
}

#[tauri::command]
pub async fn knowledge_ingest_document(
    state: State<'_, KnowledgeState>,
    request: KnowledgeIngestRequest,
) -> Result<KnowledgeDocument, String> {
    if request.content.trim().is_empty() {
        return Err("Knowledge document 内容不能为空".to_string());
    }
    state.repository()?.ingest(&request)
}

#[tauri::command]
pub async fn knowledge_enqueue_paths(
    state: State<'_, KnowledgeState>,
    request: KnowledgeEnqueuePathsRequest,
) -> Result<KnowledgeEnqueueResult, String> {
    state.repository()?.enqueue_paths(&request)
}

#[tauri::command]
pub async fn knowledge_list_sources(
    state: State<'_, KnowledgeState>,
    library_id: String,
) -> Result<Vec<KnowledgeSource>, String> {
    state.repository()?.list_sources(&library_id)
}

#[tauri::command]
pub async fn knowledge_list_ingest_tasks(
    state: State<'_, KnowledgeState>,
    library_id: String,
    limit: Option<usize>,
) -> Result<Vec<KnowledgeIngestTask>, String> {
    state
        .repository()?
        .list_ingest_tasks(&library_id, limit.unwrap_or(200))
}

#[tauri::command]
pub async fn knowledge_claim_ingest_task(
    state: State<'_, KnowledgeState>,
    library_id: String,
    lease_seconds: usize,
) -> Result<Option<KnowledgeIngestTask>, String> {
    state
        .repository()?
        .claim_ingest_task(&library_id, lease_seconds)
}

#[tauri::command]
pub async fn knowledge_complete_ingest_task(
    state: State<'_, KnowledgeState>,
    request: KnowledgeCompleteIngestTaskRequest,
) -> Result<Option<KnowledgeDocument>, String> {
    state.repository()?.complete_ingest_task(&request)
}

#[tauri::command]
pub async fn knowledge_fail_ingest_task(
    state: State<'_, KnowledgeState>,
    request: KnowledgeFailIngestTaskRequest,
) -> Result<KnowledgeIngestTask, String> {
    state.repository()?.fail_ingest_task(&request)
}

#[tauri::command]
pub async fn knowledge_cancel_ingest_task(
    state: State<'_, KnowledgeState>,
    library_id: String,
    task_id: String,
) -> Result<(), String> {
    state
        .repository()?
        .cancel_ingest_task(&library_id, &task_id)
}

#[tauri::command]
pub async fn knowledge_retry_ingest_task(
    state: State<'_, KnowledgeState>,
    library_id: String,
    task_id: String,
) -> Result<KnowledgeIngestTask, String> {
    state.repository()?.retry_ingest_task(&library_id, &task_id)
}

#[tauri::command]
pub async fn knowledge_add_directory_source(
    state: State<'_, KnowledgeState>,
    request: KnowledgeDirectorySourceRequest,
) -> Result<KnowledgeEnqueueResult, String> {
    state.repository()?.add_directory_source(&request)
}

#[tauri::command]
pub async fn knowledge_rescan_directory_source(
    state: State<'_, KnowledgeState>,
    library_id: String,
    source_id: String,
    max_file_bytes: usize,
    max_attempts: usize,
    parser_version: String,
) -> Result<KnowledgeEnqueueResult, String> {
    state.repository()?.rescan_directory_source(
        &library_id,
        &source_id,
        max_file_bytes,
        max_attempts,
        &parser_version,
    )
}

#[tauri::command]
pub async fn knowledge_remove_source(
    state: State<'_, KnowledgeState>,
    library_id: String,
    source_id: String,
) -> Result<(), String> {
    state.repository()?.remove_source(&library_id, &source_id)
}

#[tauri::command]
pub async fn knowledge_list_documents(
    state: State<'_, KnowledgeState>,
    library_id: String,
) -> Result<Vec<KnowledgeDocument>, String> {
    state.repository()?.list_documents(&library_id)
}

#[tauri::command]
pub async fn knowledge_list_chunks(
    state: State<'_, KnowledgeState>,
    library_id: String,
    document_id: Option<String>,
) -> Result<Vec<KnowledgeChunk>, String> {
    state
        .repository()?
        .list_chunks(&library_id, document_id.as_deref())
}

#[tauri::command]
pub async fn knowledge_list_unvectorized_chunks(
    state: State<'_, KnowledgeState>,
    library_id: String,
    space_id: String,
) -> Result<Vec<KnowledgeChunk>, String> {
    state
        .repository()?
        .list_unvectorized_chunks(&library_id, &space_id)
}

#[tauri::command]
pub async fn knowledge_delete_document(
    state: State<'_, KnowledgeState>,
    library_id: String,
    document_id: String,
) -> Result<(), String> {
    state
        .repository()?
        .delete_document(&library_id, &document_id)
}

#[tauri::command]
pub async fn knowledge_rebuild_library(
    state: State<'_, KnowledgeState>,
    library_id: String,
) -> Result<usize, String> {
    state.repository()?.rebuild_library(&library_id)
}

#[tauri::command]
pub async fn knowledge_save_chunk_vectors(
    state: State<'_, KnowledgeState>,
    library_id: String,
    space_id: String,
    descriptor_json: String,
    route_key: String,
    records: Vec<KnowledgeVectorRecord>,
) -> Result<(), String> {
    state.repository()?.save_vectors(
        &library_id,
        &space_id,
        &descriptor_json,
        &route_key,
        &records,
    )
}

#[tauri::command]
pub async fn knowledge_get_index_status(
    state: State<'_, KnowledgeState>,
    library_id: String,
) -> Result<KnowledgeIndexStatus, String> {
    state.repository()?.get_index_status(&library_id)
}

#[tauri::command]
pub async fn knowledge_switch_embedding_route(
    state: State<'_, KnowledgeState>,
    library_id: String,
    space_id: String,
    route_key: String,
) -> Result<(), String> {
    state
        .repository()?
        .switch_embedding_route(&library_id, &space_id, &route_key)
}

#[tauri::command]
pub async fn knowledge_search(
    state: State<'_, KnowledgeState>,
    request: KnowledgeSearchRequest,
) -> Result<Vec<KnowledgeResult>, String> {
    if request.query.trim().is_empty() {
        return Ok(Vec::new());
    }
    state.repository()?.search(&request)
}
