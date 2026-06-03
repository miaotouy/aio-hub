import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useStorage } from "@vueuse/core";
import { useChatInputManager } from "../composables/input/useChatInputManager";
import { useChatInputTokenPreview } from "../composables/input/useChatInputTokenPreview";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useTranslation } from "../composables/chat/useTranslation";
import { useContextCompressor } from "../composables/features/useContextCompressor";
import { useLlmChatStore } from "./llmChatStore";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useModelSelectDialog } from "@/composables/useModelSelectDialog";
import { useAgentStore } from "./agentStore";

export interface InputToolbarSettings {
  showTokenUsage: boolean;
  enableMacroParsing: boolean;
  extractBase64FromPaste: boolean;
  groupQuickActionsBySet: boolean;
}

const errorHandler = createModuleErrorHandler("messageInputStore");

export const useMessageInputStore = defineStore(
  "llm-chat-message-input",
  () => {
    // === 1. UI 菜单可见性 ===
    const macroSelectorVisible = ref(false);
    const sessionListVisible = ref(false);
    const toolSettingsVisible = ref(false);
    const moreMenuVisible = ref(false);
    const settingsVisible = ref(false);
    const canvasMenuOpen = ref(false);

    const anyMenuOpen = computed(
      () =>
        macroSelectorVisible.value ||
        sessionListVisible.value ||
        toolSettingsVisible.value ||
        moreMenuVisible.value ||
        settingsVisible.value ||
        canvasMenuOpen.value
    );

    // === 2. 持久化设置 ===
    const settings = useStorage<InputToolbarSettings>(
      "chat-input-settings",
      {
        showTokenUsage: true,
        enableMacroParsing: true,
        extractBase64FromPaste: true,
        groupQuickActionsBySet: false,
      },
      localStorage,
      { mergeDefaults: true }
    );

    // === 3. 输入状态代理 ===
    const inputManager = useChatInputManager();
    const { getProfileById } = useLlmProfiles();

    const inputText = inputManager.inputText;
    const attachments = inputManager.attachments;
    const isProcessingAttachments = inputManager.isProcessingAttachments;
    const hasAttachments = inputManager.hasAttachments;
    const temporaryModel = inputManager.temporaryModel;
    const continuationModel = inputManager.continuationModel;

    // === 4. Token 预览 ===
    const {
      tokenCount,
      isCalculatingTokens,
      tokenEstimated,
      triggerCalculation,
    } = useChatInputTokenPreview({ inputText, attachments, temporaryModel });

    // === 5. 模型信息计算属性 ===
    const temporaryModelInfo = computed(() => {
      if (!temporaryModel.value) return null;
      const profile = getProfileById(temporaryModel.value.profileId);
      const model = profile?.models.find(
        (m) => m.id === temporaryModel.value?.modelId
      );
      if (!profile || !model) return null;
      return { profileName: profile.name, modelName: model.name || model.id };
    });

    const continuationModelInfo = computed(() => {
      if (!continuationModel.value) return null;
      const profile = getProfileById(continuationModel.value.profileId);
      const model = profile?.models.find(
        (m) => m.id === continuationModel.value?.modelId
      );
      if (!profile || !model) return null;
      return { profileName: profile.name, modelName: model.name || model.id };
    });

    // === 6. 独立业务 Actions ===
    const chatStore = useLlmChatStore();
    const { translateText } = useTranslation();
    const { manualCompress } = useContextCompressor();

    const isTranslating = ref(false);
    const isCompressing = ref(false);

    // === 6b. 模型选择 Actions ===
    const { open: openModelSelectDialog } = useModelSelectDialog();
    const agentStore = useAgentStore();

    const getCurrentModelSelection = (modelRef: {
      value: { profileId: string; modelId: string } | null | undefined;
    }) => {
      const model = modelRef.value;
      if (model) {
        const profile = getProfileById(model.profileId);
        if (profile) {
          const m = profile.models.find(
            (item: any) => item.id === model.modelId
          );
          if (m) return { profile, model: m };
        }
      } else if (agentStore.currentAgentId) {
        const agent = agentStore.getAgentById(agentStore.currentAgentId);
        if (agent) {
          const profile = getProfileById(agent.profileId);
          if (profile) {
            const m = profile.models.find(
              (item: any) => item.id === agent.modelId
            );
            if (m) return { profile, model: m };
          }
        }
      }
      return null;
    };

    const handleSelectTemporaryModel = async () => {
      const currentSelection = getCurrentModelSelection(temporaryModel);
      const result = await openModelSelectDialog({
        current: currentSelection,
        initialCapabilities: { embedding: false, rerank: false },
      });
      if (result) {
        inputManager.setTemporaryModel({
          profileId: result.profile.id,
          modelId: result.model.id,
        });
      }
    };

    // 注册 textareaRef（由 MessageInput.vue 在 onMounted 时调用）
    let _textareaRef: any = null;
    const registerTextareaRef = (ref: any) => {
      _textareaRef = ref;
    };

    // 翻译输入
    const handleTranslateInput = async () => {
      if (isTranslating.value) return;
      const text = inputText.value.trim();
      if (!text) return;

      isTranslating.value = true;
      const textarea = _textareaRef?.value ?? _textareaRef;
      const { start, end } = textarea
        ? textarea.getSelectionRange()
        : { start: 0, end: 0 };
      const hasSelection = start !== end;
      const textToTranslate = hasSelection
        ? inputText.value.substring(start, end)
        : text;
      const targetLang = "English"; // 可从设置中读取

      try {
        const translatedText = await translateText(
          textToTranslate,
          undefined,
          undefined,
          targetLang
        );
        if (translatedText) {
          if (hasSelection) {
            textarea?.insertText(translatedText, start, end);
          } else {
            inputText.value = translatedText;
          }
          customMessage.success("翻译完成");
        }
      } finally {
        isTranslating.value = false;
      }
    };

    // 压缩上下文
    const handleCompressContext = async () => {
      if (isCompressing.value) return;
      const fullSession = chatStore.currentFullSession;
      if (!fullSession?.index || !fullSession?.detail) return;

      isCompressing.value = true;
      try {
        const result = await manualCompress(
          fullSession.index,
          fullSession.detail
        );
        if (result.success) {
          customMessage.success(
            `上下文压缩成功：已压缩 ${result.messageCount} 条消息`
          );
          triggerCalculation();
        } else {
          customMessage.info("没有可压缩的消息，或历史记录不足");
        }
      } catch (error) {
        errorHandler.error(error, "手动压缩失败");
      } finally {
        isCompressing.value = false;
      }
    };

    // 路径转换与占位符清理
    const handleConvertPaths = async () => {
      const result = await inputManager.convertPathsToAttachments();
      if (result.totalCount === 0) {
        customMessage.info("未在输入内容中检测到本地文件路径");
        return;
      }
      customMessage.success(`已成功转换 ${result.successCount} 个路径`);
    };

    const handleCleanupPlaceholders = () => {
      const { removedCount } = inputManager.cleanupInvalidPlaceholders();
      if (removedCount > 0) {
        customMessage.success(`已清理 ${removedCount} 个无效占位符`);
      } else {
        customMessage.info("未发现无效占位符");
      }
    };

    return {
      // 菜单可见性
      macroSelectorVisible,
      sessionListVisible,
      toolSettingsVisible,
      moreMenuVisible,
      settingsVisible,
      canvasMenuOpen,
      anyMenuOpen,
      // 持久化设置
      settings,
      // 输入状态代理
      inputText,
      attachments,
      isProcessingAttachments,
      hasAttachments,
      temporaryModel,
      continuationModel,
      // Token 预览
      tokenCount,
      isCalculatingTokens,
      tokenEstimated,
      triggerCalculation,
      // 模型信息
      temporaryModelInfo,
      continuationModelInfo,
      // 业务 Actions
      isTranslating,
      isCompressing,
      handleSelectTemporaryModel,
      registerTextareaRef,
      handleTranslateInput,
      handleCompressContext,
      handleConvertPaths,
      handleCleanupPlaceholders,
    };
  }
);
