/**
 * 聊天上下文构建 Composable
 * 负责构建发送给 LLM 的最终消息列表
 */

import type { ChatSession, ChatMessageNode, ContextPostProcessRule, UserProfile, InjectionStrategy } from "../types";
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
import { useUserProfileStore } from "../userProfileStore";
import { ALL_LLM_PARAMETER_KEYS } from "../config/parameter-config";
import { resolveAvatarPath } from "./useResolvedAvatar";
import { useMessageProcessor } from "./useMessageProcessor";
import type { ProcessableMessage } from "./useMessageProcessor";
import type { Asset, AssetMetadata } from "@/types/asset-management";

const logger = createModuleLogger("llm-chat/context-builder");

/**
 * 带注入策略的消息包装器（用于内部处理）
 */
interface InjectionMessage {
  message: ChatMessageNode;
  processedContent?: string;
  strategy: InjectionStrategy;
}

/**
 * LLM 上下文构建结果
 * 现在返回统一的消息列表，可包含 system, user, assistant 角色
 */
interface LlmContextData {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string | LlmMessageContent[];
    /** 消息来源类型 */
    sourceType?: "agent_preset" | "session_history" | "user_profile" | "depth_injection" | "anchor_injection" | "unknown" | "merged";
    /** 来源标识（预设消息的 index 或会话历史的 nodeId） */
    sourceId?: string | number;
    /** 在来源数组中的索引（用于精确匹配） */
    sourceIndex?: number;
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
  /** 预设消息部分（包含 system/user/assistant 等所有预设） */
  presetMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
    originalContent?: string;
    charCount: number;
    tokenCount?: number;
    source: "agent_preset";
    index: number;
    /** 节点所使用的用户名称（快照） */
    userName?: string;
    /** 节点所使用的用户图标（快照） */
    userIcon?: string;
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
    /** 节点所使用的用户名称（快照） */
    userName?: string;
    /** 节点所使用的用户图标（快照） */
    userIcon?: string;
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
    /** 消息来源类型 */
    sourceType?: "agent_preset" | "session_history" | "user_profile" | "depth_injection" | "anchor_injection" | "unknown" | "merged";
    /** 用于存储被合并的原始消息 */
    _mergedSources?: any[];
    /** 来源标识（预设消息的 index 或会话历史的 nodeId） */
    sourceId?: string | number;
    /** 在来源数组中的索引（用于精确匹配） */
    sourceIndex?: number;
  }>;
  /** 统计信息 */
  statistics: {
    totalCharCount: number;
    presetMessagesCharCount: number;
    chatHistoryCharCount: number;
    postProcessingCharCount?: number;
    messageCount: number;
    totalTokenCount?: number;
    presetMessagesTokenCount?: number;
    chatHistoryTokenCount?: number;
    postProcessingTokenCount?: number;
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
    virtualTimeConfig?: {
      virtualBaseTime: string;
      realBaseTime: string;
      timeScale?: number;
    };
  };
  /** LLM 请求参数 */
  parameters?: LlmParameters;
  /** 目标节点的时间戳（用于宏预览） */
  targetTimestamp?: number;
  /** 用户信息（用于宏预览） */
  userInfo?: {
    id?: string;
    name?: string;
    displayName?: string;
    icon?: string;
  };
}

