/**
 * 聊天处理 Composable
 * 负责协调核心聊天逻辑：发送消息、重新生成、流式响应处理
 *
 * 重构说明：
 * - 本文件已重构为"指挥家"角色，不再直接实现具体逻辑
 * - 具体功能已拆分到专门的 Composable：
 *   - useChatAssetProcessor: 附件处理 (已废弃，逻辑整合入 useChatExecutor)
 *   - useChatResponseHandler: 响应处理 (已废弃，逻辑整合入 useChatExecutor)
 *   - useChatExecutor: 核心请求执行
 */

import type { ChatSession, ChatMessageNode } from "../../types";
import type { Asset } from "@/types/asset-management";
import { useAgentStore } from "../../stores/agentStore";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useNodeManager } from "../session/useNodeManager";
import { useSessionManager } from "../session/useSessionManager";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useChatExecutor } from "./useChatExecutor";
import { useContextCompressor } from "../features/useContextCompressor";
import { filterParametersForModel } from "../../config/parameter-config";
import { MacroProcessor } from "../../macro-engine/MacroProcessor";
import { buildMacroContext, processMacros } from "../../core/context-utils/macro";
import type { ContextPreviewData } from "../../types/context";
import type { ModelIdentifier } from "../../types";
import { useTranscriptionManager } from "../features/useTranscriptionManager";
import { useChatSettings } from "../settings/useChatSettings";

const logger = createModuleLogger("llm-chat/chat-handler");
const errorHandler = createModuleErrorHandler("llm-chat/chat-handler");

export type { ContextPreviewData };

