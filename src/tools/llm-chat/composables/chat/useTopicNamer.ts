/**
 * 话题命名 Composable
 * 负责自动或手动为会话生成标题
 */

import { ref } from "vue";
import type { ChatMessageNode, ChatSessionIndex, ChatSessionDetail } from "../../types";
import { useChatSettings } from "../settings/useChatSettings";
import { useSessionManager } from "../session/useSessionManager";
import { useNodeManager } from "../session/useNodeManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { formatDateTime } from "@/utils/time";

const logger = createModuleLogger("llm-chat/topic-namer");
const errorHandler = createModuleErrorHandler("llm-chat/topic-namer");

export function useTopicNamer() {
  // 正在生成标题的会话 ID 集合
  const generatingSessionIds = ref<Set<string>>(new Set());

  /**
   * 检查会话是否正在生成标题
   */
  const isGenerating = (sessionId: string): boolean => {
    return generatingSessionIds.value.has(sessionId);
  };

  /**
   * 为指定会话生成标题
   * @param session 目标会话 (Detail)
   * @param sessionIndexMap 索引 Map
   * @param sessionDetailMap 详情 Map
   * @param persistSession 持久化回调函数（可选，用于自动保存）
   * @returns 生成的标题，失败时返回 null
   */
  const generateTopicName = async (
    session: ChatSessionDetail,
    sessionIndexMap: Map<string, ChatSessionIndex>,
    sessionDetailMap: Map<string, ChatSessionDetail>,
    persistSession?: (index: ChatSessionIndex, detail: ChatSessionDetail, currentSessionId: string | null) => void,
  ): Promise<string | null> => {
    // 防止重复生成
    if (generatingSessionIds.value.has(session.id)) {
      logger.warn("会话正在生成标题，跳过重复请求", { sessionId: session.id });
      return null;
    }

    try {
      // 标记开始生成
      generatingSessionIds.value.add(session.id);

      // 获取设置
      const { settings, loadSettings, isLoaded } = useChatSettings();
      if (!isLoaded.value) {
        await loadSettings();
      }

      const namingConfig = settings.value.topicNaming;

      // 检查是否启用
      if (!namingConfig.enabled) {
        logger.warn("话题命名功能未启用", { sessionId: session.id });
        return null;
      }

      // 确定使用的模型标识符
      let modelIdentifier = namingConfig.modelIdentifier || settings.value.modelPreferences.defaultModel;

      // 检查模型配置
      if (!modelIdentifier) {
        errorHandler.handle(new Error("Model not configured"), {
          userMessage: "未配置话题命名模型且无全局默认模型",
          showToUser: false,
        });
        throw new Error("请先在设置中配置话题命名模型或全局默认模型");
      }

      // 解析模型标识符
      const firstColonIndex = modelIdentifier.indexOf(":");
      const profileId = modelIdentifier.substring(0, firstColonIndex);
      const modelId = modelIdentifier.substring(firstColonIndex + 1);

      if (!profileId || !modelId) {
        throw new Error("模型标识符格式错误");
      }

      // 获取会话的最新消息作为上下文
      const nodeManager = useNodeManager();
      const activePath = nodeManager.getNodePath(session, session.activeLeafId || "");

      // 过滤消息
      const validMessages = activePath
        .filter((node: ChatMessageNode) => node.role !== "system" && node.isEnabled !== false)
        .filter((node: ChatMessageNode) => node.role === "user" || node.role === "assistant");

      // 取最新的 N 条消息
      const contextMessages = validMessages.slice(-namingConfig.contextMessageCount);

      if (contextMessages.length === 0) {
        logger.warn("会话中没有可用的消息", { sessionId: session.id });
        return null;
      }

      // 构建上下文文本
      const contextText = contextMessages
        .map((node: ChatMessageNode) => {
          const role = node.role === "user" ? "用户" : "助手";
          return `${role}: ${node.content}`;
        })
        .join("\n\n");

      // 构建最终的提示词
      let finalPrompt = namingConfig.prompt.includes("{context}")
        ? namingConfig.prompt.replace("{context}", contextText)
        : `${namingConfig.prompt}\n\n${contextText}`;

      // 发送请求生成标题
      const { sendRequest } = useLlmRequest();
      const response = await sendRequest({
        profileId,
        modelId,
        messages: [{ role: "user", content: finalPrompt }],
        temperature: namingConfig.temperature,
        maxTokens: namingConfig.maxTokens,
        stream: false,
      });

      // 清理生成的标题
      let generatedTitle = response.content.trim();
      if (
        (generatedTitle.startsWith('"') && generatedTitle.endsWith('"')) ||
        (generatedTitle.startsWith("'") && generatedTitle.endsWith("'"))
      ) {
        generatedTitle = generatedTitle.slice(1, -1).trim();
      }
      generatedTitle = generatedTitle.replace(/[。！？，、；：""''（）《》【】…—·\.,!?;:\(\)\[\]<>]$/g, "").trim();

      const maxTitleLength = 50;
      if (generatedTitle.length > maxTitleLength) {
        generatedTitle = generatedTitle.substring(0, maxTitleLength) + "...";
      }

      if (!generatedTitle) {
        generatedTitle = `会话 ${formatDateTime(new Date(), "yyyy-MM-dd HH:mm:ss")}`;
      }

      logger.info("会话标题生成成功", { sessionId: session.id, newName: generatedTitle });

      // 更新会话名称
      const sessionManager = useSessionManager();
      sessionManager.updateSession(session.id, { name: generatedTitle }, sessionIndexMap, sessionDetailMap);

      // 如果提供了持久化回调，执行持久化
      if (persistSession) {
        const index = sessionIndexMap.get(session.id);
        if (index) {
          persistSession(index, session, session.id);
        }
      }

      return generatedTitle;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "生成会话标题失败",
        context: { sessionId: session.id },
      });
      return null;
    } finally {
      generatingSessionIds.value.delete(session.id);
    }
  };

  /**
   * 检查会话是否需要自动命名
   */
  const shouldAutoName = (session: ChatSessionDetail, sessionIndexMap: Map<string, ChatSessionIndex>): boolean => {
    const { settings } = useChatSettings();
    const namingConfig = settings.value.topicNaming;

    if (!namingConfig.enabled) return false;

    const modelIdentifier = namingConfig.modelIdentifier || settings.value.modelPreferences.defaultModel;
    if (!modelIdentifier) return false;

    const index = sessionIndexMap.get(session.id);
    if (!index || !index.name.startsWith("会话")) {
      return false;
    }

    const nodeManager = useNodeManager();
    const activePath = nodeManager.getNodePath(session, session.activeLeafId || "");
    const userMessageCount = activePath.filter(
      (node: ChatMessageNode) => node.role === "user" && node.isEnabled !== false,
    ).length;

    return userMessageCount >= namingConfig.autoTriggerThreshold;
  };

  return {
    generateTopicName,
    shouldAutoName,
    isGenerating,
  };
}
