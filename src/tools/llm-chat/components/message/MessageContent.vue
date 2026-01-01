<script setup lang="ts">
import { ref, computed, watch, provide } from "vue";
import { Copy, Check, GitBranch, Languages, MessageSquareText } from "lucide-vue-next";
import { useResizeObserver } from "@vueuse/core";
import type { ChatMessageNode, ChatSession, TranslationDisplayMode } from "../../types";
import type { Asset } from "@/types/asset-management";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { useChatSettings } from "../../composables/useChatSettings";
import { useAgentStore } from "../../agentStore";
import { useTranscriptionManager } from "../../composables/useTranscriptionManager";
import { useUserProfileStore } from "../../userProfileStore";
import { MacroProcessor } from "../../macro-engine";
import { processMacros, buildMacroContext } from "../../core/context-utils/macro";
import {
  resolveRawRules,
  filterRulesByRole,
  filterRulesByDepth,
  processRulesWithMacros,
} from "../../utils/chatRegexUtils";
import { createMacroContext } from "../../macro-engine/MacroContext";
import type { ChatRegexRule } from "../../types/chatRegex";
import { processMessageAssetsSync } from "../../utils/agentAssetUtils";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import LlmThinkNode from "@/tools/rich-text-renderer/components/nodes/LlmThinkNode.vue";
import AttachmentCard from "../AttachmentCard.vue";
import { useAttachmentManager } from "../../composables/useAttachmentManager";
import { useChatFileInteraction } from "@/composables/useFileInteraction";
import BaseDialog from "@/components/common/BaseDialog.vue";
import DocumentViewer from "@/components/common/DocumentViewer.vue";

const logger = createModuleLogger("MessageContent");
const { settings } = useChatSettings();
const { computeWillUseTranscription } = useTranscriptionManager();
const macroProcessor = new MacroProcessor();

interface Props {
  session: ChatSession | null;
  message: ChatMessageNode;
  isEditing?: boolean;
  isTranslating?: boolean;
  translationContent?: string;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  messageDepth?: number;
}

interface Emits {
  (e: "save-edit", newContent: string, attachments?: Asset[]): void;
  (e: "cancel-edit"): void;
  (e: "save-to-branch", newContent: string, attachments?: Asset[]): void;
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
  isTranslating: false,
  translationContent: "",
  messageDepth: 0,
});

// 提供消息 ID 给后代组件（如可交互按钮）
provide("messageId", props.message.id);
// 提供设置给后代组件
provide("chatSettings", settings);
const emit = defineEmits<Emits>();

const agentStore = useAgentStore();
const userProfileStore = useUserProfileStore();

/**
 * 根据绑定模式获取 agentId 和 userProfileId
 */
function getAgentAndUserProfileIds(
  metadata: any,
  bindingMode: "message" | "session" = "message"
): { agentId: string | undefined; userProfileId: string | undefined } {
  let agentId: string | undefined;
  let userProfileId: string | undefined;

  if (bindingMode === "message") {
    // 消息绑定模式：优先使用消息元数据，回退到当前激活的 Agent/User 配置
    agentId = metadata?.agentId ?? agentStore.currentAgentId ?? undefined;
    const agent = agentId ? agentStore.getAgentById(agentId) : undefined;

    // 确定 User Profile ID (Message-Bound 优先，Agent 绑定回退，Global 回退)
    userProfileId = metadata?.userProfileId;
    if (!userProfileId) {
      userProfileId = agent?.userProfileId ?? undefined;
    }
    if (!userProfileId) {
      userProfileId = userProfileStore.globalProfileId ?? undefined;
    }
  } else {
    // 会话绑定模式：忽略消息元数据，使用当前激活的 Agent 和全局档案
    agentId = agentStore.currentAgentId ?? undefined;
    const agent = agentId ? agentStore.getAgentById(agentId) : undefined;
    userProfileId = agent?.userProfileId ?? userProfileStore.globalProfileId ?? undefined;
  }

  return { agentId, userProfileId };
}

