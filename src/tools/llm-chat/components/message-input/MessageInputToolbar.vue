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

<script lang="ts">
// Re-export for backward compatibility
export type { InputToolbarSettings } from "../../stores/messageInputStore";
</script>

<script setup lang="ts">
import { useLlmChatUiState } from "@/tools/llm-chat/composables/ui/useLlmChatUiState";
import { useResizeObserver } from "@vueuse/core";
import { MoreHorizontal, LoaderCircle, Brush } from "lucide-vue-next";
import MacroInputPanel from "./MacroInputPanel.vue";
import MiniCanvasControl from "./MiniCanvasControl.vue";
import MiniSessionList from "./MiniSessionList.vue";
import MiniToolCallingSettings from "./MiniToolCallingSettings.vue";
import QuickActionsBar from "./toolbar/QuickActionsBar.vue";
import ToolbarMoreMenu from "./toolbar/ToolbarMoreMenu.vue";
import InputSettingsPanel from "./toolbar/InputSettingsPanel.vue";
import { useMessageInputPanel } from "../../composables/input/useMessageInputPanel";
import ToolbarStatusCapsules from "./toolbar/ToolbarStatusCapsules.vue";
import KnowledgeReferencePanel from "./KnowledgeReferencePanel.vue";
import type { ContextPreviewData } from "../../types/context";
import { useQuickActionStore } from "../../stores/quickActionStore";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import ToolbarActionButton from "./toolbar/ToolbarActionButton.vue";
import {
  resolveInputToolbarActions,
  type ToolbarAction,
} from "./toolbar/inputToolbarActions";
import {
  normalizeInputToolbarLayout,
  partitionToolbarActions,
  visibleToolbarActionCount,
} from "../../config/inputToolbar";
import { useActiveQuickActionSets } from "../../composables/input/useActiveQuickActionSets";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useCanvasStore } from "@/tools/web-canvas/stores/canvasStore";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { customMessage } from "@/utils/customMessage";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import { useIsVcpChannel } from "../../composables/useIsVcpChannel";
import { useMessageInputStore } from "../../stores/messageInputStore";

import {
  computed,
  ref,
  onMounted,
  onBeforeUnmount,
  defineAsyncComponent,
  watch,
  type Component,
} from "vue";
import { storeToRefs } from "pinia";
import { useChatContext } from "../../composables/chat/useChatContext";

const QuickActionManagerDialog = defineAsyncComponent(
  () => import("../quick-action/QuickActionManagerDialog.vue")
);

const quickActionManagerVisible = ref(false);

interface Props {
  isDetached?: boolean;
  isExpanded: boolean;
  isStreamingEnabled: boolean;
  contextStats: ContextPreviewData["statistics"] | null;
  inputText: string;
  isProcessingAttachments: boolean;
  hasAttachments: boolean;
  isTranslating?: boolean;
  translationEnabled?: boolean;
  isCompressing?: boolean;
  isCompleting?: boolean;
  isInputHeightLocked?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isTranslating: false,
  translationEnabled: false,
  isCompressing: false,
  isCompleting: false,
  isInputHeightLocked: false,
});

const emit = defineEmits<{
  (e: "toggle-streaming"): void;
  (e: "toggle-expand"): void;
  (e: "unlock-input-height"): void;
  (e: "open-agent-settings", tab?: string): void;
}>();

const context = useChatContext();
const { isSending, disabled } = context.state;
const { send, abort, triggerAttachment } = context.actions;

const inputStore = useMessageInputStore();
const panel = useMessageInputPanel();
const {
  moreMenuVisible,
  toolbarCustomizeVisible,
  settings: inputSettings,
} = storeToRefs(inputStore);

const { currentAgentId } = useLlmChatUiState();
const quickActionStore = useQuickActionStore();
const agentStore = useAgentStore();
const toolbarErrorHandler = createModuleErrorHandler("InputToolbar");
const bus = useWindowSyncBus();
const { settings: chatSettings } = useChatSettings();

const isToolCallingEnabled = computed(() => {
  const agent = currentAgentId.value
    ? agentStore.getAgentById(currentAgentId.value)
    : null;
  return agent?.toolCallConfig?.enabled ?? false;
});

const isContextCompressionEnabled = computed(() => {
  const agent = currentAgentId.value
    ? agentStore.getAgentById(currentAgentId.value)
    : null;
  return agent?.parameters?.contextCompression?.enabled ?? false;
});

const effectiveProfileId = computed(() => inputStore.temporaryModel?.profileId);
const { isVcpChannel } = useIsVcpChannel(effectiveProfileId);

onMounted(() => {
  quickActionStore.loadQuickActions();
});

const activeActionSets = useActiveQuickActionSets();

