<template>
  <div class="directory-tree-container">
    <!-- 左侧：配置面板 -->
    <div class="config-panel">
      <InfoCard title="配置选项" class="config-card">
        <div class="config-content">
          <div class="config-section">
            <label>目标路径</label>
            <DropZone variant="input" :directory-only="true" :multiple="false" hide-content @drop="handlePathDrop">
              <div class="path-input-group">
                <el-input
                  v-model="targetPath"
                  placeholder="输入或选择目录路径（支持拖拽）"
                  @keyup.enter="generateTree"
                />
                <el-button @click="selectDirectory" :icon="FolderOpened">选择</el-button>
              </div>
            </DropZone>
          </div>

          <div class="config-section">
            <label>显示选项</label>
            <div class="checkbox-group">
              <el-checkbox v-model="showFiles">显示文件</el-checkbox>
              <el-checkbox v-model="showHidden">显示隐藏文件</el-checkbox>
              <el-checkbox v-model="autoGenerateOnDrop">拖拽后自动生成</el-checkbox>
            </div>
          </div>

          <div class="config-section">
            <label>过滤规则</label>
            <el-select v-model="filterMode" placeholder="选择过滤模式">
              <el-option label="无过滤" value="none" />
              <el-option label="应用 .gitignore" value="gitignore" />
              <el-option label="自定义规则" value="custom" />
              <el-option label="同时使用两者" value="both" />
            </el-select>

            <el-input
              v-if="filterMode === 'custom' || filterMode === 'both'"
              v-model="customPattern"
              type="textarea"
              :rows="5"
              placeholder="每行一个规则，支持通配符&#10;例如: *.log&#10;node_modules/"
              class="custom-pattern-input"
            />
          </div>

          <div class="config-section">
            <label>深度限制</label>
            <div class="slider-container">
              <el-slider v-model="maxDepth" :min="1" :max="10" :marks="{ 1: '1', 5: '5', 10: '10' }" show-stops />
            </div>
            <div class="depth-info">当前深度: {{ maxDepth === 10 ? "无限制" : maxDepth }}</div>
          </div>
        </div>

        <div class="button-footer">
          <el-button
            type="primary"
            @click="generateTree"
            :loading="isGenerating"
            :disabled="!targetPath"
            class="generate-btn"
          >
            <el-icon><Histogram /></el-icon>
            生成目录树
          </el-button>
        </div>
      </InfoCard>
    </div>

    <!-- 右侧：结果显示 -->
    <div class="result-panel">
      <InfoCard title="目录结构" class="result-card">
        <template #headerExtra>
          <el-button-group v-if="treeData">
            <el-tooltip v-if="statsInfo" placement="top">
              <template #content>
                <div class="stats-tooltip">
                  <div class="stats-row">
                    <span class="stats-label">总目录:</span>
                    <span class="stats-value">{{ statsInfo.total_dirs }}</span>
                  </div>
                  <div class="stats-row">
                    <span class="stats-label">总文件:</span>
                    <span class="stats-value">{{ statsInfo.total_files }}</span>
                  </div>
                  <div v-if="statsInfo.filter_count > 0" class="stats-row">
                    <span class="stats-label">过滤规则:</span>
                    <span class="stats-value">{{ statsInfo.filter_count }} 条</span>
                  </div>
                </div>
              </template>
              <el-button :icon="DataAnalysis" text circle />
            </el-tooltip>
            <el-tooltip content="复制到剪贴板" placement="top">
              <el-button :icon="CopyDocument" text circle @click="copyToClipboard" />
            </el-tooltip>
            <el-tooltip content="导出为文件" placement="top">
              <el-button :icon="Download" text circle @click="exportToFile" />
            </el-tooltip>
            <el-tooltip content="发送到聊天" placement="top">
              <el-button :icon="ChatDotRound" text circle @click="sendTreeToChat" />
            </el-tooltip>
            <el-tooltip content="清空结果" placement="top">
              <el-button :icon="Delete" text circle @click="resetTree" />
            </el-tooltip>
          </el-button-group>
        </template>

        <div v-if="treeData" class="filter-section">
          <div class="filter-header" @click="showResultFilter = !showResultFilter">
            <div class="filter-title">
              <el-icon><Filter /></el-icon>
              <span>视图控制与筛选</span>
            </div>
            <el-icon class="expand-icon" :class="{ 'is-expanded': showResultFilter }">
              <ArrowRight />
            </el-icon>
          </div>

          <el-collapse-transition>
            <div v-show="showResultFilter" class="result-controls">
              <div class="control-row">
                <span class="control-label">显示深度:</span>
                <el-slider
                  v-model="secondaryMaxDepth"
                  :min="1"
                  :max="actualMaxDepth"
                  :step="1"
                  show-stops
                  size="small"
                  class="depth-slider"
                />
                <span class="depth-value">{{ secondaryMaxDepth }} / {{ actualMaxDepth }}</span>
              </div>
              <div class="control-row">
                <span class="control-label">排除内容:</span>
                <el-input
                  v-model="secondaryExcludePattern"
                  placeholder="输入关键词隐藏行（及子项）"
                  size="small"
                  clearable
                  class="filter-input"
                />
              </div>
              <div class="control-row">
                <span class="control-label">显示选项:</span>
                <div class="checkbox-group-inline">
                  <el-checkbox v-model="viewShowFiles" size="small">显示文件</el-checkbox>
                  <el-checkbox v-model="includeMetadata" size="small">统计信息</el-checkbox>
                  <el-checkbox v-model="showSize" size="small">文件大小</el-checkbox>
                  <el-checkbox v-model="showDirSize" size="small">目录大小</el-checkbox>
                  <el-checkbox v-model="showDirItemCount" size="small">目录项数</el-checkbox>
                </div>
              </div>
            </div>
          </el-collapse-transition>
        </div>

        <div v-if="!treeData" class="empty-state">
          <el-empty description="选择目录并生成目录树" />
        </div>

        <div v-else class="tree-editor-container">
          <RichCodeEditor
            v-model="editorContent"
            language="markdown"
            :line-numbers="true"
            :read-only="false"
            editor-type="codemirror"
          />
        </div>
      </InfoCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import {
  FolderOpened,
  Histogram,
  CopyDocument,
  Download,
  DataAnalysis,
  ChatDotRound,
  Filter,
  Delete,
  ArrowRight,
} from "@element-plus/icons-vue";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { debounce } from "lodash-es";
import InfoCard from "@components/common/InfoCard.vue";
import DropZone from "@components/common/DropZone.vue";
import RichCodeEditor from "@components/common/RichCodeEditor.vue";
import type { DirectoryTreeConfig, TreeNode, TreeStats } from "./config";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useSendToChat } from "@/composables/useSendToChat";
import {
  generateTree as generateTreeAction,
  selectDirectory as selectDirectoryAction,
  exportToFile as exportToFileAction,
  buildMetadataHeader,
  loadConfig,
  saveConfig,
  calculateMaxDepth,
  renderTreeRecursive,
  type GenerateTreeOptions,
  type RenderTreeOptions,
} from "./actions";

