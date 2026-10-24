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
import { useLlmChatUiState } from "@/tools/llm-chat/composables/ui/useLlmChatUiState";
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  defineAsyncComponent,
} from "vue";
import { useResizeObserver } from "@vueuse/core";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { ElMessageBox, ElTooltip, ElPopover } from "element-plus";
import BranchSelector from "./BranchSelector.vue";
import {
  ChevronLeft,
  ChevronRight,
  XCircle,
  MoreHorizontal,
  SlidersHorizontal,
  ChevronsLeftRight,
  ChevronsRightLeft,
} from "lucide-vue-next";
import type {
  ChatMessageNode,
  ChatSessionDetail,
  ChatSessionIndex,
  ButtonVisibility,
  TranslationDisplayMode,
} from "../../types";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useModelReselection } from "../../composables/ui/useModelReselection";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";
import ExportBranchDialog from "../export/ExportBranchDialog.vue";
import MessageDataEditor from "./MessageDataEditor.vue";
import MessageToolbarAction from "./MessageToolbarAction.vue";
import {
  resolveMessageToolbarActions,
  type MessageToolbarAction as ToolbarAction,
} from "./messageToolbarActions";
import { normalizeMessageToolbarLayout } from "../../config/messageToolbar";
import { partitionToolbarActions } from "../../config/inputToolbar";
import type {
  MessageToolbarLayout,
  MessageToolbarActionId,
} from "../../types/message-toolbar";

const MessageToolbarCustomizeDialog = defineAsyncComponent(
  () => import("./MessageToolbarCustomizeDialog.vue")
);

interface Props {
  message: ChatMessageNode;
  isSending: boolean;
  siblings: ChatMessageNode[];
  currentSiblingIndex: number;
  buttonVisibility?: ButtonVisibility;
  /** 消息所属会话；为空时回退当前选中会话 */
  sessionDetail?: ChatSessionDetail | null;
  sessionIndex?: ChatSessionIndex | null;
}
interface Emits {
  (e: "copy"): void;
  (e: "edit"): void;
  (e: "create-branch"): void;
  (e: "delete"): void;
  (e: "regenerate", options?: { modelId?: string; profileId?: string }): void;
  (e: "continue", options?: { modelId?: string; profileId?: string }): void;
  (e: "toggle-enabled"): void;
  (e: "switch", direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
  (e: "abort"): void;
  (e: "analyze-context"): void;
  (e: "translate", targetLang?: string): void;
  (e: "toggle-translation-visible"): void;
  (e: "change-translation-mode", mode: TranslationDisplayMode): void;
  (
    e: "reparse-tools",
    options?: { modelId?: string; profileId?: string }
  ): void;
  (e: "screenshot"): void;
}

const agentStore = useAgentStore();
const { getTemporaryModelPayload, openModelReselectDialog } =
  useModelReselection();
const { settings, saveMessageToolbarLayout } = useChatSettings();
const bus = useWindowSyncBus();

const props = withDefaults(defineProps<Props>(), {
  buttonVisibility: () => ({
    copy: true,
    edit: true,
    createBranch: true,
    delete: true,
    regenerate: true,
    toggleEnabled: true,
    abort: true,
    analyzeContext: true,
    exportBranch: true,
    moreMenu: true,
    translate: true,
  }),
});
const emit = defineEmits<Emits>();

const store = useLlmChatStore();
const logger = createModuleLogger("MessageMenubar");

// 会话作用域：优先使用传入的会话，未传入时回退当前选中会话
const scopedSessionDetail = computed(
  () => props.sessionDetail ?? store.currentSessionDetail
);
const scopedSessionIndex = computed(
  () => props.sessionIndex ?? store.currentSession
);
const scopedFullSession = computed(() => {
  const index = scopedSessionIndex.value;
  const detail = scopedSessionDetail.value;
  if (!index || !detail) return null;
  return { index, detail };
});

// 复制状态
const copied = ref(false);

// 导出对话框
const showExportDialog = ref(false);

// 数据编辑对话框
const showDataEditor = ref(false);

// 计算属性
const isDisabled = computed(() => props.message.isEnabled === false);
const isGenerating = computed(() => store.isNodeGenerating(props.message.id));
const isPresetDisplay = computed(
  () => props.message.metadata?.isPresetDisplay === true
);

// 变量快照
const sessionVariableSnapshot = computed(
  () => props.message.metadata?.sessionVariableSnapshot
);
const hasVariables = computed(() => !!sessionVariableSnapshot.value);

// 复制消息
const copyMessage = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content);
    emit("copy");
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    logger.error("复制失败", error);
  }
};
// 其他操作
const handleEdit = () => emit("edit");
const handleCreateBranch = () => emit("create-branch");
const handleDelete = async () => {
  // 硬删除需要二次确认
  try {
    await ElMessageBox.confirm(
      "删除后将无法恢复，且所有分支回复也会被删除。",
      "确定要永久删除这条消息吗？",
      {
        confirmButtonText: "确定删除",
        cancelButtonText: "取消",
        type: "warning",
        confirmButtonClass: "el-button--danger",
        lockScroll: false,
      }
    );
    // 用户确认后才执行删除
    emit("delete");
  } catch {
    // 用户取消，不做任何操作
  }
};
const { currentAgentId } = useLlmChatUiState();

