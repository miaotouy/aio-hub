<script setup lang="ts">
import { ref, toRef, computed, onMounted, onUnmounted } from "vue";
import { useStorage } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { useDetachable } from "@/composables/useDetachable";
import { useWindowResize } from "@/composables/useWindowResize";
import { useChatFileInteraction } from "@/composables/useFileInteraction";
import { processInlineData } from "@/composables/useAttachmentProcessor";
import { useChatInputManager } from "@/tools/llm-chat/composables/useChatInputManager";
import { useLlmChatStore } from "@/tools/llm-chat/store";
import { useAgentStore } from "@/tools/llm-chat/agentStore";
import { useChatSettings } from "@/tools/llm-chat/composables/useChatSettings";
import { useTranslation } from "@/tools/llm-chat/composables/useTranslation";
import { useContextCompressor } from "@/tools/llm-chat/composables/useContextCompressor";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useChatInputTokenPreview } from "@/tools/llm-chat/composables/useChatInputTokenPreview";
import type { Asset } from "@/types/asset-management";
import type { ModelIdentifier } from "@/tools/llm-chat/types";
import { customMessage } from "@/utils/customMessage";
import { useModelSelectDialog } from "@/composables/useModelSelectDialog";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useTranscriptionManager } from "@/tools/llm-chat/composables/useTranscriptionManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler"; // <-- 插入
import ComponentHeader from "@/components/ComponentHeader.vue";
import AttachmentCard from "../AttachmentCard.vue";
import MessageInputToolbar, { type InputToolbarSettings } from "./MessageInputToolbar.vue";
import type { MacroDefinition } from "../../macro-engine";

const logger = createModuleLogger("MessageInput");
const errorHandler = createModuleErrorHandler("MessageInput"); // <-- 插入
const bus = useWindowSyncBus();

// 获取聊天 store 以访问流式输出开关
const chatStore = useLlmChatStore();
const agentStore = useAgentStore();
const { settings, updateSettings, isLoaded: settingsLoaded, loadSettings } = useChatSettings();
const { translateText } = useTranslation();
const { manualCompress } = useContextCompressor();
const transcriptionManager = useTranscriptionManager();

// 翻译相关状态
const isTranslatingInput = ref(false);
// 压缩相关状态
const isCompressing = ref(false);
// 转写等待状态
const isWaitingForTranscription = ref(false);
const transcriptionAbortController = ref<AbortController | null>(null);

// 计算流式输出状态，在设置加载前默认为 false（非流式）
const isStreamingEnabled = computed(() => {
  return settingsLoaded.value ? settings.value.uiPreferences.isStreaming : false;
});

// UI 设置状态 (持久化)
const inputSettings = useStorage<InputToolbarSettings>("chat-input-settings", {
  showTokenUsage: true,
});

// 计算当前分支是否正在生成
const isCurrentBranchGenerating = computed(() => {
  const session = chatStore.currentSession;
  if (!session || !session.activeLeafId) return false;
  return chatStore.isNodeGenerating(session.activeLeafId);
});

// 切换流式输出模式
const toggleStreaming = () => {
  if (!isCurrentBranchGenerating.value) {
    updateSettings({
      uiPreferences: {
        ...settings.value.uiPreferences,
        isStreaming: !isStreamingEnabled.value,
      },
    });
  }
};

interface Props {
  disabled: boolean;
  isSending: boolean;
  isDetached?: boolean; // 是否在独立窗口中
}

