import type { ToolRegistry } from '@/services/types';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const logger = createModuleLogger('tools/json-formatter');
const errorHandler = createModuleErrorHandler('tools/json-formatter');

/**
 * JSON 格式化选项
 */
export interface FormatOptions {
  /** 展开层级深度（1-10） */
  expandDepth?: number;
  /** 每层缩进空格数 */
  indentSize?: number;
}

/**
 * JSON 格式化结果
 */
export interface FormatResult {
  /** 格式化后的 JSON 字符串 */
  formatted: string;
  /** 解析后的 JSON 对象 */
  parsed: any;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * JSON 解析结果
 */
export interface ParseResult {
  /** 解析后的对象 */
  data: any;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 文件读取结果
 */
export interface FileReadResult {
  /** 文件内容 */
  content: string;
  /** 文件名 */
  fileName: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * JsonFormatter 注册器
 * 提供 JSON 解析、格式化和文件处理功能
 */
export default class JsonFormatterRegistry implements ToolRegistry {
  public readonly id = 'json-formatter';
  public readonly name = 'JSON 格式化工具';
  public readonly description = '提供 JSON 解析、格式化和美化功能，支持自定义展开层级';

  /**
   * 解析 JSON 字符串
   * @param text JSON 字符串
   * @returns 解析结果
   */
  public parseJson(text: string): ParseResult {
    logger.debug('开始解析 JSON', { textLength: text.length });

    if (!text.trim()) {
      return {
        data: null,
        success: false,
        error: 'JSON 字符串为空',
      };
    }

    try {
      const parsed = JSON.parse(text);
      logger.info('JSON 解析成功', { type: typeof parsed });
      return {
        data: parsed,
        success: true,
      };
    } catch (error: any) {
      const errorMessage = `JSON 解析错误: ${error.message}`;
      errorHandler.error(error, 'JSON 解析失败');
      return {
        data: null,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 格式化 JSON 字符串
   * @param text JSON 字符串
   * @param options 格式化选项
   * @returns 格式化结果
   */
  public formatJson(text: string, options: FormatOptions = {}): FormatResult {
    const { expandDepth = 3, indentSize = 2 } = options;

    logger.debug('开始格式化 JSON', {
      textLength: text.length,
      expandDepth,
      indentSize,
    });

    // 先解析
    const parseResult = this.parseJson(text);
    if (!parseResult.success) {
      return {
        formatted: '',
        parsed: null,
        success: false,
        error: parseResult.error,
      };
    }

    try {
      // 使用自定义序列化器格式化
      const formatted = this.customJsonStringify(
        parseResult.data,
        expandDepth,
        indentSize,
        0
      );

      logger.info('JSON 格式化成功', {
        inputLength: text.length,
        outputLength: formatted.length,
      });

      return {
        formatted,
        parsed: parseResult.data,
        success: true,
      };
    } catch (error: any) {
      const errorMessage = `格式化失败: ${error.message}`;
      errorHandler.error(error, 'JSON 格式化失败');
      return {
        formatted: '',
        parsed: parseResult.data,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 自定义 JSON 序列化器，根据展开层级控制格式
   * @param obj 要序列化的对象
   * @param expandDepth 展开深度
   * @param indentSize 缩进大小
   * @param currentDepth 当前深度
   * @returns 格式化的 JSON 字符串
   */
  public customJsonStringify(
    obj: any,
    expandDepth: number,
    indentSize: number = 2,
    currentDepth: number = 0
  ): string {
    if (obj === null) return 'null';
    if (typeof obj === 'undefined') return 'undefined';
    if (typeof obj === 'string') return JSON.stringify(obj);
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);

    const indent = ' '.repeat(indentSize).repeat(currentDepth);
    const nextIndent = ' '.repeat(indentSize).repeat(currentDepth + 1);

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';

      // 如果当前层级超过展开深度，使用紧凑格式（一行显示）
      if (currentDepth >= expandDepth) {
        const compactItems = obj.map((item) => {
          if (typeof item === 'object' && item !== null) {
            return JSON.stringify(item); // 直接序列化为紧凑格式
          }
          return this.customJsonStringify(item, expandDepth, indentSize, currentDepth + 1);
        });
        return `[${compactItems.join(', ')}]`;
      }

      const items = obj.map((item) =>
        nextIndent +
        this.customJsonStringify(item, expandDepth, indentSize, currentDepth + 1)
      );
      return `[\n${items.join(',\n')}\n${indent}]`;
    }

    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';

      // 如果当前层级超过展开深度，使用紧凑格式（一行显示）
      if (currentDepth >= expandDepth) {
        return JSON.stringify(obj); // 直接序列化为紧凑格式
      }

      const items = keys.map((key) => {
        const value = this.customJsonStringify(
          obj[key],
          expandDepth,
          indentSize,
          currentDepth + 1
        );
        return `${nextIndent}${JSON.stringify(key)}: ${value}`;
      });
      return `{\n${items.join(',\n')}\n${indent}}`;
    }

    return String(obj);
  }

  /**
   * 读取文件内容
   * @param file 文件对象
   * @returns 文件读取结果的 Promise
   */
  public async readFile(file: File): Promise<FileReadResult> {
    logger.debug('开始读取文件', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    });

    // 验证文件类型
    if (
      file.type !== 'application/json' &&
      !file.name.endsWith('.json') &&
      !file.name.endsWith('.txt')
    ) {
      const error = '仅支持 JSON 或文本文件';
      logger.warn('文件类型不支持', { fileName: file.name, fileType: file.type });
      return {
        content: '',
        fileName: file.name,
        success: false,
        error,
      };
    }

    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const content = e.target?.result as string;
        logger.info('文件读取成功', {
          fileName: file.name,
          contentLength: content.length,
        });
        resolve({
          content,
          fileName: file.name,
          success: true,
        });
      };

      reader.onerror = (e) => {
        const error = `读取文件失败: ${e.target?.error?.message || '未知错误'}`;
        errorHandler.error(e.target?.error || new Error('Unknown error'), '文件读取失败', {
          context: { fileName: file.name },
        });
        resolve({
          content: '',
          fileName: file.name,
          success: false,
          error,
        });
      };

      reader.readAsText(file);
    });
  }

  /**
   * 获取服务元数据
   *
   * 只暴露核心的业务方法，内部辅助方法（如 UI 交互、内部实现细节）不包含在内。
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'formatJson',
          description: '格式化 JSON 字符串，支持自定义展开层级和缩进',
          parameters: [
            {
              name: 'text',
              type: 'string',
              description: '要格式化的 JSON 字符串',
              required: true,
            },
            {
              name: 'options',
              type: 'FormatOptions',
              description: '格式化选项',
              required: false,
              properties: [
                {
                  name: 'expandDepth',
                  type: 'number',
                  description: '展开层级深度（1-10），默认 3',
                  required: false,
                  defaultValue: 3,
                },
                {
                  name: 'indentSize',
                  type: 'number',
                  description: '每层缩进空格数，默认 2',
                  required: false,
                  defaultValue: 2,
                },
              ],
            },
          ],
          returnType: 'FormatResult',
        },
      ],
    };
  }
}