// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

//! Batch image scanning, analysis, and organization commands for the color-picker tool.

use image::GenericImageView;
use once_cell::sync::Lazy;
use rayon::prelude::*;
use resvg::{tiny_skia, usvg};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

static CANCELLED_SCANS: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));
static CANCELLED_ANALYSES: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));
static SVG_FONT_DATABASE: Lazy<Arc<usvg::fontdb::Database>> = Lazy::new(|| {
    let mut database = usvg::fontdb::Database::new();
    database.load_system_fonts();
    Arc::new(database)
});

const DEFAULT_BRIGHTNESS_THRESHOLDS: [f64; 4] = [0.2, 0.4, 0.6, 0.8];

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeImagesRequest {
    pub task_id: String,
    pub paths: Vec<String>,
    pub thresholds: Option<Vec<f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeItemResult {
    pub path: String,
    pub status: String,
    pub average_color: Option<String>,
    pub luminance: Option<f64>,
    pub color_family: Option<String>,
    pub brightness_level: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeProgress {
    pub task_id: String,
    pub completed_count: usize,
    pub total_count: usize,
    pub active_names: Vec<String>,
    pub batch_results: Vec<AnalyzeItemResult>,
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

fn rgb_to_hsl(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let r_norm = r as f64 / 255.0;
    let g_norm = g as f64 / 255.0;
    let b_norm = b as f64 / 255.0;

    let max = r_norm.max(g_norm).max(b_norm);
    let min = r_norm.min(g_norm).min(b_norm);
    let lightness = (max + min) / 2.0;

    if (max - min).abs() < f64::EPSILON {
        return (0.0, 0.0, lightness);
    }

    let delta = max - min;
    let saturation = if lightness > 0.5 {
        delta / (2.0 - max - min)
    } else {
        delta / (max + min)
    };

    let mut hue = if (max - r_norm).abs() < f64::EPSILON {
        (g_norm - b_norm) / delta + if g_norm < b_norm { 6.0 } else { 0.0 }
    } else if (max - g_norm).abs() < f64::EPSILON {
        (b_norm - r_norm) / delta + 2.0
    } else {
        (r_norm - g_norm) / delta + 4.0
    };
    hue *= 60.0;

    (hue, saturation, lightness)
}

pub fn classify_color(r: u8, g: u8, b: u8) -> &'static str {
    let (hue, saturation, lightness) = rgb_to_hsl(r, g, b);
    if saturation < 0.12 {
        return "灰";
    }
    if !(15.0..345.0).contains(&hue) {
        return "红";
    }
    if hue < 42.0 {
        return if lightness < 0.35 { "棕" } else { "橙" };
    }
    if hue < 68.0 {
        return "黄";
    }
    if hue < 165.0 {
        return "绿";
    }
    if hue < 195.0 {
        return "青";
    }
    if hue < 255.0 {
        return "蓝";
    }
    if hue < 315.0 {
        return "紫";
    }
    "粉"
}

pub fn calculate_luminance(r: u8, g: u8, b: u8) -> f64 {
    let linear = |val: u8| -> f64 {
        let norm = val as f64 / 255.0;
        if norm <= 0.03928 {
            norm / 12.92
        } else {
            ((norm + 0.055) / 1.055).powf(2.4)
        }
    };
    (0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)).clamp(0.0, 1.0)
}

pub fn classify_brightness(luminance: f64, thresholds: &[f64; 4]) -> &'static str {
    let [dark, dim, medium, bright] = *thresholds;
    if luminance < dark {
        "极暗"
    } else if luminance < dim {
        "偏暗"
    } else if luminance < medium {
        "中等"
    } else if luminance < bright {
        "偏亮"
    } else {
        "明亮"
    }
}

fn normalize_brightness_thresholds(values: Option<&[f64]>) -> [f64; 4] {
    let values = values.unwrap_or(&DEFAULT_BRIGHTNESS_THRESHOLDS);
    let mut normalized = Vec::with_capacity(4);

    for (index, value) in values.iter().take(4).enumerate() {
        let minimum = if index == 0 {
            0.01
        } else {
            normalized[index - 1] + 0.01
        };
        let maximum = if index == 3 {
            0.99
        } else {
            0.99 - (3 - index) as f64 * 0.01
        };
        let value = if value.is_finite() { *value } else { minimum };
        normalized.push(value.clamp(minimum, maximum));
    }

    while normalized.len() < 4 {
        let value = normalized
            .last()
            .map(|previous| (previous + 0.2).min(0.99))
            .unwrap_or(0.2);
        normalized.push(value);
    }

    normalized.try_into().expect("亮度阈值会被规范化为四个值")
}

