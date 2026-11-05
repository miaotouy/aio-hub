// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

use super::core::{RecallEntry, TagWithWeight};
use super::monitor_types::*;
use super::utils::{
    calculate_content_hash, extract_tags_from_content, extract_title_from_content,
    generate_summary, get_now,
};
use rayon::prelude::*;
use std::{path::Path, sync::Mutex};
use uuid::Uuid;

#[path = "../utils/text_file.rs"]
mod text_file;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportConfig {
    pub auto_extract_tags: bool,
    pub auto_extract_title: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchImportResult {
    pub entries: Vec<RecallEntry>,
    pub skipped_count: usize,
    pub duplicate_count: usize,
}

pub fn scan_files(
    paths: &[String],
    config: &ImportConfig,
    on_progress: impl Fn(usize, usize) + Sync,
) -> Vec<RecallEntry> {
    let progress = Mutex::new((0_usize, 0_usize));
    paths
        .par_iter()
        .filter_map(|path| {
            let entry = read_entry(Path::new(path), config);
            let mut counts = progress.lock().unwrap_or_else(|e| e.into_inner());
            counts.0 += 1;
            counts.1 += usize::from(entry.is_some());
            if counts.0 % 5 == 0 && counts.0 < paths.len() {
                on_progress(counts.0, counts.1);
            }
            entry
        })
        .collect()
}

fn read_entry(path: &Path, config: &ImportConfig) -> Option<RecallEntry> {
    if !std::fs::metadata(path).ok()?.is_file() || !text_file::is_text_file(path) {
        return None;
    }
    let content = std::fs::read_to_string(path).ok()?;
    let filename = path.file_name()?.to_str()?;
    let key = if config.auto_extract_title {
        extract_title_from_content(&content)
    } else {
        None
    }
    .unwrap_or_else(|| filename.split('.').next().unwrap_or(filename).to_string());
    let tags = if config.auto_extract_tags {
        extract_tags_from_content(&content)
            .into_iter()
            .map(|name| TagWithWeight {
                hash: calculate_content_hash(&name),
                name,
                weight: 1.0,
            })
            .collect()
    } else {
        vec![]
    };
    let now = get_now();
    Some(RecallEntry {
        id: Uuid::new_v4(),
        key,
        content_hash: Some(calculate_content_hash(&content)),
        summary: generate_summary(&content),
        content,
        tags,
        core_tags: vec![],
        assets: vec![],
        priority: 100,
        enabled: true,
        created_at: now,
        updated_at: now,
        error_message: None,
        refs: vec![],
        ref_by: vec![],
    })
}

pub enum ImportOutcome {
    Scanning,
    Completed { skipped: usize, duplicates: usize },
    Failed(String),
}

pub fn monitor_message(
    recall_id: Uuid,
    total: usize,
    processed: usize,
    chunks: usize,
    duration: u64,
    outcome: ImportOutcome,
) -> RecallMonitorMessage {
    let (level, title, summary, status) = match outcome {
        ImportOutcome::Scanning => (
            RecallMonitorLevel::Info,
            "正在导入文件",
            format!("已处理 {processed}/{total} 个文件"),
            RecallStepStatus::Running,
        ),
        ImportOutcome::Completed {
            skipped,
            duplicates,
        } => (
            RecallMonitorLevel::Success,
            "文件导入完成",
            format!("成功导入 {chunks} 个条目，跳过 {skipped} 个，重复 {duplicates} 个"),
            RecallStepStatus::Completed,
        ),
        ImportOutcome::Failed(error) => (
            RecallMonitorLevel::Error,
            "文件导入失败",
            error,
            RecallStepStatus::Failed,
        ),
    };
    RecallMonitorMessage {
        id: Uuid::new_v4().to_string(),
        level,
        timestamp: chrono::Utc::now().timestamp_millis(),
        title: title.to_string(),
        summary,
        module: "Indexer".to_string(),
        event: RecallMonitorEvent::Index(IndexPayload {
            steps: vec![RecallMonitorStep {
                name: "文件导入".to_string(),
                status,
                duration,
                details: Some(format!(
                    "已处理 {processed}/{total} 个文件，{chunks} 个条目"
                )),
            }],
            stats: IndexStats {
                total_files: total.min(u32::MAX as usize) as u32,
                processed_files: processed.min(u32::MAX as usize) as u32,
                total_chunks: chunks.min(u32::MAX as usize) as u32,
                vectorized_chunks: 0,
                duration,
            },
            metadata: Some(IndexMetadata {
                recall_id: recall_id.to_string(),
                model_id: String::new(),
                file_patterns: vec![],
            }),
        }),
    }
}
