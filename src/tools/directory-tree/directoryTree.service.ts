import type { ToolService } from '@/services/types';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { loadConfig, saveConfig, type DirectoryTreeConfig } from './config';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('services/directory-tree');

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
  /** 最大深度（0 表示无限制） */
  maxDepth: number;
  /** 过滤模式 */
  filterMode: 'none' | 'gitignore' | 'custom';
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
 * 目录树工具服务
 * 
 * 封装目录树生成、配置管理和文件系统交互的所有业务逻辑。
 */
export default class DirectoryTreeService implements ToolService {
  public readonly id = 'directory-tree';
  public readonly name = '目录结构浏览器';
  public readonly description = '生成目录树结构，支持过滤规则和深度限制';

  /**
   * 生成目录树
   */
  public async generateTree(options: GenerateTreeOptions): Promise<TreeGenerationResult> {
    logger.info('开始生成目录树', { path: options.path });

    try {
      // 准备过滤规则
      let ignorePatterns: string[] = [];

      if (options.filterMode === 'gitignore') {
        // 传递特殊标记，让后端递归收集所有 .gitignore 文件
        ignorePatterns = ['__USE_GITIGNORE__'];
      } else if (options.filterMode === 'custom' && options.customPattern) {
        ignorePatterns = options.customPattern
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line && !line.startsWith('#')); // 过滤空行和注释
      }

      // 调用 Rust 后端生成目录树
      const result: TreeGenerationResult = await invoke('generate_directory_tree', {
        path: options.path,
        showFiles: options.showFiles,
        showHidden: options.showHidden,
        showSize: options.showSize,
        maxDepth: options.maxDepth === 10 ? 0 : options.maxDepth, // 10 表示无限制，传 0
        ignorePatterns,
      });

      // 如果启用了包含元数据选项，添加配置和统计信息
      let outputContent = result.tree;
      if (options.includeMetadata) {
        outputContent = this.buildMetadataHeader(options, result.stats) + result.tree;
      }

      logger.info('目录树生成成功', {
        statistics: result.stats,
        configuration: {
          目标路径: options.path,
          显示文件: options.showFiles,
          显示隐藏: options.showHidden,
          显示大小: options.showSize,
          过滤模式: options.filterMode,
          最大深度: options.maxDepth === 10 ? '无限制' : options.maxDepth,
        },
      });

      return {
        tree: outputContent,
        stats: result.stats,
      };
    } catch (error: any) {
      logger.error('生成目录树失败', error, {
        path: options.path,
        configuration: options,
      });
      throw error;
    }
  }

  /**
   * 选择目录
   */
  public async selectDirectory(title = '选择要分析的目录'): Promise<string | null> {
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
      logger.error('选择目录失败', error);
      throw error;
    }
  }

  /**
   * 导出目录树到文件
   */
  public async exportToFile(content: string, targetPath: string): Promise<void> {
    try {
      // 从路径中提取目录名称
      const getDirName = (path: string) => {
        const normalized = path.replace(/\\/g, '/');
        const parts = normalized.split('/');
        return parts[parts.length - 1] || parts[parts.length - 2] || '目录';
      };

      // 生成带日期时间的文件名
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');

      const dirName = getDirName(targetPath);
      const dateTime = `${year}${month}${day}_${hours}${minutes}`;
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
      logger.error('保存文件失败', error);
      throw error;
    }
  }

  /**
   * 加载配置
   */
  public async loadConfig(): Promise<DirectoryTreeConfig> {
    try {
      const config = await loadConfig();
      logger.debug('配置加载成功', { config });
      return config;
    } catch (error) {
      logger.error('加载配置失败', error);
      throw error;
    }
  }

  /**
   * 保存配置
   */
  public async saveConfig(config: DirectoryTreeConfig): Promise<void> {
    try {
      await saveConfig(config);
      logger.debug('配置保存成功');
    } catch (error) {
      logger.error('保存配置失败', error);
      throw error;
    }
  }

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'generateTree',
          description: '根据配置选项生成目录树结构',
          parameters: [
            {
              name: 'options',
              type: 'GenerateTreeOptions',
              description: '目录树生成配置选项',
            },
          ],
          returnType: 'Promise<TreeGenerationResult>',
        },
        {
          name: 'selectDirectory',
          description: '打开目录选择对话框',
          parameters: [
            {
              name: 'title',
              type: 'string',
              description: '对话框标题',
              defaultValue: '选择要分析的目录',
            },
          ],
          returnType: 'Promise<string | null>',
        },
        {
          name: 'exportToFile',
          description: '将目录树导出到文件',
          parameters: [
            {
              name: 'content',
              type: 'string',
              description: '要导出的内容',
            },
            {
              name: 'targetPath',
              type: 'string',
              description: '目标路径（用于生成默认文件名）',
            },
          ],
          returnType: 'Promise<void>',
        },
        {
          name: 'loadConfig',
          description: '从本地存储加载配置',
          parameters: [],
          returnType: 'Promise<DirectoryTreeConfig>',
        },
        {
          name: 'saveConfig',
          description: '保存配置到本地存储',
          parameters: [
            {
              name: 'config',
              type: 'DirectoryTreeConfig',
              description: '要保存的配置对象',
            },
          ],
          returnType: 'Promise<void>',
        },
      ],
    };
  }

  /**
   * 构建元数据头部
   */
  private buildMetadataHeader(options: GenerateTreeOptions, stats: TreeGenerationResult['stats']): string {
    const metadata = [
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
      `- 过滤模式: ${
        options.filterMode === 'gitignore'
          ? '使用 .gitignore'
          : options.filterMode === 'custom'
            ? '自定义规则'
            : '无'
      }`,
      `- 最大深度: ${options.maxDepth === 10 ? '无限制' : options.maxDepth}`,
      options.filterMode === 'custom' && options.customPattern?.trim()
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

    return metadata;
  }
}