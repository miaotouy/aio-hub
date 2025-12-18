import { useSmartOcrStore } from '../smartOcr.store';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import type {
  OcrEngineConfig,
  ImageBlock,
  OcrResult,
  SlicerConfig,
  UploadedImage,
} from '../types';
import type { SmartOcrConfig } from '../config';
import {
  loadSmartOcrConfig,
  saveSmartOcrConfig,
} from '../config';
import { useImageSlicer } from './useImageSlicer';
import { useOcrRunner } from './useOcrRunner';
import { useOcrHistory } from './useOcrHistory';
import { useAssetManager } from '@/composables/useAssetManager';

const logger = createModuleLogger('use-smart-ocr-runner');
const errorHandler = createModuleErrorHandler('use-smart-ocr-runner');

// ==================== 类型定义 ====================

export interface FullOcrProcessOptions {
  imageIds?: string[]; // 要处理的图片ID列表，不传则处理所有图片
}

export interface RetryBlockOptions {
  blockId: string;
}

export interface FormattedOcrSummary {
  summary: string;
  details: {
    totalImages: number;
    totalBlocks: number;
    successBlocks: number;
    errorBlocks: number;
    ignoredBlocks: number;
    engineType: string;
    results: Array<{
      blockId: string;
      imageId: string;
      text: string;
      status: string;
      ignored?: boolean;
      error?: string;
    }>;
  };
}

// ==================== 可组合函数 ====================

/**
 * Smart OCR 业务逻辑编排器
 * 
 * 负责所有异步操作和复杂业务流程，调用 Store 的 actions 来更新状态。
 * 不持有任何自身的响应式状态。
 */
