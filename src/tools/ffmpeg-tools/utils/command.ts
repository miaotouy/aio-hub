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

type QuickProcessingMode = Exclude<ProcessingMode, "custom">;

/**
 * 根据快捷配置生成可直接放入自定义命令编辑器的 FFmpeg 参数。
 * 不包含 `ffmpeg`、硬件解码、输入路径和输出路径，它们由编辑器外层统一处理。
 */
export function buildQuickCommandArgs(
  params: FFmpegParams,
  mode: QuickProcessingMode
): string[] {
  const args: string[] = [];

  if (mode === "extract_audio" || params.videoEncoder === "none") {
    args.push("-vn");
  } else {
    const videoEncoder = params.videoEncoder || "libx264";
    args.push("-c:v", videoEncoder);

    if (params.crf !== undefined) {
      args.push("-crf", params.crf.toString());
    } else if (!params.videoBitrate && !params.maxSizeMb) {
      args.push("-crf", videoEncoder.includes("x265") ? "28" : "23");
    }

    if (params.videoBitrate) args.push("-b:v", params.videoBitrate);
    if (params.preset) args.push("-preset", params.preset);
    if (params.scale) args.push("-vf", params.scale);
    if (params.fps) args.push("-r", params.fps.toString());

    if (videoEncoder !== "copy") {
      args.push("-pix_fmt", params.pixelFormat || "yuv420p");
    }
  }

  if (params.audioEncoder === "none") {
    args.push("-an");
  } else if (params.audioEncoder) {
    args.push("-c:a", params.audioEncoder);
  }

  if (params.audioEncoder !== "copy" && params.audioEncoder !== "none") {
    if (params.audioBitrate) args.push("-b:a", params.audioBitrate);
    if (params.sampleRate) args.push("-ar", params.sampleRate);
    if (params.audioChannels) args.push("-ac", params.audioChannels.toString());
  }

  if (mode !== "extract_audio") {
    args.push("-movflags", "+faststart");
  }

  return args;
}
