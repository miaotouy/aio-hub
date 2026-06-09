<template>
  <div class="agent-preset-editor" :class="{ compact: props.compact }">
    <!-- 头部操作栏 + 预设组面板 共用容器 -->
    <div v-if="!props.compact" class="header-group">
      <PresetGroupPanel
        :preset-groups="presetGroups"
        :local-messages="localMessages"
        @update:preset-groups="handlePresetGroupsUpdate"
        @update:local-messages="localMessages = $event"
        @sync="syncToParent"
        @edit-message="handleEditMessage"
      />
      <div
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
          <el-tooltip
            content="从文件导入预设"
            placement="top"
            :show-after="300"
          >
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
    </div>
    <Transition name="collapse">
      <div
        v-show="!isCollapsed || props.compact"
        class="messages-container"
        :style="{ height: containerHeight }"
      >
        <div class="messages-scroll-wrapper">
          <div
            v-if="props.compact && presetGroups.length > 0"
            class="compact-group-switches"
          >
            <div class="compact-group-switches-header">
              <span>消息组</span>
              <el-tag size="small" type="info" effect="plain">
                {{ presetGroups.length }}
              </el-tag>
            </div>

            <div class="compact-group-switch-list">
              <div
                v-for="group in presetGroups"
                :key="group.id"
                class="compact-group-switch-row"
                :class="{ 'is-disabled': group.enabled === false }"
              >
                <div class="compact-group-main">
                  <span class="compact-group-name" :title="group.name">
                    {{ group.name }}
                  </span>
                  <div class="compact-group-meta">
                    <el-tag
                      size="small"
                      :type="
                        group.selectionMode === 'radio' ? 'warning' : 'info'
                      "
                      effect="plain"
                    >
                      {{ group.selectionMode === "radio" ? "单选" : "多选" }}
                    </el-tag>
                    <span class="compact-group-count">
                      {{ getPresetGroupStats(group.id).enabled }}/{{
                        getPresetGroupStats(group.id).total
                      }}
                    </span>
                  </div>
                </div>
                <el-switch
                  v-model="group.enabled"
                  size="small"
                  @change="handlePresetGroupToggle(group)"
                />
              </div>
            </div>
          </div>

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
                element.presetAttachments,
                messageTokens.get(element.id),
                element.groupId,
                presetGroups,
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
                :preset-groups="presetGroups"
                :on-radio-change="handleRadioChange"
                @edit="handleEditMessage"
                @copy="handleCopyMessage"
                @duplicate="handleDuplicateMessage"
                @paste="handlePasteMessage"
                @delete="handleDeleteMessage"
                @toggle-enabled="handleToggleEnabled"
                @group-command="handleGroupCommand"
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
      :preset-groups="presetGroups"
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

    <PresetGroupEditDialog
      v-model:visible="createGroupDialogVisible"
      @save="handleGroupDialogSave"
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
  PresetAttachmentRef,
} from "../../../types";
import type { PresetMessageGroup } from "../../../types/agent";
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
import PresetGroupPanel from "./PresetGroupPanel.vue";
import PresetGroupEditDialog from "./PresetGroupEditDialog.vue";
import PresetMessageEditor from "../editors/PresetMessageEditor.vue";
import EditUserProfileDialog from "../../user-profile/EditUserProfileDialog.vue";
import STPresetImportDialog from "./STPresetImportDialog.vue";
import AgentPresetBatchDialog from "./AgentPresetBatchDialog.vue";
import PresetMessageCard from "./PresetMessageCard.vue";
import { usePresetTokenCalculator } from "./usePresetTokenCalculator";
import { usePresetImportExport } from "./usePresetImportExport";
import {
  applyPresetGroupEnabledState,
  cleanupPresetMessageGroupRefs,
  getPresetGroupMessageStats,
  resolvePresetMessageGroupId,
} from "./presetGroupState";
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
// 预设消息组 computed（双向绑定到 agent.presetGroups）
const presetGroups = computed<PresetMessageGroup[]>({
  get: () => props.agent?.presetGroups || [],
  set: (val) => {
    if (props.agent) props.agent.presetGroups = val;
  },
});

function getMessageGroup(groupId?: string): PresetMessageGroup | undefined {
  if (!groupId) return undefined;
  return presetGroups.value.find((g) => g.id === groupId);
}

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
  groupId?: string;
  injectionStrategy?: InjectionStrategy;
  presetAttachments?: PresetAttachmentRef[];
  modelMatch?: { enabled: boolean; patterns: string[] };
}>({
  role: "system",
  content: "",
  name: "",
  groupId: undefined,
  injectionStrategy: undefined,
  presetAttachments: undefined,
  modelMatch: undefined,
});
const createGroupDialogVisible = ref(false);
const pendingGroupJoinMsg = ref<ChatMessageNode | null>(null);

const showBatchManager = ref(false);

function syncToParent() {
  cleanupPresetMessageGroupRefs(localMessages.value, presetGroups.value);
  emit("update:modelValue", toRaw(localMessages.value));
}