const handleContinue = () => {
  // 检查是否有临时模型
  const temporaryModel = getTemporaryModelPayload();

  if (temporaryModel) {
    emit("continue", temporaryModel);
  } else {
    emit("continue");
  }
};

// 切换模型续写
const handleContinueWithModel = async () => {
  const result = await openModelReselectDialog(props.message.metadata);
  if (result) {
    emit("continue", {
      modelId: result.model.id,
      profileId: result.profile.id,
    });
  }
};

const handleRegenerate = () => {
  // 检查是否有临时模型
  const temporaryModel = getTemporaryModelPayload();

  if (temporaryModel) {
    emit("regenerate", temporaryModel);
  } else {
    emit("regenerate");
  }
};

// 切换模型重新生成
const handleRegenerateWithModel = async () => {
  // 尝试定位当前消息使用的模型，如果消息没有记录（如 User 消息），则回退到当前智能体的模型
  const result = await openModelReselectDialog(props.message.metadata);
  if (result) {
    emit("regenerate", {
      modelId: result.model.id,
      profileId: result.profile.id,
    });
  }
  // result 为 null 表示用户取消选择，不做任何操作
};
const handleToggleEnabled = () => emit("toggle-enabled");
const handleReparseTools = () => {
  // 检查是否有临时模型，确保渠道判断使用正确的 profileId
  const temporaryModel = getTemporaryModelPayload();

  if (temporaryModel) {
    emit("reparse-tools", temporaryModel);
  } else {
    emit("reparse-tools");
  }
};
const handleAbort = () => {
  logger.info("停止按钮点击", {
    nodeId: props.message.id,
    role: props.message.role,
    isGenerating: isGenerating.value,
  });
  emit("abort");
};
// 翻译是否正在显示
const isTranslationVisible = computed(() => {
  return props.message.metadata?.translation?.visible === true;
});

// 是否有翻译内容
const hasTranslation = computed(() => {
  return !!props.message.metadata?.translation?.content;
});

const handleTranslationCommand = (command: string) => {
  if (command === "toggle-visible") {
    // 如果没有翻译内容，触发翻译；否则切换显示状态
    if (!hasTranslation.value) {
      emit("translate");
    } else {
      emit("toggle-translation-visible");
    }
  } else if (command === "retry") {
    // 重试时，优先使用当前已有的目标语言，确保重试操作的一致性
    const currentLang = props.message.metadata?.translation?.targetLang;
    emit("translate", currentLang);
  } else if (command.startsWith("mode-")) {
    const mode = command.replace("mode-", "") as TranslationDisplayMode;
    emit("change-translation-mode", mode);
  } else if (command.startsWith("lang-")) {
    const lang = command.replace("lang-", "");
    emit("translate", lang);
  }
};
const handleAnalyzeContext = () => {
  logger.info("上下文分析按钮点击", {
    nodeId: props.message.id,
    role: props.message.role,
  });
  emit("analyze-context");
};

