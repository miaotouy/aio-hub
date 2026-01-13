import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import { formatBytes, resolveEnvPath } from '../utils/utils';
import { useDirectoryJanitorStore } from '../stores/store';
import type { AnalysisResult, CleanupResult } from '../types';
import type { CleanupPreset } from '../config/presets';

const logger = createModuleLogger('directory-janitor/runner');
const errorHandler = createModuleErrorHandler('directory-janitor/runner');

export interface ScanOptions {
  path: string;
  namePattern?: string;
  minAgeDays?: number;
  minSizeMB?: number;
  maxDepth?: number;
}

export interface FormattedScanResult {
  summary: string;
  details: {
    totalItems: number;
    totalSize: number;
    totalDirs: number;
    totalFiles: number;
    items: any[];
  };
}

/**
 * 目录清道夫业务逻辑 Composable
 * 
 * 负责协调扫描、清理等业务操作
 */
export function useDirectoryJanitorRunner() {
  // 获取 Pinia store
  const store = useDirectoryJanitorStore();

  // 事件监听器
  let scanProgressUnlistener: (() => void) | null = null;
  let cleanupProgressUnlistener: (() => void) | null = null;

  // ==================== 初始化与清理 ====================

  /**
   * 初始化，注册事件监听
   */
  async function initialize(): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        const window = getCurrentWindow();
        
        // 监听扫描进度
        scanProgressUnlistener = await window.listen(
          'directory-scan-progress',
          (event: any) => {
            store.scanProgress = event.payload;
            logger.debug('扫描进度更新', store.scanProgress);
          }
        );
        
        // 监听清理进度
        cleanupProgressUnlistener = await window.listen(
          'directory-cleanup-progress',
          (event: any) => {
            store.cleanupProgress = event.payload;
            logger.debug('清理进度更新', store.cleanupProgress);
          }
        );
        
        logger.info('DirectoryJanitor 初始化完成');
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '初始化失败',
      }
    );
  }

  /**
   * 清理资源
   */
  async function dispose(): Promise<void> {
    if (scanProgressUnlistener) {
      scanProgressUnlistener();
      scanProgressUnlistener = null;
    }
    if (cleanupProgressUnlistener) {
      cleanupProgressUnlistener();
      cleanupProgressUnlistener = null;
    }
    logger.info('DirectoryJanitor 已清理');
  }

  // ==================== 预设管理 ====================

  /**
   * 应用预设配置
   */
  async function applyPreset(preset: CleanupPreset): Promise<{
    presetName: string;
    resolvedPath: string;
    needSelectPath: boolean;
  } | null> {
    return await errorHandler.wrapAsync(
      async () => {
        // 解析环境变量
        const resolvedPath = await resolveEnvPath(preset.scanPath);
        
        store.scanPath = resolvedPath;
        store.namePattern = preset.namePattern;
        store.minAgeDays = preset.minAgeDays;
        store.minSizeMB = preset.minSizeMB;
        store.maxDepth = preset.maxDepth;

        logger.info('已应用预设', {
          preset: preset.name,
          originalPath: preset.scanPath,
          resolvedPath,
        });

        return {
          presetName: preset.name,
          resolvedPath,
          needSelectPath: !preset.scanPath,
        };
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '应用预设失败',
        context: preset,
      }
    );
  }

  // ==================== 路径分析 ====================

  /**
   * 分析路径（核心扫描方法）
   */
  async function analyzePath(options?: Partial<ScanOptions>): Promise<AnalysisResult | null> {
    return await errorHandler.wrapAsync(
      async () => {
        // 合并参数：优先使用传入的 options，否则使用 store 状态
        const scanOptions: ScanOptions = {
          path: options?.path ?? store.scanPath,
          namePattern: options?.namePattern ?? store.namePattern,
          minAgeDays: options?.minAgeDays ?? store.minAgeDays,
          minSizeMB: options?.minSizeMB ?? store.minSizeMB,
          maxDepth: options?.maxDepth ?? store.maxDepth,
        };

        if (!scanOptions.path) {
          throw new Error('扫描路径不能为空');
        }

        store.isAnalyzing = true;
        store.showProgress = true;
        store.scanProgress = null;

        try {
          const result: AnalysisResult = await invoke('analyze_directory_for_cleanup', {
            path: scanOptions.path,
            namePattern: scanOptions.namePattern || undefined,
            minAgeDays: scanOptions.minAgeDays,
            minSizeMb: scanOptions.minSizeMB,
            maxDepth: scanOptions.maxDepth === 10 ? undefined : scanOptions.maxDepth,
            window: getCurrentWindow(),
          });

          store.allItems = result.items;
          store.selectedPaths = new Set();
          store.hasAnalyzed = true;

          // 清除之前的二次筛选条件
          store.clearFilters();

          logger.info('目录分析完成', {
            path: scanOptions.path,
            totalItems: result.statistics.totalItems,
            totalSize: result.statistics.totalSize,
          });

          return result;
        } finally {
          store.isAnalyzing = false;
          store.showProgress = false;
          store.scanProgress = null;
        }
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '分析失败',
        context: options,
      }
    );
  }

  // ==================== 清理操作 ====================

  /**
   * 执行清理（核心清理方法）
   */
  async function cleanupItems(paths: string[]): Promise<CleanupResult | null> {
    return await errorHandler.wrapAsync(
      async () => {
        store.isCleaning = true;
        store.cleanupProgress = null;

        try {
          const result: CleanupResult = await invoke('cleanup_items', {
            paths,
            window: getCurrentWindow(),
          });

          logger.info('清理完成', {
            successCount: result.successCount,
            errorCount: result.errorCount,
            freedSpace: result.freedSpace,
          });

          // 从列表中移除成功清理的项目
          store.allItems = store.allItems.filter(
            (item) => !paths.includes(item.path) || result.errors.some((e) => e.includes(item.path))
          );
          store.selectedPaths = new Set();

          return result;
        } finally {
          store.isCleaning = false;
          store.cleanupProgress = null;
        }
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '清理失败',
        context: { pathsCount: paths.length },
      }
    );
  }

  /**
   * 清理选中的项目
   */
  async function cleanupSelected(): Promise<CleanupResult | null> {
    const pathsToClean = Array.from(store.selectedPaths);
    if (pathsToClean.length === 0) {
      throw new Error('请先选择要清理的项目');
    }

    return await cleanupItems(pathsToClean);
  }

  // ==================== 选择管理 ====================

  /**
   * 切换项目选择
   */
  function toggleItem(path: string): void {
    const newSet = new Set(store.selectedPaths);
    if (newSet.has(path)) {
      newSet.delete(path);
    } else {
      newSet.add(path);
    }
    store.selectedPaths = newSet;
  }

  /**
   * 全选/取消全选
   */
  function selectAll(checked: boolean): void {
    const newSet = new Set(store.selectedPaths);
    if (checked) {
      store.filteredItems.forEach((item) => newSet.add(item.path));
    } else {
      newSet.clear();
    }
    store.selectedPaths = newSet;
  }

  // ==================== 高级封装方法 ====================

  /**
   * 获取格式化的扫描结果
   */
  function getFormattedScanResult(): FormattedScanResult {
    const stats = store.filteredStatistics;
    const summary = `扫描完成: 找到 ${stats.totalItems} 项（${stats.totalDirs} 个目录，${stats.totalFiles} 个文件），共 ${formatBytes(stats.totalSize)}`;

    return {
      summary,
      details: {
        totalItems: stats.totalItems,
        totalSize: stats.totalSize,
        totalDirs: stats.totalDirs,
        totalFiles: stats.totalFiles,
        items: store.filteredItems,
      },
    };
  }

  // ==================== 返回接口 ====================

  return {
    // 初始化与清理
    initialize,
    dispose,

    // 预设管理
    applyPreset,

    // 扫描操作
    analyzePath,

    // 清理操作
    cleanupItems,
    cleanupSelected,

    // 选择管理
    toggleItem,
    selectAll,

    // 高级封装
    getFormattedScanResult,
  };
}