import type { ImageBlock, OcrEngineConfig, OcrResult } from '../types';
import { useTesseractEngine } from './useTesseractEngine';
import { useNativeEngine } from './useNativeEngine';
import { useVlmEngine } from './useVlmEngine';
import { useCloudOcrRunner } from './useCloudOcrRunner';
import { useOcrProfiles } from '@/composables/useOcrProfiles';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const logger = createModuleLogger('OCR/Runner');
const errorHandler = createModuleErrorHandler('OCR/Runner');

/**
 * OCR 运行器 Composable
 * 作为编排者，根据引擎配置调度具体的识别引擎
 */
export function useOcrRunner() {
  /**
   * 运行 OCR 识别
   * 根据引擎配置分发到对应的引擎实现
   */
  const runOcr = async (
    blocks: ImageBlock[],
    config: OcrEngineConfig,
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

    logger.info(`开始 OCR 识别 [${config.type}]`, {
      engineType: config.type,
      blocksCount: blocks.length,
    });

    // 根据引擎类型选择识别方法
    try {
      let finalResults: OcrResult[];

      switch (config.type) {
        case 'tesseract':
          finalResults = await runTesseractEngine(blocks, config, onProgress);
          break;
        case 'native':
          finalResults = await runNativeEngine(blocks, onProgress);
          break;
        case 'vlm':
          finalResults = await runVlmEngine(blocks, config, onProgress);
          break;
        case 'cloud':
          finalResults = await runCloudEngine(blocks, config, onProgress);
          break;
        default:
          throw new Error(`不支持的引擎类型: ${(config as { type: unknown }).type}`);
      }

      const successCount = finalResults.filter((r) => r.status === 'success').length;
      const errorCount = finalResults.filter((r) => r.status === 'error').length;

      logger.info(`OCR 识别完成 [${config.type}]`, {
        totalBlocks: blocks.length,
        successCount,
        errorCount,
      });

      return finalResults;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: `OCR 识别失败 [${config.type}]`,
        context: {
          engineType: config.type,
          blocksCount: blocks.length,
        },
        showToUser: false,
      });
      throw error;
    }
  };

  /**
   * 使用 Tesseract 引擎
   */
  const runTesseractEngine = async (
    blocks: ImageBlock[],
    config: Extract<OcrEngineConfig, { type: 'tesseract' }>,
    onProgress?: (results: OcrResult[]) => void
  ): Promise<OcrResult[]> => {
    const { recognizeBatch } = useTesseractEngine();
    return await recognizeBatch(blocks, config.language, onProgress);
  };

  /**
   * 使用原生引擎
   */
  const runNativeEngine = async (
    blocks: ImageBlock[],
    onProgress?: (results: OcrResult[]) => void
  ): Promise<OcrResult[]> => {
    const { recognizeBatch } = useNativeEngine();
    return await recognizeBatch(blocks, onProgress);
  };

  /**
   * 使用 VLM 引擎
   */
  const runVlmEngine = async (
    blocks: ImageBlock[],
    config: Extract<OcrEngineConfig, { type: 'vlm' }>,
    onProgress?: (results: OcrResult[]) => void
  ): Promise<OcrResult[]> => {
    const { recognizeBatch } = useVlmEngine();
    return await recognizeBatch(blocks, config, onProgress);
  };

  /**
   * 使用云端引擎
   */
  const runCloudEngine = async (
    blocks: ImageBlock[],
    config: Extract<OcrEngineConfig, { type: 'cloud' }>,
    onProgress?: (results: OcrResult[]) => void
  ): Promise<OcrResult[]> => {
    // 获取选中的 OCR Profile
    const { getProfileById } = useOcrProfiles();
    const profile = getProfileById(config.activeProfileId);

    if (!profile) {
      const errorMsg = '请先在设置中配置云端 OCR 服务';
      errorHandler.handle(new Error(errorMsg), {
        userMessage: '云端 OCR 配置缺失',
        context: { activeProfileId: config.activeProfileId },
        showToUser: false,
      });
      throw new Error(errorMsg);
    }
if (!profile.enabled) {
  const errorMsg = `云端 OCR 服务 "${profile.name}" 未启用`;
  errorHandler.handle(new Error(errorMsg), {
    userMessage: '云端 OCR 服务未启用',
    context: {
      profileId: profile.id,
      profileName: profile.name,
    },
    showToUser: false,
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

    const results: OcrResult[] = blocks.map((block) => ({
      blockId: block.id,
      imageId: block.imageId,
      text: '',
      status: 'pending' as const,
    }));

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

    return results;
  };

  /**
   * 清理资源
   */
  const cleanup = async () => {
    const { cleanup: cleanupTesseract } = useTesseractEngine();
    await cleanupTesseract();
  };

  return {
    runOcr,
    cleanup,
  };
}
