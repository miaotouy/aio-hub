// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

//! Batch image scanning and organization commands for the color-picker tool.

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

static CANCELLED_SCANS: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "tiff", "avif",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchImageCandidate {
    pub path: String,
    pub file_name: String,
    pub extension: String,
    pub size: u64,
    pub modified_at: Option<u64>,
    pub is_network: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanImagesRequest {
    pub scan_id: String,
    pub roots: Vec<String>,
    pub max_depth: Option<u32>,
    pub extensions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub scan_id: String,
    pub scanned_count: u64,
    pub discovered_count: u64,
    pub current_path: Option<String>,
    pub done: bool,
    pub cancelled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpaceResult {
    pub available: u64,
    pub sufficient: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeItem {
    pub source_path: String,
    pub file_name: String,
    pub color_family: String,
    pub brightness_level: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeImagesRequest {
    pub items: Vec<OrganizeItem>,
    pub target_directory: String,
    pub mode: String,
    pub check_source_exists: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeDetail {
    pub source_path: String,
    pub target_path: Option<String>,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchOrganizeResult {
    pub success_count: u32,
    pub renamed_count: u32,
    pub source_not_found_count: u32,
    pub failed_count: u32,
    pub details: Vec<OrganizeDetail>,
}

fn is_network_path(path: &Path) -> bool {
    let value = path.to_string_lossy();
    value.starts_with(r"\\") || value.starts_with("//")
}

fn extension_allowed(path: &Path, extensions: &[String]) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            extensions
                .iter()
                .any(|extension| extension == &value.to_ascii_lowercase())
        })
        .unwrap_or(false)
}

fn modified_timestamp(path: &Path) -> Option<u64> {
    path.metadata()
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
}

#[tauri::command]
pub fn color_picker_scan_images(
    app: AppHandle,
    request: ScanImagesRequest,
) -> Result<Vec<BatchImageCandidate>, String> {
    if request.scan_id.trim().is_empty() {
        return Err("扫描任务 ID 不能为空".to_string());
    }
    let extensions = request.extensions.unwrap_or_else(|| {
        SUPPORTED_EXTENSIONS
            .iter()
            .map(|value| (*value).to_string())
            .collect()
    });
    let extensions = extensions
        .into_iter()
        .map(|value| value.trim_start_matches('.').to_ascii_lowercase())
        .collect::<Vec<_>>();
    let max_depth = request.max_depth.unwrap_or(3);

    CANCELLED_SCANS
        .lock()
        .map_err(|_| "扫描状态不可用".to_string())?
        .remove(&request.scan_id);
    let mut results = Vec::new();
    let mut seen = HashSet::new();
    let mut scanned_count = 0_u64;
    let mut cancelled = false;
    let emit_progress = |progress: ScanProgress| {
        let _ = app.emit("color_picker_batch_progress", progress);
    };
    emit_progress(ScanProgress {
        scan_id: request.scan_id.clone(),
        scanned_count,
        discovered_count: 0,
        current_path: None,
        done: false,
        cancelled: false,
    });

    for root_value in request.roots {
        let root = PathBuf::from(&root_value);
        let metadata = fs::symlink_metadata(&root).map_err(|error| {
            if is_network_path(&root) {
                format!("网络路径不可访问: {} ({})", root.display(), error)
            } else {
                format!("输入路径不可访问: {} ({})", root.display(), error)
            }
        })?;

        if metadata.is_file() {
            if extension_allowed(&root, &extensions) {
                let normalized = root.to_string_lossy().to_string();
                if seen.insert(normalized.clone()) {
                    results.push(candidate_from_path(&root)?);
                }
            }
            scanned_count += 1;
            emit_progress(ScanProgress {
                scan_id: request.scan_id.clone(),
                scanned_count,
                discovered_count: results.len() as u64,
                current_path: Some(root.to_string_lossy().into_owned()),
                done: false,
                cancelled: false,
            });
            continue;
        }
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            continue;
        }

        for entry in WalkDir::new(&root)
            .follow_links(false)
            .min_depth(1)
            .max_depth(max_depth as usize + 1)
            .into_iter()
            .filter_map(Result::ok)
        {
            if CANCELLED_SCANS
                .lock()
                .map(|set| set.contains(&request.scan_id))
                .unwrap_or(false)
            {
                cancelled = true;
                break;
            }
            let path = entry.path();
            let entry_type = entry.file_type();
            if entry_type.is_dir() && entry_type.is_symlink() {
                continue;
            }
            if !entry_type.is_file() || !extension_allowed(path, &extensions) {
                continue;
            }
            let normalized = path.to_string_lossy().to_string();
            if seen.insert(normalized) {
                results.push(candidate_from_path(path)?);
            }
            scanned_count += 1;
            emit_progress(ScanProgress {
                scan_id: request.scan_id.clone(),
                scanned_count,
                discovered_count: results.len() as u64,
                current_path: Some(path.to_string_lossy().into_owned()),
                done: false,
                cancelled: false,
            });
        }
    }

    emit_progress(ScanProgress {
        scan_id: request.scan_id.clone(),
        scanned_count,
        discovered_count: results.len() as u64,
        current_path: None,
        done: true,
        cancelled,
    });

    CANCELLED_SCANS
        .lock()
        .map_err(|_| "扫描状态不可用".to_string())?
        .remove(&request.scan_id);
    Ok(results)
}

fn candidate_from_path(path: &Path) -> Result<BatchImageCandidate, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("读取文件信息失败: {} ({})", path.display(), error))?;
    Ok(BatchImageCandidate {
        path: path.to_string_lossy().to_string(),
        file_name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("image")
            .to_string(),
        extension: path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase(),
        size: metadata.len(),
        modified_at: modified_timestamp(path),
        is_network: is_network_path(path),
    })
}