// 获取当前生效的 Agent
const currentAgent = computed(() => {
  const { agentId } = getAgentAndUserProfileIds(props.message.metadata, "message");
  return agentId ? agentStore.getAgentById(agentId) : undefined;
});

// 提供 Agent 交互配置给后代组件
provide(
  "agentInteractionConfig",
  computed(() => currentAgent.value?.interactionConfig)
);

// 提供当前 Agent 给后代组件（用于解析 agent-asset:// URL）
provide("currentAgent", currentAgent);

// 附件管理器 - 用于编辑模式（使用默认配置）
const attachmentManager = useAttachmentManager();

const getWillUseTranscription = (asset: Asset) => {
  const { modelId, profileId } = props.message.metadata || {};

  // 如果没有模型信息，尝试获取当前 Agent 的配置
  let finalModelId = modelId;
  let finalProfileId = profileId;

  if (!finalModelId || !finalProfileId) {
    const currentAgentId = agentStore.currentAgentId;
    if (currentAgentId) {
      const agentConfig = agentStore.getAgentConfig(currentAgentId);
      if (agentConfig) {
        finalModelId = agentConfig.modelId;
        finalProfileId = agentConfig.profileId;
      }
    }
  }

  // 如果仍然没有模型信息，返回 true（默认需要转写）
  if (!finalModelId || !finalProfileId) {
    return true;
  }

  // 使用统一方法计算
  return computeWillUseTranscription(asset, finalModelId, finalProfileId, props.messageDepth);
};

// 是否有附件 - 非编辑模式显示原始附件
const hasAttachments = computed(() => {
  return props.message.attachments && props.message.attachments.length > 0;
});

// 渲染内容
const displayedContent = ref(props.message.content);

// 编辑状态
const editingContent = ref("");

// 错误信息复制状态
const errorCopied = ref(false);

// 文档预览状态
const documentPreviewVisible = ref(false);
const previewingAsset = ref<Asset | null>(null);

// 判断是否正在推理中
const isReasoning = computed(() => {
  return !!(
    props.message.status === "generating" &&
    props.message.metadata?.reasoningContent &&
    !props.message.metadata?.reasoningEndTime
  );
});

// 提取生成元数据用于渲染器计时
const generationMetaForRenderer = computed(() => {
  const metadata = props.message.metadata;
  if (!metadata) return undefined;

  return {
    requestStartTime: metadata.requestStartTime,
    requestEndTime: metadata.requestEndTime,
    reasoningStartTime: metadata.reasoningStartTime,
    reasoningEndTime: metadata.reasoningEndTime,
    firstTokenTime: metadata.firstTokenTime,
    tokensPerSecond: metadata.tokensPerSecond,
    usage: metadata.usage,
    modelId: metadata.modelId, // 传递模型 ID
  };
});

// 解析需要传递给渲染器的正则规则
const activeRules = computed(() => {
  const bindingMode = settings.value.regexConfig.bindingMode ?? "message";
  const { agentId, userProfileId } = getAgentAndUserProfileIds(props.message.metadata, bindingMode);

  // 获取配置源
  const agent = agentId ? agentStore.getAgentById(agentId) : undefined;
  const userProfile = userProfileId
    ? userProfileStore.getProfileById(userProfileId)
    : userProfileStore.globalProfile;
  const globalConfig = settings.value.regexConfig;

  // 1. 解析原始规则 (全局 -> Agent -> UserProfile)
  const rawRules = resolveRawRules(
    "render",
    globalConfig,
    agent?.regexConfig,
    userProfile?.regexConfig
  );

  // 2. 按角色过滤
  const roleFiltered = filterRulesByRole(rawRules, props.message.role);

  // 3. 按深度过滤
  return filterRulesByDepth(roleFiltered, props.messageDepth ?? 0);
});

// 经过宏处理的最终规则列表
const processedRules = ref<ChatRegexRule[]>([]);

