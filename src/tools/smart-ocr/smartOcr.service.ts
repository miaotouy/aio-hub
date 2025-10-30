import type { ToolService } from '@/services/types';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import { OcrContext } from './OcrContext';
import type {
  FullOcrProcessOptions,
  RetryBlockOptions,
  FormattedOcrSummary,
} from './OcrContext';
import type { UploadedImage, OcrEngineConfig, SlicerConfig, OcrEngineType } from './types';
import { defaultSmartOcrConfig } from './config';
import { invoke } from '@tauri-apps/api/core';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { useOcrProfiles } from '@/composables/useOcrProfiles';
import { getTesseractLanguageOptions } from './language-packs';

const logger = createModuleLogger('services/smart-ocr');
const errorHandler = createModuleErrorHandler('services/smart-ocr');

// ==================== Agent 调用接口类型 ====================

export interface ProcessImagesOptions {
  /** 要识别的图片对象列表 */
  images: UploadedImage[];
  /** （可选）覆盖当前 OCR 引擎配置 */
  engineConfig?: Partial<OcrEngineConfig>;
  /** （可选）覆盖当前切图配置 */
  slicerConfig?: Partial<SlicerConfig>;
}

export interface ProcessImagesFromPathsOptions {
  /** 要识别的图片本地路径列表 */
  imagePaths: string[];
  /** （可选）覆盖当前 OCR 引擎配置 */
  engineConfig?: Partial<OcrEngineConfig>;
  /** （可选）覆盖当前切图配置 */
  slicerConfig?: Partial<SlicerConfig>;
}

// ==================== 服务类 ====================

/**
 * SmartOcr 服务
 * 
 * 提供两种调用模式：
 * 1. Agent/外部调用：通过高级封装的 `processImagesFromPaths` 方法，实现无状态、一次性调用。
 * 2. UI 调用：通过 `createContext` 方法获取一个有状态、响应式的 OcrContext 实例，用于复杂交互。
 */
export default class SmartOcrService implements ToolService {
  public readonly id = 'smart-ocr';
  public readonly name = '智能 OCR';
  public readonly description = '智能图片文字识别工具，支持多种 OCR 引擎和智能切图';

  // ==================== 高级封装方法 (Agent 调用接口) ====================

  /**
   * [推荐] 直接处理图片对象列表并返回识别摘要。
   * 适用于应用内部调用，图片对象已经准备好的场景。
   * 它在内部处理 OcrContext 的创建、配置、执行和销毁的完整生命周期。
   */
  public async processImages(
    options: ProcessImagesOptions
  ): Promise<FormattedOcrSummary | null> {
    logger.info('开始处理图片对象 (应用内部调用)', {
      imageCount: options.images.length,
    });

    return await errorHandler.wrapAsync(
      async () => {
        // 1. 创建并初始化临时的 Context
        const context = this.createContext();
        await context.initialize();

        // 2. 应用配置覆盖（如果提供）
        if (options.engineConfig) {
          const newEngineConfig = {
            ...context.engineConfig.value,
            ...options.engineConfig,
          } as OcrEngineConfig;
          await context.updateEngineConfig(newEngineConfig);
        }
        if (options.slicerConfig) {
          await context.updateSlicerConfig({
            ...context.slicerConfig.value,
            ...options.slicerConfig,
          });
        }

        // 3. 添加图片到上下文
        context.addImages(options.images);

        // 4. 执行完整的 OCR 流程
        await context.runFullOcrProcess();

        // 5. 返回格式化结果
        const summary = context.getFormattedOcrSummary();
        logger.info('处理图片对象完成', {
          summary: summary.summary,
        });

        // 临时的 context 会在此方法结束后被垃圾回收
        return summary;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '处理图片失败',
        context: { imageCount: options.images.length },
      }
    );
  }

