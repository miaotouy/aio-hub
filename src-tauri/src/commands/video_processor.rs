use std::path::Path;
use tokio::process::Command;

struct VideoMetadata {
    duration: Option<f64>,
    fps: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    has_audio: bool,
}

/// 获取视频元数据 (时长、帧率、分辨率、是否有音频)
async fn get_video_metadata(ffmpeg_path: &str, input_path: &str) -> VideoMetadata {
    let mut metadata = VideoMetadata {
        duration: None,
        fps: None,
        width: None,
        height: None,
        has_audio: false,
    };

    let output = match Command::new(ffmpeg_path)
        .arg("-i")
        .arg(input_path)
        .output()
        .await
    {
        Ok(o) => o,
        Err(_) => return metadata,
    };

    // FFmpeg 输出信息在 stderr 中
    let stderr = String::from_utf8_lossy(&output.stderr);

    // 1. 查找 "Duration: HH:MM:SS.mm"
    if let Some(pos) = stderr.find("Duration: ") {
        let rest = &stderr[pos + 10..];
        if let Some(end) = rest.find(',') {
            let duration_str = &rest[..end];
            let parts: Vec<&str> = duration_str.split(':').collect();
            if parts.len() == 3 {
                if let (Ok(h), Ok(m), Ok(s)) = (
                    parts[0].parse::<f64>(),
                    parts[1].parse::<f64>(),
                    parts[2].parse::<f64>(),
                ) {
                    metadata.duration = Some(h * 3600.0 + m * 60.0 + s);
                }
            }
        }
    }

    // 2. 查找分辨率 (e.g., "Video: h264, ..., 1920x1080, ...")
    // 简单的查找逻辑：查找 "Video:" 后的第一个 "WxH" 格式
    if let Some(pos) = stderr.find("Video: ") {
        let rest = &stderr[pos..];
        // 查找类似 "1920x1080" 的模式
        // 由于没有 regex crate，我们手动解析一下
        // 遍历逗号分隔的部分
        for part in rest.split(',') {
            let part = part.trim();
            // 尝试分割 'x'，并检查两边是否为数字
            // 注意：有些格式可能包含 [SAR...] 等后缀，取第一个空格前的部分
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

    // 3. 查找帧率 (e.g., "23.98 fps,")
    // 遍历所有逗号分隔的字段，查找以 " fps" 结尾的
    for part in stderr.split(',') {
        let part = part.trim();
        if let Some(fps_str) = part.strip_suffix(" fps") {
            if let Ok(fps) = fps_str.parse::<f64>() {
                metadata.fps = Some(fps);
                // 不 break，因为有时前面会有 tbr, tbn 等，fps 通常在后面
            }
        }
    }

    // 4. 检查是否有音频流
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

/// 压缩视频
///
/// # Arguments
/// * `input_path` - 输入视频文件路径
/// * `output_path` - 输出视频文件路径
/// * `preset` - 压缩预设: "quality" | "speed" | "balanced" | "auto_size"
/// * `ffmpeg_path` - FFmpeg 可执行文件路径
/// * `max_size_mb` - 目标最大大小 (MB)，仅在 preset="auto_size" 时生效
/// * `max_fps` - 最大帧率限制 (FPS)，可选
#[tauri::command]
pub async fn compress_video(
    input_path: String,
    output_path: String,
    preset: String,
    ffmpeg_path: String,
    max_size_mb: Option<f64>,
    max_fps: Option<f64>,
    max_resolution: Option<u32>,
) -> Result<String, String> {
    // 检查输入文件是否存在
    if !Path::new(&input_path).exists() {
        return Err(format!("Input file not found: {}", input_path));
    }

    // 确保输出目录存在
    if let Some(parent) = Path::new(&output_path).parent() {
        if !parent.exists() {
            // 尝试创建目录，虽然通常调用者应该保证目录存在
            let _ = std::fs::create_dir_all(parent);
        }
    }

    // 获取元数据 (用于自动大小计算、帧率判断和分辨率缩放)
    let metadata = get_video_metadata(&ffmpeg_path, &input_path).await;

    // 构建参数
    let mut args = vec![
        "-i".to_string(),
        input_path.clone(),
        "-y".to_string(), // 覆盖输出
    ];

    // 应用帧率限制 (如果设置)
    // 逻辑：如果设置了 max_fps，且 (无法获取原帧率 或 原帧率 > max_fps)，则添加 -r
    if let Some(limit_fps) = max_fps {
        if limit_fps > 0.0 {
            let should_limit = match metadata.fps {
                Some(source_fps) => source_fps > limit_fps,
                None => true, // 无法获取原帧率时，为了保险起见，应用限制
            };

            if should_limit {
                args.extend_from_slice(&["-r".to_string(), format!("{:.2}", limit_fps)]);
            }
        }
    }

    // 计算缩放参数 (vf scale)
    // 逻辑：
    // 1. 确定目标限制值 target_res: 优先使用 max_resolution，否则根据 preset 设定默认值
    // 2. 根据 metadata.width/height 判断横竖屏
    // 3. 构建 scale 字符串
    let target_res = max_resolution.unwrap_or(match preset.as_str() {
        "quality" => 1080,
        "speed" => 480,
        _ => 720,
    });

    let scale_filter = if let (Some(w), Some(h)) = (metadata.width, metadata.height) {
        let min_dim = std::cmp::min(w, h);
        if min_dim > target_res {
            if w < h {
                // 竖屏：限制宽度 (短边)
                format!("scale={}:-2", target_res)
            } else {
                // 横屏：限制高度 (短边)
                format!("scale=-2:{}", target_res)
            }
        } else {
            // 原视频小于限制，不缩放
            "".to_string()
        }
    } else {
        // 无法获取分辨率，回退到默认的 scale=-2:target_res (假设横屏)
        format!("scale=-2:{}", target_res)
    };

    // 根据预设配置参数
    match preset.as_str() {
        "auto_size" => {
            // 自动大小模式：计算目标比特率
            let mut bitrate_set = false;

            if let Some(target_mb) = max_size_mb {
                if let Some(duration) = metadata.duration {
                    if duration > 0.0 {
                        // 目标总比特数 (bits) = MB * 1024 * 8
                        let target_bits = target_mb * 8.0 * 1024.0 * 1024.0;
                        // 目标总比特率 (bps)
                        let total_bitrate = target_bits / duration;

                        // 预留音频比特率 (假设 128kbps = 128000 bps)
                        // 只有在检测到音频流时才预留
                        let audio_bitrate = if metadata.has_audio { 128_000.0 } else { 0.0 };

                        // 计算视频可用比特率，至少保留 100kbps 以免画面太烂
                        let video_bitrate = (total_bitrate - audio_bitrate).max(100_000.0);

                        // 转换为 k/M 后缀格式或直接用数字
                        let video_bitrate_str = format!("{:.0}", video_bitrate);
                        let max_rate_str = format!("{:.0}", video_bitrate * 1.5); // 允许峰值波动
                        let buf_size_str = format!("{:.0}", video_bitrate * 2.0); // 缓冲区大小

                        args.extend_from_slice(&[
                            "-c:v".to_string(),
                            "libx264".to_string(),
                            "-b:v".to_string(),
                            video_bitrate_str,
                            "-maxrate".to_string(),
                            max_rate_str,
                            "-bufsize".to_string(),
                            buf_size_str,
                            "-preset".to_string(),
                            "medium".to_string(),
                        ]);
                        if !scale_filter.is_empty() {
                            args.extend_from_slice(&["-vf".to_string(), scale_filter.clone()]);
                        }
                        bitrate_set = true;
                    }
                }
            }

            if !bitrate_set {
                // 如果获取时长失败或未设置大小，回退到 balanced
                args.extend_from_slice(&[
                    "-c:v".to_string(),
                    "libx264".to_string(),
                    "-crf".to_string(),
                    "23".to_string(),
                    "-preset".to_string(),
                    "medium".to_string(),
                ]);
                if !scale_filter.is_empty() {
                    args.extend_from_slice(&["-vf".to_string(), scale_filter.clone()]);
                }
            }
        }
        "quality" => {
            args.extend_from_slice(&[
                "-c:v".to_string(),
                "libx264".to_string(),
                "-crf".to_string(),
                "18".to_string(),
                "-preset".to_string(),
                "slow".to_string(),
            ]);
            if !scale_filter.is_empty() {
                args.extend_from_slice(&["-vf".to_string(), scale_filter.clone()]);
            }
        }
        "speed" => {
            args.extend_from_slice(&[
                "-c:v".to_string(),
                "libx264".to_string(),
                "-crf".to_string(),
                "28".to_string(),
                "-preset".to_string(),
                "veryfast".to_string(),
            ]);
            if !scale_filter.is_empty() {
                args.extend_from_slice(&["-vf".to_string(), scale_filter.clone()]);
            }
        }
        _ => {
            // balanced or default
            args.extend_from_slice(&[
                "-c:v".to_string(),
                "libx264".to_string(),
                "-crf".to_string(),
                "23".to_string(),
                "-preset".to_string(),
                "medium".to_string(),
            ]);
            if !scale_filter.is_empty() {
                args.extend_from_slice(&["-vf".to_string(), scale_filter]);
            }
        }
    }

    // 音频处理
    if metadata.has_audio {
        if preset == "auto_size" {
            args.extend_from_slice(&[
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                "128k".to_string(),
            ]);
        } else {
            args.extend_from_slice(&["-c:a".to_string(), "copy".to_string()]);
        }
    } else {
        // 如果没有音频流，或者不需要音频，可以显式禁用音频流输出，防止 FFmpeg 产生空流或报错
        // 不过对于 copy 模式，如果没有音频流，ffmpeg 通常会自动忽略 -c:a copy
        // 为了保险起见，如果确实没有检测到音频，可以加 -an
        // 但考虑到检测可能不完美，这里保守一点：
        // 如果 auto_size 模式下没检测到音频，就不加音频参数（默认行为通常是处理存在的流）
        // 或者我们可以显式加 -an
        // 这里选择：如果检测到没有音频，显式 -an，确保输出文件干净
        args.push("-an".to_string());
    }

    args.push(output_path.clone());

    // 执行命令
    let mut command = Command::new(&ffmpeg_path);

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    // command.stderr(Stdio::inherit());

    let status = command
        .args(&args)
        .status()
        .await
        .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;

    if status.success() {
        Ok(output_path)
    } else {
        Err(format!(
            "FFmpeg exited with error code: {:?}",
            status.code()
        ))
    }
}