#[tauri::command]
pub fn color_picker_cancel_scan(scan_id: String) -> Result<(), String> {
    CANCELLED_SCANS
        .lock()
        .map_err(|_| "扫描状态不可用".to_string())?
        .insert(scan_id);
    Ok(())
}

#[tauri::command]
pub fn color_picker_check_disk_space(
    target_directory: String,
    required_bytes: u64,
) -> Result<DiskSpaceResult, String> {
    let target = PathBuf::from(target_directory);
    fs::create_dir_all(&target).map_err(|error| format!("无法创建目标目录: {}", error))?;
    let available =
        fs2::available_space(&target).map_err(|error| format!("无法读取磁盘空间: {}", error))?;
    Ok(DiskSpaceResult {
        available,
        sufficient: available >= required_bytes,
    })
}

#[tauri::command]
pub fn color_picker_check_symlink_permission(test_directory: String) -> Result<bool, String> {
    let directory = PathBuf::from(test_directory);
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建测试目录: {}", error))?;
    let source = directory.join(format!(".aiohub-symlink-source-{}", uuid::Uuid::new_v4()));
    let link = directory.join(format!(".aiohub-symlink-test-{}", uuid::Uuid::new_v4()));
    fs::write(&source, b"aiohub").map_err(|error| format!("无法创建权限测试文件: {}", error))?;
    let result = create_symlink(&source, &link)
        .map(|_| true)
        .map_err(|error| error.to_string());
    let _ = fs::remove_file(&link);
    let _ = fs::remove_file(&source);
    result
}

fn safe_component(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value == "." || value == ".." || value.contains(['/', '\\', ':']) {
        return Err(format!("非法分组名称: {}", value));
    }
    Ok(value.to_string())
}

fn unique_target(target: &Path) -> (PathBuf, bool) {
    if !target.exists() {
        return (target.to_path_buf(), false);
    }
    let stem = target
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    for index in 1..=9999 {
        let candidate = target.with_file_name(format!("{stem} ({index}){extension}"));
        if !candidate.exists() {
            return (candidate, true);
        }
    }
    (target.to_path_buf(), true)
}

fn create_symlink(source: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_file(source, target)
    }
    #[cfg(not(windows))]
    {
        std::os::unix::fs::symlink(source, target)
    }
}

