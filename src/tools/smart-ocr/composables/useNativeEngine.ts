import { invoke } from '@tauri-apps/api/core';
import type { ImageBlock, OcrResult } from '../types';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('OCR/NativeEngine');
const errorHandler = createModuleErrorHandler('OCR/NativeEngine');

/**
 * Native OCR 引擎 Composable
 * 专门处理 Windows 原生 OCR API
 */
export function useNativeEngine() {
  /**
   * 使用原生 API 识别单个图片
   */
  const recognizeSingle = async (
    canvas: HTMLCanvasElement
  ): Promise<{ text: string; confidence: number }> => {
    try {
      // 将 canvas 转换为 base64
      const imageData = canvas.toDataURL('image/png');

      // 调用 Tauri 命令进行 OCR 识别
      const result = await invoke<{ text: string; confidence: number }>('native_ocr', {
        imageData,
      });

      return {
        text: result.text.trim(),
        confidence: result.confidence,
      };
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: 'Native OCR 识别失败', showToUser: false });
      throw error;
    }
  };

  /**
   * 批量识别图片块
   */
  const recognizeBatch = async (
    blocks: ImageBlock[],
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

    logger.info(`使用原生 OCR 引擎识别 (${blocks.length} 块)`, { 
      blocksCount: blocks.length 
    });

    // 逐个识别图片块
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      // 更新状态为处理中
      results[i].status = 'processing';
      onProgress?.([...results]);

      try {
        logger.debug(`处理图片块 ${i + 1}/${blocks.length}`, {
          blockId: block.id,
          engine: 'native',
        });

        const { text, confidence } = await recognizeSingle(block.canvas);

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
            engine: 'native',
          },
          showToUser: false,
        });
        results[i].status = 'error';
        results[i].error = (error as Error).message;
      }

      // 通知进度更新
      onProgress?.([...results]);
    }

    return results;
  };

  return {
    recognizeSingle,
    recognizeBatch,
  };
}