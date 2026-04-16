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

import type { ChatSessionDetail, ChatMessageNode } from "../../types";
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
import { useToolCallOrchestrator } from "./useToolCallOrchestrator";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useContextCompressor } from "../features/useContextCompressor";
import { filterParametersForModel } from "../../config/parameter-config";
import { MacroProcessor } from "../../macro-engine/MacroProcessor";
import { buildMacroContext, processMacros } from "../../core/context-utils/macro";
import { type ContextPreviewData, type GetContextPreviewOptions } from "../../types/context";
import type { ModelIdentifier } from "../../types";
import { useTranscriptionManager } from "../features/useTranscriptionManager";
import { useChatSettings } from "../settings/useChatSettings";
import type { UserProfile } from "../../types";

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
  const { reparseAndOrchestrate } = useToolCallOrchestrator();
  const { checkAndCompress } = useContextCompressor();

  /**
   * 发送消息
   */
  const sendMessage = async (
    session: ChatSessionDetail,
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
    const chatStore = useLlmChatStore();
    const sessionIndex = chatStore.sessionIndexMap.get(session.id);
    if (!sessionIndex) throw new Error("Session index not found");

    const agentStore = useAgentStore();
    const userProfileStore = useUserProfileStore();
    const nodeManager = useNodeManager();
    const sessionManager = useSessionManager();

    // 尝试执行自动上下文压缩
    // 注意：压缩会修改树结构（插入压缩节点），但这不影响 activeLeafId（因为压缩节点插入在旧消息之后）
    // 我们在创建新消息之前执行压缩，以确保新消息基于最新的上下文状态
    try {
      await checkAndCompress(sessionIndex, session);
    } catch (error) {
      // 压缩失败仅记录日志，不阻断发送流程
      logger.error("自动上下文压缩执行出错", error);
    }
    // 获取当前智能体（在函数开头，以便后续宏处理使用）
    const currentAgent = agentStore.currentAgentId ? agentStore.getAgentById(agentStore.currentAgentId) : null;

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
      const targetModel = targetProfile?.models.find((m) => m.id === options.temporaryModel?.modelId);

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
        index: sessionIndex,
        detail: session,
        agent: currentAgent ?? undefined,
        input: content,
        userProfile: userProfileStore.globalProfile ?? undefined, // 传递 userProfile
      });
      processedContent = await processMacros(macroProcessor, content, macroContext);
    }

    logger.debug("用户消息宏处理", {
      originalLength: content.length,
      processedLength: processedContent.length,
      hasChange: content !== processedContent,
    });

    // 使用指定的 parentId 或当前活跃叶节点作为父节点
    const parentId = options?.parentId || session.activeLeafId || "";

    // 使用节点管理器创建消息对（使用处理后的内容）
    const { userNode, assistantNode } = nodeManager.createMessagePair(session, processedContent, parentId);

    // 立即加入生成集合，确保在后续任何异步操作（如附件处理、转写、Token计算）期间，UI 都能正确显示生成状态
    generatingNodes.add(assistantNode.id);

    // 更新活跃叶节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    // 重新获取包含新用户消息的完整路径
    const pathWithNewMessage = nodeManager.getNodePath(session, userNode.id);

    // 获取路径中的用户节点引用
    const pathUserNode = pathWithNewMessage[pathWithNewMessage.length - 1];

    // --- 核心优化：提前填充元数据快照，确保 UI 即时显示头像 ---

    // 1. 确定生效的用户档案（智能体绑定 > 全局配置）
    let effectiveUserProfile: {
      id: string;
      name: string;
      displayName?: string;
      icon?: string;
      content?: string;
    } | null = null;
    if (currentAgent?.userProfileId) {
      const profile = userProfileStore.getProfileById(currentAgent.userProfileId);
      if (profile) {
        effectiveUserProfile = profile;
      }
    } else if (userProfileStore.globalProfileId) {
      const profile = userProfileStore.getProfileById(userProfileStore.globalProfileId);
      if (profile) {
        effectiveUserProfile = profile;
      }
    }

    // 2. 保存用户档案快照到用户消息节点
    saveUserProfileSnapshot(userNode, effectiveUserProfile);

    // 3. 获取模型信息用于元数据
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);

    // 4. 在助手节点中设置基本 metadata（包括 Agent 名称和图标的快照）
    if (session.nodes) {
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
    }

    // --- 元数据填充结束 ---

    // 处理附件（如果有）
    const { settings } = useChatSettings();
    if (options?.attachments && options.attachments.length > 0) {
      await processUserAttachments(userNode, session, options.attachments, pathUserNode);
    }

    // 立即保存用户消息，防止等待 LLM 响应或转写期间程序崩溃导致消息丢失
    if (sessionIndex) {
      sessionManager.persistSession(sessionIndex, session, currentSessionId ?? null);
    }
    logger.debug("用户消息已即时保存（转写前）", {
      sessionId: session.id,
      userNodeId: userNode.id,
    });

    // 附件转写等待逻辑（在消息上屏并保存后执行）
    if (options?.attachments && options.attachments.length > 0 && settings.value.transcription.enabled) {
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
          if (sessionIndex) {
            sessionManager.persistSession(sessionIndex, session, currentSessionId ?? null);
          }
          return;
        }
        // 其他错误（如超时）记录日志但继续，以降级模式（无转写文本）发送
        logger.warn("⚠️ 转写等待期间出错，将使用原始附件发送", error);
      } finally {
        abortControllers.delete(assistantNode.id);
      }
    }

    // 计算用户消息的 token 数（包括文本和附件）
    await calculateUserMessageTokens(userNode, session, content, agentConfig.modelId, options?.attachments);

    // 计算完成后立即持久化一次，确保用户消息的 tokens 及时保存并触发 UI 更新
    if (sessionIndex) {
      sessionManager.persistSession(sessionIndex, session, currentSessionId ?? null);
    }

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
    session: ChatSessionDetail,
    nodeId: string,
    _activePath: ChatMessageNode[],
    abortControllers: Map<string, AbortController>,
    generatingNodes: Set<string>,
    options?: { modelId?: string; profileId?: string },
  ): Promise<void> => {
    const agentStore = useAgentStore();
    const nodeManager = useNodeManager();

    // 定位目标节点
    const targetNode = session.nodes ? session.nodes[nodeId] : undefined;
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
      const targetModel = targetProfile?.models.find((m) => m.id === options.modelId);

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
    if (session.nodes) {
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
    }

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
    session: ChatSessionDetail,
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
      (session.nodes ? session.nodes[nodeId].role : "user") === "assistant" ? assistantNode.id : userNode?.id || nodeId,
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
      const targetModel = targetProfile?.models.find((m) => m.id === options.modelId);

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

    if (session.nodes) {
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
    }

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
    _session?: ChatSessionDetail,
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
        content:
          "You are a helpful writing assistant. Complete the user's text naturally. Do not repeat the input. Output ONLY the completion part.",
      },
      {
        role: "user",
        content: text,
      },
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

  /**
   * 获取 LLM 上下文预览数据
   * 支持可选的 pendingInput 参数，用于在预览中包含待发送消息。
   * 实现原理：将虚拟节点临时注入 session.nodes，走标准上下文管道，结束后清理。
   */
  const getLlmContextForPreview = async (
    session: ChatSessionDetail,
    nodeId: string,
    historicalAgentId?: string,
    options?: GetContextPreviewOptions,
  ): Promise<ContextPreviewData | null> => {
    const agentStore = useAgentStore();
    const chatStore = useLlmChatStore();
    const userProfileStore = useUserProfileStore();

    const sessionIndex = chatStore.sessionIndexMap.get(session.id);

    const pendingInput = options?.pendingInput;
    const parameterOverrides = options?.parameterOverrides ?? session.parameterOverrides;

    // 处理宏（如果启用且有待发送消息）
    let processedPendingInput = undefined;
    if (pendingInput) {
      const currentAgent = agentStore.getAgentById(historicalAgentId || agentStore.currentAgentId || "");
      const macroProcessor = new MacroProcessor();

      let processedContent = pendingInput.text;
      if (pendingInput.text && pendingInput.enableMacroParsing !== false) {
        const macroContext = buildMacroContext({
          index: sessionIndex,
          detail: session,
          agent: currentAgent ?? undefined,
          input: pendingInput.text,
          userProfile: userProfileStore.globalProfile ?? undefined,
        });
        processedContent = await processMacros(macroProcessor, pendingInput.text, macroContext);
      }

      processedPendingInput = {
        ...pendingInput,
        text: processedContent,
        originalText: pendingInput.text !== processedContent ? pendingInput.text : undefined,
      };
    }

    // 调用标准管道，通过 options 传递 pendingInput
    const result = await getContextForPreview(session, nodeId, historicalAgentId, parameterOverrides, {
      pendingInput: processedPendingInput,
    });

    // 标记包含待发送消息预览
    if (result && processedPendingInput) {
      result.hasPendingInputPreview = true;
    }
    return result;
  };

  /**
   * 重新解析节点中的工具调用
   */
  const reparseNodeTools = async (
    session: ChatSessionDetail,
    nodeId: string,
    abortControllers: Map<string, AbortController>,
    generatingNodes: Set<string>,
    options?: { temporaryModel?: ModelIdentifier | null },
  ): Promise<void> => {
    const agentStore = useAgentStore();
    const nodeManager = useNodeManager();
    const userProfileStore = useUserProfileStore();
    const { getProfileById } = useLlmProfiles();

    const assistantNode = session.nodes ? session.nodes[nodeId] : undefined;
    if (!assistantNode || assistantNode.role !== "assistant") {
      logger.warn("重新解析失败：目标节点不是助手消息", { nodeId });
      return;
    }

    // 架构说明：重新解析工具调用本质上是在 Assistant 节点下开启一个新的工具调用分支
    // 我们的树形架构天然支持这一点，新生成的 Tool 节点将作为 assistantNode 的新子节点
    if (assistantNode.childrenIds.length > 0) {
      logger.info("重新解析：目标节点已有子节点，将创建新的工具分支", {
        nodeId,
        existingChildren: assistantNode.childrenIds.length,
      });
    }

    // 获取到该助手节点的完整路径（包含该节点本身）
    // 这样可以正确构建上下文，即使该节点的父节点是 tool 节点
    const pathToAssistantNode = nodeManager.getNodePath(session, nodeId);

    // 从路径中找到最近的 user 节点
    let pathToUserNode = pathToAssistantNode;
    for (let i = pathToAssistantNode.length - 1; i >= 0; i--) {
      if (pathToAssistantNode[i].role === "user") {
        pathToUserNode = pathToAssistantNode.slice(0, i + 1);
        break;
      }
    }

    // 获取配置
    const agentId = assistantNode.metadata?.agentId || agentStore.currentAgentId;
    if (!agentId) {
      logger.warn("重新解析失败：无法确定 Agent ID", { nodeId });
      return;
    }

    const agentConfig = agentStore.getAgentConfig(agentId, {
      parameterOverrides: session.parameterOverrides,
    });
    if (!agentConfig) {
      logger.warn("重新解析失败：无法获取 Agent 配置", { nodeId, agentId });
      return;
    }

    // 如果提供了临时模型，则覆盖配置
    if (options?.temporaryModel) {
      const targetProfile = getProfileById(options.temporaryModel.profileId);
      const targetModel = targetProfile?.models.find((m) => m.id === options.temporaryModel?.modelId);

      if (targetProfile && targetModel) {
        agentConfig.modelId = options.temporaryModel.modelId;
        agentConfig.profileId = options.temporaryModel.profileId;

        // 过滤参数
        const { getSupportedParameters } = useLlmProfiles();
        const supportedParameters = getSupportedParameters(targetProfile.type);
        agentConfig.parameters = filterParametersForModel(
          agentConfig.parameters,
          supportedParameters,
          targetModel.capabilities,
        );

        logger.info("重新解析使用临时指定的模型", {
          modelId: agentConfig.modelId,
          profileId: agentConfig.profileId,
        });
      }
    }

    const currentAgent = agentStore.getAgentById(agentId);
    if (!currentAgent) {
      logger.warn("重新解析失败：Agent 不存在", { nodeId, agentId });
      return;
    }

    const executionAgent = { ...currentAgent, ...agentConfig };

    // 获取用户档案
    let effectiveUserProfile: UserProfile | null = null;
    const profileId = currentAgent.userProfileId || userProfileStore.globalProfileId;
    if (profileId) {
      effectiveUserProfile = userProfileStore.getProfileById(profileId) || null;
    }

    const profile = getProfileById(agentConfig.profileId);
    const vcpStore = (await import("@/tools/vcp-connector/stores/vcpConnectorStore")).useVcpStore();
    const { isSameHost } = await import("../useIsVcpChannel");
    const isVcpChannel =
      profile?.baseUrl && vcpStore.config.wsUrl ? isSameHost(profile.baseUrl, vcpStore.config.wsUrl) : false;

    logger.info("开始重新解析工具调用", {
      nodeId,
      agentId,
      pathLength: pathToUserNode.length,
      hasChildren: assistantNode.childrenIds.length > 0,
    });

    await reparseAndOrchestrate({
      session,
      assistantNode,
      pathToUserNode,
      agentConfig,
      executionAgent,
      effectiveUserProfile,
      abortControllers,
      generatingNodes,
      isVcpChannel,
    });
  };

  return {
    sendMessage,
    regenerateFromNode,
    continueGeneration,
    completeInput,
    getLlmContextForPreview,
    reparseNodeTools,
  };
}
