<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useTranscriptionStore } from "../stores/transcriptionStore";
import { useTranscriptionManager } from "../composables/useTranscriptionManager";
import { useTranscriptionViewer } from "@/composables/useTranscriptionViewer";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import { useAudioViewer } from "@/composables/useAudioViewer";
import { format } from "date-fns";
import BaseDialog from "@/components/common/BaseDialog.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import DocumentViewer from "@/components/common/DocumentViewer.vue";
import { customMessage } from "@/utils/customMessage";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  XCircle,
  Play,
  RotateCcw,
  Trash2,
  FileText,
  Clock,
  ListFilter,
  Timer,
  Info,
  Eye,
} from "lucide-vue-next";
import type { TranscriptionTask } from "../types";

const store = useTranscriptionStore();

// 用于动态刷新正在处理任务的时间显示
const now = ref(Date.now());
let timer: any = null;

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

// 任务列表排序：正在处理优先，其次是按创建时间倒序
const tasks = computed(() => {
  return [...store.tasks].sort((a, b) => {
    if (a.status === "processing" && b.status !== "processing") return -1;
    if (a.status !== "processing" && b.status === "processing") return 1;
    return b.createdAt - a.createdAt;
  });
});

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return CheckCircle2;
    case "processing":
      return Loader2;
    case "error":
      return AlertCircle;
    case "cancelled":
      return XCircle;
    default:
      return Play;
  }
};

const getStatusType = (status: string) => {
  switch (status) {
    case "completed":
      return "success";
    case "processing":
      return "primary";
    case "error":
      return "danger";
    case "cancelled":
      return "info";
    default:
      return "info";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "completed":
      return "已完成";
    case "processing":
      return "处理中";
    case "error":
      return "失败";
    case "cancelled":
      return "已取消";
    case "pending":
      return "队列中";
    default:
      return status;
  }
};

const { cancelTask, getTranscriptionText, addTask } = useTranscriptionManager();
const transcriptionViewer = useTranscriptionViewer();
const imageViewer = useImageViewer();
const videoViewer = useVideoViewer();
const audioViewer = useAudioViewer();

// 预览相关状态
const isPreviewDialogVisible = ref(false);
const selectedAssetForPreview = ref<any>(null);

// 重试确认弹窗状态
const showRetryConfirm = ref(false);
const retryingTask = ref<TranscriptionTask | null>(null);
const retryModelId = ref("");
const retryPrompt = ref("");
const retryEnableRepetitionDetection = ref(true);

// 根据任务类型计算需要的模型能力
const retryRequiredCapabilities = computed(() => {
  if (!retryingTask.value) return {};
  switch (retryingTask.value.assetType) {
    case "image":
      return { vision: true };
    case "audio":
      return { audio: true };
    case "video":
      return { video: true };
    case "document":
      return { document: true };
    default:
      return {};
  }
});

const handleRetry = async (task: TranscriptionTask) => {
  // 打开重试确认弹窗，预填充旧配置
  retryingTask.value = task;

  // 从旧任务的 overrideConfig 中提取配置
  const oldConfig = task.overrideConfig;
  // LlmModelSelector 需要完整的 profileId:modelId 格式
  retryModelId.value = oldConfig?.modelIdentifier || "";
  // 只恢复附加提示词，不混入主提示词
  retryPrompt.value = oldConfig?.additionalPrompt || "";
  retryEnableRepetitionDetection.value = oldConfig?.enableRepetitionDetection !== false;

  showRetryConfirm.value = true;
};

const handleConfirmRetry = async () => {
  if (!retryingTask.value) return;

  const asset = await assetManagerEngine.getAssetById(retryingTask.value.assetId);
  if (asset) {
    // 构建覆盖配置，保留原有的 customPrompt 覆盖（如果有）
    const overrideConfig: Record<string, any> = {
      ...(retryingTask.value.overrideConfig || {}),
    };

    if (retryModelId.value) {
      overrideConfig.modelIdentifier = retryModelId.value;
    } else {
      delete overrideConfig.modelIdentifier;
    }

    // 更新附加提示词
    overrideConfig.additionalPrompt = retryPrompt.value || undefined;
    overrideConfig.enableRepetitionDetection = retryEnableRepetitionDetection.value;

    // 调用 addTask 并传入覆盖配置
    addTask(asset, Object.keys(overrideConfig).length > 0 ? overrideConfig : undefined);
  }

  // 关闭弹窗并重置状态
  showRetryConfirm.value = false;
  retryingTask.value = null;
  retryModelId.value = "";
  retryPrompt.value = "";
};