const isCanvasEnabled = computed(() => {
  if (!isToolCallingEnabled.value) return false;
  const agent = currentAgentId.value
    ? agentStore.getAgentById(currentAgentId.value)
    : null;
  return agent?.toolCallConfig?.toolToggles?.["web-canvas"] === true;
});

const boundCanvasId = computed(() => {
  const agent = currentAgentId.value
    ? agentStore.getAgentById(currentAgentId.value)
    : null;
  return agent?.toolCallConfig?.toolSettings?.["web-canvas"]?.canvasId || null;
});

watch(
  [isCanvasEnabled, boundCanvasId],
  ([enabled, canvasId]) => {
    if (enabled && canvasId) useCanvasStore().loadCanvasList();
  },
  { immediate: true }
);

const hasCanvasPendingChanges = computed(() => {
  if (!boundCanvasId.value) return false;
  try {
    const canvas = useCanvasStore().canvasList.find(
      (c: any) => c.metadata.id === boundCanvasId.value
    );
    return (canvas?.dirtyFileCount || 0) > 0;
  } catch {
    return false;
  }
});

const canvasBindingInfo = computed(() => {
  if (!boundCanvasId.value) return null;
  try {
    const canvas = useCanvasStore().canvasList.find(
      (c: any) => c.metadata.id === boundCanvasId.value
    );
    return canvas
      ? { id: boundCanvasId.value, name: canvas.metadata.name }
      : null;
  } catch {
    return null;
  }
});

const handleOpenAdvanced = (tab: string | undefined) => {
  panel.close();
  if (props.isDetached) {
    bus.requestAction("llm-chat:open-agent-settings", { tab });
    customMessage.info("正在主窗口中打开智能体设置...");
  } else {
    emit("open-agent-settings", tab);
  }
};

const handleOpenQuickActionManager = () => {
  panel.close();
  if (props.isDetached) {
    bus.requestAction("llm-chat:open-quick-action-manager", {});
    customMessage.info("正在主窗口中打开快捷操作管理...");
  } else {
    quickActionManagerVisible.value = true;
  }
};

