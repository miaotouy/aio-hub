import { useLlmChatStore } from "../stores/llmChatStore";
import { useLlmRequest } from "../../llm-api/composables/useLlmRequest";
import { useLlmProfilesStore } from "../../llm-api/stores/llmProfiles";
import { useNodeManager } from "./useNodeManager";
import { useContextPipelineStore } from "../stores/contextPipelineStore";
import type { ChatSession, PipelineContext, ChatMessageNode } from "../types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/useChatExecutor");

export function useChatExecutor() {
  const chatStore = useLlmChatStore();
  const llmRequest = useLlmRequest();
  const profilesStore = useLlmProfilesStore();
  const nodeManager = useNodeManager();
  const pipelineStore = useContextPipelineStore();

  /**
   * 执行对话请求
   */
  async function execute(session: ChatSession, userContent: string, parentNodeId?: string) {
    if (chatStore.isSending) return;

    // 解析当前选中的模型
    const [profileId, modelId] = chatStore.selectedModelValue.split(":");
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
        agentConfig: {}, // 移动端暂未引入完整的 ChatAgent
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

      const result = await llmRequest.sendRequest({
        profileId,
        modelId,
        messages: requestMessages,
        stream: true,
        onStream: (chunk) => {
          assistantNode.content += chunk;
          session.updatedAt = new Date().toISOString();
        },
      });

      // 如果返回 null，说明请求在底层被拦截或报错了（errorHandler 处理了）
      if (!result) {
        throw new Error("Request failed or was cancelled");
      }

      if (!result.isStream) {
        assistantNode.content = result.content || "";
      }

      assistantNode.status = "complete";
    } catch (error: any) {
      logger.error("Chat execution failed", error);
      assistantNode.status = "error";
      assistantNode.metadata = {
        ...assistantNode.metadata,
        error: error.message || "Unknown error",
      };
      // 确保 session 状态更新以触发 UI
      session.updatedAt = new Date().toISOString();
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
  async function regenerate(session: ChatSession, messageNode: ChatMessageNode) {
    if (chatStore.isSending) return;

    // 如果是 assistant 消息，使用其父节点 (通常是 user)
    // 如果是 user 消息，使用其父节点 (通常是 assistant 或 system)
    const parentNodeId = messageNode.parentId;
    if (!parentNodeId) return;

    // 找到父节点的内容（如果是重试 user 消息，需要父节点内容作为输入吗？不，重试通常是指基于同样的上下文再跑一次）
    // 这里我们简单处理：如果是重试 AI 消息，我们就用同样的上下文再请求一次
    await execute(session, "", parentNodeId);
  }

  return {
    execute,
    regenerate,
  };
}
