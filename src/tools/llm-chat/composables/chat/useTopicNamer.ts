/**
 * 话题命名 Composable
 * 负责自动或手动为会话生成标题
 */

import { ref } from "vue";
import type {
  ChatMessageNode,
  ChatSessionIndex,
  ChatSessionDetail,
} from "../../types";
import { useChatSettings } from "../settings/useChatSettings";
import { useSessionManager } from "../session/useSessionManager";
import { useNodeManager } from "../session/useNodeManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useRichTextRendererStore } from "@/tools/rich-text-renderer/stores/store";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  TOPIC_NAMING_SYSTEM_PROMPT,
  buildTopicNamingRequestOptions,
  extractTopicTitle,
  getTopicStructuredOutputMode,
  isLikelyResponseFormatError,
  sanitizeTopicContextContent,
} from "../../utils/topicNamingUtils";

const logger = createModuleLogger("llm-chat/topic-namer");
const errorHandler = createModuleErrorHandler("llm-chat/topic-namer");

// 模块级共享状态，确保所有 useTopicNamer() 实例共享同一个生成状态
const generatingSessionIds = ref<Set<string>>(new Set());
const unsupportedStructuredOutputModelKeys = new Set<string>();

export function useTopicNamer() {
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
    persistSession?: (
      index: ChatSessionIndex,
      detail: ChatSessionDetail,
      currentSessionId: string | null
    ) => void
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
      const modelIdentifier =
        namingConfig.modelIdentifier ||
        settings.value.modelPreferences.defaultModel;

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

      const {
        getProfileById,
        loadProfiles,
        isLoaded: profilesLoaded,
      } = useLlmProfiles();
      if (!profilesLoaded.value) {
        await loadProfiles();
      }

      const profile = getProfileById(profileId);
      const model = profile?.models.find((item) => item.id === modelId);
      const modelCapabilities = model?.capabilities;
      const structuredOutputModelKey = `${profileId}:${modelId}`;
      const structuredOutputMode = getTopicStructuredOutputMode({
        profileType: profile?.type,
        modelId,
        modelProvider: model?.provider,
        capabilities: modelCapabilities,
      });
      const canTryStructuredOutput =
        !!structuredOutputMode &&
        !unsupportedStructuredOutputModelKeys.has(structuredOutputModelKey);
      const isThinkingModel = !!(
        modelCapabilities?.thinking ||
        (modelCapabilities?.thinkingConfigType &&
          modelCapabilities.thinkingConfigType !== "none")
      );
      const richTextRendererStore = useRichTextRendererStore();
      const thinkTagNames = richTextRendererStore.llmThinkRules
        .map((rule) => rule.tagName)
        .filter(Boolean);

      // 获取会话的最新消息作为上下文
      const nodeManager = useNodeManager();
      const activePath = nodeManager.getNodePath(
        session,
        session.activeLeafId || ""
      );

      // 过滤消息
      const validMessages = activePath
        .filter(
          (node: ChatMessageNode) =>
            node.role !== "system" && node.isEnabled !== false
        )
        .filter(
          (node: ChatMessageNode) =>
            node.role === "user" || node.role === "assistant"
        );

      // 取最新的 N 条消息
      const contextMessages = validMessages.slice(
        -namingConfig.contextMessageCount
      );

      if (contextMessages.length === 0) {
        logger.warn("会话中没有可用的消息", { sessionId: session.id });
        return null;
      }

      // 构建上下文文本
      const contextText = contextMessages
        .map((node: ChatMessageNode) => {
          const role = node.role === "user" ? "用户" : "助手";
          const content = sanitizeTopicContextContent(
            node.content,
            thinkTagNames
          );
          return content ? `${role}: ${content}` : "";
        })
        .filter(Boolean)
        .join("\n\n");

      if (!contextText) {
        logger.warn("会话消息清洗后没有可用内容", { sessionId: session.id });
        return null;
      }

      // 构建最终的提示词
      const finalPrompt = namingConfig.prompt.includes("{context}")
        ? namingConfig.prompt.split("{context}").join(contextText)
        : `${namingConfig.prompt}\n\n${contextText}`;

      // 发送请求生成标题：结构化输出优先，思考模型自动使用低预算兜底
      const { sendRequest } = useLlmRequest();
      const attempts: Array<{
        useStructuredOutput: boolean;
        isRetry: boolean;
      }> = [];
      const attemptedKeys = new Set<string>();
      const addAttempt = (useStructuredOutput: boolean, isRetry: boolean) => {
        const key = `${useStructuredOutput}:${isRetry}`;
        if (attemptedKeys.has(key)) return;
        attemptedKeys.add(key);
        attempts.push({ useStructuredOutput, isRetry });
      };

      addAttempt(canTryStructuredOutput, false);
      if (isThinkingModel) {
        addAttempt(canTryStructuredOutput, true);
      }
      if (canTryStructuredOutput) {
        addAttempt(false, isThinkingModel);
      }

      let generatedTitle: string | null = null;
      let structuredOutputUnavailable = false;
      let lastRequestError: unknown = null;

      for (const attempt of attempts) {
        const useStructuredOutput =
          attempt.useStructuredOutput && !structuredOutputUnavailable;

        try {
          const requestOptions = buildTopicNamingRequestOptions({
            profileId,
            modelId,
            temperature: namingConfig.temperature,
            maxTokens: namingConfig.maxTokens,
            capabilities: modelCapabilities,
            useStructuredOutput,
            structuredOutputMode: useStructuredOutput
              ? structuredOutputMode || undefined
              : undefined,
            isRetry: attempt.isRetry,
          });

          const response = await sendRequest({
            ...requestOptions,
            suppressErrorLog: useStructuredOutput,
            inspectorContext: {
              toolName: "llm-chat",
              sessionId: session.id,
              purpose: "regen-title",
            },
            messages: [
              { role: "system", content: TOPIC_NAMING_SYSTEM_PROMPT },
              { role: "user", content: finalPrompt },
            ],
          });

          generatedTitle = extractTopicTitle(response, { thinkTagNames });
          if (generatedTitle) {
            logger.debug("会话标题解析成功", {
              sessionId: session.id,
              useStructuredOutput,
              isRetry: attempt.isRetry,
              hasReasoningContent: !!response.reasoningContent,
              contentLength: response.content.length,
            });
            break;
          }

          logger.warn("话题命名响应未通过解析，准备尝试兜底策略", {
            sessionId: session.id,
            useStructuredOutput,
            isRetry: attempt.isRetry,
            hasReasoningContent: !!response.reasoningContent,
            contentLength: response.content.length,
            finishReason: response.finishReason,
          });
        } catch (error) {
          lastRequestError = error;

          if (useStructuredOutput && isLikelyResponseFormatError(error)) {
            structuredOutputUnavailable = true;
            unsupportedStructuredOutputModelKeys.add(structuredOutputModelKey);
            logger.warn("命名模型不支持结构化输出，降级为文本解析", {
              sessionId: session.id,
              profileId,
              modelId,
              error: error instanceof Error ? error.message : String(error),
            });
            continue;
          }

          throw error;
        }
      }

      if (!generatedTitle) {
        if (lastRequestError) {
          logger.warn("话题命名请求已降级但仍未得到可用标题", {
            sessionId: session.id,
            error:
              lastRequestError instanceof Error
                ? lastRequestError.message
                : String(lastRequestError),
          });
        } else {
          logger.warn("生成标题为空或包含脏内容，放弃更新", {
            sessionId: session.id,
          });
        }
        return null;
      }

      logger.info("会话标题生成成功", {
        sessionId: session.id,
        newName: generatedTitle,
      });

      // 更新会话名称
      const sessionManager = useSessionManager();
      sessionManager.updateSession(
        session.id,
        { name: generatedTitle },
        sessionIndexMap,
        sessionDetailMap
      );

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
  const shouldAutoName = (
    session: ChatSessionDetail,
    sessionIndexMap: Map<string, ChatSessionIndex>
  ): boolean => {
    const { settings } = useChatSettings();
    const namingConfig = settings.value.topicNaming;

    if (!namingConfig.enabled) {
      logger.debug("shouldAutoName: 话题命名未启用", {
        enabled: namingConfig.enabled,
      });
      return false;
    }

    const modelIdentifier =
      namingConfig.modelIdentifier ||
      settings.value.modelPreferences.defaultModel;
    if (!modelIdentifier) {
      logger.warn("shouldAutoName: 无模型标识符", {
        namingModel: namingConfig.modelIdentifier,
        defaultModel: settings.value.modelPreferences.defaultModel,
      });
      return false;
    }

    const index = sessionIndexMap.get(session.id);
    if (!index || !index.name.startsWith("会话")) {
      logger.debug("shouldAutoName: 会话名称不符合条件", {
        sessionId: session.id,
        hasIndex: !!index,
        name: index?.name,
      });
      return false;
    }

    const nodeManager = useNodeManager();
    const activePath = nodeManager.getNodePath(
      session,
      session.activeLeafId || ""
    );
    const userMessageCount = activePath.filter(
      (node: ChatMessageNode) =>
        node.role === "user" && node.isEnabled !== false
    ).length;

    if (userMessageCount < namingConfig.autoTriggerThreshold) {
      logger.debug("shouldAutoName: 用户消息数量不足", {
        sessionId: session.id,
        userMessageCount,
        threshold: namingConfig.autoTriggerThreshold,
        activeLeafId: session.activeLeafId,
        pathLength: activePath.length,
      });
      return false;
    }

    return true;
  };
  return {
    generateTopicName,
    shouldAutoName,
    isGenerating,
  };
}
