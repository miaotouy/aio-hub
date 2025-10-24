import { createWorker, Worker } from "tesseract.js";
import { invoke } from "@tauri-apps/api/core";
import type { ImageBlock, OcrEngineConfig, OcrResult } from "../types";
import { useLlmRequest } from "../../../composables/useLlmRequest";
import { useCloudOcrRunner } from "./useCloudOcrRunner";
import { useOcrProfiles } from "../../../composables/useOcrProfiles";
import { createModuleLogger } from "@utils/logger";

const logger = createModuleLogger("OCR/Runner");

/**
 * OCR 运行器 Composable
 */
export function useOcrRunner() {
  let tesseractWorker: Worker | null = null;

  /**
   * 初始化 Tesseract Worker
   */
  const initTesseract = async (language: string = "chi_sim+eng"): Promise<Worker> => {
    if (tesseractWorker) {
      await tesseractWorker.terminate();
    }

    const worker = await createWorker(language, 1, {
      // 使用 public 目录下的语言包
      langPath: "/tesseract-lang",
      // 日志级别
      logger: (m) => {
        if (m.status === "recognizing text") {
          logger.debug(`Tesseract 识别进度: ${(m.progress * 100).toFixed(1)}%`, {
            status: m.status,
            progress: m.progress,
          });
        }
      },
    });

    tesseractWorker = worker;
    return worker;
  };

  /**
   * 使用 Tesseract 识别图片
   */
  const recognizeWithTesseract = async (
    canvas: HTMLCanvasElement,
    language: string = "chi_sim+eng"
  ): Promise<{ text: string; confidence: number }> => {
    try {
      // 确保 worker 已初始化
      if (!tesseractWorker) {
        await initTesseract(language);
      }

      // 执行识别
      const result = await tesseractWorker!.recognize(canvas);

      return {
        text: result.data.text.trim(),
        confidence: result.data.confidence / 100,
      };
    } catch (error) {
      logger.error("Tesseract 识别失败", error, { language });
      throw error;
    }
  };

  /**
   * 运行 OCR 识别
   */
  const runOcr = async (
    blocks: ImageBlock[],
    config: OcrEngineConfig,
    onProgress?: (results: OcrResult[]) => void
  ): Promise<OcrResult[]> => {
    const results: OcrResult[] = blocks.map((block) => ({
      blockId: block.id,
      imageId: block.imageId,
      text: "",
      status: "pending" as const,
    }));

    // 通知初始状态
    onProgress?.(results);

    logger.info(`开始 OCR 识别 [${config.type}]`, {
      engineType: config.type,
      blocksCount: blocks.length,
    });

    // 根据引擎类型选择识别方法
    if (config.type === "tesseract") {
      await recognizeWithTesseractEngine(blocks, config, results, onProgress);
    } else if (config.type === "native") {
      await recognizeWithNativeEngine(blocks, results, onProgress);
    } else if (config.type === "vlm") {
      await recognizeWithVlmEngine(blocks, config, results, onProgress);
    } else if (config.type === "cloud") {
      await recognizeWithCloudEngine(blocks, config, results, onProgress);
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    logger.info(`OCR 识别完成 [${config.type}]`, {
      totalBlocks: blocks.length,
      successCount,
      errorCount,
    });

    return results;
  };

  /**
   * 使用 Tesseract 引擎批量识别
   */
  const recognizeWithTesseractEngine = async (
    blocks: ImageBlock[],
    config: Extract<OcrEngineConfig, { type: "tesseract" }>,
    results: OcrResult[],
    onProgress?: (results: OcrResult[]) => void
  ) => {
    const language = config.language;

    // 初始化 worker
    logger.info(`初始化 Tesseract Worker [${language}]`, { language });
    await initTesseract(language);

    // 逐个识别图片块
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      // 更新状态为处理中
      results[i].status = "processing";
      onProgress?.([...results]);

      try {
        logger.debug(`处理图片块 ${i + 1}/${blocks.length}`, {
          blockId: block.id,
          language,
        });

        const { text, confidence } = await recognizeWithTesseract(block.canvas, language);

        // 更新结果
        results[i].text = text;
        results[i].confidence = confidence;
        results[i].status = "success";

        logger.debug(`图片块识别完成 ${i + 1}/${blocks.length}`, {
          blockId: block.id,
          confidence: `${(confidence * 100).toFixed(1)}%`,
          textLength: text.length,
        });
      } catch (error) {
        logger.error(`图片块识别失败 ${i + 1}/${blocks.length}`, error, {
          blockId: block.id,
          language,
        });
        results[i].status = "error";
        results[i].error = (error as Error).message;
      }

      // 通知进度更新
      onProgress?.([...results]);
    }

    // 清理 worker
    if (tesseractWorker) {
      await tesseractWorker.terminate();
      tesseractWorker = null;
    }
  };

  /**
   * 使用原生引擎批量识别
   */
  const recognizeWithNativeEngine = async (
    blocks: ImageBlock[],
    results: OcrResult[],
    onProgress?: (results: OcrResult[]) => void
  ) => {
    logger.info(`使用原生 OCR 引擎识别 (${blocks.length} 块)`, { blocksCount: blocks.length });

    // 逐个识别图片块
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      // 更新状态为处理中
      results[i].status = "processing";
      onProgress?.([...results]);

      try {
        logger.debug(`处理图片块 ${i + 1}/${blocks.length}`, {
          blockId: block.id,
          engine: "native",
        });

        // 将 canvas 转换为 base64
        const imageData = block.canvas.toDataURL("image/png");

        // 调用 Tauri 命令进行 OCR 识别
        const result = await invoke<{ text: string; confidence: number }>("native_ocr", {
          imageData,
        });

        // 更新结果
        results[i].text = result.text.trim();
        results[i].confidence = result.confidence;
        results[i].status = "success";

        logger.debug(`图片块识别完成 ${i + 1}/${blocks.length}`, {
          blockId: block.id,
          confidence: `${(result.confidence * 100).toFixed(1)}%`,
          textLength: result.text.length,
        });
      } catch (error) {
        logger.error(`图片块识别失败 ${i + 1}/${blocks.length}`, error, {
          blockId: block.id,
          engine: "native",
        });
        results[i].status = "error";
        results[i].error = (error as Error).message;
      }

      // 通知进度更新
      onProgress?.([...results]);
    }
  };

  /**
   * 使用 VLM 引擎批量识别
   */
  const recognizeWithVlmEngine = async (
    blocks: ImageBlock[],
    config: Extract<OcrEngineConfig, { type: "vlm" }>,
    results: OcrResult[],
    onProgress?: (results: OcrResult[]) => void
  ) => {
    const concurrency = config.concurrency ?? 3;
    const delay = config.delay ?? 0;

    logger.info(`使用 VLM 引擎识别 (${blocks.length} 块)`, {
      profileId: config.profileId,
      modelId: config.modelId,
      concurrency,
      delay: `${delay}ms`,
    });

    logger.debug("VLM 引擎配置", {
      maxTokens: config.maxTokens ?? 2000,
      temperature: config.temperature ?? 0,
      promptLength: (config.prompt || "").length,
    });

    const { sendRequest } = useLlmRequest();

    // 并发处理函数
    const processBlock = async (index: number, skipDelay: boolean = false) => {
      const block = blocks[index];

      // 更新状态为处理中
      results[index].status = "processing";
      onProgress?.([...results]);

      try {
        // 添加延迟（初始批次跳过，后续任务在请求前延迟）
        if (!skipDelay && delay > 0) {
          logger.debug(`请求前延迟 ${index + 1}/${blocks.length}`, {
            delay: `${delay}ms`,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        logger.debug(`处理图片块 ${index + 1}/${blocks.length}`, {
          blockId: block.id,
          engine: "vlm",
          modelId: config.modelId,
        });

        // 将 canvas 转换为 base64
        const imageBase64 = block.canvas.toDataURL("image/png").split(",")[1];

        // 调用通用 LLM 请求中间件
        const response = await sendRequest({
          profileId: config.profileId,
          modelId: config.modelId,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    config.prompt ||
                    "请识别图片中的所有文字内容，保持原有格式和换行。直接输出文字内容，不要添加任何解释或说明。",
                },
                {
                  type: "image",
                  imageBase64,
                },
              ],
            },
          ],
          maxTokens: config.maxTokens ?? 2000,
          temperature: config.temperature ?? 0,
        });

        // 更新结果
        results[index].text = response.content.trim();
        results[index].status = "success";

        logger.debug(`图片块识别完成 ${index + 1}/${blocks.length}`, {
          blockId: block.id,
          textLength: response.content.length,
        });
      } catch (error) {
        logger.error(`图片块识别失败 ${index + 1}/${blocks.length}`, error, {
          blockId: block.id,
          modelId: config.modelId,
          profileId: config.profileId,
        });
        results[index].status = "error";
        results[index].error = (error as Error).message;
      }

      // 通知进度更新
      onProgress?.([...results]);
    };

    // 使用队列模式的并发控制：任意任务完成后立即启动下一个
    const queue = Array.from({ length: blocks.length }, (_, i) => i);
    const inProgress = new Set<Promise<void>>();

    // 处理单个块的包装函数
    const processWithQueue = async (index: number, isInitial: boolean = false) => {
      await processBlock(index, isInitial);

      // 任务完成后，如果队列还有任务，立即启动下一个
      if (queue.length > 0) {
        const nextIndex = queue.shift()!;
        const nextPromise = processWithQueue(nextIndex, false); // 后续任务需要延迟
        inProgress.add(nextPromise);
        nextPromise.finally(() => inProgress.delete(nextPromise));
      }
    };

    // 启动初始的 concurrency 个任务（初始批次不延迟）
    const initialCount = Math.min(concurrency, blocks.length);
    for (let i = 0; i < initialCount; i++) {
      const index = queue.shift()!;
      const promise = processWithQueue(index, true); // 初始任务跳过延迟
      inProgress.add(promise);
      promise.finally(() => inProgress.delete(promise));
    }

    // 等待所有任务完成
    while (inProgress.size > 0) {
      await Promise.race(inProgress);
    }
  };

  /**
   * 使用云端引擎批量识别
   */
  const recognizeWithCloudEngine = async (
    blocks: ImageBlock[],
    config: Extract<OcrEngineConfig, { type: "cloud" }>,
    results: OcrResult[],
    onProgress?: (results: OcrResult[]) => void
  ) => {
    // 获取选中的 OCR Profile
    const { getProfileById } = useOcrProfiles();
    const profile = getProfileById(config.activeProfileId);

    if (!profile) {
      const errorMsg = "请先在设置中配置云端 OCR 服务";
      logger.error("云端 OCR 配置缺失", new Error(errorMsg), {
        activeProfileId: config.activeProfileId,
      });
      throw new Error(errorMsg);
    }

    if (!profile.enabled) {
      const errorMsg = `云端 OCR 服务 "${profile.name}" 未启用`;
      logger.error("云端 OCR 服务未启用", new Error(errorMsg), {
        profileId: profile.id,
        profileName: profile.name,
      });
      throw new Error(errorMsg);
    }

    logger.info(`使用云端 OCR 引擎识别 [${profile.provider}] (${blocks.length} 块)`, {
      profileId: profile.id,
      profileName: profile.name,
      provider: profile.provider,
    });

    // 使用云端 OCR 运行器
    const { runCloudOcr } = useCloudOcrRunner();

    const cloudResults = await runCloudOcr(blocks, profile, (updatedResults: OcrResult[]) => {
      // 更新结果数组
      updatedResults.forEach((result, index) => {
        results[index] = result;
      });
      onProgress?.([...results]);
    });

    // 最终更新
    cloudResults.forEach((result, index) => {
      results[index] = result;
    });
  };

  /**
   * 清理资源
   */
  const cleanup = async () => {
    if (tesseractWorker) {
      await tesseractWorker.terminate();
      tesseractWorker = null;
    }
  };

  return {
    runOcr,
    cleanup,
  };
}
