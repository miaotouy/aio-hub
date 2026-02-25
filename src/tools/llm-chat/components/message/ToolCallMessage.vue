<script setup lang="ts">
import { computed, ref, provide, watch, nextTick } from "vue";
import { useResizeObserver, useClipboard } from "@vueuse/core";
import type { ChatMessageNode, ChatSession, TranslationDisplayMode, ButtonVisibility } from "../../types";
import type { Asset } from "@/types/asset-management";
import {
  Terminal,
  Hash,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertCircle,
  Play,
  Languages,
  MessageSquareText,
} from "lucide-vue-next";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import { useAgentStore } from "../../stores/agentStore";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { processMessageAssetsSync } from "../../utils/agentAssetUtils";
import { customMessage } from "@/utils/customMessage";
import { useTranslation } from "../../composables/chat/useTranslation";
import {
  resolveRawRules,
  filterRulesByRole,
  filterRulesByDepth,
  processRulesWithMacros,
} from "../../utils/chatRegexUtils";
import { createMacroContext } from "../../macro-engine/MacroContext";
import type { ChatRegexRule } from "../../types/chatRegex";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import MessageMenubar from "./MessageMenubar.vue";
import ChatCodeMirrorEditor from "../message-input/ChatCodeMirrorEditor.vue";

interface Props {
  session: ChatSession | null;
  message: ChatMessageNode;
  messageDepth?: number;
  isEditing?: boolean;
  isTranslating?: boolean;
  translationContent?: string;
  richTextStyleOptions?: any;
  buttonVisibility?: ButtonVisibility;
  isSending?: boolean;
}

