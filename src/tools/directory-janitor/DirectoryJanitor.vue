<template>
  <div class="directory-janitor-container">
    <!-- 左侧：配置面板 -->
    <div class="config-panel">
      <ConfigPanel
        v-model:scan-path="scanPath"
        v-model:name-pattern="namePattern"
        v-model:min-age-days="minAgeDays"
        v-model:min-size-m-b="minSizeMB"
        v-model:max-depth="maxDepth"
        :is-analyzing="isAnalyzing"
        @analyze="analyzePath"
      />
    </div>

    <!-- 右侧：结果面板 -->
    <div class="result-panel">
      <ResultPanel
        :items="items"
        :all-items="allItems"
        v-model:selected-paths="selectedPaths"
        v-model:filter-name-pattern="filterNamePattern"
        v-model:filter-min-age-days="filterMinAgeDays"
        v-model:filter-min-size-m-b="filterMinSizeMB"
        :has-analyzed="hasAnalyzed"
        :show-progress="showProgress"
        :scan-progress="scanProgress"
        @cleanup="executeCleanup"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ConfigPanel from "./components/ConfigPanel.vue";
import ResultPanel from "./components/ResultPanel.vue";
import { createModuleLogger } from "@utils/logger";
import { formatBytes } from "./utils";
import type { ItemInfo, AnalysisResult, CleanupResult, DirectoryScanProgress } from "./types";

const logger = createModuleLogger("tools/directory-janitor");

// 配置状态
const scanPath = ref("");
const namePattern = ref("");
const minAgeDays = ref<number | undefined>(undefined);
const minSizeMB = ref<number | undefined>(undefined);
const maxDepth = ref(5);

// 结果状态
const allItems = ref<ItemInfo[]>([]);
const items = ref<ItemInfo[]>([]);
const filterNamePattern = ref("");
const filterMinAgeDays = ref<number | undefined>(undefined);
const filterMinSizeMB = ref<number | undefined>(undefined);

const selectedPaths = ref(new Set<string>());
const isAnalyzing = ref(false);
const hasAnalyzed = ref(false);

// 进度相关状态
const scanProgress = ref<DirectoryScanProgress | null>(null);
const showProgress = ref(false);

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
    items.value = result.items;
    selectedPaths.value.clear();
    hasAnalyzed.value = true;

    // 清除之前的二次筛选条件
    filterNamePattern.value = "";
    filterMinAgeDays.value = undefined;
    filterMinSizeMB.value = undefined;

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

// 执行清理
const executeCleanup = async (pathsToClean: string[]) => {
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
    items.value = allItems.value;
    selectedPaths.value.clear();
  } catch (error: any) {
    logger.error("清理失败", error);
    ElMessage.error(`清理失败: ${error}`);
  }
};

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
    // Tauri 2.x 中事件监听会自动清理
    logger.debug("组件卸载，事件监听将自动清理");
  } catch (error) {
    logger.warn("清理事件监听时出错", error);
  }
});
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

.result-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
</style>
