<template>
  <div class="directory-janitor-container">
    <!-- 左侧：配置面板 -->
    <div class="config-panel">
      <InfoCard title="扫描配置" class="config-card">
        <div class="config-content">
          <!-- 预设选择 -->
          <div class="config-section preset-section">
            <label>快速预设</label>
            <el-select
              v-model="selectedPresetId"
              placeholder="选择预设配置"
              clearable
              @change="applyPreset"
              class="full-width"
            >
              <el-option
                v-for="preset in presets"
                :key="preset.id"
                :label="preset.name"
                :value="preset.id"
              >
                <div class="preset-option">
                  <span class="preset-name">{{ preset.name }}</span>
                  <span class="preset-desc">{{ preset.description }}</span>
                </div>
              </el-option>
            </el-select>
          </div>

          <div class="config-section">
            <label>扫描路径</label>
            <DropZone
              drop-id="janitor-path"
              variant="input"
              :directory-only="true"
              :multiple="false"
              hide-content
              @drop="handlePathDrop"
            >
              <div class="path-input-group">
                <el-input
                  v-model="scanPath"
                  placeholder="输入或拖拽目录路径"
                  @keyup.enter="analyzePath"
                />
                <el-button @click="selectDirectory" :icon="FolderOpened">选择</el-button>
              </div>
            </DropZone>
          </div>

          <div class="config-section">
            <label>过滤条件</label>

            <div class="filter-item">
              <span class="filter-label">名称匹配</span>
              <el-input v-model="namePattern" placeholder="例如: *.tmp 或 temp*" clearable>
                <template #prepend>
                  <el-icon>
                    <Filter />
                  </el-icon>
                </template>
              </el-input>
            </div>

            <div class="filter-item">
              <span class="filter-label">最小年龄（天）</span>
              <el-input-number
                v-model="minAgeDays"
                :min="0"
                :max="3650"
                placeholder="修改时间早于 N 天前"
                controls-position="right"
                class="full-width"
              />
            </div>

            <div class="filter-item">
              <span class="filter-label">最小大小（MB）</span>
              <el-input-number
                v-model="minSizeMB"
                :min="0"
                :max="102400"
                placeholder="大于 N MB"
                controls-position="right"
                class="full-width"
              />
            </div>

            <div class="filter-item">
              <span class="filter-label">扫描深度</span>
              <div class="slider-wrapper">
                <el-slider
                  v-model="maxDepth"
                  :min="1"
                  :max="10"
                  :marks="{ 1: '1', 5: '5', 10: '无限' }"
                  show-stops
                />
              </div>
              <div class="depth-info">{{ maxDepth === 10 ? "无限制" : `${maxDepth} 层` }}</div>
            </div>
          </div>
        </div>

        <div class="button-footer">
          <el-button
            type="primary"
            @click="analyzePath"
            :loading="isAnalyzing"
            :disabled="!scanPath"
            class="analyze-btn"
          >
            <el-icon style="padding-right: 5px">
              <Search />
            </el-icon>
            开始分析
          </el-button>
        </div>
      </InfoCard>
    </div>

    <!-- 右侧：结果面板 -->
    <div class="result-panel">
      <InfoCard title="扫描结果" class="result-card">
        <!-- 扫描进度 -->
        <div v-if="showProgress" class="progress-section">
          <div class="progress-header">
            <span class="progress-title">正在扫描...</span>
            <span v-if="scanProgress" class="progress-stats">
              已扫描: {{ scanProgress.scannedCount }} 项
              <span v-if="scanProgress.foundItems > 0"
                >| 找到: {{ scanProgress.foundItems }} 项</span
              >
            </span>
          </div>

          <div v-if="scanProgress" class="progress-details">
            <div class="current-path">当前: {{ formatCurrentPath(scanProgress.currentPath) }}</div>
            <div class="depth-info">深度: {{ scanProgress.currentDepth }} 层</div>
          </div>
        </div>

        <template #headerExtra>
          <div v-if="items.length > 0" class="header-actions">
            <el-tag type="info" size="large">
              {{ selectedItems.length }} / {{ items.length }} 项
            </el-tag>
            <el-tag type="warning" size="large">
              {{ formatBytes(selectedSize) }}
            </el-tag>
            <el-button
              type="danger"
              :disabled="selectedItems.length === 0"
              @click="confirmCleanup"
              :icon="Delete"
            >
              清理选中项
            </el-button>
          </div>
        </template>

        <div v-if="!hasAnalyzed" class="empty-state">
          <el-empty description="配置过滤条件并点击分析按钮">
            <template #image>
              <el-icon :size="64">
                <FolderDelete />
              </el-icon>
            </template>
          </el-empty>
        </div>

        <div v-else-if="items.length === 0" class="empty-state">
          <el-empty description="未找到符合条件的项目">
            <template #image>
              <el-icon :size="64">
                <SuccessFilled />
              </el-icon>
            </template>
          </el-empty>
        </div>

        <div v-else class="result-content">
          <!-- 二次筛选区域 -->
          <div class="result-filters">
            <div class="filter-row">
              <el-input
                v-model="filterNamePattern"
                placeholder="在结果中筛选名称..."
                clearable
                size="small"
                style="flex: 1"
              >
                <template #prepend>
                  <el-icon>
                    <Filter />
                  </el-icon>
                </template>
              </el-input>
              <el-input-number
                v-model="filterMinAgeDays"
                :min="0"
                placeholder="最小天数"
                controls-position="right"
                size="small"
                style="width: 140px"
              />
              <el-input-number
                v-model="filterMinSizeMB"
                :min="0"
                placeholder="最小大小(MB)"
                controls-position="right"
                size="small"
                style="width: 150px"
              />
              <el-button size="small" @click="clearFilters" :disabled="!hasActiveFilters">
                清除筛选
              </el-button>
            </div>
          </div>

          <div class="result-header">
            <el-checkbox
              v-model="selectAll"
              @change="handleSelectAll"
              :indeterminate="isIndeterminate"
            >
              全选
            </el-checkbox>
            <div class="stats-info">
              <span>显示: {{ filteredItems.length }} / {{ allItems.length }} 项</span>
              <span>总大小: {{ formatBytes(filteredStatistics.totalSize) }}</span>
              <span>目录: {{ filteredStatistics.totalDirs }}</span>
              <span>文件: {{ filteredStatistics.totalFiles }}</span>
            </div>
          </div>

          <el-scrollbar class="items-scrollbar">
            <div class="items-list">
              <div
                v-for="item in filteredItems"
                :key="item.path"
                class="item-row"
                :class="{ selected: selectedPaths.has(item.path) }"
              >
                <el-checkbox
                  :model-value="selectedPaths.has(item.path)"
                  @change="toggleItem(item)"
                />
                <el-icon class="item-icon" :class="{ 'is-dir': item.isDir }">
                  <component :is="item.isDir ? Folder : Document" />
                </el-icon>
                <div class="item-info">
                  <div class="item-name" :title="item.name">{{ item.name }}</div>
                  <div class="item-meta">
                    <span class="item-path" :title="item.path">{{ item.path }}</span>
                    <span class="item-size">{{ formatBytes(item.size) }}</span>
                    <span class="item-age">{{ formatAge(item.modified) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </el-scrollbar>
        </div>
      </InfoCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  FolderOpened,
  Search,
  Delete,
  Filter,
  FolderDelete,
  SuccessFilled,
  Folder,
  Document,
} from "@element-plus/icons-vue";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import InfoCard from "../../components/common/InfoCard.vue";
import DropZone from "../../components/common/DropZone.vue";
import { createModuleLogger } from "@utils/logger";
import { builtInPresets, type CleanupPreset } from "./presets";

// 进度事件类型定义
interface DirectoryScanProgress {
  currentPath: string;
  scannedCount: number;
  currentDepth: number;
  foundItems: number;
}

const logger = createModuleLogger("tools/directory-janitor");

// 预设配置
const presets = ref<CleanupPreset[]>(builtInPresets);
const selectedPresetId = ref<string | undefined>(undefined);

// 类型定义
interface ItemInfo {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  modified: number;
}

interface Statistics {
  totalItems: number;
  totalSize: number;
  totalDirs: number;
  totalFiles: number;
}

interface AnalysisResult {
  items: ItemInfo[];
  statistics: Statistics;
}

interface CleanupResult {
  successCount: number;
  errorCount: number;
  freedSpace: number;
  errors: string[];
}

// 配置状态
const scanPath = ref("");
const namePattern = ref("");
const minAgeDays = ref<number | undefined>(undefined);
const minSizeMB = ref<number | undefined>(undefined);
const maxDepth = ref(5);
/**
 * 解析路径中的环境变量
 * 支持 Windows 环境变量格式：%VAR%
 * 支持 Unix 环境变量格式：$VAR 或 ${VAR}
 */
const resolveEnvPath = async (path: string): Promise<string> => {
  if (!path) return path;

  let resolvedPath = path;

  // Windows 环境变量替换
  if (resolvedPath.includes("%")) {
    try {
      const home = await homeDir();
      const homePath = home?.replace(/[/\\]$/, "") || "";

      // %AppData% -> C:/Users/xxx/AppData/Roaming
      // 注意：不能使用 appDataDir()，因为它返回应用自己的目录
      if (resolvedPath.includes("%AppData%")) {
        const appDataPath = `${homePath}/AppData/Roaming`;
        resolvedPath = resolvedPath.replace(/%AppData%/gi, appDataPath);
      }

      // %LocalAppData% -> C:/Users/xxx/AppData/Local
      if (resolvedPath.includes("%LocalAppData%")) {
        const localAppDataPath = `${homePath}/AppData/Local`;
        resolvedPath = resolvedPath.replace(/%LocalAppData%/gi, localAppDataPath);
      }

      // %UserProfile% 或 %HOME% -> 用户主目录
      if (resolvedPath.includes("%UserProfile%") || resolvedPath.includes("%HOME%")) {
        resolvedPath = resolvedPath.replace(/%UserProfile%/gi, homePath);
        resolvedPath = resolvedPath.replace(/%HOME%/gi, homePath);
      }
    } catch (error) {
      logger.error("解析环境变量失败", error);
    }
  }

  // Unix 环境变量替换（$HOME, ${HOME}）
  if (resolvedPath.includes("$")) {
    try {
      if (resolvedPath.includes("$HOME") || resolvedPath.includes("${HOME}")) {
        const home = await homeDir();
        const homePath = home?.replace(/[/\\]$/, "") || "";
        resolvedPath = resolvedPath.replace(/\$HOME/g, homePath);
        resolvedPath = resolvedPath.replace(/\$\{HOME\}/g, homePath);
      }
    } catch (error) {
      logger.error("解析环境变量失败", error);
    }
  }

  // 规范化路径分隔符为正斜杠
  resolvedPath = resolvedPath.replace(/\\/g, "/");

  return resolvedPath;
};

// 应用预设
const applyPreset = async (presetId?: string) => {
  if (!presetId) {
    // 清空预设时不重置配置
    return;
  }

  const preset = presets.value.find((p) => p.id === presetId);
  if (!preset) {
    logger.warn("未找到预设", { presetId });
    return;
  }

  // 解析环境变量并应用预设配置
  const resolvedPath = await resolveEnvPath(preset.scanPath);
  scanPath.value = resolvedPath;
  namePattern.value = preset.namePattern;
  minAgeDays.value = preset.minAgeDays;
  minSizeMB.value = preset.minSizeMB;
  maxDepth.value = preset.maxDepth;

  logger.info("已应用预设", {
    preset: preset.name,
    originalPath: preset.scanPath,
    resolvedPath,
  });

  if (!preset.scanPath) {
    ElMessage.info(`已应用预设: ${preset.name}，请选择扫描路径`);
  } else {
    ElMessage.success(`已应用预设: ${preset.name}`);
  }
};

// 结果状态
const allItems = ref<ItemInfo[]>([]); // 存储完整扫描结果
const items = ref<ItemInfo[]>([]); // 保持兼容性，指向 allItems
const filterNamePattern = ref(""); // 二次筛选：名称
const filterMinAgeDays = ref<number | undefined>(undefined); // 二次筛选：最小年龄
const filterMinSizeMB = ref<number | undefined>(undefined); // 二次筛选：最小大小

const selectedPaths = ref(new Set<string>());
const isAnalyzing = ref(false);
const hasAnalyzed = ref(false);

// 进度相关状态
const scanProgress = ref<DirectoryScanProgress | null>(null);
const showProgress = ref(false);

// 计算属性 - 根据二次筛选条件过滤结果
const filteredItems = computed(() => {
  let filtered = allItems.value;

  // 名称筛选
  if (filterNamePattern.value) {
    const pattern = filterNamePattern.value.toLowerCase();
    filtered = filtered.filter(
      (item: ItemInfo) =>
        item.name.toLowerCase().includes(pattern) || item.path.toLowerCase().includes(pattern)
    );
  }

  // 年龄筛选
  if (filterMinAgeDays.value !== undefined && filterMinAgeDays.value > 0) {
    const minTimestamp = Math.floor(Date.now() / 1000) - filterMinAgeDays.value * 86400;
    filtered = filtered.filter((item: ItemInfo) => item.modified < minTimestamp);
  }

  // 大小筛选
  if (filterMinSizeMB.value !== undefined && filterMinSizeMB.value > 0) {
    const minSize = filterMinSizeMB.value * 1024 * 1024;
    filtered = filtered.filter((item: ItemInfo) => item.size >= minSize);
  }

  return filtered;
});

// 筛选后的统计信息
const filteredStatistics = computed(() => ({
  totalItems: filteredItems.value.length,
  totalSize: filteredItems.value.reduce((sum: number, item: ItemInfo) => sum + item.size, 0),
  totalDirs: filteredItems.value.filter((item: ItemInfo) => item.isDir).length,
  totalFiles: filteredItems.value.filter((item: ItemInfo) => !item.isDir).length,
}));

// 是否有激活的筛选条件
const hasActiveFilters = computed(() => {
  return !!(filterNamePattern.value || filterMinAgeDays.value || filterMinSizeMB.value);
});

// 清除筛选条件
const clearFilters = () => {
  filterNamePattern.value = "";
  filterMinAgeDays.value = undefined;
  filterMinSizeMB.value = undefined;
};

const selectedItems = computed(() =>
  filteredItems.value.filter((item: ItemInfo) => selectedPaths.value.has(item.path))
);

const selectedSize = computed(() =>
  selectedItems.value.reduce((sum: number, item: ItemInfo) => sum + item.size, 0)
);

const selectAll = ref(false);
const isIndeterminate = computed(
  () => selectedPaths.value.size > 0 && selectedPaths.value.size < filteredItems.value.length
);

// 处理路径拖放
const handlePathDrop = (paths: string[]) => {
  if (paths.length > 0) {
    scanPath.value = paths[0];
    ElMessage.success(`已设置扫描路径: ${paths[0]}`);
  }
};

// 选择目录
const selectDirectory = async () => {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "选择要扫描的目录",
    });
    if (typeof selected === "string") {
      scanPath.value = selected;
    }
  } catch (error) {
    logger.error("选择目录失败", error);
    ElMessage.error("选择目录失败");
  }
};

