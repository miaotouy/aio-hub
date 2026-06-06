<template>
  <div class="agent-preset-editor" :class="{ compact: props.compact }">
    <!-- 头部操作栏 -->
    <div
      v-if="!props.compact"
      ref="headerRef"
      class="editor-header"
      :class="{ 'is-narrow': isNarrow }"
    >
      <div class="header-title" @click="isCollapsed = !isCollapsed">
        <el-button link size="small" class="collapse-btn">
          <el-icon :class="{ 'is-collapsed': isCollapsed }"
            ><ArrowDown
          /></el-icon>
        </el-button>
        <span class="title-text">预设消息配置</span>
        <el-tooltip
          content="预设消息将作为所有对话的上下文基础"
          placement="top"
        >
          <el-icon><QuestionFilled /></el-icon>
        </el-tooltip>
        <div v-if="props.modelId && totalTokens > 0" class="token-info">
          <el-tag size="small" type="info" effect="plain">
            <template v-if="isCalculatingTokens">计算中...</template>
            <template v-else>总计: {{ totalTokens }} tokens</template>
          </el-tag>
        </div>
      </div>
      <div class="header-actions">
        <el-dropdown trigger="click" @command="handleExport">
          <div>
            <el-tooltip
              content="将当前预设导出为文件"
              placement="top"
              :show-after="300"
            >
              <el-button size="small">
                <el-icon><Download /></el-icon>
                导出
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="json">JSON 格式</el-dropdown-item>
              <el-dropdown-item command="yaml">YAML 格式</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-dropdown trigger="click" @command="handleCopy">
          <div>
            <el-tooltip
              content="将当前预设复制到剪贴板"
              placement="top"
              :show-after="300"
            >
              <el-button size="small">
                <el-icon><CopyDocument /></el-icon>
                复制
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="json">复制为 JSON</el-dropdown-item>
              <el-dropdown-item command="yaml">复制为 YAML</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-tooltip
          content="从剪贴板粘贴并覆盖整个预设"
          placement="top"
          :show-after="300"
        >
          <el-button size="small" @click="handlePaste">
            <el-icon><DocumentCopy /></el-icon>粘贴
          </el-button>
        </el-tooltip>
        <el-tooltip content="从文件导入预设" placement="top" :show-after="300">
          <el-button size="small" @click="handleImport">
            <el-icon><Upload /></el-icon>导入
          </el-button>
        </el-tooltip>
        <el-tooltip
          content="批量管理消息（移动/删除/启用）"
          placement="top"
          :show-after="300"
        >
          <el-button size="small" @click="handleOpenBatchManager">
            <el-icon><Operation /></el-icon>批量管理
          </el-button> </el-tooltip
        ><el-tooltip
          content="添加一条新的预设消息"
          placement="top"
          :show-after="300"
        >
          <el-button type="primary" size="small" @click="handleAddMessage">
            <el-icon><Plus /></el-icon>添加消息
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <Transition name="collapse">
      <div
        v-show="!isCollapsed || props.compact"
        class="messages-container"
        :style="{ height: containerHeight }"
      >
        <div class="messages-scroll-wrapper">
          <VueDraggableNext
            v-model="currentPageMessages"
            item-key="id"
            handle=".drag-handle"
            @start="onDragStart"
            @end="onDragEnd"
            class="messages-list"
            ghost-class="ghost-message"
            drag-class="drag-message"
            :force-fallback="true"
            :fallback-tolerance="3"
            :animation="200"
          >
            <div
              v-for="element in currentPageMessages"
              :key="element.id"
              v-memo="[
                element.isEnabled,
                element.content,
                element.role,
                element.name,
                element.injectionStrategy,
                element.modelMatch,
                messageTokens.get(element.id),
              ]"
              class="message-card-wrapper"
            >
              <PresetMessageCard
                :element="element"
                :compact="props.compact"
                :model-id="props.modelId"
                :token-count="
                  props.modelId && messageTokens.has(element.id)
                    ? messageTokens.get(element.id)
                    : undefined
                "
                @edit="handleEditMessage"
                @copy="handleCopyMessage"
                @paste="handlePasteMessage"
                @delete="handleDeleteMessage"
                @toggle-enabled="handleToggleEnabled"
              />
            </div>
          </VueDraggableNext>

          <div v-if="localMessages.length === 0" class="empty-state">
            <el-empty description="暂无预设消息，点击上方按钮添加">
              <el-button type="primary" @click="handleAddMessage"
                >添加第一条消息</el-button
              >
            </el-empty>
          </div>
        </div>

        <div
          v-if="localMessages.length > pageSize"
          class="pagination-container"
        >
          <el-pagination
            v-model:current-page="currentPage"
            :page-size="pageSize"
            :total="localMessages.length"
            layout="total, prev, pager, next, jumper"
            size="small"
            background
          />
        </div>
      </div>
    </Transition>

    <PresetMessageEditor
      v-model:visible="editDialogVisible"
      :is-edit-mode="isEditMode"
      :initial-form="editForm"
      :agent-name="props.agentName"
      :user-profile="effectiveUserProfile"
      :agent="props.agent"
      :llm-think-rules="props.agent?.llmThinkRules"
      :rich-text-style-options="props.agent?.richTextStyleOptions"
      @save="handleSaveMessage"
    />

    <input
      ref="importFileInput"
      type="file"
      accept=".json,.yaml,.yml"
      style="display: none"
      @change="handleFileSelected"
    />

    <EditUserProfileDialog
      :visible="showUserProfileDialog"
      :profile="effectiveUserProfile ?? null"
      @update:visible="showUserProfileDialog = $event"
      @save="handleSaveUserProfile"
    />

    <STPresetImportDialog
      v-model:visible="showSTImportDialog"
      :parsed-result="stImportData"
      @confirm="handleConfirmSTImport"
    />

    <AgentPresetBatchDialog
      v-model:visible="showBatchManager"
      :messages="localMessages"
      @save="handleBatchSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRaw } from "vue";
