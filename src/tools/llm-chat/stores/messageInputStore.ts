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
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useUserProfileStore } from "./userProfileStore";
import { MacroProcessor, createMacroContext } from "../macro-engine";
import type { MacroDefinition } from "../macro-engine";
import type { QuickAction } from "../types/quick-action";
import { open } from "@tauri-apps/plugin-dialog";
import { processInlineData } from "@/composables/useAttachmentProcessor";
import { useTranscriptionManager } from "../composables/features/useTranscriptionManager";
import type { PendingInputData } from "../types/context";

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
    const isDetached = ref(false);

    // === 6b. 跨窗口同步与模型选择 ===
    const bus = useWindowSyncBus();
    const { open: openModelSelectDialog } = useModelSelectDialog();
    const agentStore = useAgentStore();

    // 1. 会话管理
    const handleSwitchSession = (sessionId: string) => {
      if (isDetached.value) {
        bus.requestAction("llm-chat:switch-session", { sessionId });
      } else {
        chatStore.switchSession(sessionId);
      }
      sessionListVisible.value = false;
    };

    const handleNewSession = () => {
      const agentId = agentStore.currentAgentId || agentStore.defaultAgent?.id;
      if (!agentId) {
        customMessage.warning("没有可用的智能体来创建新会话");
        return;
      }
      if (isDetached.value) {
        bus.requestAction("llm-chat:create-session", { agentId });
      } else {
        chatStore.createSession(agentId);
      }
      sessionListVisible.value = false;
    };

    // 2. 模型选择
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

    const handleSelectContinuationModel = async () => {
      if (isDetached.value) {
        bus.requestAction("llm-chat:select-continuation-model", {});
        customMessage.info("正在主窗口中打开模型选择弹窗...");
        return;
      }

      const currentSelection = getCurrentModelSelection(continuationModel);
      const result = await openModelSelectDialog({
        current: currentSelection,
        initialCapabilities: { embedding: false, rerank: false },
      });
      if (result) {
        inputManager.setContinuationModel({
          profileId: result.profile.id,
          modelId: result.model.id,
        });
      }
    };

    // === 7. 核心交互回调注册 ===
    let _textareaRef: any = null;
    let _sendCallback: ((payload?: any) => void) | null = null;
    let _abortCallback: (() => void) | null = null;
    let _completeInputCallback:
      | ((content: string, options?: any) => void)
      | null = null;

    const registerTextareaRef = (ref: any) => {
      _textareaRef = ref;
    };

    const registerSendCallback = (fn: typeof _sendCallback) => {
      _sendCallback = fn;
    };

    const registerAbortCallback = (fn: typeof _abortCallback) => {
      _abortCallback = fn;
    };

    const registerCompleteInputCallback = (
      fn: typeof _completeInputCallback
    ) => {
      _completeInputCallback = fn;
    };

    // === 8. 核心 Actions ===
    const profileStore = useUserProfileStore();
    const transcriptionManager = useTranscriptionManager();

    // 处理发送
    const handleSend = async (payloadOverride?: any) => {
      const content = inputText.value.trim();
      const hasAttachmentsVal = hasAttachments.value;

      // 如果没有内容且没有附件，则不发送
      if (!content && !hasAttachmentsVal) {
        return;
      }

      // 发送前兜底：修复可能因竞态遗漏的 uploading 占位符
      inputManager.scanAndFixPlaceholders();

      const attachmentsVal =
        inputManager.attachmentCount.value > 0
          ? [...attachments.value]
          : undefined;
      const temporaryModelVal = temporaryModel.value;
      const disableMacroParsing = !settings.value.enableMacroParsing;

      const payload = payloadOverride || {
        content,
        attachments: attachmentsVal,
        temporaryModel: temporaryModelVal,
        disableMacroParsing,
      };

      if (isDetached.value) {
        bus.requestAction("llm-chat:send-message", payload);
        // 发送后清空输入（模拟主窗口行为）
        inputText.value = "";
      } else {
        _sendCallback?.(payload);
      }
    };

    // 处理中止
    const handleAbort = () => {
      if (isDetached.value) {
        bus.requestAction("llm-chat:abort-sending", {});
        return;
      }

      const detail = chatStore.currentSessionDetail;
      if (
        detail &&
        detail.activeLeafId &&
        chatStore.isNodeGenerating(detail.activeLeafId)
      ) {
        chatStore.abortNodeGeneration(detail.activeLeafId);
      } else {
        _abortCallback?.();
      }
    };

    // 执行快捷操作
    const handleQuickAction = async (action: QuickAction) => {
      const textarea = _textareaRef?.value ?? _textareaRef;
      if (!textarea) return;

      const { start, end } = textarea.getSelectionRange();
      const fullText = inputText.value;
      const hasSelection = start !== end;

      // 准备宏上下文中的 input 内容
      const macroInputText = hasSelection
        ? fullText.substring(start, end)
        : fullText;

      try {
        // 准备完整的宏上下文
        const session = chatStore.currentFullSession;
        const agent = agentStore.currentAgentId
          ? agentStore.getAgentById(agentStore.currentAgentId)
          : null;
        const userProfile = profileStore.getEffectiveProfile(
          agent?.userProfileId
        );

        const context = createMacroContext({
          userName: userProfile?.name,
          charName: agent?.name,
          index: session?.index,
          detail: session?.detail,
          agent: agent || undefined,
          userProfile: userProfile || undefined,
        });
        // 注入 input 宏内容
        context.input = macroInputText;

        // 使用宏引擎处理模板
        const processor = new MacroProcessor();
        const result = await processor.process(action.content, context, {
          silent: true,
        });
        let outputText = result.output;

        // 文本后处理 (每一行)
        if (action.lineProcessing?.enabled) {
          const {
            prefix = "",
            suffix = "",
            regexPattern,
            regexReplace = "",
            regexFlags = "g",
          } = action.lineProcessing;

          const lines = outputText.split("\n");
          const processedLines = lines.map((line) => {
            let processedLine = line;
            if (regexPattern) {
              try {
                const re = new RegExp(regexPattern, regexFlags);
                processedLine = processedLine.replace(re, regexReplace);
              } catch (e) {
                errorHandler.handle(e, {
                  userMessage: "正则替换失败",
                  showToUser: false,
                });
              }
            }
            return prefix + processedLine + suffix;
          });
          outputText = processedLines.join("\n");
        }

        // 写回编辑器
        if (hasSelection) {
          textarea.insertText(outputText, start, end);
        } else {
          inputText.value = outputText;
        }

        // 自动发送
        if (action.autoSend) {
          // 等待编辑器更新
          setTimeout(() => {
            handleSend();
          }, 50);
        } else {
          setTimeout(() => {
            textarea.focus();
          }, 0);
        }
      } catch (error) {
        errorHandler.error(error, "执行快捷操作失败");
      }
    };

    // 插入宏
    const handleInsertMacro = (macro: MacroDefinition) => {
      const textarea = _textareaRef?.value ?? _textareaRef;
      if (!textarea) return;

      const { start, end } = textarea.getSelectionRange();
      const insertText = macro.example || `{{${macro.name}}}`;
      textarea.insertText(insertText, start, end);

      setTimeout(() => {
        textarea.focus();
      }, 0);

      macroSelectorVisible.value = false;
    };

    // 处理分析当前上下文
    const handleAnalyzeContextWithInput = () => {
      const detail = chatStore.currentSessionDetail;

      const pendingInput: PendingInputData = {
        text: inputText.value,
        attachments: hasAttachments.value ? [...attachments.value] : undefined,
        temporaryModel: temporaryModel.value,
        enableMacroParsing: settings.value.enableMacroParsing,
      };

      chatStore.contextAnalyzerNodeId = detail?.activeLeafId ?? null;
      chatStore.contextAnalyzerPendingInput = pendingInput;
      chatStore.contextAnalyzerVisible = true;
    };

    // 触发附件选择
    const handleTriggerAttachment = async (disabled?: boolean) => {
      if (disabled) return;
      try {
        const selected = await open({
          multiple: true,
          title: "选择附件",
        });
        if (selected) {
          const paths = Array.isArray(selected) ? selected : [selected];
          const beforeIds = new Set(attachments.value.map((a) => a.id));

          await inputManager.addAttachments(paths);

          const newAssets = attachments.value.filter(
            (a) => !beforeIds.has(a.id)
          );

          // 注意：这里需要外部传入 autoInsertPlaceholder 设置，或者直接从 chatSettings 读取
          // 为了简化，我们假设外部会处理，或者在 store 内部注入 chatSettings
          // 这里我们先保留 logic，具体 autoInsertPlaceholder 在 MessageInput.vue 中调用时处理可能更合适
          // 但为了重构彻底，我们在这里处理
          return newAssets;
        }
      } catch (error) {
        errorHandler.error(error, "打开文件选择对话框失败");
        customMessage.error("选择文件失败");
      }
      return [];
    };

    // 处理输入补全
    const handleCompleteInput = (content: string) => {
      const options = continuationModel.value
        ? {
            modelId: continuationModel.value.modelId,
            profileId: continuationModel.value.profileId,
          }
        : undefined;

      if (isDetached.value) {
        bus.requestAction("llm-chat:complete-input", {
          content,
          options,
        });
        customMessage.info("正在主窗口中执行智能补全...");
      } else {
        _completeInputCallback?.(content, options);
      }
    };

    // 处理粘贴事件，智能提取 Base64 图像
    const handlePaste = async (event: ClipboardEvent) => {
      if (!settings.value.extractBase64FromPaste) return;

      const text = event.clipboardData?.getData("text/plain");
      if (!text || !text.includes("data:image") || !text.includes(";base64,"))
        return;

      const textarea = _textareaRef?.value ?? _textareaRef;
      const selection = textarea?.getSelectionRange() || {
        start: inputText.value.length,
        end: inputText.value.length,
      };

      try {
        event.preventDefault();
        const { processedText, newAssets } = await processInlineData(text, {
          sizeThresholdKB: 100,
          assetImportOptions: { sourceModule: "llm-chat-paste" },
        });
        if (newAssets.length > 0) {
          inputManager.addAssets(newAssets);
          customMessage.success(
            `已自动转换 ${newAssets.length} 个粘贴的图像为附件`
          );
        }
        if (textarea) {
          textarea.insertText(processedText, selection.start, selection.end);
          setTimeout(() => textarea.focus(), 0);
        }
      } catch (error) {
        errorHandler.handle(error, {
          userMessage: "Base64 粘贴提取处理失败",
          showToUser: false,
        });
        if (textarea) {
          textarea.insertText(text, selection.start, selection.end);
          setTimeout(() => textarea.focus(), 0);
        } else {
          inputText.value += text;
        }
      }
    };

    // 转写相关
    const handleTranscribeAll = () => {
      attachments.value.forEach((asset) => {
        const status = transcriptionManager.getTranscriptionStatus(asset);
        if (status === "none" || status === "error") {
          transcriptionManager.addTask(asset);
        }
      });
    };

    const handleSmartTranscribeAll = (
      getWillUseTranscription: (asset: any) => boolean
    ) => {
      attachments.value.forEach((asset) => {
        if (getWillUseTranscription(asset)) {
          const status = transcriptionManager.getTranscriptionStatus(asset);
          if (status === "none" || status === "error") {
            transcriptionManager.addTask(asset);
          }
        }
      });
    };

    const handleStopAllTranscriptions = () => {
      attachments.value.forEach((asset) => {
        const status = transcriptionManager.getTranscriptionStatus(asset);
        if (status === "pending" || status === "processing") {
          transcriptionManager.cancelTranscription(asset.id);
        }
      });
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
      const targetLang = "English";

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

    const clearTemporaryModel = () => inputManager.setTemporaryModel(null);
    const clearContinuationModel = () =>
      inputManager.setContinuationModel(null);

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
      isDetached,
      handleSwitchSession,
      handleNewSession,
      handleSelectTemporaryModel,
      handleSelectContinuationModel,
      clearTemporaryModel,
      clearContinuationModel,
      registerTextareaRef,
      registerSendCallback,
      registerAbortCallback,
      registerCompleteInputCallback,
      handleSend,
      handleAbort,
      handleQuickAction,
      handleInsertMacro,
      handleAnalyzeContextWithInput,
      handleTriggerAttachment,
      handleCompleteInput,
      handlePaste,
      handleTranscribeAll,
      handleSmartTranscribeAll,
      handleStopAllTranscriptions,
      handleTranslateInput,
      handleCompressContext,
      handleConvertPaths,
      handleCleanupPlaceholders,
    };
  }
);
