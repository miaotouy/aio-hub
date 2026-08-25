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

import { describe, expect, it } from "vitest";
import type { FFmpegParams } from "../types";
import { buildQuickCommandArgs } from "../utils/command";

describe("FFmpeg 快捷配置转自定义参数", () => {
  it("应生成与快捷视频配置等效的自定义参数", () => {
    const params: FFmpegParams = {
      mode: "video",
      inputPath: "input.mp4",
      outputPath: "output.mp4",
      ffmpegPath: "ffmpeg",
      hwaccel: true,
      videoEncoder: "libx264",
      preset: "slow",
      crf: 20,
      scale: "scale=1920:-2",
      fps: 30,
      pixelFormat: "yuv420p",
      audioEncoder: "aac",
      audioBitrate: "192k",
      sampleRate: "48000",
      audioChannels: 2,
    };

    expect(buildQuickCommandArgs(params, "video")).toEqual([
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-preset",
      "slow",
      "-vf",
      "scale=1920:-2",
      "-r",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
    ]);
  });

  it("音频提取模式不添加视频或 faststart 参数", () => {
    const params: FFmpegParams = {
      mode: "extract_audio",
      inputPath: "input.mp4",
      outputPath: "output.m4a",
      ffmpegPath: "ffmpeg",
      hwaccel: false,
      audioEncoder: "aac",
      audioBitrate: "320k",
    };

    expect(buildQuickCommandArgs(params, "extract_audio")).toEqual([
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      "320k",
    ]);
  });
});
