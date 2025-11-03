import { ref, computed } from 'vue';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import type {
  OcrEngineConfig,
  ImageBlock,
  OcrResult,
  SlicerConfig,
  CutLine,
  UploadedImage,
} from '../types';
import type { SmartOcrConfig } from '../config';
import {
  loadSmartOcrConfig,
  saveSmartOcrConfig,
  getCurrentEngineConfig,
  defaultSmartOcrConfig,
} from '../config';
import { useImageSlicer } from './useImageSlicer';
import { useOcrRunner } from './useOcrRunner';

const logger = createModuleLogger('use-smart-ocr');
const errorHandler = createModuleErrorHandler('use-smart-ocr');

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

// ==================== Composable ====================

/**
 * Smart OCR UI 状态管理 Composable
 * 
 * 为 UI 层提供所有需要的响应式状态和方法。
 * 这是一个完全独立的、符合 Vue Composition API 范式的状态管理器。
 */
export function useSmartOcr() {
  // ==================== 响应式状态 ====================

  /** 完整配置 */
  const fullConfig = ref<SmartOcrConfig>({ ...defaultSmartOcrConfig });

  /** 已上传的图片列表 */
  const uploadedImages = ref<UploadedImage[]>([]);

  /** 图片切割线映射表 */
  const cutLinesMap = ref<Map<string, CutLine[]>>(new Map());

  /** 图片切割块映射表 */
  const imageBlocksMap = ref<Map<string, ImageBlock[]>>(new Map());

  /** OCR 识别结果列表 */
  const ocrResults = ref<OcrResult[]>([]);

  /** 是否正在处理中 */
  const isProcessing = ref<boolean>(false);

  // ==================== 计算属性 ====================

  /** 当前引擎配置 */
  const engineConfig = computed(() => getCurrentEngineConfig(fullConfig.value));

  /** 切图配置 */
  const slicerConfig = computed(() => fullConfig.value.slicerConfig);

  // ==================== 初始化与配置管理 ====================

  /**
   * 初始化，加载配置
   */
  async function initialize(): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        fullConfig.value = await loadSmartOcrConfig();
        logger.info('useSmartOcr 初始化完成', {
          engineType: fullConfig.value.currentEngineType,
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
  async function updateEngineConfig(newConfig: OcrEngineConfig): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        const type = newConfig.type;

        // 检查是否只是切换引擎类型
        const isTypeSwitch = Object.keys(newConfig).length === 1 && 'type' in newConfig;

        if (isTypeSwitch) {
          fullConfig.value = {
            ...fullConfig.value,
            currentEngineType: type,
          };
        } else {
          // 更新当前引擎的配置
          const newEngineConfigs = { ...fullConfig.value.engineConfigs };

          // 根据引擎类型更新对应的配置
          switch (type) {
            case 'tesseract':
              newEngineConfigs.tesseract = {
                ...newEngineConfigs.tesseract,
                ...(newConfig as any),
              };
              break;
            case 'native':
              newEngineConfigs.native = {
                ...newEngineConfigs.native,
                ...(newConfig as any),
              };
              break;
            case 'vlm':
              newEngineConfigs.vlm = {
                ...newEngineConfigs.vlm,
                ...(newConfig as any),
              };
              break;
            case 'cloud':
              newEngineConfigs.cloud = {
                ...newEngineConfigs.cloud,
                ...(newConfig as any),
              };
              break;
          }

          fullConfig.value = {
            ...fullConfig.value,
            currentEngineType: type,
            engineConfigs: newEngineConfigs,
          };
        }

        await saveSmartOcrConfig(fullConfig.value);
        logger.info('引擎配置已更新', { engineType: type });
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '更新引擎配置失败',
        context: newConfig,
      }
    );
  }

  /**
   * 更新切图配置
   */
  async function updateSlicerConfig(config: SlicerConfig): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        fullConfig.value = {
          ...fullConfig.value,
          slicerConfig: config,
        };
        await saveSmartOcrConfig(fullConfig.value);
        logger.info('切图配置已更新', config);
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
    uploadedImages.value.push(...images);
    logger.info('添加图片', { count: images.length });
  }

  /**
   * 删除图片
   */
  function removeImage(imageId: string): void {
    const index = uploadedImages.value.findIndex((img) => img.id === imageId);
    if (index !== -1) {
      uploadedImages.value.splice(index, 1);
      cutLinesMap.value.delete(imageId);
      imageBlocksMap.value.delete(imageId);
      logger.info('删除图片', { imageId });
    }
  }

  /**
   * 清除所有图片
   */
  function clearAllImages(): void {
    uploadedImages.value = [];
    cutLinesMap.value.clear();
    imageBlocksMap.value.clear();
    ocrResults.value = [];
    logger.info('清除所有图片');
  }

  // ==================== 图片切割 ====================

  /**
   * 切割单张图片
   */
  async function sliceImage(imageId: string): Promise<{
    blocks: ImageBlock[];
    lines: CutLine[];
  } | null> {
    return await errorHandler.wrapAsync(
      async () => {
        const image = uploadedImages.value.find((img) => img.id === imageId);
        if (!image) {
          throw new Error('图片不存在');
        }

        const { sliceImage: slice } = useImageSlicer();
        const result = await slice(image.img, slicerConfig.value, imageId);

        imageBlocksMap.value.set(imageId, result.blocks);
        cutLinesMap.value.set(imageId, result.lines);

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

        for (const image of uploadedImages.value) {
          const result = await slice(
            image.img,
            slicerConfig.value,
            image.id
          );
          imageBlocksMap.value.set(image.id, result.blocks);
          cutLinesMap.value.set(image.id, result.lines);
        }

        logger.info('所有图片切割完成', {
          totalImages: uploadedImages.value.length,
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
        isProcessing.value = true;

        // 确定要处理的图片
        const imagesToProcess = options.imageIds
          ? uploadedImages.value.filter((img) => options.imageIds!.includes(img.id))
          : uploadedImages.value;

        if (imagesToProcess.length === 0) {
          throw new Error('没有可处理的图片');
        }

        // 收集要处理的图片ID集合
        const imageIdsToProcess = new Set(imagesToProcess.map(img => img.id));
        
        // 清除要处理的图片的旧结果，保留其他图片的结果
        ocrResults.value = ocrResults.value.filter(
          r => !imageIdsToProcess.has(r.imageId)
        );

        // 收集所有图片的块
        const allBlocks: ImageBlock[] = [];
        for (const image of imagesToProcess) {
          let blocks = imageBlocksMap.value.get(image.id);

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
          engineType: fullConfig.value.currentEngineType,
        });

        // 执行 OCR 识别，并实时更新结果
        const { runOcr } = useOcrRunner();
        const results = await runOcr(allBlocks, engineConfig.value, (progressResults: OcrResult[]) => {
          // 合并进度结果到现有结果中
          const existingResults = ocrResults.value.filter(
            r => !imageIdsToProcess.has(r.imageId)
          );
          ocrResults.value = [...existingResults, ...progressResults];
          
          // 调用外部传入的进度回调
          onProgress?.(ocrResults.value);
        });

        // 最终更新：合并结果
        const existingResults = ocrResults.value.filter(
          r => !imageIdsToProcess.has(r.imageId)
        );
        ocrResults.value = [...existingResults, ...results];
        isProcessing.value = false;

        return results;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: 'OCR 识别失败',
        context: options,
      }
    );

    // 确保处理状态被重置
    isProcessing.value = false;
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
        const resultIndex = ocrResults.value.findIndex((r) => r.blockId === options.blockId);
        if (resultIndex === -1) {
          throw new Error('未找到对应的识别结果');
        }

        const result = ocrResults.value[resultIndex];
        const imageId = result.imageId;

        const blocks = imageBlocksMap.value.get(imageId);
        if (!blocks) {
          throw new Error('未找到对应的图片块');
        }

        const block = blocks.find((b) => b.id === options.blockId);
        if (!block) {
          throw new Error('未找到对应的图片块');
        }

        // 更新状态为处理中
        ocrResults.value[resultIndex].status = 'processing';
        ocrResults.value[resultIndex].error = undefined;
        onProgress?.(ocrResults.value[resultIndex]);

        // 重新识别这个块
        const { runOcr } = useOcrRunner();
        const singleBlockResults = await runOcr(
          [block],
          engineConfig.value,
          (updatedResults: OcrResult[]) => {
            if (updatedResults.length > 0) {
              ocrResults.value[resultIndex] = {
                ...updatedResults[0],
                imageId,
              };
              onProgress?.(ocrResults.value[resultIndex]);
            }
          }
        );

        // 最终更新
        if (singleBlockResults.length > 0) {
          ocrResults.value[resultIndex] = {
            ...singleBlockResults[0],
            imageId,
          };
        }

        logger.info('重试识别完成', { blockId: options.blockId });
        return ocrResults.value[resultIndex];
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '重试识别失败',
        context: options,
      }
    );
  }

  /**
   * 切换块的忽略状态
   */
  function toggleBlockIgnore(blockId: string): void {
    const result = ocrResults.value.find((r) => r.blockId === blockId);
    if (result) {
      result.ignored = !result.ignored;
      logger.info('切换忽略状态', { blockId, ignored: result.ignored });
    }
  }

  /**
   * 更新块的文本内容
   */
  function updateBlockText(blockId: string, text: string): void {
    const result = ocrResults.value.find((r) => r.blockId === blockId);
    if (result) {
      result.text = text;
      logger.info('更新块文本', { blockId, textLength: text.length });
    }
  }

  // ==================== 结果格式化 ====================

  /**
   * 获取格式化的 OCR 结果摘要
   */
  function getFormattedOcrSummary(): FormattedOcrSummary {
    const totalImages = uploadedImages.value.length;
    const totalBlocks = ocrResults.value.length;
    const successBlocks = ocrResults.value.filter((r) => r.status === 'success').length;
    const errorBlocks = ocrResults.value.filter((r) => r.status === 'error').length;
    const ignoredBlocks = ocrResults.value.filter((r) => r.ignored).length;

    const summary = `OCR 识别完成: ${successBlocks}/${totalBlocks} 块成功识别${
      errorBlocks > 0 ? `，${errorBlocks} 块失败` : ''
    }${ignoredBlocks > 0 ? `，${ignoredBlocks} 块被忽略` : ''}`;

    return {
      summary,
      details: {
        totalImages,
        totalBlocks,
        successBlocks,
        errorBlocks,
        ignoredBlocks,
        engineType: fullConfig.value.currentEngineType,
        results: ocrResults.value.map((r) => ({
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
    // 状态
    fullConfig,
    uploadedImages,
    cutLinesMap,
    imageBlocksMap,
    ocrResults,
    isProcessing,
    engineConfig,
    slicerConfig,
    
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
    toggleBlockIgnore,
    updateBlockText,
    getFormattedOcrSummary,
  };
}