import { useElementSize } from "@vueuse/core";
import { VueDraggableNext } from "vue-draggable-next";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useUserProfileStore } from "../../../stores/userProfileStore";
import { useAnchorRegistry } from "../../../composables/ui/useAnchorRegistry";
import type {
  ChatMessageNode,
  MessageRole,
  UserProfile,
  InjectionStrategy,
} from "../../../types";
import { convertMacros } from "../../../services/sillyTavernParser";
import {
  QuestionFilled,
  Download,
  Upload,
  CopyDocument,
  DocumentCopy,
  Plus,
  ArrowDown,
  Operation,
} from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";
import PresetMessageEditor from "../editors/PresetMessageEditor.vue";
import EditUserProfileDialog from "../../user-profile/EditUserProfileDialog.vue";
import STPresetImportDialog from "./STPresetImportDialog.vue";
import AgentPresetBatchDialog from "./AgentPresetBatchDialog.vue";
import PresetMessageCard from "./PresetMessageCard.vue";
import { usePresetTokenCalculator } from "./usePresetTokenCalculator";
import { usePresetImportExport } from "./usePresetImportExport";
import type {
  LlmThinkRule,
  RichTextRendererStyleOptions,
} from "@/tools/rich-text-renderer/types";
interface Props {
  modelValue?: ChatMessageNode[];
  height?: string;
  compact?: boolean;
  modelId?: string;
  agentName?: string;
  agent?: {
    userProfileId?: string | null;
    llmThinkRules?: LlmThinkRule[];
    richTextStyleOptions?: RichTextRendererStyleOptions;
    [key: string]: any;
  } | null;
}

interface Emits {
  (e: "update:modelValue", value: ChatMessageNode[]): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => [],
  height: "500px",
  compact: false,
  modelId: "",
  agentName: "",
  agent: null,
});

const emit = defineEmits<Emits>();
const userProfileStore = useUserProfileStore();
const anchorRegistry = useAnchorRegistry();
const showUserProfileDialog = ref(false);

const headerRef = ref<HTMLElement | null>(null);
const { width: headerWidth } = useElementSize(headerRef);
const isNarrow = computed(
  () => headerWidth.value > 0 && headerWidth.value < 800
);
const isCollapsed = ref(false);
const containerHeight = computed(() => props.height);

const effectiveUserProfile = computed(
  () =>
    userProfileStore.getEffectiveProfile(props.agent?.userProfileId) ??
    undefined
);