export function useChatHandler() {
  const {
    executeRequest,
    processUserAttachments,
    calculateUserMessageTokens,
    saveUserProfileSnapshot,
    getContextForPreview,
  } = useChatExecutor();
  const { checkAndCompress } = useContextCompressor();

  /**
   * 发送消息
   */
  const sendMessage = async (
    session: ChatSession,
    content: string,
    _activePath: ChatMessageNode[],
    abortControllers: Map<string, AbortController>,
    generatingNodes: Set<string>,
    options?: {
      attachments?: Asset[];
      temporaryModel?: ModelIdentifier | null;
      parentId?: string;
      disableMacroParsing?: boolean;
    },
    currentSessionId?: string | null,
  ): Promise<void> => {
    // 尝试执行自动上下文压缩
    // 注意：压缩会修改树结构（插入压缩节点），但这不影响 activeLeafId（因为压缩节点插入在旧消息之后）
    // 我们在创建新消息之前执行压缩，以确保新消息基于最新的上下文状态
    try {
      await checkAndCompress(session);
    } catch (error) {
      // 压缩失败仅记录日志，不阻断发送流程
      logger.error("自动上下文压缩执行出错", error);
    }

    const agentStore = useAgentStore();
    const userProfileStore = useUserProfileStore();
    const nodeManager = useNodeManager();
    // 获取当前智能体（在函数开头，以便后续宏处理使用）
    const currentAgent = agentStore.currentAgentId
      ? agentStore.getAgentById(agentStore.currentAgentId)
      : null;

    // 使用当前选中的智能体
    if (!agentStore.currentAgentId) {
      errorHandler.handle(new Error("No agent selected"), {
        userMessage: "发送消息失败：没有选中智能体",
        showToUser: false,
      });
      throw new Error("请先选择一个智能体");
    }

    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId, {
      parameterOverrides: session.parameterOverrides,
    });
    if (!agentConfig) {
      errorHandler.handle(new Error("Agent config not found"), {
        userMessage: "发送消息失败：无法获取智能体配置",
        showToUser: false,
      });
      throw new Error("无法获取智能体配置");
    }

    // 如果提供了临时模型，则覆盖 agentConfig
    if (options?.temporaryModel) {
      const { getProfileById, getSupportedParameters } = useLlmProfiles();
      const targetProfile = getProfileById(options.temporaryModel.profileId);
      const targetModel = targetProfile?.models.find(
        (m) => m.id === options.temporaryModel?.modelId,
      );

      if (targetProfile && targetModel) {
        agentConfig.modelId = options.temporaryModel.modelId;
        agentConfig.profileId = options.temporaryModel.profileId;

        // 过滤参数，只保留目标模型支持的参数
        const supportedParameters = getSupportedParameters(targetProfile.type);
        agentConfig.parameters = filterParametersForModel(
          agentConfig.parameters,
          supportedParameters,
          targetModel.capabilities,
        );
        logger.info("使用临时指定的模型（参数已过滤）", {
          modelId: agentConfig.modelId,
          profileId: agentConfig.profileId,
          parameterKeys: Object.keys(agentConfig.parameters),
        });
      } else {
        logger.warn("无法找到指定的临时模型，将使用智能体默认模型", {
          modelId: options.temporaryModel.modelId,
          profileId: options.temporaryModel.profileId,
        });
      }
    }

    // 处理用户输入中的宏
    const macroProcessor = new MacroProcessor();
    let processedContent = content;
    if (!options?.disableMacroParsing) {
      const macroContext = buildMacroContext({
        session,
        agent: currentAgent ?? undefined,
        input: content,
        userProfile: userProfileStore.globalProfile ?? undefined, // 传递 userProfile
      });
      processedContent = await processMacros(
        macroProcessor,
        content,
        macroContext,
      );
    }

    logger.debug("用户消息宏处理", {
      originalLength: content.length,
      processedLength: processedContent.length,
      hasChange: content !== processedContent,
    });

    // 使用指定的 parentId 或当前活跃叶节点作为父节点
    const parentId = options?.parentId || session.activeLeafId;

    // 使用节点管理器创建消息对（使用处理后的内容）
    const { userNode, assistantNode } = nodeManager.createMessagePair(
      session,
      processedContent,
      parentId,
    );

    // 立即加入生成集合，确保在后续任何异步操作（如附件处理、转写、Token计算）期间，UI 都能正确显示生成状态
    generatingNodes.add(assistantNode.id);

    // 更新活跃叶节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    // 重新获取包含新用户消息的完整路径
    const pathWithNewMessage = nodeManager.getNodePath(session, userNode.id);

    // 获取路径中的用户节点引用
    const pathUserNode = pathWithNewMessage[pathWithNewMessage.length - 1];

    // 处理附件（如果有）
    const { settings } = useChatSettings();
    if (options?.attachments && options.attachments.length > 0) {
      await processUserAttachments(
        userNode,
        session,
        options.attachments,
        pathUserNode,
      );
    }

    // 立即保存用户消息，防止等待 LLM 响应或转写期间程序崩溃导致消息丢失
    // 这里先保存消息本身，后续的转写等待和元数据更新会在完成后再次触发保存
    const sessionManager = useSessionManager();
    sessionManager.persistSession(session, currentSessionId ?? null);
    logger.debug("用户消息已即时保存（转写前）", {
      sessionId: session.id,
      userNodeId: userNode.id,
    });

    // 附件转写等待逻辑（在消息上屏并保存后执行）
    // 无论设置为何种发送行为，此处都采用“先上屏，后等待”的策略以提升响应感。
    // 等待是必须的，以确保后续 executeRequest 构建上下文时能拿到转写文本。
    if (
      options?.attachments &&
      options.attachments.length > 0 &&
      settings.value.transcription.enabled
    ) {
      const transcriptionManager = useTranscriptionManager();
      const transcriptionController = new AbortController();

      // 两种模式都需要中止控制器，因为等待都可能被用户取消
      abortControllers.set(assistantNode.id, transcriptionController);

      try {
        logger.info(`⏳ 开始等待附件转写...`, {
          nodeId: assistantNode.id,
        });

        await Promise.race([
          transcriptionManager.ensureTranscriptions(
            options.attachments,
            agentConfig.modelId,
            agentConfig.profileId,
            // 当前消息的附件深度为0，不需要强制转写，传 undefined 即可
          ),
          new Promise((_, reject) => {
            transcriptionController.signal.addEventListener("abort", () => {
              reject(new Error("User aborted"));
            });
          }),
        ]);

        logger.info(`✅ 转写等待结束，继续发送流程`);
      } catch (error: any) {
        if (error.message === "User aborted") {
          logger.info("🛑 用户取消了转写等待，保留用户消息，不发送请求");
          abortControllers.delete(assistantNode.id);
          generatingNodes.delete(assistantNode.id);
          // 用户取消的是「等待转写」，而非「发送消息」
          // 用户消息应当保留（用户已经明确发送了这条消息）
          // 只需要清理助手节点，让用户之后可以选择重新生成
          nodeManager.hardDeleteNode(session, assistantNode.id);
          // 更新活跃叶节点为用户消息
          nodeManager.updateActiveLeaf(session, userNode.id);
          sessionManager.persistSession(session, currentSessionId ?? null);
          return;
        }
        // 其他错误（如超时）记录日志但继续，以降级模式（无转写文本）发送
        logger.warn("⚠️ 转写等待期间出错，将使用原始附件发送", error);
      } finally {
        // 注意：这里不立即从 generatingNodes 中删除，
        // 而是保持状态直到 executeRequest 接管或流程结束，
        // 以避免在转写结束和请求开始之间的异步空窗期（如 Token 计算）导致 UI 闪烁。
        abortControllers.delete(assistantNode.id);
      }
    }
    // 确定生效的用户档案（智能体绑定 > 全局配置）
    let effectiveUserProfile: {
      id: string;
      name: string;
      displayName?: string;
      icon?: string;
      content: string;
    } | null = null;
    if (currentAgent?.userProfileId) {
      const profile = userProfileStore.getProfileById(
        currentAgent.userProfileId,
      );
      if (profile) {
        effectiveUserProfile = profile;
      }
    } else if (userProfileStore.globalProfileId) {
      const profile = userProfileStore.getProfileById(
        userProfileStore.globalProfileId,
      );
      if (profile) {
        effectiveUserProfile = profile;
      }
    }

    // 保存用户档案快照到用户消息节点
    saveUserProfileSnapshot(userNode, effectiveUserProfile);

    // 计算用户消息的 token 数（包括文本和附件）
    await calculateUserMessageTokens(
      userNode,
      session,
      content,
      agentConfig.modelId,
      options?.attachments,
    );

    // 计算完成后立即持久化一次，确保用户消息的 tokens 及时保存并触发 UI 更新
    sessionManager.persistSession(session, currentSessionId ?? null);

    // 获取模型信息用于元数据（提前设置，确保即时显示）
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);

    // 在助手节点中设置基本 metadata（包括 Agent 名称和图标的快照）
    // 直接修改 session.nodes 中的节点，确保响应式更新
    session.nodes[assistantNode.id].metadata = {
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.name,
      agentDisplayName: currentAgent?.displayName || currentAgent?.name,
      agentIcon: currentAgent?.icon,
      profileId: agentConfig.profileId,
      profileName: profile?.name,
      profileDisplayName: profile?.name,
      modelId: agentConfig.modelId,
      modelName: model?.name || model?.id,
      modelDisplayName: model?.name || model?.id,
      virtualTimeConfig: currentAgent?.virtualTimeConfig,
    };

    logger.debug("已设置助手节点元数据", {
      nodeId: assistantNode.id,
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.name,
      modelId: agentConfig.modelId,
    });

    // 执行 LLM 请求
    await executeRequest({
      session,
      userNode,
      assistantNode,
      pathToUserNode: pathWithNewMessage,
      abortControllers,
      generatingNodes,
      agentConfig,
    });
  };

  /**
   * 从指定节点重新生成
   * 支持从用户消息或助手消息重新生成
   */
  const regenerateFromNode = async (
    session: ChatSession,
    nodeId: string,
    _activePath: ChatMessageNode[],
    abortControllers: Map<string, AbortController>,
    generatingNodes: Set<string>,
    options?: { modelId?: string; profileId?: string },
  ): Promise<void> => {
    const agentStore = useAgentStore();
    const nodeManager = useNodeManager();

    // 定位目标节点
    const targetNode = session.nodes[nodeId];
    if (!targetNode) {
      logger.warn("重新生成失败：目标节点不存在", {
        sessionId: session.id,
        nodeId,
      });
      return;
    }

    // 使用当前选中的智能体
    if (!agentStore.currentAgentId) {
      errorHandler.handle(new Error("No agent selected"), {
        userMessage: "重新生成失败：没有选中智能体",
        showToUser: false,
      });
      return;
    }

    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId, {
      parameterOverrides: session.parameterOverrides,
    });

    if (!agentConfig) {
      errorHandler.handle(new Error("Agent config not found"), {
        userMessage: "重新生成失败：无法获取智能体配置",
        showToUser: false,
      });
      return;
    }

    // 如果提供了特定的模型选项，覆盖 agentConfig 中的设置
    if (options?.modelId && options?.profileId) {
      const { getProfileById, getSupportedParameters } = useLlmProfiles();
      const targetProfile = getProfileById(options.profileId);
      const targetModel = targetProfile?.models.find(
        (m) => m.id === options.modelId,
      );

      if (targetProfile && targetModel) {
        agentConfig.modelId = options.modelId;
        agentConfig.profileId = options.profileId;

        // 过滤参数，只保留目标模型支持的参数
        const supportedParameters = getSupportedParameters(targetProfile.type);
        agentConfig.parameters = filterParametersForModel(
          agentConfig.parameters,
          supportedParameters,
          targetModel.capabilities,
        );

        logger.info("使用指定的模型进行重试（参数已过滤）", {
          modelId: options.modelId,
          profileId: options.profileId,
          parameterKeys: Object.keys(agentConfig.parameters),
        });
      } else {
        logger.warn("无法找到指定的模型，将使用原始配置", {
          modelId: options.modelId,
          profileId: options.profileId,
        });
      }
    }

    // 使用节点管理器创建重新生成分支
    const result = nodeManager.createRegenerateBranch(session, nodeId);

    if (!result) {
      return;
    }

    const { assistantNode, userNode } = result;

    // 立即加入生成集合
    generatingNodes.add(assistantNode.id);

    // 更新活跃叶节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    // 重新生成所需的历史记录，应该是到当前用户消息为止的完整路径（包含用户消息）
    const pathToUserNode = nodeManager.getNodePath(session, userNode.id);

    // 获取模型信息用于元数据（提前设置，确保即时显示）
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);
    const currentAgent = agentStore.getAgentById(agentStore.currentAgentId);

    // 在助手节点中设置基本 metadata（包括 Agent 名称和图标的快照）
    // 直接修改 session.nodes 中的节点，确保响应式更新
    session.nodes[assistantNode.id].metadata = {
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.name,
      agentDisplayName: currentAgent?.displayName || currentAgent?.name,
      agentIcon: currentAgent?.icon,
      profileId: agentConfig.profileId,
      profileName: profile?.name,
      profileDisplayName: profile?.name,
      modelId: agentConfig.modelId,
      modelName: model?.name || model?.id,
      modelDisplayName: model?.name || model?.id,
      virtualTimeConfig: currentAgent?.virtualTimeConfig,
    };

    logger.info("🔄 从节点重新生成", {
      sessionId: session.id,
      targetNodeId: nodeId,
      targetRole: targetNode.role,
      userNodeId: userNode.id,
      newNodeId: assistantNode.id,
      agentId: agentStore.currentAgentId,
      profileId: agentConfig.profileId,
      modelId: agentConfig.modelId,
    });

    logger.debug("已设置助手节点元数据", {
      nodeId: assistantNode.id,
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.name,
      modelId: agentConfig.modelId,
    });

    // 执行 LLM 请求
    await executeRequest({
      session,
      userNode,
      assistantNode,
      pathToUserNode,
      abortControllers,
      generatingNodes,
      agentConfig, // 传递包含正确模型信息的 agentConfig
    });
  };

  /**
   * 续写生成
   */
  const continueGeneration = async (
    session: ChatSession,
    nodeId: string,
    abortControllers: Map<string, AbortController>,
    generatingNodes: Set<string>,
    options?: { modelId?: string; profileId?: string },
  ): Promise<void> => {
    const agentStore = useAgentStore();
    const nodeManager = useNodeManager();

    // 1. 创建续写分支
    const result = nodeManager.createContinuationBranch(session, nodeId);
    if (!result) return;

    const { assistantNode, userNode } = result;

    // 立即加入生成集合
    generatingNodes.add(assistantNode.id);

    // 2. 更新活跃叶节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    // 3. 获取路径
    // 如果是 Assistant 续写，路径包含新节点本身（因为新节点内容 = 前缀内容，它就是最后一条消息）
    // 如果是 User 续写，路径包含 User 节点（新节点是空的助手节点，接在后面）
    const pathToUserNode = nodeManager.getNodePath(
      session,
      session.nodes[nodeId].role === 'assistant' ? assistantNode.id : (userNode?.id || nodeId)
    );
    // 4. 获取配置
    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId || "", {
      parameterOverrides: session.parameterOverrides,
    });

    if (!agentConfig) {
      errorHandler.handle(new Error("Agent config not found"), {
        userMessage: "续写失败：无法获取智能体配置",
        showToUser: false,
      });
      return;
    }

    // 如果提供了特定的模型选项，覆盖 agentConfig 中的设置
    if (options?.modelId && options?.profileId) {
      const { getProfileById, getSupportedParameters } = useLlmProfiles();
      const targetProfile = getProfileById(options.profileId);
      const targetModel = targetProfile?.models.find(
        (m) => m.id === options.modelId,
      );

      if (targetProfile && targetModel) {
        agentConfig.modelId = options.modelId;
        agentConfig.profileId = options.profileId;

        // 过滤参数，只保留目标模型支持的参数
        const supportedParameters = getSupportedParameters(targetProfile.type);
        agentConfig.parameters = filterParametersForModel(
          agentConfig.parameters,
          supportedParameters,
          targetModel.capabilities,
        );

        logger.info("续写使用指定的模型（参数已过滤）", {
          modelId: options.modelId,
          profileId: options.profileId,
        });
      }
    }

    // 5. 设置元数据
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);
    const currentAgent = agentStore.getAgentById(agentStore.currentAgentId || "");

    session.nodes[assistantNode.id].metadata = {
      ...session.nodes[assistantNode.id].metadata,
      agentId: agentStore.currentAgentId || undefined,
      agentName: currentAgent?.name,
      agentDisplayName: currentAgent?.displayName || currentAgent?.name,
      agentIcon: currentAgent?.icon,
      profileId: agentConfig.profileId,
      profileName: profile?.name,
      modelId: agentConfig.modelId,
      modelName: model?.name || model?.id,
    };

    // 6. 执行请求
    await executeRequest({
      session,
      userNode: userNode || assistantNode, // 如果是 Assistant 续写，userNode 为 null 或父节点
      assistantNode,
      pathToUserNode,
      isContinuation: true, // 核心标记
      abortControllers,
      generatingNodes,
      agentConfig,
    });
  };

  /**
   * 补全输入框内容
   */
  const completeInput = async (
    text: string,
    _session?: ChatSession,
    options?: { modelId?: string; profileId?: string },
  ): Promise<string> => {
    const { sendRequest } = useLlmRequest();
    const agentStore = useAgentStore();

    let profileId = options?.profileId;
    let modelId = options?.modelId;

    if (!profileId || !modelId) {
      const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId || "");
      if (!agentConfig) throw new Error("Agent config not found");
      profileId = profileId || agentConfig.profileId;
      modelId = modelId || agentConfig.modelId;
    }

    // 构建补全请求的消息列表
    const messages: any[] = [
      {
        role: "system",
        content: "You are a helpful writing assistant. Complete the user's text naturally. Do not repeat the input. Output ONLY the completion part.",
      },
      {
        role: "user",
        content: text,
      }
    ];

    // 如果提供了会话，可以尝试获取上下文（可选增强）
    
    const response = await sendRequest({
      profileId,
      modelId,
      messages,
      temperature: 0.3, // 补全通常需要更确定的结果
      maxTokens: 200,
    });

    return response.content;
  };

  return {
    sendMessage,
    regenerateFromNode,
    continueGeneration,
    completeInput,
    getLlmContextForPreview: getContextForPreview,
  };
}