// 监听 activeRules 变化，进行宏处理
watch(
  [
    activeRules,
    () => props.session,
    () => props.message.metadata,
    () => settings.value.regexConfig.bindingMode,
  ],
  async ([rules, session, metadata, bindingMode]) => {
    if (!rules || rules.length === 0) {
      processedRules.value = [];
      return;
    }

    // 根据绑定模式确定 agent 和 userProfile
    const mode = bindingMode ?? "message";
    const { agentId, userProfileId } = getAgentAndUserProfileIds(metadata, mode);

    const agent = agentId ? agentStore.getAgentById(agentId) : undefined;
    let userProfile = userProfileId
      ? userProfileStore.getProfileById(userProfileId)
      : userProfileStore.globalProfile;

    const macroContext = createMacroContext({
      agent,
      userProfile: userProfile ?? undefined,
      session: session ?? undefined,
    });

    processedRules.value = await processRulesWithMacros(rules, macroContext);
  },
  { immediate: true }
);

// 编辑区域引用
const editAreaRef = ref<HTMLElement | undefined>(undefined);

// 当进入编辑模式时，初始化编辑内容和附件
const initEditMode = () => {
  editingContent.value = props.message.content;

  // 清空附件管理器
  attachmentManager.clearAttachments();

  // 加载现有附件
  if (props.message.attachments && props.message.attachments.length > 0) {
    props.message.attachments.forEach((asset) => {
      attachmentManager.addAsset(asset);
    });
  }
};

// 保存编辑
const saveEdit = () => {
  if (editingContent.value.trim() || attachmentManager.hasAttachments.value) {
    // 传递文本内容和附件列表
    // 必须传递数组本身，即使是空数组，以便父组件知道需要清空附件
    emit("save-edit", editingContent.value, attachmentManager.attachments.value);
  }
};

// 取消编辑
const cancelEdit = () => {
  editingContent.value = "";
  attachmentManager.clearAttachments();
  emit("cancel-edit");
};

// 保存到新分支
const saveToBranch = () => {
  if (editingContent.value.trim() || attachmentManager.hasAttachments.value) {
    emit("save-to-branch", editingContent.value, attachmentManager.attachments.value);
  }
};

// 处理附件移除
const handleRemoveAttachment = (asset: Asset) => {
  attachmentManager.removeAttachment(asset);
};

// 处理文档预览
const handlePreviewDocument = (asset: Asset) => {
  previewingAsset.value = asset;
  documentPreviewVisible.value = true;
};

// 关闭文档预览
const closeDocumentPreview = () => {
  documentPreviewVisible.value = false;
  previewingAsset.value = null;
};

// 统一的文件交互处理（拖放 + 粘贴）
const { isDraggingOver, handlePaste } = useChatFileInteraction({
  element: editAreaRef,
  onPaths: async (paths: string[]) => {
    if (!props.isEditing) return;
    await attachmentManager.addAttachments(paths);
  },
  onAssets: async (assets) => {
    if (!props.isEditing) return;
    logger.info("编辑模式粘贴文件", { count: assets.length });
    let successCount = 0;
    for (const asset of assets) {
      if (attachmentManager.addAsset(asset)) {
        successCount++;
      }
    }
    if (successCount > 0) {
      const message =
        successCount === 1 ? `已粘贴文件: ${assets[0].name}` : `已粘贴 ${successCount} 个文件`;
      customMessage.success(message);
    }
  },
});
// 复制错误信息
const copyError = async () => {
  if (!props.message.metadata?.error) return;

  try {
    await navigator.clipboard.writeText(props.message.metadata.error);
    errorCopied.value = true;
    customMessage.success("错误信息已复制");

    // 2秒后重置复制状态
    setTimeout(() => {
      errorCopied.value = false;
    }, 2000);
  } catch (err) {
    customMessage.error("复制失败");
  }
};