fn average_rgba_pixels(pixels: &[u8]) -> Result<(u8, u8, u8, f64), String> {
    let mut r_sum = 0.0;
    let mut g_sum = 0.0;
    let mut b_sum = 0.0;
    let mut weight_sum = 0.0;

    for pixel in pixels.chunks_exact(4) {
        let alpha = pixel[3] as f64 / 255.0;
        if alpha < 0.01 {
            continue;
        }
        r_sum += pixel[0] as f64 * alpha;
        g_sum += pixel[1] as f64 * alpha;
        b_sum += pixel[2] as f64 * alpha;
        weight_sum += alpha;
    }

    if weight_sum <= f64::EPSILON {
        return Err("图片没有可见像素".to_string());
    }

    let r = (r_sum / weight_sum).round().clamp(0.0, 255.0) as u8;
    let g = (g_sum / weight_sum).round().clamp(0.0, 255.0) as u8;
    let b = (b_sum / weight_sum).round().clamp(0.0, 255.0) as u8;
    let luminance = calculate_luminance(r, g, b);

    Ok((r, g, b, luminance))
}

fn average_premultiplied_rgba_pixels(pixels: &[u8]) -> Result<(u8, u8, u8, f64), String> {
    let mut r_sum = 0.0;
    let mut g_sum = 0.0;
    let mut b_sum = 0.0;
    let mut weight_sum = 0.0;

    for pixel in pixels.chunks_exact(4) {
        let alpha = pixel[3] as f64 / 255.0;
        if alpha < 0.01 {
            continue;
        }
        // tiny-skia stores premultiplied RGBA values, so the RGB components already
        // include alpha and must not be weighted by alpha a second time.
        r_sum += pixel[0] as f64;
        g_sum += pixel[1] as f64;
        b_sum += pixel[2] as f64;
        weight_sum += alpha;
    }

    if weight_sum <= f64::EPSILON {
        return Err("图片没有可见像素".to_string());
    }

    let r = (r_sum / weight_sum).round().clamp(0.0, 255.0) as u8;
    let g = (g_sum / weight_sum).round().clamp(0.0, 255.0) as u8;
    let b = (b_sum / weight_sum).round().clamp(0.0, 255.0) as u8;
    let luminance = calculate_luminance(r, g, b);

    Ok((r, g, b, luminance))
}

fn sample_svg_color(path: &Path) -> Result<(u8, u8, u8, f64), String> {
    let data = fs::read(path).map_err(|error| format!("读取 SVG 失败: {error}"))?;
    let options = usvg::Options {
        resources_dir: path.parent().map(Path::to_path_buf),
        fontdb: Arc::clone(&SVG_FONT_DATABASE),
        ..usvg::Options::default()
    };
    let tree = usvg::Tree::from_data(&data, &options)
        .map_err(|error| format!("解析 SVG 失败: {error}"))?;
    let size = tree.size();
    let scale = (128.0 / size.width().max(size.height())).min(1.0);
    let width = (size.width() * scale).round().max(1.0) as u32;
    let height = (size.height() * scale).round().max(1.0) as u32;
    let mut pixmap =
        tiny_skia::Pixmap::new(width, height).ok_or_else(|| "无法创建 SVG 渲染画布".to_string())?;

    resvg::render(
        &tree,
        tiny_skia::Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );

    average_premultiplied_rgba_pixels(pixmap.data())
}

fn sample_image_color(path: &Path) -> Result<(u8, u8, u8, f64), String> {
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("svg"))
    {
        return sample_svg_color(path);
    }

    let img = image::open(path).map_err(|error| format!("打开图片失败: {error}"))?;
    let (width, height) = img.dimensions();
    if width == 0 || height == 0 {
        return Err("图片尺寸为 0".to_string());
    }

    // 若图片尺寸较大，进行快速缩放采样至 128x128。
    let sampled = if width > 128 || height > 128 {
        img.thumbnail(128, 128)
    } else {
        img
    };
    let rgba = sampled.to_rgba8();

    average_rgba_pixels(rgba.as_raw())
}

