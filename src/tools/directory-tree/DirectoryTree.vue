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
              <el-checkbox v-model="showDirSize">
                显示目录大小
                <el-tooltip content="仅计算当前可见（未被过滤）文件的总大小" placement="top">
                  <el-icon class="info-icon" @click.prevent.stop><QuestionFilled /></el-icon>
                </el-tooltip>
              </el-checkbox>
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
            <div class="divider-vertical"></div>
            <el-tooltip
              :content="showResultFilter ? '收起视图控制' : '展开视图控制'"
              placement="top"
            >
              <el-button
                :icon="Filter"
                :type="showResultFilter ? 'primary' : 'default'"
                text
                circle
                @click="showResultFilter = !showResultFilter"
              />
            </el-tooltip>
          </el-button-group>
        </template>

        <div v-if="showResultFilter && treeResult" class="result-controls">
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
        </div>

        <div v-if="!treeResult" class="empty-state">
          <el-empty description="选择目录并生成目录树" />
        </div>

        <el-scrollbar v-else class="tree-scrollbar">
          <pre class="tree-content">{{ processedTreeResult }}</pre>
        </el-scrollbar>
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
  QuestionFilled,
  Filter,
} from "@element-plus/icons-vue";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { debounce } from "lodash-es";
import InfoCard from "@components/common/InfoCard.vue";
import DropZone from "@components/common/DropZone.vue";
import { type DirectoryTreeConfig } from "./config";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useSendToChat } from "@/composables/useSendToChat";
import {
  generateTree as generateTreeAction,
  selectDirectory as selectDirectoryAction,
  exportToFile as exportToFileAction,
  loadConfig,
  saveConfig,
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
const showSize = ref(false);
const showDirSize = ref(false);
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

// 二次筛选状态
const showResultFilter = ref(false);
const secondaryMaxDepth = ref(10);
const secondaryExcludePattern = ref("");

// 计算实际最大深度（用于滑块范围）
const actualMaxDepth = computed(() => {
  if (!treeResult.value) return 10;
  // 简单估算：通过缩进最长的行来判断
  const lines = treeResult.value.split("\n");
  let maxIndent = 0;
  for (const line of lines) {
    // 匹配行首的 │ 和空格
    const match = line.match(/^([│\s]*)(?:├──|└──)/);
    if (match) {
      const indent = match[1].length / 4 + 1;
      if (indent > maxIndent) maxIndent = indent;
    }
  }
  return Math.max(maxIndent, 1); // 至少为1
});

// 监听生成结果，自动重置二次筛选
watch(treeResult, () => {
  secondaryMaxDepth.value = actualMaxDepth.value;
});

// 处理后的目录树结果
const processedTreeResult = computed(() => {
  if (!treeResult.value) return "";

  // 如果没有启用筛选且没有设置过滤词，直接返回原文本（性能优化）
  if (!showResultFilter.value) return treeResult.value;

  const lines = treeResult.value.split("\n");
  const result: string[] = [];

  // 状态标记
  let isMetadataSection = false;
  let skipUntilDepth = -1; // 用于过滤子树：当 > -1 时，跳过所有深度大于此值的行

  // 预处理过滤词
  const excludeKeyword = secondaryExcludePattern.value.trim();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. 处理元数据部分
    // 如果遇到元数据标记，进入元数据模式
    if (line.startsWith("# 目录树生成信息")) {
      isMetadataSection = true;
      result.push(line);
      continue;
    }

    // 如果在元数据区域，直到遇到 "## 目录结构" 退出
    if (isMetadataSection) {
      result.push(line);
      if (line.includes("## 目录结构")) {
        isMetadataSection = false;
        // 目录结构后通常跟一个空行，保留它
        if (i + 1 < lines.length && lines[i + 1].trim() === "") {
          result.push(lines[i + 1]);
          i++;
        }
      }
      continue;
    }

    // 2. 处理树结构部分
    // 尝试计算深度
    let depth = 0;
    // 匹配树状结构前缀：│   ,    , ├──, └──
    // 标准树结构每层缩进4个字符
    const match = line.match(/^([│\s]*)(?:├──|└──)/);

    if (match) {
      // 也就是 (前缀长度 / 4) + 1
      depth = match[1].length / 4 + 1;
    } else if (/^[│\s]+$/.test(line)) {
      // 纯竖线连接行，通常不作为节点，保留即可，或者根据上一行的深度判断
      // 简单策略：如果上一行被过滤了，这种连接线通常也应该被过滤
      // 但为了简单，我们暂时保留它，或者视情况而定
      // 这里我们假设它属于上一级
      depth = line.length / 4;
    } else {
      // 根节点或其他文本（如空行）
      // 根节点深度为0
      depth = 0;
    }

    // 3. 执行过滤逻辑

    // 3.1 子树过滤检查
    if (skipUntilDepth !== -1) {
      if (depth > skipUntilDepth) {
        // 当前行是之前被过滤节点的子节点，跳过
        continue;
      } else {
        // 已经退出了被过滤的子树范围
        skipUntilDepth = -1;
      }
    }

    // 3.2 深度限制 (根节点 depth 0 始终显示)
    if (depth > 0 && depth > secondaryMaxDepth.value) {
      continue;
    }

    // 3.3 关键词过滤 (排除模式)
    // 只有当行包含具体的树节点内容时才过滤
    if (excludeKeyword && !line.startsWith("#") && line.trim() !== "") {
      if (line.includes(excludeKeyword)) {
        // 标记从当前深度开始过滤
        skipUntilDepth = depth;
        continue;
      }
    }

    result.push(line);
  }

  return result.join("\n");
});

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
    showSize.value = config.showSize ?? false; // 兼容旧配置
    showDirSize.value = config.showDirSize ?? false; // 兼容旧配置
    maxDepth.value = config.maxDepth;
    autoGenerateOnDrop.value = config.autoGenerateOnDrop ?? true; // 兼容旧配置
    includeMetadata.value = config.includeMetadata ?? false; // 兼容旧配置
  } catch (error) {
    errorHandler.error(error, "加载配置失败", { showToUser: false });
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
      maxDepth: maxDepth.value,
      autoGenerateOnDrop: autoGenerateOnDrop.value,
      includeMetadata: includeMetadata.value,
      version: "1.0.0",
    };
    await saveConfig(config);
  } catch (error) {
    errorHandler.error(error, "保存配置失败", {
      context: {
        customPatterns: customPattern.value,
        lastFilterMode: filterMode.value,
        lastTargetPath: targetPath.value,
        showFiles: showFiles.value,
        showHidden: showHidden.value,
        showSize: showSize.value,
        showDirSize: showDirSize.value,
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
    const result = await generateTreeAction({
      path: targetPath.value,
      showFiles: showFiles.value,
      showHidden: showHidden.value,
      showSize: showSize.value,
      showDirSize: showDirSize.value,
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
    errorHandler.error(error, "复制到剪贴板失败");
  }
};

// 导出为文件
const exportToFile = async () => {
  try {
    await exportToFileAction(treeResult.value, targetPath.value);
    customMessage.success("文件保存成功");
  } catch (error) {
    errorHandler.error(error, "保存文件失败");
  }
};

// 发送到聊天
const sendTreeToChat = () => {
  sendToChat(treeResult.value, {
    format: "code",
    language: "text",
    successMessage: "已将目录树发送到聊天",
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

.divider-vertical {
  width: 1px;
  height: 16px;
  background-color: var(--el-border-color);
  margin: 0 8px;
  display: inline-block;
  vertical-align: middle;
}

.result-controls {
  padding: 12px 16px;
  background-color: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
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