const handleCancelRetryConfirm = () => {
  showRetryConfirm.value = false;
  retryingTask.value = null;
  retryModelId.value = "";
  retryPrompt.value = "";
};

const handleCancel = (assetId: string) => {
  cancelTask(assetId);
};

const handlePreviewAsset = async (assetId: string) => {
  const asset = await assetManagerEngine.getAssetById(assetId);
  if (!asset) {
    customMessage.error("未找到相关资产");
    return;
  }

  if (asset.type === "image") {
    const basePath = await assetManagerEngine.getAssetBasePath();
    const url = assetManagerEngine.convertToAssetProtocol(asset.path, basePath);
    imageViewer.show(url);
  } else if (asset.type === "video") {
    videoViewer.previewVideo(asset);
  } else if (asset.type === "audio") {
    audioViewer.previewAudio(asset);
  } else if (asset.type === "document") {
    selectedAssetForPreview.value = asset;
    isPreviewDialogVisible.value = true;
  } else {
    customMessage.info("该文件类型暂不支持预览");
  }
};

const handleViewResult = async (task: TranscriptionTask) => {
  const asset = await assetManagerEngine.getAssetById(task.assetId);
  if (asset) {
    const text = await getTranscriptionText(asset);
    transcriptionViewer.show({
      asset,
      initialContent: text || "",
      previousConfig: task.overrideConfig,
      onSave: (content) => {
        // 更新本地 store 中的 task 缓存
        const t = store.tasks.find((it) => it.assetId === asset.id);
        if (t) {
          t.resultText = content;
        }
        transcriptionViewer.close();
      },
      onRegenerate: ({ modelId, prompt, enableRepetitionDetection, overrideConfig }) => {
        // 优先使用传入的完整 overrideConfig，确保保留了 customPrompt 等
        // 注意：modelId 此时已经是 profileId:modelId 格式（由查看器传回）
        const finalConfig = overrideConfig || {
          modelIdentifier: modelId || undefined,
          additionalPrompt: prompt || undefined,
          enableRepetitionDetection,
        };
        addTask(asset, finalConfig);
        transcriptionViewer.close();
      },
    });
  }
};

const clearFinishedTasks = () => {
  const finished = store.tasks.filter(
    (t) => t.status === "completed" || t.status === "cancelled" || t.status === "error"
  );
  finished.forEach((t) => store.removeTask(t.id));
};

const stats = computed(() => {
  return {
    total: store.tasks.length,
    processing: store.processingCount,
    pending: store.tasks.filter((t) => t.status === "pending").length,
    completed: store.tasks.filter((t) => t.status === "completed").length,
    error: store.tasks.filter((t) => t.status === "error").length,
  };
});

/**
 * 格式化耗时
 */
