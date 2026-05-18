/**
 * FFmpeg Agent Action: 获取媒体信息
 */
import { invoke } from "@tauri-apps/api/core";
import { useFFmpegStore } from "../ffmpegStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { MediaMetadata, FFProbeOutput } from "../types";

const logger = createModuleLogger("ffmpeg-tools/actions/getMediaInfo");
const errorHandler = createModuleErrorHandler("ffmpeg-tools/actions/getMediaInfo");

export interface GetMediaInfoArgs {
  /** 文件路径 */
  path: string;
  /** 是否返回详细流信息（默认 false，只返回摘要） */
  detailed?: boolean;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "未知";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "未知";
  const mb = bytes / (1024 * 1024);
  if (mb > 1024) return `${(mb / 1024).toFixed(2)} GiB`;
  return `${mb.toFixed(2)} MiB`;
}

export async function getMediaInfo(args: GetMediaInfoArgs): Promise<string> {
  const { path, detailed = false } = args;

  if (!path) {
    return JSON.stringify({ success: false, error: "缺少必需参数: path" });
  }

  const result = await errorHandler.wrapAsync(
    async () => {
      const store = useFFmpegStore();
      const ffmpegPath = store.config.ffmpegPath;

      // 获取基础元数据
      const metadata = await invoke<MediaMetadata>("get_media_metadata", {
        ffmpegPath,
        inputPath: path,
      });

      const info: Record<string, any> = {
        success: true,
        path,
        duration: formatDuration(metadata.duration),
        durationSeconds: metadata.duration,
        size: formatSize(metadata.size),
        sizeBytes: metadata.size,
        hasAudio: metadata.hasAudio,
      };

      if (metadata.width && metadata.height) {
        info.resolution = `${metadata.width}x${metadata.height}`;
        info.width = metadata.width;
        info.height = metadata.height;
      }

      if (metadata.fps) {
        info.fps = metadata.fps;
      }

      // 详细模式：调用 ffprobe
      if (detailed) {
        try {
          const probeData = await invoke<FFProbeOutput>("get_full_media_info", {
            ffmpegPath,
            inputPath: path,
          });

          info.format = probeData.format.format_name;
          info.formatLongName = probeData.format.format_long_name;
          info.bitrate = probeData.format.bit_rate;
          info.streams = probeData.streams.map((stream) => {
            const streamInfo: Record<string, any> = {
              type: stream.codec_type,
              codec: stream.codec_name,
            };
            if (stream.codec_type === "video") {
              if (stream.width) streamInfo.width = stream.width;
              if (stream.height) streamInfo.height = stream.height;
              if (stream.bit_rate) streamInfo.bitrate = stream.bit_rate;
              if (stream.r_frame_rate) streamInfo.frameRate = stream.r_frame_rate;
              if (stream.pix_fmt) streamInfo.pixelFormat = stream.pix_fmt;
              if (stream.color_space) streamInfo.colorSpace = stream.color_space;
            } else if (stream.codec_type === "audio") {
              if (stream.sample_rate) streamInfo.sampleRate = stream.sample_rate;
              if (stream.channels) streamInfo.channels = stream.channels;
              if (stream.channel_layout) streamInfo.channelLayout = stream.channel_layout;
              if (stream.bit_rate) streamInfo.bitrate = stream.bit_rate;
            }
            return streamInfo;
          });
        } catch (e) {
          logger.warn("ffprobe 详细信息获取失败，返回基础信息", e);
          info.detailedError = "ffprobe 不可用，仅返回基础信息";
        }
      }

      return JSON.stringify(info, null, 2);
    },
    { userMessage: "获取媒体信息失败" },
  );

  return result ?? JSON.stringify({ success: false, error: "获取媒体信息失败" });
}