function createPresetMessageId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
  presetGroups,
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

    if (cleanupPresetMessageGroupRefs(msgs, presetGroups.value)) {
      needsSync = true;
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
    groupId: undefined,
    injectionStrategy: undefined,
    presetAttachments: undefined,
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
    groupId: resolvePresetMessageGroupId(message.groupId, presetGroups.value),
    injectionStrategy: message.injectionStrategy,
    presetAttachments: message.presetAttachments
      ? [...message.presetAttachments]
      : undefined,
    modelMatch: message.modelMatch,
  };
  editDialogVisible.value = true;
}

function handleSaveMessage(form: typeof editForm.value) {
  const normalizedForm = {
    ...form,
    groupId: resolvePresetMessageGroupId(form.groupId, presetGroups.value),
  };

  if (isEditMode.value && editingId.value) {
    const msg = localMessages.value.find((m) => m.id === editingId.value);
    if (msg) Object.assign(msg, normalizedForm);
  } else {
    const newMsg: ChatMessageNode = {
      id: createPresetMessageId(),
      parentId: null,
      childrenIds: [],
      ...normalizedForm,
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

function handleDuplicateMessage(message: ChatMessageNode) {
  if (isAnchorType(message.type)) {
    customMessage.warning("锚点消息不可复制");
    return;
  }

  const index = localMessages.value.findIndex((m) => m.id === message.id);
  if (index === -1) {
    customMessage.error("未找到要复制的消息");
    return;
  }

  const now = new Date().toISOString();
  const duplicate: ChatMessageNode = {
    ...JSON.parse(JSON.stringify(toRaw(message))),
    id: createPresetMessageId(),
    parentId: null,
    childrenIds: [],
    lastSelectedChildId: undefined,
    timestamp: now,
    updatedAt: now,
  };

  localMessages.value.splice(index + 1, 0, duplicate);
  syncToParent();
  customMessage.success("已复制到下方");
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

// === 预设组联动逻辑 ===

function getPresetGroupStats(groupId: string) {
  return getPresetGroupMessageStats(groupId, localMessages.value);
}

function handlePresetGroupToggle(group: PresetMessageGroup) {
  applyPresetGroupEnabledState(group, localMessages.value);
  syncToParent();
}

function handlePresetGroupsUpdate(groups: PresetMessageGroup[]) {
  presetGroups.value = groups;
  cleanupPresetMessageGroupRefs(localMessages.value, presetGroups.value);
}

function handleRadioChange(targetMsg: ChatMessageNode) {
  const group = getMessageGroup(targetMsg.groupId);
  if (!group || group.selectionMode !== "radio") return;
  localMessages.value.forEach((msg) => {
    if (msg.groupId === targetMsg.groupId) {
      msg.isEnabled = msg.id === targetMsg.id;
      if (msg.metadata) delete msg.metadata.lastEnabledState;
    }
  });
  syncToParent();
}

function handleGroupCommand(msg: ChatMessageNode, cmd: string) {
  if (cmd === "leave") {
    msg.groupId = undefined;
    if (msg.metadata) delete msg.metadata.lastEnabledState;
    syncToParent();
  } else if (cmd.startsWith("move:")) {
    const targetGroupId = cmd.slice(5);
    const targetGroup = getMessageGroup(targetGroupId);
    if (!targetGroup) {
      msg.groupId = undefined;
      if (msg.metadata) delete msg.metadata.lastEnabledState;
      syncToParent();
      return;
    }

    msg.groupId = targetGroupId;
    if (targetGroup && !targetGroup.enabled && msg.isEnabled !== false) {
      msg.isEnabled = false;
      if (!msg.metadata) msg.metadata = {} as any;
      msg.metadata!.lastEnabledState = true;
    }
    if (targetGroup?.selectionMode === "radio") {
      handleRadioChange(msg);
    } else {
      syncToParent();
    }
  } else if (cmd === "new") {
    pendingGroupJoinMsg.value = msg;
    createGroupDialogVisible.value = true;
  }
}

function handleGroupDialogSave(
  groupData: Omit<PresetMessageGroup, "id"> & { id?: string }
) {
  const newGroup: PresetMessageGroup = {
    ...groupData,
    id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
  };
  presetGroups.value = [...presetGroups.value, newGroup];
  if (pendingGroupJoinMsg.value) {
    pendingGroupJoinMsg.value.groupId = newGroup.id;
    pendingGroupJoinMsg.value = null;
  }
  syncToParent();
  customMessage.success(`已创建组"${newGroup.name}"`);
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

.header-group {
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
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
.compact-group-switches {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

.compact-group-switches-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.compact-group-switch-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.compact-group-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--input-bg);
}

.compact-group-switch-row.is-disabled {
  opacity: 0.65;
}

.compact-group-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.compact-group-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-group-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.compact-group-count {
  font-size: 12px;
  color: var(--text-color-light);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
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
