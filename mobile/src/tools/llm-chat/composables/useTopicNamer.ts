/**
 * 话题命名 Composable (移动端轻量版)
 * 负责自动为会话生成标题
 */

import { ref } from "vue";
import type { ChatSession, ChatMessageNode } from "../types";
import { useLlmRequest } from "../../llm-api/composables/useLlmRequest";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useSessionManager } from "./useSessionManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/topic-namer");
const errorHandler = createModuleErrorHandler("llm-chat/topic-namer");

// 模块级共享状态，确保所有 useTopicNamer() 实例共享同一个生成状态
const generatingSessionIds = ref<Set<string>>(new Set());

export function useTopicNamer() {
  const llmRequest = useLlmRequest();
  const chatStore = useLlmChatStore();
  const sessionManager = useSessionManager();

  /**
   * 获取会话的线性活跃路径（不含根节点）
   */
  const getNodePath = (session: ChatSession, leafId: string): ChatMessageNode[] => {
    const path: ChatMessageNode[] = [];
    let currentId: string | null = leafId;

    while (currentId !== null) {
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node) break;
      path.unshift(node);
      currentId = node.parentId;
    }

    return path.filter((n) => n.id !== session.rootNodeId);
  };

  /**
   * 检查会话是否正在生成标题
   */
  const isGenerating = (sessionId: string): boolean => {
    return generatingSessionIds.value.has(sessionId);
  };

  /**
   * 检查会话是否需要自动命名
   */
  const shouldAutoName = (session: ChatSession): boolean => {
    // 如果会话名称不是默认名称，则不需要自动命名
    const isDefaultName =
      session.name === "New Chat" ||
      session.name.startsWith("会话") ||
      session.name.trim() === "";

    if (!isDefaultName) {
      return false;
    }

    // 获取当前活跃路径上的消息
    const activePath = getNodePath(session, session.activeLeafId || "");
    const userMessageCount = activePath.filter(
      (node: ChatMessageNode) => node.role === "user"
    ).length;

    // 只有当用户发送了第一条消息时才触发自动命名
    return userMessageCount === 1;
  };

  /**
   * 为指定会话生成标题
   */
  const generateTopicName = async (session: ChatSession): Promise<string | null> => {
    if (generatingSessionIds.value.has(session.id)) {
      logger.warn("会话正在生成标题，跳过重复请求", { sessionId: session.id });
      return null;
    }

    // 解析当前选中的模型
    const [profileId, modelId] = chatStore.selectedModelValue.split(":");
    if (!profileId || !modelId) {
      logger.warn("No model selected for topic naming");
      return null;
    }

    try {
      generatingSessionIds.value.add(session.id);

      // 获取当前活跃路径上的消息作为上下文
      const activePath = getNodePath(session, session.activeLeafId || "");
      const validMessages = activePath.filter(
        (node: ChatMessageNode) => node.role === "user" || node.role === "assistant"
      );

      // 取前两条消息（第一条用户消息和第一条助手消息）作为命名依据
      const contextMessages = validMessages.slice(0, 2);
      if (contextMessages.length === 0) {
        return null;
      }

      const contextText = contextMessages
        .map((node: ChatMessageNode) => {
          const role = node.role === "user" ? "用户" : "助手";
          return `${role}: ${node.content}`;
        })
        .join("\n\n");

      const systemPrompt =
        "你是一个会话标题生成助手。请根据用户和助手的对话内容，生成一个极其简短、生动、切中要害的会话标题。\n" +
        "要求：\n" +
        "1. 标题长度严格控制在 10 个字以内。\n" +
        "2. 不要包含任何标点符号、引号、前缀（如“标题：”）或解释性文字。\n" +
        "3. 必须直接输出标题文本本身。";

      const userPrompt = `请为以下对话生成标题：\n\n${contextText}`;

      logger.info("开始为会话生成标题...", { sessionId: session.id, modelId });

      const response = await llmRequest.sendRequest({
        profileId,
        modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      });

      if (!response || !response.content) {
        logger.warn("生成标题响应为空");
        return null;
      }

      // 清洗生成的标题
      let title = response.content.trim();
      // 移除可能包含的引号
      title = title.replace(/^["'“‘]+|["'”’]+$/g, "");
      // 移除可能包含的“标题：”前缀
      title = title.replace(/^(标题|Title)[:：\s]*/i, "");
      title = title.trim();

      if (!title) {
        return null;
      }

      logger.info("会话标题生成成功", { sessionId: session.id, title });

      // 更新会话名称
      session.name = title;
      session.updatedAt = new Date().toISOString();

      // 持久化会话
      await sessionManager.persistSession(session, session.id);

      // 刷新 store 中的会话列表
      const { sessionMetas } = await sessionManager.loadSessions();
      chatStore.sessionMetas = sessionMetas;

      return title;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "生成会话标题失败",
        showToUser: false,
        context: { sessionId: session.id },
      });
      return null;
    } finally {
      generatingSessionIds.value.delete(session.id);
    }
  };

  return {
    isGenerating,
    shouldAutoName,
    generateTopicName,
  };
}