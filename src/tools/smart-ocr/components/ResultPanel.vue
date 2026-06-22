<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { customMessage } from "@/utils/customMessage";
import {
  CopyDocument,
  Loading,
  CircleCheck,
  CircleClose,
  Refresh,
  Hide,
  ChatDotRound,
  ArrowDown,
  ArrowRight,
  Edit,
  Check,
  Close,
} from "@element-plus/icons-vue";
import type { OcrResult, UploadedImage, ImageBlock } from "../types";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useSendToChat } from "@/composables/useSendToChat";

const errorHandler = createModuleErrorHandler("smart-ocr/ResultPanel");

// 获取发送到聊天功能
const { sendToChat } = useSendToChat();

// 折叠状态管理
const collapsedGroups = ref<Set<string>>(new Set());
const collapsedBlocks = ref<Set<string>>(new Set());

// 编辑状态管理
const editingBlockId = ref<string | null>(null);
const editingText = ref<string>("");

const props = defineProps<{
  ocrResults: OcrResult[];
  isProcessing: boolean;
  uploadedImages: UploadedImage[];
  imageBlocksMap: Map<string, ImageBlock[]>;
  selectedImageId?: string | null;
}>();

const emit = defineEmits<{
  retryBlock: [blockId: string];
  retryAllFailed: [];
  cancelActive: [];
  toggleIgnore: [blockId: string];
  updateText: [blockId: string, text: string];
  selectImage: [imageId: string];
}>();

// 是否有失败的结果
const hasFailedResults = computed(() => {
  return props.ocrResults.some((r) => r.status === "error");
});

const hasCancelableResults = computed(() => {
  return props.ocrResults.some(
    (r) => r.status === "pending" || r.status === "processing"
  );
});

// 按图片分组结果
const groupedResults = computed(() => {
  const groups = new Map<string, OcrResult[]>();

  props.ocrResults.forEach((result) => {
    if (!groups.has(result.imageId)) {
      groups.set(result.imageId, []);
    }
    groups.get(result.imageId)!.push(result);
  });

  return groups;
});

// 计算已完成的数量
const completedCount = computed(() => {
  return props.ocrResults.filter((r) => r.status === "success").length;
});

// 计算总文本（排除被忽略的块）
const allText = computed(() => {
  return props.ocrResults
    .filter((r) => r.status === "success" && !r.ignored)
    .map((r) => r.text)
    .join("\n\n");
});

// 获取图片名称
const getImageName = (imageId: string) => {
  const image = props.uploadedImages.find((img) => img.id === imageId);
  return image?.name || "未知图片";
};

// 拆分为基础名与扩展名，扩展名前的名字可省略尾部以避免横向滚动
const getFileParts = (imageId: string) => {
  const fullName = getImageName(imageId);
  const lastDotIndex = fullName.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return { name: fullName, ext: "" };
  }
  return {
    name: fullName.slice(0, lastDotIndex),
    ext: fullName.slice(lastDotIndex),
  };
};

// 获取块在图片中的索引
const getBlockIndex = (imageId: string, blockId: string) => {
  const blocks = props.imageBlocksMap.get(imageId) || [];
  return blocks.findIndex((b) => b.id === blockId) + 1;
};

// 复制文本
const copyText = async (text: string, context: string = "单个结果") => {
  try {
    await writeText(text);
    customMessage.success("已复制到剪贴板");
  } catch (error) {
    errorHandler.error(error as Error, `复制${context}到剪贴板失败`, {
      context: {
        context,
        textLength: text.length,
      },
    });
  }
};

// 复制所有文本
const copyAllText = async () => {
  if (!allText.value) {
    customMessage.warning("暂无可复制的内容");
    return;
  }
  await copyText(allText.value, "全部结果");
};

// 发送所有文本到聊天
const sendAllToChat = () => {
  if (!allText.value) {
    customMessage.warning("暂无可发送的内容");
    return;
  }
  sendToChat(allText.value, {
    successMessage: "已将OCR识别结果发送到聊天",
  });
};

