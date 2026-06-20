import { ref } from "vue";
import type {
  MediaMessage,
  MediaGeneratorSettings,
  GenerationSession,
} from "../../types";
import { createModuleLogger } from "@/utils/logger";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useRichTextRendererStore } from "@/tools/rich-text-renderer/stores/store";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { useNodeManager } from "../useNodeManager";
import {
  TOPIC_NAMING_SYSTEM_PROMPT,
  buildTopicNamingRequestOptions,
  extractTopicTitle,
  getTopicStructuredOutputMode,
  isLikelyResponseFormatError,
  sanitizeTopicContextContent,
} from "@/tools/llm-chat/utils/topicNamingUtils";

const logger = createModuleLogger("media-generator/ai-logic");
const unsupportedStructuredOutputModelKeys = new Set<string>();

export function useMediaGenAILogic(options: {
  settings: { value: MediaGeneratorSettings };
  nodes: { value: Record<string, MediaMessage> };
  activeLeafId: { value: string };
  updateSessionName: (sessionId: string, name: string) => Promise<void>;
}) {
  const { settings, nodes, activeLeafId, updateSessionName } = options;
  const { sendRequest } = useLlmRequest();
  const nodeManager = useNodeManager();

  const isNaming = ref(false);
  const generatingSessionIds = ref<Set<string>>(new Set());

  /**
   * AI 自动命名会话
   */
  const generateSessionName = async (
    sessionId: string,
    currentName: string
  ) => {
    if (isNaming.value || generatingSessionIds.value.has(sessionId)) return;

    const namingConfig = settings.value.topicNaming;
    if (!namingConfig.modelCombo) {
      logger.warn("未配置话题命名模型，跳过自动命名");
      return;
    }

    // LlmModelSelector 返回的格式通常是 profileId:modelId
    const [profileId, modelId] = parseModelCombo(namingConfig.modelCombo);

    try {
      isNaming.value = true;
      generatingSessionIds.value.add(sessionId);

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

      // 提取当前活跃路径作为上下文
      const tempSession = {
        nodes: nodes.value,
        activeLeafId: activeLeafId.value,
      } as GenerationSession;

      const activePath = nodeManager.getNodePath(
        tempSession,
        tempSession.activeLeafId
      );

      const context = activePath
        .filter(
          (n) =>
            n.role === "user" ||
            (n.role === "assistant" && n.metadata?.isMediaTask)
        )
        .map((n) => {
          const rawContent =
            n.role === "user"
              ? n.content
              : n.metadata?.taskSnapshot?.input?.prompt || n.content;
          const content = sanitizeTopicContextContent(
            rawContent,
            thinkTagNames
          );
          if (!content) return "";
          return n.role === "user"
            ? `用户输入: ${content}`
            : `生成任务: ${content}`;
        })
        .filter(Boolean)
        .slice(-(namingConfig.contextMessageCount || 5))
        .join("\n\n");

      if (!context) {
        logger.warn("提取上下文为空，跳过命名", { sessionId });
        return;
      }

      const prompt = namingConfig.prompt.replace("{context}", context);
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

      let newName: string | null = null;
      let structuredOutputUnavailable = false;

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
            messages: [
              { role: "system", content: TOPIC_NAMING_SYSTEM_PROMPT },
              { role: "user", content: prompt },
            ],
            inspectorContext: {
              toolName: "media-generator",
              sessionId,
              purpose: "session-naming",
            },
          });

          newName = extractTopicTitle(response, { thinkTagNames });
          if (newName) break;

          logger.warn("媒体会话命名响应未通过解析，准备尝试兜底策略", {
            sessionId,
            useStructuredOutput,
            isRetry: attempt.isRetry,
            hasReasoningContent: !!response.reasoningContent,
            contentLength: response.content.length,
            finishReason: response.finishReason,
          });
        } catch (error) {
          if (useStructuredOutput && isLikelyResponseFormatError(error)) {
            structuredOutputUnavailable = true;
            unsupportedStructuredOutputModelKeys.add(structuredOutputModelKey);
            logger.warn("媒体命名模型不支持结构化输出，降级为文本解析", {
              sessionId,
              profileId,
              modelId,
              error: error instanceof Error ? error.message : String(error),
            });
            continue;
          }

          throw error;
        }
      }

      if (newName && newName !== currentName) {
        await updateSessionName(sessionId, newName);
        logger.info("AI 命名成功", { sessionId, newName });
      } else if (!newName) {
        logger.warn("AI 命名结果为空或包含脏内容，放弃更新", { sessionId });
      }
    } catch (error) {
      logger.error("AI 命名失败", error);
    } finally {
      isNaming.value = false;
      generatingSessionIds.value.delete(sessionId);
    }
  };

  return {
    isNaming,
    generateSessionName,
  };
}
