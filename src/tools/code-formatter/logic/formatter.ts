import * as prettier from 'prettier/standalone';
import * as parserBabel from 'prettier/plugins/babel';
import * as parserHtml from 'prettier/plugins/html';
import * as parserCss from 'prettier/plugins/postcss';
import * as parserMarkdown from 'prettier/plugins/markdown';
import * as parserTypeScript from 'prettier/plugins/typescript';
import * as parserEstree from 'prettier/plugins/estree';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import type { FormatOptions, FormatResult, SupportedLanguage } from '../types';

const logger = createModuleLogger('tools/code-formatter/logic');
const errorHandler = createModuleErrorHandler('tools/code-formatter/logic');

// 缓存动态加载的插件
let prettierPluginPhp: any = null;
let prettierPluginXml: any = null;

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
 * 代码格式化核心逻辑
 */
export class FormatterCore {
  /**
   * 格式化代码
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
      const config = await this.getLanguageConfig(language);

      if (config.unsupported) {
        logger.warn('语言格式化不支持', { language });
        return {
          formatted: code,
          success: true,
          warning: config.warningMessage || `${language} 格式化暂不支持`,
        };
      }

      const formatOptions = {
        parser: config.parser,
        plugins: config.plugins,
        singleQuote: options.singleQuote ?? true,
        trailingComma: options.trailingComma ?? 'es5',
        ...config.additionalOptions,
        ...options,
      };

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
      errorHandler.error(error, '代码格式化失败', { context: { language } });

      return {
        formatted: code,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 获取语言配置
   */
  private async getLanguageConfig(
    language: SupportedLanguage
  ): Promise<LanguageConfig> {
    switch (language) {
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

      case 'php':
        if (!prettierPluginPhp) {
          try {
            prettierPluginPhp = await import('@prettier/plugin-php/standalone');
            logger.info('PHP 插件加载成功');
          } catch (e) {
            errorHandler.error(e, 'PHP 插件加载失败');
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

      case 'xml':
        if (!prettierPluginXml) {
          try {
            prettierPluginXml = await import('@prettier/plugin-xml');
            logger.info('XML 插件加载成功');
          } catch (e) {
            errorHandler.error(e, 'XML 插件加载失败');
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
   */
  public detectLanguage(code: string): SupportedLanguage {
    const trimmedCode = code.trim();

    if (
      (trimmedCode.startsWith('{') && trimmedCode.endsWith('}')) ||
      (trimmedCode.startsWith('[') && trimmedCode.endsWith(']'))
    ) {
      try {
        JSON.parse(trimmedCode);
        return 'json';
      } catch {
        // ignore
      }
    }

    if (trimmedCode.startsWith('<!DOCTYPE') || trimmedCode.startsWith('<html')) {
      return 'html';
    }

    if (trimmedCode.startsWith('<?xml')) {
      return 'xml';
    }

    if (trimmedCode.startsWith('<?php')) {
      return 'php';
    }

    if (trimmedCode.includes('# ') || trimmedCode.includes('## ')) {
      return 'markdown';
    }

    if (
      trimmedCode.includes('{') &&
      trimmedCode.includes('}') &&
      (trimmedCode.includes(':') || trimmedCode.includes(';'))
    ) {
      const hasSelectors = /[.#]\w+\s*\{/.test(trimmedCode);
      if (hasSelectors) {
        return 'css';
      }
    }

    if (
      trimmedCode.includes('interface ') ||
      trimmedCode.includes('type ') ||
      trimmedCode.includes(': string') ||
      trimmedCode.includes(': number')
    ) {
      return 'typescript';
    }

    return 'javascript';
  }

  /**
   * 获取支持的语言列表
   */
  public getSupportedLanguages(): Array<{
    value: SupportedLanguage;
    label: string;
    group: string;
  }> {
    return [
      { value: 'javascript', label: 'JavaScript', group: '前端语言' },
      { value: 'typescript', label: 'TypeScript', group: '前端语言' },
      { value: 'json', label: 'JSON', group: '前端语言' },
      { value: 'html', label: 'HTML', group: '前端语言' },
      { value: 'css', label: 'CSS', group: '前端语言' },
      { value: 'php', label: 'PHP', group: '后端语言' },
      { value: 'xml', label: 'XML', group: '配置/数据' },
      { value: 'yaml', label: 'YAML', group: '配置/数据' },
      { value: 'markdown', label: 'Markdown', group: '标记语言' },
    ];
  }
}

export const formatterCore = new FormatterCore();