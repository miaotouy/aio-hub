<template>
  <div class="directory-tree-container">
    <!-- 左侧：配置面板 -->
    <div class="config-panel">
      <InfoCard title="配置选项" class="config-card">
        <div class="config-content">
          <div class="config-section">
            <label>目标路径</label>
            <DropZone
              drop-id="directory-tree-path"
              variant="input"
              :directory-only="true"
              :multiple="false"
              :auto-execute="autoGenerateOnDrop"
              hide-content
              @drop="handlePathDrop"
            >
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
              <el-checkbox v-model="showFiles" label="显示文件" />
              <el-checkbox v-model="showHidden" label="显示隐藏文件" />
              <el-checkbox v-model="showSize" label="显示文件大小" />
              <el-checkbox v-model="includeMetadata" label="输出包含配置和统计" />
              <el-checkbox v-model="autoGenerateOnDrop" label="拖拽后自动生成" />
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
              <el-slider
                v-model="maxDepth"
                :min="1"
                :max="10"
                :marks="{ 1: '1', 5: '5', 10: '10' }"
                show-stops
              />
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
          <el-button-group v-if="treeResult">
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
                  <div class="stats-row">
                    <span class="stats-label">过滤目录:</span>
                    <span class="stats-value">{{ statsInfo.filtered_dirs }}</span>
                  </div>
                  <div class="stats-row">
                    <span class="stats-label">过滤文件:</span>
                    <span class="stats-value">{{ statsInfo.filtered_files }}</span>
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
          </el-button-group>
        </template>

        <div v-if="!treeResult" class="empty-state">
          <el-empty description="选择目录并生成目录树" />
        </div>

        <el-scrollbar v-else class="tree-scrollbar">
          <pre class="tree-content">{{ treeResult }}</pre>
        </el-scrollbar>
      </InfoCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { customMessage } from "@/utils/customMessage";
import {
  FolderOpened,
  Histogram,
  CopyDocument,
  Download,
  DataAnalysis,
  ChatDotRound,
} from "@element-plus/icons-vue";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { debounce } from "lodash-es";
import InfoCard from "@components/common/InfoCard.vue";
import DropZone from "@components/common/DropZone.vue";
import { type DirectoryTreeConfig } from "./config";
import { serviceRegistry } from "@/services";
import type DirectoryTreeService from "./directoryTree.registry";
import { createModuleLogger } from "@utils/logger";
import { useSendToChat } from "@/composables/useSendToChat";

// 创建模块日志器
const logger = createModuleLogger("tools/directory-tree");

// 获取服务实例
const treeService = serviceRegistry.getService<DirectoryTreeService>('directory-tree');

// 获取发送到聊天功能
const { sendToChat } = useSendToChat();

// 配置状态
const targetPath = ref("");
const showFiles = ref(true);
const showHidden = ref(false);
const showSize = ref(false);
const filterMode = ref<"none" | "gitignore" | "custom" | "both">("none");
const customPattern = ref("");
const maxDepth = ref(5);
const autoGenerateOnDrop = ref(true); // 拖拽后自动生成
const includeMetadata = ref(false); // 输出时是否包含配置和统计信息

// 结果状态
const treeResult = ref("");
const statsInfo = ref<{
  total_dirs: number;
  total_files: number;
  filtered_dirs: number;
  filtered_files: number;
  show_files: boolean;
  show_hidden: boolean;
  max_depth: string;
  filter_count: number;
} | null>(null);
const isGenerating = ref(false);
const isLoadingConfig = ref(true);

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
    const config = await treeService.loadConfig();
    customPattern.value = config.customPatterns;
    filterMode.value = config.lastFilterMode;
    targetPath.value = config.lastTargetPath;
    showFiles.value = config.showFiles;
    showHidden.value = config.showHidden;
    showSize.value = config.showSize ?? false; // 兼容旧配置
    maxDepth.value = config.maxDepth;
    autoGenerateOnDrop.value = config.autoGenerateOnDrop ?? true; // 兼容旧配置
    includeMetadata.value = config.includeMetadata ?? false; // 兼容旧配置
  } catch (error) {
    logger.error("加载配置失败", error);
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
      maxDepth: maxDepth.value,
      autoGenerateOnDrop: autoGenerateOnDrop.value,
      includeMetadata: includeMetadata.value,
      version: "1.0.0",
    };
    await treeService.saveConfig(config);
  } catch (error) {
    logger.error("保存配置失败", error, {
      customPatterns: customPattern.value,
      lastFilterMode: filterMode.value,
      lastTargetPath: targetPath.value,
      showFiles: showFiles.value,
      showHidden: showHidden.value,
      showSize: showSize.value,
      maxDepth: maxDepth.value,
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
    const selected = await treeService.selectDirectory("选择要分析的目录");
    if (selected) {
      targetPath.value = selected;
    }
  } catch (error) {
    logger.error("选择目录失败", error);
    customMessage.error("选择目录失败");
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
    const result = await treeService.generateTree({
      path: targetPath.value,
      showFiles: showFiles.value,
      showHidden: showHidden.value,
      showSize: showSize.value,
      maxDepth: maxDepth.value,
      filterMode: filterMode.value,
      customPattern: customPattern.value,
      includeMetadata: includeMetadata.value,
    });

    treeResult.value = result.tree;
    statsInfo.value = result.stats;

    customMessage.success("目录树生成成功");
  } catch (error: any) {
    customMessage.error(`生成失败: ${error}`);
    treeResult.value = `错误: ${error}`;
  } finally {
    isGenerating.value = false;
  }
};

// 复制到剪贴板
const copyToClipboard = async () => {
  try {
    await writeText(treeResult.value);
    customMessage.success("已复制到剪贴板");
  } catch (error) {
    logger.error("复制到剪贴板失败", error);
    customMessage.error("复制到剪贴板失败");
  }
};

// 导出为文件
const exportToFile = async () => {
  try {
    await treeService.exportToFile(treeResult.value, targetPath.value);
    customMessage.success("文件保存成功");
  } catch (error) {
    logger.error("保存文件失败", error);
    customMessage.error("保存文件失败");
  }
};

// 发送到聊天
const sendTreeToChat = () => {
  sendToChat(treeResult.value, {
    format: 'code',
    language: 'text',
    successMessage: '已将目录树发送到聊天',
  });
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

.tree-scrollbar {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
}

.tree-content {
  margin: 0;
  padding: 8px;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color);
  background-color: var(--container-bg);
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  box-sizing: border-box;
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
</style>
