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
  splitFileName,
  buildAutoOutputName,
  resolveContainer,
  containerCompatibilityWarning,
  detectCustomFormatArg,
  sanitizeOutputName,
  makeUniqueName,
  truncateFileName,
} from "../utils/naming";
import type { NamingContext } from "../utils/naming";

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

function baseContext(overrides: Partial<NamingContext> = {}): NamingContext {
  return {
    inputFileName: "clip.mp4",
    sourceContainer: "mp4",
    ...overrides,
  };
}

describe("splitFileName", () => {
  it("处理无扩展名", () => {
    expect(splitFileName("movie")).toEqual({ base: "movie", ext: "" });
  });

  it("处理多点文件名", () => {
    expect(splitFileName("a.b.c.mp4")).toEqual({ base: "a.b.c", ext: "mp4" });
  });

  it("处理点开头文件", () => {
    expect(splitFileName(".bashrc")).toEqual({
      base: ".bashrc",
      ext: "",
    });
  });

  it("处理结尾点", () => {
    expect(splitFileName("name.")).toEqual({ base: "name", ext: "" });
  });
});

describe("resolveContainer", () => {
  it("显式 container 优先并规范化", () => {
    expect(
      resolveContainer(baseParams({ container: ".MKV" }), baseContext())
    ).toBe("mkv");
  });

  it("音频提取流拷贝按源音频编码映射", () => {
    expect(
      resolveContainer(
        baseParams({ mode: "extract_audio", audioEncoder: "copy" }),
        baseContext({ sourceAudioCodec: "aac" })
      )
    ).toBe("m4a");
  });

  it("音频提取重编码按编码器映射", () => {
    expect(
      resolveContainer(
        baseParams({ mode: "extract_audio", audioEncoder: "libopus" }),
        baseContext()
      )
    ).toBe("ogg");
  });

  it("视频流拷贝沿用源容器", () => {
    expect(
      resolveContainer(
        baseParams({ videoEncoder: "copy" }),
        baseContext({ sourceContainer: "mov" })
      )
    ).toBe("mov");
  });

  it("视频重编码默认 mp4", () => {
    expect(
      resolveContainer(baseParams({ videoEncoder: "libx264" }), baseContext())
    ).toBe("mp4");
  });

  it("自定义模式映射 -f 格式", () => {
    expect(
      resolveContainer(
        baseParams({ mode: "custom", customArgs: ["-f", "matroska"] }),
        baseContext()
      )
    ).toBe("mkv");
  });

  it("显式 container 覆盖模式推导", () => {
    expect(
      resolveContainer(
        baseParams({
          mode: "extract_audio",
          audioEncoder: "copy",
          container: "mp3",
        }),
        baseContext({ sourceAudioCodec: "aac" })
      )
    ).toBe("mp3");
  });
});

describe("buildAutoOutputName", () => {
  it("默认追加 _processed", () => {
    expect(buildAutoOutputName(baseParams(), baseContext())).toBe(
      "clip_processed.mp4"
    );
  });

  it("智能命名包含音频码率且 NVENC 使用 cq", () => {
    const name = buildAutoOutputName(
      baseParams({
        appendParamsToName: true,
        videoEncoder: "h264_nvenc",
        crf: 23,
        audioEncoder: "aac",
        audioBitrate: "192k",
      }),
      baseContext()
    );

    expect(name).toContain("cq23");
    expect(name).toContain("192k");
    expect(name).toBe("clip_h264_nvenc_cq23_aac_192k.mp4");
  });

  it("音频提取流拷贝按源编码生成 m4a", () => {
    expect(
      buildAutoOutputName(
        baseParams({ mode: "extract_audio", audioEncoder: "copy" }),
        baseContext({ sourceAudioCodec: "aac" })
      )
    ).toBe("clip_processed.m4a");
  });

  it("视频流拷贝保留源容器", () => {
    expect(
      buildAutoOutputName(
        baseParams({ videoEncoder: "copy" }),
        baseContext({ sourceContainer: "mov" })
      )
    ).toBe("clip_processed.mov");
  });

  it("显式 container 决定输出后缀", () => {
    expect(
      buildAutoOutputName(
        baseParams({ container: "mkv", videoEncoder: "libx264" }),
        baseContext()
      )
    ).toBe("clip_processed.mkv");
  });
});

describe("makeUniqueName", () => {
  it("按数字后缀递增直到可用", () => {
    const existing = new Set(["clip.mp4", "clip_1.mp4"]);
    expect(makeUniqueName("clip.mp4", (name) => existing.has(name))).toBe(
      "clip_2.mp4"
    );
  });

  it("全部占用时返回最后一个候选", () => {
    expect(makeUniqueName("clip.mp4", () => true)).toBe("clip_100.mp4");
  });

  it("无冲突时保持原名", () => {
    expect(makeUniqueName("clip.mp4", () => false)).toBe("clip.mp4");
  });
});

describe("sanitizeOutputName", () => {
  it("移除路径分隔符与 Windows 非法字符", () => {
    expect(sanitizeOutputName("my/vid:eo*.mp4")).toBe("myvideo.mp4");
    expect(sanitizeOutputName("C:\\out\\a?b.mp4")).toBe("Coutab.mp4");
  });

  it("空值回退为 output", () => {
    expect(sanitizeOutputName("   ")).toBe("output");
    expect(sanitizeOutputName("<>")).toBe("output");
  });

  it("超长文件名被截断且保留扩展名", () => {
    const longName = `${"a".repeat(400)}.mp4`;
    expect(truncateFileName(longName).length).toBeLessThanOrEqual(200);
    expect(truncateFileName(longName).endsWith(".mp4")).toBe(true);
    expect(truncateFileName("short.mp4")).toBe("short.mp4");
  });
});

describe("detectCustomFormatArg", () => {
  it("识别 -f 后的 token", () => {
    expect(detectCustomFormatArg(["-f", "matroska"])).toBe("matroska");
  });

  it("识别 -c:v gif", () => {
    expect(detectCustomFormatArg(["-c:v", "gif"])).toBe("gif");
  });

  it("无格式参数返回 null", () => {
    expect(detectCustomFormatArg(["-crf", "23"])).toBeNull();
    expect(detectCustomFormatArg(undefined)).toBeNull();
  });
});

describe("containerCompatibilityWarning", () => {
  it("mp4 中的无损音频给出警告", () => {
    expect(
      containerCompatibilityWarning(baseParams({ audioEncoder: "flac" }), "mp4")
    ).not.toBeNull();
  });

  it("mkv 无需警告", () => {
    expect(
      containerCompatibilityWarning(baseParams({ audioEncoder: "flac" }), "mkv")
    ).toBeNull();
  });

  it("纯音频容器承载视频流时给出警告", () => {
    expect(
      containerCompatibilityWarning(
        baseParams({ mode: "video", videoEncoder: "libx264" }),
        "mp3"
      )
    ).not.toBeNull();
  });

  it("音频提取选择 GIF 容器给出警告", () => {
    expect(
      containerCompatibilityWarning(
        baseParams({ mode: "extract_audio", audioEncoder: "aac" }),
        "gif"
      )
    ).not.toBeNull();
  });
});