interface Emits {
  (
    e: "send",
    payload: {
      content: string;
      attachments?: Asset[];
      temporaryModel?: ModelIdentifier | null;
    }
  ): void;
  (e: "abort"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const textareaRef = ref<HTMLTextAreaElement>();
const containerRef = ref<HTMLDivElement>();
const headerRef = ref<InstanceType<typeof ComponentHeader>>();
// const inputAreaRef = ref<HTMLDivElement>();

// 宏选择器状态
const macroSelectorVisible = ref(false);
const isExpanded = ref(false);

// 使用全局输入管理器（替代本地状态）
const inputManager = useChatInputManager();
const inputText = inputManager.inputText; // 全局响应式状态

// Token 预览逻辑
const {
  tokenCount,
  isCalculatingTokens,
  tokenEstimated,
  triggerCalculation: debouncedCalculateTokens,
} = useChatInputTokenPreview({
  inputText,
  attachments: inputManager.attachments,
  temporaryModel: inputManager.temporaryModel,
});

const attachmentManager = {
  attachments: inputManager.attachments,
  isProcessing: inputManager.isProcessingAttachments,
  hasAttachments: inputManager.hasAttachments,
  count: inputManager.attachmentCount,
  isFull: inputManager.isAttachmentsFull,
  addAttachments: inputManager.addAttachments,
  addAsset: inputManager.addAsset,
  removeAttachment: (asset: Asset) => inputManager.removeAttachment(asset.id),
  clearAttachments: inputManager.clearAttachments,
};

// 统一的文件交互处理（拖放 + 粘贴）
const { isDraggingOver } = useChatFileInteraction({
  element: containerRef,
  onPaths: async (paths) => {
    logger.info("文件拖拽触发", { paths, disabled: props.disabled });
    await inputManager.addAttachments(paths);
  },
  onAssets: async (assets) => {
    logger.info("文件粘贴触发", { count: assets.length });
    let successCount = 0;
    for (const asset of assets) {
      if (inputManager.addAsset(asset)) {
        successCount++;
      }
    }
    if (successCount > 0) {
      const message =
        successCount === 1 ? `已粘贴文件: ${assets[0].name}` : `已粘贴 ${successCount} 个文件`;
      customMessage.success(message);
    }
  },
  disabled: toRef(props, "disabled"),
});

// 处理发送
const handleSend = async () => {
  const content = inputText.value.trim();
  if (
    (!content && !inputManager.hasAttachments.value) ||
    props.disabled ||
    isWaitingForTranscription.value
  ) {
    logger.info("发送被阻止", {
      hasContent: !!content,
      hasAttachments: inputManager.hasAttachments.value,
      disabled: props.disabled,
      isDetached: props.isDetached,
      isWaiting: isWaitingForTranscription.value,
    });
    return;
  }

  // 检查是否需要等待转写 (wait_before_send 策略)
  if (
    settings.value.transcription.enabled &&
    settings.value.transcription.sendBehavior === "wait_before_send" &&
    inputManager.hasAttachments.value
  ) {
    const currentAttachments = inputManager.attachments.value;

    // 获取当前模型信息以判断是否需要转写
    let modelId = "";
    let profileId = "";

    if (inputManager.temporaryModel.value) {
      modelId = inputManager.temporaryModel.value.modelId;
      profileId = inputManager.temporaryModel.value.profileId;
    } else if (agentStore.currentAgentId) {
      const agent = agentStore.getAgentById(agentStore.currentAgentId);
      if (agent) {
        modelId = agent.modelId;
        profileId = agent.profileId;
      }
    }

    // 检查是否有正在进行或待处理的任务
    // 注意：tasks 是 reactive 对象，直接访问，不需要 .value
    const hasPendingTasks = transcriptionManager.tasks.some(
      (t) =>
        currentAttachments.some((a) => a.id === t.assetId) &&
        t.status !== "completed" &&
        t.status !== "error"
    );

    // 如果有挂起的任务，或者根据 Smart 策略需要启动新任务
    // 简单起见，我们总是调用 ensureTranscriptions，它内部会进行必要性检查
    // 但为了避免不必要的等待状态，我们可以先做一个预检查
    const needsTranscription = currentAttachments.some((a) =>
      transcriptionManager.checkTranscriptionNecessity(a, modelId, profileId)
    );

    if (hasPendingTasks || needsTranscription) {
      isWaitingForTranscription.value = true;
      transcriptionAbortController.value = new AbortController();
      customMessage.info("正在等待附件转写完成...");

      try {
        // 使用 Promise.race 实现可取消的等待
        await Promise.race([
          transcriptionManager.ensureTranscriptions(currentAttachments, modelId, profileId),
          new Promise((_, reject) => {
            if (transcriptionAbortController.value?.signal.aborted) {
              reject(new Error("User aborted"));
            }
            transcriptionAbortController.value?.signal.addEventListener("abort", () => {
              reject(new Error("User aborted"));
            });
          }),
        ]);
      } catch (error: any) {
        if (error.message === "User aborted") {
          logger.info("用户取消了发送（等待转写阶段）");
          return; // 直接返回，终止发送流程
        }
        logger.error("等待转写失败", error);
        customMessage.warning("部分附件转写失败，将发送原始文件");
      } finally {
        isWaitingForTranscription.value = false;
        transcriptionAbortController.value = null;
      }
    }
  }

  logger.info("发送消息", {
    contentLength: content.length,
    attachmentCount: inputManager.attachmentCount.value,
    temporaryModel: inputManager.temporaryModel.value,
    isDetached: props.isDetached,
  });

  // 发送消息和附件
  const attachments =
    inputManager.attachmentCount.value > 0 ? [...inputManager.attachments.value] : undefined;
  const temporaryModel = inputManager.temporaryModel.value;

  const payload = { content, attachments, temporaryModel };

  if (props.isDetached) {
    bus.requestAction("send-message", payload);
  } else {
    emit("send", payload);
  }

  // 清空输入框和附件（使用全局管理器）
  inputManager.clear();
  isExpanded.value = false;

  // 重置文本框高度
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
  }
};

// 处理中止
const handleAbort = () => {
  // 如果正在等待转写，优先取消转写等待
  if (isWaitingForTranscription.value) {
    transcriptionAbortController.value?.abort();
    return;
  }

  if (props.isDetached) {
    bus.requestAction("abort-sending", {});
    return;
  }

  const session = chatStore.currentSession;
  if (session && session.activeLeafId && isCurrentBranchGenerating.value) {
    chatStore.abortNodeGeneration(session.activeLeafId);
  } else {
    // 回退：如果没有明确的活动节点，尝试中止所有（虽然这种情况很少见）
    emit("abort");
  }
};

const handleTriggerAttachment = async () => {
  if (props.disabled) return;

  try {
    const selected = await open({
      multiple: true,
      title: "选择附件",
    });

    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      await inputManager.addAttachments(paths);
    }
  } catch (error) {
    errorHandler.error(error, "打开文件选择对话框失败"); // <-- 替换
    customMessage.error("选择文件失败");
  }
};