  /**
   * [Agent Friendly] 从文件路径识别图片文字并返回摘要。
   * 这是一个高级封装方法，为 Agent 和外部调用者设计。
   * 它在内部处理 OcrContext 的创建、配置、执行和销毁的完整生命周期。
   */
  public async processImagesFromPaths(
    options: ProcessImagesFromPathsOptions
  ): Promise<FormattedOcrSummary | null> {
    logger.info('开始从文件路径处理图片 (Agent 调用)', {
      imageCount: options.imagePaths.length,
    });

    return await errorHandler.wrapAsync(
      async () => {
        // 1. 创建并初始化临时的 Context
        const context = this.createContext();
        await context.initialize();

        // 2. 应用配置覆盖（如果提供）
        if (options.engineConfig) {
          const newEngineConfig = {
            ...context.engineConfig.value,
            ...options.engineConfig,
          } as OcrEngineConfig; // 强制类型转换，因为我们相信合并后的结果是有效的
          await context.updateEngineConfig(newEngineConfig);
        }
        if (options.slicerConfig) {
          await context.updateSlicerConfig({
            ...context.slicerConfig.value,
            ...options.slicerConfig,
          });
        }

        // 3. 将文件路径转换为 UploadedImage 对象
        const uploadedImages: UploadedImage[] = [];
        for (const path of options.imagePaths) {
          const uploadedImage = await this.pathToUploadedImage(path);
          uploadedImages.push(uploadedImage);
        }
        context.addImages(uploadedImages);

        // 4. 执行完整的 OCR 流程
        await context.runFullOcrProcess();

        // 5. 返回格式化结果
        const summary = context.getFormattedOcrSummary();
        logger.info('从文件路径处理图片完成', {
          summary: summary.summary,
        });

        // 临时的 context 会在此方法结束后被垃圾回收
        return summary;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '从文件路径处理图片失败',
        context: options,
      }
    );
  }

  // ==================== UI/高级使用方法 ====================

  /**
   * [UI Facing] 创建一个新的 OCR 上下文实例。
   * 
   * 每个上下文实例都是独立的，拥有自己的响应式状态。
   * 主要供 UI 组件在挂载时创建，并在整个生命周期中使用。
   * 
   * @returns 新的 OcrContext 实例
   */
  public createContext(): OcrContext {
    const context = new OcrContext();
    logger.info('创建新的 OcrContext 实例');
    return context;
  }

  // ==================== 内部辅助方法 ====================

  /**
   * 内部辅助方法：将文件路径转换为 UploadedImage 对象。
   * @param path 文件路径
   * @returns Promise<UploadedImage>
   */
  private async pathToUploadedImage(path: string): Promise<UploadedImage> {
    const name = path.split(/[/\\]/).pop() || path;
    const contents = await invoke<number[]>('read_file_binary', { path });
    const file = new File([new Uint8Array(contents)], name);

    const id = `img-${Date.now()}-${Math.random()}`;
    const img = new Image();
    const dataUrl = URL.createObjectURL(file);
    
    return new Promise((resolve, reject) => {
      img.onload = () => {
        // 注意：理想情况下应在图片处理完后调用 URL.revokeObjectURL(dataUrl) 释放内存。
        // 由于 context 是临时的，在操作完成后会被垃圾回收，浏览器会自动处理。
        resolve({ id, name, file, img, size: file.size, dataUrl });
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(dataUrl); // 出错时立即释放
        reject(err);
      };
      img.src = dataUrl;
    });
  }

  // ==================== 引擎与参数信息查询 ====================

  /**
   * 获取所有可用的 OCR 引擎列表
   * 从配置中读取引擎信息
   */
  public getAvailableEngines(): Array<{
    type: OcrEngineType;
    name: string;
    description: string;
    isAvailable: boolean;
  }> {
    const configs = defaultSmartOcrConfig.engineConfigs;
    
    return [
      {
        type: 'tesseract',
        name: configs.tesseract.name,
        description: '基于 Tesseract.js 的开源 OCR 引擎，支持多种语言，完全本地运行',
        isAvailable: true,
      },
      {
        type: 'native',
        name: configs.native.name,
        description: 'Windows 系统自带的 OCR API，仅支持 Windows 10/11',
        isAvailable: true,
      },
      {
        type: 'vlm',
        name: configs.vlm.name,
        description: '使用视觉语言模型进行 OCR，支持复杂场景和自定义提示词',
        isAvailable: true,
      },
      {
        type: 'cloud',
        name: configs.cloud.name,
        description: '云端 OCR 服务（阿里云、百度、腾讯云等）',
        isAvailable: true,
      },
    ];
  }

