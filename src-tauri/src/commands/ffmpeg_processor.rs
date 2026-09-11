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

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};
use tokio::process::{Child, Command};

pub struct FFmpegState {
    pub active_processes: Arc<Mutex<HashMap<String, Child>>>,
    pub cancelled: Arc<Mutex<HashSet<String>>>,
}

impl Default for FFmpegState {
    fn default() -> Self {
        Self {
            active_processes: Arc::new(Mutex::new(HashMap::new())),
            cancelled: Arc::new(Mutex::new(HashSet::new())),
        }
    }
}

pub const FFMPEG_CANCELLED_ERROR: &str = "FFMPEG_CANCELLED";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KillResult {
    pub found: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FFmpegProgress {
    pub percent: f64,
    pub current_time: f64,
    pub speed: String,
    pub bitrate: String,
    pub total_duration: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FFmpegProgressPayload {
    pub task_id: String,
    pub progress: FFmpegProgress,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FFmpegPlan {
    pub executable: String,
    pub input_path: String,
    pub output_path: String,
    pub args: Vec<String>,
    #[serde(default)]
    pub total_duration: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadata {
    pub duration: Option<f64>,
    pub fps: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub has_audio: bool,
    pub size: u64,
    pub audio_codec: Option<String>,
    pub video_codec: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommandVersionInfo {
    pub available: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FFProbeOutput {
    pub streams: Vec<FFProbeStream>,
    pub format: FFProbeFormat,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FFProbeStream {
    pub index: u32,
    pub codec_name: Option<String>,
    pub codec_long_name: Option<String>,
    pub profile: Option<String>,
    pub codec_type: String, // "video", "audio", etc.
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub display_aspect_ratio: Option<String>,
    pub r_frame_rate: Option<String>,
    pub avg_frame_rate: Option<String>,
    pub bit_rate: Option<String>,
    pub bits_per_raw_sample: Option<String>,
    pub pix_fmt: Option<String>,
    pub color_range: Option<String>,
    pub color_space: Option<String>,
    pub color_primaries: Option<String>,
    pub color_transfer: Option<String>,
    pub sample_rate: Option<String>,
    pub channels: Option<u32>,
    pub channel_layout: Option<String>,
    pub duration: Option<String>,
    pub nb_frames: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FFProbeFormat {
    pub filename: String,
    pub nb_streams: u32,
    pub format_name: String,
    pub format_long_name: String,
    pub duration: String,
    pub size: String,
    pub bit_rate: String,
}

/// 获取媒体元数据
#[tauri::command]
pub async fn get_media_metadata(ffmpeg_path: String, input_path: String) -> MediaMetadata {
    get_video_metadata(&ffmpeg_path, &input_path).await
}

/// 使用 ffprobe 获取详细媒体信息
#[tauri::command]
pub async fn get_full_media_info(
    ffmpeg_path: String,
    input_path: String,
    ffprobe_path: Option<String>,
) -> Result<FFProbeOutput, String> {
    let ffprobe_path = ffprobe_path
        .filter(|p| !p.trim().is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(&ffmpeg_path)
                .parent()
                .map(|p| p.join("ffprobe"))
                .unwrap_or_else(|| Path::new("ffprobe").to_path_buf())
        });

    let output = Command::new(ffprobe_path)
        .arg("-v")
        .arg("quiet")
        .arg("-print_format")
        .arg("json")
        .arg("-show_format")
        .arg("-show_streams")
        .arg(&input_path)
        .output()
        .await
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe failed with status: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let probe_data: FFProbeOutput = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    Ok(probe_data)
}

/// 获取整份视频的关键帧时间点（秒）。
///
/// 为保证前端按文件缓存后可用于任意区间，这里扫描整份文件（`-skip_frame nokey`
/// 不解码，仅遍历包）。`start_sec`/`end_sec` 仅用于参数校验。无视频流时返回空
/// 数组，而不是错误。
#[tauri::command]
pub async fn get_media_keyframes(
    ffmpeg_path: String,
    input_path: String,
    ffprobe_path: Option<String>,
    start_sec: f64,
    end_sec: f64,
) -> Result<Vec<f64>, String> {
    if start_sec < 0.0 {
        return Err("开始时间不能为负".to_string());
    }
    if end_sec <= start_sec {
        return Err("结束时间必须大于开始时间".to_string());
    }

    let ffprobe_path = ffprobe_path
        .filter(|p| !p.trim().is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(&ffmpeg_path)
                .parent()
                .map(|p| p.join("ffprobe"))
                .unwrap_or_else(|| Path::new("ffprobe").to_path_buf())
        });

    let output = Command::new(ffprobe_path)
        .arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg("v:0")
        .arg("-skip_frame")
        .arg("nokey")
        .arg("-show_entries")
        .arg("frame=pts_time")
        .arg("-of")
        .arg("csv=p=0")
        .arg(&input_path)
        .output()
        .await
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe failed with status: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut keyframes: Vec<f64> = stdout
        .lines()
        .filter_map(|line| line.trim().parse::<f64>().ok())
        .filter(|value| value.is_finite())
        .collect();
    keyframes.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    Ok(keyframes)
}

fn parse_ffmpeg_time(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() == 3 {
        let h = parts[0].trim().parse::<f64>().ok()?;
        let m = parts[1].trim().parse::<f64>().ok()?;
        let s = parts[2].trim().parse::<f64>().ok()?;
        Some(h * 3600.0 + m * 60.0 + s)
    } else {
        // 尝试解析秒数格式
        s.trim().parse::<f64>().ok()
    }
}

async fn get_video_metadata(ffmpeg_path: &str, input_path: &str) -> MediaMetadata {
    let mut metadata = MediaMetadata {
        duration: None,
        fps: None,
        width: None,
        height: None,
        has_audio: false,
        size: 0,
        audio_codec: None,
        video_codec: None,
    };

    if let Ok(m) = std::fs::metadata(input_path) {
        metadata.size = m.len();
    }

    let output = match Command::new(ffmpeg_path)
        .arg("-i")
        .arg(input_path)
        .output()
        .await
    {
        Ok(o) => o,
        Err(_) => return metadata,
    };

    let stderr = String::from_utf8_lossy(&output.stderr);

    if let Some(pos) = stderr.find("Duration: ") {
        let rest = &stderr[pos + 10..];
        if let Some(end) = rest.find(',') {
            let duration_str = &rest[..end];
            if let Some(d) = parse_ffmpeg_time(duration_str) {
                metadata.duration = Some(d);
            }
        }
    }

    if let Some(pos) = stderr.find("Video: ") {
        let codec_rest = &stderr[pos + "Video: ".len()..];
        if let Some(codec) = codec_rest.split_whitespace().next() {
            metadata.video_codec = Some(codec.to_string());
        }

        let rest = &stderr[pos..];
        for part in rest.split(',') {
            let part = part.trim();
            let dim_part = part.split_whitespace().next().unwrap_or(part);
            if let Some((w_str, h_str)) = dim_part.split_once('x') {
                if let (Ok(w), Ok(h)) = (w_str.parse::<u32>(), h_str.parse::<u32>()) {
                    metadata.width = Some(w);
                    metadata.height = Some(h);
                    break;
                }
            }
        }
    }

    for part in stderr.split(',') {
        let part = part.trim();
        if let Some(fps_str) = part.strip_suffix(" fps") {
            if let Ok(fps) = fps_str.parse::<f64>() {
                metadata.fps = Some(fps);
            }
        }
    }

    if let Some(pos) = stderr.find("Audio: ") {
        metadata.has_audio = true;
        let rest = &stderr[pos + "Audio: ".len()..];
        if let Some(codec) = rest.split_whitespace().next() {
            metadata.audio_codec = Some(codec.to_string());
        }
    }

    metadata
}

/// 验证 FFmpeg 路径是否有效
#[tauri::command]
pub async fn check_ffmpeg_availability(path: String) -> bool {
    let output = Command::new(&path).arg("-version").output().await;
    match output {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

#[tauri::command]
pub async fn check_command_version(
    path: String,
    version_arg: Option<String>,
) -> CommandVersionInfo {
    let output = Command::new(&path)
        .arg(version_arg.unwrap_or_else(|| "--version".to_string()))
        .output()
        .await;

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let version = stdout
                .lines()
                .chain(stderr.lines())
                .map(str::trim)
                .find(|line| !line.is_empty())
                .map(|line| line.to_string());

            CommandVersionInfo {
                available: output.status.success(),
                version,
                error: if output.status.success() {
                    None
                } else {
                    Some(format!("Command exited with status: {}", output.status))
                },
            }
        }
        Err(error) => CommandVersionInfo {
            available: false,
            version: None,
            error: Some(error.to_string()),
        },
    }
}

/// 终止 FFmpeg 任务
#[tauri::command]
pub async fn kill_ffmpeg_process(
    state: State<'_, FFmpegState>,
    task_id: String,
) -> Result<KillResult, String> {
    {
        let mut cancelled = state.cancelled.lock().map_err(|e| e.to_string())?;
        cancelled.insert(task_id.clone());
    }

    let found = {
        let mut processes = state.active_processes.lock().map_err(|e| e.to_string())?;
        match processes.get_mut(&task_id) {
            Some(child) => {
                let _ = child.start_kill();
                true
            }
            None => false,
        }
    };

    Ok(KillResult { found })
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FFmpegLogPayload {
    pub task_id: String,
    pub message: String,
}

/// 执行由前端唯一执行计划模块产出的 argv。
///
/// 后端不得补充、重排或构造任何参数，只负责进程生命周期、取消与进度解析。
#[tauri::command]
pub async fn run_ffmpeg_plan(
    state: State<'_, FFmpegState>,
    task_id: String,
    window: tauri::Window,
    plan: FFmpegPlan,
) -> Result<String, String> {
    let active_processes = state.active_processes.clone();
    let cancelled = state.cancelled.clone();
    let executable = plan.executable.clone();
    let input_path = plan.input_path.clone();
    let output_path = plan.output_path.clone();

    {
        let mut cancelled_set = cancelled.lock().map_err(|e| e.to_string())?;
        if cancelled_set.remove(&task_id) {
            return Err(FFMPEG_CANCELLED_ERROR.to_string());
        }
    }

    if executable.trim().is_empty() {
        return Err("FFmpeg 可执行文件路径为空".to_string());
    }

    if output_path.trim().is_empty() {
        return Err("输出路径为空".to_string());
    }

    if plan.args.is_empty() {
        return Err("FFmpeg 参数为空".to_string());
    }

    if !Path::new(&input_path).exists() {
        return Err(format!("Input file not found: {}", input_path));
    }

    if let Some(parent) = Path::new(&output_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let metadata = get_video_metadata(&executable, &input_path).await;
    let duration = plan
        .total_duration
        .filter(|d| *d > 0.0)
        .unwrap_or_else(|| metadata.duration.unwrap_or(0.0));

    {
        let mut cancelled_set = cancelled.lock().map_err(|e| e.to_string())?;
        if cancelled_set.remove(&task_id) {
            return Err(FFMPEG_CANCELLED_ERROR.to_string());
        }
    }

    let mut command = Command::new(&executable);
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    log::info!("[FFmpeg] 执行指令: {} {}", executable, plan.args.join(" "));

    let mut exec_args = plan.args.clone();
    let progress_insert_at = exec_args.len().saturating_sub(1);
    exec_args.splice(
        progress_insert_at..progress_insert_at,
        [
            "-progress".to_string(),
            "pipe:1".to_string(),
            "-nostats".to_string(),
        ],
    );

    command
        .args(&exec_args)
        .stderr(Stdio::piped())
        .stdout(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;

    // 记录进程
    {
        let mut processes = active_processes.lock().map_err(|e| e.to_string())?;
        processes.insert(task_id.clone(), child);
    }

    let task_id_clone = task_id.clone();
    let window_clone = window.clone();

    // 使用共享状态记录最后一次进度，以便在结束时发送完整信息
    let last_progress = Arc::new(Mutex::new(FFmpegProgress {
        percent: 0.0,
        current_time: 0.0,
        speed: "0x".to_string(),
        bitrate: "0kbps".to_string(),
        total_duration: duration,
    }));

    // 处理 stderr (仅日志)
    let task_id_for_stderr = task_id_clone.clone();
    let window_for_stderr = window_clone.clone();
    let stderr_handle = tokio::spawn(async move {
        use tokio::io::AsyncReadExt;
        let mut reader = stderr;
        let mut buffer = [0u8; 4096];
        let mut line_buffer = Vec::new();

        // 发送初始日志
        let _ = window_for_stderr.emit(
            "ffmpeg-log",
            FFmpegLogPayload {
                task_id: task_id_for_stderr.clone(),
                message: "FFmpeg process started...".to_string(),
            },
        );

        loop {
            let n = match reader.read(&mut buffer).await {
                Ok(0) | Err(_) => break,
                Ok(n) => n,
            };

            for &b in &buffer[..n] {
                if b == b'\n' || b == b'\r' {
                    if line_buffer.is_empty() {
                        continue;
                    }
                    let line = String::from_utf8_lossy(&line_buffer).to_string();
                    line_buffer.clear();
                    let _ = window_for_stderr.emit(
                        "ffmpeg-log",
                        FFmpegLogPayload {
                            task_id: task_id_for_stderr.clone(),
                            message: line,
                        },
                    );
                } else {
                    line_buffer.push(b);
                }
            }
        }

        if !line_buffer.is_empty() {
            let line = String::from_utf8_lossy(&line_buffer).to_string();
            let _ = window_for_stderr.emit(
                "ffmpeg-log",
                FFmpegLogPayload {
                    task_id: task_id_for_stderr.clone(),
                    message: line,
                },
            );
        }
    });

    // 处理 stdout 结构化进度
    let task_id_for_stdout = task_id_clone.clone();
    let window_for_stdout = window_clone.clone();
    let last_progress_for_stdout = last_progress.clone();
    let stdout_handle = tokio::spawn(async move {
        use tokio::io::AsyncReadExt;
        let mut reader = stdout;
        let mut buffer = [0u8; 4096];
        let mut line_buffer = Vec::new();

        loop {
            let n = match reader.read(&mut buffer).await {
                Ok(0) | Err(_) => break,
                Ok(n) => n,
            };

            for &b in &buffer[..n] {
                if b != b'\n' && b != b'\r' {
                    line_buffer.push(b);
                    continue;
                }
                if line_buffer.is_empty() {
                    continue;
                }
                let line = String::from_utf8_lossy(&line_buffer).to_string();
                line_buffer.clear();

                let Some((key, value)) = line.split_once('=') else {
                    continue;
                };
                let key = key.trim();
                let value = value.trim();

                let mut should_emit = false;
                match key {
                    "out_time" => {
                        if let Some(t) = parse_ffmpeg_time(value) {
                            let mut progress = last_progress_for_stdout.lock().unwrap();
                            if progress.current_time != t {
                                progress.current_time = t;
                                should_emit = true;
                            }
                        }
                    }
                    "speed" => {
                        if value != "N/A" && !value.is_empty() {
                            let mut progress = last_progress_for_stdout.lock().unwrap();
                            if progress.speed != value {
                                progress.speed = value.to_string();
                                should_emit = true;
                            }
                        }
                    }
                    "bitrate" => {
                        if value != "N/A" && !value.is_empty() {
                            let mut progress = last_progress_for_stdout.lock().unwrap();
                            if progress.bitrate != value {
                                progress.bitrate = value.to_string();
                                should_emit = true;
                            }
                        }
                    }
                    "progress" => {
                        should_emit = true;
                    }
                    _ => {}
                }

                if should_emit {
                    let progress = {
                        let mut current = last_progress_for_stdout.lock().unwrap();
                        current.percent = if duration > 0.0 {
                            (current.current_time / duration * 100.0).min(99.9)
                        } else {
                            0.0
                        };
                        current.clone()
                    };
                    let _ = window_for_stdout.emit(
                        "ffmpeg-progress",
                        FFmpegProgressPayload {
                            task_id: task_id_for_stdout.clone(),
                            progress,
                        },
                    );
                }
            }
        }
    });

    // 轮询进程状态，直到进程退出
    let status = loop {
        let maybe_status = {
            let mut processes = active_processes.lock().map_err(|e| e.to_string())?;
            match processes.get_mut(&task_id_clone) {
                Some(child) => child
                    .try_wait()
                    .map_err(|e| format!("Wait failed: {}", e))?,
                None => None,
            }
        };
        if let Some(s) = maybe_status {
            break s;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    };

    let was_cancelled = {
        let mut cancelled_set = cancelled.lock().map_err(|e| e.to_string())?;
        cancelled_set.remove(&task_id_clone)
    };
    {
        let mut processes = active_processes.lock().map_err(|e| e.to_string())?;
        processes.remove(&task_id_clone);
    }

    let _ = tokio::time::timeout(std::time::Duration::from_secs(2), stderr_handle).await;
    let _ = tokio::time::timeout(std::time::Duration::from_secs(2), stdout_handle).await;

    if was_cancelled {
        return Err(FFMPEG_CANCELLED_ERROR.to_string());
    }

    if status.success() {
        // 任务成功后，发送 100% 进度，并保留最后一次解析到的速率和比特率
        let mut final_progress = {
            let p = last_progress.lock().unwrap();
            p.clone()
        };
        final_progress.percent = 100.0;
        final_progress.current_time = duration;
        final_progress.total_duration = duration;

        let _ = window_clone.emit(
            "ffmpeg-progress",
            FFmpegProgressPayload {
                task_id: task_id_clone,
                progress: final_progress,
            },
        );
        Ok(output_path)
    } else {
        Err(format!("FFmpeg exited with code: {:?}", status.code()))
    }
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VideoRoi {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VideoFramePayload {
    pub task_id: String,
    pub frame_path: String,
    pub timestamp_ms: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VideoOcrProgressPayload {
    pub task_id: String,
    pub phase: String,
    pub extracted: usize,
    pub ocr_completed: usize,
    pub total: usize,
    pub current_time_ms: u64,
    pub percent: f64,
    pub error: Option<String>,
}

/// 按固定时间间隔从视频中提取字幕识别帧。
///
/// 帧在任务专属目录中生成，完成后通过事件逐个通知前端。任务仍登记在
/// FFmpegState 中，因此现有 kill_ffmpeg_process 可安全取消长视频抽帧。
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn extract_video_frames(
    state: State<'_, FFmpegState>,
    window: tauri::Window,
    task_id: String,
    ffmpeg_path: String,
    input_path: String,
    output_dir: String,
    start_ms: u64,
    end_ms: u64,
    interval_ms: u64,
    roi: Option<VideoRoi>,
) -> Result<usize, String> {
    if !Path::new(&input_path).is_file() {
        return Err(format!("视频文件不存在: {}", input_path));
    }
    if ffmpeg_path.trim().is_empty() {
        return Err("未配置 FFmpeg 路径".to_string());
    }
    if end_ms < start_ms {
        return Err("视频结束时间不能早于开始时间".to_string());
    }
    if interval_ms == 0 {
        return Err("抽帧间隔必须大于 0".to_string());
    }

    std::fs::create_dir_all(&output_dir).map_err(|e| format!("无法创建视频帧临时目录: {}", e))?;

    let start_seconds = start_ms as f64 / 1000.0;
    let duration_seconds = (end_ms - start_ms) as f64 / 1000.0;
    let expected_total = (((end_ms - start_ms) / interval_ms) + 1) as usize;
    let fps_filter = format!("fps=1/{}", interval_ms as f64 / 1000.0);
    let mut filters = vec![fps_filter];
    if let Some(region) = roi {
        let metadata = get_video_metadata(&ffmpeg_path, &input_path).await;
        let video_width = metadata
            .width
            .filter(|value| *value > 0)
            .ok_or_else(|| "无法读取视频宽度，无法应用字幕区域裁剪".to_string())?;
        let video_height = metadata
            .height
            .filter(|value| *value > 0)
            .ok_or_else(|| "无法读取视频高度，无法应用字幕区域裁剪".to_string())?;

        // 先把归一化 ROI 转换为整数像素，再交给 FFmpeg，避免极小区域或奇数尺寸
        // 生成 0 像素裁剪区域。宽高大于 1 时向下收缩到偶数，兼容更多编码器。
        let x = region.x.clamp(0.0, 0.99);
        let y = region.y.clamp(0.0, 0.99);
        let width = region.width.max(0.01).min((1.0 - x).max(0.01));
        let height = region.height.max(0.01).min((1.0 - y).max(0.01));
        let crop_x = ((x * video_width as f64).floor() as u32).min(video_width - 1);
        let crop_y = ((y * video_height as f64).floor() as u32).min(video_height - 1);
        let available_width = video_width - crop_x;
        let available_height = video_height - crop_y;
        let mut crop_width = ((width * video_width as f64).floor() as u32)
            .max(1)
            .min(available_width);
        let mut crop_height = ((height * video_height as f64).floor() as u32)
            .max(1)
            .min(available_height);
        if crop_width > 1 && crop_width % 2 == 1 {
            crop_width -= 1;
        }
        if crop_height > 1 && crop_height % 2 == 1 {
            crop_height -= 1;
        }
        filters.push(format!(
            "crop={}:{}:{}:{}",
            crop_width, crop_height, crop_x, crop_y
        ));
    }

    let frame_pattern = Path::new(&output_dir).join("frame_%08d.jpg");
    let args = vec![
        "-hide_banner".to_string(),
        "-loglevel".to_string(),
        "error".to_string(),
        "-ss".to_string(),
        format!("{:.3}", start_seconds),
        "-i".to_string(),
        input_path.clone(),
        "-t".to_string(),
        format!("{:.3}", (duration_seconds + 0.001).max(0.001)),
        "-vf".to_string(),
        filters.join(","),
        "-vsync".to_string(),
        "vfr".to_string(),
        "-frames:v".to_string(),
        expected_total.to_string(),
        "-q:v".to_string(),
        "2".to_string(),
        "-y".to_string(),
        frame_pattern.to_string_lossy().to_string(),
    ];

    let mut command = Command::new(&ffmpeg_path);
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|e| format!("启动 FFmpeg 失败: {}", e))?;
    let stderr = child.stderr.take();
    let stderr_task = stderr.map(|mut stream| {
        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            let mut bytes = Vec::new();
            let _ = stream.read_to_end(&mut bytes).await;
            String::from_utf8_lossy(&bytes).to_string()
        })
    });

    {
        let mut processes = state.active_processes.lock().map_err(|e| e.to_string())?;
        processes.insert(task_id.clone(), child);
    }

    let mut emitted_frames = 0usize;
    let mut discovered_frames = Vec::new();
    let mut discovered_set = HashSet::new();
    let mut frame_sizes: HashMap<std::path::PathBuf, u64> = HashMap::new();
    let frame_task_id = task_id.clone();
    let read_frames = || -> Result<Vec<std::path::PathBuf>, String> {
        let mut frames: Vec<std::path::PathBuf> = std::fs::read_dir(&output_dir)
            .map_err(|e| format!("读取视频帧目录失败: {}", e))?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.extension().and_then(|e| e.to_str()) == Some("jpg"))
            .collect();
        frames.sort();
        Ok(frames)
    };
    let mut emit_available_frames = |frames: &[std::path::PathBuf]| {
        while emitted_frames < frames.len() {
            let index = emitted_frames;
            let frame_path = &frames[index];
            let size = match std::fs::metadata(frame_path) {
                Ok(metadata) if metadata.len() > 0 => metadata.len(),
                _ => break,
            };
            // FFmpeg 可能会先创建文件再持续写入，连续两次轮询大小不变后才通知前端。
            let is_stable = frame_sizes.get(frame_path).copied() == Some(size);
            frame_sizes.insert(frame_path.clone(), size);
            if !is_stable {
                break;
            }
            let timestamp_ms = (start_ms + index as u64 * interval_ms).min(end_ms);
            let _ = window.emit(
                "video-ocr-frame",
                VideoFramePayload {
                    task_id: frame_task_id.clone(),
                    frame_path: frame_path.to_string_lossy().to_string(),
                    timestamp_ms,
                },
            );
            let _ = window.emit(
                "video-ocr-progress",
                VideoOcrProgressPayload {
                    task_id: frame_task_id.clone(),
                    phase: "extracting".to_string(),
                    extracted: index + 1,
                    ocr_completed: 0,
                    total: expected_total,
                    current_time_ms: timestamp_ms,
                    percent: (index + 1) as f64 / expected_total as f64 * 100.0,
                    error: None,
                },
            );
            emitted_frames += 1;
        }
    };

    let status = loop {
        let frames = read_frames()?;
        for frame_path in &frames {
            if discovered_set.insert(frame_path.clone()) {
                discovered_frames.push(frame_path.clone());
            }
        }
        emit_available_frames(&discovered_frames);
        let result = {
            let mut processes = state.active_processes.lock().map_err(|e| e.to_string())?;
            let process = processes
                .get_mut(&task_id)
                .ok_or_else(|| "FFmpeg 任务已被取消".to_string())?;
            process
                .try_wait()
                .map_err(|e| format!("读取 FFmpeg 状态失败: {}", e))?
        };
        if let Some(status) = result {
            {
                let mut processes = state.active_processes.lock().map_err(|e| e.to_string())?;
                processes.remove(&task_id);
            }
            let was_cancelled = {
                let mut cancelled = state.cancelled.lock().map_err(|e| e.to_string())?;
                cancelled.remove(&task_id)
            };
            if was_cancelled {
                return Err(FFMPEG_CANCELLED_ERROR.to_string());
            }
            break status;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    };

    let stderr_text = if let Some(task) = stderr_task {
        task.await.unwrap_or_default()
    } else {
        String::new()
    };
    if !status.success() {
        let message: String = if stderr_text.trim().is_empty() {
            format!("FFmpeg 抽帧失败，退出码: {:?}", status.code())
        } else {
            format!("FFmpeg 抽帧失败: {}", stderr_text.trim())
        };
        let _ = window.emit(
            "video-ocr-progress",
            VideoOcrProgressPayload {
                task_id,
                phase: "error".to_string(),
                extracted: emitted_frames,
                ocr_completed: 0,
                total: emitted_frames,
                current_time_ms: start_ms,
                percent: 0.0,
                error: Some(message.clone()),
            },
        );
        return Err(message);
    }

    let frames = read_frames()?;
    for frame_path in &frames {
        if discovered_set.insert(frame_path.clone()) {
            discovered_frames.push(frame_path.clone());
        }
    }
    emit_available_frames(&discovered_frames);
    let total = discovered_frames.len();

    let _ = window.emit(
        "video-ocr-progress",
        VideoOcrProgressPayload {
            task_id,
            phase: "ocr".to_string(),
            extracted: total,
            ocr_completed: 0,
            total,
            current_time_ms: end_ms,
            percent: if total == 0 { 100.0 } else { 0.0 },
            error: None,
        },
    );
    Ok(total)
}