// 创建模块日志器
const logger = createModuleLogger("tools/directory-tree");
const errorHandler = createModuleErrorHandler("tools/directory-tree");

// 获取发送到聊天功能
const { sendToChat } = useSendToChat();

// 配置状态
const targetPath = ref("");
const showFiles = ref(true);
const showHidden = ref(false);
const filterMode = ref<"none" | "gitignore" | "custom" | "both">("none");
const customPattern = ref("");
const maxDepth = ref(5);
const autoGenerateOnDrop = ref(true); // 拖拽后自动生成
const includeMetadata = ref(false); // 输出时是否包含配置和统计信息

// 结果状态
const treeData = ref<TreeNode | null>(null);
const lastGenerationOptions = ref<GenerateTreeOptions | null>(null);
const statsInfo = ref<TreeStats | null>(null);
const isGenerating = ref(false);
const isLoadingConfig = ref(true);

// 二次筛选/视图控制状态
const showResultFilter = ref(false);
const secondaryMaxDepth = ref(10);
const secondaryExcludePattern = ref("");
const viewShowFiles = ref(true); // 视图控制中的文件显示开关
const showSize = ref(true);
const showDirSize = ref(true);
const showDirItemCount = ref(false);

// 编辑器内容（与 processedTreeResult 解耦，允许临时编辑）
const editorContent = ref("");

// 计算实际最大深度（用于滑块范围）
const actualMaxDepth = computed(() => {
  if (!treeData.value) return 10;
  return Math.max(calculateMaxDepth(treeData.value), 1);
});

// 监听生成结果，自动重置二次筛选
watch(treeData, () => {
  secondaryMaxDepth.value = actualMaxDepth.value;
});

