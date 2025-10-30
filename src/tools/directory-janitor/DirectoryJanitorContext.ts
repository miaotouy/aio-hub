import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import { formatBytes, resolveEnvPath } from './utils';
import type {
  ItemInfo,
  AnalysisResult,
  CleanupResult,
  DirectoryScanProgress,
  Statistics,
} from './types';
import type { CleanupPreset } from './presets';

const logger = createModuleLogger('directory-janitor/context');
const errorHandler = createModuleErrorHandler('directory-janitor/context');

// ==================== 类型定义 ====================

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
    items: ItemInfo[];
  };
}

// ==================== DirectoryJanitorContext 类 ====================

/**
 * 目录清道夫上下文 - 封装所有响应式状态和业务逻辑
 * 
 * 这是一个有状态的实例，每个消费者（UI 或 Agent）都会获得独立的 Context。
 * 所有状态都是 Vue 响应式的，可以直接在组件中使用。
 */
export class DirectoryJanitorContext {
  // ==================== 扫描配置状态 ====================
  public readonly scanPath: Ref<string>;
  public readonly namePattern: Ref<string>;
  public readonly minAgeDays: Ref<number | undefined>;
  public readonly minSizeMB: Ref<number | undefined>;
  public readonly maxDepth: Ref<number>;

  // ==================== 结果状态 ====================
  public readonly allItems: Ref<ItemInfo[]>;
  public readonly selectedPaths: Ref<Set<string>>;
  public readonly hasAnalyzed: Ref<boolean>;

  // ==================== 二次筛选条件 ====================
  public readonly filterNamePattern: Ref<string>;
  public readonly filterMinAgeDays: Ref<number | undefined>;
  public readonly filterMinSizeMB: Ref<number | undefined>;

  // ==================== 进度状态 ====================
  public readonly isAnalyzing: Ref<boolean>;
  public readonly showProgress: Ref<boolean>;
  public readonly scanProgress: Ref<DirectoryScanProgress | null>;

  // ==================== 事件监听器 ====================
  private progressUnlistener: (() => void) | null = null;

  // ==================== 计算属性 ====================

  /**
   * 过滤后的项目列表
   */
  public readonly filteredItems: ComputedRef<ItemInfo[]>;

  /**
   * 过滤后的统计信息
   */
  public readonly filteredStatistics: ComputedRef<Statistics>;

  /**
   * 是否有激活的筛选条件
   */
  public readonly hasActiveFilters: ComputedRef<boolean>;

  /**
   * 选中的项目列表
   */
  public readonly selectedItems: ComputedRef<ItemInfo[]>;

  /**
   * 选中项目的总大小
   */
  public readonly selectedSize: ComputedRef<number>;

  // ==================== 构造函数 ====================

