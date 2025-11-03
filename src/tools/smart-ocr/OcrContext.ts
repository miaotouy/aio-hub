import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import type {
  OcrEngineConfig,
  ImageBlock,
  OcrResult,
  SlicerConfig,
  CutLine,
  UploadedImage,
} from './types';
import type { SmartOcrConfig } from './config';
import {
  loadSmartOcrConfig,
  saveSmartOcrConfig,
  getCurrentEngineConfig,
  defaultSmartOcrConfig,
} from './config';
import { useImageSlicer } from './composables/useImageSlicer';
import { useOcrRunner } from './composables/useOcrRunner';

const logger = createModuleLogger('ocr-context');
const errorHandler = createModuleErrorHandler('ocr-context');

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

// ==================== OcrContext 类 ====================

/**
 * OCR 上下文 - 封装所有响应式状态和业务逻辑
 * 
 * 这是一个有状态的实例，每个消费者（UI 或 Agent）都会获得独立的 Context。
 * 所有状态都是 Vue 响应式的，可以直接在组件中使用。
 */
export class OcrContext {
  // ==================== 响应式状态 ====================

  /** 完整配置 */
  public readonly fullConfig: Ref<SmartOcrConfig>;

  /** 已上传的图片列表 */
  public readonly uploadedImages: Ref<UploadedImage[]>;

  /** 图片切割线映射表 */
  public readonly cutLinesMap: Ref<Map<string, CutLine[]>>;

  /** 图片切割块映射表 */
  public readonly imageBlocksMap: Ref<Map<string, ImageBlock[]>>;

  /** OCR 识别结果列表 */
  public readonly ocrResults: Ref<OcrResult[]>;

  /** 是否正在处理中 */
  public readonly isProcessing: Ref<boolean>;

  // ==================== 计算属性 ====================

  /** 当前引擎配置 */
  public readonly engineConfig: ComputedRef<OcrEngineConfig>;

  /** 切图配置 */
  public readonly slicerConfig: ComputedRef<SlicerConfig>;

  // ==================== 构造函数 ====================

  constructor() {
    // 初始化响应式状态
    this.fullConfig = ref<SmartOcrConfig>({ ...defaultSmartOcrConfig });
    this.uploadedImages = ref<UploadedImage[]>([]);
    this.cutLinesMap = ref<Map<string, CutLine[]>>(new Map());
    this.imageBlocksMap = ref<Map<string, ImageBlock[]>>(new Map());
    this.ocrResults = ref<OcrResult[]>([]);
    this.isProcessing = ref<boolean>(false);

    // 初始化计算属性
    this.engineConfig = computed(() => getCurrentEngineConfig(this.fullConfig.value));
    this.slicerConfig = computed(() => this.fullConfig.value.slicerConfig);

    logger.info('OcrContext 实例已创建');
  }

  // ==================== 初始化与配置管理 ====================