// 本地消息列表
const localMessages = ref<ChatMessageNode[]>([]);
const importFileInput = ref<HTMLInputElement | null>(null);

// 分页
const currentPage = ref(1);
const pageSize = ref(50);

const currentPageMessages = computed({
  get: () => {
    const start = (currentPage.value - 1) * pageSize.value;
    return localMessages.value.slice(start, start + pageSize.value);
  },
  set: (newVal) => {
    const start = (currentPage.value - 1) * pageSize.value;
    const newList = [...localMessages.value];
    newList.splice(start, pageSize.value, ...newVal);
    localMessages.value = newList;
  },
});

// 编辑对话框
const editDialogVisible = ref(false);
const isEditMode = ref(false);
const editingId = ref<string | null>(null);
const editForm = ref<{
  role: MessageRole;
  content: string;
  name?: string;
  injectionStrategy?: InjectionStrategy;
  modelMatch?: { enabled: boolean; patterns: string[] };
}>({
  role: "system",
  content: "",
  name: "",
  injectionStrategy: undefined,
  modelMatch: undefined,
});

const showBatchManager = ref(false);

function syncToParent() {
  emit("update:modelValue", toRaw(localMessages.value));
}

// Token 计算
const { messageTokens, isCalculatingTokens, totalTokens } =
  usePresetTokenCalculator({
    localMessages,
    modelId: computed(() => props.modelId ?? ""),
    agentName: computed(() => props.agentName ?? ""),
    effectiveUserProfile,
    agent: computed(() => props.agent),
    onSyncNeeded: syncToParent,
  });

// 导入导出
const {
  showSTImportDialog,
  stImportData,
  handleExport,
  handleCopy,
  handlePaste,
  handleImport,
  handleFileSelected,
  handleConfirmSTImport,
} = usePresetImportExport({
  localMessages,
  agentName: computed(() => props.agentName ?? ""),
  onSyncToParent: syncToParent,
  importFileInput,
});

// 锚点辅助
function isAnchorType(type?: string): boolean {
  return !!type && type !== "message" && anchorRegistry.hasAnchor(type);
}

// modelValue 同步
watch(
  () => props.modelValue,
  (newValue) => {
    let msgs = [...(newValue || [])];
    let needsSync = false;

    for (const anchor of anchorRegistry.getSystemAnchors()) {
      if (!msgs.some((m) => m.type === anchor.id)) {
        const placeholder: ChatMessageNode = {
          id: `${anchor.id}-placeholder`,
          parentId: null,
          childrenIds: [],
          role: "system",
          content: anchor.defaultTemplate || "",
          type: anchor.id as any,
          status: "complete",
          isEnabled: true,
          timestamp: new Date().toISOString(),
        };
        if (anchor.hasTemplate) {
          msgs.unshift(placeholder);
        } else {
          msgs.push(placeholder);
        }
        needsSync = true;
      }
    }

    localMessages.value = msgs;
    if (needsSync) emit("update:modelValue", msgs);
  },
  { immediate: true, deep: true }
);

function onDragStart() {}
function onDragEnd() {
  emit("update:modelValue", localMessages.value);
}

// 消息操作
function handleAddMessage() {
  isEditMode.value = false;
  editForm.value = {
    role: "system",
    content: "",
    name: "",
    injectionStrategy: undefined,
    modelMatch: undefined,
  };
  editDialogVisible.value = true;
}

function handleEditMessage(message: ChatMessageNode) {
  isEditMode.value = true;
  editingId.value = message.id;
  editForm.value = {
    role: message.role,
    content: message.content,
    name: message.name,
    injectionStrategy: message.injectionStrategy,
    modelMatch: message.modelMatch,
  };
  editDialogVisible.value = true;
}

function handleSaveMessage(form: typeof editForm.value) {
  if (isEditMode.value && editingId.value) {
    const msg = localMessages.value.find((m) => m.id === editingId.value);
    if (msg) Object.assign(msg, form);
  } else {
    const newMsg: ChatMessageNode = {
      id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      parentId: null,
      childrenIds: [],
      ...form,
      status: "complete",
      type: "message",
      isEnabled: true,
      timestamp: new Date().toISOString(),
    };
    const historyIndex = localMessages.value.findIndex(
      (m) => m.type === "chat_history"
    );
    if (historyIndex !== -1) {
      localMessages.value.splice(historyIndex, 0, newMsg);
    } else {
      localMessages.value.push(newMsg);
    }
  }
  editDialogVisible.value = false;
  syncToParent();
}