// 分析路径
const analyzePath = async () => {
  if (!scanPath.value) {
    ElMessage.warning("请先选择扫描路径");
    return;
  }

  isAnalyzing.value = true;
  showProgress.value = true;
  scanProgress.value = null;

  try {
    const result: AnalysisResult = await invoke("analyze_directory_for_cleanup", {
      path: scanPath.value,
      namePattern: namePattern.value || undefined,
      minAgeDays: minAgeDays.value,
      minSizeMb: minSizeMB.value,
      maxDepth: maxDepth.value === 10 ? undefined : maxDepth.value,
      window: getCurrentWindow(),
    });

    allItems.value = result.items;
    items.value = result.items; // 保持兼容性
    selectedPaths.value.clear();
    hasAnalyzed.value = true;

    // 清除之前的二次筛选条件
    clearFilters();

    logger.info("目录分析完成", {
      path: scanPath.value,
      totalItems: result.statistics.totalItems,
      totalSize: result.statistics.totalSize,
    });

    ElMessage.success(
      `找到 ${result.statistics.totalItems} 项，共 ${formatBytes(result.statistics.totalSize)}`
    );
  } catch (error: any) {
    logger.error("分析失败", error);
    ElMessage.error(`分析失败: ${error}`);
  } finally {
    isAnalyzing.value = false;
    showProgress.value = false;
    scanProgress.value = null;
  }
};