const toggleExpand = () => {
  if (props.isDetached) return;

  isExpanded.value = !isExpanded.value;
  if (textareaRef.value) {
    if (isExpanded.value) {
      // 展开
      textareaRef.value.style.height = "70vh";
    } else {
      // 收起
      textareaRef.value.style.removeProperty("height");
      autoResize();
    }
  }
};

// 处理键盘事件（根据设置动态处理）
const handleKeydown = (e: KeyboardEvent) => {
  const sendKey = settings.value.shortcuts.send;

  // 检查是否按下发送快捷键
  if (sendKey === "ctrl+enter") {
    // Ctrl/Cmd + Enter 发送
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  } else if (sendKey === "enter") {
    // 单独 Enter 发送，Shift + Enter 换行
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
};

// 计算 placeholder 文本（根据快捷键设置动态显示）
const placeholderText = computed(() => {
  if (props.disabled) {
    return "请先创建或选择一个对话";
  }

  const sendKey = settings.value.shortcuts.send;
  const sendHint =
    sendKey === "ctrl+enter" ? "Ctrl/Cmd + Enter 发送" : "Enter 发送, Shift + Enter 换行";
  return `输入消息、拖入或粘贴文件... (${sendHint})`;
});

// 自动调整文本框高度
const autoResize = () => {
  if (isExpanded.value) return;
  if (textareaRef.value) {
    // 重置高度以获取正确的 scrollHeight
    textareaRef.value.style.height = "auto";
    // 设置最小高度为当前内容高度，但不小于最小限制
    const newHeight = Math.max(40, textareaRef.value.scrollHeight);
    textareaRef.value.style.height = newHeight + "px";
  }
};

// 拖拽调整大小相关状态
const isResizing = ref(false);
const startY = ref(0);
const startHeight = ref(0);

// 拖拽开始处理 - 输入框高度调整
const handleInputResizeStart = (e: MouseEvent) => {
  isExpanded.value = false;
  isResizing.value = true;
  startY.value = e.clientY;

  if (textareaRef.value) {
    startHeight.value = textareaRef.value.offsetHeight;
  }

  // 阻止默认行为和文本选择
  e.preventDefault();
  document.body.style.cursor = "row-resize";
  document.body.style.userSelect = "none";

  // 添加全局事件监听
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
};

// 鼠标移动处理
const handleMouseMove = (e: MouseEvent) => {
  if (!isResizing.value || !textareaRef.value) return;

  // 计算高度差值
  const deltaY = startY.value - e.clientY;
  const newHeight = startHeight.value + deltaY;

  // 限制最小和最大高度
  const minHeight = 40;
  const maxHeight = props.isDetached ? window.innerHeight * 0.8 : window.innerHeight * 0.8;
  const finalHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

  // 直接设置 DOM 样式以获得最佳性能
  textareaRef.value.style.height = finalHeight + "px";
};

// 鼠标释放处理
const handleMouseUp = () => {
  isResizing.value = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";

  // 移除全局事件监听
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
};

// 双击手柄重置高度
const handleResizeDoubleClick = () => {
  isExpanded.value = false;
  autoResize();
};

// 组件卸载时清理事件监听
onUnmounted(() => {
  if (isResizing.value) {
    handleMouseUp();
  }
});
// ===== 拖拽与分离功能 =====
const { startDetaching } = useDetachable();
const handleDragStart = (e: MouseEvent) => {
  if (props.isDetached) return;

  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) {
    errorHandler.error(new Error("Container rect is null"), "无法获取容器尺寸，无法开始拖拽"); // <-- 替换
    return;
  }

  // 获取拖拽手柄的位置
  const headerEl = headerRef.value?.$el as HTMLElement;
  const headerRect = headerEl?.getBoundingClientRect();

  // 计算手柄相对于容器的偏移量
  let handleOffsetX = 0;
  let handleOffsetY = 0;

  if (headerRect) {
    // 手柄中心相对于容器左上角的偏移量
    handleOffsetX = headerRect.left - rect.left + headerRect.width / 2;
    handleOffsetY = headerRect.top - rect.top + headerRect.height / 2;

    logger.info("拖拽手柄偏移量计算", {
      mouseX: e.screenX,
      mouseY: e.screenY,
      handleOffsetX,
      handleOffsetY,
      headerWidth: headerRect.width,
      headerHeight: headerRect.height,
    });
  }

  startDetaching({
    id: "llm-chat:chat-input",
    displayName: "聊天输入框",
    type: "component",
    width: rect.width + 80,
    height: Math.max(rect.height + 80, 900), // 增加高度以容纳弹出气泡
    mouseX: e.screenX,
    mouseY: e.screenY,
    handleOffsetX,
    handleOffsetY,
  });
};