export function useChatContextBuilder() {
  const getValidTimestamp = (ts: any): number | null => {
    if (typeof ts === 'number') {
      return isFinite(ts) ? ts : null;
    }
    if (typeof ts === 'string') {
      // 尝试直接转换数字 (时间戳字符串)
      const num = Number(ts);
      if (isFinite(num)) return num;

      // 尝试解析日期字符串 (ISO 格式等)
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }
    }
    return null;
  };

  const { buildMessageContentForLlm, prepareStructuredMessageForAnalysis } = useMessageBuilder();
  const { processMacros, processMacrosBatch } = useMacroProcessor();
  const { calculatePostProcessingTokenDelta } = useMessageProcessor();

  // ==================== 注入策略辅助函数 ====================

  /**
   * 消息分类结果
   */
  interface ClassifiedMessages {
    /** 骨架消息：无注入策略，按数组顺序排列 */
    skeleton: ChatMessageNode[];
    /** 深度注入消息：有 depth 字段 */
    depthInjections: InjectionMessage[];
    /** 锚点注入消息：有 anchorTarget 字段 */
    anchorInjections: InjectionMessage[];
  }

  /**
   * 对预设消息进行分类
   * 优先级：depth > anchorTarget > 无策略
   */
  const classifyPresetMessages = (presetMessages: ChatMessageNode[]): ClassifiedMessages => {
    const skeleton: ChatMessageNode[] = [];
    const depthInjections: InjectionMessage[] = [];
    const anchorInjections: InjectionMessage[] = [];

    for (const msg of presetMessages) {
      const strategy = msg.injectionStrategy;

      if (!strategy) {
        // 无策略，作为骨架消息
        skeleton.push(msg);
      } else if (strategy.depth !== undefined) {
        // 深度注入优先
        depthInjections.push({
          message: msg,
          strategy: { ...strategy, order: strategy.order ?? 100 },
        });
      } else if (strategy.anchorTarget) {
        // 锚点注入
        anchorInjections.push({
          message: msg,
          strategy: { ...strategy, order: strategy.order ?? 100 },
        });
      } else {
        // 策略对象存在但没有有效字段，视为骨架消息
        skeleton.push(msg);
      }
    }

    logger.debug("📋 预设消息分类完成", {
      skeletonCount: skeleton.length,
      depthInjectionsCount: depthInjections.length,
      anchorInjectionsCount: anchorInjections.length,
    });

    return { skeleton, depthInjections, anchorInjections };
  };

  /**
   * 按 order 排序注入消息
   * order 值越大越靠近新消息（对话末尾）
   */
  const sortByOrder = (injections: InjectionMessage[]): InjectionMessage[] => {
    return [...injections].sort((a, b) => (a.strategy.order ?? 100) - (b.strategy.order ?? 100));
  };

  /**
   * 将深度注入消息插入到会话历史中
   * @param history 会话历史消息列表（按时间顺序，最旧在前）
   * @param depthInjections 深度注入消息列表
   * @returns 插入后的消息列表
   */
  const applyDepthInjections = <T extends { role: string; content: any }>(
    history: T[],
    depthInjections: InjectionMessage[],
    processedContents: Map<string, string>,
    presetMessages: ChatMessageNode[]
  ): (T | { role: string; content: string; sourceType: string; sourceId: string; sourceIndex: number })[] => {
    if (depthInjections.length === 0) {
      return history;
    }

    // 按 depth 分组，同一深度的按 order 排序
    const depthGroups = new Map<number, InjectionMessage[]>();
    for (const injection of depthInjections) {
      const depth = injection.strategy.depth ?? 0;
      if (!depthGroups.has(depth)) {
        depthGroups.set(depth, []);
      }
      depthGroups.get(depth)!.push(injection);
    }

    // 对每组按 order 排序
    for (const [depth, group] of depthGroups) {
      depthGroups.set(depth, sortByOrder(group));
    }

    // 构建结果数组
    const result: (T | { role: string; content: string; sourceType: string; sourceId: string; sourceIndex: number })[] = [...history];

    // 按深度从大到小处理（先处理更深的位置，避免索引偏移问题）
    const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => b - a);

    for (const depth of sortedDepths) {
      const group = depthGroups.get(depth)!;
      // 计算插入位置：从末尾往前数 depth 条
      // depth=0 表示在最后, depth=1 表示倒数第1条之后
      const insertIndex = Math.max(0, result.length - depth);

      // 将这组消息插入到该位置（按 order 顺序）
      const injectedMessages = group.map((inj) => ({
        role: inj.message.role,
        content: processedContents.get(inj.message.id) ?? inj.message.content,
        sourceType: "depth_injection",
        sourceId: inj.message.id,
        sourceIndex: presetMessages.indexOf(inj.message),
      }));

      result.splice(insertIndex, 0, ...injectedMessages);
    }

    logger.debug("📍 深度注入完成", {
      originalHistoryLength: history.length,
      injectedCount: depthInjections.length,
      resultLength: result.length,
      depths: Array.from(depthGroups.keys()),
    });

    return result;
  };

  /**
   * 获取锚点注入消息（按锚点和位置分组）
   */
  const getAnchorInjectionGroups = (
    anchorInjections: InjectionMessage[]
  ): Map<string, { before: InjectionMessage[]; after: InjectionMessage[] }> => {
    const groups = new Map<string, { before: InjectionMessage[]; after: InjectionMessage[] }>();

    for (const injection of anchorInjections) {
      const target = injection.strategy.anchorTarget!;
      const position = injection.strategy.anchorPosition ?? 'after';

      if (!groups.has(target)) {
        groups.set(target, { before: [], after: [] });
      }

      // 存储完整的 InjectionMessage 对象
      const group = groups.get(target)!;
      if (position === 'before') {
        group.before.push(injection);
      } else {
        group.after.push(injection);
      }
    }

    // 对每组按 order 排序
    // 需要分别处理原始的 anchorInjections 来获取 order 信息
    // 由于我们在构建时丢失了 order 信息，需要在添加时就排好序
    // 这里的逻辑已在添加时通过 sortByOrder 处理，所以暂时移除这个循环

    return groups;
  };

  /**
   * 对锚点注入消息进行排序（在添加到 groups 之前调用）
   */
  const getSortedAnchorInjections = (anchorInjections: InjectionMessage[]): InjectionMessage[] => {
    return sortByOrder(anchorInjections);
  };

  /**
   * 应用上下文 Token 限制，截断会话历史
   * 注意：system 消息的合并已移至后处理管道，此处不再单独计算
   */
  const applyContextLimit = async <T extends { role: "user" | "assistant"; content: string | LlmMessageContent[] }>(
    sessionContext: T[],
    presetMessages: Array<{ role: "user" | "assistant"; content: string | LlmMessageContent[] }>,
    contextManagement: { enabled: boolean; maxContextTokens: number; retainedCharacters: number },
    modelId: string
  ): Promise<T[]> => {
    const { maxContextTokens, retainedCharacters } = contextManagement;

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
    const availableTokens = maxContextTokens - presetMessagesTokens;

    logger.info("📊 上下文限制检查", {
      maxContextTokens,
      presetMessagesTokens,
      availableTokens,
      sessionMessageCount: sessionContext.length,
    }, true);

    if (availableTokens <= 0) {
      logger.warn("⚠️ 预设消息已超出最大上下文限制，会话历史将被完全截断", {
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
        // 完整保留，并保留原始属性
        const { tokenCount, index: _, ...rest } = msg;
        return rest as unknown as T;
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

        const { tokenCount, index: _, ...rest } = msg;
        return {
          ...rest,
          content: truncatedContent,
        } as unknown as T;
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
    capabilities?: ModelCapabilities,
    timestamp?: number
  ): Promise<LlmContextData> => {
    // 过滤出有效的对话上下文（排除禁用节点和系统节点）
    const llmContextPromises = activePath
      .filter((node) => node.isEnabled !== false)
      .filter((node) => node.role !== "system")
      .filter((node) => node.role === "user" || node.role === "assistant")
      .map(async (node, index) => {
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
          sourceType: "session_history",
          sourceId: node.id,
          sourceIndex: index,
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
    // 💡 Fix: 放宽类型定义，允许通过锚点注入非 system 角色的消息
    const systemMessagesList: Array<{
      role: "system" | "user" | "assistant";
      content: string;
      sourceType?: string;
      sourceId?: string | number;
      sourceIndex?: number;
    }> = [];

    // 记录用户档案在 systemMessagesList 中的索引，用于锚点注入
    let userProfileInjectionIndex = -1;

    // 查找用户档案占位符
    const userProfilePlaceholderIndex = enabledPresets.findIndex(
      (msg: any) => msg.type === "user_profile"
    );

    // 收集所有 system 消息
    for (let i = 0; i < enabledPresets.length; i++) {
      const msg = enabledPresets[i];
      // 获取原始索引
      const originalIndex = presetMessages.indexOf(msg);

      // 跳过用户档案占位符本身
      if (msg.type === "user_profile") {
        // 如果有用户档案，在此位置插入（处理宏）
        if (effectiveUserProfile) {
          const userProfilePrompt = `# 用户档案\n${effectiveUserProfile.content}`;
          const processedUserProfile = await processMacros(userProfilePrompt, {
            session,
            agent: currentAgent ?? undefined,
            userProfile: effectiveUserProfile as UserProfile,
            timestamp,
          });

          // 记录注入位置
          userProfileInjectionIndex = systemMessagesList.length;

          systemMessagesList.push({
            role: "system",
            content: processedUserProfile,
            sourceType: "user_profile",
            sourceId: effectiveUserProfile.id,
            sourceIndex: originalIndex,
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
      // 💡 Fix: 排除掉已作为注入策略处理的消息，防止重复（双重消息 Bug）
      if (
        msg.role === "system" &&
        msg.type !== "chat_history" &&
        !(msg.injectionStrategy?.depth !== undefined || msg.injectionStrategy?.anchorTarget)
      ) {
        const processedContent = await processMacros(msg.content, {
          session,
          agent: currentAgent ?? undefined,
          userProfile: effectiveUserProfile as UserProfile,
          timestamp,
        });

        systemMessagesList.push({
          role: "system",
          content: processedContent,
          sourceType: "agent_preset",
          sourceId: originalIndex,
          sourceIndex: originalIndex,
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
        timestamp,
      });

      // 记录注入位置
      userProfileInjectionIndex = systemMessagesList.length;

      systemMessagesList.push({
        role: "system",
        content: processedUserProfile,
        sourceType: "user_profile",
        sourceId: effectiveUserProfile.id,
        sourceIndex: enabledPresets.length,
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

    // ==================== 注入策略处理 ====================
    // 对预设消息进行分类
    const { skeleton, depthInjections, anchorInjections } = classifyPresetMessages(enabledPresets);

    // 预处理所有注入消息的内容（处理宏）
    const injectionProcessedContents = new Map<string, string>();
    if (depthInjections.length > 0 || anchorInjections.length > 0) {
      const allInjectionMessages = [
        ...depthInjections.map(i => i.message),
        ...anchorInjections.map(i => i.message),
      ];
      const injectionContents = await processMacrosBatch(
        allInjectionMessages.map((msg) => msg.content),
        {
          session,
          agent: currentAgent ?? undefined,
          userProfile: effectiveUserProfile as UserProfile,
          timestamp,
        }
      );
      allInjectionMessages.forEach((msg, index) => {
        injectionProcessedContents.set(msg.id, injectionContents[index]);
      });

      logger.debug("🔧 注入消息宏处理完成", {
        depthInjectionsCount: depthInjections.length,
        anchorInjectionsCount: anchorInjections.length,
      });
    }

    // 查找历史消息占位符（从骨架消息中查找，以保持原有逻辑）
    const chatHistoryPlaceholderIndex = skeleton.findIndex(
      (msg: any) => msg.type === "chat_history"
    );

    // 获取锚点注入分组（用于后续插入）
    const anchorGroups = getAnchorInjectionGroups(
      getSortedAnchorInjections(anchorInjections)
    );

    // ==================== 应用 user_profile 锚点注入 ====================
    const userProfileAnchor = anchorGroups.get('user_profile');
    if (userProfileAnchor && userProfileInjectionIndex !== -1) {
      // 插入 before 组
      if (userProfileAnchor.before.length > 0) {
        const beforeMessages = userProfileAnchor.before.map(inj => ({
          role: inj.message.role as "system" | "user" | "assistant",
          content: injectionProcessedContents.get(inj.message.id) ?? inj.message.content,
          sourceType: "anchor_injection",
          sourceId: inj.message.id,
          sourceIndex: presetMessages.indexOf(inj.message),
        }));
        systemMessagesList.splice(userProfileInjectionIndex, 0, ...beforeMessages);
        // 更新索引，因为插入了新消息
        userProfileInjectionIndex += beforeMessages.length;
      }

      // 插入 after 组
      if (userProfileAnchor.after.length > 0) {
        const afterMessages = userProfileAnchor.after.map(inj => ({
          role: inj.message.role as "system" | "user" | "assistant",
          content: injectionProcessedContents.get(inj.message.id) ?? inj.message.content,
          sourceType: "anchor_injection",
          sourceId: inj.message.id,
          sourceIndex: presetMessages.indexOf(inj.message),
        }));
        // 插入到 user_profile 之后 (index + 1)
        systemMessagesList.splice(userProfileInjectionIndex + 1, 0, ...afterMessages);
      }

      logger.debug("⚓ 已应用 user_profile 锚点注入", {
        beforeCount: userProfileAnchor.before.length,
        afterCount: userProfileAnchor.after.length,
        injectionIndex: userProfileInjectionIndex
      });
    } else if (userProfileAnchor) {
      logger.warn("⚠️ 存在 user_profile 锚点注入消息，但未找到用户档案位置，注入失败");
    }

    // 准备预设对话（用于 token 计算，不包括 system）
    // 需要处理宏
    // 🐛 Fix: 排除掉已作为注入策略处理的消息，防止重复
    const presetConversationRaw = enabledPresets.filter(
      (msg: any) =>
        (msg.role === "user" || msg.role === "assistant") &&
        msg.type !== "user_profile" &&
        !(msg.injectionStrategy?.depth !== undefined || msg.injectionStrategy?.anchorTarget)
    );

    const presetConversationContents = await processMacrosBatch(
      presetConversationRaw.map((msg: any) => msg.content),
      {
        session,
        agent: currentAgent ?? undefined,
        userProfile: effectiveUserProfile as UserProfile,
        timestamp,
      }
    );

    const presetConversation: Array<{
      role: "user" | "assistant";
      content: string | LlmMessageContent[];
      sourceType?: string;
      sourceId?: string | number;
      sourceIndex?: number;
    }> = presetConversationRaw.map((msg: any, index: number) => ({
      role: msg.role as "user" | "assistant",
      content: presetConversationContents[index],
      sourceType: "agent_preset",
      sourceId: presetMessages.indexOf(msg),
      sourceIndex: presetMessages.indexOf(msg),
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
        presetConversation,
        agentConfig.parameters.contextManagement,
        agentConfig.modelId
      );
    }

    // 构建最终的 user/assistant 消息列表
    let userAssistantMessages: Array<{
      role: "user" | "assistant";
      content: string | LlmMessageContent[];
      sourceType?: string;
      sourceId?: string | number;
      sourceIndex?: number;
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
            (msg.role === "user" || msg.role === "assistant") &&
            msg.type !== "user_profile" &&
            !(msg.injectionStrategy?.depth !== undefined || msg.injectionStrategy?.anchorTarget)
        );

      const presetsAfterRaw = enabledPresets
        .slice(chatHistoryPlaceholderIndex + 1)
        .filter(
          (msg: any) =>
            (msg.role === "user" || msg.role === "assistant") &&
            msg.type !== "user_profile" &&
            !(msg.injectionStrategy?.depth !== undefined || msg.injectionStrategy?.anchorTarget)
        );

      const presetsBeforeContents = await processMacrosBatch(
        presetsBeforeRaw.map((msg: any) => msg.content),
        {
          session,
          agent: currentAgent ?? undefined,
          userProfile: effectiveUserProfile as UserProfile,
          timestamp,
        }
      );

      const presetsAfterContents = await processMacrosBatch(
        presetsAfterRaw.map((msg: any) => msg.content),
        {
          session,
          agent: currentAgent ?? undefined,
          userProfile: effectiveUserProfile as UserProfile,
          timestamp,
        }
      );

      const presetsBeforePlaceholder: Array<{
        role: "user" | "assistant";
        content: string | LlmMessageContent[];
        sourceType?: string;
        sourceId?: string | number;
        sourceIndex?: number;
      }> = presetsBeforeRaw.map((msg: any, index: number) => ({
        role: msg.role as "user" | "assistant",
        content: presetsBeforeContents[index],
        sourceType: "agent_preset",
        sourceId: presetMessages.indexOf(msg),
        sourceIndex: presetMessages.indexOf(msg),
      }));

      presetsBeforeCount = presetsBeforePlaceholder.length;

      const presetsAfterPlaceholder: Array<{
        role: "user" | "assistant";
        content: string | LlmMessageContent[];
        sourceType?: string;
        sourceId?: string | number;
        sourceIndex?: number;
      }> = presetsAfterRaw.map((msg: any, index: number) => ({
        role: msg.role as "user" | "assistant",
        content: presetsAfterContents[index],
        sourceType: "agent_preset",
        sourceId: presetMessages.indexOf(msg),
        sourceIndex: presetMessages.indexOf(msg),
      }));

      userAssistantMessages = [
        ...presetsBeforePlaceholder,
        ...sessionContext,
        ...presetsAfterPlaceholder,
      ];

      // 应用锚点注入（在 chat_history 位置）
      const chatHistoryAnchor = anchorGroups.get('chat_history');
      if (chatHistoryAnchor) {
        // 找到 sessionContext 的开始位置
        const sessionStartIndex = presetsBeforePlaceholder.length;
        // 在 sessionContext 前插入 before 组消息
        if (chatHistoryAnchor.before.length > 0) {
          const beforeMessages = chatHistoryAnchor.before.map(inj => ({
            role: inj.message.role as "user" | "assistant",
            content: injectionProcessedContents.get(inj.message.id) ?? inj.message.content,
            sourceType: "anchor_injection",
            sourceId: inj.message.id,
            sourceIndex: presetMessages.indexOf(inj.message),
          }));
          userAssistantMessages.splice(sessionStartIndex, 0, ...beforeMessages);
        }
        // 在 sessionContext 后（presetsAfterPlaceholder 前）插入 after 组消息
        if (chatHistoryAnchor.after.length > 0) {
          const afterInsertIndex = sessionStartIndex + chatHistoryAnchor.before.length + sessionContext.length;
          const afterMessages = chatHistoryAnchor.after.map(inj => ({
            role: inj.message.role as "user" | "assistant",
            content: injectionProcessedContents.get(inj.message.id) ?? inj.message.content,
            sourceType: "anchor_injection",
            sourceId: inj.message.id,
            sourceIndex: presetMessages.indexOf(inj.message),
          }));
          userAssistantMessages.splice(afterInsertIndex, 0, ...afterMessages);
        }
      }

      logger.debug("使用历史消息占位符构建上下文", {
        presetsBeforeCount: presetsBeforePlaceholder.length,
        sessionContextCount: sessionContext.length,
        presetsAfterCount: presetsAfterPlaceholder.length,
        anchorInjectionsApplied: !!chatHistoryAnchor,
        totalUserAssistantMessages: userAssistantMessages.length,
      }, true);
    } else {
      // 如果没有占位符，按原来的逻辑：预设消息在前，会话上下文在后
      userAssistantMessages = [...presetConversation, ...sessionContext];
    }

    // ==================== 应用深度注入 ====================
    // 深度注入是相对于会话历史末尾的位置
    if (depthInjections.length > 0) {
      const injectedMessages = applyDepthInjections(
        userAssistantMessages,
        depthInjections,
        injectionProcessedContents,
        presetMessages
      );
      // 转换回标准格式（这里其实不需要移除了，因为我们需要这些信息）
      userAssistantMessages = injectedMessages as any;

      logger.debug("📍 深度注入已应用", {
        originalLength: userAssistantMessages.length - depthInjections.length,
        injectedCount: depthInjections.length,
        finalLength: userAssistantMessages.length,
      });
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
    agentId?: string,
    parameterOverrides?: LlmParameters
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

    // 提前计算时间戳，以便在宏处理中使用
    const targetTimestamp = getValidTimestamp(targetNode.timestamp) ?? undefined;

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

    // 尝试恢复 User Profile (用于宏处理和头像展示)
    // 优先从目标节点（如果是 User）或其父节点（如果是 Assistant）的 metadata 中恢复
    let effectiveUserProfile: any = null;
    const userProfileStore = useUserProfileStore();

    let relevantUserNode: ChatMessageNode | undefined;
    if (targetNode.role === 'user') {
      relevantUserNode = targetNode;
    } else if (targetNode.role === 'assistant' && targetNode.parentId) {
      relevantUserNode = session.nodes[targetNode.parentId];
    }

    if (relevantUserNode?.metadata?.userProfileId) {
      // 1. 尝试从 Store 获取完整档案（为了 content）
      const storeProfile = userProfileStore.getProfileById(relevantUserNode.metadata.userProfileId);

      // 2. 构建生效的 Profile
      // name 始终从 store 获取，确保是唯一的 ID name
      // displayName 优先使用快照，然后回退到 store
      effectiveUserProfile = {
        id: relevantUserNode.metadata.userProfileId,
        name: storeProfile?.name || 'User', // 修正：直接从 store 获取 name (ID)
        displayName: relevantUserNode.metadata.userProfileName || storeProfile?.displayName, // 快照中的 userProfileName 实际上是 displayName
        icon: relevantUserNode.metadata.userProfileIcon || storeProfile?.icon,
        content: storeProfile?.content || ''
      };

      logger.debug("上下文预览：恢复用户档案快照", {
        id: effectiveUserProfile.id,
        name: effectiveUserProfile.name,
        hasContent: !!effectiveUserProfile.content
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

      // 如果提供了临时的参数覆盖（例如在编辑器中预览时），应用它们
      if (agentConfig && parameterOverrides) {
        agentConfig = {
          ...agentConfig,
          parameters: {
            ...agentConfig.parameters,
            ...parameterOverrides,
          },
        };
        logger.debug("应用临时参数覆盖进行预览", {
          overridesKeys: Object.keys(parameterOverrides)
        });
      }

      if (!agentConfig) {
        logger.warn("⚠️ 无法获取 Agent 配置，将只计算会话历史", { agentId: effectiveAgentId });
      } else {
        agent = agentStore.getAgentById(effectiveAgentId);
        const profile = getProfileById(agentConfig.profileId);
        model = profile?.models.find((m: any) => m.id === agentConfig.modelId);
      }
    }

    // 如果从节点元数据无法恢复 User Profile，尝试从 Agent 配置或全局配置获取
    // 这种情况通常发生在：
    // 1. 新会话，还没有生成过节点元数据
    // 2. 正在预览/编辑 Agent 配置，需要实时反馈当前配置的效果
    if (!effectiveUserProfile && agentConfig) {
      if (agentConfig.userProfileId) {
        effectiveUserProfile = userProfileStore.getProfileById(agentConfig.userProfileId);
      }

      // 如果 Agent 没有特定绑定，或者是 null（意为继承全局），则使用全局
      if (!effectiveUserProfile) {
        effectiveUserProfile = userProfileStore.globalProfile;
      }

      if (effectiveUserProfile) {
        logger.debug("上下文预览：使用当前配置的用户档案", {
          id: effectiveUserProfile.id,
          source: agentConfig.userProfileId ? "agent_binding" : "global",
        });
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
        session,
        effectiveUserProfile, // effectiveUserProfile
        undefined, // capabilities
        targetTimestamp // 传递目标时间戳
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
    let presetMessagesTokenCount = 0;
    let chatHistoryTokenCount = 0;
    let postProcessingTokenCount = 0;
    let postProcessingCharCount = 0;
    let isEstimated = false;
    let tokenizerName = "";

    // 提取预设消息部分（仅当有 Agent 配置时）
    let presetMessagesData: ContextPreviewData["presetMessages"] = [];

    if (agentConfig) {
      const rawPresets = agentConfig.presetMessages || [];
      const hasUserProfilePlaceholder = rawPresets.some((msg: any) => msg.type === "user_profile");

      // 构造待处理列表，包含普通预设和用户档案
      const itemsToProcess: Array<{
        role: "system" | "user" | "assistant";
        content: string;
        originalContent: string;
        index: number;
        isUserProfile?: boolean;
      }> = [];

      // 1. 遍历原始预设消息
      for (let i = 0; i < rawPresets.length; i++) {
        const msg = rawPresets[i];
        if (msg.isEnabled === false) continue;
        if (msg.type === "chat_history") continue; // 跳过历史占位符

        if (msg.type === "user_profile") {
          // 如果遇到用户档案占位符，且有有效档案，则插入
          if (effectiveUserProfile) {
            const userProfileContent = `# 用户档案\n${effectiveUserProfile.content}`;
            itemsToProcess.push({
              role: msg.role || "system", // 使用配置的角色，默认为 system
              content: userProfileContent,
              originalContent: userProfileContent,
              index: i,
              isUserProfile: true,
            });
          }
          continue;
        }

        // 普通消息
        const contentStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        itemsToProcess.push({
          role: msg.role,
          content: contentStr,
          originalContent: contentStr,
          index: i,
        });
      }

      // 2. 如果没有占位符但有档案，追加到 System 消息组的末尾
      // (为了模拟 buildLlmContext 中 System 消息优先的行为，我们需要将其插在合适的位置)
      if (!hasUserProfilePlaceholder && effectiveUserProfile) {
        const userProfileContent = `# 用户档案\n${effectiveUserProfile.content}`;
        const newItem = {
          role: "system" as const,
          content: userProfileContent,
          originalContent: userProfileContent,
          index: rawPresets.length,
          isUserProfile: true,
        };

        // 找到最后一个 system 消息的位置
        let lastSystemIndex = -1;
        for (let i = itemsToProcess.length - 1; i >= 0; i--) {
          if (itemsToProcess[i].role === "system") {
            lastSystemIndex = i;
            break;
          }
        }

        if (lastSystemIndex !== -1) {
          // 插在最后一个 system 消息之后
          itemsToProcess.splice(lastSystemIndex + 1, 0, newItem);
        } else {
          // 如果没有 system 消息，插在最前面
          itemsToProcess.unshift(newItem);
        }
      }

      // 3. 批量处理宏和 Token 计算
      presetMessagesData = await Promise.all(
        itemsToProcess.map(async (item) => {
          let content = item.content;

          // 处理宏
          try {
            content = await processMacros(content, {
              session,
              agent: agent ?? undefined,
              userProfile: effectiveUserProfile,
              timestamp: targetTimestamp,
            });
          } catch (error) {
            logger.warn("预设消息宏处理失败，将使用原始内容", { index: item.index, error });
          }

          const sanitizedContent = sanitizeForCharCount(content);

          let tokenCount: number | undefined;
          try {
            const tokenResult = await tokenCalculatorService.calculateTokens(
              content,
              agentConfig.modelId
            );
            tokenCount = tokenResult.count;
            presetMessagesTokenCount += tokenResult.count;
            if (tokenResult.isEstimated) isEstimated = true;
            if (tokenResult.tokenizerName && !tokenizerName) {
              tokenizerName = tokenResult.tokenizerName;
            }
          } catch (error) {
            logger.warn("计算预设消息 token 失败", {
              index: item.index,
              error: error instanceof Error ? error.message : String(error),
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
            // 如果是 user 角色，注入当时的用户信息
            userName: item.role === "user" ? effectiveUserProfile?.name : undefined,
            userIcon: item.role === "user" ? effectiveUserProfile?.icon : undefined,
            // 标记是否为用户档案（可选，用于前端特殊展示）
            isUserProfile: item.isUserProfile,
          };
        })
      );
    }
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
          // 获取消息对应的 User 信息（用于头像展示）
          let msgUserName: string | undefined;
          let msgUserIcon: string | undefined;

          if (node.role === 'assistant') {
            const msgAgentId = node.metadata?.agentId || effectiveAgentId;

            // 1. 尝试从 Store 获取当前 Agent
            let storeAgent: any = null;
            if (msgAgentId) {
              storeAgent = agentStore.getAgentById(msgAgentId);
            }

            // 2. 获取名称：优先使用快照，否则使用 Store 中的名称
            msgAgentName = node.metadata?.agentName || storeAgent?.name;

            // 3. 获取头像：优先使用快照
            if (node.metadata?.agentIcon && msgAgentId) {
              msgAgentIcon =
                resolveAvatarPath(
                  { id: msgAgentId, icon: node.metadata.agentIcon },
                  'agent'
                ) || undefined;
            }

            // 4. 如果没有快照头像，回退到 Store 中的头像
            if (!msgAgentIcon && storeAgent) {
              msgAgentIcon = resolveAvatarPath(storeAgent, 'agent') || undefined;
            }
          } else if (node.role === 'user') {
            // 处理用户消息的快照信息
            msgUserName = node.metadata?.userProfileName;

            // 处理用户头像
            if (node.metadata?.userProfileIcon) {
              // 如果有快照图标，尝试解析
              // 注意：这里假设用户头像也可以通过 resolveAvatarPath 解析，或者直接是 URL/Emoji
              // 由于 userProfileIcon 通常是 emoji 或 URL，或者是 appdata:// 路径
              // 这里我们直接使用，如果是 appdata 路径，Avatar 组件会处理
              msgUserIcon = node.metadata.userProfileIcon;
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
            userName: msgUserName,
            userIcon: msgUserIcon,
            attachments: attachmentsData.length > 0 ? attachmentsData : undefined,
          };
        })
    );

    // 计算后处理规则带来的额外 Token
    if (agentConfig) {
      const modelDefaultRules = model?.defaultPostProcessingRules || [];
      const agentRules = agentConfig.parameters.contextPostProcessing?.rules || [];

      const modelRulesObjects = modelDefaultRules.map((type: string) => ({ type, enabled: true }));
      const agentRuleTypes = new Set(agentRules.map((r: any) => r.type));
      const mergedRules = [
        ...agentRules,
        ...modelRulesObjects.filter((r: any) => !agentRuleTypes.has(r.type)),
      ];

      if (mergedRules.length > 0) {
        // 构建原始消息列表 (Raw Messages) 用于计算增量
        // 这里我们需要组合 presetMessagesData 和 chatHistoryData
        // 注意：这里的顺序应该尽可能的模拟真实构建顺序，通常是 Preset -> History
        // (虽然真实构建中 History 可能插在 Preset 中间，但对于计算“分隔符增量”来说，简单的拼接通常足够近似，
        // 除非有 merge-consecutive-roles 且连接处正好是相同角色)

        // 为了更精确，我们应该利用 messages (或 _rawBeforeProcessing)
        // 因为那里包含了正确的顺序。
        const rawMessages = (messages as any)._rawBeforeProcessing || messages;

        // 使用 calculatePostProcessingTokenDelta 计算纯增量
        const deltaContent = calculatePostProcessingTokenDelta(rawMessages, mergedRules);

        if (deltaContent) {
          postProcessingCharCount = deltaContent.length;
          try {
            const tokenResult = await tokenCalculatorService.calculateTokens(deltaContent, agentConfig.modelId);
            postProcessingTokenCount = tokenResult.count;
            logger.debug("后处理增量 Token 计算", { deltaContentLength: deltaContent.length, tokenCount: postProcessingTokenCount });
          } catch (error) {
            logger.warn("计算后处理增量 Token 失败", { error: error instanceof Error ? error.message : String(error) });
          }
        }
      }
    }

    // 计算统计信息
    const presetMessagesCharCount = presetMessagesData.reduce((sum, msg) => sum + msg.charCount, 0);
    const chatHistoryCharCount = chatHistoryData.reduce((sum, msg) => sum + msg.charCount, 0);
    const totalCharCount = presetMessagesCharCount + chatHistoryCharCount + postProcessingCharCount;
    const totalTokenCount = presetMessagesTokenCount + chatHistoryTokenCount + postProcessingTokenCount;

    const result: ContextPreviewData = {
      presetMessages: presetMessagesData,
      chatHistory: chatHistoryData,
      finalMessages: messages,
      statistics: {
        totalCharCount,
        presetMessagesCharCount,
        chatHistoryCharCount,
        postProcessingCharCount: agentConfig ? postProcessingCharCount : undefined,
        messageCount: messages.length,
        totalTokenCount: agentConfig ? totalTokenCount : undefined,
        presetMessagesTokenCount: agentConfig ? presetMessagesTokenCount : undefined,
        chatHistoryTokenCount: agentConfig ? chatHistoryTokenCount : undefined,
        postProcessingTokenCount: agentConfig ? postProcessingTokenCount : undefined,
        isEstimated: agentConfig ? isEstimated : undefined,
        tokenizerName: agentConfig ? tokenizerName : undefined,
      },
      agentInfo: {
        id: effectiveAgentId ?? '',
        name: targetNode.metadata?.agentName || agent?.name,
        icon: targetNode.metadata?.agentIcon || resolveAvatarPath(agent, 'agent') || undefined,
        profileId: targetNode.metadata?.profileId || agentConfig?.profileId || '',
        modelId: targetNode.metadata?.modelId || agentConfig?.modelId || '',
        // 优先从节点元数据恢复虚拟时间配置，否则使用当前配置
        virtualTimeConfig: targetNode.metadata?.virtualTimeConfig || agent?.virtualTimeConfig || agentConfig?.virtualTimeConfig,
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
      targetTimestamp: targetTimestamp,
      userInfo: {
        id: effectiveUserProfile?.id,
        name: effectiveUserProfile?.name,
        displayName: effectiveUserProfile?.displayName,
        icon: effectiveUserProfile?.icon,
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
