<script lang="ts">
export interface InputToolbarSettings {
  showTokenUsage: boolean;
  enableMacroParsing: boolean;
  extractBase64FromPaste: boolean;
  groupQuickActionsBySet: boolean;
}
</script>

<script setup lang="ts">
import { ElTooltip, ElPopover, ElIcon } from "element-plus";
import {
  Paperclip,
  AtSign,
  Settings,
  MessageSquare,
  MoreHorizontal,
  Wrench,
} from "lucide-vue-next";
import { MagicStick } from "@element-plus/icons-vue";
import MacroSelector from "../agent/selectors/MacroSelector.vue";
import MiniSessionList from "./MiniSessionList.vue";
import MiniToolCallingSettings from "./MiniToolCallingSettings.vue";
import QuickActionsBar from "./toolbar/QuickActionsBar.vue";
import ToolbarMoreMenu from "./toolbar/ToolbarMoreMenu.vue";
import ToolbarSettingsPopover from "./toolbar/ToolbarSettingsPopover.vue";
import ToolbarStatusCapsules from "./toolbar/ToolbarStatusCapsules.vue";
import type { ContextPreviewData } from "../../types/context";
import type { MacroDefinition } from "../../macro-engine";
import type { ModelIdentifier } from "../../types";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useQuickActionStore } from "../../stores/quickActionStore";
import { useAgentStore } from "../../stores/agentStore";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { useCanvasStore } from "@/tools/web-canvas/stores/canvasStore";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { customMessage } from "@/utils/customMessage";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import { useIsVcpChannel } from "../../composables/useIsVcpChannel";

import type { QuickAction, QuickActionSet } from "../../types/quick-action";
import { computed, ref, onMounted, defineAsyncComponent, watch } from "vue";
import { useChatContext } from "../../composables/chat/useChatContext";

const QuickActionManagerDialog = defineAsyncComponent(
  () => import("../quick-action/QuickActionManagerDialog.vue")
);

const quickActionManagerVisible = ref(false);

interface Props {
  isDetached?: boolean;
  isExpanded: boolean;
  isStreamingEnabled: boolean;
  macroSelectorVisible: boolean;
  contextStats: ContextPreviewData["statistics"] | null;
  tokenCount: number;
  isCalculatingTokens: boolean;
  tokenEstimated: boolean;
  inputText: string;
  isProcessingAttachments: boolean;
  temporaryModel: ModelIdentifier | null;
  hasAttachments: boolean;
  settings: InputToolbarSettings;
  isTranslating?: boolean;
  translationEnabled?: boolean;
  isCompressing?: boolean;
  continuationModel?: ModelIdentifier | null;
  isCompleting?: boolean;
  anyMenuOpen?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isTranslating: false,
  translationEnabled: false,
  isCompressing: false,
  continuationModel: null,
  isCompleting: false,
});

const emit = defineEmits<{
  (e: "toggle-streaming"): void;
  (e: "update:macroSelectorVisible", value: boolean): void;
  (e: "update:anyMenuOpen", value: boolean): void;
  (e: "update:settings", value: InputToolbarSettings): void;
  (e: "insert", macro: MacroDefinition): void;
  (e: "toggle-expand"): void;
  (e: "select-temporary-model"): void;
  (e: "clear-temporary-model"): void;
  (e: "select-continuation-model"): void;
  (e: "clear-continuation-model"): void;
  (e: "execute-quick-action", action: QuickAction): void;
  (e: "translate-input"): void;
  (e: "compress-context"): void;
  (e: "complete-input", content: string): void;
  (e: "convert-paths"): void;
  (e: "cleanup-placeholders"): void;
  (e: "analyze-context-with-input"): void;
  (e: "switch-session", sessionId: string): void;
  (e: "new-session"): void;
  (e: "open-agent-settings", tab?: string): void;
}>();

const context = useChatContext();
const { isSending, disabled } = context.state;
const { send, abort, triggerAttachment } = context.actions;

const { getProfileById } = useLlmProfiles();
const quickActionStore = useQuickActionStore();
const agentStore = useAgentStore();
const profileStore = useUserProfileStore();
const bus = useWindowSyncBus();
const { settings: chatSettings } = useChatSettings();

const isToolCallingEnabled = computed(() => {
  const agent = agentStore.currentAgentId
    ? agentStore.getAgentById(agentStore.currentAgentId)
    : null;
  return agent?.toolCallConfig?.enabled ?? false;
});