// 监听消息内容或相关上下文变化，异步处理宏
watch(
  [() => props.message.content, () => props.message.metadata?.agentId, () => props.session],
  async ([content, agentId, session]) => {
    // 仅对预设消息进行宏处理（非编辑模式下）
    // 普通会话消息在发送时已经处理过宏，不需要二次处理
    const isPresetMessage = props.message.metadata?.isPresetDisplay === true;

    if (!props.isEditing && content && isPresetMessage) {
      const agent = agentId ? agentStore.getAgentById(agentId) : undefined;

      // 构建宏上下文
      const context = buildMacroContext({
        agent,
        session: session ?? undefined,
      });
      const macroProcessed = await processMacros(macroProcessor, content, context);
      // 预处理资产链接（同步），确保 v-html 模式下也能正确渲染
      displayedContent.value = processMessageAssetsSync(macroProcessed, currentAgent.value);
    } else {
      // 直接显示内容，但也需要预处理资产链接
      displayedContent.value = processMessageAssetsSync(content, currentAgent.value);
    }
  },
  { immediate: true }
);

// 监听编辑模式变化
watch(
  () => props.isEditing,
  (newVal) => {
    if (newVal) {
      initEditMode();
    } else {
      // 退出编辑模式时清空附件管理器
      attachmentManager.clearAttachments();
    }
  }
);

// 翻译显示逻辑
const displayMode = computed<TranslationDisplayMode>(() => {
  if (props.isTranslating) return "both";
  return props.message.metadata?.translation?.displayMode || "both";
});

const showOriginal = computed(() => {
  if (props.isEditing) return false; // 编辑模式由专门的区域接管

  // 如果没有翻译数据，或者翻译被隐藏了，应该显示原文（兜底，防止消息完全消失）
  const translationHidden = props.message.metadata?.translation?.visible === false;
  if (
    (!props.message.metadata?.translation && !props.isTranslating) ||
    (translationHidden && !props.isTranslating)
  ) {
    return true;
  }

  return displayMode.value === "original" || displayMode.value === "both";
});

const showTranslation = computed(() => {
  if (props.isEditing) return false;

  // 检查 visible 属性 (默认为 true，兼容旧数据)
  // 正在翻译时强制显示
  const isVisible = props.isTranslating || props.message.metadata?.translation?.visible !== false;

  // 只要有元数据，或者正在翻译，或者有临时的翻译内容（应对流式结束但元数据未更新的间隙），都应该显示
  const hasContent = !!(
    props.message.metadata?.translation ||
    props.isTranslating ||
    props.translationContent
  );

  return (
    isVisible && hasContent && (displayMode.value === "translation" || displayMode.value === "both")
  );
});

// 资产转换钩子
const resolveAsset = (content: string) => {
  return processMessageAssetsSync(content, currentAgent.value);
};

// 响应式布局
const containerRef = ref<HTMLElement | null>(null);
const containerWidth = ref(0);

useResizeObserver(containerRef, (entries) => {
  const entry = entries[0];
  containerWidth.value = entry.contentRect.width;
});

const isWideLayout = computed(() => {
  // 当宽度大于 800px 且处于双语模式，并且确实有翻译内容需要显示时，启用并排布局
  return containerWidth.value > 800 && displayMode.value === "both" && showTranslation.value;
});

/**
 * 计算当前消息的 HTML 预览是否应该被冻结
 * 基于消息深度判断：深度 >= 设定值的消息将被冻结
 */
const shouldFreezeHtml = computed(() => {
  // 如果未启用冻结功能，则不冻结
  if (!settings.value.uiPreferences.enableHtmlFreezer) return false;

  // 基于消息深度判断是否冻结
  // messageDepth 从 0 开始，0 表示最新消息
  // 例如：keepAliveCount = 5 时，深度 0-4 的消息保持活跃，深度 >= 5 的消息被冻结
  return props.messageDepth >= settings.value.uiPreferences.htmlFreezerKeepAliveCount;
});

