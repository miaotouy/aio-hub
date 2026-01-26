import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import type {
  FileItem,
  FileValidation,
  OperationLog,
  CopyProgress,
  LinkType,
  OperationMode,
  MoveAndLinkOptions,
  CreateLinksOnlyOptions,
  ValidateFileOptions,
  FormattedLogSummary,
} from '../types';

const logger = createModuleLogger('symlink-mover/logic');
const errorHandler = createModuleErrorHandler('symlink-mover/logic');

export function useSymlinkMoverLogic() {
  let progressUnlisten: UnlistenFn | null = null;

  // ==================== 文件验证 ====================

  /**
   * 验证单个文件是否适合创建链接
   */
  const validateFile = async (options: ValidateFileOptions): Promise<FileValidation | null> => {
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
        showToUser: false,
      }
    );
  };

  /**
   * 批量验证文件列表
   */
  const validateFiles = async (
    files: FileItem[],
    targetDir: string,
    linkType: LinkType,
    operationMode: OperationMode
  ): Promise<FileItem[]> => {
    logger.info('批量验证文件', { count: files.length, targetDir, linkType, operationMode });

    const validatedFiles = [...files];

    for (const file of validatedFiles) {
      const validation = await validateFile({
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
  };

  /**
   * 检查文件警告
   */
  const getFileWarning = (
    validation: FileValidation,
    linkType: LinkType,
    operationMode: OperationMode
  ): string | undefined => {
    if (linkType === 'link' && operationMode === 'link-only') {
      if (validation.isDirectory) {
        return '硬链接不支持目录';
      } else if (validation.isCrossDevice) {
        return '硬链接不支持跨分区/跨盘';
      }
    }
    return undefined;
  };

  // ==================== 文件列表管理 ====================

  /**
   * 解析路径为文件项
   */
  const parsePathsToFileItems = (paths: string[]): FileItem[] => {
    return paths.map((path) => {
      const name = path.split(/[/\\]/).pop() || path;
      return { path, name, status: 'pending' as const };
    });
  };

  /**
   * 合并文件列表（去重）
   */
  const mergeFileItems = (existingFiles: FileItem[], newFiles: FileItem[]): FileItem[] => {
    const uniqueNewFiles = newFiles.filter(
      (nf) => !existingFiles.some((sf) => sf.path === nf.path)
    );
    return [...existingFiles, ...uniqueNewFiles];
  };

  /**
   * 移除指定索引的文件
   */
  const removeFileByIndex = (files: FileItem[], index: number): FileItem[] => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    return newFiles;
  };

  // ==================== 核心操作 ====================

  /**
   * 移动文件并创建链接
   */
  const moveAndLink = async (options: MoveAndLinkOptions): Promise<string | null> => {
    logger.info('开始移动文件并创建链接', options);

    return await errorHandler.wrapAsync(
      async () => {
        const result = await invoke<string>('move_and_link', {
          sourcePaths: options.sourcePaths,
          targetDir: options.targetDir,
          linkType: options.linkType,
          baseSourceDir: options.baseSourceDir,
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
  };

  /**
   * 仅创建链接（不移动文件）
   */
  const createLinksOnly = async (options: CreateLinksOnlyOptions): Promise<string | null> => {
    logger.info('开始创建链接', options);

    return await errorHandler.wrapAsync(
      async () => {
        const result = await invoke<string>('create_links_only', {
          sourcePaths: options.sourcePaths,
          targetDir: options.targetDir,
          linkType: options.linkType,
          baseSourceDir: options.baseSourceDir,
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
  };

  /**
   * 取消当前操作
   */
  const cancelOperation = async (): Promise<boolean> => {
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
  };

  // ==================== 进度监听 ====================

  /**
   * 开始监听进度事件
   */
  const startProgressListener = async (
    onProgress: (progress: CopyProgress) => void
  ): Promise<boolean> => {
    logger.info('开始监听进度事件');

    // 如果已有监听器，先清理
    if (progressUnlisten) {
      progressUnlisten();
      progressUnlisten = null;
    }

    const result = await errorHandler.wrapAsync(
      async () => {
        progressUnlisten = await listen<CopyProgress>('copy-progress', (event) => {
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
  };

  /**
   * 停止监听进度事件
   */
  const stopProgressListener = async (): Promise<void> => {
    if (progressUnlisten) {
      logger.info('停止进度监听');
      progressUnlisten();
      progressUnlisten = null;
    }
  };

  // ==================== 日志管理 ====================

  /**
   * 获取最新的操作日志
   */
  const getLatestLog = async (): Promise<OperationLog | null> => {
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
  };

  /**
   * 获取所有操作日志
   */
  const getAllLogs = async (): Promise<OperationLog[]> => {
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
  };

  // ==================== 格式化工具 ====================

  /**
   * 格式化时间戳
   */
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  /**
   * 格式化持续时间
   */
  const formatDuration = (ms: number): string => {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    }
  };

  /**
   * 格式化字节大小
   */
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  /**
   * 获取操作类型标签
   */
  const getOperationTypeLabel = (type: string): string => {
    return type === 'move' ? '搬家模式' : '仅创建链接';
  };

  /**
   * 获取链接类型标签
   */
  const getLinkTypeLabel = (type: string): string => {
    return type === 'symlink' ? '符号链接' : '硬链接';
  };

  /**
   * 格式化日志为滚动文字
   */
  const formatLogTicker = (log: OperationLog): string => {
    const opType = getOperationTypeLabel(log.operationType);
    const linkType = getLinkTypeLabel(log.linkType);
    const status = log.errorCount > 0 ? '部分成功' : '成功';
    return `${opType} · ${linkType} · ${status} ${log.successCount}/${log.sourceCount} · ${formatBytes(log.totalSize)} · ${formatDuration(log.durationMs)}`;
  };

  // ==================== 高级封装方法（对外接口）====================

  /**
   * 获取最新操作摘要（格式化）
   */
  const getLatestOperationSummary = async (): Promise<FormattedLogSummary | null> => {
    const log = await getLatestLog();
    if (!log) return null;

    return {
      time: formatTimestamp(log.timestamp),
      operationType: getOperationTypeLabel(log.operationType),
      linkType: getLinkTypeLabel(log.linkType),
      status: log.errorCount > 0 ? (log.successCount > 0 ? 'partial' : 'failed') : 'success',
      summary: formatLogTicker(log),
      details: {
        totalFiles: log.sourceCount,
        successFiles: log.successCount,
        failedFiles: log.errorCount,
        totalSize: formatBytes(log.totalSize),
        duration: formatDuration(log.durationMs),
        targetDirectory: log.targetDirectory,
      },
      errors: log.errors.length > 0 ? log.errors : undefined,
    };
  };

  /**
   * 获取操作历史（格式化）
   */
  const getOperationHistory = async (limit?: number): Promise<FormattedLogSummary[]> => {
    const logs = await getAllLogs();
    const formattedLogs = logs.map((log) => ({
      time: formatTimestamp(log.timestamp),
      operationType: getOperationTypeLabel(log.operationType),
      linkType: getLinkTypeLabel(log.linkType),
      status: (log.errorCount > 0 ? (log.successCount > 0 ? 'partial' : 'failed') : 'success') as 'success' | 'partial' | 'failed',
      summary: formatLogTicker(log),
      details: {
        totalFiles: log.sourceCount,
        successFiles: log.successCount,
        failedFiles: log.errorCount,
        totalSize: formatBytes(log.totalSize),
        duration: formatDuration(log.durationMs),
        targetDirectory: log.targetDirectory,
      },
      errors: log.errors.length > 0 ? log.errors : undefined,
    }));

    return limit ? formattedLogs.slice(0, limit) : formattedLogs;
  };

  return {
    validateFile,
    validateFiles,
    getFileWarning,
    parsePathsToFileItems,
    mergeFileItems,
    removeFileByIndex,
    moveAndLink,
    createLinksOnly,
    cancelOperation,
    startProgressListener,
    stopProgressListener,
    getLatestLog,
    getAllLogs,
    formatTimestamp,
    formatDuration,
    formatBytes,
    getOperationTypeLabel,
    getLinkTypeLabel,
    formatLogTicker,
    getLatestOperationSummary,
    getOperationHistory,
  };
}