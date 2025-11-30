import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { formatDateTime } from '@/utils/time';
import { loadConfig as loadConfigFromStore, saveConfig as saveConfigToStore, type DirectoryTreeConfig } from './config';

const logger = createModuleLogger('tools/directory-tree');
const errorHandler = createModuleErrorHandler('tools/directory-tree');

/**
 * 生成目录树的参数
 */
export interface GenerateTreeOptions {
  /** 目标路径 */
  path: string;
  /** 是否显示文件 */
  showFiles: boolean;
  /** 是否显示隐藏文件 */
  showHidden: boolean;
  /** 是否显示文件大小 */
  showSize: boolean;
  /** 是否显示目录大小 */
  showDirSize: boolean;
  /** 最大深度（0 表示无限制） */
  maxDepth: number;
  /** 过滤模式 */
  filterMode: 'none' | 'gitignore' | 'custom' | 'both';
  /** 自定义过滤规则（当 filterMode 为 'custom' 时使用） */
  customPattern?: string;
  /** 是否在输出中包含元数据 */
  includeMetadata?: boolean;
}

/**
 * 目录树生成结果
 */
export interface TreeGenerationResult {
  /** 生成的目录树文本 */
  tree: string;
  /** 统计信息 */
  stats: {
    total_dirs: number;
    total_files: number;
    filtered_dirs: number;
    filtered_files: number;
    show_files: boolean;
    show_hidden: boolean;
    max_depth: string;
    filter_count: number;
  };
}

/**
 * 构建元数据头部
 */
function buildMetadataHeader(options: GenerateTreeOptions, stats: TreeGenerationResult['stats']): string {
  return [
    '# 目录树生成信息',
    '',
    '## 统计信息',
    `- 总目录: ${stats.total_dirs}`,
    `- 总文件: ${stats.total_files}`,
    `- 过滤目录: ${stats.filtered_dirs}`,
    `- 过滤文件: ${stats.filtered_files}`,
    stats.filter_count > 0 ? `- 过滤规则数: ${stats.filter_count}` : '',
    '',
    '## 生成配置',
    `- 目标路径: ${options.path}`,
    `- 显示文件: ${options.showFiles ? '是' : '否'}`,
    `- 显示隐藏: ${options.showHidden ? '是' : '否'}`,
    `- 显示大小: ${options.showSize ? '是' : '否'}`,
    `- 显示目录大小: ${options.showDirSize ? '是' : '否'}`,
    `- 过滤模式: ${options.filterMode === 'gitignore'
      ? '使用 .gitignore'
      : options.filterMode === 'custom'
        ? '自定义规则'
        : options.filterMode === 'both'
          ? '同时使用 .gitignore 和自定义规则'
          : '无'
    }`,
    `- 最大深度: ${options.maxDepth === 10 ? '无限制' : options.maxDepth}`,
    (options.filterMode === 'custom' || options.filterMode === 'both') && options.customPattern?.trim()
      ? `- 自定义规则:\n${options.customPattern
        .split('\n')
        .filter((l: string) => l.trim())
        .map((l: string) => `  ${l}`)
        .join('\n')}`
      : '',
    '',
    '## 目录结构',
    '',
  ].join('\n');
}

/**
 * 生成目录树
 */
export async function generateTree(options: GenerateTreeOptions): Promise<TreeGenerationResult> {
  logger.info('开始生成目录树', { path: options.path });

  try {
    // 准备过滤规则
    let ignorePatterns: string[] = [];

    if (options.filterMode === 'gitignore') {
      ignorePatterns = ['__USE_GITIGNORE__'];
    } else if (options.filterMode === 'custom' && options.customPattern) {
      ignorePatterns = options.customPattern
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line && !line.startsWith('#'));
    } else if (options.filterMode === 'both') {
      ignorePatterns = ['__USE_GITIGNORE__'];
      if (options.customPattern) {
        const customPatterns = options.customPattern
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line && !line.startsWith('#'));
        ignorePatterns.push(...customPatterns);
      }
    }

    // 调用 Rust 后端生成目录树
    const result: TreeGenerationResult = await invoke('generate_directory_tree', {
      path: options.path,
      showFiles: options.showFiles,
      showHidden: options.showHidden,
      showSize: options.showSize,
      showDirSize: options.showDirSize,
      maxDepth: options.maxDepth === 10 ? 0 : options.maxDepth,
      ignorePatterns,
    });

    // 如果启用了包含元数据选项，添加配置和统计信息
    let outputContent = result.tree;
    if (options.includeMetadata) {
      outputContent = buildMetadataHeader(options, result.stats) + result.tree;
    }

    logger.info('目录树生成成功', {
      statistics: result.stats,
    });

    return {
      tree: outputContent,
      stats: result.stats,
    };
  } catch (error: any) {
    errorHandler.error(error, '生成目录树失败', {
      showToUser: false,
      context: {
        path: options.path,
        configuration: options,
      },
    });
    throw error;
  }
}

/**
 * 选择目录
 */
export async function selectDirectory(title = '选择要分析的目录'): Promise<string | null> {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title,
    });

    if (typeof selected === 'string') {
      logger.info('用户选择了目录', { path: selected });
      return selected;
    }

    return null;
  } catch (error) {
    errorHandler.error(error, '选择目录失败', { showToUser: false });
    throw error;
  }
}

/**
 * 导出目录树到文件
 */
export async function exportToFile(content: string, targetPath: string): Promise<void> {
  try {
    const getDirName = (path: string) => {
      const normalized = path.replace(/\\/g, '/');
      const parts = normalized.split('/');
      return parts[parts.length - 1] || parts[parts.length - 2] || '目录';
    };

    const dirName = getDirName(targetPath);
    const dateTime = formatDateTime(new Date(), 'yyyyMMdd_HHmm');
    const defaultFileName = `${dirName}_目录树_${dateTime}.txt`;

    const savePath = await saveDialog({
      defaultPath: defaultFileName,
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'Markdown Files', extensions: ['md'] },
      ],
      title: '保存目录树',
    });

    if (savePath) {
      await writeTextFile(savePath, content);
      logger.info('文件保存成功', { path: savePath });
    }
  } catch (error) {
    errorHandler.error(error, '保存文件失败', { showToUser: false });
    throw error;
  }
}

/**
 * 加载配置
 */
export async function loadConfig(): Promise<DirectoryTreeConfig> {
  try {
    const config = await loadConfigFromStore();
    logger.debug('配置加载成功');
    return config;
  } catch (error) {
    errorHandler.error(error, '加载配置失败', { showToUser: false });
    throw error;
  }
}

/**
 * 保存配置
 */
export async function saveConfig(config: DirectoryTreeConfig): Promise<void> {
  try {
    await saveConfigToStore(config);
    logger.debug('配置保存成功');
  } catch (error) {
    errorHandler.error(error, '保存配置失败', { showToUser: false });
    throw error;
  }
}