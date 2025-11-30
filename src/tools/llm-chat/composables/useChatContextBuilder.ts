/**
 * 聊天上下文构建 Composable
 * 负责构建发送给 LLM 的最终消息列表
 */

import type { ChatSession, ChatMessageNode, ContextPostProcessRule, UserProfile } from "../types";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { ModelCapabilities } from "@/types/llm-profiles";
import type { LlmParameters } from "../types/llm";
import { getMatchedModelProperties } from "@/config/model-metadata";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";
import { createModuleLogger } from "@/utils/logger";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import { useMessageBuilder } from "./useMessageBuilder";
import { useMacroProcessor } from "./useMacroProcessor";
import { useAgentStore } from "../agentStore";
import { ALL_LLM_PARAMETER_KEYS } from "../config/parameter-config";
import { resolveAvatarPath } from "./useResolvedAvatar";
import type { ProcessableMessage } from "./useMessageProcessor";
import type { Asset, AssetMetadata } from "@/types/asset-management";

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
  meta?: {
    sessionMessageCount: number;
    presetsBeforeCount?: number;
  };
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
    /** 附件的详细分析 */
    attachments?: Array<{
      id: string;
      name: string;
      type: Asset["type"];
      path: string;
      importStatus?: Asset["importStatus"];
      originalPath?: string;
      size: number;
      tokenCount?: number;
      isEstimated: boolean;
      metadata?: AssetMetadata;
      error?: string;
    }>;
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
  /** LLM 请求参数 */
  parameters?: LlmParameters;
}

