import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useFFmpegStore } from "../ffmpegStore";
import type { FFmpegParams, MediaMetadata, FFmpegProgress } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("useFFmpegCore");
const errorHandler = createModuleErrorHandler("useFFmpegCore");

export function useFFmpegCore() {
  const store = useFFmpegStore();

  /**
   * 检查 FFmpeg 是否可用
   */
  const checkAvailability = async (path: string) => {
    return await invoke<boolean>("check_ffmpeg_availability", { path });
  };

  /**
   * 获取媒体元数据
   */
  const getMetadata = async (inputPath: string) => {
    return await errorHandler.wrapAsync(async () => {
      return await invoke<MediaMetadata>("get_media_metadata", {
        ffmpegPath: store.config.ffmpegPath,
        inputPath,
      });
    }, { userMessage: "获取媒体元数据失败" });
  };

  /**
   * 启动处理任务
   */
  const startProcess = async (taskId: string, params: FFmpegParams) => {
    try {
      store.updateTask(taskId, { status: "processing" });

      const result = await invoke<string>("process_media", {
        taskId,
        params,
      });

      store.updateTask(taskId, { status: "completed", outputPath: result });
      return result;
    } catch (error: any) {
      logger.error("FFmpeg 处理失败", error, { taskId });
      store.updateTask(taskId, { status: "failed", error: error.toString() });
      throw error;
    }
  };

  /**
   * 终止任务
   */
  const killProcess = async (taskId: string) => {
    try {
      await invoke("kill_ffmpeg_process", { taskId });
      store.updateTask(taskId, { status: "cancelled" });
    } catch (error) {
      logger.error("终止任务失败", error, { taskId });
    }
  };

  /**
   * 监听进度与日志事件
   */
  const setupListeners = async () => {
    const unlistenProgress = await listen<{ task_id: string; progress: FFmpegProgress }>(
      "ffmpeg-progress",
      (event) => {
        const { task_id, progress } = event.payload;
        store.updateTaskProgress(task_id, progress);
      }
    );

    const unlistenLog = await listen<{ task_id: string; message: string }>(
      "ffmpeg-log",
      (event) => {
        const { task_id, message } = event.payload;
        store.addTaskLog(task_id, message);
      }
    );

    return () => {
      unlistenProgress();
      unlistenLog();
    };
  };

  return {
    checkAvailability,
    getMetadata,
    startProcess,
    killProcess,
    setupListeners,
  };
}