// 窗口大小调整功能 =====
const { createResizeHandler } = useWindowResize();
const handleResizeEast = createResizeHandler("East");
const handleResizeWest = createResizeHandler("West");

// 初始加载
onMounted(async () => {
  // 初始化转写管理器
  transcriptionManager.init();

  // 加载聊天设置（确保 isLoaded 标志被设置）
  if (!settingsLoaded.value) {
    await loadSettings();
    logger.info("MessageInput 聊天设置已加载", {
      isStreaming: settings.value.uiPreferences.isStreaming,
    });
  }

  // 如果是分离模式，强制调整窗口高度以容纳弹出气泡
  if (props.isDetached) {
    setTimeout(async () => {
      try {
        const win = getCurrentWindow();
        const size = await win.innerSize();
        // 如果高度不足 900，强制调整为 900，保持宽度不变
        if (size.height < 900) {
          await win.setSize(new PhysicalSize(size.width, 900));
          logger.info("已强制调整分离窗口高度", {
            originalHeight: size.height,
            newHeight: 900,
          });
        }
      } catch (e) {
        logger.warn("调整分离窗口大小失败", e);
      }
    }, 100);
  }
});
/**
 * 插入宏到光标位置
 */
function handleInsertMacro(macro: MacroDefinition) {
  const textarea = textareaRef.value;
  if (!textarea) return;

  // 获取当前光标位置
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;

  // 要插入的文本
  const insertText = macro.example || `{{${macro.name}}}`;

  // 拼接新内容
  const newContent =
    inputText.value.substring(0, start) + insertText + inputText.value.substring(end);

  // 更新内容
  inputText.value = newContent;

  // 关闭弹窗
  macroSelectorVisible.value = false;

  // 设置新的光标位置
  setTimeout(() => {
    textarea.focus();
    const newCursorPos = start + insertText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
  }, 0);
}