const containerClasses = computed(() => ({
  "is-wide-layout": isWideLayout.value,
  "is-translating": props.isTranslating || !!props.message.metadata?.translation,
}));
</script>

<template>
  <div class="message-content" ref="containerRef" :class="containerClasses">
    <!-- 附件展示区域 - 非编辑模式 (始终显示在顶部) -->
    <div v-if="!isEditing && hasAttachments" class="attachments-section">
      <div class="attachments-list">
        <AttachmentCard
          v-for="attachment in message.attachments"
          :key="attachment.id"
          :asset="attachment"
          :all-assets="message.attachments"
          :removable="false"
          size="large"
          :will-use-transcription="getWillUseTranscription(attachment)"
          @preview-document="handlePreviewDocument"
        />
      </div>
    </div>

    <!-- 推理内容（DeepSeek reasoning）- 始终显示在顶部 -->
    <LlmThinkNode
      v-if="message.metadata?.reasoningContent"
      raw-tag-name="reasoning"
      rule-id="reasoning-metadata"
      display-name="深度思考"
      :is-thinking="isReasoning"
      :collapsed-by-default="true"
      :raw-content="message.metadata.reasoningContent"
      :generation-meta="generationMetaForRenderer"
    >
      <RichTextRenderer
        :content="message.metadata.reasoningContent"
        :version="settings.uiPreferences.rendererVersion"
        :style-options="richTextStyleOptions"
        :resolve-asset="resolveAsset"
        :default-render-html="settings.uiPreferences.defaultRenderHtml"
        :default-code-block-expanded="settings.uiPreferences.defaultCodeBlockExpanded"
        :enable-cdn-localizer="settings.uiPreferences.enableCdnLocalizer"
        :allow-external-scripts="settings.uiPreferences.allowExternalScripts"
        :throttle-ms="settings.uiPreferences.rendererThrottleMs"
        :enable-enter-animation="settings.uiPreferences.enableEnterAnimation"
      />
    </LlmThinkNode>

    <!-- 编辑模式 -->
    <div
      v-if="isEditing"
      ref="editAreaRef"
      class="edit-mode"
      :class="{ 'is-dragging': isDraggingOver }"
    >
      <!-- 编辑模式的附件展示 -->
      <div
        v-if="attachmentManager.hasAttachments.value"
        class="attachments-section edit-attachments"
      >
        <div class="attachments-list">
          <AttachmentCard
            v-for="attachment in attachmentManager.attachments.value"
            :key="attachment.id"
            :asset="attachment"
            :all-assets="attachmentManager.attachments.value"
            :removable="true"
            size="medium"
            @remove="handleRemoveAttachment"
            @preview-document="handlePreviewDocument"
          />
        </div>
      </div>

      <!-- 文本编辑区域 -->
      <textarea
        v-model="editingContent"
        class="edit-textarea"
        rows="3"
        placeholder="编辑消息内容、拖入或粘贴文件..."
        @keydown.ctrl.enter="saveEdit"
        @keydown.esc="cancelEdit"
        @paste="handlePaste"
      />

      <!-- 操作按钮 -->
      <div class="edit-actions">
        <div class="edit-info">
          <span v-if="attachmentManager.count.value > 0" class="attachment-count">
            {{ attachmentManager.count.value }} 个附件
          </span>
          <span class="drag-tip">拖拽文件到此区域添加附件</span>
        </div>
        <div class="edit-buttons">
          <el-button @click="saveEdit" type="primary" size="small">保存 (Ctrl+Enter)</el-button>
          <el-button @click="saveToBranch" size="small" :icon="GitBranch">保存到分支</el-button>
          <el-button @click="cancelEdit" size="small">取消 (Esc)</el-button>
        </div>
      </div>
    </div>

    <!-- 内容显示区域 (Grid Layout) -->
    <div v-else class="content-display-grid">
      <!-- 原文区域 -->
      <div v-if="showOriginal" class="original-column">
        <div class="translation-header" v-if="displayMode === 'both' && showTranslation">
          <MessageSquareText :size="14" class="translation-icon" />
          <span class="translation-title">原文</span>
        </div>
        <RichTextRenderer
          v-if="displayedContent"
          :content="displayedContent"
          :regex-rules="processedRules"
          :resolve-asset="resolveAsset"
          :version="settings.uiPreferences.rendererVersion"
          :llm-think-rules="llmThinkRules"
          :style-options="richTextStyleOptions"
          :generation-meta="generationMetaForRenderer"
          :is-streaming="message.status === 'generating'"
          :default-render-html="settings.uiPreferences.defaultRenderHtml"
          :default-code-block-expanded="settings.uiPreferences.defaultCodeBlockExpanded"
          :seamless-mode="settings.uiPreferences.seamlessMode"
          :enable-cdn-localizer="settings.uiPreferences.enableCdnLocalizer"
          :allow-external-scripts="settings.uiPreferences.allowExternalScripts"
          :throttle-ms="settings.uiPreferences.rendererThrottleMs"
          :enable-enter-animation="settings.uiPreferences.enableEnterAnimation"
          :should-freeze="shouldFreezeHtml"
        />
        <div v-if="message.status === 'generating'" class="streaming-indicator">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>

      <!-- 译文区域 -->
      <div v-if="showTranslation" class="translation-column">
        <div
          class="translation-header"
          v-if="displayMode === 'both' || displayMode === 'translation'"
        >
          <Languages :size="14" class="translation-icon" />
          <span class="translation-title">翻译结果</span>
          <span class="translation-meta" v-if="message.metadata?.translation">
            ({{ message.metadata.translation.targetLang }})
          </span>
        </div>
        <div class="translation-content">
          <RichTextRenderer
            :content="
              isTranslating || !message.metadata?.translation
                ? translationContent
                : message.metadata.translation.content
            "
            :regex-rules="processedRules"
            :version="settings.uiPreferences.rendererVersion"
            :llm-think-rules="llmThinkRules"
            :style-options="richTextStyleOptions"
            :default-render-html="settings.uiPreferences.defaultRenderHtml"
            :default-code-block-expanded="settings.uiPreferences.defaultCodeBlockExpanded"
            :seamless-mode="settings.uiPreferences.seamlessMode"
            :enable-cdn-localizer="settings.uiPreferences.enableCdnLocalizer"
            :allow-external-scripts="settings.uiPreferences.allowExternalScripts"
            :throttle-ms="settings.uiPreferences.rendererThrottleMs"
            :is-streaming="isTranslating"
            :resolve-asset="resolveAsset"
            :should-freeze="shouldFreezeHtml"
          />
          <div v-if="isTranslating" class="streaming-indicator translation-loading">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 元数据 -->
    <div
      v-if="
        (settings.uiPreferences.showTokenCount &&
          (message.metadata?.usage || message.metadata?.contentTokens !== undefined)) ||
        message.metadata?.error
      "
      class="message-meta"
    >
      <!-- API 返回的完整 Usage 信息（助手消息） -->
      <div
        v-if="settings.uiPreferences.showTokenCount && message.metadata?.usage"
        class="usage-info"
      >
        <span>Token: {{ message.metadata.usage.totalTokens }}</span>
        <span class="usage-detail">
          (输入: {{ message.metadata.usage.promptTokens }}, 输出:
          {{ message.metadata.usage.completionTokens }})
        </span>
      </div>
      <!-- 本地计算的单条消息 Token（用户消息） -->
      <div
        v-else-if="
          settings.uiPreferences.showTokenCount && message.metadata?.contentTokens !== undefined
        "
        class="usage-info"
      >
        <span>本条消息: {{ message.metadata.contentTokens.toLocaleString("en-US") }} tokens</span>
      </div>
      <div v-if="message.metadata?.error" class="error-info">
        <el-button
          @click="copyError"
          class="error-copy-btn"
          :class="{ copied: errorCopied }"
          :title="errorCopied ? '已复制' : '复制错误信息'"
          :icon="errorCopied ? Check : Copy"
          size="small"
          text
        />
        <span class="error-text"> {{ message.metadata.error }}</span>
      </div>
    </div>

    <!-- 文档预览对话框 -->
    <BaseDialog
      v-model="documentPreviewVisible"
      :title="previewingAsset?.name || '文档预览'"
      width="80%"
      height="80vh"
      @close="closeDocumentPreview"
    >
      <DocumentViewer
        v-if="previewingAsset"
        :file-path="previewingAsset.originalPath || previewingAsset.path"
        :file-name="previewingAsset.name"
        :file-type-hint="previewingAsset.mimeType"
        :show-engine-switch="true"
      />
    </BaseDialog>
  </div>
