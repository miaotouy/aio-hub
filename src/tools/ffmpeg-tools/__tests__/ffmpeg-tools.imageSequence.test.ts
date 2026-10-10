// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  discoverImageSequences,
  getImageSequenceRange,
} from "../utils/imageSequence";
import {
  buildExecutionPlan,
  formatPowerShellCommand,
} from "../utils/executionPlan";
import type { FFmpegParams } from "../types";

const params: FFmpegParams = {
  mode: "video",
  inputPath: "",
  outputPath: "D:/输出/render.mp4",
  ffmpegPath: "D:/ffmpeg.exe",
  hwaccel: false,
  videoEncoder: "libx264",
  qualityMode: "quality",
  crf: 18,
  preset: "medium",
  pixelFormat: "yuv420p",
};

// 保护文件识别、连续范围与实际多输入命令契约；与普通重编码测试互补。
describe("image sequence discovery and ranges", () => {
  it("按编号排序 Blender 补零序列，并分离视角和图像格式", () => {
    const sequences = discoverImageSequences([
      "render_0012.png",
      "render_0010.png",
      "render_0011.png",
      "render_0010.exr",
      "render_0010_right.png",
      "README.md",
      "cover.png",
    ]);
    expect(sequences.map((s) => s.pattern)).toEqual(
      expect.arrayContaining([
        "render_%04d.png",
        "render_%04d.exr",
        "render_%04d_right.png",
      ])
    );
    const sequence = sequences.find((s) => s.pattern === "render_%04d.png")!;
    expect(sequence.frames.map((f) => f.number)).toEqual([10, 11, 12]);
    expect(getImageSequenceRange(sequence, 11, 12)).toEqual({
      frameCount: 2,
      firstFileName: "render_0011.png",
    });
  });
  it("跨位数边界保持补零序列，同时支持无补零编号", () => {
    const padded = discoverImageSequences(["0999.png", "1000.png", "1001.png"]);
    expect(padded).toHaveLength(1);
    expect(padded[0].pattern).toBe("%04d.png");
    expect(getImageSequenceRange(padded[0], 999, 1001).frameCount).toBe(3);
    const plain = discoverImageSequences([
      "frame9.jpg",
      "frame10.jpg",
      "frame11.jpg",
    ]);
    expect(plain[0].pattern).toBe("frame%d.jpg");
    expect(getImageSequenceRange(plain[0], 9, 11).frameCount).toBe(3);
  });
  it("缺帧、缺失端点和非法范围给出可定位错误，完整子范围仍可合成", () => {
    const [sequence] = discoverImageSequences([
      "0001.png",
      "0002.png",
      "0004.png",
    ]);
    expect(() => getImageSequenceRange(sequence, 1, 4)).toThrow("缺少 1 帧：3");
    expect(() => getImageSequenceRange(sequence, 0, 5)).toThrow("0、3、5");
    expect(() => getImageSequenceRange(sequence, 2, 1)).toThrow("起止帧编号");
    expect(() => getImageSequenceRange(sequence, 1.5, 4)).toThrow("起止帧编号");
    expect(getImageSequenceRange(sequence, 1, 2).frameCount).toBe(2);
  });
  it("大范围缺帧只列出有限编号，避免巨量遍历", () => {
    const [sequence] = discoverImageSequences(["0001.png"]);
    expect(() => getImageSequenceRange(sequence, 1, 2147483647)).toThrow(
      "缺少 2147483646 帧：2、3、4、5、6、7、8、9…"
    );
  });
});

describe("image sequence execution plan", () => {
  const [sequence] = discoverImageSequences([
    "shot_0100.png",
    "shot_0101.png",
    "shot_0102.png",
  ]);
  const input = {
    directory: "D:/渲染 帧",
    sequence,
    startFrame: 101,
    endFrame: 102,
    frameRate: 29.97,
  };
  it("按选定起始帧、输入帧率与帧数构造静音视频并提供准确进度时长", () => {
    const plan = buildExecutionPlan(params, { imageSequence: input });
    expect(plan.inputPath).toBe("D:/渲染 帧/shot_0101.png");
    expect(plan.args.slice(0, 15)).toEqual([
      "-hide_banner",
      "-y",
      "-f",
      "image2",
      "-pattern_type",
      "sequence",
      "-framerate",
      "29.97",
      "-start_number",
      "101",
      "-start_number_range",
      "1",
      "-i",
      "D:/渲染 帧/shot_%04d.png",
      "-map",
    ]);
    expect(plan.outputArgs).toContain("-an");
    expect(plan.outputArgs.slice(-4)).toEqual([
      "-frames:v",
      "2",
      "-t",
      String(2 / 29.97),
    ]);
    expect(plan.totalDuration).toBeCloseTo(2 / 29.97);
    expect(plan.args[plan.args.length - 1]).toBe(params.outputPath);
  });
  it.each(["D:/背景音乐.wav", "D:/参考视频.mp4"])(
    "外部配音 %s 只取音轨，保留序列画面并补静音",
    (audioPath) => {
      const plan = buildExecutionPlan(params, {
        imageSequence: { ...input, audioPath },
      });
      const secondInput = plan.args.lastIndexOf("-i");
      expect(plan.args[secondInput + 1]).toBe(audioPath);
      expect(plan.outputArgs.slice(0, 4)).toEqual([
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
      ]);
      expect(plan.outputArgs[plan.outputArgs.indexOf("-c:a") + 1]).toBe("aac");
      expect(plan.outputArgs[plan.outputArgs.indexOf("-af") + 1]).toBe("apad");
    }
  );
  it("转义编号模板中的百分号，实际输入路径与 PowerShell 引用保留原始字符", () => {
    const [special] = discoverImageSequences(["shot%_0001.png"]);
    const plan = buildExecutionPlan(params, {
      imageSequence: {
        directory: "D:/100%/it's frames",
        sequence: special,
        startFrame: 1,
        endFrame: 1,
        frameRate: 24,
      },
    });
    expect(plan.inputPath).toBe("D:/100%/it's frames/shot%_0001.png");
    expect(plan.args[plan.args.indexOf("-i") + 1]).toBe(
      "D:/100%%/it's frames/shot%%_%04d.png"
    );
    expect(formatPowerShellCommand(plan)).toContain(
      "'D:/100%%/it''s frames/shot%%_%04d.png'"
    );
  });
  it("拒绝无效帧率和流拷贝，避免输出无法播放的图像封装", () => {
    expect(() =>
      buildExecutionPlan(params, { imageSequence: { ...input, frameRate: 0 } })
    ).toThrow("帧率");
    expect(() =>
      buildExecutionPlan(params, {
        imageSequence: { ...input, frameRate: NaN },
      })
    ).toThrow("帧率");
    expect(() =>
      buildExecutionPlan(
        { ...params, videoEncoder: "copy" },
        { imageSequence: input }
      )
    ).toThrow("视频编码器");
  });
});
