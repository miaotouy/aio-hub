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

pub use crate::content_deduplicator::{
    DedupAnalysisResult, DedupScanCancellation, SimilarityConfig,
};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{Emitter, State};

#[tauri::command]
pub async fn scan_content_duplicates(
    path: String,
    config: SimilarityConfig,
    window: tauri::Window,
    cancellation: State<'_, DedupScanCancellation>,
) -> Result<DedupAnalysisResult, String> {
    cancellation.reset();
    crate::content_deduplicator::scan_content_duplicates(path, config, &cancellation, &|progress| {
        let _ = window.emit("dedup-scan-progress", progress);
    })
}

/// 获取文件内容（用于前端 diff 预览）
#[tauri::command]
pub async fn read_file_content_for_diff(
    path: String,
    max_size_kb: Option<u64>,
) -> Result<String, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("文件不存在: {}", path));
    }

    let metadata = fs::metadata(&file_path).map_err(|e| format!("读取元数据失败: {}", e))?;
    let max_bytes = max_size_kb.unwrap_or(512) * 1024;

    if metadata.len() > max_bytes {
        return Err(format!(
            "文件过大 ({} KB)，超过限制 ({} KB)",
            metadata.len() / 1024,
            max_bytes / 1024
        ));
    }

    fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 停止查重扫描
#[tauri::command]
pub async fn stop_dedup_scan(cancellation: State<'_, DedupScanCancellation>) -> Result<(), String> {
    cancellation.cancel();
    Ok(())
}

/// 删除重复文件（移入回收站）
#[tauri::command]
pub async fn delete_duplicate_files(
    paths: Vec<String>,
    window: tauri::Window,
) -> Result<DedupDeleteResult, String> {
    let mut success_count = 0;
    let mut error_count = 0;
    let mut freed_space = 0u64;
    let mut errors = Vec::new();
    let total = paths.len();

    for (idx, path_str) in paths.iter().enumerate() {
        let path = PathBuf::from(path_str);

        if !path.exists() {
            errors.push(format!("文件不存在: {}", path_str));
            error_count += 1;
            continue;
        }

        let size = fs::metadata(&path).ok().map(|m| m.len()).unwrap_or(0);

        // 上报进度
        if idx % 5 == 0 {
            let _ = window.emit(
                "dedup-delete-progress",
                DedupDeleteProgress {
                    current: idx,
                    total,
                    current_file: path_str.clone(),
                },
            );
        }

        match trash::delete(&path) {
            Ok(_) => {
                success_count += 1;
                freed_space += size;
            }
            Err(e) => {
                errors.push(format!("移入回收站失败 {}: {}", path_str, e));
                error_count += 1;
            }
        }
    }

    Ok(DedupDeleteResult {
        success_count,
        error_count,
        freed_space,
        errors,
    })
}

/// 删除结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DedupDeleteResult {
    pub success_count: usize,
    pub error_count: usize,
    pub freed_space: u64,
    pub errors: Vec<String>,
}

/// 删除进度
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DedupDeleteProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}