  /**
   * 获取特定引擎的详细信息和参数说明
   * 从配置中读取默认值
   */
  public getEngineDetails(engineType: OcrEngineType): {
    type: OcrEngineType;
    name: string;
    description: string;
    parameters: Array<{
      name: string;
      type: string;
      description: string;
      required: boolean;
      defaultValue?: any;
      options?: string[];
    }>;
  } {
    const configs = defaultSmartOcrConfig.engineConfigs;
    
    switch (engineType) {
      case 'tesseract': {
        const config = configs.tesseract;
        return {
          type: 'tesseract',
          name: config.name,
          description: '基于 Tesseract.js 的开源 OCR 引擎',
          parameters: [
            {
              name: 'language',
              type: 'string',
              description: 'OCR 识别语言，可使用加号组合多种语言',
              required: true,
              defaultValue: config.language,
              options: ['chi_sim', 'eng', 'kor', 'rus', 'chi_sim+eng'],
            },
          ],
        };
      }

      case 'native': {
        const config = configs.native;
        return {
          type: 'native',
          name: config.name,
          description: 'Windows 系统自带的 OCR API',
          parameters: [
            // Native OCR 没有额外配置参数
          ],
        };
      }

      case 'vlm': {
        const config = configs.vlm;
        return {
          type: 'vlm',
          name: config.name,
          description: '使用视觉语言模型进行 OCR',
          parameters: [
            {
              name: 'profileId',
              type: 'string',
              description: 'LLM 配置文件 ID',
              required: true,
              defaultValue: config.profileId,
            },
            {
              name: 'modelId',
              type: 'string',
              description: 'LLM 模型 ID',
              required: true,
              defaultValue: config.modelId,
            },
            {
              name: 'prompt',
              type: 'string',
              description: 'OCR 识别提示词',
              required: true,
              defaultValue: config.prompt,
            },
            {
              name: 'temperature',
              type: 'number',
              description: '温度参数，控制输出的随机性（0-2）',
              required: false,
              defaultValue: config.temperature,
            },
            {
              name: 'maxTokens',
              type: 'number',
              description: '最大 token 数',
              required: false,
              defaultValue: config.maxTokens,
            },
            {
              name: 'concurrency',
              type: 'number',
              description: '并发请求数',
              required: false,
              defaultValue: config.concurrency,
            },
            {
              name: 'delay',
              type: 'number',
              description: '请求延迟（毫秒）',
              required: false,
              defaultValue: config.delay,
            },
          ],
        };
      }

      case 'cloud': {
        const config = configs.cloud;
        return {
          type: 'cloud',
          name: config.name,
          description: '云端 OCR 服务',
          parameters: [
            {
              name: 'activeProfileId',
              type: 'string',
              description: '当前选中的云端 OCR 服务配置 ID',
              required: true,
              defaultValue: config.activeProfileId,
            },
          ],
        };
      }

      default:
        // 确保类型安全，虽然理论上不会到达这里
        throw new Error(`未知的引擎类型: ${engineType}`);
    }
  }

  /**
   * [统一方法] 获取指定 OCR 引擎的可用选项列表。
   * 根据引擎类型，返回不同的可用资源：
   * - 'vlm': 返回支持视觉的 LLM 模型扁平列表。
   * - 'cloud': 返回已配置的云 OCR 服务渠道。
   * - 'tesseract': 返回可用的 Tesseract 语言包。
   * - 'native': 返回空数组，因为没有可配置选项。
   */
  public getEngineAvailableOptions(engineType: OcrEngineType): any[] {
    switch (engineType) {
      case 'vlm': {
        const { visionProfiles } = useLlmProfiles();
        const models = [];
        for (const profile of visionProfiles.value) {
          for (const model of profile.models) {
            models.push({
              id: model.id,
              name: `${profile.name} - ${model.name}`,
              profileId: profile.id,
              modelId: model.id,
            });
          }
        }
        return models;
      }
      
      case 'cloud': {
        const { enabledProfiles } = useOcrProfiles();
        return enabledProfiles.value.map(profile => ({
          id: profile.id,
          name: profile.name,
          provider: profile.provider,
        }));
      }

      case 'tesseract': {
        // 动态获取可用的 Tesseract 语言包选项
        return getTesseractLanguageOptions();
      }

      case 'native':
      default:
        return [];
    }
  }