  /**
   * 初始化上下文，加载配置
   */
  public async initialize(): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        this.fullConfig.value = await loadSmartOcrConfig();
        logger.info('OcrContext 初始化完成', {
          engineType: this.fullConfig.value.currentEngineType,
        });
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '初始化 OCR 上下文失败',
      }
    );
  }

  /**
   * 更新引擎配置
   */
  public async updateEngineConfig(newConfig: OcrEngineConfig): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        const type = newConfig.type;

        // 检查是否只是切换引擎类型
        const isTypeSwitch = Object.keys(newConfig).length === 1 && 'type' in newConfig;

        if (isTypeSwitch) {
          this.fullConfig.value = {
            ...this.fullConfig.value,
            currentEngineType: type,
          };
        } else {
          // 更新当前引擎的配置
          const newEngineConfigs = { ...this.fullConfig.value.engineConfigs };

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

          this.fullConfig.value = {
            ...this.fullConfig.value,
            currentEngineType: type,
            engineConfigs: newEngineConfigs,
          };
        }

        await saveSmartOcrConfig(this.fullConfig.value);
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
  public async updateSlicerConfig(config: SlicerConfig): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        this.fullConfig.value = {
          ...this.fullConfig.value,
          slicerConfig: config,
        };
        await saveSmartOcrConfig(this.fullConfig.value);
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
  public addImages(images: UploadedImage[]): void {
    this.uploadedImages.value.push(...images);
    logger.info('添加图片', { count: images.length });
  }

  /**
   * 删除图片
   */
  public removeImage(imageId: string): void {
    const index = this.uploadedImages.value.findIndex((img) => img.id === imageId);
    if (index !== -1) {
      this.uploadedImages.value.splice(index, 1);
      this.cutLinesMap.value.delete(imageId);
      this.imageBlocksMap.value.delete(imageId);
      logger.info('删除图片', { imageId });
    }
  }

  /**
   * 清除所有图片
   */
  public clearAllImages(): void {
    this.uploadedImages.value = [];
    this.cutLinesMap.value.clear();
    this.imageBlocksMap.value.clear();
    this.ocrResults.value = [];
    logger.info('清除所有图片');
  }

  // ==================== 图片切割 ====================

  /**
   * 切割单张图片
   */
  public async sliceImage(imageId: string): Promise<{
    blocks: ImageBlock[];
    lines: CutLine[];
  } | null> {
    return await errorHandler.wrapAsync(
      async () => {
        const image = this.uploadedImages.value.find((img) => img.id === imageId);
        if (!image) {
          throw new Error('图片不存在');
        }

        const { sliceImage } = useImageSlicer();
        const result = await sliceImage(image.img, this.slicerConfig.value, imageId);

        this.imageBlocksMap.value.set(imageId, result.blocks);
        this.cutLinesMap.value.set(imageId, result.lines);

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
  public async sliceAllImages(): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        const { sliceImage } = useImageSlicer();

        for (const image of this.uploadedImages.value) {
          const result = await sliceImage(
            image.img,
            this.slicerConfig.value,
            image.id
          );
          this.imageBlocksMap.value.set(image.id, result.blocks);
          this.cutLinesMap.value.set(image.id, result.lines);
        }

        logger.info('所有图片切割完成', {
          totalImages: this.uploadedImages.value.length,
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
  public async runFullOcrProcess(
    options: FullOcrProcessOptions = {},
    onProgress?: (results: OcrResult[]) => void
  ): Promise<OcrResult[]> {
    const result = await errorHandler.wrapAsync(
      async () => {
        this.isProcessing.value = true;

        // 确定要处理的图片
        const imagesToProcess = options.imageIds
          ? this.uploadedImages.value.filter((img) => options.imageIds!.includes(img.id))
          : this.uploadedImages.value;

        if (imagesToProcess.length === 0) {
          throw new Error('没有可处理的图片');
        }

        // 收集要处理的图片ID集合
        const imageIdsToProcess = new Set(imagesToProcess.map(img => img.id));
        
        // 清除要处理的图片的旧结果，保留其他图片的结果
        this.ocrResults.value = this.ocrResults.value.filter(
          r => !imageIdsToProcess.has(r.imageId)
        );

        // 收集所有图片的块
        const allBlocks: ImageBlock[] = [];
        for (const image of imagesToProcess) {
          let blocks = this.imageBlocksMap.value.get(image.id);

          // 如果图片还没有切割，先切割
          if (!blocks) {
            const sliceResult = await this.sliceImage(image.id);
            blocks = sliceResult!.blocks;
          }

          allBlocks.push(...blocks);
        }

        logger.info('开始 OCR 识别流程', {
          imagesCount: imagesToProcess.length,
          blocksCount: allBlocks.length,
          engineType: this.fullConfig.value.currentEngineType,
        });

        // 执行 OCR 识别，并实时更新结果
        const { runOcr } = useOcrRunner();
        const results = await runOcr(allBlocks, this.engineConfig.value, (progressResults) => {
          // 合并进度结果到现有结果中
          const existingResults = this.ocrResults.value.filter(
            r => !imageIdsToProcess.has(r.imageId)
          );
          this.ocrResults.value = [...existingResults, ...progressResults];
          
          // 调用外部传入的进度回调
          onProgress?.(this.ocrResults.value);
        });

        // 最终更新：合并结果
        const existingResults = this.ocrResults.value.filter(
          r => !imageIdsToProcess.has(r.imageId)
        );
        this.ocrResults.value = [...existingResults, ...results];
        this.isProcessing.value = false;

        return results;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: 'OCR 识别失败',
        context: options,
      }
    );

    // 确保处理状态被重置
    this.isProcessing.value = false;
    return result || [];
  }

  /**
   * 重试单个块的识别
   */
  public async retryBlock(
    options: RetryBlockOptions,
    onProgress?: (result: OcrResult) => void
  ): Promise<OcrResult | null> {
    return await errorHandler.wrapAsync(
      async () => {
        const resultIndex = this.ocrResults.value.findIndex((r) => r.blockId === options.blockId);
        if (resultIndex === -1) {
          throw new Error('未找到对应的识别结果');
        }

        const result = this.ocrResults.value[resultIndex];
        const imageId = result.imageId;

        const blocks = this.imageBlocksMap.value.get(imageId);
        if (!blocks) {
          throw new Error('未找到对应的图片块');
        }

        const block = blocks.find((b) => b.id === options.blockId);
        if (!block) {
          throw new Error('未找到对应的图片块');
        }

        // 更新状态为处理中
        this.ocrResults.value[resultIndex].status = 'processing';
        this.ocrResults.value[resultIndex].error = undefined;
        onProgress?.(this.ocrResults.value[resultIndex]);

        // 重新识别这个块
        const { runOcr } = useOcrRunner();
        const singleBlockResults = await runOcr(
          [block],
          this.engineConfig.value,
          (updatedResults: OcrResult[]) => {
            if (updatedResults.length > 0) {
              this.ocrResults.value[resultIndex] = {
                ...updatedResults[0],
                imageId,
              };
              onProgress?.(this.ocrResults.value[resultIndex]);
            }
          }
        );

        // 最终更新
        if (singleBlockResults.length > 0) {
          this.ocrResults.value[resultIndex] = {
            ...singleBlockResults[0],
            imageId,
          };
        }

        logger.info('重试识别完成', { blockId: options.blockId });
        return this.ocrResults.value[resultIndex];
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
  public toggleBlockIgnore(blockId: string): void {
    const result = this.ocrResults.value.find((r) => r.blockId === blockId);
    if (result) {
      result.ignored = !result.ignored;
      logger.info('切换忽略状态', { blockId, ignored: result.ignored });
    }
  }

  // ==================== 高级封装方法（Agent 调用接口）====================

  /**
   * 获取格式化的 OCR 结果摘要（推荐 Agent 使用）
   */
  public getFormattedOcrSummary(): FormattedOcrSummary {
    const totalImages = this.uploadedImages.value.length;
    const totalBlocks = this.ocrResults.value.length;
    const successBlocks = this.ocrResults.value.filter((r) => r.status === 'success').length;
    const errorBlocks = this.ocrResults.value.filter((r) => r.status === 'error').length;
    const ignoredBlocks = this.ocrResults.value.filter((r) => r.ignored).length;

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
        engineType: this.fullConfig.value.currentEngineType,
        results: this.ocrResults.value.map((r) => ({
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
}