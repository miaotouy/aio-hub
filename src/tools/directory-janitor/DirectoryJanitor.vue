<template>
  <div class="directory-janitor-container">
    <!-- 左侧：配置面板 -->
    <div class="config-panel">
      <ConfigPanel
        :context="context"
        v-model:scan-path="context.scanPath.value"
        v-model:name-pattern="context.namePattern.value"
        v-model:min-age-days="context.minAgeDays.value"
        v-model:min-size-m-b="context.minSizeMB.value"
        v-model:max-depth="context.maxDepth.value"
        :is-analyzing="context.isAnalyzing.value"
        @analyze="analyzePath"
      />
    </div>

    <!-- 右侧：结果面板 -->
    <div class="result-panel">
      <ResultPanel
        :filtered-items="context.filteredItems.value"
        :all-items-count="context.allItems.value.length"
        :filtered-statistics="context.filteredStatistics.value"
        :has-active-filters="context.hasActiveFilters.value"
        v-model:selected-paths="context.selectedPaths.value"
        v-model:filter-name-pattern="context.filterNamePattern.value"
        v-model:filter-min-age-days="context.filterMinAgeDays.value"
        v-model:filter-min-size-m-b="context.filterMinSizeMB.value"
        :has-analyzed="context.hasAnalyzed.value"
        :show-progress="context.showProgress.value"
        :scan-progress="context.scanProgress.value"
        @cleanup="executeCleanup"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { ElMessageBox } from "element-plus";
import { serviceRegistry } from "@/services/registry";
import ConfigPanel from "./components/ConfigPanel.vue";
import ResultPanel from "./components/ResultPanel.vue";
import { createModuleLogger } from "@utils/logger";
import { customMessage } from "@/utils/customMessage";
import { formatBytes } from "./utils";
import DirectoryJanitorService from "./directoryJanitor.service";

const logger = createModuleLogger("tools/directory-janitor");

// 获取服务实例并创建 Context
const service = serviceRegistry.getService<DirectoryJanitorService>("directory-janitor");
const context = service.createContext();

// 分析路径
const analyzePath = async () => {
  const result = await context.analyzePath();
  if (result) {
    customMessage.success(
      `找到 ${result.statistics.totalItems} 项，共 ${formatBytes(result.statistics.totalSize)}`
    );
  }
};

// 执行清理
const executeCleanup = async (pathsToClean: string[]) => {
  const result = await context.cleanupItems(pathsToClean);
  
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
    // customMessage 已在 context 中处理
  }
};

// 组件挂载时初始化 Context
onMounted(async () => {
  await context.initialize();
  logger.info("DirectoryJanitor 组件已挂载，Context 已初始化");
});

// 组件卸载时清理 Context
onUnmounted(async () => {
  await context.dispose();
  logger.info("DirectoryJanitor 组件已卸载，Context 已清理");
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
