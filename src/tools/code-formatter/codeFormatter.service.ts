import type { ToolService } from '@/services/types';
import { createModuleLogger } from '@/utils/logger';

// prettier standalone 版本（浏览器兼容）
import * as prettier from 'prettier/standalone';
import * as parserBabel from 'prettier/plugins/babel';
import * as parserHtml from 'prettier/plugins/html';
import * as parserCss from 'prettier/plugins/postcss';
import * as parserMarkdown from 'prettier/plugins/markdown';
import * as parserTypeScript from 'prettier/plugins/typescript';
import * as parserEstree from 'prettier/plugins/estree';

const logger = createModuleLogger('services/code-formatter');

// 缓存动态加载的插件
let prettierPluginPhp: any = null;
let prettierPluginXml: any = null;

/**
 * 代码格式化选项
 */
export interface FormatOptions {
  /** 使用单引号 */
  singleQuote?: boolean;
  /** 尾随逗号 */
  trailingComma?: 'none' | 'es5' | 'all';
  /** 额外的 Prettier 选项 */
  [key: string]: any;
}

/**
 * 代码格式化结果
 */
export interface FormatResult {
  /** 格式化后的代码 */
  formatted: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
  /** 警告信息（如果有） */
  warning?: string;
}

/**
 * 支持的语言类型
 */
export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'html'
  | 'css'
  | 'markdown'
  | 'php'
  | 'xml'
  | 'yaml';

/**
 * 语言配置接口
 */
interface LanguageConfig {
  plugins: any[];
  parser: string;
  additionalOptions?: any;
  unsupported?: boolean;
  warningMessage?: string;
}

/**
 * CodeFormatter 服务
 * 提供多语言代码格式化功能，基于 Prettier
 */
export default class CodeFormatterService implements ToolService {
  public readonly id = 'code-formatter';
  public readonly name = '代码格式化工具';
  public readonly description = '提供多语言代码格式化功能，基于 Prettier';

