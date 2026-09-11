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

import type { FFmpegParams, ProcessingMode } from "../types";
import { quotePowerShellArg } from "./args";

export interface FFmpegExecutionPlan {
  executable: string;
  globalArgs: string[];
  inputArgs: string[];
  inputPath: string;
  outputArgs: string[];
  outputPath: string;
  args: string[];
}

export interface BuildPlanOptions {
  durationSec?: number;
}

export interface VideoQualitySpec {
  label: "crf" | "cq" | "global_quality";
  min: number;
  max: number;
  default: number;
  args(value: number): string[];
}

const FASTSTART_CONTAINERS = new Set(["mp4", "mov", "m4a", "m4v"]);
const NON_FASTSTART_CONTAINERS = new Set([
  "mkv",
  "webm",
  "avi",
  "ts",
  "gif",
  "mp3",
  "flac",
  "wav",
  "opus",
  "ogg",
  "aac",
]);

const X264_PRESETS = new Set([
  "ultrafast",
  "superfast",
  "veryfast",
  "faster",
  "fast",
  "medium",
  "slow",
  "slower",
  "veryslow",
  "placebo",
]);

const NVENC_PRESET_MAP: Record<string, string> = {
  ultrafast: "p1",
  superfast: "p2",
  veryfast: "p3",
  faster: "p4",
  fast: "p4",
  medium: "p5",
  slow: "p6",
  slower: "p7",
  veryslow: "p7",
  placebo: "p7",
};

const NVENC_PRESET_REVERSE: Record<string, string> = {
  p1: "ultrafast",
  p2: "superfast",
  p3: "veryfast",
  p4: "fast",
  p5: "medium",
  p6: "slow",
  p7: "veryslow",
};

