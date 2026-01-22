<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import {
  FolderOpened,
  Document,
  Delete,
  FolderAdd,
  Rank,
  InfoFilled,
  Close,
  View,
} from "@element-plus/icons-vue";
import { open } from "@tauri-apps/plugin-dialog";
import InfoCard from "@components/common/InfoCard.vue";
import DropZone from "@components/common/DropZone.vue";
import BaseDialog from "@components/common/BaseDialog.vue";
import { useSymlinkMoverLogic } from "./composables/useSymlinkMover";
import type { FileItem, OperationLog } from "./types";

// 初始化逻辑
const logic = useSymlinkMoverLogic();

// --- UI 状态（仅保留 UI 相关状态）---
const sourcePathInput = ref(""); // 用于手动输入源文件路径
const sourceFiles = ref<FileItem[]>([]);
const targetDirectory = ref("");
const linkType = ref<"symlink" | "link">("symlink");
const operationMode = ref<"move" | "link-only">("move");
const isProcessing = ref(false);

// 进度相关状态
const showProgress = ref(false);
const currentProgress = ref(0);
const currentFile = ref("");
const copiedBytes = ref(0);
const totalBytes = ref(0);

// 操作日志相关
const latestLog = ref<OperationLog | null>(null);
const showLogDialog = ref(false);
const allLogs = ref<OperationLog[]>([]);
const tickerKey = ref(0); // 用于触发动画

// --- 生命周期钩子 ---
onMounted(async () => {
  // 通过逻辑层启动进度监听
  await logic.startProgressListener((progress) => {
    currentFile.value = progress.currentFile;
    currentProgress.value = progress.progressPercentage;
    copiedBytes.value = progress.copiedBytes;
    totalBytes.value = progress.totalBytes;
    showProgress.value = true;
  });

  // 加载最新日志
  await loadLatestLog();

  // 监听日志变化，触发滚动动画
  watch(latestLog, (newLog, oldLog) => {
    if (newLog && (!oldLog || newLog.timestamp !== oldLog.timestamp)) {
      tickerKey.value++;
    }
  });
});

onUnmounted(async () => {
  // 通过逻辑层停止进度监听
  await logic.stopProgressListener();
});

// --- UI 事件处理方法 ---
const loadLatestLog = async () => {
  // 逻辑层已经处理错误，直接获取结果
  latestLog.value = await logic.getLatestLog();
};

const loadAllLogs = async () => {
  // 逻辑层已经处理错误，直接获取结果（失败时返回空数组）
  allLogs.value = await logic.getAllLogs();
};

const openLogDialog = async () => {
  await loadAllLogs();
  showLogDialog.value = true;
};

// --- 拖放处理 ---
const handleSourceDrop = (paths: string[]) => {
  addSourceFiles(paths);
};

const handleTargetDrop = (paths: string[]) => {
  if (paths.length > 0) {
    targetDirectory.value = paths[0];
    customMessage.success(`已设置目标目录: ${paths[0]}`);
  }
};

// 验证文件列表
const validateFiles = async () => {
  if (!targetDirectory.value || sourceFiles.value.length === 0) {
    return;
  }

  // 逻辑层已经处理错误，直接获取结果
  sourceFiles.value = await logic.validateFiles(
    sourceFiles.value,
    targetDirectory.value,
    linkType.value,
    operationMode.value
  );
};

// 监听目标目录和链接类型变化，触发验证
watch([targetDirectory, linkType, operationMode], () => {
  validateFiles();
});

// --- 文件处理方法 ---
const addSourcePathFromInput = () => {
  if (!sourcePathInput.value) {
    customMessage.warning("请输入文件或文件夹路径");
    return;
  }
  addSourceFiles([sourcePathInput.value]);
  sourcePathInput.value = ""; // 添加后清空输入框
};

const addSourceFiles = (paths: string[]) => {
  const newFiles = logic.parsePathsToFileItems(paths);
  const mergedFiles = logic.mergeFileItems(sourceFiles.value, newFiles);
  const addedCount = mergedFiles.length - sourceFiles.value.length;

  if (addedCount > 0) {
    sourceFiles.value = mergedFiles;
    customMessage.success(`已添加 ${addedCount} 个文件/文件夹`);
    // 添加文件后触发验证
    validateFiles();
  }
};

