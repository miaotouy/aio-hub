/**
 * 聊天上下文构建 Composable
 * 负责构建发送给 LLM 的最终消息列表
 */

import type { ChatSession, ChatMessageNode, ContextPostProcessRule } from "../types";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { ModelCapabilities } from "@/types/llm-profiles";
import { createModuleLogger } from "@/utils/logger";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import { useChatAssetProcessor } from "./useChatAssetProcessor";
import { useMacroProcessor } from "./useMacroProcessor";
import { useAgentStore } from "../agentStore";
import type { ProcessableMessage } from "./useMessageProcessor";

const logger = createModuleLogger("llm-chat/context-builder");

/**
 * LLM 上下文构建结果
 * 现在返回统一的消息列表，可包含 system, user, assistant 角色
 */
interface LlmContextData {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string | LlmMessageContent[];
  }>;
}

/**
 * 上下文预览分析结果
 */
export interface ContextPreviewData {
  /** 系统提示部分 */
  systemPrompt?: {
    content: string;
    charCount: number;
    tokenCount?: number;
    source: "agent_preset";
  };
  /** 预设消息部分 */
  presetMessages: Array<{
    role: "user" | "assistant";
    content: string;
    charCount: number;
    tokenCount?: number;
    source: "agent_preset";
    index: number;
  }>;
  /** 会话历史部分 */
  chatHistory: Array<{
    role: "user" | "assistant";
    content: string;
    charCount: number;
    tokenCount?: number;
    source: "session_history";
    nodeId: string;
    index: number;
    /** 节点所使用的智能体名称（快照） */
    agentName?: string;
    /** 节点所使用的智能体图标（快照） */
    agentIcon?: string;
  }>;
  /** 最终构建的消息列表（用于原始请求展示） */
  finalMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string | LlmMessageContent[];
  }>;
  /** 统计信息 */
  statistics: {
    totalCharCount: number;
    systemPromptCharCount: number;
    presetMessagesCharCount: number;
    chatHistoryCharCount: number;
    messageCount: number;
    totalTokenCount?: number;
    systemPromptTokenCount?: number;
    presetMessagesTokenCount?: number;
    chatHistoryTokenCount?: number;
    isEstimated?: boolean;
    tokenizerName?: string;
  };
  /** Agent 信息 */
  agentInfo: {
    id: string;
    name?: string;
    icon?: string;
    profileId: string;
    modelId: string;
  };
}