// 处理从菜单打开独立窗口
const handleDetach = async () => {
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) {
    errorHandler.error(new Error("Container rect is null"), "无法获取容器尺寸"); // <-- 替换
    return;
  }

  // 获取手柄位置用于计算偏移量
  const headerEl = headerRef.value?.$el as HTMLElement;
  const headerRect = headerEl?.getBoundingClientRect();

  let handleOffsetX = 0;
  let handleOffsetY = 0;

  if (headerRect) {
    handleOffsetX = headerRect.left - rect.left + headerRect.width / 2;
    handleOffsetY = headerRect.top - rect.top + headerRect.height / 2;
  }

  const config = {
    id: "llm-chat:chat-input",
    displayName: "聊天输入框",
    type: "component" as const,
    width: rect.width + 80,
    height: Math.max(rect.height + 80, 900), // 增加高度以容纳弹出气泡
    mouseX: window.screenX + rect.left + rect.width / 2,
    mouseY: window.screenY + rect.top + rect.height / 2,
    handleOffsetX,
    handleOffsetY,
  };

  logger.info("通过菜单请求分离窗口", { config });

  try {
    const sessionId = await invoke<string>("begin_detach_session", { config });
    if (sessionId) {
      await invoke("finalize_detach_session", {
        sessionId,
        shouldDetach: true,
      });
      logger.info("通过菜单分离窗口成功", { sessionId });
    } else {
      errorHandler.error(new Error("Session ID is null"), "开始分离会话失败，未返回会话 ID"); // <-- 替换
    }
  } catch (error) {
    errorHandler.error(error, "通过菜单分离窗口失败"); // <-- 替换
  }
};

/**
 * 处理粘贴事件，智能提取 Base64 图像
 */
const handlePaste = async (event: ClipboardEvent) => {
  const text = event.clipboardData?.getData("text/plain");
  if (!text) return;

  // 检查是否包含潜在的 Base64 图像数据
  if (!text.includes("data:image") || !text.includes(";base64,")) {
    return; // 不含 Base64 图像，使用默认粘贴行为
  }

  event.preventDefault();
  logger.info("检测到粘贴内容中可能含有 Base64 图像，开始处理...");

  const { processedText, newAssets } = await processInlineData(text, {
    sizeThresholdKB: 100, // 大于 100KB 的图像才转换为附件
    assetImportOptions: {
      sourceModule: "llm-chat-paste",
    },
  });

  if (newAssets.length > 0) {
    inputManager.addAssets(newAssets);
    customMessage.success(`已自动转换 ${newAssets.length} 个粘贴的图像为附件`);
  }

  // 将处理后的文本插入到光标位置
  const textarea = textareaRef.value;
  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent =
      inputText.value.substring(0, start) + processedText + inputText.value.substring(end);
    inputText.value = newContent;

    // 移动光标到插入文本的末尾
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + processedText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }
};

// 处理临时模型选择
const { open: openModelSelectDialog } = useModelSelectDialog();
const { getProfileById } = useLlmProfiles();

const handleSelectTemporaryModel = async () => {
  // 尝试定位当前模型，优先使用已选择的临时模型，否则回退到智能体默认模型
  let currentSelection = null;
  const temporaryModel = inputManager.temporaryModel.value;

  if (temporaryModel) {
    const profile = getProfileById(temporaryModel.profileId);
    if (profile) {
      const model = profile.models.find((m) => m.id === temporaryModel.modelId);
      if (model) {
        currentSelection = { profile, model };
      }
    }
  } else if (agentStore.currentAgentId) {
    const agent = agentStore.getAgentById(agentStore.currentAgentId);
    if (agent) {
      const profile = getProfileById(agent.profileId);
      if (profile) {
        const model = profile.models.find((m) => m.id === agent.modelId);
        if (model) {
          currentSelection = { profile, model };
        }
      }
    }
  }

  const result = await openModelSelectDialog({ current: currentSelection });
  if (result) {
    inputManager.setTemporaryModel({
      profileId: result.profile.id,
      modelId: result.model.id,
    });
  }
};

