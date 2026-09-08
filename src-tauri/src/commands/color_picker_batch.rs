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
use std::cell::RefCell;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

static CANCELLED_SCANS: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));
static CANCELLED_ANALYSES: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));
static SVG_FONT_DATABASE: Lazy<Arc<usvg::fontdb::Database>> = Lazy::new(|| {
    let mut database = usvg::fontdb::Database::new();
    database.load_system_fonts();
    Arc::new(database)
});

// Share a bounded pool across tasks/windows instead of saturating Rayon's global pool.
// Use 3/4 of available logical CPUs (up to 16 workers) to balance throughput with system responsiveness.
fn analysis_worker_count(available: usize) -> usize {
    ((available * 3) / 4).clamp(1, 16)
}

static ANALYSIS_POOL: Lazy<Result<rayon::ThreadPool, String>> = Lazy::new(|| {
    let available = std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(1);
    rayon::ThreadPoolBuilder::new()
        .num_threads(analysis_worker_count(available))
        .thread_name(|index| format!("color-analysis-{index}"))
        .build()
        .map_err(|error| format!("创建颜色分析线程池失败: {error}"))
});

const ANALYSIS_PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeItemResult {
    pub path: String,
    pub status: String,
    pub average_color: Option<String>,
    pub dominant_color: Option<String>,
    pub vibrant_color: Option<String>,
    pub luminance: Option<f64>,
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
    pub structure: Option<String>,
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

#[derive(Clone, Copy)]
struct ImageColorAnalysis {
    average: (u8, u8, u8),
    dominant: (u8, u8, u8),
    vibrant: (u8, u8, u8),
    luminance: f64,
}

#[derive(Clone, Copy, Default)]
struct QuantizedColorBin {
    count: u32,
    r_sum: u64,
    g_sum: u64,
    b_sum: u64,
}

const QUANTIZED_BINS_PER_CHANNEL: usize = 32;
const QUANTIZED_BIN_COUNT: usize = QUANTIZED_BINS_PER_CHANNEL.pow(3);

thread_local! {
    // Rayon workers reuse this scratch space across images. It avoids allocating a
    // full 5-bit histogram for every decoded thumbnail while keeping workers isolated.
    static QUANTIZED_COLOR_BINS: RefCell<Vec<QuantizedColorBin>> = RefCell::new(Vec::new());
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

fn hsl_saturation_and_lightness((r, g, b): (u8, u8, u8)) -> (f64, f64) {
    let r = f64::from(r) / 255.0;
    let g = f64::from(g) / 255.0;
    let b = f64::from(b) / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let lightness = (max + min) / 2.0;
    let saturation = if (max - min).abs() <= f64::EPSILON {
        0.0
    } else if lightness > 0.5 {
        (max - min) / (2.0 - max - min)
    } else {
        (max - min) / (max + min)
    };
    (saturation, lightness)
}

fn representative_colors_rgba(
    pixels: &[u8],
    fallback: (u8, u8, u8),
) -> ((u8, u8, u8), (u8, u8, u8)) {
    QUANTIZED_COLOR_BINS.with(|storage| {
        let mut bins = storage.borrow_mut();
        if bins.len() != QUANTIZED_BIN_COUNT {
            bins.resize(QUANTIZED_BIN_COUNT, QuantizedColorBin::default());
        } else {
            bins.fill(QuantizedColorBin::default());
        }

        // These sparse, 5-bit bins run on the already decoded 128 px thumbnail. They
        // intentionally skip transparent and near-white pixels so borders/backgrounds
        // do not hide the subject's dominant or saturated representative color.
        for pixel in pixels.chunks_exact(4).step_by(4) {
            let [r, g, b, a] = [pixel[0], pixel[1], pixel[2], pixel[3]];
            if a < 125 || (r > 250 && g > 250 && b > 250) {
                continue;
            }
            let index = ((usize::from(r) >> 3) << 10)
                | ((usize::from(g) >> 3) << 5)
                | (usize::from(b) >> 3);
            let bin = &mut bins[index];
            bin.count += 1;
            bin.r_sum += u64::from(r);
            bin.g_sum += u64::from(g);
            bin.b_sum += u64::from(b);
        }

        let max_population = bins.iter().map(|bin| bin.count).max().unwrap_or(0);
        if max_population == 0 {
            return (fallback, fallback);
        }

        let color_for = |bin: QuantizedColorBin| {
            (
                ((bin.r_sum + u64::from(bin.count) / 2) / u64::from(bin.count)) as u8,
                ((bin.g_sum + u64::from(bin.count) / 2) / u64::from(bin.count)) as u8,
                ((bin.b_sum + u64::from(bin.count) / 2) / u64::from(bin.count)) as u8,
            )
        };
        let mut dominant = fallback;
        let mut dominant_population = 0;
        let mut vibrant = fallback;
        let mut vibrant_score = f64::NEG_INFINITY;
        for bin in bins.iter().copied().filter(|bin| bin.count > 0) {
            let color = color_for(bin);
            if bin.count > dominant_population {
                dominant = color;
                dominant_population = bin.count;
            }
            let (saturation, lightness) = hsl_saturation_and_lightness(color);
            let population = f64::from(bin.count) / f64::from(max_population);
            let normal_luma = 1.0 - ((lightness - 0.5) / 0.5).abs();
            let score = 0.50 * population + 0.35 * saturation + 0.15 * normal_luma;
            if score > vibrant_score {
                vibrant = color;
                vibrant_score = score;
            }
        }
        (dominant, vibrant)
    })
}

fn analysis_from_average((r, g, b, luminance): (u8, u8, u8, f64)) -> ImageColorAnalysis {
    let average = (r, g, b);
    ImageColorAnalysis {
        average,
        dominant: average,
        vibrant: average,
        luminance,
    }
}

fn raster_color_analysis(pixels: &[u8]) -> Result<ImageColorAnalysis, String> {
    let (r, g, b, luminance) = average_rgba_pixels(pixels)?;
    let average = (r, g, b);
    let (dominant, vibrant) = representative_colors_rgba(pixels, average);
    Ok(ImageColorAnalysis {
        average,
        dominant,
        vibrant,
        luminance,
    })
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

fn sample_svg_colors(path: &Path) -> Result<ImageColorAnalysis, String> {
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

    Ok(analysis_from_average(average_premultiplied_rgba_pixels(
        pixmap.data(),
    )?))
}

fn sample_image_colors(path: &Path) -> Result<ImageColorAnalysis, String> {
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("svg"))
    {
        return sample_svg_colors(path);
    }

    let img = image::open(path).map_err(|error| format!("打开图片失败: {error}"))?;
    let (width, height) = img.dimensions();
    if width == 0 || height == 0 {
        return Err("图片尺寸为 0".to_string());
    }

    // All representative colors reuse the same 128 px thumbnail. Decoding and
    // resizing remain the dominant cost, so this avoids extra image passes.
    let sampled = if width > 128 || height > 128 {
        img.thumbnail(128, 128)
    } else {
        img
    };
    let rgba = sampled.to_rgba8();
    raster_color_analysis(rgba.as_raw())
}

#[cfg(test)]
fn sample_image_color(path: &Path) -> Result<(u8, u8, u8, f64), String> {
    let analysis = sample_image_colors(path)?;
    Ok((
        analysis.average.0,
        analysis.average.1,
        analysis.average.2,
        analysis.luminance,
    ))
}

#[tauri::command]
pub async fn color_picker_analyze_images(
    app: AppHandle,
    request: AnalyzeImagesRequest,
) -> Result<Vec<AnalyzeItemResult>, String> {
    if request.task_id.trim().is_empty() {
        return Err("分析任务 ID 不能为空".to_string());
    }
    // Register before dispatch, so cancellation while waiting for a worker is not lost.
    CANCELLED_ANALYSES
        .lock()
        .map_err(|_| "分析任务状态不可用".to_string())?
        .remove(&request.task_id);

    tokio::task::spawn_blocking(move || {
        analyze_images(request, |progress| {
            let _ = app.emit("color_picker_analyze_progress", progress);
        })
    })
    .await
    .map_err(|error| format!("颜色分析后台任务失败: {error}"))?
}

fn analyze_images(
    request: AnalyzeImagesRequest,
    emit: impl Fn(AnalyzeProgress) + Sync,
) -> Result<Vec<AnalyzeItemResult>, String> {
    let task_id = &request.task_id;
    let _cleanup = scopeguard::guard((), |_| {
        if let Ok(mut cancelled) = CANCELLED_ANALYSES.lock() {
            cancelled.remove(task_id);
        }
    });
    let pool = ANALYSIS_POOL.as_ref().map_err(Clone::clone)?;
    let total = request.paths.len();
    let progress = Mutex::new((0_usize, Vec::new(), Instant::now()));

    emit(AnalyzeProgress {
        task_id: task_id.clone(),
        completed_count: 0,
        total_count: total,
        active_names: Vec::new(),
        batch_results: Vec::new(),
        done: false,
        cancelled: false,
    });

    let results = pool.install(|| {
        request
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
                        dominant_color: None,
                        vibrant_color: None,
                        luminance: None,
                        error: Some("分析任务已取消".to_string()),
                    };
                }

                let path = Path::new(path_str);
                let item_result = match sample_image_colors(path) {
                    Ok(analysis) => AnalyzeItemResult {
                        path: path_str.clone(),
                        status: "success".to_string(),
                        average_color: Some(format!(
                            "#{:02x}{:02x}{:02x}",
                            analysis.average.0, analysis.average.1, analysis.average.2
                        )),
                        dominant_color: Some(format!(
                            "#{:02x}{:02x}{:02x}",
                            analysis.dominant.0, analysis.dominant.1, analysis.dominant.2
                        )),
                        vibrant_color: Some(format!(
                            "#{:02x}{:02x}{:02x}",
                            analysis.vibrant.0, analysis.vibrant.1, analysis.vibrant.2
                        )),
                        luminance: Some(analysis.luminance),
                        error: None,
                    },
                    Err(err) => AnalyzeItemResult {
                        path: path_str.clone(),
                        status: "failed".to_string(),
                        average_color: None,
                        dominant_color: None,
                        vibrant_color: None,
                        luminance: None,
                        error: Some(err),
                    },
                };

                // Serialize both the count and emission: concurrent workers must not
                // deliver decreasing counts or drop results between progress batches.
                let mut state = progress.lock().unwrap_or_else(|error| error.into_inner());
                let (completed, pending, last_emit) = &mut *state;
                *completed += 1;
                pending.push(item_result.clone());
                if *completed == 1 || last_emit.elapsed() >= ANALYSIS_PROGRESS_INTERVAL {
                    emit(AnalyzeProgress {
                        task_id: task_id.clone(),
                        completed_count: *completed,
                        total_count: total,
                        active_names: vec![path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into_owned()],
                        batch_results: std::mem::take(pending),
                        done: false,
                        cancelled: false,
                    });
                    *last_emit = Instant::now();
                }
                item_result
            })
            .collect()
    });

    let was_cancelled = CANCELLED_ANALYSES
        .lock()
        .map(|set| set.contains(task_id))
        .unwrap_or(false);
    let (completed, pending, _) = progress
        .into_inner()
        .unwrap_or_else(|error| error.into_inner());
    // Flush the tail even on cancellation; skipped images are not completed work.
    emit(AnalyzeProgress {
        task_id: task_id.clone(),
        completed_count: completed,
        total_count: total,
        active_names: Vec::new(),
        batch_results: pending,
        done: true,
        cancelled: was_cancelled,
    });
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
    let stem = value.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(
        stem.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || ["COM", "LPT"].iter().any(|prefix| {
        stem.strip_prefix(prefix).is_some_and(|suffix| {
            matches!(
                suffix,
                "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
            )
        })
    });
    if value.is_empty()
        || value.ends_with('.')
        || value
            .chars()
            .any(|ch| ch.is_control() || r#"/\:*?"<>|"#.contains(ch))
        || reserved
    {
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
    let structure = request
        .structure
        .as_deref()
        .unwrap_or("color_and_brightness");
    if !matches!(
        structure,
        "color_and_brightness" | "brightness_only" | "color_only" | "brightness_and_color"
    ) {
        return Err(format!("不支持的归档目录结构: {structure}"));
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
        let sub_path = match structure {
            "color_and_brightness" => {
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
                PathBuf::from(family).join(brightness)
            }
            "brightness_only" => {
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
                PathBuf::from(brightness)
            }
            "color_only" => {
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
                PathBuf::from(family)
            }
            "brightness_and_color" => {
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
                PathBuf::from(brightness).join(family)
            }
            _ => unreachable!(),
        };
        let directory = root.join(sub_path);
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
    fn representative_colors_ignore_white_backgrounds_without_changing_average() {
        let mut pixels = Vec::new();
        for _ in 0..192 {
            pixels.extend_from_slice(&[255, 255, 255, 255]);
        }
        for _ in 0..64 {
            pixels.extend_from_slice(&[20, 60, 240, 255]);
        }

        let analysis = raster_color_analysis(&pixels).unwrap();
        assert!(analysis.average.0 > 150);
        assert!(analysis.average.2 > analysis.average.0);
        assert_eq!(analysis.dominant, (20, 60, 240));
        assert_eq!(analysis.vibrant, (20, 60, 240));
    }

    #[test]
    fn analysis_pool_leaves_cpu_headroom_and_bounds_decoders() {
        assert_eq!(analysis_worker_count(1), 1);
        assert_eq!(analysis_worker_count(2), 1);
        assert_eq!(analysis_worker_count(4), 3);
        assert_eq!(analysis_worker_count(8), 6);
        assert_eq!(analysis_worker_count(16), 12);
        assert_eq!(analysis_worker_count(32), 16);
        for available in 1..=128 {
            let workers = analysis_worker_count(available);
            assert!(workers >= 1);
            assert!(workers <= 16);
            if available >= 2 {
                assert!(workers <= (available * 3) / 4);
            }
        }
    }
    #[test]
    fn analysis_streams_every_result_once_with_monotonic_progress() {
        let directory = tempdir().unwrap();
        let paths: Vec<String> = (0..13)
            .map(|index| {
                let path = directory.path().join(format!("{index}.png"));
                image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]))
                    .save(&path)
                    .unwrap();
                path.to_string_lossy().into_owned()
            })
            .chain(std::iter::once(
                directory
                    .path()
                    .join("missing.png")
                    .to_string_lossy()
                    .into_owned(),
            ))
            .collect();
        let events = Mutex::new(Vec::new());
        let results = analyze_images(
            AnalyzeImagesRequest {
                task_id: uuid::Uuid::new_v4().to_string(),
                paths: paths.clone(),
            },
            |event| events.lock().unwrap().push(event),
        )
        .unwrap();
        let events = events.into_inner().unwrap();
        assert_eq!(results.len(), paths.len());
        assert_eq!(
            results
                .iter()
                .filter(|result| result.status == "success")
                .count(),
            13
        );
        assert_eq!(results.last().unwrap().status, "failed");
        let payload = serde_json::to_value(&results[0]).unwrap();
        assert!(payload.get("averageColor").is_some());
        assert!(payload.get("luminance").is_some());
        assert!(payload.get("colorFamily").is_none());
        assert!(payload.get("brightnessLevel").is_none());
        assert!(events
            .iter()
            .any(|event| !event.done && !event.batch_results.is_empty()));
        assert_eq!(events.iter().filter(|event| event.done).count(), 1);
        assert!(events.last().unwrap().done);
        let mut received = HashSet::new();
        let mut previous = 0;
        for event in &events {
            assert!(event.completed_count >= previous);
            previous = event.completed_count;
            for result in &event.batch_results {
                assert!(
                    received.insert(result.path.clone()),
                    "duplicate streamed result"
                );
            }
            assert_eq!(received.len(), event.completed_count);
        }
        assert_eq!(received, paths.into_iter().collect());
        // The streamed payload must agree with the final response, including failures.
        let streamed: std::collections::HashMap<_, _> = events
            .iter()
            .flat_map(|event| &event.batch_results)
            .map(|result| (&result.path, serde_json::to_value(result).unwrap()))
            .collect();
        for result in &results {
            assert_eq!(
                streamed[&result.path],
                serde_json::to_value(result).unwrap()
            );
        }
    }

    #[test]
    fn cancellation_flushes_completed_results_without_counting_skipped_images() {
        let directory = tempdir().unwrap();
        let task_id = uuid::Uuid::new_v4().to_string();
        let events = Mutex::new(Vec::new());
        // Cancel on the first streamed result. Other in-flight workers may finish,
        // but queued images must remain unprocessed and must not inflate progress.
        let results = analyze_images(
            AnalyzeImagesRequest {
                task_id: task_id.clone(),
                paths: (0..100)
                    .map(|index| {
                        directory
                            .path()
                            .join(format!("missing-{index}.png"))
                            .to_string_lossy()
                            .into_owned()
                    })
                    .collect(),
            },
            |event| {
                if event.completed_count > 0 && !event.done {
                    color_picker_cancel_analyze(task_id.clone()).unwrap();
                }
                events.lock().unwrap().push(event);
            },
        )
        .unwrap();
        let events = events.into_inner().unwrap();
        let last = events.last().unwrap();
        assert!(last.done && last.cancelled);
        assert!(last.completed_count > 0 && last.completed_count < last.total_count);
        assert_eq!(
            events
                .iter()
                .map(|event| event.batch_results.len())
                .sum::<usize>(),
            last.completed_count
        );
        assert_eq!(
            results
                .iter()
                .filter(|result| result.error.as_deref() == Some("分析任务已取消"))
                .count(),
            last.total_count - last.completed_count
        );
        assert!(!CANCELLED_ANALYSES.lock().unwrap().contains(&task_id));
    }

    #[test]
    fn safe_component_rejects_path_traversal() {
        assert!(safe_component("").is_err());
        assert!(safe_component("..").is_err());
        assert!(safe_component("a/b").is_err());
        assert!(safe_component(r"a\b").is_err());
        assert!(safe_component("C:").is_err());
        assert_eq!(safe_component(" 蓝 ").unwrap(), "蓝");
        for name in [
            "a*b", "a?b", "a<b", "a>b", "a|b", "a\"b", "a\0b", "red.", "CON", "nul.txt", "COM1",
            "LPT²",
        ] {
            assert!(
                safe_component(name).is_err(),
                "accepted unsafe name: {name}"
            );
        }
        assert_eq!(safe_component("海蓝").unwrap(), "海蓝");
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
    fn samples_real_color_svg_from_icon_library() {
        let source = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../node_modules/@lobehub/icons-static-svg/icons/mistral-color.svg");
        assert!(
            source.is_file(),
            "missing icon-library SVG fixture: {source:?}"
        );

        let analysis = sample_image_colors(&source).unwrap();
        let (r, g, b) = analysis.average;
        assert!(
            r > 200,
            "expected the Mistral icon to remain red/orange: {r}"
        );
        assert!(
            (70..=190).contains(&g),
            "expected the Mistral icon to retain its orange/amber green channel: {g}"
        );
        assert!(b < 50, "expected the Mistral icon to have little blue: {b}");
        // SVGs use the existing alpha-correct rendering path. Until representative
        // SVG colors have their own separately tuned rasterization semantics, all
        // filter sources intentionally fall back to this rendered average.
        assert_eq!(analysis.dominant, analysis.average);
        assert_eq!(analysis.vibrant, analysis.average);
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
            structure: None,
            check_source_exists: Some(true),
        };
        let result = color_picker_organize_images(request).unwrap();
        assert_eq!(result.success_count, 1);
        assert_eq!(result.source_not_found_count, 1);
        assert!(target_dir.path().join("蓝/明亮/photo.png").is_file());
        assert_eq!(result.details[1].status, "source_not_found");
    }

    #[test]
    fn organize_supports_custom_structures() {
        let source_dir = tempdir().unwrap();
        let target_dir = tempdir().unwrap();
        let source = source_dir.path().join("image.png");
        fs::write(&source, b"test").unwrap();

        // 1. 仅亮度模式
        let res_brightness = color_picker_organize_images(OrganizeImagesRequest {
            items: vec![OrganizeItem {
                source_path: source.to_string_lossy().into_owned(),
                file_name: "image.png".to_string(),
                color_family: "蓝".to_string(),
                brightness_level: "偏亮".to_string(),
            }],
            target_directory: target_dir.path().to_string_lossy().into_owned(),
            mode: "copy".to_string(),
            structure: Some("brightness_only".to_string()),
            check_source_exists: Some(true),
        })
        .unwrap();
        assert_eq!(res_brightness.success_count, 1);
        assert!(target_dir.path().join("偏亮/image.png").is_file());

        // 2. 仅色系模式
        let res_color = color_picker_organize_images(OrganizeImagesRequest {
            items: vec![OrganizeItem {
                source_path: source.to_string_lossy().into_owned(),
                file_name: "image.png".to_string(),
                color_family: "红".to_string(),
                brightness_level: "偏暗".to_string(),
            }],
            target_directory: target_dir.path().to_string_lossy().into_owned(),
            mode: "copy".to_string(),
            structure: Some("color_only".to_string()),
            check_source_exists: Some(true),
        })
        .unwrap();
        assert_eq!(res_color.success_count, 1);
        assert!(target_dir.path().join("红/image.png").is_file());

        // 3. 亮度 / 色系模式
        let res_brightness_color = color_picker_organize_images(OrganizeImagesRequest {
            items: vec![OrganizeItem {
                source_path: source.to_string_lossy().into_owned(),
                file_name: "image.png".to_string(),
                color_family: "绿".to_string(),
                brightness_level: "明亮".to_string(),
            }],
            target_directory: target_dir.path().to_string_lossy().into_owned(),
            mode: "copy".to_string(),
            structure: Some("brightness_and_color".to_string()),
            check_source_exists: Some(true),
        })
        .unwrap();
        assert_eq!(res_brightness_color.success_count, 1);
        assert!(target_dir.path().join("明亮/绿/image.png").is_file());
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
            structure: None,
            check_source_exists: Some(true),
        })
        .unwrap();
        assert_eq!(result.failed_count, 1);
        assert_eq!(result.details[0].status, "failed");
        assert!(!target_dir.path().join("escape").exists());
    }
}
