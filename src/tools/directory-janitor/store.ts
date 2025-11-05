import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ItemInfo, DirectoryScanProgress, Statistics } from './types';

/**
 * 目录清道夫 Pinia Store
 * 
 * 使用 Pinia 确保状态单例，避免重复创建响应式引用
 */
export const useDirectoryJanitorStore = defineStore('directory-janitor', () => {
  // ==================== 扫描配置状态 ====================
  const scanPath = ref('');
  const namePattern = ref('');
  const minAgeDays = ref<number | undefined>(undefined);
  const minSizeMB = ref<number | undefined>(undefined);
  const maxDepth = ref(5);

  // ==================== 结果状态 ====================
  const allItems = ref<ItemInfo[]>([]);
  const selectedPaths = ref<Set<string>>(new Set());
  const hasAnalyzed = ref(false);

  // ==================== 二次筛选条件 ====================
  const filterNamePattern = ref('');
  const filterMinAgeDays = ref<number | undefined>(undefined);
  const filterMinSizeMB = ref<number | undefined>(undefined);

  // ==================== 进度状态 ====================
  const isAnalyzing = ref(false);
  const showProgress = ref(false);
  const scanProgress = ref<DirectoryScanProgress | null>(null);

  // ==================== 计算属性 ====================

  /**
   * 过滤后的项目列表
   */
  const filteredItems = computed(() => {
    let filtered = allItems.value;

    // 名称筛选
    if (filterNamePattern.value) {
      const pattern = filterNamePattern.value.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(pattern) ||
          item.path.toLowerCase().includes(pattern)
      );
    }

    // 年龄筛选
    if (filterMinAgeDays.value !== undefined && filterMinAgeDays.value > 0) {
      const minTimestamp = Math.floor(Date.now() / 1000) - filterMinAgeDays.value * 86400;
      filtered = filtered.filter((item) => item.modified < minTimestamp);
    }

    // 大小筛选
    if (filterMinSizeMB.value !== undefined && filterMinSizeMB.value > 0) {
      const minSize = filterMinSizeMB.value * 1024 * 1024;
      filtered = filtered.filter((item) => item.size >= minSize);
    }

    return filtered;
  });

  /**
   * 过滤后的统计信息
   */
  const filteredStatistics = computed<Statistics>(() => ({
    totalItems: filteredItems.value.length,
    totalSize: filteredItems.value.reduce((sum, item) => sum + item.size, 0),
    totalDirs: filteredItems.value.filter((item) => item.isDir).length,
    totalFiles: filteredItems.value.filter((item) => !item.isDir).length,
  }));

  /**
   * 是否有激活的筛选条件
   */
  const hasActiveFilters = computed(() => {
    return !!(
      filterNamePattern.value ||
      filterMinAgeDays.value ||
      filterMinSizeMB.value
    );
  });

  /**
   * 选中的项目列表
   */
  const selectedItems = computed(() =>
    filteredItems.value.filter((item) => selectedPaths.value.has(item.path))
  );

  /**
   * 选中项目的总大小
   */
  const selectedSize = computed(() =>
    selectedItems.value.reduce((sum, item) => sum + item.size, 0)
  );

  // ==================== Actions ====================

  /**
   * 清除所有筛选条件
   */
  function clearFilters() {
    filterNamePattern.value = '';
    filterMinAgeDays.value = undefined;
    filterMinSizeMB.value = undefined;
  }

  /**
   * 重置所有状态
   */
  function reset() {
    scanPath.value = '';
    namePattern.value = '';
    minAgeDays.value = undefined;
    minSizeMB.value = undefined;
    maxDepth.value = 5;
    allItems.value = [];
    selectedPaths.value = new Set();
    hasAnalyzed.value = false;
    clearFilters();
  }

  return {
    // 扫描配置状态
    scanPath,
    namePattern,
    minAgeDays,
    minSizeMB,
    maxDepth,

    // 结果状态
    allItems,
    selectedPaths,
    hasAnalyzed,

    // 二次筛选条件
    filterNamePattern,
    filterMinAgeDays,
    filterMinSizeMB,

    // 进度状态
    isAnalyzing,
    showProgress,
    scanProgress,

    // 计算属性
    filteredItems,
    filteredStatistics,
    hasActiveFilters,
    selectedItems,
    selectedSize,

    // Actions
    clearFilters,
    reset,
  };
});