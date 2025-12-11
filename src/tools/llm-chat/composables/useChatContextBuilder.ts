/**
 * 聊天上下文构建 Composable
 * 负责构建发送给 LLM 的最终消息列表
 * (这是一个协调模块，组合了其他子模块的功能)
 */

import type { ChatSession, ChatMessageNode, UserProfile } from "../types";
import type { ModelCapabilities } from "@/types/llm-profiles";
import { createModuleLogger } from "@/utils/logger";
import { useMessageBuilder } from "./useMessageBuilder";
import { useMacroProcessor } from "./useMacroProcessor";
import { useAgentStore } from "../agentStore";
import { useContextInjection } from "./useContextInjection";
import { useContextLimiter } from "./useContextLimiter";
import { useContextPreview } from "./useContextPreview";
import { type LlmContextData, type ContextPreviewData, SYSTEM_ANCHORS } from "../types/context";
import type { LlmParameters } from "../types";
import type { ContextPostProcessRule } from "../types";
import type { ProcessableMessage } from "../types/context";
import {
  applyRegexRules,
  processRulesWithMacros,
} from "../utils/chatRegexUtils";
import { createMacroContext } from "../macro-engine/MacroContext";
import { useChatRegexResolver } from "./useChatRegexResolver";
import { useChatSettings } from "./useChatSettings";

const logger = createModuleLogger("llm-chat/context-builder");

export type { ContextPreviewData };