#[tauri::command]
pub fn color_picker_organize_images(
    request: OrganizeImagesRequest,
) -> Result<BatchOrganizeResult, String> {
    if request.mode != "copy" && request.mode != "symlink" {
        return Err("不支持的归档模式".to_string());
    }
    let root = PathBuf::from(&request.target_directory);
    fs::create_dir_all(&root).map_err(|error| format!("无法创建目标目录: {}", error))?;

    if request.mode == "copy" {
        const SAFETY_MARGIN_BYTES: u64 = 100 * 1024 * 1024;
        let required_bytes = request
            .items
            .iter()
            .filter_map(|item| fs::metadata(&item.source_path).ok())
            .map(|metadata| metadata.len())
            .fold(SAFETY_MARGIN_BYTES, u64::saturating_add);
        let available = fs2::available_space(&root)
            .map_err(|error| format!("无法读取目标磁盘空间: {}", error))?;
        if available < required_bytes {
            return Err(format!(
                "目标磁盘空间不足：需要 {} 字节，可用 {} 字节",
                required_bytes, available
            ));
        }
    }

    let mut result = BatchOrganizeResult {
        success_count: 0,
        renamed_count: 0,
        source_not_found_count: 0,
        failed_count: 0,
        details: Vec::new(),
    };

    for item in request.items {
        let source = PathBuf::from(&item.source_path);
        if request.check_source_exists.unwrap_or(true) && !source.is_file() {
            result.source_not_found_count += 1;
            result.details.push(OrganizeDetail {
                source_path: item.source_path,
                target_path: None,
                status: "source_not_found".to_string(),
                error: Some("源文件已丢失".to_string()),
            });
            continue;
        }
        let family = match safe_component(&item.color_family) {
            Ok(value) => value,
            Err(error) => {
                result.failed_count += 1;
                result.details.push(OrganizeDetail {
                    source_path: item.source_path,
                    target_path: None,
                    status: "failed".to_string(),
                    error: Some(error),
                });
                continue;
            }
        };
        let brightness = match safe_component(&item.brightness_level) {
            Ok(value) => value,
            Err(error) => {
                result.failed_count += 1;
                result.details.push(OrganizeDetail {
                    source_path: item.source_path,
                    target_path: None,
                    status: "failed".to_string(),
                    error: Some(error),
                });
                continue;
            }
        };
        let directory = root.join(family).join(brightness);
        if let Err(error) = fs::create_dir_all(&directory) {
            result.failed_count += 1;
            result.details.push(OrganizeDetail {
                source_path: item.source_path,
                target_path: None,
                status: "failed".to_string(),
                error: Some(error.to_string()),
            });
            continue;
        }
        let target_name = Path::new(&item.file_name)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("image");
        let (target, renamed) = unique_target(&directory.join(target_name));
        let operation = if request.mode == "copy" {
            fs::copy(&source, &target).map(|_| ())
        } else {
            create_symlink(&source, &target)
        };
        match operation {
            Ok(()) => {
                result.success_count += 1;
                if renamed {
                    result.renamed_count += 1;
                }
                result.details.push(OrganizeDetail {
                    source_path: item.source_path,
                    target_path: Some(target.to_string_lossy().to_string()),
                    status: if renamed { "renamed" } else { "success" }.to_string(),
                    error: None,
                });
            }
            Err(error) => {
                result.failed_count += 1;
                result.details.push(OrganizeDetail {
                    source_path: item.source_path,
                    target_path: Some(target.to_string_lossy().to_string()),
                    status: "failed".to_string(),
                    error: Some(error.to_string()),
                });
            }
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn safe_component_rejects_path_traversal() {
        assert!(safe_component("").is_err());
        assert!(safe_component("..").is_err());
        assert!(safe_component("a/b").is_err());
        assert!(safe_component(r"a\b").is_err());
        assert!(safe_component("C:").is_err());
        assert_eq!(safe_component(" 蓝 ").unwrap(), "蓝");
    }

    #[test]
    fn unique_target_adds_counter_without_overwriting() {
        let directory = tempdir().unwrap();
        let original = directory.path().join("cover.png");
        fs::write(&original, b"existing").unwrap();
        let (candidate, renamed) = unique_target(&original);
        assert!(renamed);
        assert_eq!(candidate.file_name().unwrap(), "cover (1).png");
    }

    #[test]
    fn organize_copies_and_reports_missing_sources() {
        let source_dir = tempdir().unwrap();
        let target_dir = tempdir().unwrap();
        let source = source_dir.path().join("photo.png");
        fs::write(&source, b"image").unwrap();
        let missing = source_dir.path().join("missing.png");
        let request = OrganizeImagesRequest {
            items: vec![
                OrganizeItem {
                    source_path: source.to_string_lossy().into_owned(),
                    file_name: "photo.png".to_string(),
                    color_family: "蓝".to_string(),
                    brightness_level: "明亮".to_string(),
                },
                OrganizeItem {
                    source_path: missing.to_string_lossy().into_owned(),
                    file_name: "missing.png".to_string(),
                    color_family: "红".to_string(),
                    brightness_level: "偏暗".to_string(),
                },
            ],
            target_directory: target_dir.path().to_string_lossy().into_owned(),
            mode: "copy".to_string(),
            check_source_exists: Some(true),
        };
        let result = color_picker_organize_images(request).unwrap();
        assert_eq!(result.success_count, 1);
        assert_eq!(result.source_not_found_count, 1);
        assert!(target_dir.path().join("蓝/明亮/photo.png").is_file());
        assert_eq!(result.details[1].status, "source_not_found");
    }

    #[test]
    fn organize_rejects_unsafe_group_names() {
        let source_dir = tempdir().unwrap();
        let target_dir = tempdir().unwrap();
        let source = source_dir.path().join("photo.png");
        fs::write(&source, b"image").unwrap();
        let result = color_picker_organize_images(OrganizeImagesRequest {
            items: vec![OrganizeItem {
                source_path: source.to_string_lossy().into_owned(),
                file_name: "photo.png".to_string(),
                color_family: "../escape".to_string(),
                brightness_level: "明亮".to_string(),
            }],
            target_directory: target_dir.path().to_string_lossy().into_owned(),
            mode: "copy".to_string(),
            check_source_exists: Some(true),
        })
        .unwrap();
        assert_eq!(result.failed_count, 1);
        assert_eq!(result.details[0].status, "failed");
        assert!(!target_dir.path().join("escape").exists());
    }
}