// 获取状态图标
const getStatusIcon = (status: OcrResult["status"]) => {
  switch (status) {
    case "success":
      return CircleCheck;
    case "error":
    case "cancelled":
      return CircleClose;
    case "processing":
      return Loading;
    default:
      return Loading;
  }
};

// 获取状态类型
const getStatusType = (
  status: OcrResult["status"]
): "success" | "danger" | "warning" | "info" => {
  switch (status) {
    case "success":
      return "success";
    case "error":
      return "danger";
    case "cancelled":
      return "info";
    case "processing":
      return "warning";
    default:
      return "info";
  }
};

// 获取状态文本
const getStatusText = (status: OcrResult["status"]) => {
  switch (status) {
    case "success":
      return "完成";
    case "error":
      return "失败";
    case "cancelled":
      return "已取消";
    case "processing":
      return "识别中";
    default:
      return "等待中";
  }
};

// 处理重试
const handleRetry = (blockId: string) => {
  emit("retryBlock", blockId);
};

// 处理忽略切换
const handleToggleIgnore = (blockId: string) => {
  emit("toggleIgnore", blockId);
};
// 切换图片组折叠状态
const toggleGroupCollapse = (imageId: string) => {
  // 反向联动：如果点击的不是当前选中的图片，同步切换选中状态
  if (imageId !== props.selectedImageId) {
    emit("selectImage", imageId);
    return;
  }

  // 点击当前选中的分组，切换折叠
  if (collapsedGroups.value.has(imageId)) {
    collapsedGroups.value.delete(imageId);
  } else {
    collapsedGroups.value.add(imageId);
  }
};

// 切换块折叠状态
const toggleBlockCollapse = (blockId: string) => {
  if (collapsedBlocks.value.has(blockId)) {
    collapsedBlocks.value.delete(blockId);
  } else {
    collapsedBlocks.value.add(blockId);
  }
};

// 检查图片组是否折叠
const isGroupCollapsed = (imageId: string) => {
  return collapsedGroups.value.has(imageId);
};

// 检查块是否折叠
const isBlockCollapsed = (blockId: string) => {
  return collapsedBlocks.value.has(blockId);
};

// 开始编辑
const startEdit = (blockId: string, currentText: string) => {
  editingBlockId.value = blockId;
  editingText.value = currentText;
};

// 保存编辑
const saveEdit = () => {
  if (editingBlockId.value) {
    const blockId = editingBlockId.value;
    const newText = editingText.value;

    emit("updateText", blockId, newText);

    editingBlockId.value = null;
    editingText.value = "";

    customMessage.success("文本已更新");
  }
};

// 取消编辑
const cancelEdit = () => {
  editingBlockId.value = null;
  editingText.value = "";
};

