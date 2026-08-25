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
import { BUILTIN_PRESETS } from "../config";
import type { FFmpegParams } from "../types";
import { applyPresetParams } from "../utils/preset";

describe("FFmpeg 内置预设", () => {
  it("提供不添加缩放滤镜的原始分辨率画质预设", () => {
    const preset = BUILTIN_PRESETS.find(
      (item) => item.id === "builtin-quality-only"
    );

    expect(preset).toBeDefined();
    expect(preset?.params.crf).toBe(23);
    expect(preset?.params.videoEncoder).toBe("libx264");
    expect(
      Object.prototype.hasOwnProperty.call(preset?.params ?? {}, "scale")
    ).toBe(true);
    expect(preset?.params.scale).toBeUndefined();

    const params: FFmpegParams = {
      mode: "video",
      inputPath: "input.mp4",
      outputPath: "output.mp4",
      ffmpegPath: "ffmpeg",
      hwaccel: false,
      videoEncoder: "libx265",
      crf: 18,
      videoBitrate: "4000k",
      maxSizeMb: 50,
      scale: "scale=1920:-2",
      fps: 60,
      pixelFormat: "yuv420p10le",
    };

    applyPresetParams(params, preset!.params);

    expect(params).toMatchObject({
      mode: "video",
      hwaccel: true,
      videoEncoder: "libx264",
      preset: "medium",
      crf: 23,
      audioEncoder: "aac",
      audioBitrate: "128k",
    });
    expect(params.scale).toBeUndefined();
    expect(params.videoBitrate).toBeUndefined();
    expect(params.maxSizeMb).toBeUndefined();
    expect(params.fps).toBeUndefined();
  });
});
