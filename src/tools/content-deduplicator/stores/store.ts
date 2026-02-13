import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  SimilarityConfig,
  DedupAnalysisResult,
  DuplicateGroup,
  DedupScanProgress,
  SortBy,
  FilterMatchType,
} from "../types";
import { getConfigFromPreset } from "../config/presets";

export const useContentDeduplicatorStore = defineStore("content-deduplicator", () => {
  // ==================== 扫描配置 ====================
  const scanPath = ref("");
  const config = ref<SimilarityConfig>(getConfigFromPreset("relaxed"));

  // ==================== 扫描状态 ====================
  const isScanning = ref(false);
  const scanProgress = ref<DedupScanProgress | null>(null);
  const hasScanned = ref(false);

  // ==================== 结果 ====================
  const result = ref<DedupAnalysisResult | null>(null);

  // ==================== 删除状态 ====================
  const isDeleting = ref(false);

  // ==================== UI 状态 ====================
  /** 选中的文件路径（用于批量删除） */
  const selectedPaths = ref<Set<string>>(new Set());
  /** 当前选中查看的重复组 */
  const activeGroupId = ref<string | null>(null);
  /** 当前选中对比的文件路径 */
  const diffFilePath = ref<string | null>(null);
  /** 排序方式 */
  const sortBy = ref<SortBy>("wastedBytes");
  /** 筛选匹配类型 */
  const filterMatchType = ref<FilterMatchType>("all");
  /** 搜索关键词 */
  const searchKeyword = ref("");

  // ==================== 计算属性 ====================

  /** 排序并筛选后的重复组 */
  const filteredGroups = computed<DuplicateGroup[]>(() => {
    if (!result.value) return [];

    let groups = [...result.value.groups];

    // 按匹配类型筛选
    if (filterMatchType.value !== "all") {
      groups = groups.filter((g) =>
        g.similarFiles.some((sf) => sf.matchType === filterMatchType.value)
      );
    }

    // 按关键词搜索
    if (searchKeyword.value.trim()) {
      const kw = searchKeyword.value.toLowerCase();
      groups = groups.filter((g) => {
        const repMatch =
          g.representativeFile.name.toLowerCase().includes(kw) ||
          g.representativeFile.path.toLowerCase().includes(kw);
        const simMatch = g.similarFiles.some(
          (sf) => sf.file.name.toLowerCase().includes(kw) || sf.file.path.toLowerCase().includes(kw)
        );
        return repMatch || simMatch;
      });
    }

    // 排序
    switch (sortBy.value) {
      case "wastedBytes":
        groups.sort((a, b) => b.metadata.totalWastedBytes - a.metadata.totalWastedBytes);
        break;
      case "similarity":
        groups.sort((a, b) => b.metadata.avgSimilarity - a.metadata.avgSimilarity);
        break;
      case "fileCount":
        groups.sort((a, b) => b.similarFiles.length - a.similarFiles.length);
        break;
    }

    return groups;
  });

  /** 当前活跃的重复组 */
  const activeGroup = computed<DuplicateGroup | null>(() => {
    if (!activeGroupId.value || !result.value) return null;
    return result.value.groups.find((g) => g.id === activeGroupId.value) ?? null;
  });

  /** 选中文件的总大小 */
  const selectedTotalSize = computed(() => {
    if (!result.value) return 0;
    let total = 0;
    for (const group of result.value.groups) {
      for (const sf of group.similarFiles) {
        if (selectedPaths.value.has(sf.file.path)) {
          total += sf.file.size;
        }
      }
    }
    return total;
  });

  // ==================== 方法 ====================

  /** 应用预设 */
  function applyPreset(presetId: string) {
    config.value = getConfigFromPreset(presetId);
  }

  /** 设置扫描结果 */
  function setResult(data: DedupAnalysisResult) {
    result.value = data;
    hasScanned.value = true;
    selectedPaths.value.clear();
    activeGroupId.value = null;
    diffFilePath.value = null;
  }

  /** 选中组内所有非代表文件 */
  function selectGroupDuplicates(groupId: string) {
    const group = result.value?.groups.find((g) => g.id === groupId);
    if (!group) return;
    for (const sf of group.similarFiles) {
      selectedPaths.value.add(sf.file.path);
    }
  }

  /** 取消选中组内所有文件 */
  function deselectGroupDuplicates(groupId: string) {
    const group = result.value?.groups.find((g) => g.id === groupId);
    if (!group) return;
    for (const sf of group.similarFiles) {
      selectedPaths.value.delete(sf.file.path);
    }
  }

  /** 全选所有非代表文件 */
  function selectAllDuplicates() {
    if (!result.value) return;
    for (const group of result.value.groups) {
      for (const sf of group.similarFiles) {
        selectedPaths.value.add(sf.file.path);
      }
    }
  }

  /** 清空选择 */
  function clearSelection() {
    selectedPaths.value.clear();
  }

  /** 从结果中移除已删除的文件 */
  function removeDeletedPaths(deletedPaths: string[]) {
    if (!result.value) return;
    const deletedSet = new Set(deletedPaths);

    for (const group of result.value.groups) {
      group.similarFiles = group.similarFiles.filter((sf) => !deletedSet.has(sf.file.path));
      // 重新计算元数据
      group.metadata.totalWastedBytes = group.similarFiles.reduce(
        (sum, sf) => sum + sf.file.size,
        0
      );
    }

    // 移除没有相似文件的组
    result.value.groups = result.value.groups.filter((g) => g.similarFiles.length > 0);

    // 更新统计
    result.value.statistics.totalGroups = result.value.groups.length;
    result.value.statistics.totalDuplicates = result.value.groups.reduce(
      (sum, g) => sum + g.similarFiles.length,
      0
    );
    result.value.statistics.totalWastedBytes = result.value.groups.reduce(
      (sum, g) => sum + g.metadata.totalWastedBytes,
      0
    );

    // 清理选中状态
    for (const p of deletedPaths) {
      selectedPaths.value.delete(p);
    }
  }

  /** 重置所有状态 */
  function $reset() {
    scanPath.value = "";
    config.value = getConfigFromPreset("relaxed");
    isScanning.value = false;
    scanProgress.value = null;
    hasScanned.value = false;
    result.value = null;
    isDeleting.value = false;
    selectedPaths.value.clear();
    activeGroupId.value = null;
    diffFilePath.value = null;
    sortBy.value = "wastedBytes";
    filterMatchType.value = "all";
    searchKeyword.value = "";
  }

  return {
    // 配置
    scanPath,
    config,
    // 扫描状态
    isScanning,
    scanProgress,
    hasScanned,
    // 结果
    result,
    // 删除状态
    isDeleting,
    // UI 状态
    selectedPaths,
    activeGroupId,
    diffFilePath,
    sortBy,
    filterMatchType,
    searchKeyword,
    // 计算属性
    filteredGroups,
    activeGroup,
    selectedTotalSize,
    // 方法
    applyPreset,
    setResult,
    selectGroupDuplicates,
    deselectGroupDuplicates,
    selectAllDuplicates,
    clearSelection,
    removeDeletedPaths,
    $reset,
  };
});
