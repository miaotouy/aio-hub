<template>
  <div class="directory-tree-container">
    <!-- 左侧：配置面板 -->
    <div class="config-panel">
      <ConfigPanel
        v-model:target-path="state.targetPath.value"
        v-model:show-files="state.showFiles.value"
        v-model:show-hidden="state.showHidden.value"
        v-model:filter-mode="state.filterMode.value"
        v-model:custom-pattern="state.customPattern.value"
        v-model:max-depth="state.maxDepth.value"
        v-model:auto-generate-on-drop="state.autoGenerateOnDrop.value"
        :is-generating="state.isGenerating.value"
        :sorted-path-history="pathHistory.sortedPathHistory.value"
        :format-history-time="pathHistory.formatHistoryTime"
        @select-directory="handleSelectDirectory"
        @generate="handleGenerate"
        @select-history-path="handleSelectHistoryPath"
        @remove-history-path="pathHistory.removeHistoryPath"
        @clear-history="handleClearHistory"
      />
    </div>

    <!-- 右侧：结果显示 -->
    <div class="result-panel">
      <ResultPanel
        :tree-data="state.treeData.value"
        :stats-info="state.statsInfo.value"
        v-model:show-result-filter="state.showResultFilter.value"
        v-model:secondary-max-depth="state.secondaryMaxDepth.value"
        :actual-max-depth="renderer.actualMaxDepth.value"
        v-model:secondary-exclude-pattern="state.secondaryExcludePattern.value"
        v-model:view-show-files="state.viewShowFiles.value"
        v-model:include-metadata="state.includeMetadata.value"
        v-model:show-size="state.showSize.value"
        v-model:show-dir-size="state.showDirSize.value"
        v-model:show-dir-item-count="state.showDirItemCount.value"
        v-model:editor-content="state.editorContent.value"
        @copy="handleCopyToClipboard"
        @export="handleExportToFile"
        @send-to-chat="handleSendTreeToChat"
        @reset="handleResetTree"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from "vue";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useSendToChat } from "@/composables/useSendToChat";
import ConfigPanel from "./components/ConfigPanel.vue";
import ResultPanel from "./components/ResultPanel.vue";
import { useDirectoryTreeState } from "./composables/useDirectoryTreeState";
import { usePathHistory } from "./composables/usePathHistory";
import { useTreeRenderer } from "./composables/useTreeRenderer";
import { selectDirectory as selectDirectoryAction, exportToFile as exportToFileAction } from "./actions";

const errorHandler = createModuleErrorHandler("tools/directory-tree");
const { sendToChat } = useSendToChat();

// 状态管理
const state = useDirectoryTreeState();
const pathHistory = usePathHistory();

// 树渲染器
const renderer = useTreeRenderer(
  state.treeData,
  state.lastGenerationOptions,
  state.statsInfo,
  state.includeMetadata,
  state.secondaryMaxDepth,
  state.secondaryExcludePattern,
  state.viewShowFiles,
  state.showSize,
  state.showDirSize,
  state.showDirItemCount
);

// 监听 processedTreeResult 变化，同步到编辑器内容
watch(
  renderer.processedTreeResult,
  (newValue) => {
    state.editorContent.value = newValue;
  },
  { immediate: true }
);

// 监听生成结果，自动重置二次筛选深度
watch(state.treeData, () => {
  state.secondaryMaxDepth.value = renderer.actualMaxDepth.value;
});

// 加载配置
onMounted(async () => {
  const config = await state.loadConfig();
  pathHistory.pathHistory.value = config.pathHistory ?? [];
});

// 监听配置变化并自动保存
watch(
  [
    state.customPattern,
    state.filterMode,
    state.targetPath,
    state.showFiles,
    state.showHidden,
    state.showSize,
    state.showDirSize,
    state.showDirItemCount,
    state.maxDepth,
    state.autoGenerateOnDrop,
    state.includeMetadata,
    state.treeData,
    state.statsInfo,
    pathHistory.pathHistory,
  ],
  () => {
    state.debouncedSaveConfig(pathHistory.pathHistory.value);
  }
);

// 选择目录
const handleSelectDirectory = async () => {
  try {
    const selected = await selectDirectoryAction("选择要分析的目录");
    if (selected) {
      state.targetPath.value = selected;
    }
  } catch (error) {
    errorHandler.error(error, "选择目录失败");
  }
};

// 生成目录树
const handleGenerate = async () => {
  await state.generateTree((path: string) => {
    pathHistory.addToHistory(path);
    state.debouncedSaveConfig(pathHistory.pathHistory.value);
  });
};

// 选择历史路径
const handleSelectHistoryPath = (path: string) => {
  state.targetPath.value = path;
  pathHistory.addToHistory(path);
  state.debouncedSaveConfig(pathHistory.pathHistory.value);
  customMessage.success(`已选择路径: ${path}`);

  // 根据配置决定是否自动生成
  if (state.autoGenerateOnDrop.value) {
    setTimeout(() => {
      handleGenerate();
    }, 500);
  }
};

// 清空历史记录
const handleClearHistory = () => {
  pathHistory.clearHistory();
  state.debouncedSaveConfig(pathHistory.pathHistory.value);
  customMessage.success("历史记录已清空");
};

// 复制到剪贴板
const handleCopyToClipboard = async () => {
  try {
    await writeText(state.editorContent.value);
    customMessage.success("已复制到剪贴板");
  } catch (error) {
    errorHandler.error(error, "复制到剪贴板失败");
  }
};

// 导出为文件
const handleExportToFile = async () => {
  try {
    await exportToFileAction(state.editorContent.value, state.targetPath.value);
    customMessage.success("文件保存成功");
  } catch (error) {
    errorHandler.error(error, "保存文件失败");
  }
};

// 发送到聊天
const handleSendTreeToChat = () => {
  sendToChat(state.editorContent.value, {
    format: "code",
    language: "text",
    successMessage: "已将目录树发送到聊天",
  });
};

// 重置目录树
const handleResetTree = () => {
  state.resetTree();
  state.debouncedSaveConfig(pathHistory.pathHistory.value);
};
</script>

<style scoped>
.directory-tree-container {
  display: flex;
  gap: 20px;
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.config-panel {
  flex: 0 0 350px;
  min-width: 350px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.result-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
</style>
