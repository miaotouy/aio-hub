import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { createTwoFilesPatch } from 'diff';
import type { FileReadResult, PatchOptions, PatchResult } from './types';

const logger = createModuleLogger('tools/text-diff/engine');
const errorHandler = createModuleErrorHandler('tools/text-diff/engine');

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
 * 从文件扩展名推断语言类型
 */
function inferLanguage(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return LANGUAGE_MAP[ext] || 'plaintext';
}

/**
 * 加载文件内容
 * @param filePath 文件路径
 * @returns 文件读取结果
 */
export async function loadFile(filePath: string): Promise<FileReadResult> {
  logger.debug('加载文件', { filePath });

  const result = await errorHandler.wrapAsync(
    async () => {
      const content = await readTextFile(filePath);

      if (content.length > 10 * 1024 * 1024) {
        logger.warn('文件较大', { size: content.length });
      }

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
      const languageType = inferLanguage(filePath);

      logger.info('文件加载成功', {
        filePath,
        fileName,
        size: content.length,
        language: languageType,
      });

      return {
        content,
        filePath,
        fileName,
        language: languageType,
        success: true,
      };
    },
    {
      userMessage: '读取文件失败',
      showToUser: false,
    }
  );

  if (result === null) {
    return {
      content: '',
      filePath,
      fileName: '',
      language: 'plaintext',
      success: false,
      error: '读取文件失败',
    };
  }

  return result;
}

/**
 * 生成统一 diff 补丁
 * @param oldText 旧文本
 * @param newText 新文本
 * @param options 补丁选项
 * @returns 补丁生成结果
 */
export function generatePatch(
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
      ignoreWhitespace: ignoreWS = true,
      context = 3,
    } = options;

    // 处理行尾空白（如果需要忽略）
    let processedOld = oldText;
    let processedNew = newText;

    if (ignoreWS) {
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
    errorHandler.handle(error as Error, { userMessage: '生成补丁失败', showToUser: false });
    return {
      patch: '',
      success: false,
      error: `生成补丁失败: ${error.message}`,
    };
  }
}