const removeFile = (index: number) => {
  sourceFiles.value = logic.removeFileByIndex(sourceFiles.value, index);
};

const clearFiles = () => {
  if (sourceFiles.value.length === 0) return;
  ElMessageBox.confirm("确定要清空所有待处理文件吗？", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      sourceFiles.value = [];
      customMessage.success("文件列表已清空");
    })
    .catch(() => {
      /* 用户取消操作 */
    });
};

// --- 文件/目录选择 ---
const selectSourceFiles = async () => {
  const selected = await open({
    multiple: true,
    title: "选择要搬家的文件",
  });
  if (Array.isArray(selected) && selected.length > 0) {
    addSourceFiles(selected);
  } else if (typeof selected === "string") {
    addSourceFiles([selected]);
  }
};

const selectSourceFolders = async () => {
  const selected = await open({
    multiple: true,
    directory: true,
    title: "选择要搬家的文件夹",
  });
  if (Array.isArray(selected) && selected.length > 0) {
    addSourceFiles(selected);
  } else if (typeof selected === "string") {
    addSourceFiles([selected]);
  }
};

const selectTargetDirectory = async () => {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择目标目录",
  });
  if (typeof selected === "string") {
    targetDirectory.value = selected;
  }
};

// --- 取消操作 ---
const cancelOperation = async () => {
  // 逻辑层已经处理错误
  const success = await logic.cancelOperation();
  if (success) {
    customMessage.info("正在取消操作...");
  }
};

// --- 核心操作 ---
const executeMoveAndLink = async () => {
  if (sourceFiles.value.length === 0) {
    customMessage.warning("请先添加要处理的文件");
    return;
  }
  if (!targetDirectory.value && operationMode.value === "move") {
    customMessage.warning("请选择目标目录");
    return;
  }

  // 重置进度状态
  showProgress.value = false;
  currentProgress.value = 0;
  currentFile.value = "";
  copiedBytes.value = 0;
  totalBytes.value = 0;

  isProcessing.value = true;
  sourceFiles.value.forEach((file) => (file.status = "processing"));

  const sourcePaths = sourceFiles.value.map((file) => file.path);
  let result: string | null;

  if (operationMode.value === "move") {
    // 搬家模式：移动文件并创建链接
    result = await logic.moveAndLink({
      sourcePaths,
      targetDir: targetDirectory.value,
      linkType: linkType.value,
    });
  } else {
    // 仅创建链接模式
    result = await logic.createLinksOnly({
      sourcePaths,
      targetDir: targetDirectory.value,
      linkType: linkType.value,
    });
  }

  // 如果服务返回 null，表示操作失败（已由 errorHandler 处理）
  if (result === null) {
    sourceFiles.value.forEach((file) => {
      if (file.status === "processing") {
        file.status = "error";
        file.error = "处理失败";
      }
    });
  } else {
    // 检查结果是否包含错误信息或取消信息
    if (result.includes("已被用户取消")) {
      customMessage.warning(result);
      sourceFiles.value.forEach((file) => {
        if (file.status === "processing") {
          file.status = "pending";
        }
      });
    } else if (result.includes("个错误")) {
      // Rust 后端返回的错误信息，手动显示
      customMessage.error(result);
      sourceFiles.value.forEach((file) => {
        if (file.status === "processing") {
          file.status = "error";
          file.error = "处理失败，请查看错误详情";
        }
      });
    } else {
      customMessage.success(result || "操作完成");
      sourceFiles.value.forEach((file) => (file.status = "success"));
    }
  }

  // 重置进度和重新加载日志
  {
    isProcessing.value = false;
    // 隐藏进度条
    setTimeout(() => {
      showProgress.value = false;
    }, 1000);
    // 重新加载最新日志
    await loadLatestLog();
  }
};
</script>