export function useChatContextBuilder() {
  const { buildMessageContentForLlm } = useMessageBuilder();
  const { processMacrosBatch } = useMacroProcessor();
  const { classifyPresetMessages, applyDepthInjections, getAnchorInjectionGroups, getSortedAnchorInjections } = useContextInjection();
  const { applyContextLimit } = useContextLimiter();

  /**
   * 构建 LLM 上下文
   * 从活动路径和智能体配置中提取系统提示、对话历史和当前消息
   */
  const buildLlmContext = async (
    activePath: ChatMessageNode[],
    agentConfig: any,
    _currentUserMessage: string, // 已弃用
    session: ChatSession,
    effectiveUserProfile?: Partial<UserProfile> | null,
    capabilities?: ModelCapabilities,
    timestamp?: number
  ): Promise<LlmContextData> => {
    // 获取全局设置
    const { settings } = useChatSettings();

    // 1. 识别所有启用的压缩节点，收集被它们压缩的节点 ID
    const hiddenNodeIds = new Set<string>();
    activePath.forEach((node) => {
      if (
        node.metadata?.isCompressionNode &&
        node.isEnabled !== false &&
        node.metadata.compressedNodeIds
      ) {
        node.metadata.compressedNodeIds.forEach((id) => hiddenNodeIds.add(id));
      }
    });

    // 过滤出有效的对话上下文
    const llmContextPromises = activePath
      // 排除被压缩隐藏的节点
      .filter((node) => !hiddenNodeIds.has(node.id))
      // 排除禁用节点
      .filter((node) => node.isEnabled !== false)
      // 排除系统节点（除非是压缩节点）和非 user/assistant 节点
      .filter((node) => {
        // 压缩节点总是保留（即使角色是 system）
        if (node.metadata?.isCompressionNode) return true;

        // 普通节点：排除 system，只保留 user 和 assistant
        return node.role !== "system" && (node.role === "user" || node.role === "assistant");
      })
      .map(async (node, index) => {
        // 使用统一的消息构建器处理文本和附件
        const content = await buildMessageContentForLlm(
          node.content,
          node.attachments,
          capabilities,
          settings.value // 传入当前设置，以便正确处理 preferTranscribed
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
          role: node.role as "user" | "assistant" | "system",
          content,
          sourceType: "session_history",
          sourceId: node.id,
          sourceIndex: index,
          isEnabled: true,
        };
      });

    const llmContext = await Promise.all(llmContextPromises);

    // 处理预设消息
    const presetMessages = agentConfig.presetMessages || [];
    // const enabledPresets = presetMessages.filter((msg: any) => msg.isEnabled !== false); // 不再预先过滤

    // 获取当前智能体信息（用于宏上下文）
    const agentStoreInstance = useAgentStore();
    const currentAgent = agentStoreInstance.getAgentById(
      agentStoreInstance.currentAgentId || ''
    );

    // 会话上下文（完整历史）
    let sessionContext = llmContext;
    // ==================== 正则管道处理 (Request) - 支持绑定模式 ====================
    const { resolveRulesExplicit } = useChatRegexResolver();

    // 获取绑定模式设置（从全局设置）
    const bindingMode = settings.value.regexConfig.bindingMode;

    // Request Pipeline 的宏上下文是固定的 (基于当前请求的 Agent/User)
    const macroContext = createMacroContext({
      agent: currentAgent,
      userProfile: effectiveUserProfile as UserProfile,
      session,
      timestamp,
    });

    // 遍历并应用规则
    const appliedRulesLog: any[] = [];

    for (let i = 0; i < sessionContext.length; i++) {
      const message = sessionContext[i];

      // 只处理字符串内容
      if (typeof message.content !== "string") continue;

      // 1. 计算深度 (0=最新)
      const messageDepth = sessionContext.length - 1 - i;

      // 2. 获取消息归属 ID（根据绑定模式决定）
      const sourceNode = activePath.find(n => n.id === message.sourceId);
      let finalAgentId: string | undefined | null;
      let finalUserId: string | undefined | null;

      if (bindingMode === 'session') {
        // 会话绑定：使用当前会话的 Agent/User
        finalAgentId = currentAgent?.id;
        finalUserId = effectiveUserProfile?.id;
      } else {
        // 消息绑定：使用消息元数据
        finalAgentId = sourceNode?.metadata?.agentId;
        finalUserId = sourceNode?.metadata?.userProfileId;
      }

      // 3. 获取规则集 (已缓存 + 角色/深度过滤)
      const rawRules = resolveRulesExplicit(
        finalAgentId,
        finalUserId,
        message.role,
        "request",
        messageDepth
      );

      // 4. 宏预处理 (必须在这里进行，因为规则内容可能包含 {{macro}})
      const processedRules = await processRulesWithMacros(rawRules, macroContext);

      // 5. 应用规则
      if (processedRules.length > 0) {
        const originalContent = message.content;
        message.content = applyRegexRules(originalContent, processedRules);
        if (originalContent !== message.content) {
          appliedRulesLog.push({
            depth: messageDepth,
            sourceId: message.sourceId,
            rulesCount: processedRules.length,
          });
        }
      }
    }

    if (appliedRulesLog.length > 0) {
      logger.debug(`[Regex] 正则规则已应用于 ${appliedRulesLog.length} 条消息`, {
        details: appliedRulesLog
      }, true);
    }

    // ==================== 注入策略处理 ====================
    // 对预设消息进行分类：skeleton (含 user_profile/chat_history 占位符), depth, anchor
    // 使用全量 presetMessages 进行分类，以便即使锚点被禁用也能找到位置
    const { skeleton, depthInjections, anchorInjections } = classifyPresetMessages(presetMessages);

    // 过滤有效的注入源 (Source)
    // 只有启用的消息才能作为注入源注入到其他位置
    const validDepthInjections = depthInjections.filter(i => i.message.isEnabled !== false);
    const validAnchorInjections = anchorInjections.filter(i => i.message.isEnabled !== false);

    // 预处理所有注入消息的内容（处理宏）
    const injectionProcessedContents = new Map<string, string>();
    if (validDepthInjections.length > 0 || validAnchorInjections.length > 0) {
      const allInjectionMessages = [
        ...validDepthInjections.map(i => i.message),
        ...validAnchorInjections.map(i => i.message),
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
        depthInjectionsCount: validDepthInjections.length,
        anchorInjectionsCount: validAnchorInjections.length,
      });
    }

    // ==================== 处理骨架消息 (Skeleton) ====================
    // 准备骨架消息内容进行宏处理
    // 这里需要处理 user_profile 的内容生成
    const skeletonRawContents = skeleton.map((msg) => {
      if (msg.type === SYSTEM_ANCHORS.USER_PROFILE) {
        if (effectiveUserProfile) {
          return `# 用户档案\n${effectiveUserProfile.content}`;
        }
        return ""; // 无有效档案
      }
      return msg.content;
    });

    const skeletonProcessedContents = await processMacrosBatch(
      skeletonRawContents,
      {
        session,
        agent: currentAgent ?? undefined,
        userProfile: effectiveUserProfile as UserProfile,
        timestamp,
      }
    );

    // 构建已处理的骨架消息列表
    // 保留所有消息（包括禁用的），用于占位
    // 注意：chat_history 占位符暂时保留，用于定位
    const skeletonMessages = skeleton
      .map((msg, index) => {
        const content = skeletonProcessedContents[index];

        // 判断是否启用：
        // 1. 原始消息未禁用
        // 2. 如果是 user_profile，必须有内容
        let isEnabled = msg.isEnabled !== false;
        if (msg.type === SYSTEM_ANCHORS.USER_PROFILE && !content) {
          isEnabled = false;
        }

        return {
          role: (msg.role || "system") as "user" | "assistant" | "system",
          content: content,
          type: msg.type, // 保留 type 用于识别占位符
          sourceType: msg.type === SYSTEM_ANCHORS.USER_PROFILE ? "user_profile" : "agent_preset",
          sourceId: msg.type === SYSTEM_ANCHORS.USER_PROFILE ? effectiveUserProfile?.id : presetMessages.indexOf(msg),
          sourceIndex: presetMessages.indexOf(msg),
          isEnabled,
        };
      });

    // ==================== 上下文 Token 限制 ====================
    // 计算用于 Token 限制的预设消息列表 (排除 chat_history 占位符 和 禁用的消息)
    const presetForTokenCalc = skeletonMessages.filter(msg => msg.isEnabled && msg.type !== SYSTEM_ANCHORS.CHAT_HISTORY);

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
        presetForTokenCalc,
        agentConfig.parameters.contextManagement,
        agentConfig.modelId
      );
    }

    // ==================== 构建最终消息列表 ====================
    let finalMessages: Array<{
      role: "user" | "assistant" | "system";
      content: string | any[];
      sourceType?: string;
      sourceId?: string | number;
      sourceIndex?: number;
    }>;

    // 查找历史消息占位符在处理后列表中的位置
    const chatHistoryIndex = skeletonMessages.findIndex(
      (msg) => msg.type === SYSTEM_ANCHORS.CHAT_HISTORY
    );

    // 记录插入点前的预设消息数量
    let presetsBeforeCount: number | undefined;

    // 获取锚点注入分组 (只使用有效的注入源)
    const anchorGroups = getAnchorInjectionGroups(
      getSortedAnchorInjections(validAnchorInjections)
    );

    if (chatHistoryIndex !== -1) {
      // 存在历史消息占位符，进行切分
      const before = skeletonMessages.slice(0, chatHistoryIndex);
      const after = skeletonMessages.slice(chatHistoryIndex + 1);

      // 计算 presetsBeforeCount 时，只统计启用的消息
      presetsBeforeCount = before.filter(m => m.isEnabled).length;

      // 组合：[...before, ...session, ...after]
      // 此时 finalMessages 包含禁用的消息，作为潜在的锚点
      finalMessages = [...before, ...sessionContext, ...after];

      // 处理 chat_history 锚点注入
      const chatHistoryAnchor = anchorGroups.get(SYSTEM_ANCHORS.CHAT_HISTORY);
      if (chatHistoryAnchor) {
        const sessionStartIndex = before.length;

        // before 组插入到 session 前
        if (chatHistoryAnchor.before.length > 0) {
          const injMessages = chatHistoryAnchor.before.map(inj => ({
            role: inj.message.role as "user" | "assistant" | "system",
            content: injectionProcessedContents.get(inj.message.id) ?? inj.message.content,
            sourceType: "anchor_injection",
            sourceId: inj.message.id,
            sourceIndex: presetMessages.indexOf(inj.message),
            isEnabled: true,
          }));
          finalMessages.splice(sessionStartIndex, 0, ...injMessages);
        }

        // after 组插入到 session 后
        if (chatHistoryAnchor.after.length > 0) {
          // 计算插入位置：sessionStart + beforeInjections + sessionLength
          const afterInsertIndex = sessionStartIndex + (chatHistoryAnchor.before.length) + sessionContext.length;
          const injMessages = chatHistoryAnchor.after.map(inj => ({
            role: inj.message.role as "user" | "assistant" | "system",
            content: injectionProcessedContents.get(inj.message.id) ?? inj.message.content,
            sourceType: "anchor_injection",
            sourceId: inj.message.id,
            sourceIndex: presetMessages.indexOf(inj.message),
            isEnabled: true,
          }));
          finalMessages.splice(afterInsertIndex, 0, ...injMessages);
        }
      }
    } else {
      // 没有占位符，默认：预设在前，历史在后 (兼容旧逻辑)
      // 注意：presetForTokenCalc 已经排除了禁用的消息
      finalMessages = [...presetForTokenCalc, ...sessionContext];
    }

    // ==================== 处理 user_profile 锚点注入 ====================
    // 由于 user_profile 现在混在 finalMessages 中，我们需要找到它
    // 注意：如果存在多个 user_profile (理论上不该有)，只处理第一个
    const userProfileAnchor = anchorGroups.get(SYSTEM_ANCHORS.USER_PROFILE);
    if (userProfileAnchor) {
      const userProfileIndex = finalMessages.findIndex(msg => msg.sourceType === "user_profile");

      if (userProfileIndex !== -1) {
        // 插入 before 组
        if (userProfileAnchor.before.length > 0) {
          const injMessages = userProfileAnchor.before.map(inj => ({
            role: inj.message.role as "user" | "assistant" | "system",
            content: injectionProcessedContents.get(inj.message.id) ?? inj.message.content,
            sourceType: "anchor_injection",
            sourceId: inj.message.id,
            sourceIndex: presetMessages.indexOf(inj.message),
            isEnabled: true,
          }));
          finalMessages.splice(userProfileIndex, 0, ...injMessages);
        }

        // 插入 after 组
        if (userProfileAnchor.after.length > 0) {
          const afterInsertIndex = userProfileIndex + userProfileAnchor.before.length + 1;
          const injMessages = userProfileAnchor.after.map(inj => ({
            role: inj.message.role as "user" | "assistant" | "system",
            content: injectionProcessedContents.get(inj.message.id) ?? inj.message.content,
            sourceType: "anchor_injection",
            sourceId: inj.message.id,
            sourceIndex: presetMessages.indexOf(inj.message),
            isEnabled: true,
          }));
          finalMessages.splice(afterInsertIndex, 0, ...injMessages);
        }

        logger.debug("⚓ 已应用 user_profile 锚点注入", {
          targetIndex: userProfileIndex
        });
      }
    }

    // ==================== 应用深度注入 ====================
    // 深度注入是相对于会话历史末尾的位置
    if (validDepthInjections.length > 0) {
      const injectedMessages = applyDepthInjections(
        finalMessages,
        validDepthInjections,
        injectionProcessedContents,
        presetMessages
      );
      // 转换回标准格式 (注意：applyDepthInjections 返回的对象没有 isEnabled，默认为 true)
      finalMessages = injectedMessages.map(msg => ({
        ...msg,
        isEnabled: (msg as any).isEnabled !== false // 保持原有 isEnabled 状态，新注入的默认为 true
      })) as any;

      logger.debug("📍 深度注入已应用", {
        originalLength: finalMessages.length - validDepthInjections.length,
        injectedCount: validDepthInjections.length,
        finalLength: finalMessages.length,
      });
    }

    // 最终清理：
    // 1. 移除被标记为禁用的消息（它们只是作为锚点存在）
    // 2. 移除临时的 type/isEnabled 字段，确保符合接口定义
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string | any[];
    }> = finalMessages
      .filter((msg: any) => msg.isEnabled !== false) // 过滤掉禁用的消息
      .map((msg) => {
        const { type, isEnabled, ...rest } = msg as any; // 解构移除临时字段
        return rest;
      });

    // 准备元数据
    const meta: LlmContextData['meta'] = {
      sessionMessageCount: sessionContext.length,
      presetsBeforeCount,
    };

    // 详细的 debug 日志，展示最终构建的消息
    logger.debug("🔍 构建 LLM 上下文完成", {
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
            : (msg.content as any[]).reduce(
              (sum: number, part: any) =>
                sum +
                (typeof part === "object" && "text" in part && part.text ? part.text.length : 0),
              0
            ),
      })),
    }, true);

    return { messages, meta };
  };

  // 实例化 getLlmContextForPreview
  // 使用依赖注入的方式传入 buildLlmContext，解决循环依赖
  const { getLlmContextForPreview: getPreview } = useContextPreview(buildLlmContext);

  /**
   * 获取指定节点的上下文预览数据
   * (代理调用 useContextPreview 中的实现)
   */
  const getLlmContextForPreview = (
    session: ChatSession,
    targetNodeId: string,
    agentStore: any,
    nodeManager: any,
    getProfileById: any,
    applyProcessingPipeline?: (messages: ProcessableMessage[], rules: ContextPostProcessRule[]) => ProcessableMessage[],
    agentId?: string,
    parameterOverrides?: LlmParameters
  ): Promise<ContextPreviewData | null> => {
    return getPreview(session, targetNodeId, agentStore, nodeManager, getProfileById, applyProcessingPipeline, agentId, parameterOverrides);
  };

  return {
    buildLlmContext,
    getLlmContextForPreview,
    // 导出辅助函数（如果需要）
    applyContextLimit,
  };
}
