import type { ToolRegistry, ServiceMetadata, ToolConfig } from '@/services/types';
import { markRaw } from 'vue';
import TextDiffIcon from '@/components/icons/TextDiffIcon.vue';
import { createModuleLogger } from '@/utils/logger';
import { loadFile, generatePatch } from './engine';
import type { FileReadResult, PatchOptions, PatchResult } from './types';

const logger = createModuleLogger('services/text-diff');

/**
 * TextDiff 服务
 * 提供文本差异对比的核心功能，供其他工具和 Agent 调用
 */
export default class TextDiffRegistry implements ToolRegistry {
  public readonly id = 'text-diff';
  public readonly name = '文本差异对比工具';
  public readonly description = '提供文本差异对比的文件操作、补丁生成等功能';

  /**
   * 加载文件内容
   * @param filePath 文件路径
   * @returns 文件读取结果
   */
  public async loadFile(filePath: string): Promise<FileReadResult> {
    logger.info('加载文件', { filePath });
    return await loadFile(filePath);
  }

  /**
   * 生成统一 diff 补丁
   * @param oldText 旧文本
   * @param newText 新文本
   * @param options 补丁选项
   * @returns 补丁生成结果
   */
  public generatePatch(
    oldText: string,
    newText: string,
    options?: PatchOptions
  ): PatchResult {
    logger.info('生成补丁', { options });
    return generatePatch(oldText, newText, options);
  }

  /**
   * 获取服务元数据
   */
  public getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: 'loadFile',
          description: '加载指定路径的文件',
          parameters: [
            {
              name: 'filePath',
              type: 'string',
              description: '文件路径',
              required: true,
            },
          ],
          returnType: 'Promise<FileReadResult>',
          example: `
const result = await service.loadFile('/path/to/file.txt');
// 返回: { content, filePath, fileName, language, success }`,
        },
        {
          name: 'generatePatch',
          description: '生成统一 diff 补丁',
          parameters: [
            {
              name: 'oldText',
              type: 'string',
              description: '旧文本',
              required: true,
            },
            {
              name: 'newText',
              type: 'string',
              description: '新文本',
              required: true,
            },
            {
              name: 'options',
              type: 'PatchOptions',
              description: '补丁选项',
              required: false,
              properties: [
                {
                  name: 'oldFileName',
                  type: 'string',
                  description: '旧文件名',
                  required: false,
                  defaultValue: 'original',
                },
                {
                  name: 'newFileName',
                  type: 'string',
                  description: '新文件名',
                  required: false,
                  defaultValue: 'modified',
                },
                {
                  name: 'ignoreWhitespace',
                  type: 'boolean',
                  description: '是否忽略行尾空白',
                  required: false,
                  defaultValue: true,
                },
                {
                  name: 'context',
                  type: 'number',
                  description: '上下文行数',
                  required: false,
                  defaultValue: 3,
                },
              ],
            },
          ],
          returnType: 'PatchResult',
          example: `
const result = service.generatePatch(
  'old content',
  'new content',
  { oldFileName: 'old.txt', newFileName: 'new.txt' }
);
// 返回: { patch, success, error? }`,
        },
      ],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: '文本差异对比',
  path: '/text-diff',
  icon: markRaw(TextDiffIcon),
  component: () => import('./TextDiff.vue'),
  description: '对比文本文件的差异',
  category: '文本处理'
};