// 处理输入翻译
const handleTranslateInput = async () => {
  if (isTranslatingInput.value) return;

  const text = inputText.value.trim();
  if (!text) return;

  isTranslatingInput.value = true;

  // 保存当前光标位置和选区
  const textarea = textareaRef.value;
  const start = textarea ? textarea.selectionStart : 0;
  const end = textarea ? textarea.selectionEnd : 0;
  const hasSelection = start !== end;

  // 如果有选区，只翻译选中的文本；否则翻译全部
  const textToTranslate = hasSelection ? text.substring(start, end) : text;

  // 使用输入框专用的目标语言
  const targetLang = settings.value.translation.inputTargetLang || "English";

  try {
    const translatedText = await translateText(textToTranslate, undefined, undefined, targetLang);

    if (translatedText) {
      if (hasSelection) {
        // 替换选中文本
        const newText = text.substring(0, start) + translatedText + text.substring(end);
        inputText.value = newText;

        // 恢复光标并选中新翻译的文本
        setTimeout(() => {
          if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(start, start + translatedText.length);
          }
        }, 0);
      } else {
        // 替换全部文本
        inputText.value = translatedText;
        // 光标移到最后
        setTimeout(() => {
          if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(translatedText.length, translatedText.length);
          }
        }, 0);
      }

      customMessage.success("翻译完成");
      autoResize(); // 调整高度
    }
  } catch (error) {
    // 错误已在 useTranslation 中处理
  } finally {
    isTranslatingInput.value = false;
  }
};

// 处理切换会话
const handleSwitchSession = (sessionId: string) => {
  if (props.isDetached) {
    bus.requestAction("switch-session", { sessionId });
  } else {
    chatStore.switchSession(sessionId);
  }
};

// 处理新建会话
const handleNewSession = () => {
  // 使用当前选中的智能体，或使用默认智能体
  const agentId = agentStore.currentAgentId || agentStore.defaultAgent?.id;
  if (!agentId) {
    customMessage.warning("没有可用的智能体来创建新会话");
    return;
  }

  if (props.isDetached) {
    bus.requestAction("create-session", { agentId });
  } else {
    chatStore.createSession(agentId);
  }
};

// 处理手动压缩上下文
const handleCompressContext = async () => {
  if (isCompressing.value) return;

  const session = chatStore.currentSession;
  if (!session) return;

  // 检查是否在分离模式下，如果是，可能需要通过 bus 请求？
  // 目前压缩逻辑是在前端执行的，直接操作 store。
  // 如果在分离窗口中，store 是同步的吗？
  // useLlmChatStore 应该是同步的，或者至少能操作。
  // 假设可以直接操作。

  isCompressing.value = true;
  try {
    const result = await manualCompress(session);
    if (result) {
      customMessage.success("上下文压缩成功");
      // 触发 token 重新计算
      debouncedCalculateTokens();
    } else {
      customMessage.info("没有可压缩的消息，或历史记录不足");
    }
  } catch (error) {
    errorHandler.error(error, "手动压缩失败");
  } finally {
    isCompressing.value = false;
  }
};

/**
 * 检查附件是否会使用转写。
 * 在输入框中，我们不考虑消息深度，只考虑模型能力。
 */
