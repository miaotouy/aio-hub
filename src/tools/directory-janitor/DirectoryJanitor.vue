<template>
  <div class="directory-janitor-container">
    <!-- 左侧：配置面板 -->
    <div class="config-panel">
      <ConfigPanel
        v-model:scan-path="state.scanPath.value"
        v-model:name-pattern="state.namePattern.value"
        v-model:min-age-days="state.minAgeDays.value"
        v-model:min-size-m-b="state.minSizeMB.value"
        v-model:max-depth="state.maxDepth.value"
        :is-analyzing="state.isAnalyzing.value"
        :apply-preset="runner.applyPreset"
        @analyze="analyzePath"
      />
    </div>

    <!-- 右侧：结果面板 -->
    <div class="result-panel">
      <ResultPanel
        :filtered-items="state.filteredItems.value"
        :all-items-count="state.allItems.value.length"
        :filtered-statistics="state.filteredStatistics.value"
        :has-active-filters="state.hasActiveFilters.value"
        v-model:selected-paths="state.selectedPaths.value"
        v-model:filter-name-pattern="state.filterNamePattern.value"
        v-model:filter-min-age-days="state.filterMinAgeDays.value"
        v-model:filter-min-size-m-b="state.filterMinSizeMB.value"
        :has-analyzed="state.hasAnalyzed.value"
        :show-progress="state.showProgress.value"
        :scan-progress="state.scanProgress.value"
        @cleanup="executeCleanup"
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
import { customMessage } from "@/utils/customMessage";
import { formatBytes } from "./utils";
import { useDirectoryJanitorState } from "./composables/useDirectoryJanitorState";
import { useDirectoryJanitorRunner } from "./composables/useDirectoryJanitorRunner";

const logger = createModuleLogger("tools/directory-janitor");

// 使用状态管理 composable
const state = useDirectoryJanitorState();

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
