import { ref, watch, type Ref } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useLlmChatStore } from "@/tools/llm-chat/store";
import { useAgentStore } from "@/tools/llm-chat/agentStore";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { MacroProcessor } from "../macro-engine/MacroProcessor";
import { buildMacroContext, processMacros } from "../core/context-utils/macro";
import { prepareMessageForTokenCalc } from "@/tools/llm-chat/utils/chatTokenUtils";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import type { Asset } from "@/types/asset-management";
import type { ChatMessageNode, ModelIdentifier } from "@/tools/llm-chat/types";

const logger = createModuleLogger("ChatInputTokenPreview");
const errorHandler = createModuleErrorHandler("ChatInputTokenPreview");

export interface TokenPreviewOptions {
  inputText: Ref<string>;
  attachments: Ref<Asset[]>;
  temporaryModel: Ref<ModelIdentifier | null>;
  debounceMs?: number;
}

/**
 * 专门管理输入框内容到 tokens 预览计算的逻辑
 */
export function useChatInputTokenPreview(options: TokenPreviewOptions) {
  const { inputText, attachments, temporaryModel, debounceMs = 800 } = options;

  const chatStore = useLlmChatStore();
  const agentStore = useAgentStore();

  const tokenCount = ref<number>(0);
  const isCalculatingTokens = ref(false);
  const tokenEstimated = ref(false);

  /**
   * 确定当前应使用的模型 ID
   */
  const resolveModelId = (): string | undefined => {
    // 1. 优先使用临时选中的模型
    if (temporaryModel.value) {
      return temporaryModel.value.modelId;
    }

    const session = chatStore.currentSession;
    if (!session) return undefined;

    // 2. 尝试从活动路径的助手消息中获取模型 ID
    let currentId: string | null = session.activeLeafId;
    while (currentId !== null) {
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (node?.role === "assistant" && node.metadata?.modelId) {
        return node.metadata.modelId;
      }
      currentId = node?.parentId ?? null;
    }

    // 3. 如果活动路径上没有，查找整个会话中的任意助手消息
    for (const n of Object.values(session.nodes)) {
      const node = n as ChatMessageNode;
      if (node.role === "assistant" && node.metadata?.modelId) {
        return node.metadata.modelId;
      }
    }

    // 4. 尝试使用会话的 displayAgentId
    if (session.displayAgentId) {
      const agent = agentStore.getAgentById(session.displayAgentId);
      if (agent?.modelId) {
        return agent.modelId;
      }
    }

    // 5. 最后尝试使用当前选中的智能体
    if (agentStore.currentAgentId) {
      const agent = agentStore.getAgentById(agentStore.currentAgentId);
      if (agent?.modelId) {
        return agent.modelId;
      }
    }

    return undefined;
  };

  /**
   * 预处理流程：宏展开
   */
  const preprocessMacros = async (text: string): Promise<string> => {
    if (!text.includes("{{")) return text;

    try {
      const session = chatStore.currentSession;
      const processor = new MacroProcessor();
      const agentId = agentStore.currentAgentId || session?.displayAgentId;
      const agent = agentId ? agentStore.getAgentById(agentId) : undefined;

      const context = buildMacroContext({ session: session || undefined, agent });
      return await processMacros(processor, text, context, { silent: true });
    } catch (e) {
      logger.warn("输入框 Token 预览宏展开失败", e);
      return text;
    }
  };

  /**
   * 计算 Token 的核心逻辑
   */
  const calculateTokens = async () => {
    const textValue = inputText.value.trim();
    const attachmentValue = attachments.value;

    // 如果没有文本且没有附件，重置 token 计数
    if (!textValue && attachmentValue.length === 0) {
      tokenCount.value = 0;
      tokenEstimated.value = false;
      return;
    }

    const modelId = resolveModelId();
    if (!modelId) {
      logger.warn("无法确定模型 ID，停止计算 token");
      tokenCount.value = 0;
      return;
    }

    isCalculatingTokens.value = true;
    try {
      // 1. 获取最新的附件状态
      const latestAttachments = await Promise.all(
        attachmentValue.map(async (asset) => {
          const latest = await assetManagerEngine.getAssetById(asset.id);
          return latest || asset;
        })
      );

      // 2. 文本预处理（目前主要是宏展开）
      const processedText = await preprocessMacros(inputText.value);

      // 3. 准备 Token 计算所需的消息格式
      const { combinedText, mediaAttachments } = await prepareMessageForTokenCalc(
        processedText,
        latestAttachments,
        modelId
      );

      // 4. 调用底层服务计算
      const result = await tokenCalculatorService.calculateMessageTokens(
        combinedText,
        modelId,
        mediaAttachments.length > 0 ? mediaAttachments : undefined
      );

      tokenCount.value = result.count;
      tokenEstimated.value = result.isEstimated ?? false;
    } catch (error) {
      errorHandler.error(error, "计算 token 失败");
      tokenCount.value = 0;
      tokenEstimated.value = false;
    } finally {
      isCalculatingTokens.value = false;
    }
  };

  // 防抖处理
  let timer: ReturnType<typeof setTimeout> | null = null;
  const triggerCalculation = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(calculateTokens, debounceMs);
  };

  // 监听所有可能影响 Token 计算的状态
  watch([inputText, () => attachments.value, temporaryModel], () => {
    triggerCalculation();
  }, { deep: true });

  // 监听会话或智能体变更（可能导致模型 ID 变化）
  watch(
    [() => chatStore.currentSessionId, () => agentStore.currentAgentId],
    () => {
      triggerCalculation();
    }
  );

  // 监听智能体内部模型变化
  watch(
    () => {
      if (!agentStore.currentAgentId) return null;
      const agent = agentStore.getAgentById(agentStore.currentAgentId);
      return agent?.modelId;
    },
    () => {
      triggerCalculation();
    }
  );

  return {
    tokenCount,
    isCalculatingTokens,
    tokenEstimated,
    calculateTokens, // 手动触发
    triggerCalculation, // 防抖触发
  };
}