const toolActionsRef = ref<HTMLElement>();
const bottomBarRef = ref<HTMLElement>();
const moreButtonRef = ref<HTMLButtonElement>();
const moreMenuRef = ref<InstanceType<typeof ToolbarMoreMenu>>();
const availableWidth = ref(0);
const bottomWidth = ref(0);
useResizeObserver(toolActionsRef, (entries) => {
  availableWidth.value = entries[0]?.contentRect.width ?? 0;
});
useResizeObserver(bottomBarRef, (entries) => {
  bottomWidth.value = entries[0]?.contentRect.width ?? 0;
});
const compactStatistics = computed(() => bottomWidth.value < 650);
const layout = computed(() =>
  normalizeInputToolbarLayout(chatSettings.value.uiPreferences.inputToolbar)
);
const openPanel = computed(() => panel.activePanel.value?.id);
const panelComponents: Partial<Record<ToolbarAction["id"], Component>> = {
  macro: MacroInputPanel,
  sessions: MiniSessionList,
  "tool-settings": MiniToolCallingSettings,
  knowledge: KnowledgeReferencePanel,
  "input-settings": InputSettingsPanel,
};
const actions = computed(() =>
  resolveInputToolbarActions({
    disabled: disabled.value,
    hasAgent: Boolean(currentAgentId.value),
    hasText: Boolean(props.inputText.trim()),
    hasAttachments: props.hasAttachments,
    isSending: isSending.value,
    isCompleting: props.isCompleting,
    isTranslating: inputStore.isTranslating,
    isCompressing: inputStore.isCompressing,
    translationEnabled: props.translationEnabled,
    compressionEnabled: isContextCompressionEnabled.value,
    isDetached: Boolean(props.isDetached),
    isExpanded: props.isExpanded,
    isStreamingEnabled: props.isStreamingEnabled,
    isInputHeightLocked: props.isInputHeightLocked,
    hasClipboardDraft: inputStore.hasClipboardDraft,
    toolCallingEnabled: isToolCallingEnabled.value,
    isVcpChannel: isVcpChannel.value,
    knowledgeCount: inputStore.knowledgeReference?.libraryIds.length ?? 0,
    temporaryModelName: inputStore.temporaryModelInfo?.modelName,
    continuationModelName: inputStore.continuationModelInfo?.modelName,
    openPanel: openPanel.value,
  }).map((action) =>
    action.kind === "panel"
      ? {
          ...action,
          controls: panel.contentId,
          expanded:
            panel.activePanel.value?.id === action.id && !panel.collapsed.value,
        }
      : action
  )
);
const actionPlacement = computed(() =>
  partitionToolbarActions(actions.value, layout.value.pinnedActionIds)
);
const visiblePinnedCount = computed(() =>
  visibleToolbarActionCount(
    availableWidth.value,
    actionPlacement.value.pinned.length
  )
);
const pinnedActions = computed(() =>
  actionPlacement.value.pinned.slice(0, visiblePinnedCount.value)
);
const overflowActions = computed(() =>
  actionPlacement.value.pinned.slice(visiblePinnedCount.value)
);
const hasCollectedActivity = computed(() =>
  [...actionPlacement.value.menu, ...overflowActions.value].some(
    (action) =>
      action.busy ||
      (action.id === "tool-settings" &&
        (action.active || isVcpChannel.value)) ||
      (action.id === "knowledge" && action.active)
  )
);
function closePanels() {
  panel.close();
}
function openCanvasPanel(anchor: HTMLElement) {
  if (!isCanvasEnabled.value) return;
  moreMenuRef.value?.close();
  panel.toggle(
    {
      id: "canvas",
      title: "画布管理",
      icon: Brush,
      component: MiniCanvasControl,
    },
    () => (anchor.isConnected ? anchor : moreButtonRef.value)
  );
}
async function executeAction(action: ToolbarAction, anchor?: HTMLElement) {
  const current = actions.value.find((item) => item.id === action.id);
  if (!current || !current.visible || current.disabled) return;
  moreMenuRef.value?.close();
  const component = panelComponents[action.id];
  if (component) {
    panel.toggle(
      {
        id: action.id,
        title: action.label,
        icon: action.icon,
        component,
        scroll:
          action.id === "sessions" || action.id === "macro"
            ? "content"
            : action.id === "tool-settings" || action.id === "knowledge"
              ? "layout"
              : "host",
        props:
          action.id === "tool-settings"
            ? { isVcp: isVcpChannel }
            : action.id === "knowledge"
              ? { disabled }
              : undefined,
      },
      () => (anchor?.isConnected ? anchor : moreButtonRef.value)
    );
    return;
  }
  try {
    switch (action.id) {
      case "streaming":
        emit("toggle-streaming");
        break;
      case "expand":
        emit("toggle-expand");
        break;
      case "attachment":
        await triggerAttachment?.();
        break;
      case "temporary-model":
        panel.close();
        await inputStore.handleSelectTemporaryModel();
        break;
      case "complete":
        await inputStore.handleCompleteInput(props.inputText);
        break;
      case "continuation-model":
        panel.close();
        await inputStore.handleSelectContinuationModel();
        break;
      case "translate":
        await inputStore.handleTranslateInput();
        break;
      case "compress":
        await inputStore.handleCompressContext();
        break;
      case "convert-paths":
        await inputStore.handleConvertPaths();
        break;
      case "cleanup-placeholders":
        inputStore.handleCleanupPlaceholders();
        break;
      case "analyze-context":
        panel.close();
        await inputStore.handleAnalyzeContextWithInput();
        break;
      case "cut-draft":
        inputStore.handleCutDraft();
        break;
      case "paste-draft":
        inputStore.handlePasteDraft();
        break;
      case "unlock-height":
        emit("unlock-input-height");
        break;
    }
  } catch (error) {
    toolbarErrorHandler.error(error, "操作执行失败，请重试");
  }
}
function openInputSettings() {
  const action = actions.value.find((item) => item.id === "input-settings");
  if (action) void executeAction(action);
}
async function openCustomizer() {
  moreMenuRef.value?.close();
  closePanels();
  try {
    if (props.isDetached || bus.windowType === "detached-component") {
      await bus.requestAction("llm-chat:open-toolbar-customizer", {});
      customMessage.info("已在主窗口打开工具栏设置");
    } else toolbarCustomizeVisible.value = true;
  } catch (error) {
    toolbarErrorHandler.error(error, "打开工具栏设置失败，请重试");
  }
}
watch(isCanvasEnabled, (enabled) => {
  if (!enabled && panel.activePanel.value?.id === "canvas") panel.close();
});
defineExpose({ openCustomizer, openAdvanced: handleOpenAdvanced });
onBeforeUnmount(closePanels);
</script>

