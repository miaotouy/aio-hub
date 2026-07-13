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

import { describe, it, expect, beforeEach, vi } from "vitest";
import FFmpegToolsRegistry from "../ffmpeg-tools.registry";
import { executeCommand, executePipeline, getMediaInfo } from "../actions";

const { mockInvoke, mockListen, listeners, mockStore } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockListen: vi.fn(),
  listeners: new Map<string, Array<(event: { payload: any }) => void>>(),
  mockStore: {
    config: {
      ffmpegPath: "C:/bin/ffmpeg.exe",
    },
    addTask: vi.fn(),
    updateTask: vi.fn(),
    updateTaskProgress: vi.fn(),
    addTaskLog: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: vi.fn(async () => "C:/Users/test/AppData/Roaming/AIO"),
  basename: vi.fn(async (path: string) => path.split(/[\\/]/).pop() || path),
  dirname: vi.fn(async (path: string) => path.replace(/[\\/][^\\/]+$/, "")),
  extname: vi.fn(async (path: string) => {
    const name = path.split(/[\\/]/).pop() || "";
    return name.includes(".") ? name.split(".").pop() || "" : "";
  }),
  join: vi.fn(async (...parts: string[]) => parts.join("/")),
}));

vi.mock("../ffmpegStore", () => ({
  useFFmpegStore: () => mockStore,
}));

vi.mock("@/composables/useFFmpeg", () => ({
  useFFmpeg: () => ({
    activeFfmpegPath: { value: "C:/bin/ffmpeg.exe" },
    globalFfprobePath: { value: "C:/bin/ffprobe.exe" },
  }),
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    wrapAsync: vi.fn(async (fn: () => Promise<unknown>) => {
      try {
        return await fn();
      } catch {
        return null;
      }
    }),
  }),
}));

function emit(eventName: string, payload: any) {
  for (const callback of listeners.get(eventName) || []) {
    callback({ payload });
  }
}

function createContext() {
  return {
    isAsync: true,
    reportStatus: vi.fn(),
    signal: {
      aborted: false,
    },
  };
}