  constructor() {
    // 初始化扫描配置状态
    this.scanPath = ref('');
    this.namePattern = ref('');
    this.minAgeDays = ref<number | undefined>(undefined);
    this.minSizeMB = ref<number | undefined>(undefined);
    this.maxDepth = ref(5);

    // 初始化结果状态
    this.allItems = ref<ItemInfo[]>([]);
    this.selectedPaths = ref<Set<string>>(new Set());
    this.hasAnalyzed = ref(false);

    // 初始化二次筛选条件
    this.filterNamePattern = ref('');
    this.filterMinAgeDays = ref<number | undefined>(undefined);
    this.filterMinSizeMB = ref<number | undefined>(undefined);

    // 初始化进度状态
    this.isAnalyzing = ref(false);
    this.showProgress = ref(false);
    this.scanProgress = ref<DirectoryScanProgress | null>(null);

    // 初始化计算属性
    this.filteredItems = computed(() => {
      let filtered = this.allItems.value;

      // 名称筛选
      if (this.filterNamePattern.value) {
        const pattern = this.filterNamePattern.value.toLowerCase();
        filtered = filtered.filter(
          (item) =>
            item.name.toLowerCase().includes(pattern) ||
            item.path.toLowerCase().includes(pattern)
        );
      }

      // 年龄筛选
      if (this.filterMinAgeDays.value !== undefined && this.filterMinAgeDays.value > 0) {
        const minTimestamp = Math.floor(Date.now() / 1000) - this.filterMinAgeDays.value * 86400;
        filtered = filtered.filter((item) => item.modified < minTimestamp);
      }

      // 大小筛选
      if (this.filterMinSizeMB.value !== undefined && this.filterMinSizeMB.value > 0) {
        const minSize = this.filterMinSizeMB.value * 1024 * 1024;
        filtered = filtered.filter((item) => item.size >= minSize);
      }

      return filtered;
    });

    this.filteredStatistics = computed(() => ({
      totalItems: this.filteredItems.value.length,
      totalSize: this.filteredItems.value.reduce((sum, item) => sum + item.size, 0),
      totalDirs: this.filteredItems.value.filter((item) => item.isDir).length,
      totalFiles: this.filteredItems.value.filter((item) => !item.isDir).length,
    }));

    this.hasActiveFilters = computed(() => {
      return !!(
        this.filterNamePattern.value ||
        this.filterMinAgeDays.value ||
        this.filterMinSizeMB.value
      );
    });

    this.selectedItems = computed(() =>
      this.filteredItems.value.filter((item) => this.selectedPaths.value.has(item.path))
    );

    this.selectedSize = computed(() =>
      this.selectedItems.value.reduce((sum, item) => sum + item.size, 0)
    );

    logger.info('DirectoryJanitorContext 实例已创建');
  }

  // ==================== 初始化与清理 ====================