<template>
  <div
    class="input-toolbar-container"
    @contextmenu.self.prevent="openCustomizer"
  >
    <QuickActionsBar
      v-if="activeActionSets.length"
      :active-action-sets="activeActionSets"
      :group-quick-actions-by-set="inputSettings.groupQuickActionsBySet"
      @execute-quick-action="inputStore.handleQuickAction($event)"
    />
    <div ref="bottomBarRef" class="input-bottom-bar">
      <div
        ref="toolActionsRef"
        class="tool-actions"
        @contextmenu.self.prevent="openCustomizer"
      >
        <ToolbarActionButton
          v-for="action in pinnedActions"
          :key="action.id"
          :action="action"
          @execute="executeAction"
        />
        <ToolbarMoreMenu
          ref="moreMenuRef"
          :is-detached="props.isDetached"
          :actions="actionPlacement.menu"
          :overflow-actions="overflowActions"
          :statistics="
            compactStatistics &&
            inputSettings.showTokenUsage &&
            (inputStore.tokenCount > 0 ||
              (props.contextStats?.totalTokenCount ?? 0) > 0)
              ? {
                  contextTokens: props.contextStats?.totalTokenCount,
                  inputTokens: inputStore.tokenCount,
                  contextEstimated: props.contextStats?.isEstimated,
                  inputEstimated: inputStore.tokenEstimated,
                }
              : undefined
          "
          @execute="executeAction"
          @open-input-settings="openInputSettings"
          @open-quick-action-manager="handleOpenQuickActionManager"
          @customize="openCustomizer"
          @visible-change="moreMenuVisible = $event"
        >
          <button
            ref="moreButtonRef"
            type="button"
            class="more-button"
            :class="{ active: moreMenuVisible }"
            aria-label="更多工具"
            title="更多工具"
            data-testid="chat-toolbar-more"
            :aria-expanded="moreMenuVisible"
            aria-haspopup="menu"
          >
            <MoreHorizontal :size="16" /><span
              v-if="hasCollectedActivity"
              class="activity-dot"
            ></span>
          </button>
        </ToolbarMoreMenu>
      </div>
      <div class="input-actions">
        <div
          class="toolbar-statuses"
          :style="{ maxWidth: Math.max(80, bottomWidth * 0.42) + 'px' }"
        >
          <ToolbarStatusCapsules
            :is-detached="props.isDetached"
            :compact="compactStatistics"
            :is-canvas-enabled="isCanvasEnabled"
            :canvas-binding-info="canvasBindingInfo"
            :has-canvas-pending-changes="hasCanvasPendingChanges"
            :context-stats="props.contextStats"
            @open-canvas="openCanvasPanel"
          />
        </div>
        <!-- 停止 & 发送 -->
        <button
          v-show="isSending"
          @click="abort?.()"
          class="btn-abort"
          data-testid="chat-stop-generation"
          title="停止生成"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          </svg>
        </button>
        <button
          @click="send?.()"
          :disabled="
            disabled || (!props.inputText.trim() && !props.hasAttachments)
          "
          class="btn-send"
          data-testid="chat-send-message"
          title="发送 (Ctrl/Cmd + Enter)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      </div>
    </div>
    <div
      v-if="props.isProcessingAttachments || props.isCompressing"
      class="processing-status"
      role="status"
    >
      <span v-if="props.isProcessingAttachments">正在处理文件…</span
      ><span v-if="props.isCompressing"
        ><LoaderCircle :size="12" class="spinner" />正在压缩上下文…</span
      >
    </div>
  </div>
  <QuickActionManagerDialog v-model:visible="quickActionManagerVisible" />
</template>

<style scoped>
.input-toolbar-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}
.input-bottom-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 2px;
  min-width: 0;
}
.tool-actions {
  display: flex;
  gap: 2px;
  align-items: center;
  flex: 1 1 auto;
  min-width: 32px;
  overflow: hidden;
}
.more-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
}
.more-button.active,
.more-button:hover {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  color: var(--primary-color);
}
.more-button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}
.activity-dot {
  position: absolute;
  right: 5px;
  top: 4px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--primary-color);
}
.input-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 auto;
  min-width: 28px;
  max-width: calc(100% - 42px);
}
.toolbar-statuses {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}
.toolbar-statuses :deep(.temporary-model-indicator) {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.toolbar-statuses :deep(.model-name) {
  min-width: 0;
  flex: 1;
}
.toolbar-statuses :deep(svg),
.toolbar-statuses :deep(.clear-btn) {
  flex: none;
}
.btn-send,
.btn-abort {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-send {
  background: var(--primary-color);
  color: var(--el-color-white);
}
.btn-send:hover:not(:disabled) {
  background: var(--primary-hover-color);
}
.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-abort {
  background: var(--error-color);
  color: var(--el-color-white);
}
.btn-abort:hover {
  opacity: 0.85;
}
.processing-status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--text-color-secondary);
}
.processing-status > span {
  display: flex;
  align-items: center;
  gap: 4px;
}
.spinner {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<style>
.detached-popover,
.detached-dropdown-menu {
  background: var(--card-bg-solid) !important;
  border: 1px solid var(--border-color) !important;
}
.detached-dropdown-menu .el-dropdown-menu {
  background: transparent;
}
.detached-dropdown-menu .el-dropdown-menu__item {
  color: var(--text-color-primary);
}
.detached-dropdown-menu .el-dropdown-menu__item:hover {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}
</style>
