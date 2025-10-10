import { createWorker, Worker } from 'tesseract.js';
import type { ImageBlock, OcrEngineConfig, OcrResult } from '../types';

/**
 * OCR 运行器 Composable
 */
export function useOcrRunner() {
  let tesseractWorker: Worker | null = null;

  /**
   * 初始化 Tesseract Worker
   */
  const initTesseract = async (language: string = 'chi_sim+eng'): Promise<Worker> => {
    if (tesseractWorker) {
      await tesseractWorker.terminate();
    }

    const worker = await createWorker(language, 1, {
      // 使用 public 目录下的语言包
      langPath: '/tesseract-lang',
      // 日志级别
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`Tesseract进度: ${(m.progress * 100).toFixed(1)}%`);
        }
      }
    });

    tesseractWorker = worker;
    return worker;
  };

  /**
   * 使用 Tesseract 识别图片
   */
  const recognizeWithTesseract = async (
    canvas: HTMLCanvasElement,
    language: string = 'chi_sim+eng'
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
        confidence: result.data.confidence / 100
      };
    } catch (error) {
      console.error('Tesseract识别失败:', error);
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
    const results: OcrResult[] = blocks.map(block => ({
      blockId: block.id,
      text: '',
      status: 'pending' as const
    }));

    // 通知初始状态
    onProgress?.(results);

    // 根据引擎类型选择识别方法
    if (config.type === 'tesseract') {
      await recognizeWithTesseractEngine(blocks, config, results, onProgress);
    } else if (config.type === 'vlm') {
      // TODO: VLM 引擎实现
      throw new Error('VLM引擎尚未实现');
    } else if (config.type === 'cloud') {
      // TODO: 云端 OCR 实现
      throw new Error('云端OCR尚未实现');
    }

    return results;
  };

  /**
   * 使用 Tesseract 引擎批量识别
   */
  const recognizeWithTesseractEngine = async (
    blocks: ImageBlock[],
    config: OcrEngineConfig,
    results: OcrResult[],
    onProgress?: (results: OcrResult[]) => void
  ) => {
    const language = config.language || 'chi_sim+eng';

    // 初始化 worker
    console.log('初始化 Tesseract Worker...');
    await initTesseract(language);

    // 逐个识别图片块
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      
      // 更新状态为处理中
      results[i].status = 'processing';
      onProgress?.([...results]);

      try {
        console.log(`识别第 ${i + 1}/${blocks.length} 个图片块...`);
        const { text, confidence } = await recognizeWithTesseract(block.canvas, language);
        
        // 更新结果
        results[i].text = text;
        results[i].confidence = confidence;
        results[i].status = 'success';
        
        console.log(`第 ${i + 1} 个块识别完成，置信度: ${(confidence * 100).toFixed(1)}%`);
      } catch (error) {
        console.error(`第 ${i + 1} 个块识别失败:`, error);
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
    cleanup
  };
}