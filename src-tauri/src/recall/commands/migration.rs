// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use crate::recall::state::RecallState;
use crate::recall::storage::LEGACY_MIGRATION_PROGRESS_EVENT;
use crate::recall::storage::{
    LegacyFileRecallImporter, RecallMigrationPreview, RecallMigrationReport, RecallRepository,
    SqliteRecallRepository, LEGACY_RECALL_MIGRATION_ID, LEGACY_RECALL_SOURCE_ID,
};
pub use crate::recall::storage::{RecallMigrationConfirmation, RecallMigrationProgress};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

static LEGACY_MIGRATION_LOCK: Mutex<()> = Mutex::new(());

fn emit_progress(app: &AppHandle, phase: &str, report: Option<&RecallMigrationReport>) {
    let payload = RecallMigrationProgress::new(phase, report);
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

#[tauri::command]
pub async fn recall_debug_reset_legacy_migration(app: AppHandle) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err("迁移调试重置仅在开发构建中可用".to_string());
    }

    let app_data_dir = crate::get_app_data_dir(app.config());
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LEGACY_MIGRATION_LOCK
            .try_lock()
            .map_err(|_| "旧 Recall 数据迁移正在运行，暂时不能重置迁移记录".to_string())?;
        let repository = SqliteRecallRepository::new(&app_data_dir);
        repository.initialize()?;
        repository.clear_legacy_import_state(LEGACY_RECALL_SOURCE_ID)
    })
    .await
    .map_err(|error| format!("重置旧 Recall 迁移记录任务异常结束: {error}"))?
}