const getWillUseTranscription = (asset: Asset): boolean => {
  let modelId = "";
  let profileId = "";

  const temporaryModel = inputManager.temporaryModel.value;
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

  if (!modelId || !profileId) {
    return false; // 无法确定模型，假定不使用转写
  }

  // 使用统一方法计算，输入框不考虑消息深度（传递 undefined）
  return transcriptionManager.computeWillUseTranscription(asset, modelId, profileId, undefined);
};
</script>
<template>
  <div
    ref="containerRef"
    :class="[
      'message-input-container',
      { 'detached-mode': isDetached, 'dragging-over': isDraggingOver },
    ]"
  >
    <!-- 分离模式下的壁纸层 -->
    <div
      v-if="isDetached && settings.uiPreferences.showWallpaperInDetachedMode"
      class="detached-wallpaper"
    ></div>

    <!-- 拖拽手柄 -->
    <div
      class="resize-handle"
      @mousedown="handleInputResizeStart"
      @dblclick="handleResizeDoubleClick"
      title="拖拽调整高度（双击重置）"
    ></div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 拖拽手柄：非分离模式用于触发分离，分离模式用于拖动窗口 -->
      <!-- 仅在分离模式下总是显示，或在非分离模式且设置允许时显示 -->
      <ComponentHeader
        v-if="isDetached || settings.uiPreferences.enableDetachableHandle"
        ref="headerRef"
        position="left"
        :drag-mode="isDetached ? 'window' : 'detach'"
        show-actions
        :collapsible="false"
        class="detachable-handle"
        @mousedown="handleDragStart"
        @detach="handleDetach"
      />

      <!-- 输入内容区 -->
      <div ref="inputAreaRef" class="input-content">
        <!-- 附件展示区 -->
        <div v-if="attachmentManager.hasAttachments.value" class="attachments-area">
          <div class="attachments-list">
            <AttachmentCard
              v-for="asset in attachmentManager.attachments.value"
              :key="asset.id"
              :asset="asset"
              :all-assets="attachmentManager.attachments.value"
              :removable="true"
              size="small"
              :will-use-transcription="getWillUseTranscription(asset)"
              @remove="attachmentManager.removeAttachment"
            />
          </div>
          <!-- 附件数量浮动显示 -->
          <div class="attachments-info">
            <span class="attachment-count"> {{ attachmentManager.count.value }} / {{ 20 }} </span>
          </div>
        </div>

        <div class="input-wrapper">
          <textarea
            ref="textareaRef"
            v-model="inputText"
            :disabled="disabled"
            :placeholder="placeholderText"
            class="message-textarea"
            rows="1"
            @keydown="handleKeydown"
            @input="autoResize"
            @paste="handlePaste"
          />
          <MessageInputToolbar
            :is-sending="isCurrentBranchGenerating || isWaitingForTranscription"
            :disabled="disabled"
            :is-detached="props.isDetached"
            :is-expanded="isExpanded"
            :is-streaming-enabled="isStreamingEnabled"
            v-model:macro-selector-visible="macroSelectorVisible"
            v-model:settings="inputSettings"
            :context-stats="chatStore.contextStats"
            :token-count="tokenCount"
            :is-calculating-tokens="isCalculatingTokens"
            :token-estimated="tokenEstimated"
            :input-text="inputText"
            :is-processing-attachments="attachmentManager.isProcessing.value"
            :temporary-model="inputManager.temporaryModel.value"
            :has-attachments="attachmentManager.hasAttachments.value"
            :is-translating="isTranslatingInput"
            :translation-enabled="settings.translation.enabled"
            :is-compressing="isCompressing"
            @toggle-streaming="toggleStreaming"
            @insert="handleInsertMacro"
            @toggle-expand="toggleExpand"
            @send="handleSend"
            @abort="handleAbort"
            @trigger-attachment="handleTriggerAttachment"
            @select-temporary-model="handleSelectTemporaryModel"
            @clear-temporary-model="inputManager.clearTemporaryModel"
            @translate-input="handleTranslateInput"
            @switch-session="handleSwitchSession"
            @new-session="handleNewSession"
            @compress-context="handleCompressContext"
          />
        </div>
      </div>
    </div>
    <!-- 左侧调整宽度手柄，仅在分离模式下显示 -->
    <div
      v-if="props.isDetached"
      class="resize-handle-left"
      @mousedown="handleResizeWest"
      title="拖拽调整宽度"
    ></div>
    <!-- 右侧调整宽度手柄，仅在分离模式下显示 -->
    <div
      v-if="props.isDetached"
      class="resize-handle-right"
      @mousedown="handleResizeEast"
      title="拖拽调整宽度"
    ></div>
  </div>
</template>

<style scoped>
.message-input-container {
  position: relative; /* For resize handle */
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  padding-top: 8px; /* 为拖拽手柄留出空间 */
  border-radius: 24px;
  border: 1px solid var(--border-color);
  background: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.message-input-container.dragging-over {
  background-color: var(--primary-color-alpha, rgba(64, 158, 255, 0.1));
  border-color: var(--primary-color);
}

/* 分离模式下组件完全一致，只是添加更强的阴影 */
.message-input-container.detached-mode {
  /* 移除 height: 100%，改为绝对定位沉底，让出上方空间给气泡 */
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: auto;
  box-shadow:
    0 8px 16px rgba(0, 0, 0, 0.25),
    0 4px 16px rgba(0, 0, 0, 0.15);
  /* 分离模式下使用专用的底层背景 */
  background-color: var(--detached-base-bg, var(--container-bg));
}

/* 分离模式壁纸层 */
.detached-wallpaper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  background-image: var(--wallpaper-url);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: var(--wallpaper-opacity);
  pointer-events: none;
  border-radius: inherit;
}

.main-content {
  display: flex;
  flex: 1;
  gap: 6px;
  align-items: stretch;
  min-width: 0;
  background: transparent; /* Ensure it doesn't have its own background */
  /* 提升层级，确保在壁纸之上 */
  position: relative;
  z-index: 1;
}