export function useSmartOcrRunner() {
  const store = useSmartOcrStore();
  const { addRecord: addHistoryRecord } = useOcrHistory();
  const { importAssetFromBytes } = useAssetManager();

  // ==================== 私有辅助函数 ====================

  /**
   * 为一次成功的 OCR 任务保存历史记录
   */
  async function _saveOcrHistory(
    images: UploadedImage[],
    results: OcrResult[],
    engineConfig: OcrEngineConfig
  ) {
    logger.info('开始保存 OCR 历史记录', { imageCount: images.length });
    for (const image of images) {
      try {
        const imageResults = results.filter((r) => r.imageId === image.id);
        if (imageResults.length === 0) continue;

        const asset = await importAssetFromBytes(
          await image.file.arrayBuffer(),
          image.file.name,
          { sourceModule: 'smart-ocr', enableDeduplication: true }
        );

        await addHistoryRecord(
          {
            assetId: asset.id,
            assetPath: asset.path,
            assetMimeType: asset.mimeType,
            engine: engineConfig.type,
            engineConfig: JSON.parse(JSON.stringify(engineConfig)), // 深拷贝配置
            results: imageResults,
            createdAt: new Date().toISOString(),
          },
          asset
        );
      } catch (error) {
        errorHandler.handle(error, {
          level: ErrorLevel.WARNING,
          userMessage: `保存图片 "${image.name}" 的历史记录失败`,
          context: { imageId: image.id },
        });
      }
    }
  }

  // ==================== 初始化与配置管理 ====================

  /**
   * 初始化，加载配置
   */
  async function initialize(): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        const config = await loadSmartOcrConfig();
        store.setFullConfig(config);
        logger.info('SmartOcr Runner 初始化完成', {
          engineType: config.currentEngineType,
        });
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '初始化 OCR 配置失败',
      }
    );
  }

  /**
   * 更新引擎配置
   */
  async function updateEngineConfig(partialConfig: Partial<OcrEngineConfig>): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        const currentConfig = store.fullConfig;

        // 确定最终的引擎类型
        const engineType = partialConfig.type || currentConfig.currentEngineType;

        // 获取当前该引擎的配置
        const oldEngineConfig = currentConfig.engineConfigs[engineType];

        // 合并新旧配置
        const newEngineConfig = { ...oldEngineConfig, ...partialConfig };

        // 创建新的引擎配置集合
        const newEngineConfigs = {
          ...currentConfig.engineConfigs,
          [engineType]: newEngineConfig,
        };

        // 构建最终的完整配置
        const updatedFullConfig: SmartOcrConfig = {
          ...currentConfig,
          currentEngineType: engineType,
          engineConfigs: newEngineConfigs,
        };

        store.setFullConfig(updatedFullConfig);
        await saveSmartOcrConfig(updatedFullConfig);
        logger.info('引擎配置已更新', { partialConfig });
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '更新引擎配置失败',
        context: partialConfig,
      }
    );
  }
  /**
   * 更新切图配置
   */
  async function updateSlicerConfig(config: Partial<SlicerConfig>): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        const updatedFullConfig = {
          ...store.fullConfig,
          slicerConfig: {
            ...store.fullConfig.slicerConfig,
            ...config,
          },
        };
        store.setFullConfig(updatedFullConfig);
        await saveSmartOcrConfig(updatedFullConfig);
        logger.info('切图配置已更新', { config });
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '更新切图配置失败',
        context: config,
      }
    );
  }

  // ==================== 图片管理 ====================

  /**
   * 添加上传的图片
   */
  function addImages(images: UploadedImage[]): void {
    store.addImages(images);
    logger.info('添加图片', { count: images.length });
  }

  /**
   * 删除图片
   */
  function removeImage(imageId: string): void {
    store.removeImage(imageId);
  }

  /**
   * 清除所有图片
   */
  function clearAllImages(): void {
    store.reset();
    logger.info('清除所有图片');
  }

  // ==================== 图片切割 ====================

  /**
   * 切割单张图片
   */
  async function sliceImage(imageId: string): Promise<{
    blocks: ImageBlock[];
    lines: any[];
  } | null> {
    return await errorHandler.wrapAsync(
      async () => {
        const image = store.uploadedImages.find((img) => img.id === imageId);
        if (!image) {
          throw new Error('图片不存在');
        }

        const { sliceImage: slice } = useImageSlicer();
        const result = await slice(image.img, store.slicerConfig, imageId);

        store.updateImageBlocks(imageId, result.blocks);
        store.updateCutLines(imageId, result.lines);

        logger.info('图片切割完成', {
          imageId,
          blocksCount: result.blocks.length,
          linesCount: result.lines.length,
        });

        return result;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '图片切割失败',
        context: { imageId },
      }
    );
  }

  /**
   * 切割所有图片
   */
  async function sliceAllImages(): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        const { sliceImage: slice } = useImageSlicer();

        for (const image of store.uploadedImages) {
          const result = await slice(
            image.img,
            store.slicerConfig,
            image.id
          );
          store.updateImageBlocks(image.id, result.blocks);
          store.updateCutLines(image.id, result.lines);
        }

        logger.info('所有图片切割完成', {
          totalImages: store.uploadedImages.length,
        });
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '批量切割失败',
      }
    );
  }

  // ==================== OCR 识别 ====================

  /**
   * 执行完整的 OCR 流程（切图 + 识别）
   */
  async function runFullOcrProcess(
    options: FullOcrProcessOptions = {},
    onProgress?: (results: OcrResult[]) => void
  ): Promise<OcrResult[]> {
    const result = await errorHandler.wrapAsync(
      async () => {
        store.setProcessing(true);

        // 确定要处理的图片
        const imagesToProcess = options.imageIds
          ? store.uploadedImages.filter((img) => options.imageIds!.includes(img.id))
          : store.uploadedImages;

        if (imagesToProcess.length === 0) {
          throw new Error('没有可处理的图片');
        }

        // 收集要处理的图片ID集合
        const imageIdsToProcess = new Set(imagesToProcess.map(img => img.id));

        // 清除要处理的图片的旧结果
        store.clearOcrResults(Array.from(imageIdsToProcess));

        // 收集所有图片的块
        const allBlocks: ImageBlock[] = [];
        for (const image of imagesToProcess) {
          let blocks = store.imageBlocksMap.get(image.id);

          // 如果图片还没有切割，先切割
          if (!blocks) {
            const sliceResult = await sliceImage(image.id);
            blocks = sliceResult!.blocks;
          }

          allBlocks.push(...blocks);
        }

        logger.info('开始 OCR 识别流程', {
          imagesCount: imagesToProcess.length,
          blocksCount: allBlocks.length,
          engineType: store.fullConfig.currentEngineType,
        });

        // 执行 OCR 识别，并实时更新结果
        const { runOcr } = useOcrRunner();
        const results = await runOcr(allBlocks, store.engineConfig, (progressResults: OcrResult[]) => {
          // 合并进度结果到现有结果中
          store.updateOcrResults(progressResults);

          // 调用外部传入的进度回调
          onProgress?.(store.ocrResults);
        });

        // 最终更新：合并结果
        store.updateOcrResults(results);

        // 保存历史记录
        await _saveOcrHistory(imagesToProcess, results, store.engineConfig);

        store.setProcessing(false);

        return results;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: 'OCR 识别失败',
        context: options,
      }
    );

    // 确保处理状态被重置
    store.setProcessing(false);
    return result || [];
  }

  /**
   * 重试单个块的识别
   */
  async function retryBlock(
    options: RetryBlockOptions,
    onProgress?: (result: OcrResult) => void
  ): Promise<OcrResult | null> {
    return await errorHandler.wrapAsync(
      async () => {
        const resultIndex = store.ocrResults.findIndex((r) => r.blockId === options.blockId);
        if (resultIndex === -1) {
          throw new Error('未找到对应的识别结果');
        }

        const result = store.ocrResults[resultIndex];
        const imageId = result.imageId;

        const blocks = store.imageBlocksMap.get(imageId);
        if (!blocks) {
          throw new Error('未找到对应的图片块');
        }

        const block = blocks.find((b) => b.id === options.blockId);
        if (!block) {
          throw new Error('未找到对应的图片块');
        }

        // 更新状态为处理中
        const updatingResult = { ...result, status: 'processing' as const, error: undefined };
        store.updateOcrResults([updatingResult]);
        onProgress?.(updatingResult);

        // 重新识别这个块
        const { runOcr } = useOcrRunner();
        const singleBlockResults = await runOcr(
          [block],
          store.engineConfig,
          (updatedResults: OcrResult[]) => {
            if (updatedResults.length > 0) {
              const newResult = {
                ...updatedResults[0],
                imageId,
              };
              store.updateOcrResults([newResult]);
              onProgress?.(newResult);
            }
          }
        );

        // 最终更新
        if (singleBlockResults.length > 0) {
          const finalResult = {
            ...singleBlockResults[0],
            imageId,
          };
          store.updateOcrResults([finalResult]);
          logger.info('重试识别完成', { blockId: options.blockId });
          return finalResult;
        }

        return null;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '重试识别失败',
        context: options,
      }
    );
  }

  /**
   * 重试所有失败的块
   */
  async function retryAllFailedBlocks(
    onProgress?: (results: OcrResult[]) => void
  ): Promise<OcrResult[]> {
    return await errorHandler.wrapAsync(
      async () => {
        const failedResults = store.ocrResults.filter((r) => r.status === 'error');
        if (failedResults.length === 0) {
          return [];
        }

        const blocksToRetry: ImageBlock[] = [];
        const imageIdMap = new Map<string, string>(); // blockId -> imageId

        failedResults.forEach((res) => {
          const blocks = store.imageBlocksMap.get(res.imageId);
          const block = blocks?.find((b) => b.id === res.blockId);
          if (block) {
            blocksToRetry.push(block);
            imageIdMap.set(block.id, res.imageId);
          }
        });

        if (blocksToRetry.length === 0) {
          return [];
        }

        logger.info('开始批量重试失败的块', { count: blocksToRetry.length });

        // 更新状态为处理中
        const processingResults = failedResults.map((r) => ({
          ...r,
          status: 'processing' as const,
          error: undefined,
        }));
        store.updateOcrResults(processingResults);

        // 执行 OCR 识别
        const { runOcr } = useOcrRunner();
        const results = await runOcr(
          blocksToRetry,
          store.engineConfig,
          (progressResults: OcrResult[]) => {
            // 需要补全 imageId
            const mappedResults = progressResults.map((r) => ({
              ...r,
              imageId: imageIdMap.get(r.blockId)!,
            }));
            store.updateOcrResults(mappedResults);
            onProgress?.(store.ocrResults);
          }
        );

        // 最终更新
        const finalResults = results.map((r) => ({
          ...r,
          imageId: imageIdMap.get(r.blockId)!,
        }));
        store.updateOcrResults(finalResults);

        return finalResults;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '批量重试识别失败',
      }
    ) || [];
  }

  /**
   * 切换块的忽略状态
   */
  function toggleBlockIgnore(blockId: string): void {
    store.toggleBlockIgnore(blockId);
    const result = store.ocrResults.find((r) => r.blockId === blockId);
    if (result) {
      logger.info('切换忽略状态', { blockId, ignored: result.ignored });
    }
  }

  /**
   * 更新块的文本内容
   */
  function updateBlockText(blockId: string, text: string): void {
    store.updateBlockText(blockId, text);
    logger.info('更新块文本', { blockId, textLength: text.length });
  }

  // ==================== 结果格式化 ====================

  /**
   * 获取格式化的 OCR 结果摘要
   */
  function getFormattedOcrSummary(): FormattedOcrSummary {
    const totalImages = store.uploadedImages.length;
    const totalBlocks = store.ocrResults.length;
    const successBlocks = store.ocrResults.filter((r) => r.status === 'success').length;
    const errorBlocks = store.ocrResults.filter((r) => r.status === 'error').length;
    const ignoredBlocks = store.ocrResults.filter((r) => r.ignored).length;

    const summary = `OCR 识别完成: ${successBlocks}/${totalBlocks} 块成功识别${errorBlocks > 0 ? `，${errorBlocks} 块失败` : ''
      }${ignoredBlocks > 0 ? `，${ignoredBlocks} 块被忽略` : ''}`;

    return {
      summary,
      details: {
        totalImages,
        totalBlocks,
        successBlocks,
        errorBlocks,
        ignoredBlocks,
        engineType: store.fullConfig.currentEngineType,
        results: store.ocrResults.map((r) => ({
          blockId: r.blockId,
          imageId: r.imageId,
          text: r.text,
          status: r.status,
          ignored: r.ignored,
          error: r.error,
        })),
      },
    };
  }

  // ==================== 返回接口 ====================

  return {
    // 方法
    initialize,
    updateEngineConfig,
    updateSlicerConfig,
    addImages,
    removeImage,
    clearAllImages,
    sliceImage,
    sliceAllImages,
    runFullOcrProcess,
    retryBlock,
    retryAllFailedBlocks,
    toggleBlockIgnore,
    updateBlockText,
    getFormattedOcrSummary,
  };
}