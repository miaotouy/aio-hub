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
import type { LlmContextData, ContextPreviewData } from "../types/context";
import type { LlmParameters } from "../types";
import type { ContextPostProcessRule } from "../types";
import type { ProcessableMessage } from "../types/context";

const logger = createModuleLogger("llm-chat/context-builder");

export type { ContextPreviewData };

export function useChatContextBuilder() {
    const { buildMessageContentForLlm } = useMessageBuilder();
    const { processMacros, processMacrosBatch } = useMacroProcessor();
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
            content: string | any[];
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
            content: string | any[];
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

            const presetsBeforePlaceholder = presetsBeforeRaw.map((msg: any, index: number) => ({
                role: msg.role as "user" | "assistant",
                content: presetsBeforeContents[index],
                sourceType: "agent_preset",
                sourceId: presetMessages.indexOf(msg),
                sourceIndex: presetMessages.indexOf(msg),
            }));

            presetsBeforeCount = presetsBeforePlaceholder.length;

            const presetsAfterPlaceholder = presetsAfterRaw.map((msg: any, index: number) => ({
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
            // 转换回标准格式
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
            content: string | any[];
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
