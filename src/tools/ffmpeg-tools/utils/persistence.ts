import { createConfigManager } from "@/utils/configManager";
import type { FFmpegTask, FFmpegConfig, FFmpegPreset } from "../types";
import { DEFAULT_FFMPEG_CONFIG } from "../config";
import { merge } from "lodash-es";

/**
 * FFmpeg 服务配置持久化管理器
 */
export const ffmpegConfigManager = createConfigManager<FFmpegConfig>({
  moduleName: "ffmpeg-tools",
  fileName: "config.json",
  createDefault: () => ({ ...DEFAULT_FFMPEG_CONFIG }),
  mergeConfig: (defaultConfig, loadedConfig) => {
    return merge({}, defaultConfig, loadedConfig);
  },
});

/**
 * FFmpeg 任务持久化管理器
 */
export const ffmpegTasksManager = createConfigManager<{ list: FFmpegTask[] }>({
  moduleName: "ffmpeg-tools",
  fileName: "tasks.json",
  createDefault: () => ({ list: [] }),
});

/**
 * FFmpeg 预设持久化管理器
 * 存储用户自定义预设 (系统预设不会持久化)
 */
export const ffmpegPresetsManager = createConfigManager<{ list: FFmpegPreset[] }>({
  moduleName: "ffmpeg-tools",
  fileName: "presets.json",
  createDefault: () => ({ list: [] }),
});
