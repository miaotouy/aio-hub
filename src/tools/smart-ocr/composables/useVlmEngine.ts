import type { ImageBlock, OcrResult } from '../types';
import { useLlmRequest } from '@/composables/useLlmRequest';
import { createModuleLogger } from '@utils/logger';

const logger = createModuleLogger('OCR/VlmEngine');

/**
 * VLM 引擎配置接口
 */
export interface VlmEngineConfig {
  profileId: string;
  modelId: string;
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
  concurrency?: number;
  delay?: number;
}

/**
 * VLM OCR 引擎 Composable
 * 专门处理基于多模态大语言模型的 OCR 识别
 */
export function useVlmEngine() {
  /**
   * 使用 VLM 识别单个图片
   */
  const recognizeSingle = async (
    canvas: HTMLCanvasElement,
    config: VlmEngineConfig
  ): Promise<string> => {
    const { sendRequest } = useLlmRequest();

    // 将 canvas 转换为 base64
    const imageBase64 = canvas.toDataURL('image/png').split(',')[1];

    // 调用通用 LLM 请求中间件
    const response = await sendRequest({
      profileId: config.profileId,
      modelId: config.modelId,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                config.prompt ||
                '请识别图片中的所有文字内容，保持原有格式和换行。直接输出文字内容，不要添加任何解释或说明。',
            },
            {
              type: 'image',
              imageBase64,
            },
          ],
        },
      ],
      maxTokens: config.maxTokens ?? 2000,
      temperature: config.temperature ?? 0,
    });

    return response.content.trim();
  };

  /**
   * 批量识别图片块（支持并发控制）
   */
  const recognizeBatch = async (
    blocks: ImageBlock[],
    config: VlmEngineConfig,
    onProgress?: (results: OcrResult[]) => void
  ): Promise<OcrResult[]> => {
    const results: OcrResult[] = blocks.map((block) => ({
      blockId: block.id,
      imageId: block.imageId,
      text: '',
      status: 'pending' as const,
    }));

    // 通知初始状态
    onProgress?.(results);

    const concurrency = config.concurrency ?? 3;
    const delay = config.delay ?? 0;

    logger.info(`使用 VLM 引擎识别 (${blocks.length} 块)`, {
      profileId: config.profileId,
      modelId: config.modelId,
      concurrency,
      delay: `${delay}ms`,
    });

    logger.debug('VLM 引擎配置', {
      maxTokens: config.maxTokens ?? 2000,
      temperature: config.temperature ?? 0,
      promptLength: (config.prompt || '').length,
    });

    // 并发处理函数
    const processBlock = async (index: number, skipDelay: boolean = false) => {
      const block = blocks[index];

      // 更新状态为处理中
      results[index].status = 'processing';
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
          engine: 'vlm',
          modelId: config.modelId,
        });

        const text = await recognizeSingle(block.canvas, config);

        // 更新结果
        results[index].text = text;
        results[index].status = 'success';

        logger.debug(`图片块识别完成 ${index + 1}/${blocks.length}`, {
          blockId: block.id,
          textLength: text.length,
        });
      } catch (error) {
        logger.error(`图片块识别失败 ${index + 1}/${blocks.length}`, error, {
          blockId: block.id,
          modelId: config.modelId,
          profileId: config.profileId,
        });
        results[index].status = 'error';
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

    return results;
  };

  return {
    recognizeSingle,
    recognizeBatch,
  };
}