// 检查是否正在编辑
const isEditing = (blockId: string) => {
  return editingBlockId.value === blockId;
};
// 监听选中图片变化：智能聚焦折叠 + 自动滚动
watch(
  () => props.selectedImageId,
  async (newId) => {
    if (newId) {
      // 1. 智能聚焦折叠：折叠其他分组，展开当前选中
      props.uploadedImages.forEach((img) => {
        if (img.id !== newId) {
          collapsedGroups.value.add(img.id);
        }
      });
      collapsedGroups.value.delete(newId);

      // 2. 自动滚动到对应分组
      await nextTick();
      const element = document.getElementById(`group-${newId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="result-panel">
    <div class="panel-header">
      <div class="header-actions">
        <h3>识别结果</h3>
        <el-tag v-if="ocrResults.length > 0" size="small">
          {{ completedCount }} / {{ ocrResults.length }}
        </el-tag>
        <el-button
          v-if="hasFailedResults"
          size="small"
          type="warning"
          :icon="Refresh"
          @click="emit('retryAllFailed')"
        >
          重试失败
        </el-button>
        <el-button
          v-if="hasCancelableResults"
          size="small"
          type="danger"
          plain
          :icon="Close"
          @click="emit('cancelActive')"
        >
          取消识别
        </el-button>
        <el-button
          v-if="allText"
          size="small"
          :icon="CopyDocument"
          @click="copyAllText"
        >
          复制全部
        </el-button>
        <el-button
          v-if="allText"
          size="small"
          type="success"
          :icon="ChatDotRound"
          @click="sendAllToChat"
        >
          发送到聊天
        </el-button>
      </div>
    </div>

    <div class="panel-content">
      <template v-if="ocrResults.length === 0 && !isProcessing">
        <div class="empty-state">
          <el-empty description="暂无识别结果" />
        </div>
      </template>

      <template v-else>
        <div class="result-list">
          <!-- 按图片分组显示 -->
          <div
            v-for="[imageId, results] in groupedResults"
            :key="imageId"
            :id="`group-${imageId}`"
            class="image-group"
            :class="{ 'is-selected-group': imageId === selectedImageId }"
          >
            <div
              class="group-header"
              :class="{ 'is-active': imageId === selectedImageId }"
              @click="toggleGroupCollapse(imageId)"
            >
              <div class="group-header-left">
                <el-icon class="collapse-icon">
                  <component
                    :is="isGroupCollapsed(imageId) ? ArrowRight : ArrowDown"
                  />
                </el-icon>
                <div class="group-title">
                  <span class="group-title-name">{{
                    getFileParts(imageId).name
                  }}</span>
                  <span
                    class="group-title-ext"
                    v-if="getFileParts(imageId).ext"
                    >{{ getFileParts(imageId).ext }}</span
                  >
                </div>
              </div>
              <el-tag size="small">
                {{ results.filter((r) => r.status === "success").length }} /
                {{ results.length }}
              </el-tag>
            </div>

            <div v-show="!isGroupCollapsed(imageId)" class="group-content">
              <div
                v-for="result in results"
                :key="result.blockId"
                class="result-item"
                :class="{ 'is-ignored': result.ignored }"
              >
                <div
                  class="result-header"
                  @click="toggleBlockCollapse(result.blockId)"
                >
                  <div class="header-left">
                    <el-icon class="collapse-icon">
                      <component
                        :is="
                          isBlockCollapsed(result.blockId)
                            ? ArrowRight
                            : ArrowDown
                        "
                      />
                    </el-icon>
                    <el-tag size="small"
                      >块 {{ getBlockIndex(imageId, result.blockId) }}</el-tag
                    >
                    <el-tag
                      :type="getStatusType(result.status)"
                      size="small"
                      :icon="getStatusIcon(result.status)"
                    >
                      {{ getStatusText(result.status) }}
                    </el-tag>
                    <el-tag v-if="result.ignored" size="small" type="info"
                      >已忽略</el-tag
                    >
                  </div>
                  <div class="header-actions" @click.stop>
                    <el-tooltip
                      v-if="
                        result.status === 'error' || result.status === 'success'
                      "
                      content="重试"
                      placement="top"
                    >
                      <el-button
                        size="small"
                        :icon="Refresh"
                        @click="handleRetry(result.blockId)"
                      />
                    </el-tooltip>
                    <el-tooltip
                      v-if="result.status === 'success'"
                      :content="result.ignored ? '取消忽略' : '忽略'"
                      placement="top"
                    >
                      <el-button
                        size="small"
                        :icon="Hide"
                        :type="result.ignored ? 'primary' : 'default'"
                        @click="handleToggleIgnore(result.blockId)"
                      />
                    </el-tooltip>
                    <el-tooltip
                      v-if="
                        result.status === 'success' &&
                        !isEditing(result.blockId)
                      "
                      content="编辑"
                      placement="top"
                    >
                      <el-button
                        size="small"
                        :icon="Edit"
                        @click="startEdit(result.blockId, result.text)"
                      />
                    </el-tooltip>
                    <el-tooltip
                      v-if="
                        result.status === 'success' &&
                        result.text &&
                        !isEditing(result.blockId)
                      "
                      content="复制"
                      placement="top"
                    >
                      <el-button
                        size="small"
                        :icon="CopyDocument"
                        @click="copyText(result.text)"
                      />
                    </el-tooltip>
                  </div>
                </div>

                <div
                  v-show="!isBlockCollapsed(result.blockId)"
                  class="result-content"
                >
                  <template v-if="result.status === 'processing'">
                    <div class="loading-state">
                      <el-icon class="is-loading"><Loading /></el-icon>
                      <el-text type="info">正在识别...</el-text>
                    </div>
                  </template>

                  <template v-else-if="result.status === 'cancelled'">
                    <div class="cancelled-state">
                      <el-text type="info">已取消识别</el-text>
                    </div>
                  </template>

                  <template v-else-if="result.status === 'error'">
                    <div class="error-state">
                      <el-text type="danger">{{
                        result.error || "识别失败"
                      }}</el-text>
                    </div>
                  </template>

                  <template v-else-if="result.status === 'success'">
                    <!-- 编辑模式 -->
                    <template v-if="isEditing(result.blockId)">
                      <div class="edit-container">
                        <el-input
                          v-model="editingText"
                          type="textarea"
                          :rows="8"
                          placeholder="请输入文本内容"
                          class="edit-textarea"
                        />
                        <div class="edit-actions">
                          <el-tooltip content="保存" placement="top">
                            <el-button
                              size="small"
                              type="primary"
                              :icon="Check"
                              @click="saveEdit"
                            />
                          </el-tooltip>
                          <el-tooltip content="取消" placement="top">
                            <el-button
                              size="small"
                              :icon="Close"
                              @click="cancelEdit"
                            />
                          </el-tooltip>
                        </div>
                      </div>
                    </template>

                    <!-- 显示模式 -->
                    <template v-else>
                      <div class="text-content">
                        <pre>{{ result.text || "(无文本)" }}</pre>
                      </div>
                      <div v-if="result.confidence" class="confidence">
                        <el-text size="small" type="info">
                          置信度: {{ (result.confidence * 100).toFixed(1) }}%
                        </el-text>
                      </div>
                    </template>
                  </template>

                  <template v-else>
                    <div class="pending-state">
                      <el-text type="info">等待处理...</el-text>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.result-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

.panel-header {
  padding: 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
  border-radius: 8px 8px 0 0;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  padding-right: 8px;
  min-width: 50px;
  color: var(--text-color);
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-items: center;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.result-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.image-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 6px;
  border: var(--border-width) solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.group-header.is-active {
  border-color: var(--el-color-primary);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  box-shadow: 0 0 8px rgba(var(--el-color-primary-rgb), 0.15);
}

.image-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-radius: 8px;
  transition: all 0.2s ease;
  padding: 2px;
}

.image-group.is-selected-group {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.02)
  );
}
.group-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  margin-right: 12px;
}

.collapse-icon {
  transition: transform 0.2s;
  flex-shrink: 0;
}

.group-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--el-color-primary);
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
}

.group-title-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 0 1 auto;
}

.group-title-ext {
  flex: 0 0 auto;
  white-space: nowrap;
}

.group-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-left: 6px;
  transition: all 0.3s ease;
  overflow: hidden;
}

.result-item {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--bg-color);
  backdrop-filter: blur(var(--ui-blur));
  transition: opacity 0.2s;
}

.result-item.is-ignored {
  opacity: 0.5;
}
.result-header {
  padding: 10px;
  background-color: var(--card-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
  box-sizing: border-box;
  cursor: pointer;
  transition: background-color 0.2s;
  user-select: none;
}

.header-left {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.result-content {
  padding: 0;
  transition: all 0.3s ease;
  overflow: hidden;
}
.loading-state,
.error-state,
.cancelled-state,
.pending-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 4px;
  background-color: var(--bg-color);
}

.loading-state {
  color: var(--primary-color);
}

.text-content {
  margin-bottom: 0;
}
.text-content pre {
  margin: 0;
  padding: 12px;
  background-color: transparent;
  backdrop-filter: none;
  border: none;
  border-radius: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color);
}

.confidence {
  text-align: right;
}

.edit-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-textarea {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
}

.edit-textarea :deep(textarea) {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
  line-height: 1.6;
}

.edit-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
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

.el-button {
  margin: 0 2px;
}
</style>