  /**
   * 获取智能切图配置的参数说明
   * 从配置中读取默认值
   */
  public getSlicerConfigDetails(): {
    name: string;
    description: string;
    parameters: Array<{
      name: string;
      type: string;
      description: string;
      required: boolean;
      defaultValue?: any;
      range?: { min: number; max: number };
    }>;
  } {
    const config = defaultSmartOcrConfig.slicerConfig;
    
    return {
      name: '智能切图配置',
      description: '自动检测图片中的空白区域并切割成多个块，提高 OCR 识别效率',
      parameters: [
        {
          name: 'enabled',
          type: 'boolean',
          description: '是否启用智能切图',
          required: true,
          defaultValue: config.enabled,
        },
        {
          name: 'aspectRatioThreshold',
          type: 'number',
          description: '长宽比阈值，超过此值才触发切图',
          required: true,
          defaultValue: config.aspectRatioThreshold,
          range: { min: 1, max: 10 },
        },
        {
          name: 'blankThreshold',
          type: 'number',
          description: '空白行判定阈值：方差低于中位数的此比例视为空白行（0-1）',
          required: true,
          defaultValue: config.blankThreshold,
          range: { min: 0, max: 1 },
        },
        {
          name: 'minBlankHeight',
          type: 'number',
          description: '最小空白横带高度（像素）',
          required: true,
          defaultValue: config.minBlankHeight,
          range: { min: 1, max: 100 },
        },
        {
          name: 'minCutHeight',
          type: 'number',
          description: '最小切割块高度（像素），小于此高度的块会被跳过',
          required: true,
          defaultValue: config.minCutHeight,
          range: { min: 100, max: 2000 },
        },
        {
          name: 'cutLineOffset',
          type: 'number',
          description: '切割线偏移（-1到1，0为居中，负值向上偏移，正值向下偏移）',
          required: true,
          defaultValue: config.cutLineOffset,
          range: { min: -1, max: 1 },
        },
      ],
    };
  }