const isContextCompressionEnabled = computed(() => {
  const agent = agentStore.currentAgentId
    ? agentStore.getAgentById(agentStore.currentAgentId)
    : null;
  return agent?.parameters?.contextCompression?.enabled ?? false;
});

const effectiveProfileId = computed(() => props.temporaryModel?.profileId);
const { isVcpChannel } = useIsVcpChannel(effectiveProfileId);

onMounted(() => {
  quickActionStore.loadQuickActions();
});

const activeActionSets = computed(() => {
  const globalIds = chatSettings.value.quickActionSetIds || [];
  const agent = agentStore.currentAgentId
    ? agentStore.getAgentById(agentStore.currentAgentId)
    : null;
  const agentIds = agent?.quickActionSetIds || [];
  const effectiveProfile = profileStore.getEffectiveProfile(
    agent?.userProfileId
  );
  const profileIds = effectiveProfile?.quickActionSetIds || [];
  const allIds = Array.from(
    new Set([...globalIds, ...agentIds, ...profileIds])
  );
  if (allIds.length > 0) quickActionStore.ensureSetsLoaded(allIds);
  return allIds
    .map((id) => quickActionStore.loadedSets.get(id))
    .filter(Boolean) as QuickActionSet[];
});

const effectiveUserProfileId = computed(() => {
  const agent = agentStore.currentAgentId
    ? agentStore.getAgentById(agentStore.currentAgentId)
    : null;
  return agent?.userProfileId || profileStore.globalProfileId;
});

watch(
  effectiveUserProfileId,
  (id) => {
    if (id) profileStore.ensureProfileLoaded(id);
  },
  { immediate: true }
);

const continuationModelInfo = computed(() => {
  if (!props.continuationModel) return null;
  const profile = getProfileById(props.continuationModel.profileId);
  if (!profile) return null;
  const model = profile.models.find(
    (m) => m.id === props.continuationModel?.modelId
  );
  if (!model) return null;
  return { profileName: profile.name, modelName: model.name || model.id };
});

const temporaryModelInfo = computed(() => {
  if (!props.temporaryModel) return null;
  const profile = getProfileById(props.temporaryModel.profileId);
  if (!profile) return null;
  const model = profile.models.find(
    (m) => m.id === props.temporaryModel?.modelId
  );
  if (!model) return null;
  return { profileName: profile.name, modelName: model.name || model.id };
});

const onMacroSelectorUpdate = (visible: boolean) => {
  emit("update:macroSelectorVisible", visible);
};

const sessionListVisible = ref(false);
const toolSettingsVisible = ref(false);
const moreMenuVisible = ref(false);
const settingsVisible = ref(false);
const canvasMenuOpen = ref(false);
const miniSessionListRef = ref<any>(null);

const isCanvasEnabled = computed(() => {
  if (!isToolCallingEnabled.value) return false;
  const agent = agentStore.currentAgentId
    ? agentStore.getAgentById(agentStore.currentAgentId)
    : null;
  return agent?.toolCallConfig?.toolToggles?.["web-canvas"] === true;
});

