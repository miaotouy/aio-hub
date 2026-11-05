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

import fs from "node:fs/promises";
import path from "node:path";
import { filePath } from "./filesystem";
interface FrameHost {
  signal: AbortSignal;
  check(): void;
  metadata(
    executable: string,
    input: string
  ): Promise<{ width: number | null; height: number | null }>;
  execute(executable: string, argv: string[]): Promise<void>;
  emit(event: string, payload: Record<string, unknown>): void;
}
function time(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(label + "无效");
  return value;
}
/** Files are announced only after two stable observations, or after FFmpeg closes. */
export async function extractVideoFrames(
  args: Record<string, unknown>,
  host: FrameHost
): Promise<number> {
  const input = filePath(args.inputPath, undefined, {}),
    directory = filePath(args.outputDir, undefined, {});
  if (
    typeof args.ffmpegPath !== "string" ||
    !args.ffmpegPath.trim() ||
    args.ffmpegPath.includes("\0")
  )
    throw new Error("FFmpeg 程序路径无效");
  if (!(await fs.stat(input)).isFile()) throw new Error("视频输入需为媒体文件");
  const start = time(args.startMs, "开始时间"),
    end = time(args.endMs, "结束时间"),
    interval = time(args.intervalMs, "抽帧间隔");
  if (end < start || !interval) throw new Error("抽帧时间范围或间隔无效");
  const expected = Math.floor((end - start) / interval) + 1;
  if (expected > 100000)
    throw new Error("单次抽帧最多 100000 帧，请缩小时间范围或增大间隔");
  await fs.mkdir(directory, { recursive: true });
  const frameName = /^frame_\d{8}\.jpg$/;
  if ((await fs.readdir(directory)).some((name) => frameName.test(name)))
    throw new Error("视频帧目录已有抽帧文件，请选择空目录");
  const filters = ["fps=1/" + interval / 1000];
  if (args.roi != null) {
    const roi = args.roi as Record<string, unknown>;
    if (
      typeof roi !== "object" ||
      [roi.x, roi.y, roi.width, roi.height].some(
        (v) => typeof v !== "number" || !Number.isFinite(v)
      )
    )
      throw new Error("视频裁剪区域无效");
    const metadata = await host.metadata(args.ffmpegPath, input),
      w = metadata.width,
      h = metadata.height;
    if (!w || !h) throw new Error("无法读取视频尺寸，无法应用字幕区域裁剪");
    const x = Math.min(0.99, Math.max(0, roi.x as number)),
      y = Math.min(0.99, Math.max(0, roi.y as number));
    const width = Math.min(1 - x, Math.max(0.01, roi.width as number)),
      height = Math.min(1 - y, Math.max(0.01, roi.height as number));
    const left = Math.min(w - 1, Math.floor(x * w)),
      top = Math.min(h - 1, Math.floor(y * h));
    let cropW = Math.min(w - left, Math.max(1, Math.floor(width * w))),
      cropH = Math.min(h - top, Math.max(1, Math.floor(height * h)));
    if (cropW > 1) cropW -= cropW % 2;
    if (cropH > 1) cropH -= cropH % 2;
    filters.push(`crop=${cropW}:${cropH}:${left}:${top}`);
  }
  host.check();
  const argv = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    (start / 1000).toFixed(3),
    "-i",
    input,
    "-t",
    Math.max(0.001, (end - start + 1) / 1000).toFixed(3),
    "-vf",
    filters.join(","),
    "-vsync",
    "vfr",
    "-frames:v",
    String(expected),
    "-q:v",
    "2",
    "-y",
    path.join(directory, "frame_%08d.jpg"),
  ];
  let emitted = 0;
  const sizes = new Map<string, number>();
  const scan = async (stable: boolean): Promise<void> => {
    if (host.signal.aborted) return;
    const files = (await fs.readdir(directory, { withFileTypes: true }))
      .filter((e) => e.isFile() && frameName.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    while (emitted < files.length) {
      host.check();
      const framePath = path.join(directory, files[emitted].name),
        info = await fs.stat(framePath);
      if (!info.size) break;
      const same = sizes.get(framePath) === info.size;
      sizes.set(framePath, info.size);
      if (!stable && !same) break;
      const timestampMs = Math.min(end, start + emitted * interval);
      host.emit("video-ocr-frame", { framePath, timestampMs });
      emitted++;
      host.emit("video-ocr-progress", {
        phase: "extracting",
        extracted: emitted,
        ocrCompleted: 0,
        total: expected,
        currentTimeMs: timestampMs,
        percent: (emitted / expected) * 100,
        error: null,
      });
    }
  };
  let polling: Promise<void> | undefined, pollFailure: unknown;
  const timer = setInterval(() => {
    if (polling || pollFailure || host.signal.aborted) return;
    polling = scan(false)
      .catch((error) => {
        pollFailure = error;
      })
      .finally(() => {
        polling = undefined;
      });
  }, 100);
  try {
    await host.execute(args.ffmpegPath, argv);
    clearInterval(timer);
    await polling;
    if (pollFailure) throw pollFailure;
    host.check();
    await scan(true);
    host.emit("video-ocr-progress", {
      phase: "ocr",
      extracted: emitted,
      ocrCompleted: 0,
      total: emitted,
      currentTimeMs: end,
      percent: emitted ? 0 : 100,
      error: null,
    });
    return emitted;
  } catch (error) {
    if (!host.signal.aborted)
      host.emit("video-ocr-progress", {
        phase: "error",
        extracted: emitted,
        ocrCompleted: 0,
        total: emitted,
        currentTimeMs: start,
        percent: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    throw error;
  } finally {
    clearInterval(timer);
    await polling;
  }
}