export function useChatContextBuilder() {
  const { buildMessageContentForLlm, prepareStructuredMessageForAnalysis } = useMessageBuilder();
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
    effectiveUserProfile?: Partial<UserProfile> | null,
    capabilities?: ModelCapabilities
  ): Promise<LlmContextData> => {
    // 过滤出有效的对话上下文（排除禁用节点和系统节点）
    const llmContextPromises = activePath
      .filter((node) => node.isEnabled !== false)
      .filter((node) => node.role !== "system")
      .filter((node) => node.role === "user" || node.role === "assistant")
      .map(async (node) => {
        // 使用统一的消息构建器处理文本和附件
        const content = await buildMessageContentForLlm(
          node.content,
          node.attachments,
          capabilities
        );

        if (node.attachments && node.attachments.length > 0) {
          logger.info("📦 消息构建完成", {
            nodeId: node.id,
            role: node.role,
            attachmentCount: node.attachments.length,
            contentType: typeof content === "string" ? "text" : "multimodal",
            partsCount: typeof content === "string" ? 1 : content.length,
          }, true);
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
            userProfile: effectiveUserProfile as UserProfile,
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
          userProfile: effectiveUserProfile as UserProfile,
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
        userProfile: effectiveUserProfile as UserProfile,
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
        userProfile: effectiveUserProfile as UserProfile,
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

    // 记录插入点前的预设消息数量，用于后续索引计算
    let presetsBeforeCount: number | undefined;

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
          userProfile: effectiveUserProfile as UserProfile,
        }
      );

      const presetsAfterContents = await processMacrosBatch(
        presetsAfterRaw.map((msg: any) => msg.content),
        {
          session,
          agent: currentAgent ?? undefined,
          userProfile: effectiveUserProfile as UserProfile,
        }
      );

      const presetsBeforePlaceholder: Array<{
        role: "user" | "assistant";
        content: string | LlmMessageContent[];
      }> = presetsBeforeRaw.map((msg: any, index: number) => ({
        role: msg.role as "user" | "assistant",
        content: presetsBeforeContents[index],
      }));

      presetsBeforeCount = presetsBeforePlaceholder.length;

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

    // 准备元数据
    const meta: LlmContextData['meta'] = {
      sessionMessageCount: sessionContext.length,
      presetsBeforeCount,
    };

    // 详细的 debug 日志，展示最终构建的消息
    logger.debug("🔍 构建 LLM 上下文完成", {
      systemMessageCount: systemMessagesList.length,
      userAssistantMessageCount: userAssistantMessages.length,
      totalMessages: messages.length,
      sessionMessageCount: meta.sessionMessageCount,
      presetsBeforeCount: meta.presetsBeforeCount,
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

    return { messages, meta };
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

    let contextData: LlmContextData | null = null;

    if (agentConfig) {
      // 有 Agent 配置时，使用完整的上下文构建
      contextData = await buildLlmContext(
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
        // 🐛 Fix: 在应用后处理规则前备份消息列表
        // 用于后续准确映射预设消息，防止因合并/删除消息导致索引错位
        const messagesBeforeProcessing = [...messages];

        messages = applyProcessingPipeline(messages, mergedRules);

        // 将备份附加到 messages 对象上（临时属性），以便后续使用
        // 注意：这里使用类型断言或扩展属性来传递
        (messages as any)._rawBeforeProcessing = messagesBeforeProcessing;

        logger.debug("应用后处理规则（预览）", { mergedRulesCount: mergedRules.length }, true);
      }
    } else {
      // 没有 Agent 配置时，只构建包含附件的会话历史消息
      logger.info("📝 仅构建会话历史消息（无 Agent 预设）");
      messages = await Promise.all(nodePath
        .filter((node: ChatMessageNode) => node.isEnabled !== false && (node.role === 'user' || node.role === 'assistant'))
        .map(async (node: ChatMessageNode) => {
          // 使用统一的消息构建器，在没有模型信息时 capabilities 为 undefined
          const content = await buildMessageContentForLlm(
            node.content,
            node.attachments,
            undefined
          );
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
    // 这里的 filter 条件必须与 buildLlmContext 中构建 userAssistantMessages 的逻辑保持一致
    const presetMessagesData: ContextPreviewData["presetMessages"] = agentConfig ? await Promise.all(
      (agentConfig.presetMessages || []).filter((msg: any) => msg.isEnabled !== false && msg.role !== "system" && msg.type !== "chat_history" && msg.type !== "user_profile")
        .map(async (msg: any, index: number) => {
          // Fix: 使用未处理前的消息列表进行映射，以确保索引准确
          // 如果存在 _rawBeforeProcessing，说明应用了后处理规则，应使用原始列表
          const sourceMessages = (messages as any)._rawBeforeProcessing || messages;

          // 从 sourceMessages 中找到对应的消息（已处理宏）
          const systemMessageCount = sourceMessages.filter((m: any) => m.role === "system").length;

          // 计算正确的索引：考虑到会话历史可能插入到预设消息中间
          let targetIndex = systemMessageCount + index;

          // 如果有元数据且存在历史记录插入口
          let meta: LlmContextData['meta'];
          if (contextData && 'meta' in contextData) {
            meta = contextData.meta;
          }

          if (meta && meta.presetsBeforeCount !== undefined && meta.sessionMessageCount) {
            // 如果当前预设消息在插入点之后，需要跳过会话历史的长度
            if (index >= meta.presetsBeforeCount) {
              targetIndex += meta.sessionMessageCount;
            }
          } else if (meta && meta.sessionMessageCount > 0 && meta.presetsBeforeCount === undefined) {
            // 如果没有 placeholder (presetsBeforeCount undefined) 但有会话历史
            // 默认逻辑是预设在前，会话在后，所以不需要调整索引
            // targetIndex = systemMessageCount + index
          }

          const messageInSource = sourceMessages[targetIndex];

          // 安全检查：确保找到的消息存在
          if (!messageInSource) {
            logger.warn("上下文预览：无法找到对应的预设消息", { index, targetIndex, totalMessages: sourceMessages.length });
          }

          const content = messageInSource
            ? (typeof messageInSource.content === "string" ? messageInSource.content : JSON.stringify(messageInSource.content))
            : (typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));

          const sanitizedContent = sanitizeForCharCount(content);
          let tokenCount: number | undefined;
          try {
            const tokenResult = await tokenCalculatorService.calculateTokens(content, agentConfig.modelId);
            tokenCount = tokenResult.count;
            presetMessagesTokenCount += tokenResult.count;
            if (tokenResult.isEstimated) isEstimated = true;
            if (tokenResult.tokenizerName && !tokenizerName) {
              tokenizerName = tokenResult.tokenizerName;
            }
          } catch (error) {
            logger.warn("计算预设消息 token 失败", { index, error: error instanceof Error ? error.message : String(error) });
          }
          return { role: msg.role, content, charCount: sanitizedContent.length, tokenCount, source: "agent_preset", index };
        })
    ) : [];

    // 从节点路径中提取会话历史
    const chatHistoryData = await Promise.all(
      nodePath
        .filter(
          (node: ChatMessageNode) =>
            node.isEnabled !== false && (node.role === "user" || node.role === "assistant")
        )
        .map(async (node: ChatMessageNode, index: number) => {
          // 使用结构化分析器准备数据
          const {
            originalText,
            textAttachments,
            imageAttachments,
            videoAttachments,
            audioAttachments,
            otherAttachments
          } = await prepareStructuredMessageForAnalysis(node.content, node.attachments);

          const sanitizedContent = sanitizeForCharCount(originalText);
          let textTokenCount: number | undefined;

          // 1. 计算正文 Token（仅 originalText）
          if (agentConfig) {
            try {
              const textTokenResult = await tokenCalculatorService.calculateTokens(
                originalText,
                agentConfig.modelId
              );
              textTokenCount = textTokenResult.count;
              if (textTokenResult.isEstimated) isEstimated = true;
              if (textTokenResult.tokenizerName && !tokenizerName) {
                tokenizerName = textTokenResult.tokenizerName;
              }
            } catch (error) {
              logger.warn("计算历史消息文本 token 失败", {
                nodeId: node.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // 2. 附件分析和 Token 计算（独立计算每个附件）
          const attachmentsData: ContextPreviewData["chatHistory"][0]["attachments"] = [];
          let attachmentsTokenCount = 0;

          if (agentConfig && node.attachments && node.attachments.length > 0) {
            const modelMetadata = getMatchedModelProperties(agentConfig.modelId);
            const visionTokenCost = modelMetadata?.capabilities?.visionTokenCost;

            // 处理文本附件
            for (const item of textAttachments) {
              const { asset, content } = item;
              let tokenCount: number | undefined;
              let isAttachmentEstimated = false;

              try {
                const result = await tokenCalculatorService.calculateTokens(
                  content,
                  agentConfig.modelId
                );
                tokenCount = result.count;
                isAttachmentEstimated = result.isEstimated ?? false;
              } catch (error) {
                logger.warn("计算文本附件 Token 失败", { assetId: asset.id, error });
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
              });
            }

            // 处理图片附件
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
                      visionTokenCost
                    );
                  } catch (e) {
                    attachmentError = e instanceof Error ? e.message : "图片 Token 计算异常";
                    isAttachmentEstimated = true;
                  }
                } else {
                  attachmentError = "缺少图片尺寸信息，使用默认值估算";
                  tokenCount = tokenCalculatorEngine.calculateImageTokens(1024, 1024, visionTokenCost);
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

            // 处理视频附件
            for (const asset of videoAttachments) {
              let tokenCount: number | undefined;
              let isAttachmentEstimated = false;
              let attachmentError: string | undefined;

              if (asset.metadata?.duration) {
                try {
                  tokenCount = tokenCalculatorEngine.calculateVideoTokens(asset.metadata.duration);
                } catch (e) {
                  attachmentError = e instanceof Error ? e.message : "视频 Token 计算异常";
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

            // 处理音频附件
            for (const asset of audioAttachments) {
              let tokenCount: number | undefined;
              let isAttachmentEstimated = false;
              let attachmentError: string | undefined;

              if (asset.metadata?.duration) {
                try {
                  tokenCount = tokenCalculatorEngine.calculateAudioTokens(asset.metadata.duration);
                } catch (e) {
                  attachmentError = e instanceof Error ? e.message : "音频 Token 计算异常";
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

            // 处理其他附件
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

          // --- 合并 Token ---
          // 总 Token = 正文 Token + 所有附件 Token
          const totalNodeTokenCount = (textTokenCount ?? 0) + attachmentsTokenCount;
          if (textTokenCount !== undefined) {
            chatHistoryTokenCount += totalNodeTokenCount;
          }

          // 获取消息对应的 Agent 信息（用于头像展示）
          let msgAgentName: string | undefined;
          let msgAgentIcon: string | undefined;

          if (node.role === 'assistant') {
            const msgAgentId = node.metadata?.agentId || effectiveAgentId;
            if (msgAgentId) {
              const msgAgent = agentStore.getAgentById(msgAgentId);
              if (msgAgent) {
                msgAgentName = msgAgent.name;
                msgAgentIcon = resolveAvatarPath(msgAgent, 'agent') || undefined;
              }
            }
          }

          return {
            role: node.role,
            content: originalText, // 使用原始正文，不包含附件内容
            charCount: sanitizedContent.length,
            tokenCount: textTokenCount !== undefined ? totalNodeTokenCount : undefined,
            source: "session_history",
            nodeId: node.id,
            index,
            agentName: msgAgentName,
            agentIcon: msgAgentIcon,
            attachments: attachmentsData.length > 0 ? attachmentsData : undefined,
          };
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
        name: targetNode.metadata?.agentName || agent?.name,
        icon: targetNode.metadata?.agentIcon || resolveAvatarPath(agent, 'agent') || undefined,
        profileId: targetNode.metadata?.profileId || agentConfig?.profileId || '',
        modelId: targetNode.metadata?.modelId || agentConfig?.modelId || '',
      },
      // 优先使用节点元数据中的参数快照，否则回退到使用当前配置（并应用过滤）
      parameters: (() => {
        // 1. 尝试读取历史快照
        if (targetNode.metadata?.requestParameters) {
          return targetNode.metadata.requestParameters;
        }

        // 2. 回退逻辑：使用当前配置并过滤（兼容旧数据）
        if (!agentConfig?.parameters) return undefined;

        const configParams = agentConfig.parameters;
        // 注意：如果 enabledParameters 不存在或不是数组，则视为不进行过滤（显示所有参数）
        // 这可能是用户遇到“没过滤”的原因之一，所以这里我们加一个保险：
        // 如果是回退模式，且 metadata.modelId 与当前 modelId 不一致，我们应该更加谨慎
        // 但目前我们只能依赖 enabledParameters
        const isStrictFilter = Array.isArray(configParams.enabledParameters);
        const enabledList = configParams.enabledParameters || [];

        const effectiveParams: Record<string, any> = {};

        ALL_LLM_PARAMETER_KEYS.forEach((key) => {
          const hasValue = configParams[key] !== undefined;

          // 如果启用了严格过滤，则只保留在列表中的参数
          // 否则保留所有参数
          const isEnabled = isStrictFilter ? enabledList.includes(key) : true;

          if (hasValue && isEnabled) {
            effectiveParams[key] = configParams[key];
          }
        });

        return effectiveParams;
      })(),
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
