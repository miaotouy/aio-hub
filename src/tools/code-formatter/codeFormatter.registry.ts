import type { ToolRegistry, ToolConfig } from '@/services/types';
import { markRaw } from 'vue';
import { Setting } from '@element-plus/icons-vue';
import { formatterCore } from './logic/formatter';
import type { SupportedLanguage, FormatOptions, FormatResult } from './types';

/**
 * CodeFormatter 注册器
 * 提供多语言代码格式化功能，基于 Prettier
 */
export default class CodeFormatterRegistry implements ToolRegistry {
  public readonly id = 'code-formatter';
  public readonly name = '代码格式化工具';
  public readonly description = '提供多语言代码格式化功能，基于 Prettier';

  /**
   * 格式化代码
   */
  public async formatCode(
    code: string,
    language: SupportedLanguage,
    options: FormatOptions = {}
  ): Promise<FormatResult> {
    return formatterCore.formatCode(code, language, options);
  }

  /**
   * 检测代码语言
   */
  public detectLanguage(code: string): SupportedLanguage {
    return formatterCore.detectLanguage(code);
  }

  /**
   * 获取支持的语言列表
   */
  public getSupportedLanguages(): Array<{
    value: SupportedLanguage;
    label: string;
    group: string;
  }> {
    return formatterCore.getSupportedLanguages();
  }

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'formatCode',
          description: '格式化代码，支持多种编程语言',
          parameters: [
            {
              name: 'code',
              type: 'string',
              description: '要格式化的代码',
              required: true,
            },
            {
              name: 'language',
              type: 'SupportedLanguage',
              description: '代码语言类型',
              required: true,
            },
            {
              name: 'options',
              type: 'FormatOptions',
              description: '格式化选项',
              required: false,
              properties: [
                {
                  name: 'singleQuote',
                  type: 'boolean',
                  description: '使用单引号，默认 true',
                  required: false,
                  defaultValue: true,
                },
                {
                  name: 'trailingComma',
                  type: "'none' | 'es5' | 'all'",
                  description: '尾随逗号，默认 es5',
                  required: false,
                  defaultValue: 'es5',
                },
              ],
            },
          ],
          returnType: 'Promise<FormatResult>',
        },
        {
          name: 'detectLanguage',
          description: '检测代码语言',
          parameters: [
            {
              name: 'code',
              type: 'string',
              description: '代码内容',
              required: true,
            },
          ],
          returnType: 'SupportedLanguage',
        },
        {
          name: 'getSupportedLanguages',
          description: '获取支持的语言列表',
          parameters: [],
          returnType: 'Array<{value: SupportedLanguage, label: string, group: string}>',
        },
      ],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: '代码格式化',
  path: '/code-formatter',
  icon: markRaw(Setting),
  component: () => import('./CodeFormatter.vue'),
  description: '格式化各种编程语言代码',
  category: '文本处理'
};