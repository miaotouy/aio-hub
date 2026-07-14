import { useLlmChatStore } from "../stores/llmChatStore";
import { useLlmRequest } from "../../llm-api/composables/useLlmRequest";
import { useLlmProfilesStore } from "../../llm-api/stores/llmProfiles";
import { useNodeManager } from "./useNodeManager";
import { useContextPipelineStore } from "../stores/contextPipelineStore";
import { useChatResponseHandler } from "./useChatResponseHandler";
import { useTopicNamer } from "./useTopicNamer";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import type { ChatSession, PipelineContext, ChatMessageNode } from "../types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/useChatExecutor");

export function useChatExecutor() {
  const chatStore = useLlmChatStore();
  const llmRequest = useLlmRequest();
  const profilesStore = useLlmProfilesStore();
  const nodeManager = useNodeManager();
  const pipelineStore = useContextPipelineStore();
  const agentStore = useAgentStore();
  const { handleStreamUpdate, finalizeNode, handleNodeError } = useChatResponseHandler();
  const { shouldAutoName, generateTopicName } = useTopicNamer();

  /**
   * 执行对话请求
   */
  async function execute(
    session: ChatSession,
    userContent: string,
    parentNodeId?: string
  ) {
    if (chatStore.isSending) return;

    if (!agentStore.isLoaded) await agentStore.init();
    const activeAgent = agentStore.getAgentById(session.displayAgentId);

    // 智能体绑定优先；普通会话继续使用聊天页当前选择的模型。
    const [selectedProfileId, selectedModelId] = chatStore.selectedModelValue.split(":");
    const profileId = activeAgent?.profileId || selectedProfileId;
    const modelId = activeAgent?.modelId || selectedModelId;
    if (!profileId || !modelId) {
      logger.warn("No model selected");
      return;
    }

    const profile = profilesStore.profiles.find((p) => p.id === profileId);

    // 校验渠道是否有效且启用
    if (!profile || !profile.enabled) {
      logger.warn("Selected profile is not found or disabled", { profileId });
      return;
    }

    const model = profile.models.find((m) => m.id === modelId);
    if (!model) {
      logger.warn("Selected model is not found", { modelId });
      return;
    }

    // 1. 创建用户消息节点 (如果提供了 parentNodeId，说明是重试，不需要再创建用户节点)
    let currentUserNodeId = parentNodeId || "";
    if (!currentUserNodeId) {
      const userNode = nodeManager.createNode({
        role: "user",
        content: userContent,
        parentId: session.activeLeafId,
      });
      nodeManager.addNodeToSession(session, userNode);
      currentUserNodeId = userNode.id;
    }

    // 2. 创建助手消息节点（初始状态为 generating）
    const assistantNode = nodeManager.createNode({
      role: "assistant",
      content: "",
      parentId: currentUserNodeId,
      status: "generating",
      metadata: {
        modelId: modelId,
        modelDisplayName: model?.name || modelId,
        agentId: activeAgent?.id,
      },
    });
    nodeManager.addNodeToSession(session, assistantNode);

    // 3. 更新活跃节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    chatStore.isSending = true;

    try {
      // 4. 构造管道上下文并执行
      const pipelineContext: PipelineContext = {
        messages: [],
        session,
        agentConfig: activeAgent,
        settings: {}, // 移动端暂未引入完整的 ChatSettings
        capabilities: model.capabilities,
        timestamp: Date.now(),
        sharedData: new Map(),
        logs: [],
      };

      await pipelineStore.executePipeline(pipelineContext);

      // 5. 发起请求
      // 转换为 llmRequest 期望的格式，保留多模态内容能力
      const requestMessages = pipelineContext.messages
        .filter((m) => {
          // 过滤掉空内容的消息，除非是 user 角色（有时候 user 发送空内容是为了触发某些特定逻辑，但通常不建议）
          if (Array.isArray(m.content)) {
            return m.content.length > 0;
          }
          return !!m.content || m.role === "user";
        })
        .map((m) => ({
          role: m.role as any, // 映射到 LlmMessage['role']
          content: m.content,
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
          stream: true,
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
    } catch (error: any) {
      logger.error("Chat execution failed", error);
      handleNodeError(session, assistantNode.id, error, "对话执行");
    } finally {
      chatStore.isSending = false;
      session.updatedAt = new Date().toISOString();
      // 持久化当前会话
      await chatStore.persistCurrentSession();
    }
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
    regenerate,
  };
}