const boundCanvasId = computed(() => {
  const agent = agentStore.currentAgentId
    ? agentStore.getAgentById(agentStore.currentAgentId)
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

// 汇总所有菜单状态并向上同步
watch(
  [
    () => props.macroSelectorVisible,
    sessionListVisible,
    toolSettingsVisible,
    moreMenuVisible,
    settingsVisible,
    canvasMenuOpen,
  ],
  ([macro, session, tool, more, settings, canvas]) => {
    emit(
      "update:anyMenuOpen",
      !!(macro || session || tool || more || settings || canvas)
    );
  }
);

const handleSessionListShow = () => {
  setTimeout(() => miniSessionListRef.value?.scrollToCurrent(), 100);
};

const handleSwitchSession = (sessionId: string) => {
  emit("switch-session", sessionId);
  sessionListVisible.value = false;
};

const handleNewSession = () => {
  emit("new-session");
  sessionListVisible.value = false;
};

const handleOpenAdvanced = (tab: string | undefined) => {
  toolSettingsVisible.value = false;
  if (props.isDetached) {
    bus.requestAction("llm-chat:open-agent-settings", { tab });
    customMessage.info("正在主窗口中打开智能体设置...");
  } else {
    emit("open-agent-settings", tab);
  }
};

const handleOpenQuickActionManager = () => {
  if (props.isDetached) {
    bus.requestAction("llm-chat:open-quick-action-manager", {});
    customMessage.info("正在主窗口中打开快捷操作管理...");
  } else {
    quickActionManagerVisible.value = true;
  }
};
</script>

<template>
  <div class="input-toolbar-container">
    <!-- 快捷操作平铺栏 -->
    <QuickActionsBar
      v-if="activeActionSets.length > 0"
      :active-action-sets="activeActionSets"
      :group-quick-actions-by-set="props.settings.groupQuickActionsBySet"
      @execute-quick-action="emit('execute-quick-action', $event)"
    />

    <div class="input-bottom-bar">
      <div class="tool-actions">
        <!-- 流式输出 -->
        <el-tooltip
          :content="
            props.isStreamingEnabled
              ? '流式输出：实时显示生成内容'
              : '非流式输出：等待完整响应'
          "
          placement="top"
          :show-after="500"
        >
          <button
            class="streaming-icon-button"
            :class="{ active: props.isStreamingEnabled }"
            @click="emit('toggle-streaming')"
          >
            <span class="typewriter-icon">A_</span>
          </button>
        </el-tooltip>

        <!-- 宏选择器 -->
        <el-tooltip content="添加宏变量" placement="top" :show-after="1500">
          <div>
            <el-popover
              :visible="props.macroSelectorVisible"
              @update:visible="onMacroSelectorUpdate"
              placement="bottom-start"
              :width="300"
              trigger="click"
              :popper-class="[
                'macro-selector-popover',
                { 'detached-popover': props.isDetached },
              ]"
            >
              <template #reference>
                <button
                  class="macro-icon-button"
                  :class="{ active: props.macroSelectorVisible }"
                >
                  <el-icon><MagicStick /></el-icon>
                </button>
              </template>
              <MacroSelector
                @insert="(macro: MacroDefinition) => emit('insert', macro)"
              />
            </el-popover>
          </div>
        </el-tooltip>

        <!-- 添加附件 -->
        <el-tooltip content="添加附件" placement="top" :show-after="500">
          <button class="attachment-button" @click="triggerAttachment?.()">
            <el-icon><Paperclip /></el-icon>
          </button>
        </el-tooltip>

        <!-- 会话列表 -->
        <el-tooltip content="切换会话" placement="top" :show-after="2500">
          <div>
            <el-popover
              v-model:visible="sessionListVisible"
              placement="bottom-start"
              :width="300"
              trigger="click"
              :popper-class="[
                'session-list-popover',
                { 'detached-popover': props.isDetached },
              ]"
              @show="handleSessionListShow"
            >
              <template #reference>
                <button
                  class="tool-btn"
                  :class="{ active: sessionListVisible }"
                >
                  <MessageSquare :size="16" />
                </button>
              </template>
              <MiniSessionList
                ref="miniSessionListRef"
                @switch="handleSwitchSession"
                @new-session="handleNewSession"
              />
            </el-popover>
          </div>
        </el-tooltip>

        <!-- 临时模型选择器 -->
        <el-tooltip content="临时指定模型" placement="top" :show-after="500">
          <button class="tool-btn" @click="emit('select-temporary-model')">
            <AtSign :size="16" />
          </button>
        </el-tooltip>

        <!-- 更多工具菜单 -->
        <ToolbarMoreMenu
          :is-detached="props.isDetached"
          :input-text="props.inputText"
          :is-sending="isSending"
          :is-completing="props.isCompleting"
          :disabled="disabled"
          :translation-enabled="props.translationEnabled"
          :is-translating="props.isTranslating"
          :is-compressing="props.isCompressing"
          :is-context-compression-enabled="isContextCompressionEnabled"
          :continuation-model-info="continuationModelInfo"
          @complete-input="emit('complete-input', $event)"
          @select-continuation-model="emit('select-continuation-model')"
          @translate-input="emit('translate-input')"
          @compress-context="emit('compress-context')"
          @convert-paths="emit('convert-paths')"
          @cleanup-placeholders="emit('cleanup-placeholders')"
          @analyze-context-with-input="emit('analyze-context-with-input')"
          @open-quick-action-manager="handleOpenQuickActionManager"
          @visible-change="moreMenuVisible = $event"
        >
          <button class="tool-btn" :class="{ active: moreMenuVisible }">
            <MoreHorizontal :size="16" />
          </button>
        </ToolbarMoreMenu>

        <!-- 工具调用设置 -->
        <el-tooltip
          :content="
            isVcpChannel
              ? 'VCP 后端接管工具调用（点击查看详情）'
              : '工具调用设置'
          "
          placement="top"
          :show-after="500"
        >
          <div>
            <el-popover
              v-model:visible="toolSettingsVisible"
              :placement="props.isDetached ? 'bottom' : 'top'"
              :width="360"
              trigger="click"
              :popper-class="[
                'tool-settings-popover',
                { 'detached-popover': props.isDetached },
              ]"
            >
              <template #reference>
                <button
                  class="tool-btn"
                  :class="{
                    active:
                      !isVcpChannel &&
                      (toolSettingsVisible || isToolCallingEnabled),
                    'vcp-active':
                      isVcpChannel &&
                      (toolSettingsVisible || isToolCallingEnabled),
                    'is-vcp': isVcpChannel,
                  }"
                >
                  <Wrench :size="16" />
                </button>
              </template>
              <MiniToolCallingSettings
                :is-vcp="isVcpChannel"
                @open-advanced="handleOpenAdvanced"
              />
            </el-popover>
          </div>
        </el-tooltip>

        <!-- 工具栏设置 -->
        <ToolbarSettingsPopover
          :is-detached="props.isDetached"
          :settings="props.settings"
          @update:settings="emit('update:settings', $event)"
          @visible-change="settingsVisible = $event"
        >
          <button
            class="tool-btn settings-btn"
            :class="{ active: settingsVisible }"
          >
            <Settings :size="16" />
          </button>
        </ToolbarSettingsPopover>

        <!-- 展开/收起 -->
        <el-tooltip
          v-if="!props.isDetached"
          :content="props.isExpanded ? '收起输入框' : '展开输入框'"
          placement="top"
          :show-after="500"
        >
          <button
            class="expand-toggle-button"
            :class="{ active: props.isExpanded }"
            @click="emit('toggle-expand')"
          >
            <svg
              v-if="!props.isExpanded"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
              />
            </svg>
            <svg
              v-else
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
              />
            </svg>
          </button>
        </el-tooltip>

        <!-- 处理中提示 -->
        <span v-if="props.isProcessingAttachments" class="processing-hint">
          正在处理文件...
        </span>
        <span v-if="props.isCompressing" class="processing-hint compressing">
          <el-icon class="is-loading"
            ><svg
              xmlns="http://www.w3.org/2000/svg"
              width="1em"
              height="1em"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
              ></path>
            </svg>
          </el-icon>
          正在压缩上下文...
        </span>
      </div>

      <div class="input-actions">
        <!-- 状态胶囊区域 -->
        <ToolbarStatusCapsules
          :is-detached="props.isDetached"
          :continuation-model-info="continuationModelInfo"
          :temporary-model-info="temporaryModelInfo"
          :is-canvas-enabled="isCanvasEnabled"
          :canvas-binding-info="canvasBindingInfo"
          :has-canvas-pending-changes="hasCanvasPendingChanges"
          :show-token-usage="props.settings.showTokenUsage"
          :context-stats="props.contextStats"
          :token-count="props.tokenCount"
          :is-calculating-tokens="props.isCalculatingTokens"
          :token-estimated="props.tokenEstimated"
          @clear-continuation-model="emit('clear-continuation-model')"
          @clear-temporary-model="emit('clear-temporary-model')"
          @canvas-visible-change="canvasMenuOpen = $event"
        />

        <!-- 停止 & 发送 -->
        <button
          v-show="isSending"
          @click="abort?.()"
          class="btn-abort"
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
  </div>

  <!-- 快捷操作管理弹窗 -->
  <QuickActionManagerDialog v-model:visible="quickActionManagerVisible" />
