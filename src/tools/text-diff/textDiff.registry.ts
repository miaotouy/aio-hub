import type { ToolService } from '@/services/types';
import { createModuleLogger } from '@/utils/logger';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { createTwoFilesPatch } from 'diff';

const logger = createModuleLogger('services/text-diff');

/**
 * 文件读取结果
 */
export interface FileReadResult {
  /** 文件内容 */
  content: string;
  /** 文件路径 */
  filePath: string;
  /** 文件名 */
  fileName: string;
  /** 推断的语言类型 */
  language: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 文件保存结果
 */
export interface FileSaveResult {
  /** 保存的文件路径 */
  filePath: string;
  /** 文件名 */
  fileName: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 补丁生成选项
 */
export interface PatchOptions {
  /** 旧文件名 */
  oldFileName?: string;
  /** 新文件名 */
  newFileName?: string;
  /** 是否忽略行尾空白 */
  ignoreWhitespace?: boolean;
  /** 上下文行数 */
  context?: number;
}

/**
 * 补丁生成结果
 */
export interface PatchResult {
  /** 补丁内容 */
  patch: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 支持的语言类型映射
 */
const LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.json': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'css',
  '.less': 'css',
  '.py': 'python',
  '.java': 'java',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.c': 'cpp',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.md': 'markdown',
  '.txt': 'plaintext',
};

/**
 * TextDiff 服务
 * 提供文本差异对比的文件操作、补丁生成等功能
 */
export default class TextDiffService implements ToolService {
  public readonly id = 'text-diff';
  public readonly name = '文本差异对比工具';
  public readonly description = '提供文本差异对比的文件操作、补丁生成等功能';

  /**
   * 从文件扩展名推断语言类型（内部辅助方法）
   * @param filePath 文件路径
   * @returns 语言类型
   */
  private inferLanguage(filePath: string): string {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    return LANGUAGE_MAP[ext] || 'plaintext';
  }

