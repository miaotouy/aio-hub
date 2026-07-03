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
export const ffmpegPresetsManager = createConfigManager<{
  list: FFmpegPreset[];
}>({
  moduleName: "ffmpeg-tools",
  fileName: "presets.json",
  createDefault: () => ({ list: [] }),
});
