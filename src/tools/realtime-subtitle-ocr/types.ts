// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 实时字幕 OCR - 类型定义
 */

/** 字幕条目 */
export interface SubtitleEntry {
  id: string;
  text: string;
  /** 开始时间戳（毫秒，相对于监控开始时刻） */
  startMs: number;
  /** 结束时间戳（毫秒，相对于监控开始时刻） */
  endMs: number;
  /** 截图的 Object URL，用于在表格中预览和人工修正 */
  frameUrl?: string;
  /** 识别状态：'pending' | 'processing' | 'done' | 'error' */
  status?: "pending" | "processing" | "done" | "error";
}

/** 监控框几何信息（逻辑坐标） */
export interface MonitorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 去重灵敏度档位 */
export type DedupSensitivity = "high" | "medium" | "low";

/** OCR 图像滤镜预设 */
export type ImageFilterPreset =
  | "original"
  | "grayscale-enhanced"
  | "high-contrast-binary"
  | "inverted-binary"
  | "custom";

/** OCR 输入图像滤镜配置 */
export interface ImageFilterConfig {
  preset: ImageFilterPreset;
  grayscale: boolean;
  /** -100 ~ 100 */
  brightness: number;
  /** -100 ~ 100 */
  contrast: number;
  /** -100 ~ 100 */
  saturation: number;
  /** -180 ~ 180 */
  hue: number;
  invert: boolean;
  binarize: boolean;
  /** 0 ~ 255 */
  threshold: number;
}

type BuiltInImageFilterPreset = Exclude<ImageFilterPreset, "custom">;

const IMAGE_FILTER_PRESET_VALUES: Record<
  BuiltInImageFilterPreset,
  Omit<ImageFilterConfig, "preset">
> = {
  original: {
    grayscale: false,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    hue: 0,
    invert: false,
    binarize: false,
    threshold: 128,
  },
  "grayscale-enhanced": {
    grayscale: true,
    brightness: 0,
    contrast: 20,
    saturation: 0,
    hue: 0,
    invert: false,
    binarize: false,
    threshold: 128,
  },
  "high-contrast-binary": {
    grayscale: true,
    brightness: 0,
    contrast: 30,
    saturation: 0,
    hue: 0,
    invert: false,
    binarize: true,
    threshold: 160,
  },
  "inverted-binary": {
    grayscale: true,
    brightness: 0,
    contrast: 30,
    saturation: 0,
    hue: 0,
    invert: true,
    binarize: true,
    threshold: 160,
  },
};

/** 返回预设的独立配置对象，调用方可安全修改。 */
export function createImageFilterPreset(
  preset: BuiltInImageFilterPreset = "original"
): ImageFilterConfig {
  return { preset, ...IMAGE_FILTER_PRESET_VALUES[preset] };
}

/** 默认不改变 OCR 输入图片。 */
export function createDefaultImageFilterConfig(): ImageFilterConfig {
  return createImageFilterPreset("original");
}

/** 监控运行状态 */
export type MonitorStatus = "idle" | "running" | "stopped";

/** 监控配置 */
export interface MonitorConfig {
  /** 采样间隔（毫秒） */
  intervalMs: number;
  /** 去重灵敏度（决定 aHash 汉明距离阈值） */
  dedupSensitivity: DedupSensitivity;
  /** OCR 引擎配置 */
  engineConfig: import("@/tools/smart-ocr/types").OcrEngineConfig;
  /** 在发送 OCR 前应用到截图的图像滤镜 */
  imageFilter: ImageFilterConfig;
}
