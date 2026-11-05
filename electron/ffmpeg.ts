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
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { filePath } from "./filesystem";
import {
  runCapturedProcess,
  terminateProcessTree,
  type CapturedProcess,
} from "./process-runner";
import { extractVideoFrames } from "./ffmpeg-frames";

export const FFMPEG_CANCELLED = "FFMPEG_CANCELLED";
interface Progress {
  percent: number;
  currentTime: number;
  speed: string;
  bitrate: string;
  totalDuration: number;
}
export interface MediaMetadata {
  duration: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  size: number;
  audioCodec: string | null;
  videoCodec: string | null;
}
interface Host {
  emit(owner: number, event: string, payload: unknown): boolean;
  probe?: CapturedProcess;
}
interface Task {
  owner: number;
  id: string;
  epoch: number;
  abort: AbortController;
  child?: ChildProcess;
  termination?: Promise<void>;
  promise: Promise<unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0"))
    throw new Error(label + "无效");
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("FFmpeg 执行计划无效");
  return value as Record<string, unknown>;
}
function seconds(value: string): number | undefined {
  const fields = value.trim().split(":");
  if (fields.length !== 1 && fields.length !== 3) return;
  const values = fields.map(Number);
  if (!values.every(Number.isFinite)) return;
  return values.length === 3
    ? values[0] * 3600 + values[1] * 60 + values[2]
    : values[0];
}
/** CR/LF splitting and decoding survive arbitrary native pipe chunk boundaries. */
class Lines {
  private decoder = new StringDecoder("utf8");
  private buffer = "";
  constructor(private line: (value: string) => void) {}
  write(chunk: Buffer): void {
    const lines = (this.buffer + this.decoder.write(chunk)).split(/[\r\n]+/);
    this.buffer = lines.pop()!.slice(-65536);
    for (const line of lines) if (line) this.line(line.slice(0, 65536));
  }
  end(): void {
    const last = this.buffer + this.decoder.end();
    this.buffer = "";
    if (last) this.line(last.slice(0, 65536));
  }
}
/** Each renderer document owns its probes, conversions and cancellation intents. */
export class FFmpegProcesses {
  private tasks = new Map<string, Task>();
  private cancelled = new Map<number, Set<string>>();
  private epochs = new Map<number, number>();
  private closing = false;
  constructor(private host: Host) {}
  get hasPendingOperations(): boolean {
    return this.tasks.size > 0;
  }
  private key(owner: number, id: string): string {
    return owner + ":" + id;
  }
  private check(task: Task): void {
    if (
      task.abort.signal.aborted ||
      this.closing ||
      task.epoch !== (this.epochs.get(task.owner) ?? 0)
    )
      throw new Error(FFMPEG_CANCELLED);
  }
  private emit(task: Task, event: string, payload: unknown): void {
    if (
      task.abort.signal.aborted ||
      task.epoch !== (this.epochs.get(task.owner) ?? 0) ||
      this.closing
    )
      return;
    if (
      !this.host.emit(task.owner, event, {
        taskId: task.id,
        ...object(payload),
      })
    )
      this.stop(task);
  }
  private stop(task: Task): void {
    task.abort.abort();
    if (task.child?.pid && !task.termination)
      task.termination = terminateProcessTree(task.child.pid);
  }
  private start(
    owner: number,
    id: string,
    action: (task: Task) => Promise<unknown>
  ): Promise<unknown> {
    if (this.closing) return Promise.reject(new Error("应用正在退出"));
    const key = this.key(owner, id);
    if (this.tasks.has(key))
      return Promise.reject(new Error("FFmpeg 任务正在运行，请等待完成或取消"));
    const task: Task = {
      owner,
      id,
      epoch: this.epochs.get(owner) ?? 0,
      abort: new AbortController(),
      promise: Promise.resolve(),
    };
    if (this.cancelled.get(owner)?.delete(id)) task.abort.abort();
    this.tasks.set(key, task);
    task.promise = Promise.resolve()
      .then(() => {
        this.check(task);
        return action(task);
      })
      .finally(async () => {
        if (task.termination) await task.termination;
        if (this.tasks.get(key) === task) this.tasks.delete(key);
      });
    return task.promise;
  }
  async cancel(owner: number, taskId: unknown): Promise<{ found: boolean }> {
    const id = text(taskId, "任务 ID"),
      task = this.tasks.get(this.key(owner, id));
    if (task) {
      const found = Boolean(task.child?.pid);
      this.stop(task);
      await task.termination;
      return { found };
    }
    let pending = this.cancelled.get(owner);
    if (!pending) this.cancelled.set(owner, (pending = new Set()));
    if (pending.size >= 1024) pending.delete(pending.values().next().value!);
    pending.add(id);
    return { found: false };
  }
  disposeOwner(owner: number): void {
    this.epochs.set(owner, (this.epochs.get(owner) ?? 0) + 1);
    this.cancelled.delete(owner);
    for (const task of this.tasks.values())
      if (task.owner === owner) this.stop(task);
  }
  async shutdown(): Promise<void> {
    this.closing = true;
    this.cancelled.clear();
    for (const task of this.tasks.values()) this.stop(task);
    await Promise.allSettled(
      [...this.tasks.values()].map((task) => task.promise)
    );
  }
  run(
    owner: number,
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (name === "kill_ffmpeg_process") return this.cancel(owner, args.taskId);
    const id =
      name === "run_ffmpeg_plan" || name === "extract_video_frames"
        ? text(args.taskId, "任务 ID")
        : randomUUID();
    if (id.length > 256) return Promise.reject(new Error("任务 ID 过长"));
    return this.start(owner, id, async (task) => {
      switch (name) {
        case "check_ffmpeg_availability":
          try {
            return (
              (
                await this.probe(
                  task,
                  text(args.path, "程序路径"),
                  ["-version"],
                  15000
                )
              ).exitCode === 0
            );
          } catch {
            this.check(task);
            return false;
          }
        case "check_command_version":
          try {
            const output = await this.probe(
              task,
              text(args.path, "程序路径"),
              [
                args.versionArg == null
                  ? "--version"
                  : text(args.versionArg, "版本参数"),
              ],
              15000
            );
            const version =
              (output.stdout + "\n" + output.stderr)
                .split(/\r?\n/)
                .map((s) => s.trim())
                .find(Boolean) ?? null;
            return {
              available: output.exitCode === 0,
              version,
              error:
                output.exitCode === 0 ? null : "程序退出码: " + output.exitCode,
            };
          } catch (error) {
            this.check(task);
            return { available: false, version: null, error: String(error) };
          }
        case "get_media_metadata":
          return this.metadata(task, args.ffmpegPath, args.inputPath);
        case "get_full_media_info": {
          const input = filePath(args.inputPath, undefined, {});
          const output = await this.probe(task, this.ffprobe(args), [
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            input,
          ]);
          if (output.exitCode !== 0)
            throw new Error("ffprobe 读取失败: " + output.stderr.trim());
          const data = object(JSON.parse(output.stdout));
          if (
            !Array.isArray(data.streams) ||
            !data.format ||
            typeof data.format !== "object"
          )
            throw new Error("ffprobe 返回的媒体信息无效");
          return data;
        }
        case "get_media_keyframes": {
          if (
            typeof args.startSec !== "number" ||
            !Number.isFinite(args.startSec) ||
            args.startSec < 0 ||
            typeof args.endSec !== "number" ||
            !Number.isFinite(args.endSec) ||
            args.endSec <= args.startSec
          )
            throw new Error("关键帧查询时间范围无效");
          const output = await this.probe(
            task,
            this.ffprobe(args),
            [
              "-v",
              "error",
              "-select_streams",
              "v:0",
              "-skip_frame",
              "nokey",
              "-show_entries",
              "frame=pts_time",
              "-of",
              "csv=p=0",
              filePath(args.inputPath, undefined, {}),
            ],
            300000,
            16 * 1024 ** 2
          );
          if (output.exitCode !== 0)
            throw new Error("ffprobe 读取关键帧失败: " + output.stderr.trim());
          return (
            output.stdout
              .split(/\r?\n/)
              // ffprobe may append frame side-data columns, including an empty one.
              .map((line) => line.split(",", 1)[0].trim())
              .filter(Boolean)
              .map(Number)
              .filter(Number.isFinite)
              .sort((a, b) => a - b)
          );
        }
        case "run_ffmpeg_plan":
          return this.plan(task, object(args.plan));
        case "extract_video_frames":
          return extractVideoFrames(args, {
            signal: task.abort.signal,
            check: () => this.check(task),
            metadata: (executable, input) =>
              this.metadata(task, executable, input),
            execute: (executable, argv) => this.execute(task, executable, argv),
            emit: (event, payload) => this.emit(task, event, payload),
          });
        default:
          throw new Error("未知 FFmpeg 命令: " + name);
      }
    });
  }
  private ffprobe(args: Record<string, unknown>): string {
    if (typeof args.ffprobePath === "string" && args.ffprobePath.trim())
      return text(args.ffprobePath, "ffprobe 路径");
    const executable = text(args.ffmpegPath, "FFmpeg 路径");
    const directory = path.dirname(executable);
    return directory === "."
      ? "ffprobe"
      : path.join(
          directory,
          process.platform === "win32" ||
            path.extname(executable).toLowerCase() === ".exe"
            ? "ffprobe.exe"
            : "ffprobe"
        );
  }
  private async probe(
    task: Task,
    executable: string,
    argv: string[],
    timeoutMs = 60000,
    maxOutputBytes = 1024 ** 2
  ) {
    this.check(task);
    const output = await (this.host.probe ?? runCapturedProcess)(
      executable,
      argv,
      { timeoutMs, maxOutputBytes, signal: task.abort.signal }
    );
    this.check(task);
    return output;
  }
  private async metadata(
    task: Task,
    executable: unknown,
    inputPath: unknown
  ): Promise<MediaMetadata> {
    const input = filePath(inputPath, undefined, {});
    const result: MediaMetadata = {
      duration: null,
      fps: null,
      width: null,
      height: null,
      hasAudio: false,
      size: 0,
      audioCodec: null,
      videoCodec: null,
    };
    result.size = await fs
      .stat(input)
      .then((s) => s.size)
      .catch(() => 0);
    try {
      const output = await this.probe(task, text(executable, "FFmpeg 路径"), [
        "-i",
        input,
      ]);
      const info = output.stderr;
      const duration = /Duration:\s*([^,]+)/.exec(info)?.[1];
      result.duration =
        duration === undefined ? null : (seconds(duration) ?? null);
      const video = info
        .split(/\r?\n/)
        .find((line) => line.includes("Video: "));
      if (video) {
        result.videoCodec = /Video:\s*([^,\s]+)/.exec(video)?.[1] ?? null;
        const size = /(?:^|[, ])(\d{1,6})x(\d{1,6})(?=[, \[])/.exec(video);
        if (size) {
          result.width = Number(size[1]);
          result.height = Number(size[2]);
        }
        const fps = /(?:^|[, ])(\d+(?:\.\d+)?) fps/.exec(video)?.[1];
        if (fps) result.fps = Number(fps);
      }
      result.audioCodec = /Audio:\s*([^,\s]+)/.exec(info)?.[1] ?? null;
      result.hasAudio = result.audioCodec !== null;
    } catch {
      this.check(task); /* Preserve the existing partial-metadata contract. */
    }
    return result;
  }
  private async plan(
    task: Task,
    plan: Record<string, unknown>
  ): Promise<string> {
    const executable = text(plan.executable, "FFmpeg 程序路径");
    const input = filePath(plan.inputPath, undefined, {}),
      output = filePath(plan.outputPath, undefined, {});
    if (
      !Array.isArray(plan.args) ||
      !plan.args.length ||
      plan.args.length > 65536 ||
      plan.args.some((arg) => typeof arg !== "string" || arg.includes("\0"))
    )
      throw new Error("FFmpeg 参数无效");
    const argv = plan.args as string[];
    if (argv.at(-1) !== plan.outputPath)
      throw new Error("执行计划的输出路径与参数末项不一致");
    if (!(await fs.stat(input)).isFile())
      throw new Error("输入路径需为媒体文件");
    await fs.mkdir(path.dirname(output), { recursive: true });
    const duration =
      typeof plan.totalDuration === "number" &&
      Number.isFinite(plan.totalDuration) &&
      plan.totalDuration > 0
        ? plan.totalDuration
        : ((await this.metadata(task, executable, input)).duration ?? 0);
    this.check(task);
    const progress: Progress = {
      percent: 0,
      currentTime: 0,
      speed: "0x",
      bitrate: "0kbps",
      totalDuration: duration,
    };
    const emitProgress = () => {
      progress.percent =
        duration > 0
          ? Math.max(0, Math.min(99.9, (progress.currentTime / duration) * 100))
          : 0;
      this.emit(task, "ffmpeg-progress", { progress: { ...progress } });
    };
    this.emit(task, "ffmpeg-log", { message: "FFmpeg process started..." });
    const executionArgs = [
      ...argv.slice(0, -1),
      "-progress",
      "pipe:1",
      "-nostats",
      argv.at(-1)!,
    ];
    await this.execute(
      task,
      executable,
      executionArgs,
      (line) => {
        const index = line.indexOf("=");
        if (index < 0) return;
        const key = line.slice(0, index).trim(),
          value = line.slice(index + 1).trim();
        if (key === "out_time")
          progress.currentTime = seconds(value) ?? progress.currentTime;
        if ((key === "speed" || key === "bitrate") && value && value !== "N/A")
          progress[key] = value;
        if (key === "progress") emitProgress();
      },
      (line) => this.emit(task, "ffmpeg-log", { message: line })
    );
    this.check(task);
    progress.percent = 100;
    if (duration > 0) progress.currentTime = duration;
    this.emit(task, "ffmpeg-progress", { progress: { ...progress } });
    return plan.outputPath as string;
  }
  private async execute(
    task: Task,
    executable: string,
    argv: string[],
    stdout?: (line: string) => void,
    stderr?: (line: string) => void
  ): Promise<void> {
    this.check(task);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, argv, {
        windowsHide: true,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      task.child = child;
      let tail = "";
      const out = new Lines(stdout ?? (() => {}));
      const err = new Lines((line) => {
        tail = (tail + "\n" + line).slice(-16384);
        stderr?.(line);
      });
      child.stdout!.on("data", (chunk) => out.write(chunk));
      child.stderr!.on("data", (chunk) => err.write(chunk));
      child.stdout!.once("end", () => out.end());
      child.stderr!.once("end", () => err.end());
      child.once("error", (error) =>
        reject(new Error("无法启动 FFmpeg: " + error.message))
      );
      child.once("close", async (code) => {
        if (task.child === child) task.child = undefined;
        if (task.termination) await task.termination;
        try {
          this.check(task);
        } catch (error) {
          reject(error);
          return;
        }
        if (code === 0) resolve();
        else
          reject(
            new Error(
              "FFmpeg 执行失败，退出码 " +
                code +
                (tail.trim() ? ": " + tail.trim() : "")
            )
          );
      });
    });
  }
}
