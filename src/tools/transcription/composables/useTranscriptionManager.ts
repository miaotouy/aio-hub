import { useTranscriptionStore } from "../stores/transcriptionStore";
import { ImageTranscriptionEngine } from "../engines/image.engine";
import { AudioTranscriptionEngine } from "../engines/audio.engine";
import { VideoTranscriptionEngine } from "../engines/video.engine";
import { PdfTranscriptionEngine } from "../engines/pdf.engine";
import { saveTranscriptionResult, updateDerivedStatus } from "../engines/base";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { smartDecode } from "@/utils/encoding";
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
    pendingTask.abortController = new AbortController();
    store.processingCount++;

    processQueue(); // 调度下一个

    try {
      const engine = engines.find((e) => e.canHandle({ type: pendingTask.assetType } as any));
      if (!engine) throw new Error(`未找到支持 ${pendingTask.assetType} 的引擎`);

      logger.info(`开始执行转写任务: ${pendingTask.id}`, { assetId: pendingTask.assetId, retry: pendingTask.retryCount });

      // 合并覆盖配置
      const finalConfig = {
        ...store.config,
        ...(pendingTask.overrideConfig || {}),
      };

      const result = await engine.execute({
        task: pendingTask,
        config: finalConfig,
        signal: pendingTask.abortController.signal,
      });

      if ((pendingTask.status as string) === "cancelled") {
        logger.info(`任务已被取消: ${pendingTask.id}`);
        return;
      }

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
      const errorMessage = e instanceof Error ? e.message : String(e);
      const isRepetitionError = store.config.enableRepetitionDetection && errorMessage.includes("复读");

      logger.error(`转写任务失败: ${pendingTask.id}`, e, {
        assetId: pendingTask.assetId,
        retry: pendingTask.retryCount,
        isRepetitionError
      });

      // 如果是复读错误，重试时可以尝试微调参数（虽然目前引擎层还没支持动态参数微调，但这里先保留逻辑空间）
      // 这里的策略是：复读错误依然允许重试，但如果重试一次还不行，就直接失败，避免无限循环
      const canRetry = pendingTask.retryCount < store.config.maxRetries && (!isRepetitionError || pendingTask.retryCount < 1);

      if (canRetry) {
        pendingTask.retryCount++;
        pendingTask.status = "pending";
        // 延迟重试，避免瞬间刷爆
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        pendingTask.status = "error";
        pendingTask.error = errorMessage;

        // 最终失败时，向用户显示提示（如果不是用户主动取消）
        if ((pendingTask.status as string) !== "cancelled") {
          errorHandler.handle(e, {
            userMessage: `资产 "${pendingTask.filename}" 转写失败: ${errorMessage}`,
            context: { taskId: pendingTask.id, assetId: pendingTask.assetId },
            showToUser: true,
          });
        }

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

    // 检查是否支持该类型
    const isText = asset.mimeType?.startsWith("text/") || asset.name.endsWith(".txt") || asset.name.endsWith(".md");
    const isSupported = engines.some(e => e.canHandle(asset)) || isText;

    if (!isSupported) {
      logger.warn("不支持的资产类型，无法添加转写任务", { type: asset.type, mime: asset.mimeType });
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
      return smartDecode(buffer);
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
      // 触发真正的人为中断
      task.abortController?.abort();
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