<template>
  <div class="symlink-mover-container">
    <!-- 左侧列: 待处理文件 -->
    <div class="column">
      <InfoCard title="待处理文件" class="full-height-card">
        <template #headerExtra>
          <el-button
            :icon="Delete"
            text
            circle
            @click="clearFiles"
            :disabled="sourceFiles.length === 0"
          />
        </template>
        <div class="source-controls">
          <el-input
            v-model="sourcePathInput"
            placeholder="输入文件/文件夹路径"
            @keyup.enter="addSourcePathFromInput"
          />
          <el-tooltip content="选择文件" placement="top">
            <el-button @click="selectSourceFiles" :icon="Document" circle />
          </el-tooltip>
          <el-tooltip content="选择文件夹" placement="top">
            <el-button @click="selectSourceFolders" :icon="FolderOpened" circle />
          </el-tooltip>
          <el-button @click="addSourcePathFromInput" type="primary">添加</el-button>
        </div>
        <DropZone
          clickable
          click-zone
          placeholder="点击添加或拖拽文件/文件夹至此"
          :icon="FolderAdd"
          :multiple="true"
          @drop="handleSourceDrop"
        >
          <el-scrollbar class="file-list-scrollbar">
            <div v-if="sourceFiles.length === 0" class="empty-state">
              <el-icon>
                <FolderAdd />
              </el-icon>
              <p>将要搬家的文件或文件夹拖拽至此</p>
            </div>
            <div v-else class="file-list">
              <div
                v-for="(file, index) in sourceFiles"
                :key="file.path"
                class="file-item"
                :class="{ 'has-warning': file.warning }"
              >
                <el-icon class="file-icon" :class="{ 'warning-icon': file.warning }">
                  <Document />
                </el-icon>
                <div class="file-details">
                  <div class="file-name" :title="file.name">{{ file.name }}</div>
                  <div class="file-path" :title="file.path">{{ file.path }}</div>
                  <div v-if="file.warning" class="file-warning">
                    <el-icon>
                      <InfoFilled />
                    </el-icon>
                    {{ file.warning }}
                  </div>
                </div>
                <el-button
                  @click="removeFile(index)"
                  :icon="Delete"
                  text
                  circle
                  size="small"
                  class="remove-btn"
                />
              </div>
            </div>
          </el-scrollbar>
        </DropZone>
      </InfoCard>
    </div>

    <!-- 右侧列: 操作设置 -->
    <div class="column settings-column">
      <InfoCard title="操作设置" class="settings-card full-height-card">
        <div class="setting-group">
          <label>操作模式</label>
          <el-radio-group v-model="operationMode" class="operation-mode-group">
            <el-radio-button value="move">
              <el-icon>
                <Rank />
              </el-icon>
              搬家模式
            </el-radio-button>
            <el-radio-button value="link-only">
              <el-icon>
                <FolderAdd />
              </el-icon>
              仅创建链接
            </el-radio-button>
          </el-radio-group>
          <div class="mode-description">
            {{
              operationMode === "move"
                ? "将文件移动到目标目录，并在原位置创建链接"
                : "在目标目录创建链接，保持原文件不动"
            }}
          </div>
        </div>
        <div class="setting-group">
          <label>目标目录</label>
          <DropZone
            clickable
            variant="input"
            :directory-only="true"
            :multiple="false"
            hide-content
            @drop="handleTargetDrop"
          >
            <div class="target-control">
              <el-input
                v-model="targetDirectory"
                :placeholder="
                  operationMode === 'move'
                    ? '输入、拖拽或点击选择目标目录'
                    : '输入、拖拽或点击选择链接目录'
                "
              />
              <el-button @click="selectTargetDirectory" :icon="FolderOpened">选择</el-button>
            </div>
          </DropZone>
        </div>
        <div class="setting-group">
          <label>
            链接类型
            <el-tooltip placement="top" :show-after="300">
              <template #content>
                <div class="link-type-tooltip">
                  <div class="tooltip-section">
                    <div class="tooltip-title">符号链接（Symlink）</div>
                    <div class="tooltip-text">
                      • 类似快捷方式，存储目标路径<br />
                      • 可以跨分区/跨盘使用<br />
                      • 可以链接目录<br />
                      • 原文件删除后会失效
                    </div>
                  </div>
                  <div class="tooltip-section">
                    <div class="tooltip-title">硬链接（Hard Link）</div>
                    <div class="tooltip-text">
                      • 直接指向文件数据，与原文件平等<br />
                      • <strong>不能跨分区/跨盘</strong><br />
                      • <strong>不能链接目录</strong><br />
                      • 删除任一个不影响另一个<br />
                      • 全部删完就都没了
                    </div>
                  </div>
                </div>
              </template>
              <el-icon class="info-icon">
                <InfoFilled />
              </el-icon>
            </el-tooltip>
          </label>
          <el-radio-group v-model="linkType">
            <el-radio-button value="symlink">符号链接</el-radio-button>
            <el-radio-button value="link" :disabled="operationMode === 'link-only'"
              >硬链接</el-radio-button
            >
          </el-radio-group>
          <div v-if="operationMode === 'link-only' && linkType === 'link'" class="warning-text">
            <el-icon>
              <InfoFilled />
            </el-icon>
            仅创建链接模式下不支持硬链接
          </div>
        </div>
        <!-- 进度显示 -->
        <div v-if="showProgress" class="setting-group progress-group">
          <div class="progress-info">
            <div class="progress-file">{{ currentFile }}</div>
            <div class="progress-stats">
              {{ logic.formatBytes(copiedBytes) }} /
              {{ logic.formatBytes(totalBytes) }}
            </div>
          </div>
          <el-progress
            :percentage="currentProgress"
            :status="isProcessing ? undefined : 'success'"
            :stroke-width="12"
          />
        </div>

        <div class="setting-group execute-group">
          <!-- 垂直滚动日志通知条 -->
          <div v-if="latestLog" class="log-ticker">
            <div class="log-ticker-content">
              <div class="log-ticker-message" :key="tickerKey">
                {{ logic.formatLogTicker(latestLog) }}
              </div>
            </div>
            <el-button :icon="View" text size="small" @click="openLogDialog" class="log-ticker-btn">
              详情
            </el-button>
          </div>
          <el-button
            v-if="!isProcessing"
            type="primary"
            @click="executeMoveAndLink"
            :disabled="sourceFiles.length === 0 || !targetDirectory"
            class="execute-btn"
            size="large"
          >
            <el-icon>
              <Rank />
            </el-icon>
            {{ operationMode === "move" ? "开始搬家" : "创建链接" }}
          </el-button>
          <el-button v-else type="danger" @click="cancelOperation" class="execute-btn" size="large">
            <el-icon>
              <Close />
            </el-icon>
            取消操作
          </el-button>
        </div>
      </InfoCard>
    </div>

    <!-- 日志详情弹窗 -->
    <BaseDialog v-model="showLogDialog" title="操作历史记录" width="70%" height="600px">
      <template #content>
        <div v-if="allLogs.length === 0" class="empty-logs">
          <el-icon>
            <InfoFilled />
          </el-icon>
          <p>暂无操作记录</p>
        </div>
        <div v-else class="logs-list">
          <div v-for="(log, index) in allLogs" :key="index" class="log-item">
            <div class="log-item-header">
              <div class="log-item-title">
                <el-tag :type="log.errorCount > 0 ? 'warning' : 'success'" size="small">
                  {{ logic.getOperationTypeLabel(log.operationType) }}
                </el-tag>
                <span class="log-item-time">{{ logic.formatTimestamp(log.timestamp) }}</span>
              </div>
              <div class="log-item-meta">
                <span>{{ logic.getLinkTypeLabel(log.linkType) }}</span>
                <span>耗时: {{ logic.formatDuration(log.durationMs) }}</span>
              </div>
            </div>
            <div class="log-item-stats">
              <span>处理: {{ log.sourceCount }} 个</span>
              <span class="success-text">成功: {{ log.successCount }}</span>
              <span v-if="log.errorCount > 0" class="error-text">失败: {{ log.errorCount }}</span>
              <span>大小: {{ logic.formatBytes(log.totalSize) }}</span>
            </div>
            <div class="log-item-details">
              <div class="detail-item">
                <span class="detail-label">目标目录:</span>
                <span class="detail-value" :title="log.targetDirectory">{{
                  log.targetDirectory
                }}</span>
              </div>
              <div v-if="log.processedFiles && log.processedFiles.length > 0" class="detail-item">
                <span class="detail-label">成功文件:</span>
                <span class="detail-value">{{ log.processedFiles.join(", ") }}</span>
              </div>
            </div>
            <div v-if="log.errors.length > 0" class="log-item-errors">
              <div class="error-title">错误详情:</div>
              <div v-for="(error, errIdx) in log.errors" :key="errIdx" class="error-message">
                {{ error }}
              </div>
            </div>
          </div>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.symlink-mover-container {
  display: flex;
  gap: 20px;
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.column:first-child {
  flex: 3;
  min-width: 300px;
}

.settings-column {
  flex: 2;
  min-width: 250px;
}

.full-height-card {
  flex: 1;
  min-height: 0;
}

:deep(.el-card__body) {
  height: 100%;
  padding: 10px;
  display: flex;
  flex-direction: column;
}

.source-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--text-color-light);
  text-align: center;
  padding: 20px;
}

