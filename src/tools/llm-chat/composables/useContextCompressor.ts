/**
 * 上下文压缩核心逻辑
 * 负责压缩检测、摘要生成和压缩节点创建
 */

import type { ChatSession, ChatMessageNode, ContextCompressionConfig } from '../types';
import { useNodeManager } from './useNodeManager';
import { useLlmRequest } from '@/composables/useLlmRequest';
import { useChatSettings } from './useChatSettings';
import { useAgentStore } from '../agentStore';
import { useLlmChatStore } from '../store';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";

const logger = createModuleLogger('llm-chat/context-compressor');
const errorHandler = createModuleErrorHandler('llm-chat/context-compressor');

export function useContextCompressor() {
  const { getNodePath, createNode, addNodeToSession, reparentNode } = useNodeManager();
  const { sendRequest } = useLlmRequest();
  const { settings } = useChatSettings();
  const agentStore = useAgentStore();
  const llmChatStore = useLlmChatStore();

  /**
   * 压缩上下文信息
   */
  interface CompressionContext {
    totalTokens: number;
    messageCount: number;
    historyCount: number;
  }

  /**
   * 判断是否需要压缩
   */
  const shouldCompress = (
    context: CompressionContext,
    config: ContextCompressionConfig
  ): boolean => {
    // 检查最小历史条数
    if (context.historyCount < (config.minHistoryCount || 15)) {
      return false;
    }

    const mode = config.triggerMode || 'token';
    const tokenThreshold = config.tokenThreshold || 80000;
    const countThreshold = config.countThreshold || 50;

    switch (mode) {
      case 'token':
        return context.totalTokens > tokenThreshold;
      case 'count':
        return context.messageCount > countThreshold;
      case 'both':
        return context.totalTokens > tokenThreshold || context.messageCount > countThreshold;
      default:
        return false;
    }
  };
  /**
   * 计算当前有效路径的上下文统计信息
   * (优先使用 Store 中的 Pipeline 计算结果，不再自己重复计算)
   */
  const calculateContextStats = (path: ChatMessageNode[]): CompressionContext => {
    // 1. 找出所有启用的压缩节点及其隐藏的节点 ID
    const enabledCompressionNodes = path.filter(
      (node) => node.metadata?.isCompressionNode && node.isEnabled !== false
    );

    const hiddenNodeIds = new Set<string>();
    enabledCompressionNodes.forEach((node) => {
      (node.metadata?.compressedNodeIds || []).forEach((id) =>
        hiddenNodeIds.add(id)
      );
    });

    // 2. 过滤掉被隐藏的节点
    const effectiveNodes = path.filter((node) => !hiddenNodeIds.has(node.id));

    // 3. 基础统计 (Count)
    // 历史总数指路径上的总节点数
    const historyCount = effectiveNodes.length;
    // 这里简单计算有效节点数作为近似
    const messageCount = historyCount;

    // 4. Token 统计
    let totalTokens = 0;

    // 尝试从 Store 获取最新的上下文统计
    // Store 中的统计数据由 Pipeline (preview-builder) 生成，已经处理了隐藏节点、附件 Token 等复杂逻辑
    const storeStats = llmChatStore.contextStats;

    if (storeStats && storeStats.totalTokenCount !== undefined) {
      // 使用 Store 的精确 Token 数
      totalTokens = storeStats.totalTokenCount;
    } else {
      // Fallback: 如果 Store 还没准备好，使用本地简单估算
      logger.debug("Store 上下文统计未就绪，使用本地简单估算");
      effectiveNodes.forEach((node) => {
        totalTokens += node.metadata?.tokenCount || 0;
      });
    }

    return { totalTokens, messageCount, historyCount };
  };

  /**
   * 生成摘要
   */
  const generateSummary = async (
    messages: ChatMessageNode[],
    config: ContextCompressionConfig,
    agentId?: string
  ): Promise<string> => {
    logger.info('开始生成摘要', { messageCount: messages.length });

    // 1. 准备消息内容
    const contentText = messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n\n');

    // 2. 准备提示词
    const defaultPrompt = "请将以下对话历史压缩为一个简洁的摘要，保留核心信息和关键对话转折点：\n\n{context}\n\n摘要要求：\n1. 用中文输出\n2. 保持客观中立\n3. 不超过 300 字";
    const promptTemplate = config.summaryPrompt || defaultPrompt;
    const prompt = promptTemplate.replace('{context}', contentText);

    // 3. 确定使用的模型
    let profileId: string;
    let modelId: string;

    if (config.summaryModel) {
      // 使用配置的摘要模型
      profileId = config.summaryModel.profileId;
      modelId = config.summaryModel.modelId;
    } else {
      // 使用当前 Agent 的模型
      // 如果没有指定 agentId，尝试获取当前选中的 Agent
      const targetAgentId = agentId || agentStore.currentAgentId;
      const agent = targetAgentId ? agentStore.getAgentById(targetAgentId) : null;

      if (agent) {
        profileId = agent.profileId;
        modelId = agent.modelId;
      } else {
        // 回退到全局默认
        // 这里简化处理，如果找不到 Agent，可能无法进行请求
        // 尝试从 profiles 中找一个可用的
        const { enabledProfiles } = useLlmProfiles();
        if (enabledProfiles.value.length > 0) {
          profileId = enabledProfiles.value[0].id;
          modelId = enabledProfiles.value[0].models[0]?.id;
        } else {
          throw new Error('无法确定摘要生成模型：未找到可用配置');
        }
      }
    }

    // 4. 发送请求
    try {
      const response = await sendRequest({
        profileId,
        modelId,
        messages: [{ role: 'user', content: prompt }], // 摘要任务通常作为单次 Prompt
        temperature: 0.3, // 摘要通常需要较低的温度
        maxTokens: 1000,
      });

      return response.content;
    } catch (error) {
      errorHandler.handle(error, { userMessage: '摘要生成失败', showToUser: false });
      throw error;
    }
  };

  /**
   * 压缩指定的节点列表
   * 创建摘要节点并插入到树中
   */
  const compressNodes = async (
    session: ChatSession,
    nodesToCompress: ChatMessageNode[],
    summaryContent: string,
    config: ContextCompressionConfig
  ): Promise<ChatMessageNode | null> => {
    if (nodesToCompress.length === 0) return null;

    const lastNode = nodesToCompress[nodesToCompress.length - 1];

    // 统计原始信息
    let originalTokenCount = 0;
    nodesToCompress.forEach(n => originalTokenCount += (n.metadata?.tokenCount || 0));

    // 1. 创建压缩节点
    const summaryNode = createNode({
      role: (config.summaryRole as any) || 'system',
      content: summaryContent,
      parentId: lastNode.id, // 暂时设为 lastNode，稍后调整
      status: 'complete',
      metadata: {
        isCompressionNode: true,
        compressedNodeIds: nodesToCompress.map(n => n.id),
        compressionTimestamp: Date.now(),
        originalTokenCount,
        originalMessageCount: nodesToCompress.length,
        compressionConfig: {
          triggerMode: config.triggerMode || 'token',
          thresholds: {
            tokenThreshold: config.tokenThreshold || 0,
            countThreshold: config.countThreshold || 0,
          },
          summaryRole: config.summaryRole || 'system',
        },
        // 估算摘要节点的 Token
        tokenCount: Math.ceil(summaryContent.length * 1.5), // 粗略估算
      },
    });

    // 尝试使用 TokenCalculator 计算精确的 Token 数
    try {
      const currentAgentId = agentStore.currentAgentId;
      const agent = currentAgentId ? agentStore.getAgentById(currentAgentId) : null;
      // 如果没有指定模型，TokenCalculator 会自动回退到默认估算策略
      const tokenResult = await tokenCalculatorService.calculateTokens(
        summaryContent,
        agent?.modelId || ""
      );
      if (summaryNode.metadata) {
        summaryNode.metadata.tokenCount = tokenResult.count;
      }
    } catch (error) {
      logger.warn("计算摘要节点 Token 失败，保留估算值", error);
    }

    // 2. 插入到树中
    // 逻辑：Summary 节点插入到 lastNode 之后
    // 也就是：lastNode 的所有子节点，现在变成 SummaryNode 的子节点
    // SummaryNode 的父节点变成 lastNode

    // 1. 记录 lastNode 的当前子节点（这些节点需要转移到 summaryNode 下）
    // 注意：summaryNode 的 parentId 已经是 lastNode.id，但此时还没添加到 session，所以 childrenToTransfer 不包含它
    const childrenToTransfer = [...lastNode.childrenIds];

    // 2. 将 summaryNode 添加到会话
    // 这会将 summaryNode 添加到 lastNode.childrenIds 中
    addNodeToSession(session, summaryNode);

    // 3. 将原有的子节点转移到 summaryNode 下
    for (const childId of childrenToTransfer) {
      try {
        reparentNode(session, childId, summaryNode.id);
      } catch (error) {
        errorHandler.handle(error, {
          userMessage: '重挂载子节点失败',
          context: { childId, summaryNodeId: summaryNode.id },
          showToUser: false,
        });
      }
    }

    logger.info('压缩节点创建并插入成功', {
      summaryNodeId: summaryNode.id,
      compressedCount: nodesToCompress.length
    });

    return summaryNode;
  };

  /**
   * 检查并执行压缩
   * @returns 是否执行了压缩
   */
  /**
   * 获取有效配置
   */
  const getEffectiveConfig = (config?: ContextCompressionConfig): ContextCompressionConfig => {
    // 优先级：参数 config > Agent 配置 > 全局配置
    const globalConfig = settings.value.contextCompression;
    let effectiveConfig: ContextCompressionConfig = { ...globalConfig };

    // 如果传入了 config (通常是测试或手动触发)，覆盖全局
    if (config) {
      effectiveConfig = { ...effectiveConfig, ...config };
    } else {
      // 尝试获取当前 Agent 的配置覆盖
      const currentAgentId = agentStore.currentAgentId;
      if (currentAgentId) {
        const agent = agentStore.getAgentById(currentAgentId);
        if (agent?.parameters?.contextCompression) {
          effectiveConfig = { ...effectiveConfig, ...agent.parameters.contextCompression };
        }
      }
    }
    return effectiveConfig;
  };

  /**
   * 检查并执行压缩
   * @returns 是否执行了压缩
   */
  const checkAndCompress = async (
    session: ChatSession,
    config?: ContextCompressionConfig
  ): Promise<boolean> => {
    const effectiveConfig = getEffectiveConfig(config);

    // 检查是否启用
    if (!effectiveConfig.enabled) {
      return false;
    }

    // 2. 获取路径并计算统计
    const path = getNodePath(session, session.activeLeafId);
    const contextStats = calculateContextStats(path);

    // 3. 判断是否需要压缩
    if (!shouldCompress(contextStats, effectiveConfig)) {
      return false;
    }

    logger.info("触发上下文压缩", { contextStats, config: effectiveConfig });

    return await executeCompression(session, path, effectiveConfig);
  };

  /**
   * 手动触发压缩（忽略自动触发阈值）
   */
  const manualCompress = async (session: ChatSession): Promise<boolean> => {
    const effectiveConfig = getEffectiveConfig();
    const path = getNodePath(session, session.activeLeafId);

    logger.info("手动触发上下文压缩", { config: effectiveConfig });

    return await executeCompression(session, path, effectiveConfig);
  };

  /**
   * 执行压缩核心逻辑
   */
  const executeCompression = async (
    session: ChatSession,
    path: ChatMessageNode[],
    effectiveConfig: ContextCompressionConfig
  ): Promise<boolean> => {
    // 4. 确定压缩范围
    // 策略：保护最近 N 条，压缩之前的 M 条
    // 过滤出有效节点（未被隐藏的）
    const enabledCompressionNodes = path.filter(
      (node) => node.metadata?.isCompressionNode && node.isEnabled !== false
    );
    const hiddenNodeIds = new Set<string>();
    enabledCompressionNodes.forEach((node) => {
      (node.metadata?.compressedNodeIds || []).forEach((id) => hiddenNodeIds.add(id));
    });

    // 获取所有“可见”的普通消息节点 (排除 system prompt? 通常 system prompt 不压缩)
    // 排除 System 角色
    const candidateNodes = path.filter(
      (node) =>
        !hiddenNodeIds.has(node.id) &&
        !node.metadata?.isCompressionNode &&
        node.role !== "system"
    );

    const protectCount = effectiveConfig.protectRecentCount || 10;
    const compressCount = effectiveConfig.compressCount || 20;

    // 如果候选节点数量不足以保留保护区，则不压缩
    if (candidateNodes.length <= protectCount) {
      logger.info("候选节点数量不足以触发压缩（受保护区限制）", {
        candidateCount: candidateNodes.length,
        protectCount,
      });
      return false;
    }

    // 确定要压缩的节点：从候选列表头部开始，取 compressCount 个
    // 注意：candidateNodes 是按时间顺序排列的 (path 是从根到叶)
    // 我们要保留末尾的 protectCount 个
    // 可压缩的范围是 [0, length - protectCount]
    const compressibleNodes = candidateNodes.slice(0, candidateNodes.length - protectCount);

    // 从中取最后 compressCount 个？还是最早的？
    // 通常压缩最早的。
    // 比如 A, B, C, D, E, F(protect), G(protect)
    // 压缩 A, B, C。
    // 如果一次只压 2 个，压 A, B。
    const nodesToCompress = compressibleNodes.slice(0, compressCount);

    if (nodesToCompress.length === 0) {
      return false;
    }

    // 5. 执行压缩
    try {
      // 生成摘要
      const summary = await generateSummary(nodesToCompress, effectiveConfig);

      // 创建节点并更新树
      await compressNodes(session, nodesToCompress, summary, effectiveConfig);

      return true;
    } catch (error) {
      // 压缩失败不应中断对话，只记录错误
      errorHandler.handle(error as Error, {
        userMessage: "上下文压缩执行失败",
        showToUser: false,
      });
      return false;
    }
  };

  return {
    checkAndCompress,
    manualCompress,
    compressNodes,
    generateSummary,
    shouldCompress,
    calculateContextStats,
  };
}