interface Emits {
  (e: "delete"): void;
  (e: "regenerate", options?: { modelId?: string; profileId?: string }): void;
  (e: "switch-sibling", direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
  (e: "toggle-enabled"): void;
  (e: "edit", newContent: string, attachments?: Asset[]): void;
  (e: "copy"): void;
  (e: "abort"): void;
  (e: "continue", options?: { modelId?: string; profileId?: string }): void;
  (e: "create-branch"): void;
  (e: "analyze-context"): void;
  (e: "save-to-branch", newContent: string, attachments?: Asset[]): void;
  (e: "cancel-edit"): void;
  (
    e: "update-translation",
    translation: NonNullable<NonNullable<ChatMessageNode["metadata"]>["translation"]> | undefined
  ): void;
  (e: "resize", el: HTMLElement | null): void;
}

const props = withDefaults(defineProps<Props>(), {
  messageDepth: 0,
  isEditing: false,
  isTranslating: false,
  isSending: false,
  translationContent: "",
});
const emit = defineEmits<Emits>();

const { settings } = useChatSettings();
const agentStore = useAgentStore();
const chatStore = useLlmChatStore();
const userProfileStore = useUserProfileStore();
const { copy } = useClipboard();
const { translateText } = useTranslation();

const isCollapsed = ref(true);
const editingContent = ref("");
const editorRef = ref<any>(null);

const toggleCollapse = () => {
  if (props.isEditing) return; // 编辑模式不允许折叠
  isCollapsed.value = !isCollapsed.value;
};

// 提供消息 ID 给后代组件
provide("messageId", props.message.id);
provide("chatSettings", settings);

// ===== 布局与背景逻辑 =====
const messageRef = ref<HTMLElement | null>(null);
const messageHeight = ref(0);
const containerWidth = ref(0);
const BLOCK_SIZE = 2000;

useResizeObserver(messageRef, (entries) => {
  const entry = entries[0];
  const { height, width } = entry.contentRect;
  messageHeight.value = height;
  containerWidth.value = width;
});

const backgroundBlocks = computed(() => {
  if (messageHeight.value <= 0) return 1;
  return Math.ceil(messageHeight.value / BLOCK_SIZE);
});

// ===== 工具状态与元数据 =====
const toolCall = computed(() => props.message.metadata?.toolCall);

const statusIcon = computed(() => {
  if (!toolCall.value) return Terminal;
  switch (toolCall.value.status) {
    case "success":
      return Play;
    case "error":
      return AlertCircle;
    case "denied":
      return AlertCircle;
    default:
      return Terminal;
  }
});

const statusClass = computed(() => {
  if (!toolCall.value) return "status-pending";
  return `status-${toolCall.value.status}`;
});

const formattedTime = computed(() => {
  if (!props.message.timestamp) return "";
  return new Date(props.message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
});

const currentAgent = computed(() => {
  const agentId = props.message.metadata?.agentId ?? agentStore.currentAgentId ?? undefined;
  return agentId ? agentStore.getAgentById(agentId) : undefined;
});

// ===== 内容解析与正则规则 =====
const resolveAsset = (content: string) => {
  return processMessageAssetsSync(content, currentAgent.value);
};

const activeRules = computed(() => {
  const agentId = props.message.metadata?.agentId ?? agentStore.currentAgentId ?? undefined;
  const userProfileId = props.message.metadata?.userProfileId ?? userProfileStore.globalProfileId ?? undefined;

  const agent = agentId ? agentStore.getAgentById(agentId) : undefined;
  const userProfile = userProfileId ? userProfileStore.getProfileById(userProfileId) : userProfileStore.globalProfile;
  const globalConfig = settings.value.regexConfig;

  const rawRules = resolveRawRules("render", globalConfig, agent?.regexConfig, userProfile?.regexConfig);
  const roleFiltered = filterRulesByRole(rawRules, props.message.role);
  return filterRulesByDepth(roleFiltered, props.messageDepth);
});

const processedRules = ref<ChatRegexRule[]>([]);

watch(
  [activeRules, () => props.session, () => props.message.metadata],
  async ([rules, session]) => {
    if (!rules || rules.length === 0) {
      processedRules.value = [];
      return;
    }
    const macroContext = createMacroContext({
      agent: currentAgent.value,
      userProfile: userProfileStore.globalProfile ?? undefined,
      session: session ?? undefined,
    });
    processedRules.value = await processRulesWithMacros(rules, macroContext);
  },
  { immediate: true }
);

// ===== 翻译显示逻辑 =====
const displayMode = computed<TranslationDisplayMode>(() => {
  if (props.isTranslating) return "both";
  return props.message.metadata?.translation?.displayMode || "both";
});

const showOriginal = computed(() => {
  if (props.isEditing) return false;
  const translationHidden = props.message.metadata?.translation?.visible === false;
  if ((!props.message.metadata?.translation && !props.isTranslating) || (translationHidden && !props.isTranslating)) {
    return true;
  }
  return displayMode.value === "original" || displayMode.value === "both";
});

const showTranslation = computed(() => {
  if (props.isEditing) return false;
  const isVisible = props.isTranslating || props.message.metadata?.translation?.visible !== false;
  const hasContent = !!(props.message.metadata?.translation || props.isTranslating || props.translationContent);
  return isVisible && hasContent && (displayMode.value === "translation" || displayMode.value === "both");
});

const isWideLayout = computed(() => {
  return containerWidth.value > 800 && displayMode.value === "both" && showTranslation.value;
});

// ===== 翻译与重试逻辑 =====
const handleTranslate = async (targetLang?: string) => {
  if (props.isTranslating) return;

  const content = props.message.content;
  if (!content.trim()) {
    customMessage.warning("消息内容为空，无法翻译");
    return;
  }

  const lang = targetLang || settings.value.translation.messageTargetLang || "Chinese";

  try {
    const result = await translateText(
      content,
      () => {
        // 这里的流式内容处理通常在父组件或 store 中维护
      },
      undefined,
      lang
    );

    const translation = {
      content: result,
      targetLang: lang,
      modelIdentifier: settings.value.translation.modelIdentifier,
      timestamp: Date.now(),
      displayMode: "both" as const,
      visible: true,
    };

    emit("update-translation", translation);
  } catch (error) {
    // 错误由 useTranslation 处理
  }
};

// ===== 编辑逻辑 =====
const initEditMode = () => {
  editingContent.value = props.message.content;
  isCollapsed.value = false; // 进入编辑模式强制展开
  nextTick(() => {
    if (editorRef.value) {
      editorRef.value.focus();
      const len = editingContent.value.length;
      editorRef.value.setSelectionRange(len, len);
    }
  });
};

const saveEdit = () => {
  if (editingContent.value.trim()) {
    emit("edit", editingContent.value, []); // 工具消息暂不支持附件编辑，传空数组对齐接口
  }
};

const cancelEdit = () => {
  emit("cancel-edit");
};

const onSaveToBranch = (newContent: string) => {
  emit("save-to-branch", newContent, []);
};

const handleCopyArgs = () => {
  if (toolCall.value?.rawArgs) {
    copy(JSON.stringify(toolCall.value.rawArgs, null, 2));
    customMessage.success("已复制输入参数");
  }
};

watch(
  () => props.isEditing,
  (newVal) => {
    if (newVal) initEditMode();
  }
);

// ===== 菜单栏相关计算 =====
const siblings = computed(() => {
  if (!props.session || !props.message.parentId) return [props.message];
  const parent = props.session.nodes[props.message.parentId];
  if (!parent) return [props.message];
  return parent.childrenIds.map((id) => props.session!.nodes[id]).filter(Boolean);
});

const currentSiblingIndex = computed(() => {
  return siblings.value.findIndex((s) => s.id === props.message.id);
});

const isGenerating = computed(() => props.isSending || chatStore.isNodeGenerating(props.message.id));

// 事件处理函数（对齐 ChatMessage.vue，避免模板中的隐式 any）
const onRegenerate = (options?: { modelId?: string; profileId?: string }) => emit("regenerate", options);
const onContinue = (options?: { modelId?: string; profileId?: string }) => emit("continue", options);
const onSwitchSibling = (direction: "prev" | "next") => emit("switch-sibling", direction);
const onSwitchBranch = (nodeId: string) => emit("switch-branch", nodeId);
const onChangeTranslationMode = (mode: TranslationDisplayMode) => {
  if (!props.message.metadata?.translation) return;
  emit("update-translation", { ...props.message.metadata.translation, displayMode: mode });
};
const onToggleTranslationVisible = () => {
  if (!props.message.metadata?.translation) return;
  emit("update-translation", {
    ...props.message.metadata.translation,
    visible: !props.message.metadata.translation.visible,
  });
};

const getElement = () => messageRef.value;

defineExpose({
  getElement,
});
</script>

<template>
  <div
    ref="messageRef"
    class="tool-call-message"
    :class="{ 'is-disabled': message.isEnabled === false, 'is-editing': isEditing }"
  >
    <!-- 背景层 -->
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

    <!-- 装饰性侧边栏 -->
    <div class="tool-bar" :class="statusClass">
      <div class="bar-line"></div>
      <div class="bar-icon" @click="toggleCollapse">
        <component :is="statusIcon" :size="14" />
      </div>
      <div class="bar-line"></div>
    </div>

    <div class="tool-content-wrapper" :class="{ 'is-wide-layout': isWideLayout }">
      <!-- 头部信息 -->
      <div class="tool-header" @click="toggleCollapse">
        <div class="header-left">
          <div class="collapse-icon">
            <ChevronDown v-if="!isCollapsed" :size="14" />
            <ChevronRight v-else :size="14" />
          </div>
          <span class="role-badge tool" :class="statusClass">
            <Terminal :size="12" />
            工具
          </span>
          <span v-if="toolCall" class="tool-name">{{ toolCall.toolName }}</span>
          <span v-if="toolCall" class="request-id">
            <Hash :size="10" />
            {{ toolCall.requestId.slice(0, 8) }}
          </span>
          <span v-if="toolCall?.durationMs" class="duration">
            <Clock :size="10" />
            {{ toolCall.durationMs }}ms
          </span>
          <span class="time">{{ formattedTime }}</span>
        </div>
      </div>

      <!-- 悬浮操作栏 (对齐 ChatMessage.vue 逻辑) -->
      <div class="menubar-wrapper" v-if="!isEditing">
        <MessageMenubar
          :message="message"
          :is-sending="isGenerating"
          :siblings="siblings"
          :current-sibling-index="currentSiblingIndex"
          :button-visibility="buttonVisibility"
          @delete="emit('delete')"
          @edit="initEditMode"
          @copy="emit('copy')"
          @regenerate="onRegenerate"
          @toggle-enabled="emit('toggle-enabled')"
          @switch="onSwitchSibling"
          @switch-branch="onSwitchBranch"
          @abort="emit('abort')"
          @continue="onContinue"
          @create-branch="emit('create-branch')"
          @analyze-context="emit('analyze-context')"
          @translate="handleTranslate"
          @toggle-translation-visible="onToggleTranslationVisible"
          @change-translation-mode="onChangeTranslationMode"
        />
      </div>

      <!-- 编辑模式 -->
      <div v-if="isEditing" class="edit-mode">
        <ChatCodeMirrorEditor
          ref="editorRef"
          :value="editingContent"
          placeholder="编辑工具执行结果..."
          height="auto"
          max-height="600px"
          send-key="ctrl+enter"
          @update:value="editingContent = $event"
          @submit="saveEdit"
        />
        <div class="edit-actions">
          <div class="edit-buttons">
            <el-button @click="saveEdit" type="primary" size="small">保存 (Ctrl+Enter)</el-button>
            <el-button @click="onSaveToBranch(editingContent)" size="small">保存到分支</el-button>
            <el-button @click="cancelEdit" size="small">取消</el-button>
          </div>
        </div>
      </div>

      <!-- 内容显示区域 -->
      <transition v-else name="tool-collapse">
        <div v-if="!isCollapsed" class="tool-body-container" :class="{ 'is-wide-layout': isWideLayout }">
          <!-- 参数预览 (始终在顶部) -->
          <div v-if="toolCall?.rawArgs" class="tool-args-preview">
            <div class="args-header">
              <div class="args-title">输入参数</div>
              <button class="copy-small-btn" @click="handleCopyArgs">复制</button>
            </div>
            <pre class="args-content">{{ JSON.stringify(toolCall.rawArgs, null, 2) }}</pre>
          </div>

          <div class="content-display-grid">
            <!-- 原文区域 -->
            <div v-if="showOriginal" class="original-column">
              <div class="translation-header" v-if="displayMode === 'both' && showTranslation">
                <MessageSquareText :size="14" class="translation-icon" />
                <span class="translation-title">原文</span>
              </div>
              <div class="tool-result">
                <div class="result-header" v-if="!showTranslation">
                  <div class="result-label">执行结果</div>
                  <div v-if="toolCall?.status" class="status-indicator" :class="statusClass">
                    {{ toolCall.status.toUpperCase() }}
                  </div>
                </div>
                <RichTextRenderer
                  :content="message.content"
                  :version="settings.uiPreferences.rendererVersion"
                  :regex-rules="processedRules"
                  :resolve-asset="resolveAsset"
                  :default-render-html="settings.uiPreferences.defaultRenderHtml"
                  :throttle-ms="settings.uiPreferences.rendererThrottleMs"
                  :enable-enter-animation="settings.uiPreferences.enableEnterAnimation"
                />
              </div>
            </div>

            <!-- 译文区域 -->
            <div v-if="showTranslation" class="translation-column">
              <div class="translation-header">
                <Languages :size="14" class="translation-icon" />
                <span class="translation-title">翻译结果</span>
                <span class="translation-meta" v-if="message.metadata?.translation">
                  ({{ message.metadata.translation.targetLang }})
                </span>
              </div>
              <div class="translation-content">
                <RichTextRenderer
                  :content="isTranslating ? translationContent : message.metadata?.translation?.content || ''"
                  :version="settings.uiPreferences.rendererVersion"
                  :regex-rules="processedRules"
                  :resolve-asset="resolveAsset"
                  :default-render-html="settings.uiPreferences.defaultRenderHtml"
                  :throttle-ms="settings.uiPreferences.rendererThrottleMs"
                  :is-streaming="isTranslating"
                />
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- 折叠时的简短预览 -->
      <div v-if="isCollapsed && !isEditing" class="tool-preview-line" @click="toggleCollapse">
        <div class="preview-content">
          <span class="preview-tool-name">[{{ toolCall?.toolName || "未知工具" }}]</span>
          <span class="preview-text">
            {{ message.content.trim().slice(0, 120) }}{{ message.content.trim().length > 120 ? "..." : "" }}
          </span>
        </div>
        <div v-if="toolCall?.status" class="preview-status-tag" :class="statusClass">
          {{ toolCall.status }}
        </div>
      </div>

      <!-- 元数据展示 -->
      <div v-if="message.metadata?.usage || message.metadata?.error" class="message-meta">
        <div v-if="message.metadata.usage" class="usage-info">
          <span>Token: {{ message.metadata.usage.totalTokens }}</span>
          <span class="usage-detail"
            >(输入: {{ message.metadata.usage.promptTokens }}, 输出:
            {{ message.metadata.usage.completionTokens }})</span
          >
        </div>
        <div v-if="message.metadata.error" class="error-info">
          <AlertCircle :size="14" />
          <span class="error-text">{{ message.metadata.error }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-call-message {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  margin: 8px 0;
  border-radius: 12px;
  font-size: v-bind('settings.uiPreferences.fontSize + "px"');
  transition: all 0.3s ease;
}

.tool-call-message.is-editing {
  background-color: var(--container-bg);
  box-shadow: 0 0 0 2px var(--primary-color);
}

/* 背景层 */
.message-background-container {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: 12px;
  overflow: hidden;
}

.message-background-slice {
  position: absolute;
  left: 0;
  right: 0;
  background-color: color-mix(in srgb, var(--bg-color-soft) 80%, transparent);
  backdrop-filter: blur(var(--ui-blur));
}

/* 装饰性侧边栏 */
.tool-bar {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  color: var(--text-color-secondary);
  opacity: 0.6;
}

.tool-bar.status-success {
  color: var(--el-color-success);
}
.tool-bar.status-error,
.tool-bar.status-denied {
  color: var(--el-color-danger);
}

.bar-line {
  flex: 1;
  width: 2px;
  background-color: currentColor;
  opacity: 0.2;
  border-radius: 1px;
}

.bar-icon {
  padding: 6px 0;
  cursor: pointer;
  transition: transform 0.2s;
}

.bar-icon:hover {
  transform: scale(1.2);
}

/* 内容区域 */
.tool-content-wrapper {
  position: relative;
  z-index: 3;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  min-height: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.collapse-icon {
  display: flex;
  align-items: center;
  color: var(--text-color-tertiary);
  width: 16px;
}

.role-badge.tool {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color-secondary);
}

.role-badge.tool.status-success {
  background-color: color-mix(in srgb, var(--el-color-success) 10%, var(--card-bg));
  color: var(--el-color-success);
  border-color: color-mix(in srgb, var(--el-color-success) 30%, var(--border-color));
}

.role-badge.tool.status-error,
.role-badge.tool.status-denied {
  background-color: color-mix(in srgb, var(--el-color-danger) 10%, var(--card-bg));
  color: var(--el-color-danger);
  border-color: color-mix(in srgb, var(--el-color-danger) 30%, var(--border-color));
}

.tool-name {
  font-weight: 600;
  color: var(--text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.request-id {
  font-family: var(--font-family-mono);
  font-size: 11px;
  color: var(--text-color-light);
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0.8;
}

.duration {
  font-size: 11px;
  color: var(--text-color-tertiary);
  display: flex;
  align-items: center;
  gap: 2px;
}

.time {
  font-size: 11px;
  color: var(--text-color-light);
  white-space: nowrap;
}

/* 编辑模式 */
.edit-mode {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
}

.edit-buttons {
  display: flex;
  gap: 8px;
}

/* 内容显示网格 */
.tool-body-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.content-display-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.is-wide-layout .content-display-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

/* 参数展示 */
.tool-args-preview {
  padding: 10px;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  max-height: 250px;
  overflow-y: auto;
}

.args-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.args-title {
  font-size: 11px;
  color: var(--text-color-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
}

.copy-small-btn {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-color-secondary);
  cursor: pointer;
}

.args-content {
  margin: 0;
  font-size: 12px;
  font-family: var(--font-family-mono);
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-color-secondary);
}

/* 结果展示 */
.tool-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-label {
  font-size: 11px;
  color: var(--text-color-tertiary);
  text-transform: uppercase;
  font-weight: 700;
}

.status-indicator {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
}

.status-indicator.status-success {
  background: color-mix(in srgb, var(--el-color-success) 15%, transparent);
  color: var(--el-color-success);
}
.status-indicator.status-error {
  background: color-mix(in srgb, var(--el-color-danger) 15%, transparent);
  color: var(--el-color-danger);
}

/* 翻译样式 */
.translation-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-color-light);
}

.translation-title {
  font-weight: 600;
}

.translation-column {
  padding: 12px;
  background-color: color-mix(in srgb, var(--bg-color-soft) 40%, transparent);
  border-radius: 8px;
  border: 1px dashed var(--border-color);
}

.is-wide-layout .original-column {
  padding-right: 16px;
  border-right: 1px dashed var(--border-color);
}

/* 悬停显示操作栏 (对齐 ChatMessage.vue) */
.tool-call-message:hover .menubar-wrapper {
  opacity: 1;
}

.menubar-wrapper {
  position: absolute;
  bottom: 8px;
  right: 12px;
  z-index: 100;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.menubar-wrapper > * {
  pointer-events: auto;
}

/* 预览线 */
.tool-preview-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-color-secondary);
  cursor: pointer;
  padding: 8px 14px;
  background-color: var(--input-bg);
  border-radius: 8px;
  border-left: 4px solid var(--border-color);
  opacity: 0.8;
  transition: all 0.2s ease;
}

.tool-preview-line:hover {
  opacity: 1;
  background: var(--hover-bg);
  border-left-color: var(--primary-color);
}

.preview-content {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.preview-tool-name {
  font-weight: 700;
  color: var(--text-color-primary);
  white-space: nowrap;
}

.preview-text {
  font-family: var(--font-family-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
}

.preview-status-tag {
  font-size: 10px;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.preview-status-tag.status-success {
  background: color-mix(in srgb, var(--el-color-success) 15%, transparent);
  color: var(--el-color-success);
}
.preview-status-tag.status-error {
  background: color-mix(in srgb, var(--el-color-danger) 15%, transparent);
  color: var(--el-color-danger);
}

/* 元数据 */
.message-meta {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.usage-info {
  color: var(--text-color-light);
}
.usage-detail {
  margin-left: 8px;
  opacity: 0.6;
}

.error-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-color-danger);
}

/* 动画 */
.tool-collapse-enter-active,
.tool-collapse-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 2000px;
  overflow: hidden;
}
.tool-collapse-enter-from,
.tool-collapse-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-10px);
}

.is-disabled {
  opacity: 0.5;
  filter: grayscale(0.5);
}
</style>