// 重新计算 Token 数
const handleRecalculateTokens = async () => {
  const fullSession = scopedFullSession.value;
  if (!fullSession) return;

  logger.info("重新计算 Token", { nodeId: props.message.id });

  try {
    await store.recalculateNodeTokens(
      fullSession.index,
      fullSession.detail,
      props.message.id
    );
    customMessage.success("Token 重新计算完成");
    logger.info("Token 重新计算完成", { nodeId: props.message.id });
  } catch (error) {
    logger.error("重新计算 Token 失败", error, { nodeId: props.message.id });
    customMessage.error("重新计算失败");
  }
};

// 获取当前预设消息列表
const currentPresetMessages = computed(() => {
  if (!currentAgentId.value) return [];
  const agent = agentStore.getAgentById(currentAgentId.value);
  if (!agent?.presetMessages) return [];
  return agent.presetMessages.filter(
    (msg: ChatMessageNode) =>
      msg.isEnabled !== false && msg.type !== "chat_history"
  );
});

// 计算预设消息数量
const presetCount = computed(() => {
  return currentPresetMessages.value.length;
});

// 分支快速切换相关
const showBranchPopover = ref(false);

// 处理切换到指定分支
const handleSwitchToBranch = (nodeId: string) => {
  showBranchPopover.value = false;
  emit("switch-branch", nodeId);
};

// 快捷键翻译逻辑
const handleTranslateClick = (e: MouseEvent) => {
  // 如果按下了 Shift/Ctrl/Alt 键，直接触发默认翻译
  if (e.shiftKey || e.ctrlKey || e.altKey) {
    e.stopPropagation(); // 阻止 Dropdown 展开
    customMessage.success(
      `快速翻译中 (${settings.value.translation.messageTargetLang})`
    );
    emit("translate");
    return;
  }
  // 普通点击，允许冒泡给 Dropdown
};

const toolbarElement = ref<HTMLElement>();
const widthScope = ref<HTMLElement>();
const messageSlot = ref<HTMLElement>();
const availableWidth = ref<number>();
onMounted(() => {
  messageSlot.value =
    toolbarElement.value?.closest<HTMLElement>(".message-slot") ?? undefined;
  widthScope.value =
    messageSlot.value ?? toolbarElement.value?.parentElement ?? undefined;
});
useResizeObserver(widthScope, ([entry]) => {
  availableWidth.value = Math.max(0, entry.contentRect.width - 12);
});

// content-visibility 的绘制隔离需要覆盖换行后的完整工具栏，保持消息布局高度不变。
useResizeObserver(toolbarElement, ([entry]) => {
  const height =
    entry.borderBoxSize[0]?.blockSize ??
    entry.target.getBoundingClientRect().height;
  messageSlot.value?.style.setProperty(
    "--message-toolbar-clip-margin",
    Math.max(48, Math.ceil(height) + 12) + "px"
  );
});
onBeforeUnmount(() => {
  messageSlot.value?.style.removeProperty("--message-toolbar-clip-margin");
});

const layout = computed(() =>
  normalizeMessageToolbarLayout(settings.value.uiPreferences.messageToolbar)
);
const availableActions = computed(() =>
  resolveMessageToolbarActions({
    role: props.message.role,
    generating: isGenerating.value,
    preset: isPresetDisplay.value,
    disabled: isDisabled.value,
    copied: copied.value,
    translationEnabled: settings.value.translation.enabled,
    translationVisible: isTranslationVisible.value,
    hasVariables: hasVariables.value,
    variablesChanged: !!sessionVariableSnapshot.value?.changes?.length,
    buttons: props.buttonVisibility,
  })
);
const partition = computed(() =>
  partitionToolbarActions(availableActions.value, layout.value.pinnedActionIds)
);
const directActions = computed(() =>
  layout.value.expanded
    ? [...partition.value.pinned, ...partition.value.menu]
    : partition.value.pinned
);
const menuActions = computed(() =>
  layout.value.expanded ? [] : partition.value.menu
);
const showMore = ref(false);
const actionPopupOpen = ref(false);
const showCustomizer = ref(false);
const savingLayout = ref(false);
const persistLayout = async (next: MessageToolbarLayout) => {
  if (bus.windowType === "main") await saveMessageToolbarLayout(next);
  else
    await bus.requestAction("llm-chat:update-message-toolbar-layout", {
      layout: next,
    });
};
const toggleExpanded = async () => {
  if (savingLayout.value) return;
  savingLayout.value = true;
  try {
    await persistLayout({ ...layout.value, expanded: !layout.value.expanded });
  } catch {
    customMessage.error("工具栏布局保存失败，请重试");
  } finally {
    savingLayout.value = false;
  }
};
const customize = () => {
  showMore.value = false;
  showCustomizer.value = true;
};
const handlers: Partial<Record<MessageToolbarActionId, () => void>> = {
  copy: copyMessage,
  edit: handleEdit,
  "create-branch": handleCreateBranch,
  delete: handleDelete,
  regenerate: handleRegenerate,
  "regenerate-model": handleRegenerateWithModel,
  "toggle-enabled": handleToggleEnabled,
  continue: handleContinue,
  "continue-model": handleContinueWithModel,
  "analyze-context": handleAnalyzeContext,
  export: () => {
    showExportDialog.value = true;
  },
  screenshot: () => emit("screenshot"),
  "recalculate-tokens": handleRecalculateTokens,
  "reparse-tools": handleReparseTools,
  "edit-data": () => {
    showDataEditor.value = true;
  },
};
const invoke = (action: ToolbarAction) => {
  if (action.disabled) return;
  showMore.value = false;
  handlers[action.id]?.();
};
</script>