</template>

<style scoped>
.processing-hint {
  font-size: 12px;
  color: var(--primary-color);
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  white-space: nowrap;
}

.input-toolbar-container {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.input-bottom-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px 4px 2px;
  flex-wrap: wrap;
  gap: 4px 0;
}

.tool-actions {
  display: flex;
  gap: 2px;
  align-items: center;
  color: var(--text-color-light);
  flex-wrap: wrap;
  min-width: 0;
  flex: 1 1 auto;
}

.streaming-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.streaming-icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.typewriter-icon {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
    Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -2px;
  color: var(--text-color-secondary);
  transition: all 0.3s ease;
  position: relative;
  top: -1.5px;
  display: inline-block;
}

.streaming-icon-button:not(.active) .typewriter-icon {
  color: var(--text-color-secondary);
  opacity: 0.5;
}

.streaming-icon-button:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.streaming-icon-button:not(.active):hover:not(:disabled) .typewriter-icon {
  opacity: 0.8;
}

.streaming-icon-button.active .typewriter-icon {
  color: var(--primary-color);
  opacity: 1;
  text-shadow:
    0 0 4px rgba(var(--primary-color-rgb, 64, 158, 255), 0.5),
    0 0 6px rgba(var(--primary-color-rgb, 64, 158, 255), 0.3);
}