.empty-state .el-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.file-list-scrollbar {
  flex: 1;
}

.file-list {
  padding: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.file-item:hover {
  background-color: var(--container-bg);
}

.file-item:hover .remove-btn {
  opacity: 1;
}

.file-icon {
  margin-right: 10px;
  color: var(--text-color-light);
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name,
.file-path {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-name {
  font-size: 14px;
  color: var(--text-color);
}

.file-path {
  font-size: 12px;
  color: var(--text-color-light);
}

.remove-btn {
  margin-left: 10px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.settings-card :deep(.el-card__body) {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.setting-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.target-control {
  display: flex;
  gap: 10px;
}

.execute-group {
  margin-top: auto;
}

.execute-btn {
  width: 100%;
  font-size: 16px;
}

.operation-mode-group {
  width: 100%;
}

.operation-mode-group :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 10px 15px;
}

.mode-description {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.4;
}

.warning-text {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-color-warning);
}

.warning-text .el-icon {
  font-size: 14px;
}

.progress-group {
  padding: 12px;
  background-color: var(--container-bg);
  border-radius: 8px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.progress-file {
  font-size: 13px;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
}

.progress-stats {
  font-size: 12px;
  color: var(--text-color-light);
  white-space: nowrap;
}

.log-ticker {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(
    135deg,
    var(--container-bg) 0%,
    color-mix(in srgb, var(--el-color-primary) 5%, transparent) 100%
  );
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.log-ticker-content {
  flex: 1;
  overflow: hidden;
  height: 20px;
  position: relative;
}

.log-ticker-message {
  font-size: 12px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  animation: slideInUp 0.5s ease-out;
}

@keyframes slideInUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.log-ticker-btn {
  flex-shrink: 0;
  padding: 4px 8px;
}

.empty-logs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-color-light);
}

.empty-logs .el-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.logs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-item {
  padding: 16px;
  background-color: var(--container-bg);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.log-item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.log-item-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-item-time {
  font-size: 13px;
  color: var(--text-color);
}

.log-item-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-color-light);
}

.log-item-stats {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-color);
  margin-bottom: 8px;
}

.success-text {
  color: var(--el-color-success);
}

.error-text {
  color: var(--el-color-error);
}

.log-item-errors {
  margin-top: 12px;
  padding: 12px;
  background-color: var(--el-color-error-light-9);
  border-radius: 4px;
  border-left: 3px solid var(--el-color-error);
}

.error-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-color-error);
  margin-bottom: 8px;
}

