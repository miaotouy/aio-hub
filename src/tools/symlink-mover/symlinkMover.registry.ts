import type { ToolRegistry } from '@/services/types';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

const logger = createModuleLogger('services/symlink-mover');
const errorHandler = createModuleErrorHandler('services/symlink-mover');

// ==================== 类型定义 ====================

/**
 * 文件项
 */
export interface FileItem {
  path: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
  isDirectory?: boolean;
  isCrossDevice?: boolean;
  warning?: string;
}

/**
 * 文件验证结果
 */
export interface FileValidation {
  isDirectory: boolean;
  isCrossDevice: boolean;
  exists: boolean;
}

/**
 * 操作日志
 */
export interface OperationLog {
  timestamp: number;
  operationType: string;
  linkType: string;
  sourceCount: number;
  successCount: number;
  errorCount: number;
  errors: string[];
  durationMs: number;
  targetDirectory: string;
  sourcePaths: string[];
  totalSize: number;
  processedFiles: string[];
}

/**
 * 进度事件
 */
export interface CopyProgress {
  currentFile: string;
  copiedBytes: number;
  totalBytes: number;
  progressPercentage: number;
}

/**
 * 链接类型
 */
export type LinkType = 'symlink' | 'link';

/**
 * 操作模式
 */
export type OperationMode = 'move' | 'link-only';

/**
 * 移动和链接选项
 */
export interface MoveAndLinkOptions {
  sourcePaths: string[];
  targetDir: string;
  linkType: LinkType;
}

/**
 * 仅创建链接选项
 */
export interface CreateLinksOnlyOptions {
  sourcePaths: string[];
  targetDir: string;
  linkType: LinkType;
}

/**
 * 验证文件选项
 */
export interface ValidateFileOptions {
  sourcePath: string;
  targetDir: string;
  linkType: LinkType;
}

/**
 * 格式化的日志摘要
 */
export interface FormattedLogSummary {
  time: string;
  operationType: string;
  linkType: string;
  status: 'success' | 'partial' | 'failed';
  summary: string;
  details: {
    totalFiles: number;
    successFiles: number;
    failedFiles: number;
    totalSize: string;
    duration: string;
    targetDirectory: string;
  };
  errors?: string[];
}

// ==================== 服务类 ====================

/**
 * 符号链接移动工具服务
 *
 * 提供文件/目录的移动、链接创建、验证和日志管理功能
 */
export default class SymlinkMoverRegistry implements ToolRegistry {
  public readonly id = 'symlink-mover';
  public readonly name = '符号链接移动工具';
  public readonly description = '将文件移动到目标目录并在原位置创建链接，或仅创建链接';

  private progressUnlisten: UnlistenFn | null = null;

  // ==================== 文件验证 ====================

  /**
   * 验证单个文件是否适合创建链接
   */
  public async validateFile(options: ValidateFileOptions): Promise<FileValidation | null> {
    logger.info('验证文件', options);

    return await errorHandler.wrapAsync(
      async () => {
        const validation = await invoke<FileValidation>('validate_file_for_link', {
          sourcePath: options.sourcePath,
          targetDir: options.targetDir,
          linkType: options.linkType,
        });

        logger.info('文件验证完成', { path: options.sourcePath, validation });
        return validation;
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: '文件验证失败',
        context: options,
        showToUser: false, // 验证失败不显示用户提示
      }
    );
  }

  /**
   * 批量验证文件列表
   */
  public async validateFiles(
    files: FileItem[],
    targetDir: string,
    linkType: LinkType,
    operationMode: OperationMode
  ): Promise<FileItem[]> {
    logger.info('批量验证文件', { count: files.length, targetDir, linkType, operationMode });

    const validatedFiles = [...files];

    for (const file of validatedFiles) {
      const validation = await this.validateFile({
        sourcePath: file.path,
        targetDir,
        linkType,
      });

      if (validation) {
        file.isDirectory = validation.isDirectory;
        file.isCrossDevice = validation.isCrossDevice;

        // 硬链接的限制检查
        if (linkType === 'link' && operationMode === 'link-only') {
          if (validation.isDirectory) {
            file.warning = '硬链接不支持目录';
          } else if (validation.isCrossDevice) {
            file.warning = '硬链接不支持跨分区/跨盘';
          } else {
            file.warning = undefined;
          }
        } else {
          file.warning = undefined;
        }
      } else {
        file.warning = '验证失败';
      }
    }

    return validatedFiles;
  }

  /**
   * 检查文件警告
   */
  public getFileWarning(
    validation: FileValidation,
    linkType: LinkType,
    operationMode: OperationMode
  ): string | undefined {
    if (linkType === 'link' && operationMode === 'link-only') {
      if (validation.isDirectory) {
        return '硬链接不支持目录';
      } else if (validation.isCrossDevice) {
        return '硬链接不支持跨分区/跨盘';
      }
    }
    return undefined;
  }

  // ==================== 文件列表管理 ====================

