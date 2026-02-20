import { ref, type Ref } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranscriptionManager } from "@/tools/llm-chat/composables/features/useTranscriptionManager";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useAgentStore } from "../../stores/agentStore";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { useTranslation } from "@/tools/llm-chat/composables/chat/useTranslation";
import { useContextCompressor } from "@/tools/llm-chat/composables/features/useContextCompressor";
import { processInlineData } from "@/composables/useAttachmentProcessor";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useModelSelectDialog } from "@/composables/useModelSelectDialog";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import type { Asset } from "@/types/asset-management";
import { MacroProcessor, createMacroContext } from "../../macro-engine";
import type { MacroDefinition } from "../../macro-engine";
import type { ChatSettings } from "../../types/settings";
import type { QuickAction } from "../../types/quick-action";
import type { useChatInputManager } from "./useChatInputManager";
import type { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import type ChatCodeMirrorEditor from "../../components/message-input/ChatCodeMirrorEditor.vue";
import type { InputToolbarSettings } from "../../components/message-input/MessageInputToolbar.vue";

const logger = createModuleLogger("MessageInputActions");
const errorHandler = createModuleErrorHandler("MessageInputActions");

interface UseMessageInputActionsOptions {
  props: {
    disabled: boolean;
    isDetached?: boolean;
  };
  emit: {
    (e: "send", payload: any): void;
    (e: "abort"): void;
    (e: "complete-input", content: string, options?: any): void;
  };
  inputManager: ReturnType<typeof useChatInputManager>;
  inputText: Ref<string>;
  inputSettings: Ref<InputToolbarSettings>;
  settings: Ref<ChatSettings>;
  bus: ReturnType<typeof useWindowSyncBus>;
  textareaRef: Ref<InstanceType<typeof ChatCodeMirrorEditor> | undefined>;
  isCurrentBranchGenerating: Ref<boolean>;
  debouncedCalculateTokens: () => void;
  onBeforeSend?: () => void;
}

export function useMessageInputActions(options: UseMessageInputActionsOptions) {
  const chatStore = useLlmChatStore();
  const agentStore = useAgentStore();
  const profileStore = useUserProfileStore();
  const { translateText } = useTranslation();
  const { manualCompress } = useContextCompressor();
  const { open: openModelSelectDialog } = useModelSelectDialog();
  const { getProfileById } = useLlmProfiles();
  const transcriptionManager = useTranscriptionManager();

  const isTranslatingInput = ref(false);
  const isCompressing = ref(false);

  // 处理发送
  const handleSend = async () => {
    const content = options.inputText.value.trim();
    const hasAttachments = options.inputManager.hasAttachments.value;

    if (
      (!content && !hasAttachments) ||
      options.props.disabled ||
      options.isCurrentBranchGenerating.value
    ) {
      logger.info("发送被阻止", {
        hasContent: !!content,
        hasAttachments,
        disabled: options.props.disabled,
        isGenerating: options.isCurrentBranchGenerating.value,
        isDetached: options.props.isDetached,
      });

      if (options.isCurrentBranchGenerating.value) {
        customMessage.warning("请等待当前回复完成后再发送新消息");
      }
      return;
    }

    logger.info("发送消息", {
      contentLength: content.length,
      attachmentCount: options.inputManager.attachmentCount.value,
      temporaryModel: options.inputManager.temporaryModel.value,
      isDetached: options.props.isDetached,
    });

    options.onBeforeSend?.();

    const attachments =
      options.inputManager.attachmentCount.value > 0
        ? [...options.inputManager.attachments.value]
        : undefined;
    const temporaryModel = options.inputManager.temporaryModel.value;
    const disableMacroParsing = !options.inputSettings.value.enableMacroParsing;

    const payload = { content, attachments, temporaryModel, disableMacroParsing };

    if (options.props.isDetached) {
      options.bus.requestAction("send-message", payload);
    } else {
      options.emit("send", payload);
    }
  };

  // 处理中止
  const handleAbort = () => {
    if (options.props.isDetached) {
      options.bus.requestAction("abort-sending", {});
      return;
    }

    const session = chatStore.currentSession;
    if (session && session.activeLeafId && options.isCurrentBranchGenerating.value) {
      chatStore.abortNodeGeneration(session.activeLeafId);
    } else {
      options.emit("abort");
    }
  };

  // 执行快捷操作
  const handleQuickAction = async (action: QuickAction) => {
    const textarea = options.textareaRef.value;
    if (!textarea) return;

    const { start, end } = textarea.getSelectionRange();
    const fullText = options.inputText.value;
    const hasSelection = start !== end;

    // 准备宏上下文中的 input 内容
    const inputText = hasSelection ? fullText.substring(start, end) : fullText;

    try {
      // 准备完整的宏上下文
      const session = chatStore.currentSession;
      const agent = agentStore.currentAgentId
        ? agentStore.getAgentById(agentStore.currentAgentId)
        : null;
      const userProfile = profileStore.globalProfile;

      const context = createMacroContext({
        userName: userProfile?.name,
        charName: agent?.name,
        session: session || undefined,
        agent: agent || undefined,
        userProfile: userProfile || undefined,
      });

      // 注入 input 宏内容
      context.input = inputText;

      // 使用宏引擎处理模板
      const processor = new MacroProcessor();
      const result = await processor.process(action.content, context, { silent: true });

      // 写回编辑器
      if (hasSelection) {
        textarea.insertText(result.output, start, end);
      } else {
        options.inputText.value = result.output;
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
    const textarea = options.textareaRef.value;
    if (!textarea) return;

    const { start, end } = textarea.getSelectionRange();
    const insertText = macro.example || `{{${macro.name}}}`;
    textarea.insertText(insertText, start, end);

    setTimeout(() => {
      textarea.focus();
    }, 0);
  };

  // 翻译输入
  const handleTranslateInput = async () => {
    if (isTranslatingInput.value) return;

    const text = options.inputText.value.trim();
    if (!text) return;

    isTranslatingInput.value = true;
    const textarea = options.textareaRef.value;
    const { start, end } = textarea ? textarea.getSelectionRange() : { start: 0, end: 0 };
    const hasSelection = start !== end;
    const textToTranslate = hasSelection ? text.substring(start, end) : text;
    const targetLang = options.settings.value.translation.inputTargetLang || "English";

    try {
      const translatedText = await translateText(textToTranslate, undefined, undefined, targetLang);
      if (translatedText) {
        if (hasSelection) {
          textarea?.insertText(translatedText, start, end);
          setTimeout(() => {
            if (textarea) {
              textarea.focus();
              textarea.setSelectionRange(start, start + translatedText.length);
            }
          }, 0);
        } else {
          options.inputText.value = translatedText;
          setTimeout(() => {
            if (textarea) {
              textarea.focus();
              textarea.setSelectionRange(translatedText.length, translatedText.length);
            }
          }, 0);
        }
        customMessage.success("翻译完成");
      }
    } catch (error) {
      // 错误已在 useTranslation 中处理
    } finally {
      isTranslatingInput.value = false;
    }
  };

  // 压缩上下文
  const handleCompressContext = async () => {
    if (isCompressing.value) return;
    const session = chatStore.currentSession;
    if (!session) return;

    isCompressing.value = true;
    try {
      const result = await manualCompress(session);
      if (result.success) {
        const msg =
          `上下文压缩成功：已压缩 ${result.messageCount} 条消息` +
          (result.savedTokenCount
            ? `，节省约 ${result.savedTokenCount.toLocaleString()} Token`
            : "");
        customMessage.success(msg);
        options.debouncedCalculateTokens();
      } else {
        customMessage.info("没有可压缩的消息，或历史记录不足");
      }
    } catch (error) {
      errorHandler.error(error, "手动压缩失败");
    } finally {
      isCompressing.value = false;
    }
  };

  // 模型选择辅助函数
  const getCurrentModelSelection = (modelRef: Ref<any>) => {
    let currentSelection = null;
    const model = modelRef.value;

    if (model) {
      const profile = getProfileById(model.profileId);
      if (profile) {
        const m = profile.models.find((item: any) => item.id === model.modelId);
        if (m) currentSelection = { profile, model: m };
      }
    } else if (agentStore.currentAgentId) {
      const agent = agentStore.getAgentById(agentStore.currentAgentId);
      if (agent) {
        const profile = getProfileById(agent.profileId);
        if (profile) {
          const m = profile.models.find((item: any) => item.id === agent.modelId);
          if (m) currentSelection = { profile, model: m };
        }
      }
    }
    return currentSelection;
  };

  // 处理临时模型选择
  const handleSelectTemporaryModel = async () => {
    const currentSelection = getCurrentModelSelection(options.inputManager.temporaryModel);
    const result = await openModelSelectDialog({ current: currentSelection });
    if (result) {
      options.inputManager.setTemporaryModel({
        profileId: result.profile.id,
        modelId: result.model.id,
      });
    }
  };

  // 处理续写模型选择
  const handleSelectContinuationModel = async () => {
    if (options.props.isDetached) {
      options.bus.requestAction("select-continuation-model", {});
      return;
    }

    const currentSelection = getCurrentModelSelection(options.inputManager.continuationModel);
    const result = await openModelSelectDialog({ current: currentSelection });
    if (result) {
      options.inputManager.setContinuationModel({
        profileId: result.profile.id,
        modelId: result.model.id,
      });
    }
  };

  // 触发附件选择
  const handleTriggerAttachment = async () => {
    if (options.props.disabled) return;
    try {
      const selected = await open({
        multiple: true,
        title: "选择附件",
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        const beforeIds = new Set(options.inputManager.attachments.value.map((a) => a.id));

        await options.inputManager.addAttachments(paths);

        const newAssets = options.inputManager.attachments.value.filter(
          (a) => !beforeIds.has(a.id)
        );
        options.inputManager.handleAssetsAddition(
          newAssets,
          options.textareaRef.value,
          options.settings.value.transcription.autoInsertPlaceholder
        );
      }
    } catch (error) {
      errorHandler.error(error, "打开文件选择对话框失败");
      customMessage.error("选择文件失败");
    }
  };

  // 处理键盘事件
  const handleKeydown = (e: KeyboardEvent) => {
    const sendKey = options.settings.value.shortcuts.send;
    if (sendKey === "ctrl+enter") {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    } else if (sendKey === "enter") {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  // 处理粘贴事件，智能提取 Base64 图像
  const handlePaste = async (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData("text/plain");
    if (
      !text ||
      !options.inputSettings.value.extractBase64FromPaste ||
      !text.includes("data:image") ||
      !text.includes(";base64,")
    )
      return;

    const textarea = options.textareaRef.value;
    const selection = textarea?.getSelectionRange() || {
      start: options.inputText.value.length,
      end: options.inputText.value.length,
    };

    try {
      event.preventDefault();
      const { processedText, newAssets } = await processInlineData(text, {
        sizeThresholdKB: 100,
        assetImportOptions: { sourceModule: "llm-chat-paste" },
      });
      if (newAssets.length > 0) {
        options.inputManager.addAssets(newAssets);
        customMessage.success(`已自动转换 ${newAssets.length} 个粘贴的图像为附件`);
      }
      if (textarea) {
        textarea.insertText(processedText, selection.start, selection.end);
        setTimeout(() => textarea.focus(), 0);
      }
    } catch (error) {
      logger.warn("Base64 粘贴提取处理失败，回退到普通文本粘贴", error);
      if (textarea) {
        textarea.insertText(text, selection.start, selection.end);
        setTimeout(() => textarea.focus(), 0);
      } else {
        options.inputText.value += text;
      }
    }
  };

  // 处理输入补全
  const handleCompleteInput = (content: string) => {
    const options_ = options.inputManager.continuationModel.value
      ? {
          modelId: options.inputManager.continuationModel.value.modelId,
          profileId: options.inputManager.continuationModel.value.profileId,
        }
      : undefined;

    if (options.props.isDetached) {
      options.bus.requestAction("complete-input", { content, options: options_ });
    } else {
      options.emit("complete-input", content, options_);
    }
  };

  // 处理切换会话
  const handleSwitchSession = (sessionId: string) => {
    if (options.props.isDetached) {
      options.bus.requestAction("switch-session", { sessionId });
    } else {
      chatStore.switchSession(sessionId);
    }
  };

  // 处理新建会话
  const handleNewSession = () => {
    const agentId = agentStore.currentAgentId || agentStore.defaultAgent?.id;
    if (!agentId) {
      customMessage.warning("没有可用的智能体来创建新会话");
      return;
    }

    if (options.props.isDetached) {
      options.bus.requestAction("create-session", { agentId });
    } else {
      chatStore.createSession(agentId);
    }
  };

  /**
   * 检查附件是否会使用转写
   */
  const getWillUseTranscription = (asset: Asset): boolean => {
    let modelId = "";
    let profileId = "";
    const temporaryModel = options.inputManager.temporaryModel.value;
    if (temporaryModel) {
      modelId = temporaryModel.modelId;
      profileId = temporaryModel.profileId;
    } else if (agentStore.currentAgentId) {
      const agent = agentStore.getAgentById(agentStore.currentAgentId);
      if (agent) {
        modelId = agent.modelId;
        profileId = agent.profileId;
      }
    }
    return transcriptionManager.computeWillUseTranscription(asset, modelId, profileId, undefined);
  };

  return {
    isTranslatingInput,
    isCompressing,
    handleSend,
    handleAbort,
    handleQuickAction,
    handleInsertMacro,
    handleTranslateInput,
    handleCompressContext,
    handleSelectTemporaryModel,
    handleSelectContinuationModel,
    handleTriggerAttachment,
    handleKeydown,
    handlePaste,
    handleCompleteInput,
    handleSwitchSession,
    handleNewSession,
    getWillUseTranscription,
  };
}