export function useChatContextBuilder() {
  const { assetToMessageContent } = useChatAssetProcessor();
  const { processMacros, processMacrosBatch } = useMacroProcessor();

  /**
   * 应用上下文 Token 限制，截断会话历史
   */
  const applyContextLimit = async (
    sessionContext: Array<{ role: "user" | "assistant"; content: string | LlmMessageContent[] }>,
    systemMessages: Array<{ role: "system"; content: string }>,
    presetMessages: Array<{ role: "user" | "assistant"; content: string | LlmMessageContent[] }>,
    contextManagement: { enabled: boolean; maxContextTokens: number; retainedCharacters: number },
    modelId: string
  ): Promise<Array<{ role: "user" | "assistant"; content: string | LlmMessageContent[] }>> => {
    const { maxContextTokens, retainedCharacters } = contextManagement;

    // 计算系统消息的 token 数
    let systemPromptTokens = 0;
    for (const sysMsg of systemMessages) {
      try {
        const result = await tokenCalculatorService.calculateTokens(sysMsg.content, modelId);
        systemPromptTokens += result.count;
      } catch (error) {
        logger.warn("计算系统消息 token 失败", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 计算预设消息的 token 数（并行计算）
    const presetTokenResults = await Promise.all(
      presetMessages.map(async (msg) => {
        try {
          const content =
            typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
          const result = await tokenCalculatorService.calculateTokens(content, modelId);
          return result.count;
        } catch (error) {
          logger.warn("计算预设消息 token 失败", {
            error: error instanceof Error ? error.message : String(error),
          });
          return 0;
        }
      })
    );
    const presetMessagesTokens = presetTokenResults.reduce((sum, count) => sum + count, 0);

    // 计算可用于会话历史的 token 数量
    const availableTokens = maxContextTokens - systemPromptTokens - presetMessagesTokens;

    logger.info("📊 上下文限制检查", {
      maxContextTokens,
      systemPromptTokens,
      presetMessagesTokens,
      availableTokens,
      sessionMessageCount: sessionContext.length,
    }, true);

    if (availableTokens <= 0) {
      logger.warn("⚠️ 预设消息和系统提示已超出最大上下文限制，会话历史将被完全截断", {
        systemPromptTokens,
        presetMessagesTokens,
        maxContextTokens,
      });
      return [];
    }

    // 计算每条会话消息的 token 数
    const messagesWithTokens = await Promise.all(
      sessionContext.map(async (msg, index) => {
        let tokenCount = 0;
        try {
          let content = "";
          if (typeof msg.content === "string") {
            content = msg.content;
          } else {
            // 对于多模态内容，只计算文本部分的 token
            for (const part of msg.content) {
              if (part.type === "text" && part.text) {
                content += part.text;
              }
            }
          }
          const result = await tokenCalculatorService.calculateTokens(content, modelId);
          tokenCount = result.count;
        } catch (error) {
          logger.warn("计算消息 token 失败", {
            index,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return {
          ...msg,
          tokenCount,
          index,
        };
      })
    );

    // 从最新的消息开始保留，直到达到 token 限制
    let totalTokens = 0;
    const keptIndices = new Set<number>();
    const truncatedIndices = new Set<number>();

    // 从后往前（最新到最旧）遍历消息
    for (let i = messagesWithTokens.length - 1; i >= 0; i--) {
      const msg = messagesWithTokens[i];
      if (totalTokens + msg.tokenCount <= availableTokens) {
        totalTokens += msg.tokenCount;
        keptIndices.add(i);
      } else {
        truncatedIndices.add(i);
      }
    }

    logger.info("✂️ 上下文截断结果", {
      totalMessages: sessionContext.length,
      keptMessages: keptIndices.size,
      truncatedMessages: truncatedIndices.size,
      usedTokens: totalTokens,
      availableTokens,
    }, true);

    // 构建结果：对于被截断的消息，保留指定的字符数
    const result = messagesWithTokens.map((msg, index) => {
      if (keptIndices.has(index)) {
        // 完整保留
        return {
          role: msg.role,
          content: msg.content,
        };
      } else {
        // 截断处理
        let truncatedContent: string | LlmMessageContent[];

        if (typeof msg.content === "string") {
          // 纯文本消息
          if (retainedCharacters > 0 && msg.content.length > retainedCharacters) {
            truncatedContent = msg.content.substring(0, retainedCharacters) + "...[已截断]";
          } else if (retainedCharacters > 0) {
            truncatedContent = msg.content + "[已截断]";
          } else {
            truncatedContent = "[消息已截断]";
          }
        } else {
          // 多模态消息：保留结构，但截断文本部分
          truncatedContent = msg.content.map((part) => {
            if (part.type === "text" && part.text) {
              let text = part.text;
              if (retainedCharacters > 0 && text.length > retainedCharacters) {
                text = text.substring(0, retainedCharacters) + "...[已截断]";
              } else if (retainedCharacters > 0) {
                text = text + "[已截断]";
              } else {
                text = "[消息已截断]";
              }
              return { ...part, text };
            }
            return part;
          });
        }

        logger.debug("截断消息", {
          index,
          role: msg.role,
          originalLength: typeof msg.content === "string" ? msg.content.length : "multimodal",
          retainedCharacters,
        });

        return {
          role: msg.role,
          content: truncatedContent,
        };
      }
    });

    return result;
  };

  /**
   * 构建 LLM 上下文
   * 从活动路径和智能体配置中提取系统提示、对话历史和当前消息
   * @param session 当前会话（用于宏上下文）
   * @param effectiveUserProfile 当前生效的用户档案（可选）
   * @param capabilities 模型能力（可选，用于智能附件处理）
   */
  const buildLlmContext = async (
    activePath: ChatMessageNode[],
    agentConfig: any,
    _currentUserMessage: string,
    session: ChatSession,
    effectiveUserProfile?: { id: string; name: string; content: string } | null,
    capabilities?: ModelCapabilities
  ): Promise<LlmContextData> => {
    // 过滤出有效的对话上下文（排除禁用节点和系统节点）
    const llmContextPromises = activePath
      .filter((node) => node.isEnabled !== false)
      .filter((node) => node.role !== "system")
      .filter((node) => node.role === "user" || node.role === "assistant")
      .map(async (node) => {
        let content: string | LlmMessageContent[] = node.content;

        // 如果节点有附件，构建多模态消息
        if (node.attachments && node.attachments.length > 0) {
          logger.info("📎 检测到节点包含附件", {
            nodeId: node.id,
            role: node.role,
            attachmentCount: node.attachments.length,
            attachments: node.attachments.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              mimeType: a.mimeType,
              importStatus: a.importStatus,
            })),
          }, true);

          const messageContents: LlmMessageContent[] = [];

          // 添加文本内容（如果有）
          if (node.content && node.content.trim() !== "") {
            messageContents.push({
              type: "text",
              text: node.content,
            });
            logger.debug("添加文本内容到消息", {
              nodeId: node.id,
              textLength: node.content.length,
            });
          }

          // 转换附件（传递模型能力信息以实现智能处理）
          for (const asset of node.attachments) {
            logger.debug("开始转换附件", {
              nodeId: node.id,
              assetId: asset.id,
              assetName: asset.name,
              assetType: asset.type,
              importStatus: asset.importStatus,
              modelCapabilities: capabilities
                ? {
                    vision: capabilities.vision,
                    document: capabilities.document,
                  }
                : undefined,
            });

            const attachmentContent = await assetToMessageContent(asset, capabilities);
            if (attachmentContent) {
              messageContents.push(attachmentContent);
              logger.info("✅ 附件转换成功", {
                nodeId: node.id,
                assetId: asset.id,
                assetName: asset.name,
                contentType: attachmentContent.type,
              });
            } else {
              logger.warn("⚠️ 附件转换失败或跳过", {
                nodeId: node.id,
                assetId: asset.id,
                assetName: asset.name,
                assetType: asset.type,
              });
            }
          }

          content = messageContents;

          logger.info("📦 多模态消息构建完成", {
            nodeId: node.id,
            role: node.role,
            originalAttachmentCount: node.attachments.length,
            finalMessagePartsCount: messageContents.length,
            hasTextContent: node.content && node.content.trim() !== "",
          }, true);
        } else {
          logger.debug("节点无附件，使用纯文本内容", {
            nodeId: node.id,
            role: node.role,
            contentLength: node.content.length,
          });
        }

        return {
          role: node.role as "user" | "assistant",
          content,
        };
      });

    const llmContext = await Promise.all(llmContextPromises);

    // 处理预设消息
    const presetMessages = agentConfig.presetMessages || [];
    const enabledPresets = presetMessages.filter((msg: any) => msg.isEnabled !== false);

    // 获取当前智能体信息（用于宏上下文）
    const agentStoreInstance = useAgentStore();
    const currentAgent = agentStoreInstance.getAgentById(
      agentStoreInstance.currentAgentId || ''
    );

    // 构建 system 消息列表（包括用户档案）
    const systemMessagesList: Array<{
      role: "system";
      content: string;
    }> = [];

    // 查找用户档案占位符
    const userProfilePlaceholderIndex = enabledPresets.findIndex(
      (msg: any) => msg.type === "user_profile"
    );

    // 收集所有 system 消息
    for (let i = 0; i < enabledPresets.length; i++) {
      const msg = enabledPresets[i];

      // 跳过用户档案占位符本身
      if (msg.type === "user_profile") {
        // 如果有用户档案，在此位置插入（处理宏）
        if (effectiveUserProfile) {
          const userProfilePrompt = `# 用户档案\n${effectiveUserProfile.content}`;
          const processedUserProfile = await processMacros(userProfilePrompt, {
            session,
            agent: currentAgent ?? undefined,
            userProfile: effectiveUserProfile as any,
          });

          systemMessagesList.push({
            role: "system",
            content: processedUserProfile,
          });

          logger.debug("在占位符位置注入用户档案（已处理宏）", {
            profileId: effectiveUserProfile.id,
            profileName: effectiveUserProfile.name,
            position: i,
            originalLength: userProfilePrompt.length,
            processedLength: processedUserProfile.length,
          });
        }
        continue;
      }

      // 收集普通 system 消息（处理宏）
      if (msg.role === "system" && msg.type !== "chat_history") {
        const processedContent = await processMacros(msg.content, {
          session,
          agent: currentAgent ?? undefined,
          userProfile: effectiveUserProfile as any,
        });

        systemMessagesList.push({
          role: "system",
          content: processedContent,
        });
      }
    }

    // 如果没有用户档案占位符，但有用户档案，则追加到 system 消息末尾（处理宏）
    if (userProfilePlaceholderIndex === -1 && effectiveUserProfile) {
      const userProfilePrompt = `# 用户档案\n${effectiveUserProfile.content}`;
      const processedUserProfile = await processMacros(userProfilePrompt, {
        session,
        agent: currentAgent ?? undefined,
        userProfile: effectiveUserProfile as any,
      });

      systemMessagesList.push({
        role: "system",
        content: processedUserProfile,
      });

      logger.debug("追加用户档案到 system 消息末尾（无占位符，已处理宏）", {
        profileId: effectiveUserProfile.id,
        profileName: effectiveUserProfile.name,
        originalLength: userProfilePrompt.length,
        processedLength: processedUserProfile.length,
      });
    }

    // 会话上下文（完整历史，不再单独处理最后一条）
    let sessionContext = llmContext;

    // 查找历史消息占位符
    const chatHistoryPlaceholderIndex = enabledPresets.findIndex(
      (msg: any) => msg.type === "chat_history"
    );

    // 准备预设对话（用于 token 计算，不包括 system）
    // 需要处理宏
    const presetConversationRaw = enabledPresets.filter(
      (msg: any) =>
        (msg.role === "user" || msg.role === "assistant") && msg.type !== "user_profile"
    );

    const presetConversationContents = await processMacrosBatch(
      presetConversationRaw.map((msg: any) => msg.content),
      {
        session,
        agent: currentAgent ?? undefined,
        userProfile: effectiveUserProfile as any,
      }
    );

    const presetConversation: Array<{
      role: "user" | "assistant";
      content: string | LlmMessageContent[];
    }> = presetConversationRaw.map((msg: any, index: number) => ({
      role: msg.role as "user" | "assistant",
      content: presetConversationContents[index],
    }));

    // 应用上下文 Token 限制（如果启用）
    // 注意：上下文限制目前不考虑 system 消息，只截断会话历史
    if (
      agentConfig.parameters.contextManagement?.enabled &&
      agentConfig.parameters.contextManagement.maxContextTokens > 0
    ) {
      logger.info("🔍 开始应用上下文限制", {
        enabled: agentConfig.parameters.contextManagement.enabled,
        maxContextTokens: agentConfig.parameters.contextManagement.maxContextTokens,
        retainedCharacters: agentConfig.parameters.contextManagement.retainedCharacters,
      });

      sessionContext = await applyContextLimit(
        sessionContext,
        systemMessagesList,
        presetConversation,
        agentConfig.parameters.contextManagement,
        agentConfig.modelId
      );
    }

    // 构建最终的 user/assistant 消息列表
    let userAssistantMessages: Array<{
      role: "user" | "assistant";
      content: string | LlmMessageContent[];
    }>;

    if (chatHistoryPlaceholderIndex !== -1) {
      // 如果找到占位符，将会话上下文插入到占位符位置
      // 处理占位符前后的预设消息的宏
      const presetsBeforeRaw = enabledPresets
        .slice(0, chatHistoryPlaceholderIndex)
        .filter(
          (msg: any) =>
            (msg.role === "user" || msg.role === "assistant") && msg.type !== "user_profile"
        );

      const presetsAfterRaw = enabledPresets
        .slice(chatHistoryPlaceholderIndex + 1)
        .filter(
          (msg: any) =>
            (msg.role === "user" || msg.role === "assistant") && msg.type !== "user_profile"
        );

      const presetsBeforeContents = await processMacrosBatch(
        presetsBeforeRaw.map((msg: any) => msg.content),
        {
          session,
          agent: currentAgent ?? undefined,
          userProfile: effectiveUserProfile as any,
        }
      );

      const presetsAfterContents = await processMacrosBatch(
        presetsAfterRaw.map((msg: any) => msg.content),
        {
          session,
          agent: currentAgent ?? undefined,
          userProfile: effectiveUserProfile as any,
        }
      );

      const presetsBeforePlaceholder: Array<{
        role: "user" | "assistant";
        content: string | LlmMessageContent[];
      }> = presetsBeforeRaw.map((msg: any, index: number) => ({
        role: msg.role as "user" | "assistant",
        content: presetsBeforeContents[index],
      }));

      const presetsAfterPlaceholder: Array<{
        role: "user" | "assistant";
        content: string | LlmMessageContent[];
      }> = presetsAfterRaw.map((msg: any, index: number) => ({
        role: msg.role as "user" | "assistant",
        content: presetsAfterContents[index],
      }));

      userAssistantMessages = [
        ...presetsBeforePlaceholder,
        ...sessionContext,
        ...presetsAfterPlaceholder,
      ];

      logger.debug("使用历史消息占位符构建上下文", {
        presetsBeforeCount: presetsBeforePlaceholder.length,
        sessionContextCount: sessionContext.length,
        presetsAfterCount: presetsAfterPlaceholder.length,
        totalUserAssistantMessages: userAssistantMessages.length,
      }, true);
    } else {
      // 如果没有占位符，按原来的逻辑：预设消息在前，会话上下文在后
      userAssistantMessages = [...presetConversation, ...sessionContext];
    }

    // 合并 system 消息和 user/assistant 消息，构建统一的消息列表
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string | LlmMessageContent[];
    }> = [...systemMessagesList, ...userAssistantMessages];

    // 详细的 debug 日志，展示最终构建的消息
    logger.debug("🔍 构建 LLM 上下文完成", {
      systemMessageCount: systemMessagesList.length,
      userAssistantMessageCount: userAssistantMessages.length,
      totalMessages: messages.length,
      messages: messages.map((msg, index) => ({
        index,
        role: msg.role,
        contentType: typeof msg.content,
        contentPreview:
          typeof msg.content === "string"
            ? msg.content.substring(0, 100) + (msg.content.length > 100 ? "..." : "")
            : `[${msg.content.length} parts]`,
        contentLength:
          typeof msg.content === "string"
            ? msg.content.length
            : msg.content.reduce(
                (sum, part) =>
                  sum +
                  (typeof part === "object" && "text" in part && part.text ? part.text.length : 0),
                0
              ),
      })),
    }, true);

    return { messages };
  };

  /**
   * 获取指定节点的上下文预览数据（用于上下文分析器）
   * @param session 当前会话
   * @param targetNodeId 目标节点 ID
   * @param agentStore Agent Store 实例
   * @param nodeManager Node Manager 实例
   * @param getProfileById LLM Profile 获取函数
   * @param applyProcessingPipeline 后处理管道应用函数
   * @param agentId 使用的 Agent ID（如果提供则直接使用，否则从节点推断）
   * @returns 详细的上下文分析数据，如果无法获取则返回 null
   */
  const getLlmContextForPreview = async (
    session: ChatSession,
    targetNodeId: string,
    agentStore: any,
    nodeManager: any,
    getProfileById: any,
    applyProcessingPipeline?: (
      messages: ProcessableMessage[],
      rules: ContextPostProcessRule[]
    ) => ProcessableMessage[],
    agentId?: string
  ): Promise<ContextPreviewData | null> => {
    const sanitizeForCharCount = (text: string): string => {
      if (!text) return "";
      const base64ImageRegex = /!\[.*?\]\(data:image\/[a-zA-Z0-9-+.]+;base64,.*?\)/g;
      return text.replace(base64ImageRegex, "[IMAGE]");
    };

    // 获取目标节点
    const targetNode = session.nodes[targetNodeId];
    if (!targetNode) {
      logger.warn("获取上下文预览失败：节点不存在", { targetNodeId });
      return null;
    }

    // 获取到目标节点的完整路径
    const nodePath = nodeManager.getNodePath(session, targetNodeId);

    // 确定使用的 Agent ID
    let effectiveAgentId: string | null;
    if (agentId) {
      // 如果提供了 agentId 参数，直接使用
      effectiveAgentId = agentId;
      logger.debug("使用提供的 Agent ID", { agentId });
    } else {
      // 否则从节点 metadata 中推断
      effectiveAgentId = targetNode.metadata?.agentId || agentStore.currentAgentId;
      // 如果目标节点是用户消息，尝试从其子节点（助手消息）中获取 agentId
      if (!effectiveAgentId && targetNode.role === "user" && targetNode.childrenIds.length > 0) {
        const firstChild = session.nodes[targetNode.childrenIds[0]];
        effectiveAgentId = firstChild?.metadata?.agentId || null;
      }
      logger.debug("从节点推断 Agent ID", {
        targetNodeId,
        inferredAgentId: effectiveAgentId,
        source: targetNode.metadata?.agentId ? 'node_metadata' : 'current_agent'
      });
    }

    // 如果没有 Agent，警告并继续处理（只计算会话历史）
    if (!effectiveAgentId) {
      logger.warn("⚠️ 无法确定 Agent，将只计算会话历史（不包含智能体预设）", {
        targetNodeId,
        providedAgentId: agentId
      });
    }

    // 尝试获取 Agent 配置
    let agentConfig: any = null;
    let agent: any = null;
    let model: any = null;

    if (effectiveAgentId) {
      agentConfig = agentStore.getAgentConfig(effectiveAgentId, {
        parameterOverrides: session.parameterOverrides,
      });

      if (!agentConfig) {
        logger.warn("⚠️ 无法获取 Agent 配置，将只计算会话历史", { agentId: effectiveAgentId });
      } else {
        agent = agentStore.getAgentById(effectiveAgentId);
        const profile = getProfileById(agentConfig.profileId);
        model = profile?.models.find((m: any) => m.id === agentConfig.modelId);
      }
    }

    // 构建消息列表
    let messages: Array<{
      role: "system" | "user" | "assistant";
      content: string | LlmMessageContent[];
    }> = [];

    if (agentConfig) {
      // 有 Agent 配置时，使用完整的上下文构建
      const contextData = await buildLlmContext(
        nodePath,
        agentConfig,
        "", // currentUserMessage 参数已不使用
        session
      );
      messages = contextData.messages;

      // 应用上下文后处理管道（用于预览真实发送的内容）
      const modelDefaultRules = model?.defaultPostProcessingRules || [];
      const agentRules = agentConfig.parameters.contextPostProcessing?.rules || [];

      const modelRulesObjects = modelDefaultRules.map((type: string) => ({ type, enabled: true }));
      const agentRuleTypes = new Set(agentRules.map((r: any) => r.type));
      const mergedRules = [
        ...agentRules,
        ...modelRulesObjects.filter((r: any) => !agentRuleTypes.has(r.type)),
      ];

      if (mergedRules.length > 0 && applyProcessingPipeline) {
        messages = applyProcessingPipeline(messages, mergedRules);
        logger.debug("应用后处理规则（预览）", { mergedRulesCount: mergedRules.length }, true);
      }
    } else {
      // 没有 Agent 配置时，只构建包含附件的会话历史消息
      logger.info("📝 仅构建会话历史消息（无 Agent 预设）");
      messages = await Promise.all(nodePath
        .filter((node: ChatMessageNode) => node.isEnabled !== false && (node.role === 'user' || node.role === 'assistant'))
        .map(async (node: ChatMessageNode) => {
          let content: string | LlmMessageContent[] = node.content;
          if (node.attachments && node.attachments.length > 0) {
            const messageContents: LlmMessageContent[] = [];
            if (node.content && node.content.trim() !== "") {
              messageContents.push({ type: "text", text: node.content });
            }
            for (const asset of node.attachments) {
              // 在没有模型信息时，capabilities 为 undefined，assetToMessageContent 会做降级处理
              const attachmentContent = await assetToMessageContent(asset, undefined);
              if (attachmentContent) messageContents.push(attachmentContent);
            }
            content = messageContents;
          }
          return { role: node.role as "user" | "assistant", content };
        }));
    }

    // 计算 Token 数
    let systemPromptTokenCount = 0;
    let presetMessagesTokenCount = 0;
    let chatHistoryTokenCount = 0;
    let isEstimated = false;
    let tokenizerName = "";

    // 提取系统消息部分（仅当有 Agent 配置时）
    let systemPromptData: ContextPreviewData["systemPrompt"];
    if (agentConfig) {
      const systemMessages = messages.filter((m) => m.role === "system");
      if (systemMessages.length > 0) {
        const combinedSystemContent = systemMessages.map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join("\n\n");
        const sanitizedSystemContent = sanitizeForCharCount(combinedSystemContent);
        try {
          const tokenResult = await tokenCalculatorService.calculateTokens(combinedSystemContent, agentConfig.modelId);
          systemPromptTokenCount = tokenResult.count;
          isEstimated = tokenResult.isEstimated ?? false;
          tokenizerName = tokenResult.tokenizerName;
          systemPromptData = { content: combinedSystemContent, charCount: sanitizedSystemContent.length, tokenCount: tokenResult.count, source: "agent_preset" };
        } catch (error) {
          logger.warn("计算系统消息 token 失败", { error: error instanceof Error ? error.message : String(error) });
          systemPromptData = { content: combinedSystemContent, charCount: sanitizedSystemContent.length, source: "agent_preset" };
        }
      }
    }

    // 提取预设对话部分（仅当有 Agent 配置时）
    // 注意：预设消息的内容已经在 buildLlmContext 中处理过宏，这里从 finalMessages 中提取
    const presetMessagesData: ContextPreviewData["presetMessages"] = agentConfig ? await Promise.all(
      (agentConfig.presetMessages || []).filter((msg: any) => msg.isEnabled !== false && msg.role !== "system" && msg.type !== "chat_history")
        .map(async (msg: any, index: number) => {
          // 从 finalMessages 中找到对应的消息（已处理宏）
          // 预设消息在 finalMessages 中紧跟在 system 消息之后
          const systemMessageCount = messages.filter((m) => m.role === "system").length;
          const messageInFinal = messages[systemMessageCount + index];
          const content = messageInFinal
            ? (typeof messageInFinal.content === "string" ? messageInFinal.content : JSON.stringify(messageInFinal.content))
            : (typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
          
          const sanitizedContent = sanitizeForCharCount(content);
          let tokenCount: number | undefined;
          try {
            const tokenResult = await tokenCalculatorService.calculateTokens(content, agentConfig.modelId);
            tokenCount = tokenResult.count;
            presetMessagesTokenCount += tokenResult.count;
            if (tokenResult.isEstimated) isEstimated = true;
          } catch (error) {
            logger.warn("计算预设消息 token 失败", { index, error: error instanceof Error ? error.message : String(error) });
          }
          return { role: msg.role, content, charCount: sanitizedContent.length, tokenCount, source: "agent_preset", index };
        })
    ) : [];

    // 从节点路径中提取会话历史
    const chatHistoryData = await Promise.all(
      nodePath
        .filter((node: ChatMessageNode) => node.isEnabled !== false && (node.role === 'user' || node.role === 'assistant'))
        .map(async (node: ChatMessageNode, index: number) => {
          let content = typeof node.content === "string" ? node.content : JSON.stringify(node.content);
          if (node.role === "user" && node.attachments && node.attachments.length > 0) {
            const { getTextAttachmentsContent } = useChatAssetProcessor();
            const textAttachmentsContent = await getTextAttachmentsContent(node.attachments);
            if (textAttachmentsContent) content = `${content}\n\n${textAttachmentsContent}`;
          }
          
          let tokenCount: number | undefined;
          const sanitizedContent = sanitizeForCharCount(content);
          if (agentConfig) { // 只有在有 Agent 配置时才计算 token
            try {
              const tokenResult = (node.role === "user" && node.attachments && node.attachments.length > 0)
                ? await tokenCalculatorService.calculateMessageTokens(content, agentConfig.modelId, node.attachments)
                : await tokenCalculatorService.calculateTokens(content, agentConfig.modelId);
              tokenCount = tokenResult.count;
              chatHistoryTokenCount += tokenResult.count;
              if (tokenResult.isEstimated) isEstimated = true;
            } catch (error) {
              logger.warn("计算会话历史 token 失败", { nodeId: node.id, index, error: error instanceof Error ? error.message : String(error) });
            }
          }
          return { role: node.role, content, charCount: sanitizedContent.length, tokenCount, source: "session_history", nodeId: node.id, index };
        })
    );

    // 计算统计信息
    const systemPromptCharCount = systemPromptData?.charCount || 0;
    const presetMessagesCharCount = presetMessagesData.reduce((sum, msg) => sum + msg.charCount, 0);
    const chatHistoryCharCount = chatHistoryData.reduce((sum, msg) => sum + msg.charCount, 0);
    const totalCharCount = systemPromptCharCount + presetMessagesCharCount + chatHistoryCharCount;
    const totalTokenCount = systemPromptTokenCount + presetMessagesTokenCount + chatHistoryTokenCount;

    const result: ContextPreviewData = {
      systemPrompt: systemPromptData,
      presetMessages: presetMessagesData,
      chatHistory: chatHistoryData,
      finalMessages: messages,
      statistics: {
        totalCharCount,
        systemPromptCharCount,
        presetMessagesCharCount,
        chatHistoryCharCount,
        messageCount: messages.length,
        totalTokenCount: agentConfig ? totalTokenCount : undefined,
        systemPromptTokenCount: agentConfig ? systemPromptTokenCount : undefined,
        presetMessagesTokenCount: agentConfig ? presetMessagesTokenCount : undefined,
        chatHistoryTokenCount: agentConfig ? chatHistoryTokenCount : undefined,
        isEstimated: agentConfig ? isEstimated : undefined,
        tokenizerName: agentConfig ? tokenizerName : undefined,
      },
      agentInfo: {
        id: effectiveAgentId ?? '',
        name: agent?.name,
        icon: agent?.icon,
        profileId: agentConfig?.profileId ?? '',
        modelId: agentConfig?.modelId ?? '',
      },
    };

    logger.debug("🔍 生成上下文预览数据", {
      targetNodeId,
      agentId: effectiveAgentId,
      providedAgentId: agentId,
      hasAgentConfig: !!agentConfig,
      totalCharCount,
      totalTokenCount: agentConfig ? totalTokenCount : 'N/A (无 Agent)',
      messageCount: messages.length,
    }, true);

    return result;
  };

  return {
    buildLlmContext,
    applyContextLimit,
    getLlmContextForPreview,
  };
}
