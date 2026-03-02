import { createWorker, createScheduler, type Scheduler } from "tesseract.js";
import type { ImageBlock, OcrResult } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("OCR/TesseractEngine");
const errorHandler = createModuleErrorHandler("OCR/TesseractEngine");

// 默认并发 Worker 数量
const DEFAULT_WORKER_COUNT = 4;

/**
 * Tesseract OCR 引擎 Composable
 * 使用 Scheduler 实现并发识别，大幅提升性能
 */
export function useTesseractEngine() {
  let scheduler: Scheduler | null = null;
  let currentLanguage: string | null = null;
  let currentWorkerCount: number = DEFAULT_WORKER_COUNT;

  /**
   * 初始化 Tesseract Scheduler 和 Worker 池
   */
  const initScheduler = async (
    language: string = "chi_sim+eng",
    workerCount: number = DEFAULT_WORKER_COUNT
  ): Promise<void> => {
    // 如果已有 scheduler 且配置相同，则复用
    if (scheduler && currentLanguage === language && currentWorkerCount === workerCount) {
      logger.debug("复用现有 Scheduler", { language, workerCount });
      return;
    }

    // 清理旧的 scheduler
    if (scheduler) {
      logger.debug("清理旧 Scheduler", {
        oldLanguage: currentLanguage,
        oldWorkerCount: currentWorkerCount,
      });
      await scheduler.terminate();
      scheduler = null;
    }

    logger.info(`初始化 Tesseract Scheduler [${language}]`, {
      language,
      workerCount,
    });

    // 创建新的 scheduler
    scheduler = createScheduler();

    // 创建并添加多个 worker
    const workers = await Promise.all(
      Array.from({ length: workerCount }, async (_, index) => {
        logger.debug(`创建 Worker ${index + 1}/${workerCount}`, { language });
        return createWorker(language, 1, {
          langPath: "/tesseract-lang",
          logger: (m) => {
            if (m.status === "recognizing text") {
              logger.debug(`Worker ${index + 1} 识别进度: ${(m.progress * 100).toFixed(1)}%`, {
                workerId: index + 1,
                status: m.status,
                progress: m.progress,
              });
            }
          },
        });
      })
    );

    // 将所有 worker 添加到 scheduler
    workers.forEach((worker, index) => {
      scheduler!.addWorker(worker);
      logger.debug(`Worker ${index + 1} 已添加到 Scheduler`, { language });
    });

    currentLanguage = language;
    currentWorkerCount = workerCount;

    logger.info(`Scheduler 初始化完成`, {
      language,
      workerCount,
      totalWorkers: workers.length,
    });
  };

  /**
   * 使用 Tesseract 识别单个图片
   */
  const recognizeSingle = async (
    canvas: HTMLCanvasElement,
    language: string = "chi_sim+eng",
    workerCount: number = 1
  ): Promise<{ text: string; confidence: number }> => {
    try {
      // 确保 scheduler 已初始化
      await initScheduler(language, workerCount);

      // 使用 scheduler 执行识别
      const result = await scheduler!.addJob("recognize", canvas);

      return {
        text: result.data.text.trim(),
        confidence: result.data.confidence / 100,
      };
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "Tesseract 识别失败",
        context: { language },
        showToUser: false,
      });
      throw error;
    }
  };

  /**
   * 批量识别图片块（并发处理）
   */
  const recognizeBatch = async (
    blocks: ImageBlock[],
    language: string = "chi_sim+eng",
    onProgress?: (results: OcrResult[]) => void,
    workerCount: number = DEFAULT_WORKER_COUNT
  ): Promise<OcrResult[]> => {
    const results: OcrResult[] = blocks.map((block) => ({
      blockId: block.id,
      imageId: block.imageId,
      text: "",
      status: "pending" as const,
    }));

    // 通知初始状态
    onProgress?.(results);

    logger.info(`开始批量识别 [${language}]`, {
      language,
      blocksCount: blocks.length,
      workerCount,
    });

    // 初始化 scheduler
    await initScheduler(language, workerCount);

    // 并发提交所有识别任务
    const promises = blocks.map(async (block, index) => {
      try {
        // 更新状态为处理中
        results[index].status = "processing";
        onProgress?.([...results]);

        logger.debug(`提交图片块 ${index + 1}/${blocks.length}`, {
          blockId: block.id,
          language,
        });

        // 使用 scheduler 并发执行识别
        const result = await scheduler!.addJob("recognize", block.canvas);

        // 更新结果
        results[index].text = result.data.text.trim();
        results[index].confidence = result.data.confidence / 100;
        results[index].status = "success";

        logger.debug(`图片块识别完成 ${index + 1}/${blocks.length}`, {
          blockId: block.id,
          confidence: `${((result.data.confidence / 100) * 100).toFixed(1)}%`,
          textLength: result.data.text.trim().length,
        });

        // 通知进度更新
        onProgress?.([...results]);
      } catch (error) {
        errorHandler.handle(error as Error, {
          userMessage: `图片块识别失败 ${index + 1}/${blocks.length}`,
          context: {
            blockId: block.id,
            language,
          },
          showToUser: false,
        });
        results[index].status = "error";
        results[index].error = (error as Error).message;

        // 通知进度更新
        onProgress?.([...results]);
      }
    });

    // 等待所有任务完成
    await Promise.all(promises);

    logger.info(`批量识别完成`, {
      language,
      totalBlocks: blocks.length,
      successCount: results.filter((r) => r.status === "success").length,
      errorCount: results.filter((r) => r.status === "error").length,
    });

    return results;
  };

  /**
   * 清理资源
   */
  const cleanup = async () => {
    if (scheduler) {
      logger.debug("清理 Scheduler 资源");
      await scheduler.terminate();
      scheduler = null;
      currentLanguage = null;
      currentWorkerCount = DEFAULT_WORKER_COUNT;
    }
  };

  return {
    recognizeSingle,
    recognizeBatch,
    cleanup,
  };
}