// 处理后的目录树结果
const processedTreeResult = computed(() => {
  // 如果有结构化数据，始终使用前端渲染，以支持实时响应所有视图选项
  if (treeData.value) {
    const result: string[] = [];

    // 1. 动态生成元数据部分
    if (includeMetadata.value && lastGenerationOptions.value && statsInfo.value) {
      const metadata = buildMetadataHeader(lastGenerationOptions.value, statsInfo.value);
      result.push(metadata);
    }

    // 2. 基于 treeData 渲染树
    // 解耦面板展开状态与筛选生效逻辑，避免展开/收起时触发重计算
    const maxDepth = secondaryMaxDepth.value;
    const excludePattern = secondaryExcludePattern.value.trim();

    const options: Required<RenderTreeOptions> & { excludePattern: string } = {
      maxDepth,
      excludePattern,
      showFiles: viewShowFiles.value,
      showSize: showSize.value,
      showDirSize: showDirSize.value,
      showDirItemCount: showDirItemCount.value,
    };

    renderTreeRecursive(treeData.value, "", true, true, options, 0, result);
    return result.join("\n");
  }

  // 降级：如果没有结构化数据，返回空
  return "";
});

// 监听 processedTreeResult 变化，同步到编辑器内容
watch(
  processedTreeResult,
  (newValue) => {
    editorContent.value = newValue;
  },
  { immediate: true }
);

// 处理路径拖放
const handlePathDrop = (paths: string[]) => {
  if (paths.length > 0) {
    targetPath.value = paths[0];
    customMessage.success(`已设置目标路径: ${paths[0]}`);
    logger.info("通过拖拽设置目标路径", { path: paths[0] });

    // 根据配置决定是否自动生成目录树
    if (autoGenerateOnDrop.value) {
      setTimeout(() => {
        generateTree();
      }, 500);
    }
  }
};

// 加载配置
onMounted(async () => {
  try {
    const config = await loadConfig();
    customPattern.value = config.customPatterns;
    filterMode.value = config.lastFilterMode;
    targetPath.value = config.lastTargetPath;
    showFiles.value = config.showFiles;
    showHidden.value = config.showHidden;
    showSize.value = config.showSize ?? true;
    showDirSize.value = config.showDirSize ?? true;
    showDirItemCount.value = config.showDirItemCount ?? false;
    maxDepth.value = config.maxDepth;
    autoGenerateOnDrop.value = config.autoGenerateOnDrop ?? true; // 兼容旧配置
    includeMetadata.value = config.includeMetadata ?? false; // 兼容旧配置

    // 恢复上次生成的结果
    if (config.lastTreeStructure) {
      treeData.value = config.lastTreeStructure;
    }
    if (config.lastStatsInfo) {
      statsInfo.value = config.lastStatsInfo;
    }
    if (config.lastGenerationOptions) {
      lastGenerationOptions.value = config.lastGenerationOptions;
    }
  } catch (error) {
    errorHandler.handle(error, { userMessage: "加载配置失败", showToUser: false });
  } finally {
    isLoadingConfig.value = false;
  }
});

// 防抖保存配置
const debouncedSaveConfig = debounce(async () => {
  if (isLoadingConfig.value) return; // 初始加载时不保存

  try {
    const config: DirectoryTreeConfig = {
      customPatterns: customPattern.value,
      lastFilterMode: filterMode.value,
      lastTargetPath: targetPath.value,
      showFiles: showFiles.value,
      showHidden: showHidden.value,
      showSize: showSize.value,
      showDirSize: showDirSize.value,
      showDirItemCount: showDirItemCount.value,
      maxDepth: maxDepth.value,
      autoGenerateOnDrop: autoGenerateOnDrop.value,
      includeMetadata: includeMetadata.value,
      lastTreeStructure: treeData.value,
      lastStatsInfo: statsInfo.value,
      lastGenerationOptions: lastGenerationOptions.value,
      version: "1.0.0",
    };
    await saveConfig(config);
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "保存配置失败",
      context: {
        customPatterns: customPattern.value,
        lastFilterMode: filterMode.value,
        lastTargetPath: targetPath.value,
        showFiles: showFiles.value,
        showHidden: showHidden.value,
        maxDepth: maxDepth.value,
      },
    });
  }
}, 500);

// 监听配置变化并自动保存
watch(
  [
    customPattern,
    filterMode,
    targetPath,
    showFiles,
    showHidden,
    showSize,
    showDirSize,
    showDirItemCount,
    maxDepth,
    autoGenerateOnDrop,
    includeMetadata,
  ],
  () => {
    debouncedSaveConfig();
  }
);

// 选择目录
const selectDirectory = async () => {
  try {
    const selected = await selectDirectoryAction("选择要分析的目录");
    if (selected) {
      targetPath.value = selected;
    }
  } catch (error) {
    errorHandler.error(error, "选择目录失败");
  }
};

