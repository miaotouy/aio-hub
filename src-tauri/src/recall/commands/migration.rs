// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use crate::recall::state::RecallState;
use crate::recall::storage::{
    LegacyFileRecallImporter, RecallMigrationPreview, RecallMigrationReport, RecallRepository,
    SqliteRecallRepository, LEGACY_RECALL_MIGRATION_ID,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

const LEGACY_MIGRATION_PROGRESS_EVENT: &str = "recall://legacy-migration-progress";
static LEGACY_MIGRATION_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecallMigrationConfirmation {
    pub migration_id: String,
    pub source_fingerprint: String,
    pub confirmed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecallMigrationProgress {
    pub migration_id: String,
    pub phase: String,
    pub current: usize,
    pub total: usize,
    pub completed_collections: usize,
    pub completed_entries: usize,
    pub pending_vectors: usize,
    pub issues: usize,
}

fn emit_progress(app: &AppHandle, phase: &str, report: Option<&RecallMigrationReport>) {
    let payload = RecallMigrationProgress {
        migration_id: LEGACY_RECALL_MIGRATION_ID.to_string(),
        phase: phase.to_string(),
        current: report
            .map(|item| item.migrated_entries + item.migrated_vectors)
            .unwrap_or(0),
        total: report
            .map(|item| item.source_entries + item.source_vectors)
            .unwrap_or(0),
        completed_collections: report.map(|item| item.migrated_collections).unwrap_or(0),
        completed_entries: report.map(|item| item.migrated_entries).unwrap_or(0),
        pending_vectors: report.map(|item| item.pending_vectors).unwrap_or(0),
        issues: report.map(|item| item.issues.len()).unwrap_or(0),
    };
    if let Err(error) = app.emit(LEGACY_MIGRATION_PROGRESS_EVENT, payload) {
        log::warn!("[Recall] 发送旧数据迁移进度失败: {error}");
    }
}

#[tauri::command]
pub async fn recall_inspect_legacy_migration(
    app: AppHandle,
) -> Result<Option<RecallMigrationReport>, String> {
    let app_data_dir = crate::get_app_data_dir(app.config());
    let repository = SqliteRecallRepository::new(&app_data_dir);
    repository.initialize()?;
    LegacyFileRecallImporter::new(&app_data_dir, repository).inspect()
}

#[tauri::command]
pub async fn recall_preview_legacy_migration(
    app: AppHandle,
) -> Result<Option<RecallMigrationPreview>, String> {
    let app_data_dir = crate::get_app_data_dir(app.config());
    let repository = SqliteRecallRepository::new(&app_data_dir);
    repository.initialize()?;
    LegacyFileRecallImporter::new(&app_data_dir, repository).preview()
}

#[tauri::command]
pub async fn recall_run_legacy_migration(
    app: AppHandle,
    state: State<'_, RecallState>,
    confirmation: RecallMigrationConfirmation,
) -> Result<RecallMigrationReport, String> {
    if !confirmation.confirmed {
        return Err("必须明确确认后才能执行旧 Recall 数据迁移".to_string());
    }
    if confirmation.migration_id != LEGACY_RECALL_MIGRATION_ID {
        return Err("迁移 ID 不匹配，请重新打开迁移流程".to_string());
    }

    let app_data_dir = crate::get_app_data_dir(app.config());
    let expected_fingerprint = confirmation.source_fingerprint;
    let worker_app = app.clone();
    emit_progress(&app, "main", None);

    let report = tauri::async_runtime::spawn_blocking(move || {
        let _guard = LEGACY_MIGRATION_LOCK
            .try_lock()
            .map_err(|_| "已有旧 Recall 数据迁移任务正在运行".to_string())?;
        let repository = SqliteRecallRepository::new(&app_data_dir);
        repository.initialize()?;
        let importer = LegacyFileRecallImporter::new(&app_data_dir, repository);
        let inspected = importer
            .inspect()?
            .ok_or_else(|| "未检测到可迁移的旧 Recall 数据".to_string())?;
        if inspected.source_fingerprint != expected_fingerprint {
            return Err("旧 Recall 数据指纹已变化，请重新检测并确认迁移方案".to_string());
        }
        let report = importer.import_with_progress(|phase, report| {
            emit_progress(&worker_app, phase, Some(report));
        })?;
        Ok::<RecallMigrationReport, String>(report)
    })
    .await
    .map_err(|error| format!("旧 Recall 数据迁移任务异常结束: {error}"))??;

    state.refresh_from_repository()?;
    emit_progress(&app, "completed", Some(&report));
    Ok(report)
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
    let app_data_dir = crate::get_app_data_dir(app.config());
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LEGACY_MIGRATION_LOCK
            .try_lock()
            .map_err(|_| "旧 Recall 数据迁移正在运行，暂时不能清理源目录".to_string())?;
        let repository = SqliteRecallRepository::new(&app_data_dir);
        repository.initialize()?;
        LegacyFileRecallImporter::new(&app_data_dir, repository)
            .confirm_cleanup(&source_fingerprint)
    })
    .await
    .map_err(|error| format!("旧 Recall 目录清理任务异常结束: {error}"))?
}