  // ==================== 元数据 ====================

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'processImages',
          description: '[推荐-应用内部] 直接处理图片对象列表，一步到位返回识别结果。适用于图片已在内存中的场景。',
          parameters: [
            {
              name: 'options',
              type: 'ProcessImagesOptions',
              description: '处理选项',
              properties: [
                {
                  name: 'images',
                  type: 'UploadedImage[]',
                  description: '要识别的图片对象列表',
                },
                {
                  name: 'engineConfig',
                  type: 'Partial<OcrEngineConfig>',
                  description: '（可选）覆盖当前 OCR 引擎配置',
                  optional: true,
                },
                {
                  name: 'slicerConfig',
                  type: 'Partial<SlicerConfig>',
                  description: '（可选）覆盖当前切图配置',
                  optional: true,
                },
              ],
            },
          ],
          returnType: 'Promise<FormattedOcrSummary | null>',
          example: `
const summary = await service.processImages({
  images: uploadedImagesList, // 已上传的图片对象数组
  engineConfig: {
    type: 'native',
    language: 'zh-Hans'
  }
});

if (summary) {
  console.log(summary.summary);
  console.log(summary.details.successCount);
}`,
        },
        {
          name: 'processImagesFromPaths',
          description: '[Agent调用] 从文件路径识别图片文字，一步到位返回结果。适用于 Agent 或外部调用。',
          parameters: [
            {
              name: 'options',
              type: 'ProcessImagesFromPathsOptions',
              description: '处理选项',
              properties: [
                {
                  name: 'imagePaths',
                  type: 'string[]',
                  description: '要识别的图片本地路径列表',
                },
                {
                  name: 'engineConfig',
                  type: 'Partial<OcrEngineConfig>',
                  description: '（可选）覆盖当前 OCR 引擎配置',
                  optional: true,
                },
                {
                  name: 'slicerConfig',
                  type: 'Partial<SlicerConfig>',
                  description: '（可选）覆盖当前切图配置',
                  optional: true,
                },
              ],
            },
          ],
          returnType: 'Promise<FormattedOcrSummary | null>',
          example: `
const summary = await service.processImagesFromPaths({
  imagePaths: ['C:/Users/Miaomiao/Desktop/screenshot.png'],
  engineConfig: {
    type: 'vlm',
    prompt: '请详细识别图中的所有文字内容'
  }
});

if (summary) {
  console.log(summary.summary);
  // "OCR 识别完成: 5/5 块成功识别"
}`,
        },
        {
          name: 'getAvailableEngines',
          description: '获取所有可用的 OCR 引擎列表',
          parameters: [],
          returnType: 'Array<{ type: OcrEngineType; name: string; description: string; isAvailable: boolean }>',
          example: `
const engines = service.getAvailableEngines();
console.log(engines);
// [
//   { type: 'tesseract', name: 'Tesseract.js', description: '...', isAvailable: true },
//   { type: 'native', name: 'Windows Native OCR', description: '...', isAvailable: true },
//   ...
// ]`,
        },
        {
          name: 'getEngineDetails',
          description: '获取特定引擎的详细信息和参数说明',
          parameters: [
            {
              name: 'engineType',
              type: 'OcrEngineType',
              description: '引擎类型（tesseract | native | vlm | cloud）',
            },
          ],
          returnType: 'EngineDetails',
          example: `
const details = service.getEngineDetails('vlm');
console.log(details.parameters);
// [
//   { name: 'profileId', type: 'string', description: '...', required: true },
//   { name: 'modelId', type: 'string', description: '...', required: true },
//   ...
// ]`,
        },
        {
          name: 'getEngineAvailableOptions',
          description: '[统一方法] 获取指定 OCR 引擎的可用选项列表。根据引擎类型返回不同资源：VLM 模型扁平列表、云 OCR 渠道、Tesseract 语言包。',
          parameters: [
            {
              name: 'engineType',
              type: 'OcrEngineType',
              description: '引擎类型（tesseract | native | vlm | cloud）',
            },
          ],
          returnType: 'any[]',
          example: `
// 获取 VLM 引擎的可用模型（扁平列表）
const vlmOptions = service.getEngineAvailableOptions('vlm');
console.log(vlmOptions);
// [
//   { id: 'gpt-4o', name: 'OpenAI - GPT-4o', profileId: 'llm-profile-xxx', modelId: 'gpt-4o' },
//   { id: 'gpt-4-vision-preview', name: 'OpenAI - GPT-4 Vision Preview', profileId: 'llm-profile-xxx', modelId: 'gpt-4-vision-preview' },
//   { id: 'gemini-2.0-flash-exp', name: 'Google - Gemini 2.0 Flash', profileId: 'llm-profile-yyy', modelId: 'gemini-2.0-flash-exp' }
// ]

// 获取云 OCR 服务的可用渠道
const cloudOptions = service.getEngineAvailableOptions('cloud');
// [
//   { id: 'ocr-profile-xxx', name: '我的百度OCR', provider: 'baidu' }
// ]

// 获取 Tesseract 的可用语言
const tesseractOptions = service.getEngineAvailableOptions('tesseract');
// [
//   { id: 'chi_sim', name: '简体中文' },
//   { id: 'eng', name: '英语' }
// ]`,
        },
        {
          name: 'getSlicerConfigDetails',
          description: '获取智能切图配置的参数说明',
          parameters: [],
          returnType: 'SlicerConfigDetails',
          example: `
const slicerDetails = service.getSlicerConfigDetails();
console.log(slicerDetails.parameters);
// [
//   { name: 'enabled', type: 'boolean', description: '...', defaultValue: true },
//   { name: 'aspectRatioThreshold', type: 'number', description: '...', defaultValue: 3 },
//   ...
// ]`,
        },
      ],
    };
  }
}

// ==================== 类型导出 ====================

export type { FullOcrProcessOptions, RetryBlockOptions, FormattedOcrSummary };