function getContainerExtension(outputPath: string): string {
  const base = outputPath.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

function supportsFaststartExtension(ext: string): boolean {
  if (!ext) return true;
  if (NON_FASTSTART_CONTAINERS.has(ext)) return false;
  if (FASTSTART_CONTAINERS.has(ext)) return true;
  return true;
}

function resolveFaststartExtension(
  params: FFmpegParams,
  outputPath: string
): string {
  const explicit = params.container?.trim();
  if (explicit && explicit.toLowerCase() !== "auto") {
    return explicit.replace(/^\./, "").toLowerCase();
  }
  return getContainerExtension(outputPath);
}

/**
 * 按编码器返回可用的质量参数族。NVENC 使用 `-cq`，QSV 使用
 * `-global_quality`，其余按 CRF 处理。
 */
export function resolveVideoQuality(encoder: string): VideoQualitySpec {
  if (encoder.includes("nvenc")) {
    return {
      label: "cq",
      min: 0,
      max: 51,
      default: 23,
      args: (value) => ["-cq", String(value)],
    };
  }

  if (encoder.includes("qsv")) {
    return {
      label: "global_quality",
      min: 1,
      max: 51,
      default: 25,
      args: (value) => ["-global_quality", String(value)],
    };
  }

  if (encoder === "libvpx-vp9") {
    return {
      label: "crf",
      min: 0,
      max: 63,
      default: 31,
      args: (value) => ["-crf", String(value), "-b:v", "0"],
    };
  }

  return {
    label: "crf",
    min: 0,
    max: 51,
    default: encoder.includes("x265") ? 28 : 23,
    args: (value) => ["-crf", String(value)],
  };
}

/**
 * 将通用 preset 名称映射到指定编码器可接受的值。
 */
export function resolveEncoderPreset(
  encoder: string,
  preset?: string
): string | undefined {
  if (!preset) return undefined;

  if (encoder.includes("nvenc")) {
    if (/^p[1-7]$/.test(preset)) return preset;
    return NVENC_PRESET_MAP[preset];
  }

  if (encoder.includes("qsv")) {
    return X264_PRESETS.has(preset) ? preset : undefined;
  }

  return preset;
}

/**
 * 将 NVENC 的 p1..p7 反向映射回 x264 风格 preset，便于编码器切换时保留语义。
 */
export function toX264Preset(preset?: string): string | undefined {
  if (!preset) return undefined;
  return NVENC_PRESET_REVERSE[preset] ?? preset;
}

/**
 * 依据当前参数生成输出侧参数（`-i` 之后、输出路径之前）。
 */
export function buildOutputArgs(
  params: FFmpegParams,
  mode: Exclude<ProcessingMode, "custom">,
  outputPath: string,
  durationSec?: number
): string[] {
  const args: string[] = [];

  if (mode === "extract_audio" || params.videoEncoder === "none") {
    args.push("-vn");
  } else {
    const encoder = params.videoEncoder || "libx264";
    args.push("-c:v", encoder);

    if (encoder !== "copy") {
      const spec = resolveVideoQuality(encoder);
      const hasDuration =
        params.maxSizeMb != null && durationSec != null && durationSec > 0;
      const hasAudio =
        params.audioEncoder !== "none" && params.audioEncoder !== undefined;
      const useBitrate =
        params.qualityMode === "bitrate" ||
        (params.qualityMode !== "quality" && !!params.videoBitrate);

      if (hasDuration) {
        const audioBudget = hasAudio ? 128000 : 0;
        const bitrate = Math.max(
          (params.maxSizeMb! * 8 * 1024 * 1024) / durationSec! - audioBudget,
          200000
        );
        args.push("-b:v", String(Math.round(bitrate)));
      } else if (params.qualityMode === "size") {
        args.push(...spec.args(spec.default));
      } else if (useBitrate) {
        args.push("-b:v", params.videoBitrate || "4000k");
      } else {
        args.push(...spec.args(params.crf ?? spec.default));
      }

      const preset = resolveEncoderPreset(encoder, params.preset);
      if (preset) {
        args.push("-preset", preset);
      }

      args.push("-pix_fmt", params.pixelFormat || "yuv420p");
      if (params.scale && params.scale.trim()) {
        args.push("-vf", params.scale);
      }
      if (params.fps != null) {
        args.push("-r", params.fps.toString());
      }
    }
  }

  if (params.audioEncoder === "none") {
    args.push("-an");
  } else if (params.audioEncoder) {
    args.push("-c:a", params.audioEncoder);

    if (params.audioEncoder !== "copy") {
      if (params.audioBitrate) args.push("-b:a", params.audioBitrate);
      if (params.sampleRate) args.push("-ar", params.sampleRate);
      if (params.audioChannels != null) {
        args.push("-ac", params.audioChannels.toString());
      }
    }
  }

  if (
    mode !== "extract_audio" &&
    supportsFaststartExtension(resolveFaststartExtension(params, outputPath))
  ) {
    args.push("-movflags", "+faststart");
  }

  return args;
}

/**
 * 单一命令构造入口：产出可执行文件、作用域参数与完整 argv。
 */
export function buildExecutionPlan(
  params: FFmpegParams,
  options: BuildPlanOptions = {}
): FFmpegExecutionPlan {
  const executable = params.ffmpegPath?.trim() || "ffmpeg";
  const inputPath = params.inputPath || "input.mp4";
  const outputPath = params.outputPath || "output.mp4";

  const globalArgs = ["-hide_banner"];
  if (params.hwaccel) {
    globalArgs.push("-hwaccel", "auto");
  }
  globalArgs.push("-y");

  const inputArgs: string[] = [];

  const outputArgs =
    params.mode === "custom"
      ? [...(params.customArgs ?? [])]
      : buildOutputArgs(params, params.mode, outputPath, options.durationSec);

  const args = [
    ...globalArgs,
    ...inputArgs,
    "-i",
    inputPath,
    ...outputArgs,
    outputPath,
  ];

  return {
    executable,
    globalArgs,
    inputArgs,
    inputPath,
    outputArgs,
    outputPath,
    args,
  };
}

/**
 * 与 `buildExecutionPlan` 使用同一套输出参数规则，供快捷模式转自定义参数使用。
 */
export function buildQuickCommandArgs(
  params: FFmpegParams,
  mode: Exclude<ProcessingMode, "custom">
): string[] {
  return buildOutputArgs(params, mode, params.outputPath || "output.mp4");
}

function displayQuote(token: string): string {
  if (token === "" || /[\s"]/.test(token)) {
    return `"${token.replace(/"/g, '\\"')}"`;
  }
  return token;
}

/**
 * 展示用命令字符串，包含真实可执行文件和完整输入输出路径。
 */
export function formatPlanCommand(plan: FFmpegExecutionPlan): string {
  return [plan.executable, ...plan.args].map(displayQuote).join(" ");
}

/**
 * 面向 PowerShell 的可运行命令，使用 `&` 调用运算符与单引号字面量。
 */
export function formatPowerShellCommand(plan: FFmpegExecutionPlan): string {
  const tokens = [plan.executable, ...plan.args].map(quotePowerShellArg);
  return `& ${tokens.join(" ")}`;
}