  /**
   * 解析路径为文件项
   */
  public parsePathsToFileItems(paths: string[]): FileItem[] {
    return paths.map((path) => {
      const name = path.split(/[/\\]/).pop() || path;
      return { path, name, status: 'pending' as const };
    });
  }

  /**
   * 合并文件列表（去重）
   */
  public mergeFileItems(existingFiles: FileItem[], newFiles: FileItem[]): FileItem[] {
    const uniqueNewFiles = newFiles.filter(
      (nf) => !existingFiles.some((sf) => sf.path === nf.path)
    );
    return [...existingFiles, ...uniqueNewFiles];
  }

  /**
   * 移除指定索引的文件
   */
  public removeFileByIndex(files: FileItem[], index: number): FileItem[] {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    return newFiles;
  }

  // ==================== 核心操作 ====================

  /**
   * 移动文件并创建链接
   */
  public async moveAndLink(options: MoveAndLinkOptions): Promise<string | null> {
    logger.info('开始移动文件并创建链接', options);

    return await errorHandler.wrapAsync(
      async () => {
        const result = await invoke<string>('move_and_link', {
          sourcePaths: options.sourcePaths,
          targetDir: options.targetDir,
          linkType: options.linkType,
        });

        logger.info('移动和链接操作完成', { result });
        return result;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '文件移动和链接失败',
        context: options,
      }
    );
  }

  /**
   * 仅创建链接（不移动文件）
   */
  public async createLinksOnly(options: CreateLinksOnlyOptions): Promise<string | null> {
    logger.info('开始创建链接', options);

    return await errorHandler.wrapAsync(
      async () => {
        const result = await invoke<string>('create_links_only', {
          sourcePaths: options.sourcePaths,
          targetDir: options.targetDir,
          linkType: options.linkType,
        });

        logger.info('创建链接操作完成', { result });
        return result;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '创建链接失败',
        context: options,
      }
    );
  }

  /**
   * 取消当前操作
   */
  public async cancelOperation(): Promise<boolean> {
    logger.info('取消操作');

    const result = await errorHandler.wrapAsync(
      async () => {
        await invoke('cancel_move_operation');
        logger.info('取消操作成功');
        return true;
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: '取消操作失败',
        showToUser: true,
      }
    );

    return result !== null;
  }

  // ==================== 进度监听 ====================

  /**
   * 开始监听进度事件
   */
  public async startProgressListener(
    onProgress: (progress: CopyProgress) => void
  ): Promise<boolean> {
    logger.info('开始监听进度事件');

    // 如果已有监听器，先清理
    if (this.progressUnlisten) {
      await this.stopProgressListener();
    }

    const result = await errorHandler.wrapAsync(
      async () => {
        this.progressUnlisten = await listen<CopyProgress>('copy-progress', (event) => {
          const progress = event.payload;
          logger.debug('收到进度事件', progress);
          onProgress(progress);
        });
        logger.info('进度监听器已启动');
        return true;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '启动进度监听失败',
        showToUser: false,
      }
    );

    return result !== null;
  }

  /**
   * 停止监听进度事件
   */
  public async stopProgressListener(): Promise<void> {
    if (this.progressUnlisten) {
      logger.info('停止进度监听');
      this.progressUnlisten();
      this.progressUnlisten = null;
    }
  }

  // ==================== 日志管理 ====================

  /**
   * 获取最新的操作日志
   */
  public async getLatestLog(): Promise<OperationLog | null> {
    logger.info('获取最新日志');

    return await errorHandler.wrapAsync(
      async () => {
        const log = await invoke<OperationLog | null>('get_latest_operation_log');
        logger.info('获取最新日志成功', { hasLog: !!log });
        return log;
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: '获取操作日志失败',
        showToUser: false,
      }
    );
  }

  /**
   * 获取所有操作日志
   */
  public async getAllLogs(): Promise<OperationLog[]> {
    logger.info('获取所有日志');

    const result = await errorHandler.wrapAsync(
      async () => {
        const logs = await invoke<OperationLog[]>('get_all_operation_logs');
        logger.info('获取所有日志成功', { count: logs.length });
        return logs.reverse(); // 最新的在前面
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '获取操作日志失败',
      }
    );

    return result || [];
  }

  // ==================== 格式化工具 ====================

  /**
   * 格式化时间戳
   */
  public formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /**
   * 格式化持续时间
   */
  public formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * 格式化字节大小
   */
  public formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * 获取操作类型标签
   */
  public getOperationTypeLabel(type: string): string {
    return type === 'move' ? '搬家模式' : '仅创建链接';
  }

  /**
   * 获取链接类型标签
   */
  public getLinkTypeLabel(type: string): string {
    return type === 'symlink' ? '符号链接' : '硬链接';
  }