<template>
  <div
    ref="toolbarElement"
    class="message-menubar"
    :class="{
      'has-open-popover': showMore || showBranchPopover || actionPopupOpen,
    }"
    :style="availableWidth ? { maxWidth: availableWidth + 'px' } : undefined"
    role="group"
    aria-label="消息操作"
    data-testid="message-toolbar"
  >
    <!-- Branch control (if applicable) -->
    <div v-if="siblings.length > 1" class="branch-control">
      <el-tooltip content="上一个版本" placement="top" :show-after="500">
        <button
          type="button"
          class="menu-btn"
          aria-label="上一个版本"
          :disabled="currentSiblingIndex === 0"
          @click="emit('switch', 'prev')"
        >
          <ChevronLeft :size="16" />
        </button>
      </el-tooltip>

      <!-- 分支选择器 Popover -->
      <el-popover
        v-model:visible="showBranchPopover"
        placement="top"
        :width="360"
        trigger="click"
        popper-class="llm-chat-branch-selector-popover"
      >
        <template #reference>
          <div class="branch-indicator-wrapper">
            <el-tooltip
              content="点击查看分支列表"
              placement="top"
              :show-after="500"
            >
              <button
                type="button"
                aria-label="查看分支列表"
                class="branch-indicator clickable"
                :class="{ 'popover-active': showBranchPopover }"
              >
                {{ currentSiblingIndex + 1 }} / {{ siblings.length }}
              </button>
            </el-tooltip>
          </div>
        </template>
        <BranchSelector
          v-if="showBranchPopover"
          :siblings="siblings"
          :current-sibling-index="currentSiblingIndex"
          @switch-branch="handleSwitchToBranch"
        />
      </el-popover>
      <el-tooltip content="下一个版本" placement="top" :show-after="500">
        <button
          type="button"
          class="menu-btn"
          aria-label="下一个版本"
          :disabled="currentSiblingIndex === siblings.length - 1"
          @click="emit('switch', 'next')"
        >
          <ChevronRight :size="16" />
        </button>
      </el-tooltip>
    </div>

    <MessageToolbarAction
      v-for="action in directActions"
      :key="action.id"
      :action="action"
      :message="message"
      @invoke="invoke(action)"
      @translation-command="handleTranslationCommand"
      @translate-click="handleTranslateClick"
      @popup-change="actionPopupOpen = $event"
    />
    <ElTooltip
      v-if="isGenerating && props.buttonVisibility.abort"
      content="终止生成"
      placement="top"
      :show-after="500"
    >
      <button
        type="button"
        class="menu-btn menu-btn-abort"
        aria-label="终止生成"
        @click="handleAbort"
      >
        <XCircle :size="16" />
      </button>
    </ElTooltip>
    <ElTooltip
      :content="layout.expanded ? '收起操作' : '展开全部操作'"
      placement="top"
      :show-after="500"
    >
      <button
        type="button"
        class="menu-btn"
        :aria-label="layout.expanded ? '收起操作' : '展开全部操作'"
        :aria-expanded="layout.expanded"
        :disabled="savingLayout"
        data-testid="message-toolbar-toggle"
        @click="toggleExpanded"
      >
        <ChevronsRightLeft
          v-if="layout.expanded"
          :size="16"
        /><ChevronsLeftRight v-else :size="16" />
      </button>
    </ElTooltip>
    <ElPopover
      v-model:visible="showMore"
      trigger="click"
      placement="top-end"
      :width="248"
      :show-arrow="false"
      popper-class="llm-chat-message-toolbar-popover"
    >
      <template #reference>
        <button
          type="button"
          class="menu-btn"
          :class="{ 'is-active': showMore }"
          aria-label="更多消息操作"
          :aria-expanded="showMore"
          data-testid="message-toolbar-more"
        >
          <MoreHorizontal :size="16" />
        </button>
      </template>
      <div
        class="overflow-menu"
        role="group"
        aria-label="更多消息操作"
        @keydown.esc.stop="showMore = false"
      >
        <div v-if="menuActions.length" class="overflow-actions">
          <MessageToolbarAction
            v-for="action in menuActions"
            :key="action.id"
            :action="action"
            :message="message"
            in-menu
            @invoke="invoke(action)"
            @translation-command="handleTranslationCommand"
            @translate-click="handleTranslateClick"
            @popup-change="actionPopupOpen = $event"
          />
        </div>
        <button
          type="button"
          class="customize-action"
          :class="{ 'has-divider': menuActions.length }"
          data-testid="message-toolbar-customize"
          @click="customize"
        >
          <SlidersHorizontal :size="16" /><span>自定义工具栏…</span>
        </button>
      </div>
    </ElPopover>
    <MessageToolbarCustomizeDialog
      v-if="showCustomizer"
      v-model="showCustomizer"
      :layout="layout"
      :save-layout="persistLayout"
    />
    <!-- 导出对话框 -->
    <ExportBranchDialog
      v-model:visible="showExportDialog"
      :preset-count="presetCount"
      :session="scopedSessionDetail"
      :session-index="scopedSessionIndex"
      :message-id="props.message.id"
      :preset-messages="currentPresetMessages"
      @screenshot="emit('screenshot')"
    />

    <!-- 数据编辑对话框 -->
    <MessageDataEditor
      v-model="showDataEditor"
      :message-id="props.message.id"
      :session-detail="scopedSessionDetail"
    />
  </div>
