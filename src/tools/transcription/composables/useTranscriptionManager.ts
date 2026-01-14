import { useTranscriptionStore } from "../stores/transcriptionStore";
import { ImageTranscriptionEngine } from "../engines/image.engine";
import { AudioTranscriptionEngine } from "../engines/audio.engine";
import { VideoTranscriptionEngine } from "../engines/video.engine";
import { PdfTranscriptionEngine } from "../engines/pdf.engine";
import { saveTranscriptionResult, updateDerivedStatus } from "../engines/base";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { remove } from "@tauri-apps/plugin-fs";
import type { Asset } from "@/types/asset-management";
import type { TranscriptionTask, ITranscriptionEngine, TranscriptionConfig } from "../types";

const logger = createModuleLogger("transcription/manager");
const errorHandler = createModuleErrorHandler("transcription/manager");

// 引擎单例，避免重复创建
const engines: ITranscriptionEngine[] = [
  new ImageTranscriptionEngine(),
  new AudioTranscriptionEngine(),
  new VideoTranscriptionEngine(),
  new PdfTranscriptionEngine(),
];

export function useTranscriptionManager() {
  const store = useTranscriptionStore();

  /**
   * 处理队列
   */
  const processQueue = async () => {
    if (store.processingCount >= store.config.maxConcurrentTasks) return;

    const pendingTask = store.tasks.find((t) => t.status === "pending");
    if (!pendingTask) return;

    // 等待速率限制
    await waitForRateLimit();

    if (store.processingCount >= store.config.maxConcurrentTasks) return;
    if (pendingTask.status !== "pending") return;

    pendingTask.status = "processing";
    store.processingCount++;

    processQueue(); // 调度下一个

    try {
      const engine = engines.find((e) => e.canHandle({ type: pendingTask.assetType } as any));
      if (!engine) throw new Error(`未找到支持 ${pendingTask.assetType} 的引擎`);

      const result = await engine.execute({
        task: pendingTask,
        config: store.config,
      });

      if ((pendingTask.status as string) === "cancelled") return;

      const modelIdentifier = pendingTask.overrideConfig?.modelIdentifier || store.config.modelIdentifier;
      const modelId = modelIdentifier.includes(":") ? modelIdentifier.split(":")[1] : modelIdentifier;

      const resultPath = await saveTranscriptionResult(
        pendingTask.assetId,
        pendingTask.path,
        result.text,
        modelId,
        result.isEmpty
      );

      pendingTask.resultPath = resultPath;
      pendingTask.resultText = result.text;
      pendingTask.status = "completed";

      if (pendingTask.tempFilePath) {
        cleanupTempFile(pendingTask.tempFilePath);
        pendingTask.tempFilePath = undefined;
      }
    } catch (e) {
      errorHandler.handle(e, {
        userMessage: "转写任务失败",
        context: { taskId: pendingTask.id, assetId: pendingTask.assetId },
        showToUser: false,
      });

      if (pendingTask.retryCount < store.config.maxRetries) {
        pendingTask.retryCount++;
        pendingTask.status = "pending";
      } else {
        pendingTask.status = "error";
        pendingTask.error = e instanceof Error ? e.message : String(e);
        await updateDerivedStatus(pendingTask.assetId, {
          updatedAt: new Date().toISOString(),
          error: pendingTask.error,
        });
        if (pendingTask.tempFilePath) {
          cleanupTempFile(pendingTask.tempFilePath);
          pendingTask.tempFilePath = undefined;
        }
      }
    } finally {
      store.processingCount--;
      processQueue();
    }
  };

  const waitForRateLimit = async () => {
    const executionDelay = store.config.executionDelay || 0;
    if (executionDelay <= 0) return;

    while (true) {
      const now = Date.now();
      const timeSinceLastStart = now - store.lastTaskStartTime;
      if (timeSinceLastStart >= executionDelay) {
        store.lastTaskStartTime = now;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, executionDelay - timeSinceLastStart));
    }
  };

  const cleanupTempFile = async (path: string) => {
    try {
      const basePath = await assetManagerEngine.getAssetBasePath();
      const fullPath = `${basePath}/${path}`.replace(/\\/g, "/");
      await remove(fullPath);
    } catch (e) { }
  };

  /**
   * 添加任务
   */
  const addTask = (asset: Asset, overrideConfig?: Partial<TranscriptionConfig>) => {
    if (asset.path.startsWith("blob:") || (asset as any).importStatus === "importing") {
      logger.debug("拒绝为尚未上传完成的资产添加转写任务", { assetId: asset.id });
      return null;
    }

    const task: TranscriptionTask = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      assetType: asset.type as any,
      path: asset.path,
      status: "pending",
      retryCount: 0,
      createdAt: Date.now(),
      mimeType: asset.mimeType,
      filename: asset.name,
      overrideConfig,
    };

    store.addTask(task);
    processQueue();
    return task;
  };

  /**
   * 获取转写文本
   */
  const getTranscriptionText = async (asset: Asset): Promise<string | null> => {
    const task = store.tasks.find((t) => t.assetId === asset.id && t.status === "completed" && t.resultPath);
    let path = task?.resultPath || asset.metadata?.derived?.transcription?.path;

    if (!path) return null;

    try {
      const buffer = await assetManagerEngine.getAssetBinary(path);
      return new TextDecoder("utf-8").decode(buffer);
    } catch (e) {
      return null;
    }
  };

  /**
   * 取消任务
   */
  const cancelTask = (assetId: string) => {
    const task = store.tasks.find(t => t.assetId === assetId);
    if (!task) return;

    if (task.status === "pending") {
      store.removeTask(task.id);
    } else if (task.status === "processing") {
      task.status = "cancelled";
    }
  };

  return {
    addTask,
    cancelTask,
    getTranscriptionText,
    retryTask: addTask,
    processQueue
  };
}