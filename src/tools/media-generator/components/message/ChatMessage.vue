<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useResizeObserver } from "@vueuse/core";
import type { MediaMessage, MediaTask } from "../../types";
import type { Asset } from "@/types/asset-management";
import { useMediaGenStore } from "../../stores/mediaGenStore";
import { useModelSelectDialog } from "@/composables/useModelSelectDialog";
import MessageHeader from "./MessageHeader.vue";
import MessageContent from "./MessageContent.vue";
import MessageMenubar from "./MessageMenubar.vue";
import MessageDataEditor from "./MessageDataEditor.vue";
import ExportBranchDialog from "./ExportBranchDialog.vue";

interface Props {
  message: MediaMessage;
  siblings: MediaMessage[];
  currentSiblingIndex: number;
  isSelected?: boolean;
  isBatchMode?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "remove", taskId: string): void;
  (e: "download", task: MediaTask): void;
  (e: "retry"): void;
  (e: "select"): void;
  (e: "switch-sibling", direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
  (e: "resize", el: HTMLElement | null): void;
}>();

const store = useMediaGenStore();
const modelSelectDialog = useModelSelectDialog();
// 弹窗状态管理
const isEditing = ref(false);
const isRawEditing = ref(false);
const isExporting = ref(false);
const isRetrying = ref(false);

const handleEdit = () => {
  isEditing.value = true;
};

const handleEditRaw = () => {
  isRawEditing.value = true;
};

const handleToggleEnabled = () => {
  store.toggleMessageEnabled(props.message.id);
};

const handleExport = () => {
  isExporting.value = true;
};

const handleCreateBranch = () => {
  store.saveToBranch(
    props.message.id,
    props.message.content,
    props.message.attachments
  );
};

const handleRetry = async (useNewModel = false) => {
  if (isRetrying.value) return;

  isRetrying.value = true;
  let temporaryModel: { profileId: string; modelId: string } | undefined;

  try {
    if (useNewModel) {
      const result = await modelSelectDialog.open();
      if (!result) return;
      temporaryModel = {
        profileId: result.profile.id,
        modelId: result.model.id,
      };
    }

    await store.regenerateFromNode(props.message.id, temporaryModel);
  } finally {
    isRetrying.value = false;
  }
};

const handleSaveEdit = (newContent: string, attachments?: Asset[]) => {
  store.editMessage(props.message.id, newContent, attachments);
  isEditing.value = false;
};

const handleSaveToBranch = (newContent: string, attachments?: Asset[]) => {
  store.saveToBranch(props.message.id, newContent, attachments);
  isEditing.value = false;
};

const handleCancelEdit = () => {
  isEditing.value = false;
};

// 监听编辑状态变化，通知父组件重新测量高度
watch(isEditing, () => {
  nextTick(() => {
    emit("resize", messageRef.value);
  });
});

// ===== 背景分块渲染逻辑 (解决超长消息 backdrop-filter 失效问题) =====
const messageRef = ref<HTMLElement | null>(null);
const messageHeight = ref(0);
const BLOCK_SIZE = 2000;

useResizeObserver(messageRef, (entries) => {
  const entry = entries[0];
  const { height } = entry.contentRect;
  messageHeight.value = height;
});

// 计算需要多少个背景块
const backgroundBlocks = computed(() => {
  if (messageHeight.value <= 0) return 1;
  return Math.ceil(messageHeight.value / BLOCK_SIZE);
});

const onSwitchSibling = (direction: "prev" | "next") =>
  emit("switch-sibling", direction);
const onSwitchBranch = (nodeId: string) => emit("switch-branch", nodeId);

// 暴露给虚拟列表用于精确测量的 ref
const getElement = () => messageRef.value;

defineExpose({
  getElement,
});
</script>

<template>
  <div
    ref="messageRef"
    class="chat-message"
    :class="[
      `role-${message.role}`,
      {
        'is-selected': isSelected,
        'batch-mode': isBatchMode,
        'is-disabled': message.isEnabled === false,
      },
    ]"
    @click="isBatchMode && emit('select')"
  >
    <!-- 背景层：分块渲染以规避浏览器对大尺寸 backdrop-filter 的限制 -->
    <div class="message-background-container">
      <div
        v-for="i in backgroundBlocks"
        :key="i"
        class="message-background-slice"
        :style="{
          top: `${(i - 1) * BLOCK_SIZE}px`,
          height: i === backgroundBlocks ? 'auto' : `${BLOCK_SIZE}px`,
          bottom: i === backgroundBlocks ? '0' : 'auto',
        }"
      ></div>
    </div>

    <!-- 内容层 -->
    <div class="message-inner">
      <MessageHeader :message="message" />

      <MessageContent
        :message="message"
        :is-editing="isEditing"
        @save-edit="handleSaveEdit"
        @save-to-branch="handleSaveToBranch"
        @cancel-edit="handleCancelEdit"
      />
    </div>

    <!-- 悬浮操作栏 (批量模式或编辑模式下隐藏) -->
    <div v-if="!isBatchMode && !isEditing" class="menubar-wrapper">
      <MessageMenubar
        :message="message"
        :is-sending="isRetrying"
        :siblings="siblings"
        :current-sibling-index="currentSiblingIndex"
        @edit="handleEdit"
        @create-branch="handleCreateBranch"
        @edit-raw="handleEditRaw"
        @toggle-enabled="handleToggleEnabled"
        @export="handleExport"
        @delete="emit('remove', $event)"
        @download="emit('download', $event)"
        @retry="handleRetry"
        @switch="onSwitchSibling"
        @switch-branch="onSwitchBranch"
      />
    </div>

    <!-- 弹窗组件 -->
    <MessageDataEditor v-model="isRawEditing" :message-id="message.id" />
    <ExportBranchDialog v-model="isExporting" :message-id="message.id" />
  </div>
</template>

<style scoped>
.chat-message {
  position: relative;
  display: flow-root;
  margin-bottom: 12px;
  padding: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.chat-message.is-disabled {
  opacity: 0.6;
  filter: grayscale(0.5);
}

.chat-message.batch-mode {
  cursor: pointer;
}

/* 背景层容器 */
.message-background-container {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: 8px;
  overflow: hidden;
}

/* 独立的边框层 */
.chat-message::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
  transition: all 0.2s;
}

.chat-message.is-selected::after {
  border-color: var(--el-color-primary);
  border-width: 2px;
  box-shadow: 0 0 0 4px
    color-mix(in srgb, var(--el-color-primary), transparent 85%);
}

.chat-message.batch-mode:hover::after {
  border-color: color-mix(in srgb, var(--el-color-primary), transparent 40%);
}

.chat-message.is-selected .message-background-slice {
  background-color: color-mix(
    in srgb,
    var(--el-color-primary),
    transparent 90%
  );
}

/* 背景切片 */
.message-background-slice {
  position: absolute;
  left: 0;
  right: 0;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

.message-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menubar-wrapper {
  position: sticky;
  bottom: 8px;
  display: flex;
  justify-content: flex-end;
  margin-top: -32px;
  z-index: 10;
  padding-right: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.menubar-wrapper > * {
  pointer-events: auto;
}

.chat-message:hover .menubar-wrapper {
  opacity: 1;
}
</style>