#[tauri::command]
pub fn color_picker_analyze_images(
    app: AppHandle,
    request: AnalyzeImagesRequest,
) -> Result<Vec<AnalyzeItemResult>, String> {
    let task_id = request.task_id.trim();
    if task_id.is_empty() {
        return Err("分析任务 ID 不能为空".to_string());
    }

    CANCELLED_ANALYSES
        .lock()
        .map_err(|_| "分析任务状态不可用".to_string())?
        .remove(task_id);

    let thresholds = normalize_brightness_thresholds(request.thresholds.as_deref());
    let total = request.paths.len();
    let completed = AtomicUsize::new(0);

    // 发送初始进度
    let _ = app.emit(
        "color_picker_analyze_progress",
        AnalyzeProgress {
            task_id: task_id.to_string(),
            completed_count: 0,
            total_count: total,
            active_names: Vec::new(),
            batch_results: Vec::new(),
            done: false,
            cancelled: false,
        },
    );

    // 利用 rayon 并行处理图片分析
    let results: Vec<AnalyzeItemResult> = request
        .paths
        .par_iter()
        .map(|path_str| {
            let is_cancelled = CANCELLED_ANALYSES
                .lock()
                .map(|set| set.contains(task_id))
                .unwrap_or(false);

            if is_cancelled {
                return AnalyzeItemResult {
                    path: path_str.clone(),
                    status: "failed".to_string(),
                    average_color: None,
                    luminance: None,
                    color_family: None,
                    brightness_level: None,
                    error: Some("分析任务已取消".to_string()),
                };
            }

            let path = Path::new(path_str);
            let item_result = match sample_image_color(path) {
                Ok((r, g, b, luminance)) => {
                    let hex = format!("#{r:02x}{g:02x}{b:02x}");
                    let color_family = classify_color(r, g, b).to_string();
                    let brightness_level = classify_brightness(luminance, &thresholds).to_string();
                    AnalyzeItemResult {
                        path: path_str.clone(),
                        status: "success".to_string(),
                        average_color: Some(hex),
                        luminance: Some(luminance),
                        color_family: Some(color_family),
                        brightness_level: Some(brightness_level),
                        error: None,
                    }
                }
                Err(err) => AnalyzeItemResult {
                    path: path_str.clone(),
                    status: "failed".to_string(),
                    average_color: None,
                    luminance: None,
                    color_family: None,
                    brightness_level: None,
                    error: Some(err),
                },
            };

            let current_completed = completed.fetch_add(1, Ordering::SeqCst) + 1;

            // 每处理 5 张或到达最后一张时发出进度事件
            if current_completed.is_multiple_of(5) || current_completed == total {
                let file_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default()
                    .to_string();

                let _ = app.emit(
                    "color_picker_analyze_progress",
                    AnalyzeProgress {
                        task_id: task_id.to_string(),
                        completed_count: current_completed,
                        total_count: total,
                        active_names: vec![file_name],
                        batch_results: vec![item_result.clone()],
                        done: current_completed >= total,
                        cancelled: false,
                    },
                );
            }

            item_result
        })
        .collect();

    let was_cancelled = CANCELLED_ANALYSES
        .lock()
        .map(|set| set.contains(task_id))
        .unwrap_or(false);

    let _ = app.emit(
        "color_picker_analyze_progress",
        AnalyzeProgress {
            task_id: task_id.to_string(),
            completed_count: total,
            total_count: total,
            active_names: Vec::new(),
            batch_results: Vec::new(),
            done: true,
            cancelled: was_cancelled,
        },
    );

    CANCELLED_ANALYSES
        .lock()
        .map_err(|_| "分析任务状态不可用".to_string())?
        .remove(task_id);

    Ok(results)
}

#[tauri::command]
pub fn color_picker_cancel_analyze(task_id: String) -> Result<(), String> {
    CANCELLED_ANALYSES
        .lock()
        .map_err(|_| "分析任务状态不可用".to_string())?
        .insert(task_id);
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
    fn normalizes_range_slider_thresholds() {
        assert_eq!(
            normalize_brightness_thresholds(Some(&[0.2, 0.8])),
            [0.2, 0.8, 0.99, 0.99]
        );
    }

    #[test]
    fn samples_svg_with_transparency_without_double_alpha_weighting() {
        let directory = tempdir().unwrap();
        let source = directory.path().join("transparent-red.svg");
        fs::write(
            &source,
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#ff0000" fill-opacity="0.5"/></svg>"##,
        )
        .unwrap();

        let (r, g, b, _) = sample_image_color(&source).unwrap();
        assert!((r as i16 - 255).abs() <= 1);
        assert_eq!(g, 0);
        assert_eq!(b, 0);
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
