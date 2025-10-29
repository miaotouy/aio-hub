import type { ToolService } from '@/services/types';
import { createModuleLogger } from '@/utils/logger';
import { OcrContext } from './OcrContext';
import type {
  FullOcrProcessOptions,
  RetryBlockOptions,
  FormattedOcrSummary,
} from './OcrContext';

const logger = createModuleLogger('services/smart-ocr');

// ==================== 服务类 ====================

/**
 * SmartOcr 服务 - 无状态工厂
 * 
 * 这个服务不维护任何状态，只负责创建独立的 OcrContext 实例。
 * 每个消费者（UI 或 Agent）都应该通过 createContext() 获得自己的上下文实例。
 */
export default class SmartOcrService implements ToolService {
  public readonly id = 'smart-ocr';
  public readonly name = '智能 OCR';
  public readonly description = '智能图片文字识别工具，支持多种 OCR 引擎和智能切图';

  // ==================== 上下文工厂 ====================

  /**
   * 创建一个新的 OCR 上下文实例
   * 
   * 每个上下文实例都是独立的，拥有自己的响应式状态。
   * UI 组件应该在挂载时创建上下文，并在整个生命周期中使用它。
   * Agent 调用时应该为每个任务创建独立的上下文。
   * 
   * @returns 新的 OcrContext 实例
   */
  public createContext(): OcrContext {
    const context = new OcrContext();
    logger.info('创建新的 OcrContext 实例');
    return context;
  }

  // ==================== 元数据 ====================

  /**
   * 获取服务元数据（仅包含对外公开的高级接口）
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'createContext',
          description: '创建一个新的 OCR 上下文实例（推荐所有调用者使用）',
          parameters: [],
          returnType: 'OcrContext',
          example: `
// UI 组件使用示例
const ocrContext = service.createContext();
await ocrContext.initialize();

// 添加图片
ocrContext.addImages([image1, image2]);

// 执行 OCR
const results = await ocrContext.runFullOcrProcess({}, (progress) => {
  console.log('进度更新', progress);
});

// 获取格式化摘要
const summary = ocrContext.getFormattedOcrSummary();`,
        },
      ],
      contextMethods: [
        {
          name: 'initialize',
          description: '初始化上下文，加载配置',
          parameters: [],
          returnType: 'Promise<void>',
          example: 'await context.initialize();',
        },
        {
          name: 'addImages',
          description: '添加上传的图片',
          parameters: [
            {
              name: 'images',
              type: 'UploadedImage[]',
              description: '图片列表',
            },
          ],
          returnType: 'void',
          example: 'context.addImages([image1, image2]);',
        },
        {
          name: 'removeImage',
          description: '删除图片',
          parameters: [
            {
              name: 'imageId',
              type: 'string',
              description: '图片ID',
            },
          ],
          returnType: 'void',
          example: "context.removeImage('img-1');",
        },
        {
          name: 'clearAllImages',
          description: '清除所有图片',
          parameters: [],
          returnType: 'void',
          example: 'context.clearAllImages();',
        },
        {
          name: 'sliceImage',
          description: '切割单张图片',
          parameters: [
            {
              name: 'imageId',
              type: 'string',
              description: '图片ID',
            },
          ],
          returnType: 'Promise<{ blocks: ImageBlock[]; lines: CutLine[] } | null>',
          example: "const result = await context.sliceImage('img-1');",
        },
        {
          name: 'sliceAllImages',
          description: '切割所有图片',
          parameters: [],
          returnType: 'Promise<void>',
          example: 'await context.sliceAllImages();',
        },
        {
          name: 'runFullOcrProcess',
          description: '执行完整的 OCR 流程（切图 + 识别）',
          parameters: [
            {
              name: 'options',
              type: 'FullOcrProcessOptions',
              description: '处理选项',
              properties: [
                {
                  name: 'imageIds',
                  type: 'string[]',
                  description: '要处理的图片ID列表（可选）',
                },
              ],
            },
            {
              name: 'onProgress',
              type: '(results: OcrResult[]) => void',
              description: '进度回调（可选）',
            },
          ],
          returnType: 'Promise<OcrResult[]>',
          example: `const results = await context.runFullOcrProcess({}, (progress) => {
  console.log('进度更新', progress);
});`,
        },
        {
          name: 'retryBlock',
          description: '重试单个块的识别',
          parameters: [
            {
              name: 'options',
              type: 'RetryBlockOptions',
              description: '重试选项',
              properties: [
                {
                  name: 'blockId',
                  type: 'string',
                  description: '要重试的块ID',
                },
              ],
            },
            {
              name: 'onProgress',
              type: '(result: OcrResult) => void',
              description: '进度回调（可选）',
            },
          ],
          returnType: 'Promise<OcrResult | null>',
          example: "const result = await context.retryBlock({ blockId: 'block-1' });",
        },
        {
          name: 'toggleBlockIgnore',
          description: '切换块的忽略状态',
          parameters: [
            {
              name: 'blockId',
              type: 'string',
              description: '块ID',
            },
          ],
          returnType: 'void',
          example: "context.toggleBlockIgnore('block-1');",
        },
        {
          name: 'updateEngineConfig',
          description: '更新引擎配置',
          parameters: [
            {
              name: 'config',
              type: 'OcrEngineConfig',
              description: '新的引擎配置',
            },
          ],
          returnType: 'Promise<void>',
          example: "await context.updateEngineConfig({ type: 'tesseract', language: 'chi_sim+eng' });",
        },
        {
          name: 'updateSlicerConfig',
          description: '更新切图配置',
          parameters: [
            {
              name: 'config',
              type: 'SlicerConfig',
              description: '新的切图配置',
            },
          ],
          returnType: 'Promise<void>',
          example: 'await context.updateSlicerConfig({ minBlockHeight: 30 });',
        },
        {
          name: 'getFormattedOcrSummary',
          description: '获取格式化的 OCR 结果摘要（推荐 Agent 使用）',
          parameters: [],
          returnType: 'FormattedOcrSummary',
          example: `const summary = context.getFormattedOcrSummary();
// 返回: { summary, details: { totalImages, totalBlocks, successBlocks, ... } }`,
        },
      ],
      reactiveProperties: [
        {
          name: 'uploadedImages',
          type: 'Ref<UploadedImage[]>',
          description: '已上传的图片列表（响应式）',
        },
        {
          name: 'imageBlocksMap',
          type: 'Ref<Map<string, ImageBlock[]>>',
          description: '图片切割块映射表（响应式）',
        },
        {
          name: 'cutLinesMap',
          type: 'Ref<Map<string, CutLine[]>>',
          description: '图片切割线映射表（响应式）',
        },
        {
          name: 'ocrResults',
          type: 'Ref<OcrResult[]>',
          description: 'OCR 识别结果列表（响应式）',
        },
        {
          name: 'isProcessing',
          type: 'Ref<boolean>',
          description: '是否正在处理中（响应式）',
        },
        {
          name: 'engineConfig',
          type: 'ComputedRef<OcrEngineConfig>',
          description: '当前引擎配置（计算属性）',
        },
        {
          name: 'slicerConfig',
          type: 'ComputedRef<SlicerConfig>',
          description: '切图配置（计算属性）',
        },
      ],
    };
  }
}

// ==================== 类型导出 ====================

export type { FullOcrProcessOptions, RetryBlockOptions, FormattedOcrSummary };