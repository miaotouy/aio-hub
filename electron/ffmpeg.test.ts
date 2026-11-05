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
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FFmpegProcesses, FFMPEG_CANCELLED } from "./ffmpeg";
import { extractVideoFrames } from "./ffmpeg-frames";
let root: string, service: FFmpegProcesses;
const events: { owner: number; event: string; payload: any }[] = [];
const fixture = path.resolve("electron/fixtures/ffmpeg-process.cjs");
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "aio-ffmpeg-"));
  events.length = 0;
  service = new FFmpegProcesses({
    emit: (owner, event, payload) => {
      events.push({ owner, event, payload });
      return true;
    },
  });
  await fs.writeFile(path.join(root, "input media.txt"), "input");
});
afterEach(async () => {
  await service.shutdown();
  await fs.rm(root, { recursive: true, force: true });
});
function plan(name: string, flags: string[] = []) {
  const output = path.join(root, name + ".output");
  return {
    executable: process.execPath,
    inputPath: path.join(root, "input media.txt"),
    outputPath: output,
    args: [fixture, ...flags, output],
    totalDuration: 2,
  };
}
async function waitForFile(file: string): Promise<string> {
  for (let n = 0; n < 150; n++) {
    try {
      return await fs.readFile(file, "utf8");
    } catch {
      await delay(20);
    }
  }
  throw new Error("Fixture did not publish " + path.basename(file));
}
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
describe("FFmpeg host process contract", () => {
  it("preserves argv and output while decoding chunked logs and delivering finite progress through 100 only on success", async () => {
    const p = plan("spaces & 'quotes'");
    const result = await service.run(1, "run_ffmpeg_plan", {
      taskId: "convert",
      plan: p,
    });
    expect(result).toBe(p.outputPath);
    expect(await fs.readFile(p.outputPath, "utf8")).toBe(
      "converted media fixture"
    );
    expect(
      JSON.parse(await fs.readFile(p.outputPath + ".argv.json", "utf8"))
    ).toEqual(["-progress", "pipe:1", "-nostats", p.outputPath]);
    expect(
      events
        .filter((e) => e.event === "ffmpeg-log")
        .map((e) => e.payload.message)
    ).toContain("编码启动");
    const progress = events
      .filter((e) => e.event === "ffmpeg-progress")
      .map((e) => e.payload.progress);
    expect(progress[0]).toMatchObject({
      percent: 75,
      currentTime: 1.5,
      speed: "2.0x",
      bitrate: "128kbits/s",
      totalDuration: 2,
    });
    expect(progress.at(-1)).toMatchObject({ percent: 100, currentTime: 2 });
    expect(
      events.every((e) => e.owner === 1 && e.payload.taskId === "convert")
    ).toBe(true);
    expect(service.hasPendingOperations).toBe(false);
  });
  it("returns nonzero and spawn failures without publishing a successful completion", async () => {
    await expect(
      service.run(1, "run_ffmpeg_plan", {
        taskId: "bad",
        plan: plan("failed", ["--fail"]),
      })
    ).rejects.toThrow("controlled encoder failure");
    await expect(
      service.run(1, "run_ffmpeg_plan", {
        taskId: "missing",
        plan: {
          ...plan("missing"),
          executable: path.join(root, "missing.exe"),
        },
      })
    ).rejects.toThrow("无法启动");
    expect(
      events
        .filter((e) => e.event === "ffmpeg-progress")
        .every((e) => e.payload.progress.percent < 100)
    ).toBe(true);
    expect(service.hasPendingOperations).toBe(false);
  });
  it("honors cancellation before spawn, including during metadata lookup", async () => {
    expect(await service.cancel(1, "early")).toEqual({ found: false });
    await expect(
      service.run(1, "run_ffmpeg_plan", {
        taskId: "early",
        plan: plan("early"),
      })
    ).rejects.toThrow(FFMPEG_CANCELLED);
    let probeStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      probeStarted = resolve;
    });
    service = new FFmpegProcesses({
      emit: () => true,
      probe: async (_exe, _args, options) => {
        probeStarted();
        await new Promise<void>((_resolve, reject) =>
          options.signal!.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true }
          )
        );
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });
    const running = service.run(1, "run_ffmpeg_plan", {
      taskId: "probing",
      plan: { ...plan("probing"), totalDuration: undefined },
    });
    const rejection = expect(running).rejects.toThrow(FFMPEG_CANCELLED);
    await started;
    expect(await service.cancel(1, "probing")).toEqual({ found: false });
    await rejection;
    expect(service.hasPendingOperations).toBe(false);
  });
  it("isolates equal task IDs across windows and rejects duplicate launches without replacing a live process", async () => {
    const first = plan("first", ["--hold"]),
      second = plan("second", ["--hold"]);
    const a = service.run(1, "run_ffmpeg_plan", {
      taskId: "shared",
      plan: first,
    });
    const b = service.run(2, "run_ffmpeg_plan", {
      taskId: "shared",
      plan: second,
    });
    const ra = expect(a).rejects.toThrow(FFMPEG_CANCELLED),
      rb = expect(b).rejects.toThrow(FFMPEG_CANCELLED);
    const pidA = Number(await waitForFile(first.outputPath + ".pid")),
      pidB = Number(await waitForFile(second.outputPath + ".pid"));
    await expect(
      service.run(1, "run_ffmpeg_plan", {
        taskId: "shared",
        plan: plan("duplicate"),
      })
    ).rejects.toThrow("正在运行");
    expect(await service.cancel(1, "shared")).toEqual({ found: true });
    await ra;
    expect(alive(pidA)).toBe(false);
    expect(alive(pidB)).toBe(true);
    const before = events.length;
    service.disposeOwner(2);
    await rb;
    expect(alive(pidB)).toBe(false);
    expect(events.length).toBe(before);
  });
  it("waits for process-tree cleanup on application shutdown and refuses later work", async () => {
    const p = plan("tree", ["--tree"]);
    const running = service.run(1, "run_ffmpeg_plan", {
      taskId: "tree",
      plan: p,
    });
    const rejection = expect(running).rejects.toThrow(FFMPEG_CANCELLED);
    const pids = JSON.parse(await waitForFile(p.outputPath + ".tree.json"));
    await service.shutdown();
    await rejection;
    for (let i = 0; i < 100 && (alive(pids.parent) || alive(pids.child)); i++)
      await delay(20);
    expect(alive(pids.parent)).toBe(false);
    expect(alive(pids.child)).toBe(false);
    await expect(
      service.run(1, "check_ffmpeg_availability", { path: "ffmpeg" })
    ).rejects.toThrow("退出");
  });
  it("preserves partial metadata, explicit ffprobe selection and complete-file keyframe results", async () => {
    const probe = vi.fn(async (_exe: string, args: string[]) => {
      if (args.includes("-show_format"))
        return {
          stdout: JSON.stringify({
            streams: [{ codec_type: "video", width: 320 }],
            format: { duration: "3.0" },
          }),
          stderr: "",
          exitCode: 0,
        };
      if (args.includes("-skip_frame"))
        return {
          stdout:
            "2.0\nN/A\n0.0,\n\n1.0,H.26[45] User Data Unregistered SEI message\n",
          stderr: "",
          exitCode: 0,
        };
      if (args[0] === "-i")
        return {
          stdout: "",
          stderr:
            "Duration: 00:00:03.50, start: 0\nStream #0:0: Video: h264 (High), yuv420p, 320x240 [SAR 1:1], 25 fps\nStream #0:1: Audio: aac, 48000 Hz",
          exitCode: 1,
        };
      return { stdout: "tool version 1.0\nextra", stderr: "", exitCode: 0 };
    });
    service = new FFmpegProcesses({ emit: () => true, probe });
    const args = {
      ffmpegPath: path.join(root, "ffmpeg.exe"),
      inputPath: path.join(root, "input media.txt"),
    };
    expect(await service.run(1, "get_media_metadata", args)).toMatchObject({
      duration: 3.5,
      width: 320,
      height: 240,
      fps: 25,
      hasAudio: true,
      audioCodec: "aac",
      videoCodec: "h264",
      size: 5,
    });
    expect(
      await service.run(1, "get_full_media_info", {
        ...args,
        ffprobePath: "custom-ffprobe",
      })
    ).toMatchObject({ streams: [{ codec_type: "video" }] });
    expect(probe.mock.calls.at(-1)![0]).toBe("custom-ffprobe");
    expect(
      await service.run(1, "get_media_keyframes", {
        ...args,
        startSec: 0.5,
        endSec: 1.5,
      })
    ).toEqual([0, 1, 2]);
    expect(
      await service.run(1, "check_command_version", {
        path: "ffmpeg",
        versionArg: "-version",
      })
    ).toEqual({ available: true, version: "tool version 1.0", error: null });
    expect(
      await service.run(1, "check_ffmpeg_availability", { path: "ffmpeg" })
    ).toBe(true);
  });
  it("returns actionable availability failures and retains file size when media inspection is unavailable", async () => {
    service = new FFmpegProcesses({
      emit: () => true,
      probe: async () => {
        throw new Error("not installed");
      },
    });
    expect(
      await service.run(1, "check_ffmpeg_availability", { path: "missing" })
    ).toBe(false);
    expect(
      await service.run(1, "check_command_version", { path: "missing" })
    ).toMatchObject({
      available: false,
      version: null,
      error: expect.stringContaining("not installed"),
    });
    expect(
      await service.run(1, "get_media_metadata", {
        ffmpegPath: "missing",
        inputPath: path.join(root, "input media.txt"),
      })
    ).toMatchObject({ duration: null, width: null, hasAudio: false, size: 5 });
  });
  it("announces cropped frame files and final OCR phase with ordered timestamps, excluding unrelated images", async () => {
    const directory = path.join(root, "frames"),
      signal = new AbortController().signal;
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, "unrelated.jpg"), "keep");
    const emitted: { event: string; payload: any }[] = [];
    const execute = vi.fn(async () => {
      await fs.writeFile(
        path.join(directory, "frame_00000001.jpg"),
        "first complete frame"
      );
      await fs.writeFile(
        path.join(directory, "frame_00000002.jpg"),
        "second complete frame"
      );
    });
    const result = await extractVideoFrames(
      {
        ffmpegPath: "ffmpeg",
        inputPath: path.join(root, "input media.txt"),
        outputDir: directory,
        startMs: 1000,
        endMs: 2000,
        intervalMs: 500,
        roi: { x: 0, y: 0.5, width: 1, height: 0.5 },
      },
      {
        signal,
        check: () => {},
        execute,
        metadata: async () => ({ width: 320, height: 240 }),
        emit: (event, payload) => {
          emitted.push({ event, payload });
        },
      }
    );
    expect(result).toBe(2);
    expect(execute.mock.calls[0][1]).toContain("fps=1/0.5,crop=320:120:0:120");
    expect(
      emitted
        .filter((e) => e.event === "video-ocr-frame")
        .map((e) => e.payload.timestampMs)
    ).toEqual([1000, 1500]);
    expect(emitted.at(-1)?.payload).toMatchObject({ phase: "ocr", total: 2 });
    expect(
      await fs.readFile(path.join(directory, "unrelated.jpg"), "utf8")
    ).toBe("keep");
  });
});