  /**
   * 格式化代码
   * @param code 要格式化的代码
   * @param language 代码语言
   * @param options 格式化选项
   * @returns 格式化结果
   */
  public async formatCode(
    code: string,
    language: SupportedLanguage,
    options: FormatOptions = {}
  ): Promise<FormatResult> {
    logger.debug('开始格式化代码', {
      codeLength: code.length,
      language,
      options,
    });

    if (!code.trim()) {
      return {
        formatted: '',
        success: true,
      };
    }

    try {
      // 获取语言配置
      const config = await this.getLanguageConfig(language);

      // 如果语言不支持，返回原始代码和警告
      if (config.unsupported) {
        logger.warn('语言格式化不支持', { language });
        return {
          formatted: code,
          success: true,
          warning: config.warningMessage || `${language} 格式化暂不支持`,
        };
      }

      // 合并格式化选项
      const formatOptions = {
        parser: config.parser,
        plugins: config.plugins,
        singleQuote: options.singleQuote ?? true,
        trailingComma: options.trailingComma ?? 'es5',
        ...config.additionalOptions,
        ...options,
      };

      // 执行格式化
      const formatted = await prettier.format(code, formatOptions);

      logger.info('代码格式化成功', {
        language,
        inputLength: code.length,
        outputLength: formatted.length,
      });

      return {
        formatted,
        success: true,
      };
    } catch (error: any) {
      const errorMessage = `格式化错误: ${error.message}`;
      logger.error('代码格式化失败', { language, error });

      return {
        formatted: code, // 返回原始代码
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 获取语言配置
   * @param language 语言类型
   * @returns 语言配置
   */
  private async getLanguageConfig(
    language: SupportedLanguage
  ): Promise<LanguageConfig> {
    switch (language) {
      // 前端语言
      case 'javascript':
      case 'typescript':
        return {
          plugins: [parserBabel, parserEstree, parserTypeScript],
          parser: language === 'typescript' ? 'typescript' : 'babel',
        };

      case 'json':
        return {
          plugins: [parserBabel, parserEstree],
          parser: 'json',
        };

      case 'html':
        return {
          plugins: [parserHtml],
          parser: 'html',
        };

      case 'css':
        return {
          plugins: [parserCss],
          parser: 'css',
        };

      case 'markdown':
        return {
          plugins: [parserMarkdown],
          parser: 'markdown',
        };

      // 后端语言
      case 'php':
        // 动态导入 PHP 插件
        if (!prettierPluginPhp) {
          try {
            prettierPluginPhp = await import('@prettier/plugin-php/standalone');
            logger.info('PHP 插件加载成功');
          } catch (e) {
            logger.error('PHP 插件加载失败', e);
            return {
              plugins: [],
              parser: '',
              unsupported: true,
              warningMessage: 'PHP 格式化插件加载失败',
            };
          }
        }
        return {
          plugins: [prettierPluginPhp],
          parser: 'php',
        };

      // 配置/数据语言
      case 'xml':
        // 动态导入 XML 插件
        if (!prettierPluginXml) {
          try {
            prettierPluginXml = await import('@prettier/plugin-xml');
            logger.info('XML 插件加载成功');
          } catch (e) {
            logger.error('XML 插件加载失败', e);
            return {
              plugins: [],
              parser: '',
              unsupported: true,
              warningMessage: 'XML 格式化插件加载失败（模块格式不兼容）',
            };
          }
        }
        return {
          plugins: [prettierPluginXml],
          parser: 'xml',
          additionalOptions: {
            xmlWhitespaceSensitivity: 'ignore',
          },
        };

      case 'yaml':
        return {
          plugins: [parserBabel, parserEstree],
          parser: 'yaml',
        };

      default:
        logger.warn('不支持的语言', { language });
        return {
          plugins: [],
          parser: '',
          unsupported: true,
          warningMessage: `不支持的语言: ${language}`,
        };
    }
  }

  /**
   * 检测代码语言
   * 简单的语言检测逻辑，基于代码特征
   * @param code 代码内容
   * @returns 检测到的语言类型
   */
  public detectLanguage(code: string): SupportedLanguage {
    const trimmedCode = code.trim();

    // JSON 检测
    if (
      (trimmedCode.startsWith('{') && trimmedCode.endsWith('}')) ||
      (trimmedCode.startsWith('[') && trimmedCode.endsWith(']'))
    ) {
      try {
        JSON.parse(trimmedCode);
        return 'json';
      } catch {
        // 不是有效的 JSON，继续检测
      }
    }

    // HTML 检测
    if (trimmedCode.startsWith('<!DOCTYPE') || trimmedCode.startsWith('<html')) {
      return 'html';
    }

    // XML 检测
    if (trimmedCode.startsWith('<?xml')) {
      return 'xml';
    }

    // PHP 检测
    if (trimmedCode.startsWith('<?php')) {
      return 'php';
    }

    // Markdown 检测
    if (trimmedCode.includes('# ') || trimmedCode.includes('## ')) {
      return 'markdown';
    }

    // CSS 检测
    if (
      trimmedCode.includes('{') &&
      trimmedCode.includes('}') &&
      (trimmedCode.includes(':') || trimmedCode.includes(';'))
    ) {
      // 简单的 CSS 特征检测
      const hasSelectors = /[.#]\w+\s*\{/.test(trimmedCode);
      if (hasSelectors) {
        return 'css';
      }
    }

    // TypeScript 检测
    if (
      trimmedCode.includes('interface ') ||
      trimmedCode.includes('type ') ||
      trimmedCode.includes(': string') ||
      trimmedCode.includes(': number')
    ) {
      return 'typescript';
    }

    // 默认 JavaScript
    return 'javascript';
  }

  /**
   * 获取支持的语言列表
   * @returns 支持的语言列表
   */
  public getSupportedLanguages(): Array<{
    value: SupportedLanguage;
    label: string;
    group: string;
  }> {
    return [
      // 前端语言
      { value: 'javascript', label: 'JavaScript', group: '前端语言' },
      { value: 'typescript', label: 'TypeScript', group: '前端语言' },
      { value: 'json', label: 'JSON', group: '前端语言' },
      { value: 'html', label: 'HTML', group: '前端语言' },
      { value: 'css', label: 'CSS', group: '前端语言' },
      // 后端语言
      { value: 'php', label: 'PHP', group: '后端语言' },
      // 配置/数据
      { value: 'xml', label: 'XML', group: '配置/数据' },
      { value: 'yaml', label: 'YAML', group: '配置/数据' },
      // 标记语言
      { value: 'markdown', label: 'Markdown', group: '标记语言' },
    ];
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