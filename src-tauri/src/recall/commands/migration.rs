// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use crate::recall::storage::{
    LegacyFileRecallImporter, RecallMigrationReport, RecallRepository, SqliteRecallRepository,
};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn recall_inspect_legacy_migration(
    app: AppHandle,
) -> Result<Option<RecallMigrationReport>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let repository = SqliteRecallRepository::new(&app_data_dir);
    repository.initialize()?;
    LegacyFileRecallImporter::new(&app_data_dir, repository).inspect()
}

#[tauri::command]
pub async fn recall_confirm_legacy_cleanup(
    app: AppHandle,
    source_fingerprint: String,
    confirmed: bool,
) -> Result<Vec<String>, String> {
    if !confirmed {
        return Err("必须明确确认后才能清理旧 Recall 目录".to_string());
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let repository = SqliteRecallRepository::new(&app_data_dir);
    repository.initialize()?;
    LegacyFileRecallImporter::new(&app_data_dir, repository).confirm_cleanup(&source_fingerprint)
}