</template>

<style scoped>
.message-menubar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  width: max-content;
  max-width: 100%;
  box-sizing: border-box;
  padding: 4px;
  border-radius: 8px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  box-shadow: var(--el-box-shadow-lighter);
}
.branch-control {
  display: flex;
  align-items: center;
  flex: none;
  gap: 2px;
  padding-right: 4px;
  border-right: 1px solid var(--border-color);
}
.branch-indicator {
  font: inherit;
  font-size: 12px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--text-color-light);
  min-width: 40px;
  text-align: center;
  white-space: nowrap;
  border-radius: 4px;
  cursor: pointer;
}
.branch-indicator:hover,
.branch-indicator.popover-active {
  background: var(--hover-bg);
  color: var(--text-color);
}
.menu-btn {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-light);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.menu-btn:hover:enabled,
.menu-btn.is-active {
  background: var(--hover-bg);
  color: var(--text-color);
}
.menu-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.menu-btn-abort {
  background: var(--error-color);
  color: var(--el-color-white);
}
.menu-btn-abort:hover:enabled {
  background: var(--error-color);
  color: var(--el-color-white);
  opacity: 0.8;
}
.menu-btn:focus-visible,
.branch-indicator:focus-visible,
.customize-action:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.overflow-menu {
  color: var(--text-color);
}
.overflow-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(420px, 55vh);
  overflow-y: auto;
  padding: 2px;
}
.overflow-actions > :deep(.el-dropdown) {
  width: 100%;
}
.customize-action {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-light);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.customize-action.has-divider {
  margin-top: 6px;
  border-top: 1px solid var(--border-color);
  border-radius: 0 0 6px 6px;
  padding-top: 12px;
}
.customize-action:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}
@media (prefers-reduced-motion: reduce) {
  .menu-btn {
    transition: none;
  }
}
</style>
