import { useLlmChatStore } from "../stores/llmChatStore";
import { parseSelectedModelValue } from "../utils/modelSelection";
import { useLlmRequest } from "../../llm-api/composables/useLlmRequest";
import { useLlmProfilesStore } from "../../llm-api/stores/llmProfiles";
import { useNodeManager } from "./useNodeManager";
import { useContextPipelineStore } from "../stores/contextPipelineStore";
import { useChatResponseHandler } from "./useChatResponseHandler";
import { useTopicNamer } from "./useTopicNamer";
import { useChatSettings } from "./useChatSettings";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useUserProfileStore } from "../stores/userProfileStore";
import { useWorldbookStore } from "../stores/worldbookStore";
import type {
  ChatMessageAttachment,
  ChatMessageReference,
  ChatSession,
  PipelineContext,
  ChatMessageNode,
} from "../types";
import { createModuleLogger } from "@/utils/logger";
import { countTokensBatch } from "@/utils/tokenCounting";
import { customMessage } from "@/utils/feedback";
import { useI18n } from "@/i18n";
import {
  contentToTokenText,
  createLocalContextUsage,
} from "../utils/contextTokenUsage";
import { buildMessageContent } from "../utils/attachmentContent";
import {
  getAttachmentAvailabilityMap,
  partitionAttachmentsByAvailability,
} from "../utils/attachmentStatus";
import { createAssistantAgentSnapshot } from "../services/agentSessionService";

const logger = createModuleLogger("llm-chat/useChatExecutor");
interface ActiveGeneration {
  controller: AbortController;
  sessionId: string;
  assistantNodeId: string;
}

// ChatInput and LlmChatView each create this composable independently. The
// active cancellation boundary must therefore be shared for the one global
// in-flight chat request.
let activeGeneration: ActiveGeneration | null = null;

