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

/**
 * FFmpeg Agent Action: 执行单条 FFmpeg 命令
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { basename, dirname, extname, join } from "@tauri-apps/api/path";
import { computed } from "vue";
import { useFFmpegStore } from "../ffmpegStore";
import { useFFmpeg } from "@/composables/useFFmpeg";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ToolContext } from "@/services/types";
import type { FFmpegParams, FFmpegProgress } from "../types";

const logger = createModuleLogger("ffmpeg-tools/actions/executeCommand");
const errorHandler = createModuleErrorHandler(
  "ffmpeg-tools/actions/executeCommand"
);

export interface ExecuteCommandArgs {
  /** 输入文件路径 */
  inputPath: string;
  /** 输出文件路径（可选，不填则在输入文件同目录自动生成） */
  outputPath?: string;
  /**
   * FFmpeg 参数数组（不含 ffmpeg 本身、不含 -i 和输出路径）
   * 例如: ["-c:v", "libx264", "-crf", "23", "-c:a", "aac"]
   */
  args: string[];
  /** 是否启用硬件加速（默认 true） */
  hwaccel?: boolean;
  /** 任务显示名称（可选） */
  taskName?: string;
}

/**
 * 自动生成输出路径
 */
async function resolveOutputPath(inputPath: string): Promise<string> {
  const dir = await dirname(inputPath);
  const name = await basename(inputPath);
  const ext = await extname(inputPath);
  const nameWithoutExt = name.substring(0, name.lastIndexOf("."));
  return await join(dir, `${nameWithoutExt}_processed.${ext}`);
}

export async function executeCommand(
  args: ExecuteCommandArgs,
  context?: ToolContext
): Promise<string> {
  const {
    inputPath,
    outputPath,
    args: ffmpegArgs,
    hwaccel = true,
    taskName,
  } = args;

  // 参数验证
  if (!inputPath) {
    return JSON.stringify({ success: false, error: "缺少必需参数: inputPath" });
  }
  if (!ffmpegArgs || !Array.isArray(ffmpegArgs) || ffmpegArgs.length === 0) {
    return JSON.stringify({
      success: false,
      error: "缺少必需参数: args（FFmpeg 参数数组）",
    });
  }

  if (!context?.isAsync) {
    return JSON.stringify({
      success: false,
      error: "此方法必须作为异步任务执行",
    });
  }

  const result = await errorHandler.wrapAsync(
    async () => {
      const store = useFFmpegStore();
      const { activeFfmpegPath } = useFFmpeg(
        computed(() => store.config.ffmpegPath)
      );
      const startTime = Date.now();

      // 验证输入文件存在
      const exists = await invoke<boolean>("path_exists", { path: inputPath });
      if (!exists) {
        return JSON.stringify({
          success: false,
          error: `输入文件不存在: ${inputPath}`,
        });
      }

      // 解析输出路径
      const resolvedOutput = outputPath || (await resolveOutputPath(inputPath));
      const outputFileName = await basename(resolvedOutput);

      // 构建 FFmpegParams
      const params: FFmpegParams = {
        mode: "custom",
        inputPath,
        outputPath: resolvedOutput,
        ffmpegPath: activeFfmpegPath.value,
        hwaccel,
        customArgs: ffmpegArgs,
      };

      // 创建任务
      const task = store.addTask({
        name: taskName || outputFileName,
        inputPath,
        outputPath: resolvedOutput,
        mode: "custom",
      });

      context.reportStatus("正在启动 FFmpeg 处理...", 0);
      logger.info("Agent 启动 FFmpeg 命令", {
        taskId: task.id,
        args: ffmpegArgs,
      });

      // 监听进度事件，桥接到 ToolContext
      const unlistenProgress = await listen<{
        taskId: string;
        progress: FFmpegProgress;
      }>("ffmpeg-progress", (event) => {
        if (event.payload.taskId === task.id) {
          const p = event.payload.progress;
          store.updateTaskProgress(task.id, p);
          context.reportStatus(
            `处理中: ${p.percent.toFixed(1)}% | 速度: ${p.speed} | 码率: ${p.bitrate}`,
            Math.floor(p.percent)
          );
        }
      });

      const unlistenLog = await listen<{ taskId: string; message: string }>(
        "ffmpeg-log",
        (event) => {
          if (event.payload.taskId === task.id) {
            store.addTaskLog(task.id, event.payload.message);
          }
        }
      );

      try {
        // 检查取消信号
        if (context.signal?.aborted) {
          store.updateTask(task.id, { status: "cancelled" });
          const abortError = new Error("任务已取消");
          abortError.name = "AbortError";
          throw abortError;
        }

        // 执行处理
        store.updateTask(task.id, { status: "processing" });
        store.addTaskLog(task.id, `[System] Agent 启动 FFmpeg 任务`);
        store.addTaskLog(task.id, `[System] 参数: ${ffmpegArgs.join(" ")}`);

        const outputResult = await invoke<string>("process_media", {
          taskId: task.id,
          params,
        });

        // 完成
        store.updateTask(task.id, {
          status: "completed",
          outputPath: outputResult,
        });
        store.addTaskLog(task.id, `[System] 任务完成: ${outputResult}`);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        context.reportStatus("处理完成", 100);

        return JSON.stringify(
          {
            success: true,
            taskId: task.id,
            outputPath: outputResult,
            duration: `${duration}秒`,
            message: "FFmpeg 处理完成",
          },
          null,
          2
        );
      } catch (error: any) {
        if (error.name === "AbortError") {
          // 取消 FFmpeg 进程
          try {
            await invoke("kill_ffmpeg_process", { taskId: task.id });
          } catch {
            // 忽略终止失败
          }
          store.updateTask(task.id, { status: "cancelled" });
          throw error;
        }

        const errorMsg = error?.toString() || "未知错误";
        store.updateTask(task.id, { status: "failed", error: errorMsg });
        store.addTaskLog(task.id, `[Error] ${errorMsg}`);
        logger.error("FFmpeg 命令执行失败", error, { taskId: task.id });

        return JSON.stringify(
          {
            success: false,
            taskId: task.id,
            error: errorMsg,
          },
          null,
          2
        );
      } finally {
        unlistenProgress();
        unlistenLog();
      }
    },
    { userMessage: "执行 FFmpeg 命令失败" }
  );

  return result ?? JSON.stringify({ success: false, error: "执行失败" });
}