.error-message {
  font-size: 12px;
  color: var(--text-color);
  line-height: 1.6;
  padding-left: 12px;
  position: relative;
}

.error-message::before {
  content: "•";
  position: absolute;
  left: 0;
  color: var(--el-color-error);
}

.log-item-details {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.detail-label {
  color: var(--text-color-light);
  flex-shrink: 0;
  min-width: 70px;
}

.detail-value {
  color: var(--text-color);
  word-break: break-all;
  flex: 1;
}

/* 链接类型说明提示样式 */
.setting-group label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-icon {
  font-size: 14px;
  color: var(--el-color-info);
  cursor: help;
}

.link-type-tooltip {
  max-width: 350px;
}

.tooltip-section {
  margin-bottom: 12px;
}

.tooltip-section:last-child {
  margin-bottom: 0;
}

.tooltip-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 6px;
  color: var(--el-color-primary);
}

.tooltip-text {
  font-size: 12px;
  line-height: 1.6;
}

.tooltip-text strong {
  color: var(--el-color-warning);
  font-weight: 600;
}

/* 文件警告样式 */
.file-item.has-warning {
  border-left: 3px solid var(--el-color-warning);
  background-color: var(--el-color-warning-light-9);
}

.file-warning {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-color-warning);
  font-weight: 500;
}

.file-warning .el-icon {
  font-size: 12px;
}

.file-icon.warning-icon {
  color: var(--el-color-warning);
}
</style>