@keyframes cursor-blink {
  0%,
  49% {
    opacity: 0.5;
  }
  50%,
  100% {
    opacity: 0.2;
  }
}

.streaming-icon-button.active .typewriter-icon::after {
  content: "";
  display: inline-block;
  width: 2px;
  height: 12px;
  background-color: var(--primary-color);
  margin-left: 0px;
  animation: cursor-blink 1s infinite;
  vertical-align: baseline;
  position: relative;
  bottom: -1px;
}

.input-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: auto;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn-send,
.btn-abort {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-send {
  background-color: var(--primary-color);
  color: white;
}

.btn-send:hover:not(:disabled) {
  background-color: var(--primary-hover-color);
  transform: translateY(-1px);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-abort {
  background-color: var(--error-color);
  color: white;
}

.btn-abort:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.tool-btn,
.macro-icon-button,
.attachment-button,
.expand-toggle-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
  color: var(--text-color-secondary);
  font-size: 16px;
}

.tool-btn:disabled,
.macro-icon-button:disabled,
.attachment-button:disabled,
.expand-toggle-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tool-btn:hover:not(:disabled),
.macro-icon-button:hover:not(:disabled),
.attachment-button:hover:not(:disabled),
.expand-toggle-button:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent);
  color: var(--text-color-primary);
}

.tool-btn.is-loading {
  cursor: wait;
  opacity: 0.7;
}

.tool-btn.vcp-active {
  color: #8b5cf6;
}

.tool-btn.vcp-active:hover {
  color: #7c3aed;
  background-color: color-mix(in srgb, #8b5cf6 10%, transparent);
}

.macro-icon-button.active,
.expand-toggle-button.active {
  color: var(--primary-color);
}

.tool-btn.active {
  color: var(--primary-color);
}
</style>

<style>
.macro-selector-popover {
  max-height: 70vh !important;
  overflow: hidden !important;
}

.macro-selector-popover .el-popover__body {
  padding: 12px;
  max-height: calc(70vh - 24px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.macro-selector-popover .macro-selector {
  max-height: 100%;
  overflow: hidden;
}

.macro-selector-popover .macro-selector-body {
  max-height: calc(70vh - 100px);
  overflow-y: auto;
}

.macro-tooltip-popper.el-popper {
  max-width: min(320px, 60vw) !important;
  line-height: 1.5 !important;
  white-space: normal !important;
  word-break: break-word !important;
  padding: 8px 12px !important;
}

.detached-popover.macro-selector-popover {
  max-height: 320px !important;
}

.detached-popover.macro-selector-popover .el-popover__body {
  max-height: calc(320px - 24px);
}

.detached-popover.macro-selector-popover .macro-selector-body {
  max-height: calc(320px - 100px);
}

.toolbar-settings-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--text-color);
}

.session-list-popover {
  padding: 0 !important;
}

.session-list-popover .el-popover__body {
  padding: 0;
}

.detached-popover,
.detached-dropdown-menu {
  background-color: var(--card-bg-solid) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3) !important;
}

.macro-tooltip-popper.is-light {
  background-color: var(--card-bg-solid) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color-primary) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
}

.macro-tooltip-popper.is-light .el-popper__arrow::before {
  background-color: var(--card-bg-solid) !important;
  border: 1px solid var(--border-color) !important;
}

.detached-popover :deep(.el-popover__title) {
  color: var(--text-color-primary) !important;
}

.detached-dropdown-menu :deep(.el-dropdown-menu) {
  background-color: transparent !important;
  background: none !important;
}

.detached-dropdown-menu :deep(.el-dropdown-menu__item) {
  color: var(--text-color-primary);
}

.detached-dropdown-menu :deep(.el-dropdown-menu__item:hover) {
  background-color: rgba(var(--primary-color-rgb), 0.1) !important;
  color: var(--primary-color) !important;
}

.detached-dropdown-menu :deep(.dropdown-divider) {
  background-color: var(--primary-color-alpha) !important;
  opacity: 0.3;
}
</style>