// 生成目录树
const generateTree = async () => {
  if (!targetPath.value) {
    customMessage.warning("请先选择目录");
    return;
  }

  isGenerating.value = true;
  try {
    const options: GenerateTreeOptions = {
      path: targetPath.value,
      showFiles: showFiles.value,
      showHidden: showHidden.value,
      maxDepth: maxDepth.value,
      filterMode: filterMode.value,
      customPattern: customPattern.value,
      includeMetadata: false, // 后端不再需要拼接元数据
    };

    const result = await generateTreeAction(options);

    treeData.value = result.structure;
    statsInfo.value = result.stats;
    lastGenerationOptions.value = options;

    // 立即触发保存，包含最新的结果
    debouncedSaveConfig();

    customMessage.success("目录树生成成功");
  } catch (error: any) {
    errorHandler.error(error, "生成失败");
    treeData.value = null;
  } finally {
    isGenerating.value = false;
  }
};

// 复制到剪贴板（使用编辑器当前内容，包含用户的临时修改）
const copyToClipboard = async () => {
  try {
    await writeText(editorContent.value);
    customMessage.success("已复制到剪贴板");
  } catch (error) {
    errorHandler.error(error, "复制到剪贴板失败");
  }
};

// 导出为文件（使用编辑器当前内容，包含用户的临时修改）
const exportToFile = async () => {
  try {
    await exportToFileAction(editorContent.value, targetPath.value);
    customMessage.success("文件保存成功");
  } catch (error) {
    errorHandler.error(error, "保存文件失败");
  }
};

// 发送到聊天（使用编辑器当前内容，包含用户的临时修改）
const sendTreeToChat = () => {
  sendToChat(editorContent.value, {
    format: "code",
    language: "text",
    successMessage: "已将目录树发送到聊天",
  });
};

// 重置目录树
const resetTree = () => {
  treeData.value = null;
  statsInfo.value = null;
  secondaryExcludePattern.value = "";
  editorContent.value = "";

  // 保存清空后的状态
  debouncedSaveConfig();

  customMessage.success("结果已清空");
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
  --primary-color-rgb: 64, 158, 255; /* 默认蓝色的 RGB 值 */
}

.config-panel {
  flex: 0 0 350px;
  min-width: 350px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-card {
  flex-shrink: 0;
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

:deep(.result-card .el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.config-section {
  margin-bottom: 20px;
  padding: 4px;
}

.config-section label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.path-input-group {
  display: flex;
  gap: 6px;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-icon {
  font-size: 14px;
  color: var(--text-color-light);
  cursor: help;
  display: inline-flex;
  vertical-align: middle;
  margin-left: 4px;
  margin-top: -2px;
}

.info-icon:hover {
  color: var(--primary-color);
}

.custom-pattern-input {
  margin-top: 10px;
}

.slider-container {
  margin: 0 12px;
}

.depth-info {
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: var(--text-color-light);
}

.generate-btn {
  width: 100%;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tree-editor-container {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  margin: 8px;
  border-radius: 8px;
  overflow: hidden;
}

.tree-editor-container :deep(.rich-code-editor-wrapper) {
  height: 100%;
  border-radius: 8px;
}

.tree-editor-container :deep(.cm-editor) {
  font-size: 13px;
  line-height: 1.6;
}

.tree-editor-container :deep(.cm-content) {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
}

.stats-tooltip {
  padding: 4px 0;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 4px 0;
  font-size: 13px;
}

.stats-label {
  font-weight: 500;
}

.stats-value {
  font-weight: 600;
  font-family: "Consolas", "Monaco", monospace;
}

.divider-vertical {
  width: 1px;
  height: 16px;
  background-color: var(--el-border-color);
  margin: 0 8px;
  display: inline-block;
  vertical-align: middle;
}

.filter-section {
  border-bottom: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  margin: 8px;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  background-color: var(--el-fill-color-light);
  transition: background-color 0.2s;
  user-select: none;
  /* 内部不设置圆角，由容器统一控制 */
}

.filter-header:hover {
  background-color: var(--el-fill-color);
}

.filter-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.expand-icon {
  transition: transform 0.3s;
  color: var(--text-color-secondary);
}

.expand-icon.is-expanded {
  transform: rotate(90deg);
}

.result-controls {
  padding: 12px 16px;
  background-color: var(--el-fill-color-lighter);
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.checkbox-group-inline {
  display: flex;
  align-items: center;
  gap: 16px;
}

.control-label {
  color: var(--text-color-secondary);
  white-space: nowrap;
  min-width: 60px;
}

.depth-slider {
  flex: 1;
  margin-right: 12px;
}

.depth-value {
  font-family: monospace;
  min-width: 40px;
  text-align: right;
  color: var(--text-color);
}

.filter-input {
  flex: 1;
}
</style>
