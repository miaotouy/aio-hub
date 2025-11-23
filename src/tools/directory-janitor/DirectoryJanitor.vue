<template>
  <div class="directory-janitor-container">
    <!-- 左侧：配置面板 -->
    <div class="config-panel">
      <ConfigPanel
        v-model:scan-path="store.scanPath"
        v-model:name-pattern="store.namePattern"
        v-model:min-age-days="store.minAgeDays"
        v-model:min-size-m-b="store.minSizeMB"
        v-model:max-depth="store.maxDepth"
        :is-analyzing="store.isAnalyzing"
        :apply-preset="runner.applyPreset"
        @analyze="analyzePath"
        @stop="stopScan"
      />
    </div>

    <!-- 右侧：结果面板 -->
    <div class="result-panel">
      <ResultPanel
        :filtered-items="store.filteredItems"
        :all-items-count="store.allItems.length"
        :filtered-statistics="store.filteredStatistics"
        :has-active-filters="store.hasActiveFilters"
        v-model:selected-paths="store.selectedPaths"
        v-model:filter-name-pattern="store.filterNamePattern"
        v-model:filter-min-age-days="store.filterMinAgeDays"
        v-model:filter-min-size-m-b="store.filterMinSizeMB"
        :has-analyzed="store.hasAnalyzed"
        :show-progress="store.showProgress"
        :scan-progress="store.scanProgress"
        :is-cleaning="store.isCleaning"
        :cleanup-progress="store.cleanupProgress"
        @cleanup="executeCleanup"
        @stop-cleanup="stopCleanup"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { ElMessageBox } from "element-plus";
import ConfigPanel from "./components/ConfigPanel.vue";
import ResultPanel from "./components/ResultPanel.vue";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { formatBytes } from "./utils";
import { useDirectoryJanitorStore } from "./store";
import { useDirectoryJanitorRunner } from "./composables/useDirectoryJanitorRunner";

const logger = createModuleLogger("tools/directory-janitor");
const errorHandler = createModuleErrorHandler("tools/directory-janitor");

// 使用 Pinia store
const store = useDirectoryJanitorStore();

// 使用业务逻辑 composable
const runner = useDirectoryJanitorRunner();
// 分析路径
const analyzePath = async () => {
  const result = await runner.analyzePath();
  if (result) {
    customMessage.success(
      `找到 ${result.statistics.totalItems} 项，共 ${formatBytes(result.statistics.totalSize)}`
    );
  }
};
// 停止扫描
const stopScan = async () => {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('stop_directory_scan');
    store.isAnalyzing = false;
    store.showProgress = false;
    store.scanProgress = null;
    customMessage.success('已停止扫描');
    logger.info('用户手动停止扫描');
  } catch (error) {
    errorHandler.error(error, '停止扫描失败');
  }
};

// 停止清理
const stopCleanup = async () => {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('stop_directory_cleanup');
    store.isCleaning = false;
    store.cleanupProgress = null;
    customMessage.success('已停止清理');
    logger.info('用户手动停止清理');
  } catch (error) {
    errorHandler.error(error, '停止清理失败');
  }
};

// 执行清理
const executeCleanup = async (pathsToClean: string[]) => {
  const result = await runner.cleanupItems(pathsToClean);
  
  if (!result) {
    return;
  }

  if (result.errorCount > 0) {
    ElMessageBox.alert(
      `成功: ${result.successCount} 项\n失败: ${result.errorCount} 项\n释放空间: ${formatBytes(result.freedSpace)}\n\n错误详情:\n${result.errors.join("\n")}`,
      "清理结果",
      { type: "warning" }
    );
  } else {
    // customMessage 已在 runner 中处理
  }
};

// 组件挂载时初始化
onMounted(async () => {
  await runner.initialize();
  logger.info("DirectoryJanitor 组件已挂载");
});

// 组件卸载时清理
onUnmounted(async () => {
  await runner.dispose();
  logger.info("DirectoryJanitor 组件已卸载");
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