async function handleCopyMessage(message: ChatMessageNode) {
  try {
    await writeText(
      JSON.stringify(
        {
          role: message.role,
          content: message.content,
          name: message.name,
          injectionStrategy: message.injectionStrategy,
          modelMatch: message.modelMatch,
        },
        null,
        2
      )
    );
    customMessage.success("消息配置已复制");
  } catch {
    customMessage.error("复制失败");
  }
}

async function handlePasteMessage(message: ChatMessageNode) {
  try {
    const text = await readText();
    if (!text) return customMessage.warning("剪贴板为空");

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (typeof data === "object" && data !== null) {
      message.role = data.role || message.role;
      message.content = convertMacros(data.content ?? message.content);
      message.name = data.name || message.name;
      message.injectionStrategy =
        data.injectionStrategy || message.injectionStrategy;
      message.modelMatch = data.modelMatch || message.modelMatch;
      customMessage.success("已粘贴并覆盖消息");
    } else {
      message.content = convertMacros(data);
      customMessage.success("已粘贴文本内容");
    }
    syncToParent();
  } catch {
    customMessage.error("粘贴失败");
  }
}

function handleDeleteMessage(message: ChatMessageNode) {
  if (isAnchorType(message.type)) {
    customMessage.warning("锚点消息不可删除");
    return;
  }
  const index = localMessages.value.findIndex((m) => m.id === message.id);
  if (index !== -1) {
    localMessages.value.splice(index, 1);
    syncToParent();
    customMessage.success("删除成功");
  }
}

function handleToggleEnabled() {
  syncToParent();
}

function handleOpenBatchManager() {
  if (localMessages.value.length === 0) {
    customMessage.warning("暂无消息可管理");
    return;
  }
  showBatchManager.value = true;
}

function handleBatchSave(newMessages: ChatMessageNode[]) {
  localMessages.value = newMessages;
  syncToParent();
  customMessage.success("批量修改已应用");
}

function handleSaveUserProfile(
  updates: Partial<Omit<UserProfile, "id" | "createdAt">>
) {
  if (effectiveUserProfile.value) {
    userProfileStore.updateProfile(effectiveUserProfile.value.id, updates);
  }
  showUserProfileDialog.value = false;
}
</script>

<style scoped>
.agent-preset-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-bottom: var(--border-width) solid var(--border-color);
  flex-wrap: wrap;
  gap: 12px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  padding: 4px 8px;
  margin-left: -8px;
  border-radius: 6px;
  transition: background-color 0.2s;
  flex: 1;
  min-width: 140px;
}

.title-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 100px;
}

.header-title:hover {
  background-color: var(--el-fill-color-light);
}

.collapse-btn {
  padding: 0;
  pointer-events: none;
}
.collapse-btn .el-icon {
  transition: transform 0.3s ease;
}
.collapse-btn .el-icon.is-collapsed {
  transform: rotate(-90deg);
}

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}
.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
}
.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  max-height: 2000px;
}

.token-info {
  margin-left: 8px;
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex: 2;
  min-width: 320px;
}

.editor-header.is-narrow .header-title {
  flex: 1 100%;
}
.editor-header.is-narrow .header-actions {
  flex: 1 1 100%;
  justify-content: flex-start;
}

.messages-container {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.messages-scroll-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  box-sizing: border-box;
}

.pagination-container {
  padding: 8px 16px;
  border-top: var(--border-width) solid var(--border-color);
  background-color: var(--card-bg);
  display: flex;
  justify-content: center;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ghost-message {
  opacity: 0.5;
  background: rgba(var(--el-color-primary-rgb), 0.1);
}

.drag-message {
  opacity: 0.8;
  transform: rotate(2deg);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  transition: none !important;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  min-height: 300px;
}

.agent-preset-editor.compact .messages-scroll-wrapper {
  padding: 8px;
}
.agent-preset-editor.compact .messages-list {
  gap: 8px;
}
.agent-preset-editor.compact .empty-state {
  min-height: 100px;
  font-size: 13px;
}

.el-button {
  margin: 0;
}
</style>