  /**
   * 格式化日志为滚动文字
   */
  public formatLogTicker(log: OperationLog): string {
    const opType = this.getOperationTypeLabel(log.operationType);
    const linkType = this.getLinkTypeLabel(log.linkType);
    const status = log.errorCount > 0 ? '部分成功' : '成功';
    return `${opType} · ${linkType} · ${status} ${log.successCount}/${log.sourceCount} · ${this.formatBytes(log.totalSize)} · ${this.formatDuration(log.durationMs)}`;
  }

  // ==================== 高级封装方法（对外接口）====================

  /**
   * 获取最新操作摘要（格式化）
   */
  public async getLatestOperationSummary(): Promise<FormattedLogSummary | null> {
    const log = await this.getLatestLog();
    if (!log) return null;

    return {
      time: this.formatTimestamp(log.timestamp),
      operationType: this.getOperationTypeLabel(log.operationType),
      linkType: this.getLinkTypeLabel(log.linkType),
      status: log.errorCount > 0 ? (log.successCount > 0 ? 'partial' : 'failed') : 'success',
      summary: this.formatLogTicker(log),
      details: {
        totalFiles: log.sourceCount,
        successFiles: log.successCount,
        failedFiles: log.errorCount,
        totalSize: this.formatBytes(log.totalSize),
        duration: this.formatDuration(log.durationMs),
        targetDirectory: log.targetDirectory,
      },
      errors: log.errors.length > 0 ? log.errors : undefined,
    };
  }

  /**
   * 获取操作历史（格式化）
   */
  public async getOperationHistory(limit?: number): Promise<FormattedLogSummary[]> {
    const logs = await this.getAllLogs();
    const formattedLogs = logs.map((log) => ({
      time: this.formatTimestamp(log.timestamp),
      operationType: this.getOperationTypeLabel(log.operationType),
      linkType: this.getLinkTypeLabel(log.linkType),
      status: (log.errorCount > 0 ? (log.successCount > 0 ? 'partial' : 'failed') : 'success') as 'success' | 'partial' | 'failed',
      summary: this.formatLogTicker(log),
      details: {
        totalFiles: log.sourceCount,
        successFiles: log.successCount,
        failedFiles: log.errorCount,
        totalSize: this.formatBytes(log.totalSize),
        duration: this.formatDuration(log.durationMs),
        targetDirectory: log.targetDirectory,
      },
      errors: log.errors.length > 0 ? log.errors : undefined,
    }));

    return limit ? formattedLogs.slice(0, limit) : formattedLogs;
  }

  // ==================== 元数据 ====================

  /**
   * 获取服务元数据（仅包含对外公开的高级接口）
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'moveAndLink',
          description: '移动文件到目标目录并在原位置创建链接',
          parameters: [
            {
              name: 'options',
              type: 'MoveAndLinkOptions',
              description: '移动和链接选项',
              properties: [
                {
                  name: 'sourcePaths',
                  type: 'string[]',
                  description: '源文件路径列表',
                  required: true,
                },
                {
                  name: 'targetDir',
                  type: 'string',
                  description: '目标目录路径',
                  required: true,
                },
                {
                  name: 'linkType',
                  type: 'LinkType',
                  description: '链接类型："symlink"（符号链接）或 "link"（硬链接）',
                  required: true,
                },
              ],
            },
          ],
          returnType: 'Promise<string | null>',
          example: `
await service.moveAndLink({
  sourcePaths: ['/path/to/file1', '/path/to/file2'],
  targetDir: '/target/directory',
  linkType: 'symlink'
});`,
        },
        {
          name: 'createLinksOnly',
          description: '在目标目录创建链接，不移动原文件',
          parameters: [
            {
              name: 'options',
              type: 'CreateLinksOnlyOptions',
              description: '创建链接选项',
              properties: [
                {
                  name: 'sourcePaths',
                  type: 'string[]',
                  description: '源文件路径列表',
                  required: true,
                },
                {
                  name: 'targetDir',
                  type: 'string',
                  description: '链接目标目录路径',
                  required: true,
                },
                {
                  name: 'linkType',
                  type: 'LinkType',
                  description: '链接类型："symlink"（符号链接）或 "link"（硬链接）',
                  required: true,
                },
              ],
            },
          ],
          returnType: 'Promise<string | null>',
          example: `
await service.createLinksOnly({
  sourcePaths: ['/path/to/file'],
  targetDir: '/link/directory',
  linkType: 'symlink'
});`,
        },
        {
          name: 'getLatestOperationSummary',
          description: '获取最新操作的格式化摘要',
          parameters: [],
          returnType: 'Promise<FormattedLogSummary | null>',
          example: `
const summary = await service.getLatestOperationSummary();
// 返回: { time, operationType, linkType, status, summary, details, errors }`,
        },
        {
          name: 'getOperationHistory',
          description: '获取操作历史记录（格式化）',
          parameters: [
            {
              name: 'limit',
              type: 'number',
              description: '限制返回数量（可选）',
              required: false,
            },
          ],
          returnType: 'Promise<FormattedLogSummary[]>',
          example: `
const history = await service.getOperationHistory(10);
// 返回最近10条操作记录`,
        },
      ],
    };
  }
}