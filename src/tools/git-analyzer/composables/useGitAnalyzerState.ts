import { ref, computed } from "vue";
import type {
  GitCommit,
  GitBranch,
  RepoStatistics,
  ExportConfig,
  GitLoadConfig,
  ExportPreset,
} from "../types";
import { commitCache } from "./useCommitCache";

// ==================== 单例状态（模块级别）====================
// 将所有状态定义在模块级别，确保所有调用使用同一个实例

const loading = ref(false);
const repoPath = ref("");
const selectedBranch = ref("main");
const branches = ref<GitBranch[]>([]);

const commits = ref<GitCommit[]>([]);
const filteredCommits = ref<GitCommit[]>([]);

const limitCount = ref(100);
const batchSize = ref(20);
const includeFiles = ref(true);
const commitRange = ref<[number, number]>([0, 0]);

const LOAD_CONFIG_STORAGE_KEY = "git-analyzer-load-config";
const DEFAULT_LOAD_CONFIG: GitLoadConfig = {
  includeFilePaths: true,
  includeLineStats: false,
  includeBranchInference: false,
};

function loadStoredLoadConfig(): GitLoadConfig {
  try {
    const raw = localStorage.getItem(LOAD_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LOAD_CONFIG };
    return { ...DEFAULT_LOAD_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_LOAD_CONFIG };
  }
}

const loadConfig = ref<GitLoadConfig>(loadStoredLoadConfig());
includeFiles.value = loadConfig.value.includeFilePaths;

const searchQuery = ref("");
const excludeQuery = ref("");
const dateRange = ref<[Date, Date] | null>(null);
const authorFilter = ref("");
const reverseOrder = ref(false);
const commitTypeFilter = ref<string[]>([]);

const currentPage = ref(1);
const pageSize = ref(20);

// 导出配置
const exportConfig = ref<ExportConfig>({
  format: "markdown",
  includeStatistics: true,
  includeCommits: true,
  includeContributors: true,
  includeTimeline: false,
  includeCharts: false,
  commitRange: "filtered",
  customCount: 100,
  dateFormat: "local",
  includeAuthor: true,
  includeEmail: false,
  includeFullMessage: false,
  includeFiles: false,
  includeTags: true,
  includeBranches: true,
  includeStats: false,
  includeFilterInfo: true,
  htmlTheme: "light",
});

// 导出预设
const exportPresets = ref<ExportPreset[]>([]);
const currentPresetId = ref<string>("");
const repoLastPreset = ref<Record<string, string>>({});

// 保存当前配置为新预设
function savePreset(name: string, isRepoSpecific: boolean) {
  const id = `preset-${Date.now()}`;
  const newPreset: ExportPreset = {
    id,
    name,
    repoPath: isRepoSpecific ? repoPath.value : "",
    config: JSON.parse(JSON.stringify(exportConfig.value)),
  };
  exportPresets.value.push(newPreset);
  currentPresetId.value = id;

  if (isRepoSpecific && repoPath.value) {
    repoLastPreset.value[repoPath.value] = id;
  }
}

// 更新已有预设的配置
function updatePreset(id: string) {
  const preset = exportPresets.value.find((p) => p.id === id);
  if (preset) {
    preset.config = JSON.parse(JSON.stringify(exportConfig.value));
  }
}

// 重命名预设
function renamePreset(id: string, newName: string) {
  const preset = exportPresets.value.find((p) => p.id === id);
  if (preset) {
    preset.name = newName;
  }
}

// 删除预设
function deletePreset(id: string) {
  const index = exportPresets.value.findIndex((p) => p.id === id);
  if (index !== -1) {
    exportPresets.value.splice(index, 1);
    // 如果删除的是当前选中的预设，则清空选中
    if (currentPresetId.value === id) {
      currentPresetId.value = "";
    }
  }
}

// 应用预设配置
function applyPreset(id: string) {
  const preset = exportPresets.value.find((p) => p.id === id);
  if (preset) {
    exportConfig.value = JSON.parse(JSON.stringify(preset.config));
    currentPresetId.value = id;
    if (repoPath.value) {
      repoLastPreset.value[repoPath.value] = id;
    }
  }
}

// 切换仓库时，自动加载并应用最合适的预设
function loadPresetsForRepo(path: string) {
  if (!path) return;

  // 1. 检查该仓库上次使用的预设
  const lastPresetId = repoLastPreset.value[path];
  if (lastPresetId && exportPresets.value.some((p) => p.id === lastPresetId)) {
    applyPreset(lastPresetId);
    return;
  }

  // 2. 检查是否有该仓库专属的预设
  const repoSpecificPreset = exportPresets.value.find(
    (p) => p.repoPath === path
  );
  if (repoSpecificPreset) {
    applyPreset(repoSpecificPreset.id);
    return;
  }

  // 3. 降级到默认 Markdown 预设
  const defaultPreset = exportPresets.value.find(
    (p) => p.id === "preset-default-markdown"
  );
  if (defaultPreset) {
    applyPreset(defaultPreset.id);
  } else if (exportPresets.value.length > 0) {
    applyPreset(exportPresets.value[0].id);
  }
}

