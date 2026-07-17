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
) -> Result<KnowledgeLibrary, String> {
    if name.trim().is_empty() {
        return Err("Knowledge library 名称不能为空".to_string());
    }
    state
        .repository()?
        .create_library(&name, description.as_deref())
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
    model_id: String,
    records: Vec<KnowledgeVectorRecord>,
) -> Result<(), String> {
    state
        .repository()?
        .save_vectors(&library_id, &model_id, &records)
}

#[tauri::command]
pub async fn knowledge_get_index_status(
    state: State<'_, KnowledgeState>,
    library_id: String,
) -> Result<KnowledgeIndexStatus, String> {
    state.repository()?.get_index_status(&library_id)
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
