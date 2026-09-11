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
import {
  buildExecutionPlan,
  buildQuickCommandArgs,
  formatPowerShellCommand,
} from "../utils/executionPlan";
import { parseCommandLine, serializeCommandLine } from "../utils/args";

function baseParams(overrides: Partial<FFmpegParams> = {}): FFmpegParams {
  return {
    mode: "video",
    inputPath: "C:/videos/in.mp4",
    outputPath: "C:/videos/out.mp4",
    ffmpegPath: "C:/bin/ffmpeg.exe",
    hwaccel: true,
    ...overrides,
  };
}

describe("buildExecutionPlan", () => {
  it("生成完整视频计划的全局参数与输出参数", () => {
    const plan = buildExecutionPlan(
      baseParams({
        videoEncoder: "libx264",
        preset: "slow",
        crf: 20,
        qualityMode: "quality",
        scale: "scale=1920:-2",
        fps: 30,
        pixelFormat: "yuv420p",
        audioEncoder: "aac",
        audioBitrate: "192k",
        sampleRate: "48000",
        audioChannels: 2,
      })
    );

    expect(plan.executable).toBe("C:/bin/ffmpeg.exe");
    expect(plan.inputPath).toBe("C:/videos/in.mp4");
    expect(plan.outputPath).toBe("C:/videos/out.mp4");
    expect(plan.globalArgs).toEqual(["-hide_banner", "-hwaccel", "auto", "-y"]);
    expect(plan.inputArgs).toEqual([]);
    expect(plan.args).toEqual([
      "-hide_banner",
      "-hwaccel",
      "auto",
      "-y",
      "-i",
      "C:/videos/in.mp4",
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-preset",
      "slow",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=1920:-2",
      "-r",
      "30",
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
      "C:/videos/out.mp4",
    ]);
  });

  it("音频提取只输出音频且不添加 faststart", () => {
    const plan = buildExecutionPlan(
      baseParams({
        mode: "extract_audio",
        outputPath: "C:/videos/out.m4a",
        hwaccel: false,
        videoEncoder: "none",
        audioEncoder: "aac",
        audioBitrate: "320k",
      })
    );

    expect(plan.args).toContain("-vn");
    expect(plan.args).not.toContain("-c:v");
    expect(plan.args).not.toContain("-movflags");
    expect(plan.args).toEqual([
      "-hide_banner",
      "-y",
      "-i",
      "C:/videos/in.mp4",
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      "320k",
      "C:/videos/out.m4a",
    ]);
  });

  it("流拷贝不生成质量、预设、像素格式参数", () => {
    const plan = buildExecutionPlan(
      baseParams({
        hwaccel: false,
        videoEncoder: "copy",
        audioEncoder: "copy",
      })
    );

    expect(plan.args).toEqual(
      expect.arrayContaining(["-c:v", "copy", "-c:a", "copy"])
    );
    expect(plan.args).not.toContain("-crf");
    expect(plan.args).not.toContain("-preset");
    expect(plan.args).not.toContain("-pix_fmt");
    expect(plan.args).toContain("-movflags");
  });

  it("不兼容容器不添加 faststart", () => {
    const plan = buildExecutionPlan(
      baseParams({
        outputPath: "C:/videos/out.mkv",
        videoEncoder: "libx264",
        audioEncoder: "aac",
      })
    );

    expect(plan.args).not.toContain("-movflags");
  });

  it("NVENC 使用 cq 而非 crf，并将 preset 映射到 p 值", () => {
    const plan = buildExecutionPlan(
      baseParams({
        videoEncoder: "h264_nvenc",
        preset: "slow",
        crf: 25,
        qualityMode: "quality",
        audioEncoder: "aac",
      })
    );

    expect(plan.args).toEqual(expect.arrayContaining(["-cq", "25"]));
    expect(plan.args).not.toContain("-crf");
    expect(plan.args).toEqual(expect.arrayContaining(["-preset", "p6"]));
  });

  it("码率模式生成 -b:v 且不生成 -crf", () => {
    const plan = buildExecutionPlan(
      baseParams({
        videoEncoder: "libx264",
        qualityMode: "bitrate",
        videoBitrate: "4000k",
        audioEncoder: "aac",
      })
    );

    expect(plan.args).toEqual(expect.arrayContaining(["-b:v", "4000k"]));
    expect(plan.args).not.toContain("-crf");
  });

  it("目标体积模式结合时长计算 -b:v 且不生成 -crf", () => {
    const plan = buildExecutionPlan(
      baseParams({
        videoEncoder: "libx264",
        qualityMode: "size",
        maxSizeMb: 50,
      }),
      { durationSec: 100 }
    );

    expect(plan.args).toEqual(expect.arrayContaining(["-b:v", "4194304"]));
    expect(plan.args).not.toContain("-crf");
  });
});

describe("formatPowerShellCommand", () => {
  it("使用 & 调用运算符并正确引用含空格与单引号的路径", () => {
    const plan = buildExecutionPlan(
      baseParams({
        inputPath: "C:/my videos/in's.mp4",
        outputPath: "C:/out/out.mp4",
        videoEncoder: "libx264",
      })
    );

    const command = formatPowerShellCommand(plan);

    expect(command.startsWith("& ")).toBe(true);
    expect(command).toContain("'C:/bin/ffmpeg.exe'");
    expect(command).toContain("'C:/my videos/in''s.mp4'");
    expect(command).toContain("'C:/out/out.mp4'");
  });
});

describe("命令解析与序列化", () => {
  it("去掉外层引号并保留空格与转义引号", () => {
    expect(
      parseCommandLine(String.raw`"C:\Program Files\ffmpeg.exe" -i "in.mp4"`)
    ).toEqual([String.raw`C:\Program Files\ffmpeg.exe`, "-i", "in.mp4"]);

    expect(parseCommandLine('a "b\\"c" d')).toEqual(["a", 'b"c', "d"]);
    expect(parseCommandLine("")).toEqual([]);
  });

  it("滤镜表达式保持为单个 token", () => {
    expect(
      parseCommandLine(String.raw`-vf "drawtext=text='Hello World':x=10"`)
    ).toEqual(["-vf", "drawtext=text='Hello World':x=10"]);
  });

  it("序列化后仍可还原原始 argv", () => {
    const tokens = [
      "-vf",
      "drawtext=text='a b':x=1",
      String.raw`C:\Program Files\ffmpeg.exe`,
      "",
      'a"b',
      "$(x)",
      "plain",
    ];

    expect(parseCommandLine(serializeCommandLine(tokens))).toEqual(tokens);
  });
});

describe("buildQuickCommandArgs", () => {
  it("仅返回输出作用域参数，不包含可执行文件、输入与输出路径", () => {
    const params = baseParams({
      videoEncoder: "libx264",
      crf: 23,
      qualityMode: "quality",
      audioEncoder: "aac",
    });

    expect(buildQuickCommandArgs(params, "video")).toEqual([
      "-c:v",
      "libx264",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
    ]);
  });
});