  /**
   * 初始化上下文，注册事件监听
   */
  public async initialize(): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        const window = getCurrentWindow();
        this.progressUnlistener = await window.listen(
          'directory-scan-progress',
          (event: any) => {
            this.scanProgress.value = event.payload as DirectoryScanProgress;
            logger.debug('扫描进度更新', this.scanProgress.value);
          }
        );
        logger.info('DirectoryJanitorContext 初始化完成');
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '初始化上下文失败',
      }
    );
  }

  /**
   * 清理资源
   */
  public async dispose(): Promise<void> {
    if (this.progressUnlistener) {
      this.progressUnlistener();
      this.progressUnlistener = null;
    }
    logger.info('DirectoryJanitorContext 已清理');
  }

  // ==================== 预设管理 ====================

  /**
   * 应用预设配置
   * @returns 返回解析后的路径和预设名称，供调用方显示提示信息
   */
  public async applyPreset(preset: CleanupPreset): Promise<{
    presetName: string;
    resolvedPath: string;
    needSelectPath: boolean;
  } | null> {
    return await errorHandler.wrapAsync(
      async () => {
        // 解析环境变量
        const resolvedPath = await resolveEnvPath(preset.scanPath);
        
        this.scanPath.value = resolvedPath;
        this.namePattern.value = preset.namePattern;
        this.minAgeDays.value = preset.minAgeDays;
        this.minSizeMB.value = preset.minSizeMB;
        this.maxDepth.value = preset.maxDepth;

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
  public async analyzePath(options?: Partial<ScanOptions>): Promise<AnalysisResult | null> {
    return await errorHandler.wrapAsync(
      async () => {
        // 合并参数：优先使用传入的 options，否则使用实例状态
        const scanOptions: ScanOptions = {
          path: options?.path ?? this.scanPath.value,
          namePattern: options?.namePattern ?? this.namePattern.value,
          minAgeDays: options?.minAgeDays ?? this.minAgeDays.value,
          minSizeMB: options?.minSizeMB ?? this.minSizeMB.value,
          maxDepth: options?.maxDepth ?? this.maxDepth.value,
        };

        if (!scanOptions.path) {
          throw new Error('扫描路径不能为空');
        }

        this.isAnalyzing.value = true;
        this.showProgress.value = true;
        this.scanProgress.value = null;

        try {
          const result: AnalysisResult = await invoke('analyze_directory_for_cleanup', {
            path: scanOptions.path,
            namePattern: scanOptions.namePattern || undefined,
            minAgeDays: scanOptions.minAgeDays,
            minSizeMb: scanOptions.minSizeMB,
            maxDepth: scanOptions.maxDepth === 10 ? undefined : scanOptions.maxDepth,
            window: getCurrentWindow(),
          });

          this.allItems.value = result.items;
          this.selectedPaths.value.clear();
          this.hasAnalyzed.value = true;

          // 清除之前的二次筛选条件
          this.clearFilters();

          logger.info('目录分析完成', {
            path: scanOptions.path,
            totalItems: result.statistics.totalItems,
            totalSize: result.statistics.totalSize,
          });

          return result;
        } finally {
          this.isAnalyzing.value = false;
          this.showProgress.value = false;
          this.scanProgress.value = null;
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
  public async cleanupItems(paths: string[]): Promise<CleanupResult | null> {
    return await errorHandler.wrapAsync(
      async () => {
        const result: CleanupResult = await invoke('cleanup_items', {
          paths,
        });

        logger.info('清理完成', {
          successCount: result.successCount,
          errorCount: result.errorCount,
          freedSpace: result.freedSpace,
        });

        // 从列表中移除成功清理的项目
        this.allItems.value = this.allItems.value.filter(
          (item) => !paths.includes(item.path) || result.errors.some((e) => e.includes(item.path))
        );
        this.selectedPaths.value.clear();

        return result;
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
  public async cleanupSelected(): Promise<CleanupResult | null> {
    const pathsToClean = Array.from(this.selectedPaths.value);
    if (pathsToClean.length === 0) {
      throw new Error('请先选择要清理的项目');
    }

    return await this.cleanupItems(pathsToClean);
  }

  // ==================== 选择管理 ====================

  /**
   * 切换项目选择
   */
  public toggleItem(item: ItemInfo): void {
    const newSet = new Set(this.selectedPaths.value);
    if (newSet.has(item.path)) {
      newSet.delete(item.path);
    } else {
      newSet.add(item.path);
    }
    this.selectedPaths.value = newSet;
  }

  /**
   * 全选/取消全选
   */
  public selectAll(checked: boolean): void {
    const newSet = new Set(this.selectedPaths.value);
    if (checked) {
      this.filteredItems.value.forEach((item) => newSet.add(item.path));
    } else {
      newSet.clear();
    }
    this.selectedPaths.value = newSet;
  }

  // ==================== 筛选管理 ====================

  /**
   * 清除所有筛选条件
   */
  public clearFilters(): void {
    this.filterNamePattern.value = '';
    this.filterMinAgeDays.value = undefined;
    this.filterMinSizeMB.value = undefined;
  }

  // ==================== 状态重置 ====================

  /**
   * 重置所有状态
   */
  public reset(): void {
    this.scanPath.value = '';
    this.namePattern.value = '';
    this.minAgeDays.value = undefined;
    this.minSizeMB.value = undefined;
    this.maxDepth.value = 5;
    this.allItems.value = [];
    this.selectedPaths.value.clear();
    this.hasAnalyzed.value = false;
    this.clearFilters();
    logger.info('上下文已重置');
  }

  // ==================== 高级封装方法（Agent 调用接口）====================

  /**
   * 获取格式化的扫描结果（推荐 Agent 使用）
   */
  public getFormattedScanResult(): FormattedScanResult {
    const stats = this.filteredStatistics.value;
    const summary = `扫描完成: 找到 ${stats.totalItems} 项（${stats.totalDirs} 个目录，${stats.totalFiles} 个文件），共 ${formatBytes(stats.totalSize)}`;

    return {
      summary,
      details: {
        totalItems: stats.totalItems,
        totalSize: stats.totalSize,
        totalDirs: stats.totalDirs,
        totalFiles: stats.totalFiles,
        items: this.filteredItems.value,
      },
    };
  }
}