</template>

<style scoped>
.message-content {
  margin: 8px 0;
  font-size: v-bind('settings.uiPreferences.fontSize + "px"');
  line-height: v-bind("settings.uiPreferences.lineHeight");
}

/* 使用深度选择器强制 RichTextRenderer 继承字体设置 */
.message-content :deep(.rich-text-renderer) {
  font-size: inherit;
  line-height: inherit;
}

.message-text {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-color);
  font-family: inherit;
}

.streaming-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 0;
}

.streaming-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--primary-color);
  animation: pulse 1.4s infinite ease-in-out;
}

.streaming-indicator .dot:nth-child(1) {
  animation-delay: -0.32s;
}

.streaming-indicator .dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes pulse {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

.message-meta {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
}

.usage-info {
  color: var(--text-color-light);
  margin: 4px 0;
}

.usage-detail {
  margin-left: 8px;
  opacity: 0.7;
}

.error-info {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--error-color);
  margin-top: 8px;
  margin-bottom: 42px;
}

.error-text {
  flex: 1;
  font-size: 14px;
  word-break: break-word;
}
.error-copy-btn.copied {
  color: var(--success-color, #67c23a);
}

/* 编辑模式样式 */
.edit-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--container-bg);
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.edit-mode.is-dragging {
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent);
  border-color: var(--primary-color);
}