describe("ffmpeg-tools agent actions", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockListen.mockReset();
    listeners.clear();
    mockStore.addTask.mockReset();
    mockStore.updateTask.mockReset();
    mockStore.updateTaskProgress.mockReset();
    mockStore.addTaskLog.mockReset();
    mockStore.addTask.mockReturnValue({
      id: "task-1",
      name: "task",
      inputPath: "C:/media/input.mp4",
      outputPath: "C:/media/output.mp4",
      mode: "custom",
      status: "pending",
      progress: {
        percent: 0,
        currentTime: 0,
        speed: "0x",
        bitrate: "0kbps",
      },
      createdAt: 1,
    });
    mockListen.mockImplementation(async (eventName: string, callback: any) => {
      const callbacks = listeners.get(eventName) || [];
      callbacks.push(callback);
      listeners.set(eventName, callbacks);
      return vi.fn();
    });
  });

  it("executeCommand 应校验必需参数和异步上下文", async () => {
    await expect(
      executeCommand(
        { inputPath: "", args: ["-c:v", "copy"] },
        createContext() as any
      )
    ).resolves.toContain("缺少必需参数: inputPath");
    await expect(
      executeCommand(
        { inputPath: "C:/in.mp4", args: [] },
        createContext() as any
      )
    ).resolves.toContain("缺少必需参数: args");
    await expect(
      executeCommand({ inputPath: "C:/in.mp4", args: ["-c:v", "copy"] })
    ).resolves.toContain("此方法必须作为异步任务执行");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("executeCommand 应创建任务、桥接进度事件并返回处理结果", async () => {
    const context = createContext();
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "path_exists") return true;
      if (command === "process_media") {
        emit("ffmpeg-progress", {
          taskId: "task-1",
          progress: {
            percent: 42.6,
            currentTime: 12,
            speed: "1.4x",
            bitrate: "900kbits/s",
          },
        });
        emit("ffmpeg-log", {
          taskId: "task-1",
          message: "frame=120",
        });
        return "C:/media/input_processed.mp4";
      }
      throw new Error(`unexpected command: ${command}`);
    });

    const output = await executeCommand(
      {
        inputPath: "C:/media/input.mp4",
        args: ["-c:v", "libx264", "-crf", "23"],
        hwaccel: false,
      },
      context as any
    );
    const result = JSON.parse(output);

    expect(mockInvoke).toHaveBeenCalledWith("path_exists", {
      path: "C:/media/input.mp4",
    });
    expect(mockInvoke).toHaveBeenCalledWith("process_media", {
      taskId: "task-1",
      params: {
        mode: "custom",
        inputPath: "C:/media/input.mp4",
        outputPath: "C:/media/input_processed.mp4",
        ffmpegPath: "C:/bin/ffmpeg.exe",
        hwaccel: false,
        customArgs: ["-c:v", "libx264", "-crf", "23"],
      },
    });
    expect(mockStore.updateTaskProgress).toHaveBeenCalledWith("task-1", {
      percent: 42.6,
      currentTime: 12,
      speed: "1.4x",
      bitrate: "900kbits/s",
    });
    expect(mockStore.addTaskLog).toHaveBeenCalledWith("task-1", "frame=120");
    expect(context.reportStatus).toHaveBeenCalledWith(
      "处理中: 42.6% | 速度: 1.4x | 码率: 900kbits/s",
      42
    );
    expect(result).toMatchObject({
      success: true,
      taskId: "task-1",
      outputPath: "C:/media/input_processed.mp4",
      message: "FFmpeg 处理完成",
    });
  });

  it("executePipeline 应串行执行步骤并清理中间文件", async () => {
    const context = createContext();
    let processCount = 0;
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "path_exists") return true;
      if (command === "create_dir_force") return undefined;
      if (command === "delete_file_to_trash") return undefined;
      if (command === "process_media") {
        processCount += 1;
        return processCount === 1
          ? "C:/Users/test/AppData/Roaming/AIO/ffmpeg-temp/pipeline_step0_1.wav"
          : "C:/media/input_pipeline.mp3";
      }
      throw new Error(`unexpected command: ${command}`);
    });

    const output = await executePipeline(
      {
        pipelineName: "extract-and-encode",
        steps: [
          {
            name: "extract wav",
            inputPath: "C:/media/input.mp4",
            outputExt: "wav",
            args: ["-vn", "-c:a", "pcm_s16le"],
          },
          {
            name: "encode mp3",
            inputPath: "$prev",
            outputExt: "mp3",
            args: ["-c:a", "libmp3lame"],
          },
        ],
      },
      context as any
    );
    const result = JSON.parse(output);

    expect(result).toMatchObject({
      success: true,
      pipelineName: "extract-and-encode",
      completedSteps: 2,
      totalSteps: 2,
      finalOutputPath: "C:/media/input_pipeline.mp3",
    });
    expect(mockInvoke).toHaveBeenCalledWith("delete_file_to_trash", {
      filePath: expect.stringMatching(
        /^C:\/Users\/test\/AppData\/Roaming\/AIO\/ffmpeg-temp\/pipeline_step0_\d+\.wav$/
      ),
    });
    expect(mockInvoke).toHaveBeenCalledTimes(5);
  });

  it("getMediaInfo 应格式化基础信息并在详细模式追加 ffprobe 流信息", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "get_media_metadata") {
        return {
          duration: 125,
          fps: 29.97,
          width: 1920,
          height: 1080,
          hasAudio: true,
          size: 10 * 1024 * 1024,
        };
      }
      if (command === "get_full_media_info") {
        return {
          format: {
            filename: "input.mp4",
            nb_streams: 2,
            format_name: "mov,mp4",
            format_long_name: "QuickTime / MOV",
            duration: "125",
            size: "10485760",
            bit_rate: "900000",
          },
          streams: [
            {
              index: 0,
              codec_type: "video",
              codec_name: "h264",
              width: 1920,
              height: 1080,
              r_frame_rate: "30000/1001",
            },
            {
              index: 1,
              codec_type: "audio",
              codec_name: "aac",
              sample_rate: "48000",
              channels: 2,
            },
          ],
        };
      }
      throw new Error(`unexpected command: ${command}`);
    });

    const output = await getMediaInfo({
      path: "C:/media/input.mp4",
      detailed: true,
    });
    const result = JSON.parse(output);

    expect(result).toMatchObject({
      success: true,
      path: "C:/media/input.mp4",
      duration: "2:05",
      size: "10.00 MiB",
      resolution: "1920x1080",
      format: "mov,mp4",
    });
    expect(result.streams).toEqual([
      {
        type: "video",
        codec: "h264",
        width: 1920,
        height: 1080,
        frameRate: "30000/1001",
      },
      {
        type: "audio",
        codec: "aac",
        sampleRate: "48000",
        channels: 2,
      },
    ]);
  });

  it("registry 应声明三个异步 Agent 方法并转发调用", async () => {
    mockInvoke.mockResolvedValueOnce({
      duration: 1,
      hasAudio: false,
      size: 1024,
    });

    const registry = new FFmpegToolsRegistry();
    const metadata = registry.getMetadata();
    const mediaInfo = JSON.parse(
      await registry.getMediaInfo({ path: "C:/media/input.mp4" })
    );

    expect(metadata.methods.map((method) => method.name)).toEqual([
      "executeCommand",
      "executePipeline",
      "getMediaInfo",
    ]);
    expect(metadata.methods.every((method) => method.agentCallable)).toBe(true);
    expect(
      metadata.methods.filter((method) => method.executionMode === "async")
        .length
    ).toBe(2);
    expect(mediaInfo.success).toBe(true);
  });
});