const lastLoadedRepo = ref("");
const lastLoadedBranch = ref("");
const lastLoadedLimit = ref(0);

const loadingFiles = ref(false);
const enriching = ref(false);
const enrichProgress = ref({
  loaded: 0,
  total: 0,
});
const enrichedHashes = ref<Set<string>>(new Set());

const progress = ref({
  loading: false,
  loaded: 0,
  total: 0,
});

// ==================== 计算属性 ====================

const hasActiveFilters = computed(() => {
  return !!(
    searchQuery.value ||
    excludeQuery.value ||
    dateRange.value ||
    authorFilter.value ||
    commitTypeFilter.value.length > 0
  );
});

const filterSummary = computed(() => {
  const parts: string[] = [];
  if (searchQuery.value) {
    parts.push(`搜索: "${searchQuery.value}"`);
  }
  if (excludeQuery.value) {
    parts.push(`排除: "${excludeQuery.value}"`);
  }
  if (authorFilter.value) {
    parts.push(`作者: "${authorFilter.value}"`);
  }
  if (dateRange.value) {
    const [start, end] = dateRange.value;
    // 格式化日期为 YYYY-MM-DD
    const formatDate = (d: Date | string) => {
      const date = typeof d === "string" ? new Date(d) : d;
      return date.toISOString().split("T")[0];
    };
    parts.push(`日期: ${formatDate(start)} 至 ${formatDate(end)}`);
  }
  if (commitTypeFilter.value.length > 0) {
    parts.push(`类型: ${commitTypeFilter.value.join(", ")}`);
  }

  if (parts.length === 0) {
    return "当前未应用任何筛选条件。";
  }
  return `已应用的筛选条件: ${parts.join("; ")}。`;
});

const statistics = computed<RepoStatistics>(() => {
  const commitsValue = filteredCommits.value;
  if (commitsValue.length === 0) {
    return {
      totalCommits: 0,
      contributors: 0,
      timeSpan: 0,
      averagePerDay: 0,
    };
  }

  const authors = new Set(commitsValue.map((c) => c.author));
  const dates = commitsValue.map((c) => new Date(c.date).getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const days = Math.ceil(
    (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    totalCommits: commitsValue.length,
    contributors: authors.size,
    timeSpan: days,
    averagePerDay: commitsValue.length / Math.max(days, 1),
  };
});

const paginatedCommits = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return filteredCommits.value.slice(start, end);
});

// ==================== 状态重置方法 ====================

function resetProgress() {
  progress.value = {
    loading: false,
    loaded: 0,
    total: 0,
  };
}

function resetFilters() {
  searchQuery.value = "";
  excludeQuery.value = "";
  dateRange.value = null;
  authorFilter.value = "";
  reverseOrder.value = false;
  commitTypeFilter.value = [];
  currentPage.value = 1;
}

function resetCommits() {
  commits.value = [];
  filteredCommits.value = [];
  commitRange.value = [0, 0];
  enrichedHashes.value = new Set();
  commitCache.clearAll();
}

function updateLoadConfig(nextConfig: GitLoadConfig) {
  loadConfig.value = { ...nextConfig };
  includeFiles.value = loadConfig.value.includeFilePaths;
  localStorage.setItem(
    LOAD_CONFIG_STORAGE_KEY,
    JSON.stringify(loadConfig.value)
  );
}

function resetLoadConfig() {
  updateLoadConfig(DEFAULT_LOAD_CONFIG);
}

/**
 * Git 分析器状态管理 Composable
 *
 * 采用单例模式，所有状态都定义在模块级别
 * 确保无论在哪里调用，都使用同一个状态实例
 */
export function useGitAnalyzerState() {
  return {
    // 状态
    loading,
    loadingFiles,
    repoPath,
    selectedBranch,
    branches,
    commits,
    filteredCommits,
    limitCount,
    batchSize,
    includeFiles,
    loadConfig,
    commitRange,
    searchQuery,
    excludeQuery,
    dateRange,
    authorFilter,
    reverseOrder,
    commitTypeFilter,
    currentPage,
    pageSize,
    exportConfig,
    exportPresets,
    currentPresetId,
    repoLastPreset,
    lastLoadedRepo,
    lastLoadedBranch,
    lastLoadedLimit,
    progress,
    enriching,
    enrichProgress,
    enrichedHashes,

    // 计算属性
    statistics,
    paginatedCommits,
    hasActiveFilters,
    filterSummary,

    // 方法
    resetProgress,
    resetFilters,
    resetCommits,
    updateLoadConfig,
    resetLoadConfig,
    savePreset,
    updatePreset,
    renamePreset,
    deletePreset,
    applyPreset,
    loadPresetsForRepo,
  };
}
