use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};
use tokio::process::{Child, Command};

pub struct FFmpegState {
    pub active_processes: Arc<Mutex<HashMap<String, Child>>>,
}

impl Default for FFmpegState {
    fn default() -> Self {
        Self {
            active_processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FFmpegProgress {
    pub percent: f64,
    pub current_time: f64,
    pub speed: String,
    pub bitrate: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FFmpegProgressPayload {
    pub task_id: String,
    pub progress: FFmpegProgress,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FFmpegParams {
    pub mode: String, // "compress" | "extract_audio" | "convert" | "custom"
    pub input_path: String,
    pub output_path: String,
    pub ffmpeg_path: String,
    pub hwaccel: bool,

    // 视频参数
    pub video_encoder: Option<String>,
    pub preset: Option<String>,
    pub crf: Option<u32>,
    pub video_bitrate: Option<String>,
    pub scale: Option<String>,
    pub fps: Option<f64>,
    pub pixel_format: Option<String>,

    // 音频参数
    pub audio_encoder: Option<String>,
    pub audio_bitrate: Option<String>,
    pub sample_rate: Option<String>,

    // 其他
    pub custom_args: Option<Vec<String>>,
    pub max_size_mb: Option<f64>,
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
) -> Result<FFProbeOutput, String> {
    // 假设 ffprobe 与 ffmpeg 在同一目录下
    let ffprobe_path = Path::new(&ffmpeg_path)
        .parent()
        .map(|p| p.join("ffprobe"))
        .unwrap_or_else(|| Path::new("ffprobe").to_path_buf());

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

    if stderr.contains("Audio: ") {
        metadata.has_audio = true;
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

/// 终止 FFmpeg 任务
#[tauri::command]
pub async fn kill_ffmpeg_process(
    state: State<'_, FFmpegState>,
    task_id: String,
) -> Result<(), String> {
    let child = {
        let mut processes = state.active_processes.lock().map_err(|e| e.to_string())?;
        processes.remove(&task_id)
    };

    if let Some(mut c) = child {
        let _ = c.kill().await;
    }
    Ok(())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FFmpegLogPayload {
    pub task_id: String,
    pub message: String,
}

/// 统一媒体处理入口
#[tauri::command]
pub async fn process_media(
    state: State<'_, FFmpegState>,
    task_id: String,
    window: tauri::Window,
    params: FFmpegParams,
) -> Result<String, String> {
    let active_processes = state.active_processes.clone();
    let ffmpeg_path = params.ffmpeg_path.clone();
    let input_path = params.input_path.clone();
    let output_path = params.output_path.clone();

    if !Path::new(&input_path).exists() {
        return Err(format!("Input file not found: {}", input_path));
    }

    if let Some(parent) = Path::new(&output_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let metadata = get_video_metadata(&ffmpeg_path, &input_path).await;
    let duration = metadata.duration.unwrap_or(0.0);

    let mut args = vec![
        "-hide_banner".to_string(),
        "-i".to_string(),
        input_path,
        "-y".to_string(),
    ];

    if params.hwaccel {
        args.insert(0, "-hwaccel".to_string());
        args.insert(1, "auto".to_string());
    }

    match params.mode.as_str() {
        "custom" => {
            if let Some(custom) = params.custom_args {
                args.extend(custom);
            }
        }
        _ => {
            if params.mode == "extract_audio" {
                args.push("-vn".to_string());
            } else {
                let v_codec = params.video_encoder.unwrap_or_else(|| {
                    if params.hwaccel {
                        "h264_nvenc".to_string()
                    } else {
                        "libx264".to_string()
                    }
                });
                args.extend_from_slice(&["-c:v".to_string(), v_codec]);

                if let Some(crf) = params.crf {
                    args.extend_from_slice(&["-crf".to_string(), crf.to_string()]);
                } else if let Some(v_bitrate) = params.video_bitrate {
                    args.extend_from_slice(&["-b:v".to_string(), v_bitrate]);
                } else if let Some(target_mb) = params.max_size_mb {
                    if duration > 0.0 {
                        let total_bitrate = (target_mb * 8.0 * 1024.0 * 1024.0) / duration;
                        let audio_bitrate = if metadata.has_audio { 128_000.0 } else { 0.0 };
                        let video_bitrate = (total_bitrate - audio_bitrate).max(200_000.0);
                        args.extend_from_slice(&[
                            "-b:v".to_string(),
                            format!("{:.0}", video_bitrate),
                        ]);
                    }
                }

                if let Some(preset) = params.preset {
                    args.extend_from_slice(&["-preset".to_string(), preset]);
                }

                let mut v_filters = Vec::new();
                if let Some(scale) = params.scale {
                    v_filters.push(scale);
                }
                if let Some(pix_fmt) = params.pixel_format {
                    v_filters.push(format!("format={}", pix_fmt));
                }
                if !v_filters.is_empty() {
                    args.extend_from_slice(&["-vf".to_string(), v_filters.join(",")]);
                }

                if let Some(fps) = params.fps {
                    args.extend_from_slice(&["-r".to_string(), format!("{:.2}", fps)]);
                }
            }

            if metadata.has_audio || params.mode == "extract_audio" {
                let a_codec = params.audio_encoder.unwrap_or_else(|| "aac".to_string());
                args.extend_from_slice(&["-c:a".to_string(), a_codec]);

                if let Some(ab) = params.audio_bitrate {
                    args.extend_from_slice(&["-b:a".to_string(), ab]);
                }
                if let Some(ar) = params.sample_rate {
                    args.extend_from_slice(&["-ar".to_string(), ar]);
                }
            }
        }
    }

    args.push(output_path.clone());

    let mut command = Command::new(&ffmpeg_path);
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    log::info!("[FFmpeg] 执行指令: {} {}", ffmpeg_path, args.join(" "));

    command
        .args(&args)
        .stderr(Stdio::piped())
        .stdout(Stdio::null()); // 进度解析改用 stderr，不再需要 stdout

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

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
    }));

    // 处理 stderr (日志 + 进度解析)
    let task_id_for_stderr = task_id_clone.clone();
    let window_for_stderr = window_clone.clone();
    let last_progress_for_stderr = last_progress.clone();
    tokio::spawn(async move {
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

        while let Ok(n) = reader.read(&mut buffer).await {
            if n == 0 {
                break;
            }

            for &b in &buffer[..n] {
                if b == b'\n' || b == b'\r' {
                    if line_buffer.is_empty() {
                        continue;
                    }
                    let line = String::from_utf8_lossy(&line_buffer).to_string();
                    line_buffer.clear();

                    // 1. 发送原始日志到前端控制台
                    let _ = window_for_stderr.emit(
                        "ffmpeg-log",
                        FFmpegLogPayload {
                            task_id: task_id_for_stderr.clone(),
                            message: line.clone(),
                        },
                    );

                    // 2. 解析进度
                    let mut updated = false;
                    let mut progress = {
                        let p = last_progress_for_stderr.lock().unwrap();
                        p.clone()
                    };

                    if let Some(pos) = line.find("time=") {
                        let rest = line[pos + 5..].trim_start();
                        let time_str = rest.split_whitespace().next().unwrap_or("");
                        if let Some(t) = parse_ffmpeg_time(time_str) {
                            progress.current_time = t;
                            if duration > 0.0 {
                                progress.percent = (t / duration * 100.0).min(99.9);
                            }
                            updated = true;
                        }
                    }

                    if let Some(pos) = line.find("speed=") {
                        let rest = line[pos + 6..].trim_start();
                        progress.speed = rest.split_whitespace().next().unwrap_or("0x").to_string();
                        updated = true;
                    }

                    if let Some(pos) = line.find("bitrate=") {
                        let rest = line[pos + 8..].trim_start();
                        progress.bitrate = rest
                            .split_whitespace()
                            .next()
                            .unwrap_or("0kbps")
                            .to_string();
                        updated = true;
                    }

                    if updated {
                        // 更新共享状态
                        {
                            let mut p = last_progress_for_stderr.lock().unwrap();
                            *p = progress.clone();
                        }

                        let _ = window_for_stderr.emit(
                            "ffmpeg-progress",
                            FFmpegProgressPayload {
                                task_id: task_id_for_stderr.clone(),
                                progress,
                            },
                        );
                    }
                } else {
                    line_buffer.push(b);
                }
            }
        }
    });

    // 取回进程并等待
    let mut child = {
        let mut processes = active_processes.lock().map_err(|e| e.to_string())?;
        processes.remove(&task_id_clone).ok_or("Process lost")?
    };

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Wait failed: {}", e))?;

    if status.success() {
        // 任务成功后，发送 100% 进度，并保留最后一次解析到的速率和比特率
        let mut final_progress = {
            let p = last_progress.lock().unwrap();
            p.clone()
        };
        final_progress.percent = 100.0;
        final_progress.current_time = duration;

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