export function useChatExecutor() {
  const chatStore = useLlmChatStore();
  const llmRequest = useLlmRequest();
  const profilesStore = useLlmProfilesStore();
  const nodeManager = useNodeManager();
  const pipelineStore = useContextPipelineStore();
  const agentStore = useAgentStore();
  const userProfileStore = useUserProfileStore();
  const worldbookStore = useWorldbookStore();
  const { handleStreamUpdate, finalizeNode, handleNodeError } =
    useChatResponseHandler();
  const { shouldAutoName, generateTopicName } = useTopicNamer();
  const { settings, loadSettings } = useChatSettings();
  const { tRaw } = useI18n();
  const t = (key: string) => tRaw(`tools.llm-chat.TokenUsage.${key}`);
  const chatT = (key: string) => tRaw(`tools.llm-chat.ChatView.${key}`);

  function stop(session: ChatSession): boolean {
    if (!activeGeneration || activeGeneration.sessionId !== session.id) return false;
    activeGeneration.controller.abort(
      new DOMException("Generation stopped by user", "AbortError")
    );
    return true;
  }

  /**
   * 执行对话请求
   */
  async function execute(
    session: ChatSession,
    userContent: string,
    parentNodeId?: string,
    attachments: ChatMessageAttachment[] = [],
    replyTo?: ChatMessageReference,
    continuationSource?: ChatMessageNode
  ): Promise<boolean> {
    if (chatStore.isSending) return false;

    if (attachments.length) {
      const availability = await getAttachmentAvailabilityMap(attachments, {
        force: true,
      });
      const { unavailable } = partitionAttachmentsByAvailability(
        attachments,
        availability
      );
      if (unavailable.length) {
        customMessage(chatT("所选附件不可用提示"), "warning");
        return false;
      }
    }

    if (!agentStore.isLoaded) await agentStore.init();
    if (!userProfileStore.isLoaded) await userProfileStore.init();
    if (!worldbookStore.isLoaded) await worldbookStore.init();
    await loadSettings();
    const activeAgent = agentStore.getAgentById(session.displayAgentId);
    const effectiveUserProfile = userProfileStore.getEffectiveProfile(
      activeAgent?.userProfileId
    );

    // 智能体绑定优先；普通会话继续使用聊天页当前选择的模型。
    const [selectedProfileId, selectedModelId] = parseSelectedModelValue(
      chatStore.selectedModelValue
    );
    const profileId = activeAgent?.profileId || selectedProfileId;
    const modelId = activeAgent?.modelId || selectedModelId;
    if (!profileId || !modelId) {
      logger.warn("No model selected");
      return false;
    }

    const profile = profilesStore.profiles.find((p) => p.id === profileId);

    // 校验渠道是否有效且启用
    if (!profile || !profile.enabled) {
      logger.warn("Selected profile is not found or disabled", { profileId });
      return false;
    }

    const model = profile.models.find((m) => m.id === modelId);
    if (!model) {
      logger.warn("Selected model is not found", { modelId });
      return false;
    }

    // 1. 创建用户消息节点（重试和续写会复用已有用户节点）。
    let currentUserNodeId = parentNodeId || "";
    let assistantNode: ChatMessageNode;

    if (continuationSource) {
      const continuationNode = nodeManager.createContinuationBranch(
        session,
        continuationSource.id
      );
      if (!continuationNode) return false;

      assistantNode = continuationNode;
      currentUserNodeId = continuationNode.parentId || "";
      // 使用本次实际请求的 Agent / 模型快照覆盖源分支中的旧绑定。
      assistantNode.metadata = {
        ...assistantNode.metadata,
        ...createAssistantAgentSnapshot(
          activeAgent,
          profileId,
          modelId,
          model.name || modelId
        ),
      };
    } else {
      if (!currentUserNodeId) {
        const userNode = nodeManager.createNode({
          role: "user",
          content: userContent,
          parentId: session.activeLeafId,
          attachments,
          metadata: replyTo ? { replyTo } : undefined,
        });
        nodeManager.addNodeToSession(session, userNode);
        currentUserNodeId = userNode.id;
      }

      // 2. 创建助手消息节点（初始状态为 generating）
      assistantNode = nodeManager.createNode({
        role: "assistant",
        content: "",
        parentId: currentUserNodeId,
        status: "generating",
        metadata: createAssistantAgentSnapshot(
          activeAgent,
          profileId,
          modelId,
          model.name || modelId
        ),
      });
      nodeManager.addNodeToSession(session, assistantNode);
    }

    // 3. 更新活跃节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    chatStore.isSending = true;
    const generation: ActiveGeneration = {
      controller: new AbortController(),
      sessionId: session.id,
      assistantNodeId: assistantNode.id,
    };
    activeGeneration = generation;

    try {
      // Persist the durable request boundary before network I/O so a process stop can be
      // recovered as an interrupted generation instead of losing the submitted message.
      await chatStore.persistCurrentSession();

      // 4. 构造管道上下文并执行
      const pipelineContext: PipelineContext = {
        messages: [],
        session,
        agentConfig: activeAgent,
        userProfile: effectiveUserProfile,
        settings: settings.value,
        capabilities: model.capabilities,
        timestamp: Date.now(),
        sharedData: new Map<string, unknown>([
          ["model", model],
          ["profile", profile],
          ["worldbooks", worldbookStore.getWorldbooksByIds(activeAgent?.worldbookIds)],
        ]),
        logs: [],
      };

      await pipelineStore.executePipeline(pipelineContext);
      if (generation.controller.signal.aborted) {
        throw generation.controller.signal.reason;
      }
      if (effectiveUserProfile)
        await userProfileStore.markUsed(effectiveUserProfile.id);

      const attachmentPreparation = pipelineContext.sharedData.get(
        "attachmentPreparationStats"
      ) as { skippedAttachmentCount?: number } | undefined;
      if (attachmentPreparation?.skippedAttachmentCount) {
        customMessage(
          chatT("跳过不可用历史附件").replace(
            "{count}",
            String(attachmentPreparation.skippedAttachmentCount)
          ),
          "warning"
        );
      }

      const requestContextMessages = pipelineContext.messages.filter(
        (message) => {
          // 不发送已剔除附件且没有文本的历史消息；当前输入仍可用附件触发请求。
          if (Array.isArray(message.content)) {
            return (
              message.content.length > 0 ||
              !!message._attachments?.length ||
              (message.role === "user" &&
                message.sourceId === currentUserNodeId)
            );
          }
          return (
            !!message.content ||
            !!message._attachments?.length ||
            (message.role === "user" && message.sourceId === currentUserNodeId)
          );
        }
      );

      const tokenResult = await countTokensBatch(
        requestContextMessages.map((message) =>
          contentToTokenText(message.content)
        )
      );
      const contextUsage = createLocalContextUsage(
        tokenResult,
        model.tokenLimits?.contextLength,
        settings.value.contextManagement
      );
      assistantNode.metadata = {
        ...assistantNode.metadata,
        contextUsage,
      };

      requestContextMessages.forEach((message, index) => {
        if (
          message.sourceType !== "session_history" ||
          typeof message.sourceId !== "string"
        ) {
          return;
        }
        const sourceNode = session.nodes[message.sourceId];
        if (!sourceNode || sourceNode.metadata?.contentTokenSource === "api")
          return;
        sourceNode.metadata = {
          ...sourceNode.metadata,
          contentTokens: tokenResult.counts[index] ?? 0,
          contentTokenSource: tokenResult.fallback ? "fallback" : "local",
          contentTokenizer: tokenResult.tokenizer,
        };
      });

      if (contextUsage.riskLevel === "critical") {
        customMessage(t("上下文高风险提示"), "error");
      } else if (contextUsage.riskLevel === "warning") {
        customMessage(t("上下文紧张提示"), "warning");
      }

      // 5. 发起请求
      const requestMessages = requestContextMessages.map((message) => ({
        role: message.role as any,
        content: buildMessageContent(message.content, message._attachments),
      }));

      const result = await llmRequest.sendRequest(
        {
          modelId,
          messages: requestMessages,
          maxTokens: activeAgent?.parameters?.maxTokens,
          temperature: activeAgent?.parameters?.temperature,
          topP: activeAgent?.parameters?.topP,
          frequencyPenalty: activeAgent?.parameters?.frequencyPenalty,
          presencePenalty: activeAgent?.parameters?.presencePenalty,
          stop: activeAgent?.parameters?.stop,
          stream: settings.value.uiPreferences.isStreaming,
          timeout: settings.value.requestSettings.timeout,
          maxRetries: settings.value.requestSettings.maxRetries,
          signal: generation.controller.signal,
          onStream: (chunk) => {
            handleStreamUpdate(session, assistantNode.id, chunk, false);
          },
          onReasoningStream: (chunk) => {
            handleStreamUpdate(session, assistantNode.id, chunk, true);
          },
        },
        profileId
      );

      // 如果返回 null，说明请求在底层被拦截或报错了（errorHandler 处理了）
      if (!result) {
        throw new Error("Request failed or was cancelled");
      }

      await finalizeNode(session, assistantNode.id, result);

      // 自动命名会话
      if (shouldAutoName(session)) {
        generateTopicName(session).catch((err) => {
          logger.error("Failed to auto name session", err);
        });
      }
    } catch (error: unknown) {
      if (generation.controller.signal.aborted) {
        const interruptedNode = session.nodes[assistantNode.id];
        if (interruptedNode) {
          interruptedNode.status = "complete";
          interruptedNode.metadata = {
            ...interruptedNode.metadata,
            interrupted: true,
            interruptedAt: Date.now(),
          };
        }
      } else {
        handleNodeError(session, assistantNode.id, error, chatT("对话执行失败"));
      }
    } finally {
      if (activeGeneration === generation) activeGeneration = null;
      chatStore.isSending = false;
      session.updatedAt = new Date().toISOString();
      // 持久化当前会话
      await chatStore.persistCurrentSession();
    }
    return true;
  }

  /**
   * 在已有助手消息的同级分支上继续生成。新分支从源回复的完整内容开始，
   * 请求管线读取该新活跃分支，因此模型可见续写前缀而不会改写原分支。
   */
  async function continueGeneration(
    session: ChatSession,
    messageNode: ChatMessageNode
  ): Promise<boolean> {
    if (
      chatStore.isSending ||
      messageNode.role !== "assistant" ||
      messageNode.status === "generating"
    ) {
      return false;
    }

    return execute(
      session,
      "",
      messageNode.parentId || undefined,
      [],
      undefined,
      messageNode
    );
  }

  /**
   * 重新生成（基于指定节点的父节点）
   */
  async function regenerate(
    session: ChatSession,
    messageNode: ChatMessageNode
  ) {
    if (chatStore.isSending) return;

    const parentNodeId =
      messageNode.role === "assistant" ? messageNode.parentId : messageNode.id;

    if (!parentNodeId || messageNode.role === "system") return;

    await execute(session, messageNode.content, parentNodeId);
  }

  return {
    execute,
    continueGeneration,
    regenerate,
    stop,
  };
}