// 切换项目选择
const toggleItem = (item: ItemInfo) => {
  if (selectedPaths.value.has(item.path)) {
    selectedPaths.value.delete(item.path);
  } else {
    selectedPaths.value.add(item.path);
  }
};

// 全选/取消全选（只选择当前筛选结果）
const handleSelectAll = (checked: boolean) => {
  if (checked) {
    filteredItems.value.forEach((item) => selectedPaths.value.add(item.path));
  } else {
    selectedPaths.value.clear();
  }
};

// 确认清理
const confirmCleanup = async () => {
  const count = selectedItems.value.length;
  const size = formatBytes(selectedSize.value);

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${count} 项（共 ${size}）吗？\n\n这些项目将被移入回收站，可以恢复。`,
      "确认清理",
      {
        confirmButtonText: "确定删除",
        cancelButtonText: "取消",
        type: "warning",
        distinguishCancelAndClose: true,
      }
    );

    await executeCleanup();
  } catch {
    // 用户取消
  }
};

// 执行清理
const executeCleanup = async () => {
  const pathsToClean = Array.from(selectedPaths.value);

  try {
    const result: CleanupResult = await invoke("cleanup_items", {
      paths: pathsToClean,
    });

    logger.info("清理完成", {
      successCount: result.successCount,
      errorCount: result.errorCount,
      freedSpace: result.freedSpace,
    });

    if (result.errorCount > 0) {
      ElMessageBox.alert(
        `成功: ${result.successCount} 项\n失败: ${result.errorCount} 项\n释放空间: ${formatBytes(result.freedSpace)}\n\n错误详情:\n${result.errors.join("\n")}`,
        "清理结果",
        { type: "warning" }
      );
    } else {
      ElMessage.success(
        `成功清理 ${result.successCount} 项，释放 ${formatBytes(result.freedSpace)}`
      );
    }

    // 从列表中移除成功清理的项目
    allItems.value = allItems.value.filter(
      (item) =>
        !pathsToClean.includes(item.path) || result.errors.some((e) => e.includes(item.path))
    );
    items.value = allItems.value; // 保持同步
    selectedPaths.value.clear();
  } catch (error: any) {
    logger.error("清理失败", error);
    ElMessage.error(`清理失败: ${error}`);
  }
};

// 格式化字节数
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

// 格式化时间（显示多久之前）
const formatAge = (timestamp: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - timestamp;
  const ageDays = Math.floor(ageSeconds / 86400);

  if (ageDays === 0) {
    const ageHours = Math.floor(ageSeconds / 3600);
    return ageHours === 0 ? "刚刚" : `${ageHours} 小时前`;
  } else if (ageDays < 30) {
    return `${ageDays} 天前`;
  } else if (ageDays < 365) {
    return `${Math.floor(ageDays / 30)} 个月前`;
  } else {
    return `${Math.floor(ageDays / 365)} 年前`;
  }
};

// 监听选择变化
watch(
  selectedPaths,
  () => {
    selectAll.value =
      selectedPaths.value.size === filteredItems.value.length && filteredItems.value.length > 0;
  },
  { deep: true }
);

// 监听扫描进度事件
const handleScanProgress = (event: any) => {
  scanProgress.value = event.payload as DirectoryScanProgress;
  logger.debug("扫描进度更新", scanProgress.value);
};

// 组件挂载时注册事件监听
onMounted(async () => {
  const window = getCurrentWindow();
  await window.listen("directory-scan-progress", handleScanProgress);
});

// 组件卸载时移除事件监听
onUnmounted(async () => {
  try {
    // Tauri 2.x 中事件监听会自动清理，这里暂时留空
    logger.debug("组件卸载，事件监听将自动清理");
  } catch (error) {
    logger.warn("清理事件监听时出错", error);
  }
});

// 格式化当前路径显示
const formatCurrentPath = (path: string | undefined): string => {
  if (!path || path.length <= 50) return path || "";
  return "..." + path.substring(path.length - 47);
};
</script>

<style scoped>
.directory-janitor-container {
  display: flex;
  gap: 20px;
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.config-panel {
  flex: 0 0 380px;
  min-width: 380px;
}

.config-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.config-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.config-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.button-footer {
  flex-shrink: 0;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.result-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.result-card {
  flex: 1;
  min-height: 0;
}

:deep(.el-card__body) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.config-section {
  margin-bottom: 20px;
}

.config-section label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.preset-section {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.preset-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preset-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.preset-desc {
  font-size: 12px;
  color: var(--text-color-light);
}

.path-input-group {
  display: flex;
  gap: 8px;
}

.filter-item {
  margin-bottom: 16px;
}

.filter-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--text-color-light);
}

.full-width {
  width: 100%;
}

.slider-wrapper {
  padding: 0 16px;
}

.depth-info {
  text-align: center;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-light);
}

.analyze-btn {
  width: 100%;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.stats-info {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-color-light);
}

.result-filters {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background-color: var(--container-bg);
}

.filter-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.items-scrollbar {
  flex: 1;
  min-height: 0;
}

.items-list {
  padding: 8px;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 6px;
  transition: all 0.2s;
  cursor: pointer;
}

.item-row:hover {
  background-color: var(--container-bg);
}

.item-row.selected {
  background-color: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.item-icon {
  font-size: 18px;
  color: var(--text-color-light);
}

.item-icon.is-dir {
  color: var(--el-color-warning);
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-color-light);
}

.item-path {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-size,
.item-age {
  flex-shrink: 0;
}

/* 进度条样式 */
.progress-section {
  margin-bottom: 16px;
  padding: 16px;
  background-color: var(--container-bg);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.progress-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.progress-stats {
  font-size: 12px;
  color: var(--text-color-light);
}

.progress-details {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-color-light);
}

.current-path {
  margin-bottom: 4px;
  font-family: monospace;
  word-break: break-all;
}

.depth-info {
  color: var(--text-color-lighter);
}
</style>