.edit-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  background-color: var(--container-bg);
  color: var(--text-color);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  min-height: 300px;
  box-sizing: border-box;
}

.edit-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 20%, transparent);
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
}

.edit-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-color-light);
}

.attachment-count {
  padding: 2px 8px;
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent);
  border-radius: 12px;
  color: var(--primary-color);
  font-weight: 500;
}

.drag-tip {
  opacity: 0.7;
}
.edit-buttons {
  display: flex;
  gap: 8px;
}

/* 附件展示区域样式 */
.attachments-section {
  margin-bottom: 12px;
  border-radius: 8px;
}

.attachments-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 4px 0;
}

/* 推理内容样式 */
/* 样式已移除，使用 LlmThinkNode 组件 */

/* 布局容器 */
.content-display-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 宽屏并排布局 */
.is-wide-layout .content-display-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

/* 并排布局时的分隔线 */
.is-wide-layout .original-column {
  padding-right: 24px;
  border-right: 1px dashed var(--border-color);
  min-width: 0;
}

/* 翻译列样式 */
.translation-column {
  position: relative;
  min-width: 0;
}

/* 仅在上下布局时添加背景区分 */
.message-content:not(.is-wide-layout) .translation-column {
  margin-top: 8px;
  padding: 12px;
  background-color: var(--bg-color);
  border-radius: 8px;
  border: 1px dashed var(--border-color);
}

.translation-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-color-light);
  user-select: none;
}

.translation-icon {
  opacity: 0.7;
}

.translation-title {
  font-weight: 500;
}

.translation-meta {
  opacity: 0.7;
}

.translation-content {
  font-size: 0.95em;
  color: var(--text-color);
}

.translation-loading {
  padding: 4px 0;
  transform: scale(0.8);
  transform-origin: left center;
}
</style>
