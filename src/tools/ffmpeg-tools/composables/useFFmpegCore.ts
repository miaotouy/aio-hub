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

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { computed } from "vue";
import { useFFmpegStore } from "../ffmpegStore";
import { useFFmpeg } from "@/composables/useFFmpeg";
import type { MediaMetadata, FFmpegProgress } from "../types";
import type { FFmpegExecutionPlan } from "../utils/executionPlan";
import { isCancellationError, isTerminalStatus } from "../utils/lifecycle";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("useFFmpegCore");
const errorHandler = createModuleErrorHandler("useFFmpegCore");

export function useFFmpegCore() {
  const store = useFFmpegStore();
  const ffmpeg = useFFmpeg(computed(() => store.config.ffmpegPath));

  /**
   * 检查 FFmpeg 是否可用
   */
  const checkAvailability = async (path: string) => {
    return await ffmpeg.checkAvailability(path);
  };

  /**
   * 获取媒体元数据
   */
  const getMetadata = async (inputPath: string) => {
    return await errorHandler.wrapAsync(
      async () => {
        return await invoke<MediaMetadata>("get_media_metadata", {
          ffmpegPath: ffmpeg.activeFfmpegPath.value,
          inputPath,
        });
      },
      { userMessage: "获取媒体元数据失败" }
    );
  };

  /**
   * 获取详细媒体信息 (ffprobe)
   */
  const getFullMediaInfo = async (inputPath: string) => {
    return await errorHandler.wrapAsync(
      async () => {
        return await invoke<any>("get_full_media_info", {
          ffmpegPath: ffmpeg.activeFfmpegPath.value,
          ffprobePath: ffmpeg.globalFfprobePath.value,
          inputPath,
        });
      },
      { userMessage: "获取详细媒体信息失败" }
    );
  };

  /**
   * 启动处理任务
   */
  const startProcess = async (taskId: string, plan: FFmpegExecutionPlan) => {
    const initial = store.tasks.find((t) => t.id === taskId);
    if (initial && isTerminalStatus(initial.status)) {
      logger.info("任务已处于终止状态，跳过启动", { taskId });
      return;
    }

    try {
      logger.info("开始 FFmpeg 任务", { taskId, args: plan.args });
      store.updateTask(taskId, { status: "processing" });
      store.addTaskLog(taskId, `[System] 正在启动 FFmpeg 任务...`);
      store.addTaskLog(taskId, `[System] 输入路径: ${plan.inputPath}`);
      store.addTaskLog(taskId, `[System] 可执行文件: ${plan.executable}`);

      const result = await invoke<string>("run_ffmpeg_plan", {
        taskId,
        plan,
      });

      const current = store.tasks.find((t) => t.id === taskId);
      if (current && isTerminalStatus(current.status)) {
        logger.info("任务已被终止，忽略迟到的完成回调", {
          taskId,
          status: current.status,
        });
        return result;
      }

      logger.info("FFmpeg 任务执行成功", { taskId, result });
      store.addTaskLog(taskId, `[System] 任务执行成功!`);
      store.addTaskLog(taskId, `[System] 输出路径: ${result}`);
      store.updateTask(taskId, { status: "completed", outputPath: result });
      return result;
    } catch (error: any) {
      const current = store.tasks.find((t) => t.id === taskId);
      if (
        isCancellationError(error) ||
        (current !== undefined && current.status === "cancelled")
      ) {
        logger.info("FFmpeg 任务已取消", { taskId });
        store.updateTask(taskId, { status: "cancelled" });
        const abortError = new Error("任务已取消");
        abortError.name = "AbortError";
        throw abortError;
      }

      const errorMsg = error.toString();
      logger.error("FFmpeg 处理失败", error, { taskId });
      store.addTaskLog(taskId, `[Error] 任务处理失败: ${errorMsg}`);
      store.updateTask(taskId, { status: "failed", error: errorMsg });
      throw error;
    }
  };

  /**
   * 终止任务
   */
  const killProcess = async (taskId: string): Promise<{ found: boolean }> => {
    try {
      const result = await invoke<{ found: boolean }>(
        "kill_ffmpeg_process",
        { taskId }
      );
      logger.info("已请求终止 FFmpeg 任务", { taskId, found: result?.found });
      return result ?? { found: false };
    } catch (error) {
      logger.error("终止任务失败", error, { taskId });
      return { found: false };
    }
  };

  /**
   * 监听进度与日志事件
   */
  const setupListeners = async () => {
    const unlistenProgress = await listen<{
      taskId: string;
      progress: FFmpegProgress;
    }>("ffmpeg-progress", (event) => {
      const { taskId, progress } = event.payload;
      store.updateTaskProgress(taskId, progress);
    });

    const unlistenLog = await listen<{ taskId: string; message: string }>(
      "ffmpeg-log",
      (event) => {
        const { taskId, message } = event.payload;
        store.addTaskLog(taskId, message);
      }
    );

    return () => {
      unlistenProgress();
      unlistenLog();
    };
  };

  return {
    checkAvailability,
    activeFfmpegPath: ffmpeg.activeFfmpegPath,
    globalFfmpegPath: ffmpeg.globalFfmpegPath,
    globalFfprobePath: ffmpeg.globalFfprobePath,
    isUsingGlobal: ffmpeg.isUsingGlobal,
    getMetadata,
    getFullMediaInfo,
    startProcess,
    killProcess,
    setupListeners,
  };
}