  /**
   * 打开文件对话框并读取文件
   * @param side 左侧或右侧
   * @returns 文件读取结果
   */
  public async openFile(side: 'left' | 'right'): Promise<FileReadResult> {
    logger.debug('打开文件对话框', { side });

    try {
      const filePath = await open({
        multiple: false,
        title: `打开文件到${side === 'left' ? '左侧' : '右侧'}`,
      });

      if (!filePath) {
        return {
          content: '',
          filePath: '',
          fileName: '',
          language: 'plaintext',
          success: false,
          error: '用户取消操作',
        };
      }

      return await this.loadFile(filePath as string);
    } catch (error: any) {
      const errorMessage = `打开文件失败: ${error.message}`;
      logger.error('打开文件失败', error);
      return {
        content: '',
        filePath: '',
        fileName: '',
        language: 'plaintext',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 加载文件内容
   * @param filePath 文件路径
   * @returns 文件读取结果
   */
  public async loadFile(filePath: string): Promise<FileReadResult> {
    logger.debug('加载文件', { filePath });

    try {
      const content = await readTextFile(filePath);

      // 检查大文件
      if (content.length > 10 * 1024 * 1024) {
        logger.warn('文件较大', { size: content.length });
      }

      // 检测二进制文件
      if (content.includes('\0')) {
        return {
          content: '',
          filePath,
          fileName: '',
          language: 'plaintext',
          success: false,
          error: '不支持二进制文件',
        };
      }

      const fileName = filePath.split(/[/\\]/).pop() || '';
      const language = this.inferLanguage(filePath);

      logger.info('文件加载成功', {
        filePath,
        fileName,
        size: content.length,
        language,
      });

      return {
        content,
        filePath,
        fileName,
        language,
        success: true,
      };
    } catch (error: any) {
      const errorMessage = `读取文件失败: ${error.message}`;
      logger.error('读取文件失败', { filePath, error });
      return {
        content: '',
        filePath,
        fileName: '',
        language: 'plaintext',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 保存文件
   * @param content 文件内容
   * @param currentFileName 当前文件名（用作默认名）
   * @param side 左侧或右侧
   * @returns 文件保存结果
   */
  public async saveFile(
    content: string,
    currentFileName: string = 'untitled.txt',
    side: 'left' | 'right'
  ): Promise<FileSaveResult> {
    logger.debug('保存文件', { side, currentFileName });

    if (!content) {
      return {
        filePath: '',
        fileName: '',
        success: false,
        error: '内容为空',
      };
    }

    try {
      const filePath = await save({
        defaultPath: currentFileName,
        title: `保存${side === 'left' ? '左侧' : '右侧'}文件`,
      });

      if (!filePath) {
        return {
          filePath: '',
          fileName: '',
          success: false,
          error: '用户取消操作',
        };
      }

      await writeTextFile(filePath, content);

      const fileName = filePath.split(/[/\\]/).pop() || '';

      logger.info('文件保存成功', {
        filePath,
        fileName,
        size: content.length,
      });

      return {
        filePath,
        fileName,
        success: true,
      };
    } catch (error: any) {
      const errorMessage = `保存文件失败: ${error.message}`;
      logger.error('保存文件失败', error);
      return {
        filePath: '',
        fileName: '',
        success: false,
        error: errorMessage,
      };
    }
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
    options: PatchOptions = {}
  ): PatchResult {
    logger.debug('生成补丁', { options });

    if (!oldText && !newText) {
      return {
        patch: '',
        success: false,
        error: '两侧内容均为空',
      };
    }

    try {
      const {
        oldFileName = 'original',
        newFileName = 'modified',
        ignoreWhitespace = true,
        context = 3,
      } = options;

      // 处理行尾空白（如果需要忽略）
      let processedOld = oldText;
      let processedNew = newText;

      if (ignoreWhitespace) {
        processedOld = oldText
          .split('\n')
          .map((line) => line.trimEnd())
          .join('\n');
        processedNew = newText
          .split('\n')
          .map((line) => line.trimEnd())
          .join('\n');
      }

      const patch = createTwoFilesPatch(
        oldFileName,
        newFileName,
        processedOld,
        processedNew,
        '',
        '',
        { context }
      );

      if (!patch || patch.trim().length === 0) {
        return {
          patch: '',
          success: false,
          error: '两侧内容相同，无差异',
        };
      }

      logger.info('补丁生成成功', {
        patchLength: patch.length,
      });

      return {
        patch,
        success: true,
      };
    } catch (error: any) {
      const errorMessage = `生成补丁失败: ${error.message}`;
      logger.error('生成补丁失败', error);
      return {
        patch: '',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 导出补丁到文件
   * @param patch 补丁内容
   * @param defaultFileName 默认文件名
   * @returns 文件保存结果
   */
  public async exportPatch(
    patch: string,
    defaultFileName: string = 'diff.patch'
  ): Promise<FileSaveResult> {
    logger.debug('导出补丁', { defaultFileName });

    if (!patch) {
      return {
        filePath: '',
        fileName: '',
        success: false,
        error: '补丁内容为空',
      };
    }

    try {
      const filePath = await save({
        defaultPath: defaultFileName,
        title: '导出补丁文件',
        filters: [
          {
            name: 'Patch 文件',
            extensions: ['patch', 'diff'],
          },
        ],
      });

      if (!filePath) {
        return {
          filePath: '',
          fileName: '',
          success: false,
          error: '用户取消操作',
        };
      }

      await writeTextFile(filePath, patch);

      const fileName = filePath.split(/[/\\]/).pop() || '';

      logger.info('补丁导出成功', {
        filePath,
        fileName,
        size: patch.length,
      });

      return {
        filePath,
        fileName,
        success: true,
      };
    } catch (error: any) {
      const errorMessage = `导出补丁失败: ${error.message}`;
      logger.error('导出补丁失败', error);
      return {
        filePath: '',
        fileName: '',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 复制到剪贴板
   * @param content 要复制的内容
   * @returns 是否成功
   */
  public async copyToClipboard(content: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    logger.debug('复制到剪贴板', { length: content.length });

    if (!content) {
      return {
        success: false,
        error: '内容为空',
      };
    }

    try {
      await writeText(content);

      logger.info('复制到剪贴板成功', { length: content.length });

      return { success: true };
    } catch (error: any) {
      const errorMessage = `复制失败: ${error.message}`;
      logger.error('复制到剪贴板失败', error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 从剪贴板粘贴
   * @returns 粘贴结果
   */
  public async pasteFromClipboard(): Promise<{
    content: string;
    success: boolean;
    error?: string;
  }> {
    logger.debug('从剪贴板粘贴');

    try {
      const content = await readText();

      if (!content) {
        return {
          content: '',
          success: false,
          error: '剪贴板为空',
        };
      }

      logger.info('从剪贴板粘贴成功', { length: content.length });

      return {
        content,
        success: true,
      };
    } catch (error: any) {
      const errorMessage = `粘贴失败: ${error.message}`;
      logger.error('从剪贴板粘贴失败', error);
      return {
        content: '',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 获取服务元数据
   * 只包含核心业务方法，不包含UI交互方法
   */
  public getMetadata() {
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
        },
      ],
    };
  }
}