/* 分离手柄的特定样式 */
.detachable-handle {
  flex-shrink: 0;
  width: 26px;
  padding: 0;
  border: 1px solid var(--border-color);
  background: transparent;
  cursor: move;
  border-radius: 8px;
  align-self: flex-start;
}

/* 分离模式下，手柄也可以用于拖动窗口 */
.message-input-container.detached-mode .detachable-handle {
  cursor: move;
}

.input-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.attachments-area {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 8px;
  border-radius: 8px;
  background: var(--container-bg);
  border: 1px dashed var(--border-color);
}

.attachments-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attachments-info {
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 2px 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  border-radius: 12px;
  pointer-events: none;
  z-index: 1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.attachment-count {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.input-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 8px; /* Slightly smaller radius for nesting */
  /* overflow: hidden;  <-- 移除此行以允许 popover 在分离模式下溢出显示 */
}

.message-input-container:focus-within {
  border-color: var(--primary-color);
}
.message-textarea {
  box-sizing: border-box; /* 确保 height 属性包含 padding 和 border */
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.6;
  border: none;
  background-color: transparent;
  color: var(--text-color);
  resize: none;
  overflow-y: auto;
  font-family: inherit;
  min-height: 54px; /* 最小高度约1-2行 */
  max-height: 70vh; /* 默认最大高度约8行 */
}

/* 分离模式下取消最大高度限制 */
.message-input-container.detached-mode .message-textarea {
  max-height: 60vh; /* 给予较大的高度限制，但不撑满，留出上方空间给气泡 */
  flex: none; /* 取消强制填充，让输入框沉底 */
}
.message-input-container.detached-mode .input-content {
  justify-content: flex-end; /* 让输入框在分离窗口中沉底 */
}

.message-input-container.detached-mode .input-wrapper {
  flex: none; /* 让 wrapper 根据内容自适应高度，配合 justify-content: flex-end */
}

.message-textarea:focus {
  outline: none;
}

.message-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message-textarea::placeholder {
  color: var(--text-color-light);
}

/* 自定义滚动条 */
.message-textarea::-webkit-scrollbar {
  width: 6px;
}

.message-textarea::-webkit-scrollbar-track {
  background: var(--bg-color);
  border-radius: 3px;
}

.message-textarea::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.message-textarea::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}

/* 拖拽调整大小手柄 - 位于顶部 */
.resize-handle {
  position: absolute;
  top: -3px; /* 向上偏移，与父容器上边框重合 */
  left: 50%;
  transform: translateX(-50%);
  width: 94%;
  height: 6px; /* 创建一个足够灵敏的拖拽热区 */
  cursor: row-resize; /* 提示用户此处可拖拽 */
  z-index: 10; /* 确保在最上层，高于内容和壁纸 */
  border-radius: 3px;
  transition: background-color 0.2s;
}

.resize-handle:hover {
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.3);
}

.resize-handle:active {
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.4);
}

/* 左侧调整宽度手柄 - 扩展的透明热区 */
.resize-handle-left {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -8px; /* 热区超出容器边界 8px，更容易触发 */
  width: 32px; /* 扩展的热区宽度 */
  cursor: w-resize;
  z-index: 20;
}

/* 右侧调整宽度手柄 - 扩展的透明热区 */
.resize-handle-right {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -8px; /* 热区超出容器边界 8px，更容易触发 */
  width: 32px; /* 扩展的热区宽度 */
  cursor: e-resize;
  z-index: 20;
}

/* 当左侧手柄被 hover 时，给容器添加左侧粗描边 - 描边从容器自己"长出来" */
.message-input-container.detached-mode:has(.resize-handle-left:hover) {
  border-left: 4px solid var(--primary-color);
}

/* 当右侧手柄被 hover 时，给容器添加右侧粗描边 - 描边从容器自己"长出来" */
.message-input-container.detached-mode:has(.resize-handle-right:hover) {
  border-right: 4px solid var(--primary-color);
}

/* 当手柄被激活（拖拽中）时，描边更亮 */
.message-input-container.detached-mode:has(.resize-handle-left:active) {
  border-left: 4px solid var(--primary-color);
  box-shadow: -4px 0 12px rgba(var(--primary-color-rgb, 64, 158, 255), 0.4);
}

.message-input-container.detached-mode:has(.resize-handle-right:active) {
  border-right: 4px solid var(--primary-color);
  box-shadow: 4px 0 12px rgba(var(--primary-color-rgb, 64, 158, 255), 0.4);
}
</style>
