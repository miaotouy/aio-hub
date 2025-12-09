import { createWorker, Worker } from 'tesseract.js';
import type { ImageBlock, OcrResult } from '../types';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const logger = createModuleLogger('OCR/TesseractEngine');
const errorHandler = createModuleErrorHandler('OCR/TesseractEngine');

/**
 * Tesseract OCR 引擎 Composable
 * 专门处理本地 Tesseract.js 识别
 */
export function useTesseractEngine() {
  let tesseractWorker: Worker | null = null;

  /**
   * 初始化 Tesseract Worker
   */
  const initWorker = async (language: string = 'chi_sim+eng'): Promise<Worker> => {
    if (tesseractWorker) {
      await tesseractWorker.terminate();
    }

    const worker = await createWorker(language, 1, {
      // 使用 public 目录下的语言包
      langPath: '/tesseract-lang',
      // 日志级别
      logger: (m) => {
        if (m.status === 'recognizing text') {
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
   * 使用 Tesseract 识别单个图片
   */
  const recognizeSingle = async (
    canvas: HTMLCanvasElement,
    language: string = 'chi_sim+eng'
  ): Promise<{ text: string; confidence: number }> => {
    try {
      // 确保 worker 已初始化
      if (!tesseractWorker) {
        await initWorker(language);
      }

      // 执行识别
      const result = await tesseractWorker!.recognize(canvas);

      return {
        text: result.data.text.trim(),
        confidence: result.data.confidence / 100,
      };
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: 'Tesseract 识别失败',
        context: { language },
        showToUser: false,
      });
      throw error;
    }
  };

  /**
   * 批量识别图片块
   */
  const recognizeBatch = async (
    blocks: ImageBlock[],
    language: string = 'chi_sim+eng',
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

    logger.info(`初始化 Tesseract Worker [${language}]`, { 
      language,
      blocksCount: blocks.length 
    });
    await initWorker(language);

    // 逐个识别图片块
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      // 更新状态为处理中
      results[i].status = 'processing';
      onProgress?.([...results]);

      try {
        logger.debug(`处理图片块 ${i + 1}/${blocks.length}`, {
          blockId: block.id,
          language,
        });

        const { text, confidence } = await recognizeSingle(block.canvas, language);

        // 更新结果
        results[i].text = text;
        results[i].confidence = confidence;
        results[i].status = 'success';

        logger.debug(`图片块识别完成 ${i + 1}/${blocks.length}`, {
          blockId: block.id,
          confidence: `${(confidence * 100).toFixed(1)}%`,
          textLength: text.length,
        });
      } catch (error) {
        errorHandler.handle(error as Error, {
          userMessage: `图片块识别失败 ${i + 1}/${blocks.length}`,
          context: {
            blockId: block.id,
            language,
          },
          showToUser: false,
        });
        results[i].status = 'error';
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

    return results;
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
    recognizeSingle,
    recognizeBatch,
    cleanup,
  };
}