const formatDuration = (ms: number) => {
  if (ms < 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

const getTaskDuration = (task: TranscriptionTask) => {
  if (!task.startedAt) return null;

  // 如果任务已结束（完成、失败、取消），必须有完成时间才显示
  if (task.status === "completed" || task.status === "error" || task.status === "cancelled") {
    if (task.completedAt) {
      return task.completedAt - task.startedAt;
    }
    // 如果没有完成时间（可能逻辑异常或尚未同步），不使用 now.value，避免计时器跳动
    return null;
  }

  // 只有正在处理中的任务才使用当前时间动态更新
  if (task.status === "processing") {
    return now.value - task.startedAt;
  }

  return null;
};
</script>

<template>
  <div class="transcription-queue">
    <!-- 统计概览 -->
    <div class="queue-stats">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">总任务</div>
      </div>
      <div class="stat-card processing">
        <div class="stat-value">{{ stats.processing }}</div>
        <div class="stat-label">正在处理</div>
      </div>
      <div class="stat-card pending">
        <div class="stat-value">{{ stats.pending }}</div>
        <div class="stat-label">等待中</div>
      </div>
      <div class="stat-card completed">
        <div class="stat-value">{{ stats.completed }}</div>
        <div class="stat-label">已完成</div>
      </div>
      <div class="stat-card error">
        <div class="stat-value">{{ stats.error }}</div>
        <div class="stat-label">失败</div>
      </div>
    </div>

    <!-- 列表控制栏 -->
    <div class="queue-header">
      <div class="header-left">
        <el-icon><ListFilter /></el-icon>
        <span class="title">任务监控列表</span>
      </div>
      <div class="header-right">
        <el-button :icon="Trash2" link @click="clearFinishedTasks"> 清空已结束任务 </el-button>
      </div>
    </div>

    <!-- 任务表格 -->
    <div class="queue-content">
      <el-table :data="tasks" style="width: 100%" height="100%" class="custom-table">
        <el-table-column label="文件名称" min-width="200">
          <template #default="{ row }">
            <div class="file-cell" @click="handlePreviewAsset(row.assetId)">
              <el-icon class="file-icon"><FileText /></el-icon>
              <div class="file-info">
                <span class="filename" :title="row.filename">{{ row.filename }}</span>
                <span class="asset-id">{{ row.assetId }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small" class="status-tag">
              <el-icon :class="{ 'is-loading': row.status === 'processing' }">
                <component :is="getStatusIcon(row.status)" />
              </el-icon>
              <span>
                {{
                  row.status === "processing" && row.progress !== undefined
                    ? `${Math.round(row.progress)}%`
                    : getStatusLabel(row.status)
                }}
              </span>
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="耗时" width="100">
          <template #default="{ row }">
            <div v-if="getTaskDuration(row) !== null" class="duration-cell">
              <el-icon><Timer /></el-icon>
              <span>{{ formatDuration(getTaskDuration(row)!) }}</span>
            </div>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            <div class="time-cell">
              <el-icon><Clock /></el-icon>
              <span>{{ format(row.createdAt, "yyyy-MM-dd HH:mm:ss") }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="160" fixed="right" align="center">
          <template #default="{ row }">
            <div class="action-cell">
              <el-tooltip content="预览资产" placement="top">
                <el-button
                  :icon="Eye"
                  circle
                  size="small"
                  @click="handlePreviewAsset(row.assetId)"
                />
              </el-tooltip>
              <el-tooltip
                v-if="row.status === 'error' || row.status === 'cancelled'"
                content="重试任务"
                placement="top"
              >
                <el-button :icon="RotateCcw" circle size="small" @click="handleRetry(row)" />
              </el-tooltip>
              <el-tooltip
                v-if="row.status === 'processing' || row.status === 'pending'"
                content="取消任务"
                placement="top"
              >
                <el-button
                  :icon="XCircle"
                  circle
                  size="small"
                  type="danger"
                  plain
                  @click="handleCancel(row.assetId)"
                />
              </el-tooltip>
              <el-tooltip v-if="row.status === 'completed'" content="查看结果" placement="top">
                <el-button
                  :icon="FileText"
                  circle
                  size="small"
                  type="success"
                  plain
                  @click="handleViewResult(row)"
                />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 重试确认弹窗 -->
    <BaseDialog v-model="showRetryConfirm" title="重试转写任务" width="500px" height="auto">
      <template #content>
        <div class="retry-form">
          <div class="retry-task-info" v-if="retryingTask">
            <span class="info-label">文件：</span>
            <span class="info-value">{{ retryingTask.filename }}</span>
          </div>
          <div class="form-item">
            <label>指定模型（可选）</label>
            <LlmModelSelector
              v-model="retryModelId"
              placeholder="选择模型 (可选，默认使用全局设置)"
              :capabilities="retryRequiredCapabilities"
              :teleported="true"
              popper-class="retry-confirm-popper"
            />
          </div>
          <div class="form-item">
            <label>附加提示 (Prompt)</label>
            <el-input
              v-model="retryPrompt"
              type="textarea"
              :rows="6"
              placeholder="输入额外的指令来引导转写，例如：'请以更正式的语气转写' 或 '着重提取关键技术术语'..."
            />
          </div>
          <div class="form-item inline-item">
            <label>启用复读检测</label>
            <el-switch v-model="retryEnableRepetitionDetection" />
          </div>
          <div class="form-tip">
            <Info :size="14" />
            <div class="tip-content">
              <p>重试将创建一个新的转写任务。</p>
              <p>附加提示将<b>追加</b>到全局转写提示词之后。</p>
              <p v-if="retryingTask?.overrideConfig">
                <span class="has-config-hint">已从上次任务中恢复配置</span>
              </p>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="confirm-footer">
          <button class="btn btn-secondary" @click="handleCancelRetryConfirm">取消</button>
          <button class="btn btn-primary" @click="handleConfirmRetry">确认重试</button>
        </div>
      </template>
    </BaseDialog>

    <!-- 文档预览弹窗 -->
    <BaseDialog
      v-model="isPreviewDialogVisible"
      :title="selectedAssetForPreview?.name"
      width="80vw"
      height="80vh"
    >
      <template #content>
        <div class="document-preview-container">
          <DocumentViewer
            v-if="selectedAssetForPreview"
            :key="selectedAssetForPreview.id"
            :file-path="selectedAssetForPreview.path"
            :file-name="selectedAssetForPreview.name"
            :file-type-hint="selectedAssetForPreview.mimeType"
            :show-engine-switch="true"
          />
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.transcription-queue {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background-color: transparent;
  box-sizing: border-box;
  overflow: hidden;
}

.queue-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.stat-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.stat-card.processing .stat-value {
  color: var(--el-color-primary);
}
.stat-card.pending .stat-value {
  color: var(--el-color-info);
}
.stat-card.completed .stat-value {
  color: var(--el-color-success);
}
.stat-card.error .stat-value {
  color: var(--el-color-danger);
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

.queue-content {
  flex: 1;
  min-height: 0;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  box-sizing: border-box;
  /* 使用相对定位，让内部表格可以绝对定位填充，彻底解决 flex 高度计算偏差 */
  position: relative;
}

.file-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-icon {
  font-size: 20px;
  color: var(--el-text-color-secondary);
}

.file-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.filename {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-id {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-family: monospace;
}

.status-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 24px;
}

.time-cell,
.duration-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.duration-cell {
  color: var(--el-color-primary);
}

.action-cell {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

:deep(.custom-table) {
  position: absolute !important;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  --el-table-background-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: var(--sidebar-bg);
  box-sizing: border-box;
  /* 移除 Element Plus 表格默认的外边框，防止在 100% 高度时溢出 */
  border: none !important;
}

:deep(.el-table__inner-wrapper::before) {
  display: none;
}

:deep(.el-table__row:hover) {
  background-color: var(--el-fill-color-light) !important;
}

/* 重试确认弹窗样式 */
.retry-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.retry-task-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--hover-bg);
  border-radius: 6px;
  font-size: 13px;
}

.info-label {
  color: var(--el-text-color-secondary);
  min-width: 40px;
}

.info-value {
  color: var(--el-text-color-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.form-item.inline-item {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.form-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--hover-bg);
  padding: 4px 12px;
  border-radius: 6px;
}

.tip-content p {
  margin: 0;
  line-height: 1.6;
}

.tip-content b {
  color: var(--el-color-primary);
}

.has-config-hint {
  color: var(--el-color-success);
  font-weight: 500;
}

.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  width: 100%;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-secondary {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  color: var(--el-text-color-primary);
}

.btn-secondary:hover {
  background: var(--hover-bg);
  border-color: var(--border-color-hover);
}

.btn-primary {
  background: var(--el-color-primary);
  border: 1px solid var(--el-color-primary);
  color: white;
}

.btn-primary:hover {
  background: rgba(var(--el-color-primary-rgb), 0.7);
  border-color: rgba(var(--el-color-primary-rgb), 0.7);
}
</style>

<style>
/* 全局样式，用于提升被 teleport 到 body 的下拉框层级 */
.el-popper.retry-confirm-popper {
  z-index: 6000 !important;
}
</style>
