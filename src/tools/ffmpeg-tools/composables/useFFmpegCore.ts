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
   * 获取详细媒体信息 (ffprobe)
   */
  const getFullMediaInfo = async (inputPath: string) => {
    return await errorHandler.wrapAsync(async () => {
      return await invoke<any>("get_full_media_info", {
        ffmpegPath: store.config.ffmpegPath,
        inputPath,
      });
    }, { userMessage: "获取详细媒体信息失败" });
  };

  /**
   * 启动处理任务
   */
  const startProcess = async (taskId: string, params: FFmpegParams) => {
    try {
      logger.info("开始 FFmpeg 任务", { taskId, params });
      store.updateTask(taskId, { status: "processing" });
      store.addTaskLog(taskId, `[System] 正在启动 FFmpeg 任务...`);
      store.addTaskLog(taskId, `[System] 输入路径: ${params.inputPath}`);
      store.addTaskLog(taskId, `[System] 处理模式: ${params.mode}`);

      const result = await invoke<string>("process_media", {
        taskId,
        params,
      });

      logger.info("FFmpeg 任务执行成功", { taskId, result });
      store.addTaskLog(taskId, `[System] 任务执行成功!`);
      store.addTaskLog(taskId, `[System] 输出路径: ${result}`);
      store.updateTask(taskId, { status: "completed", outputPath: result });
      return result;
    } catch (error: any) {
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
    const unlistenProgress = await listen<{ taskId: string; progress: FFmpegProgress }>(
      "ffmpeg-progress",
      (event) => {
        const { taskId, progress } = event.payload;
        store.updateTaskProgress(taskId, progress);
      }
    );

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
    getMetadata,
    getFullMediaInfo,
    startProcess,
    killProcess,
    setupListeners,
  };
}