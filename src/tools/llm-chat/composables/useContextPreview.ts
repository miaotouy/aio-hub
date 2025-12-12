import type {
  ChatSession,
  ChatMessageNode,
  ContextPostProcessRule,
} from "../types";
import type {
  LlmContextData,
  ContextPreviewData,
  ProcessableMessage,
} from "../types/context";
import type { LlmParameters } from "../types/llm";
import { createModuleLogger } from "@/utils/logger";
import { useMessageBuilder } from "./useMessageBuilder";
import { useMacroProcessor } from "./useMacroProcessor";
import { useChatSettings } from "./useChatSettings";
import { calculatePostProcessingTokenDelta } from "../core/context-processors/post/builtin-processors";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";
import { getMatchedModelProperties } from "@/config/model-metadata";
import { useUserProfileStore } from "../userProfileStore";
import { resolveAvatarPath } from "./useResolvedAvatar";
import { ALL_LLM_PARAMETER_KEYS } from "../config/parameter-config";

const logger = createModuleLogger("llm-chat/context-preview");

export function useContextPreview(
  buildLlmContext: (...args: any[]) => Promise<LlmContextData>,
) {
  const { prepareStructuredMessageForAnalysis } = useMessageBuilder();
  const { processMacros } = useMacroProcessor();
  const { settings: chatSettings, loadSettings: loadChatSettings } =
    useChatSettings();

  const getValidTimestamp = (ts: any): number | null => {
    if (typeof ts === "number") {
      return isFinite(ts) ? ts : null;
    }
    if (typeof ts === "string") {
      const num = Number(ts);
      if (isFinite(num)) return num;
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }
    }
    return null;
  };

  const sanitizeForCharCount = (text: string): string => {
    if (!text) return "";
    const base64ImageRegex =
      /!\[.*?\]\(data:image\/[a-zA-Z0-9-+.]+;base64,.*?\)/g;
    return text.replace(base64ImageRegex, "[IMAGE]");
  };

  /**
   * 获取指定节点的上下文预览数据（用于上下文分析器）
   */
  const getLlmContextForPreview = async (
    session: ChatSession,
    targetNodeId: string,
    agentStore: any,
    nodeManager: any,
    getProfileById: any,
    applyProcessingPipeline?: (
      messages: ProcessableMessage[],
      rules: ContextPostProcessRule[],
    ) => ProcessableMessage[],
    agentId?: string,
    parameterOverrides?: LlmParameters,
  ): Promise<ContextPreviewData | null> => {
    const targetNode = session.nodes[targetNodeId];
    if (!targetNode) {
      logger.warn("获取上下文预览失败：节点不存在", { targetNodeId });
      return null;
    }

    // 确保聊天设置已加载
    await loadChatSettings();

    const targetTimestamp =
      getValidTimestamp(targetNode.timestamp) ?? undefined;
    const nodePath = nodeManager.getNodePath(session, targetNodeId);

    let effectiveAgentId: string | null;
    if (agentId) {
      effectiveAgentId = agentId;
    } else {
      effectiveAgentId =
        targetNode.metadata?.agentId || agentStore.currentAgentId;
      if (
        !effectiveAgentId &&
        targetNode.role === "user" &&
        targetNode.childrenIds.length > 0
      ) {
        const firstChild = session.nodes[targetNode.childrenIds[0]];
        effectiveAgentId = firstChild?.metadata?.agentId || null;
      }
    }

    if (!effectiveAgentId) {
      logger.warn("⚠️ 无法确定 Agent，将只计算会话历史（不包含智能体预设）", {
        targetNodeId,
        providedAgentId: agentId,
      });
    }

    const userProfileStore = useUserProfileStore();
    let effectiveUserProfile: any = null;
    let relevantUserNode: ChatMessageNode | undefined;
    if (targetNode.role === "user") {
      relevantUserNode = targetNode;
    } else if (targetNode.role === "assistant" && targetNode.parentId) {
      relevantUserNode = session.nodes[targetNode.parentId];
    }

    if (relevantUserNode?.metadata?.userProfileId) {
      const storeProfile = userProfileStore.getProfileById(
        relevantUserNode.metadata.userProfileId,
      );
      effectiveUserProfile = {
        id: relevantUserNode.metadata.userProfileId,
        name: storeProfile?.name || "User",
        displayName:
          relevantUserNode.metadata.userProfileName ||
          storeProfile?.displayName,
        icon: relevantUserNode.metadata.userProfileIcon || storeProfile?.icon,
        content: storeProfile?.content || "",
      };
    }

    let agentConfig: any = null;
    let agent: any = null;
    let model: any = null;

    if (effectiveAgentId) {
      agentConfig = agentStore.getAgentConfig(effectiveAgentId, {
        parameterOverrides: session.parameterOverrides,
      });
      if (agentConfig && parameterOverrides) {
        agentConfig = {
          ...agentConfig,
          parameters: { ...agentConfig.parameters, ...parameterOverrides },
        };
      }
      if (!agentConfig) {
        logger.warn("⚠️ 无法获取 Agent 配置，将只计算会话历史", {
          agentId: effectiveAgentId,
        });
      } else {
        agent = agentStore.getAgentById(effectiveAgentId);
        const profile = getProfileById(agentConfig.profileId);
        model = profile?.models.find((m: any) => m.id === agentConfig.modelId);
      }
    }

    if (!effectiveUserProfile && agentConfig) {
      if (agentConfig.userProfileId) {
        effectiveUserProfile = userProfileStore.getProfileById(
          agentConfig.userProfileId,
        );
      }
      if (!effectiveUserProfile) {
        effectiveUserProfile = userProfileStore.globalProfile;
      }
    }

    let messages: Array<any> = [];
    if (agentConfig) {
      const contextData = await buildLlmContext(
        nodePath,
        agentConfig,
        "",
        session,
        effectiveUserProfile,
        undefined,
        targetTimestamp,
      );
      messages = contextData.messages;

      const modelDefaultRules = model?.defaultPostProcessingRules || [];
      const agentRules =
        agentConfig.parameters.contextPostProcessing?.rules || [];
      const modelRulesObjects = modelDefaultRules.map((type: string) => ({
        type,
        enabled: true,
      }));
      const agentRuleTypes = new Set(agentRules.map((r: any) => r.type));
      const mergedRules = [
        ...agentRules,
        ...modelRulesObjects.filter((r: any) => !agentRuleTypes.has(r.type)),
      ];

      if (mergedRules.length > 0 && applyProcessingPipeline) {
        (messages as any)._rawBeforeProcessing = [...messages];
        messages = applyProcessingPipeline(messages, mergedRules);
      }
    } else {
      messages = await Promise.all(
        nodePath
          .filter(
            (node: ChatMessageNode) =>
              node.isEnabled !== false &&
              (node.role === "user" || node.role === "assistant"),
          )
          .map(async (node: ChatMessageNode) => {
            const { buildMessageContentForLlm } = useMessageBuilder();
            const content = await buildMessageContentForLlm(
              node.content,
              node.attachments,
              undefined,
            );
            return { role: node.role as "user" | "assistant", content };
          }),
      );
    }

    let presetMessagesTokenCount = 0;
    let chatHistoryTokenCount = 0;
    let postProcessingTokenCount = 0;
    let postProcessingCharCount = 0;
    let isEstimated = false;
    let tokenizerName = "";
    let presetMessagesData: ContextPreviewData["presetMessages"] = [];

    if (agentConfig) {
      const rawPresets = agentConfig.presetMessages || [];
      const hasUserProfilePlaceholder = rawPresets.some(
        (msg: any) => msg.type === "user_profile",
      );
      const itemsToProcess: any[] = [];

      for (let i = 0; i < rawPresets.length; i++) {
        const msg = rawPresets[i];
        if (msg.isEnabled === false || msg.type === "chat_history") continue;
        if (msg.type === "user_profile") {
          if (effectiveUserProfile) {
            itemsToProcess.push({
              role: msg.role || "system",
              content: `# 用户档案\n${effectiveUserProfile.content}`,
              originalContent: `# 用户档案\n${effectiveUserProfile.content}`,
              index: i,
              isUserProfile: true,
            });
          }
          continue;
        }
        const contentStr =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        itemsToProcess.push({
          role: msg.role,
          content: contentStr,
          originalContent: contentStr,
          index: i,
        });
      }

      if (!hasUserProfilePlaceholder && effectiveUserProfile) {
        const newItem = {
          role: "system" as const,
          content: `# 用户档案\n${effectiveUserProfile.content}`,
          originalContent: `# 用户档案\n${effectiveUserProfile.content}`,
          index: rawPresets.length,
          isUserProfile: true,
        };
        let lastSystemIndex = itemsToProcess
          .slice()
          .reverse()
          .findIndex((item) => item.role === "system");
        if (lastSystemIndex !== -1)
          lastSystemIndex = itemsToProcess.length - 1 - lastSystemIndex;

        if (lastSystemIndex !== -1) {
          itemsToProcess.splice(lastSystemIndex + 1, 0, newItem);
        } else {
          itemsToProcess.unshift(newItem);
        }
      }

      presetMessagesData = await Promise.all(
        itemsToProcess.map(async (item) => {
          let content = await processMacros(item.content, {
            session,
            agent: agent ?? undefined,
            userProfile: effectiveUserProfile,
            timestamp: targetTimestamp,
          });
          const sanitizedContent = sanitizeForCharCount(content);
          let tokenCount: number | undefined;
          try {
            const tokenResult = await tokenCalculatorService.calculateTokens(
              content,
              agentConfig.modelId,
            );
            tokenCount = tokenResult.count;
            presetMessagesTokenCount += tokenResult.count;
            if (tokenResult.isEstimated) isEstimated = true;
            if (tokenResult.tokenizerName && !tokenizerName)
              tokenizerName = tokenResult.tokenizerName;
          } catch (error) {
            logger.warn("计算预设消息 token 失败", {
              index: item.index,
              error,
            });
          }
          return {
            role: item.role,
            content,
            originalContent: item.originalContent,
            charCount: sanitizedContent.length,
            tokenCount,
            source: "agent_preset",
            index: item.index,
            userName:
              item.role === "user" ? effectiveUserProfile?.name : undefined,
            userIcon:
              item.role === "user" ? effectiveUserProfile?.icon : undefined,
            isUserProfile: item.isUserProfile,
          };
        }),
      );
    }

    const chatHistoryData = await Promise.all(
      nodePath
        .filter(
          (node: ChatMessageNode) =>
            node.isEnabled !== false &&
            (node.role === "user" || node.role === "assistant"),
        )
        .map(async (node: ChatMessageNode, index: number) => {
          const {
            originalText,
            textAttachments,
            imageAttachments,
            videoAttachments,
            audioAttachments,
            otherAttachments,
          } = await prepareStructuredMessageForAnalysis(
            node.content,
            node.attachments,
            chatSettings.value,
          );
          const sanitizedContent = sanitizeForCharCount(originalText);
          let textTokenCount: number | undefined;

          if (agentConfig) {
            try {
              const textTokenResult =
                await tokenCalculatorService.calculateTokens(
                  originalText,
                  agentConfig.modelId,
                );
              textTokenCount = textTokenResult.count;
              if (textTokenResult.isEstimated) isEstimated = true;
              if (textTokenResult.tokenizerName && !tokenizerName)
                tokenizerName = textTokenResult.tokenizerName;
            } catch (error) {
              logger.warn("计算历史消息文本 token 失败", {
                nodeId: node.id,
                error,
              });
            }
          }

          const attachmentsData: any[] = [];
          let attachmentsTokenCount = 0;
          if (agentConfig && node.attachments && node.attachments.length > 0) {
            const modelMetadata = getMatchedModelProperties(
              agentConfig.modelId,
            );
            const visionTokenCost =
              modelMetadata?.capabilities?.visionTokenCost;

            for (const item of textAttachments) {
              let tokenCount: number | undefined;
              let isAttachmentEstimated = false;
              try {
                const result = await tokenCalculatorService.calculateTokens(
                  item.content,
                  agentConfig.modelId,
                );
                tokenCount = result.count;
                isAttachmentEstimated = result.isEstimated ?? false;
              } catch (error) {
                isAttachmentEstimated = true;
              }
              if (tokenCount !== undefined) attachmentsTokenCount += tokenCount;
              if (isAttachmentEstimated) isEstimated = true;
              attachmentsData.push({
                id: item.asset.id,
                name: item.asset.name,
                type: item.asset.type,
                path: item.asset.path,
                importStatus: item.asset.importStatus,
                originalPath: item.asset.originalPath,
                size: item.asset.size,
                tokenCount,
                isEstimated: isAttachmentEstimated,
                metadata: item.asset.metadata,
              });
            }
            for (const asset of imageAttachments) {
              let tokenCount: number | undefined;
              let isAttachmentEstimated = false;
              let attachmentError: string | undefined;
              if (visionTokenCost) {
                if (asset.metadata?.width && asset.metadata?.height) {
                  try {
                    tokenCount = tokenCalculatorEngine.calculateImageTokens(
                      asset.metadata.width,
                      asset.metadata.height,
                      visionTokenCost,
                    );
                  } catch (e) {
                    attachmentError =
                      e instanceof Error ? e.message : "图片 Token 计算异常";
                    isAttachmentEstimated = true;
                  }
                } else {
                  attachmentError = "缺少图片尺寸信息，使用默认值估算";
                  tokenCount = tokenCalculatorEngine.calculateImageTokens(
                    1024,
                    1024,
                    visionTokenCost,
                  );
                  isAttachmentEstimated = true;
                }
              } else {
                attachmentError = "模型不支持视觉能力或计费规则未知";
                isAttachmentEstimated = true;
              }
              if (tokenCount !== undefined) attachmentsTokenCount += tokenCount;
              if (isAttachmentEstimated) isEstimated = true;
              attachmentsData.push({
                id: asset.id,
                name: asset.name,
                type: asset.type,
                path: asset.path,
                importStatus: asset.importStatus,
                originalPath: asset.originalPath,
                size: asset.size,
                tokenCount,
                isEstimated: isAttachmentEstimated,
                metadata: asset.metadata,
                error: attachmentError,
              });
            }
            for (const asset of videoAttachments) {
              let tokenCount: number | undefined;
              let isAttachmentEstimated = false;
              let attachmentError: string | undefined;
              if (asset.metadata?.duration) {
                try {
                  tokenCount = tokenCalculatorEngine.calculateVideoTokens(
                    asset.metadata.duration,
                  );
                } catch (e) {
                  attachmentError =
                    e instanceof Error ? e.message : "视频 Token 计算异常";
                  isAttachmentEstimated = true;
                }
              } else {
                attachmentError = "缺少视频时长信息，无法计算";
                isAttachmentEstimated = true;
              }
              if (tokenCount !== undefined) attachmentsTokenCount += tokenCount;
              if (isAttachmentEstimated) isEstimated = true;
              attachmentsData.push({
                id: asset.id,
                name: asset.name,
                type: asset.type,
                path: asset.path,
                importStatus: asset.importStatus,
                originalPath: asset.originalPath,
                size: asset.size,
                tokenCount,
                isEstimated: isAttachmentEstimated,
                metadata: asset.metadata,
                error: attachmentError,
              });
            }
            for (const asset of audioAttachments) {
              let tokenCount: number | undefined;
              let isAttachmentEstimated = false;
              let attachmentError: string | undefined;
              if (asset.metadata?.duration) {
                try {
                  tokenCount = tokenCalculatorEngine.calculateAudioTokens(
                    asset.metadata.duration,
                  );
                } catch (e) {
                  attachmentError =
                    e instanceof Error ? e.message : "音频 Token 计算异常";
                  isAttachmentEstimated = true;
                }
              } else {
                attachmentError = "缺少音频时长信息，无法计算";
                isAttachmentEstimated = true;
              }
              if (tokenCount !== undefined) attachmentsTokenCount += tokenCount;
              if (isAttachmentEstimated) isEstimated = true;
              attachmentsData.push({
                id: asset.id,
                name: asset.name,
                type: asset.type,
                path: asset.path,
                importStatus: asset.importStatus,
                originalPath: asset.originalPath,
                size: asset.size,
                tokenCount,
                isEstimated: isAttachmentEstimated,
                metadata: asset.metadata,
                error: attachmentError,
              });
            }
            for (const asset of otherAttachments) {
              attachmentsData.push({
                id: asset.id,
                name: asset.name,
                type: asset.type,
                path: asset.path,
                importStatus: asset.importStatus,
                originalPath: asset.originalPath,
                size: asset.size,
                tokenCount: undefined,
                isEstimated: true,
                metadata: asset.metadata,
                error: "暂不支持此类型附件的 Token 计算",
              });
              isEstimated = true;
            }
          }

          const totalNodeTokenCount =
            (textTokenCount ?? 0) + attachmentsTokenCount;
          if (textTokenCount !== undefined)
            chatHistoryTokenCount += totalNodeTokenCount;

          let msgAgentName: string | undefined,
            msgAgentIcon: string | undefined,
            msgUserName: string | undefined,
            msgUserIcon: string | undefined;
          if (node.role === "assistant") {
            const msgAgentId = node.metadata?.agentId || effectiveAgentId;
            let storeAgent: any = null;
            if (msgAgentId) storeAgent = agentStore.getAgentById(msgAgentId);
            msgAgentName = node.metadata?.agentName || storeAgent?.name;
            if (node.metadata?.agentIcon && msgAgentId) {
              msgAgentIcon =
                resolveAvatarPath(
                  { id: msgAgentId, icon: node.metadata.agentIcon },
                  "agent",
                ) || undefined;
            }
            if (!msgAgentIcon && storeAgent) {
              msgAgentIcon =
                resolveAvatarPath(storeAgent, "agent") || undefined;
            }
          } else if (node.role === "user") {
            msgUserName = node.metadata?.userProfileName;
            if (node.metadata?.userProfileIcon)
              msgUserIcon = node.metadata.userProfileIcon;
          }

          return {
            role: node.role,
            content: originalText,
            charCount: sanitizedContent.length,
            tokenCount:
              textTokenCount !== undefined ? totalNodeTokenCount : undefined,
            source: "session_history",
            nodeId: node.id,
            index,
            agentName: msgAgentName,
            agentIcon: msgAgentIcon,
            userName: msgUserName,
            userIcon: msgUserIcon,
            attachments:
              attachmentsData.length > 0 ? attachmentsData : undefined,
          };
        }),
    );

    if (agentConfig) {
      const modelDefaultRules = model?.defaultPostProcessingRules || [];
      const agentRules =
        agentConfig.parameters.contextPostProcessing?.rules || [];
      const modelRulesObjects = modelDefaultRules.map((type: string) => ({
        type,
        enabled: true,
      }));
      const agentRuleTypes = new Set(agentRules.map((r: any) => r.type));
      const mergedRules = [
        ...agentRules,
        ...modelRulesObjects.filter((r: any) => !agentRuleTypes.has(r.type)),
      ];
      if (mergedRules.length > 0) {
        const rawMessages = (messages as any)._rawBeforeProcessing || messages;

        // 构造临时的 Agent 配置对象以适配 API
        const fakeAgentConfig = {
          parameters: {
            contextPostProcessing: {
              rules: mergedRules,
            },
          },
        };

        // 构造 Token 计数回调
        const countTokens = async (
          msg: ProcessableMessage,
        ): Promise<number> => {
          let contentStr = "";
          if (typeof msg.content === "string") {
            contentStr = msg.content;
          } else if (Array.isArray(msg.content)) {
            contentStr = msg.content
              .filter((p) => p.type === "text" && !!p.text)
              .map((p) => p.text)
              .join("\n");
          }

          if (!contentStr) return 0;

          try {
            const result = await tokenCalculatorService.calculateTokens(
              contentStr,
              agentConfig.modelId,
            );
            return result.count;
          } catch (e) {
            return 0;
          }
        };

        try {
          const delta = await calculatePostProcessingTokenDelta(
            rawMessages,
            fakeAgentConfig,
            countTokens,
          );
          postProcessingTokenCount = delta;
          // 注意：由于逻辑变更，不再计算 postProcessingCharCount，因为它对于复杂的后处理（如合并/删除）意义不大
          postProcessingCharCount = 0;
        } catch (error) {
          logger.warn("计算后处理增量 Token 失败", { error });
        }
      }
    }

    const presetMessagesCharCount = presetMessagesData.reduce(
      (sum, msg) => sum + msg.charCount,
      0,
    );
    const chatHistoryCharCount = chatHistoryData.reduce(
      (sum, msg) => sum + msg.charCount,
      0,
    );
    const totalCharCount =
      presetMessagesCharCount + chatHistoryCharCount + postProcessingCharCount;
    const totalTokenCount =
      presetMessagesTokenCount +
      chatHistoryTokenCount +
      postProcessingTokenCount;

    return {
      presetMessages: presetMessagesData,
      chatHistory: chatHistoryData,
      finalMessages: messages,
      statistics: {
        totalCharCount,
        presetMessagesCharCount,
        chatHistoryCharCount,
        postProcessingCharCount: agentConfig
          ? postProcessingCharCount
          : undefined,
        messageCount: messages.length,
        totalTokenCount: agentConfig ? totalTokenCount : undefined,
        presetMessagesTokenCount: agentConfig
          ? presetMessagesTokenCount
          : undefined,
        chatHistoryTokenCount: agentConfig ? chatHistoryTokenCount : undefined,
        postProcessingTokenCount: agentConfig
          ? postProcessingTokenCount
          : undefined,
        isEstimated: agentConfig ? isEstimated : undefined,
        tokenizerName: agentConfig ? tokenizerName : undefined,
      },
      agentInfo: {
        id: effectiveAgentId ?? "",
        name: targetNode.metadata?.agentName || agent?.name,
        icon:
          targetNode.metadata?.agentIcon ||
          resolveAvatarPath(agent, "agent") ||
          undefined,
        profileId:
          targetNode.metadata?.profileId || agentConfig?.profileId || "",
        modelId: targetNode.metadata?.modelId || agentConfig?.modelId || "",
        virtualTimeConfig:
          targetNode.metadata?.virtualTimeConfig ||
          agent?.virtualTimeConfig ||
          agentConfig?.virtualTimeConfig,
      },
      parameters: (() => {
        if (targetNode.metadata?.requestParameters)
          return targetNode.metadata.requestParameters;
        if (!agentConfig?.parameters) return undefined;
        const configParams = agentConfig.parameters;
        const isStrictFilter = Array.isArray(configParams.enabledParameters);
        const enabledList = configParams.enabledParameters || [];
        const effectiveParams: Record<string, any> = {};
        ALL_LLM_PARAMETER_KEYS.forEach((key) => {
          const hasValue = configParams[key] !== undefined;
          const isEnabled = isStrictFilter ? enabledList.includes(key) : true;
          if (hasValue && isEnabled) effectiveParams[key] = configParams[key];
        });
        return effectiveParams;
      })(),
      targetTimestamp: targetTimestamp,
      userInfo: {
        id: effectiveUserProfile?.id,
        name: effectiveUserProfile?.name,
        displayName: effectiveUserProfile?.displayName,
        icon: effectiveUserProfile?.icon,
      },
    };
  };

  return { getLlmContextForPreview };
}
