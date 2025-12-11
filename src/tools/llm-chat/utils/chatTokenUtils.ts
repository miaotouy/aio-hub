import type { ChatSession, ChatMessageNode } from "../types";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/token-utils");

/**
 * 重新计算单个节点的 token
 */
export async function recalculateNodeTokens(session: ChatSession, nodeId: string): Promise<void> {
  const node = session.nodes[nodeId];
  if (!node || !node.content) return;
  if (node.role !== 'user' && node.role !== 'assistant') return;

  let modelId: string | undefined;
  if (node.role === 'assistant' && node.metadata?.modelId) {
    modelId = node.metadata.modelId;
  } else if (node.role === 'user') {
    let currentId: string | null = session.activeLeafId;
    while (currentId !== null) {
      const pathNode: ChatMessageNode | undefined = session.nodes[currentId];
      if (pathNode?.role === 'assistant' && pathNode.metadata?.modelId) {
        modelId = pathNode.metadata.modelId;
        break;
      }
      currentId = pathNode?.parentId ?? null;
    }
    if (!modelId) {
      for (const n of Object.values(session.nodes)) {
        if (n.role === 'assistant' && n.metadata?.modelId) {
          modelId = n.metadata.modelId;
          break;
        }
      }
    }
  }

  if (!modelId) {
    logger.warn('无法确定模型ID，跳过token重新计算', { sessionId: session.id, nodeId, role: node.role });
    return;
  }

  try {
    let fullContent = node.content;
    let mediaAttachments = node.attachments;

    if (node.role === 'user' && node.attachments && node.attachments.length > 0) {
      // 动态导入所需模块
      const { useChatSettings } = await import('../composables/useChatSettings');
      const { useMessageBuilder } = await import('../composables/useMessageBuilder');
      
      // 获取当前设置
      const { settings, loadSettings } = useChatSettings();
      await loadSettings(); // 确保设置已加载

      // 准备用于 Token 计算的消息内容
      const { prepareSimpleMessageForTokenCalc } = useMessageBuilder();
      const result = await prepareSimpleMessageForTokenCalc(
        node.content,
        node.attachments,
        settings.value
      );

      fullContent = result.combinedText;
      mediaAttachments = result.mediaAttachments;
    }

    const tokenResult = await tokenCalculatorService.calculateMessageTokens(
      fullContent,
      modelId,
      mediaAttachments
    );

    if (!node.metadata) node.metadata = {};
    node.metadata.contentTokens = tokenResult.count;

    logger.debug('重新计算消息 token', {
      sessionId: session.id,
      nodeId,
      role: node.role,
      tokens: tokenResult.count,
      isEstimated: tokenResult.isEstimated,
    });
  } catch (error) {
    logger.warn('重新计算 token 失败', {
      sessionId: session.id,
      nodeId,
      role: node.role,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 补充会话中缺失的 token 元数据
 * @returns 返回是否有会话被更新
 */
export async function fillMissingTokenMetadata(sessions: ChatSession[]): Promise<ChatSession[]> {
  let updatedCount = 0;
  const sessionsToSave: ChatSession[] = [];

  for (const session of sessions) {
    let sessionUpdated = false;
    for (const [nodeId, node] of Object.entries(session.nodes)) {
      if (!node.content || node.metadata?.contentTokens !== undefined) continue;

      let modelId: string | undefined;
      if (node.role === 'assistant' && node.metadata?.modelId) {
        modelId = node.metadata.modelId;
      } else if (node.role === 'user') {
        let currentId: string | null = session.activeLeafId;
        while (currentId !== null) {
          const pathNode: ChatMessageNode | undefined = session.nodes[currentId];
          if (pathNode?.role === 'assistant' && pathNode.metadata?.modelId) {
            modelId = pathNode.metadata.modelId;
            break;
          }
          currentId = pathNode?.parentId ?? null;
        }
        if (!modelId) {
          for (const n of Object.values(session.nodes)) {
            if (n.role === 'assistant' && n.metadata?.modelId) {
              modelId = n.metadata.modelId;
              break;
            }
          }
        }
      }

      if (!modelId) continue;

      try {
        let fullContent = node.content;
        let mediaAttachments = node.attachments;

        if (node.role === 'user' && node.attachments && node.attachments.length > 0) {
          // 动态导入所需模块
          const { useChatSettings } = await import('../composables/useChatSettings');
          const { useMessageBuilder } = await import('../composables/useMessageBuilder');
          
          // 获取当前设置
          const { settings, loadSettings } = useChatSettings();
          await loadSettings(); // 确保设置已加载

          // 准备用于 Token 计算的消息内容
          const { prepareSimpleMessageForTokenCalc } = useMessageBuilder();
          const result = await prepareSimpleMessageForTokenCalc(
            node.content,
            node.attachments,
            settings.value
          );

          fullContent = result.combinedText;
          mediaAttachments = result.mediaAttachments;
        }

        const tokenResult = await tokenCalculatorService.calculateMessageTokens(
          fullContent,
          modelId,
          mediaAttachments
        );

        if (!node.metadata) node.metadata = {};
        node.metadata.contentTokens = tokenResult.count;
        updatedCount++;
        sessionUpdated = true;
      } catch (error) {
        logger.warn('计算 token 失败', { sessionId: session.id, nodeId, error });
      }
    }
    if (sessionUpdated) sessionsToSave.push(session);
  }

  if (sessionsToSave.length > 0) {
    logger.info('补充 token 元数据完成', { totalUpdated: updatedCount, sessionsUpdated: sessionsToSave.length });
  }

  return sessionsToSave;
}