import { createModuleLogger } from "@/utils/logger";
import type { ContextProcessor, PipelineContext, ProcessableMessage } from "../../../types";
import type { ChatMessageNode } from "../../../types/message";

const logger = createModuleLogger("primary:session-loader");

/**
 * 从会话的树状结构中提取当前活动分支的线性历史记录。
 */
function getActiveBranchHistory(
  session: PipelineContext["session"],
): ChatMessageNode[] {
  const history: ChatMessageNode[] = [];
  let currentId: string | null = session.activeLeafId;

  // 1. 收集被隐藏节点 ID (移动端暂不处理压缩节点，但保留逻辑框架)
  const hiddenNodeIds = new Set<string>();

  // 2. 遍历构建历史记录
  while (currentId) {
    const node: ChatMessageNode | undefined = session.nodes[currentId];
    if (!node) {
      logger.warn("提取历史记录中断：找不到节点", { nodeId: currentId });
      break;
    }

    if (hiddenNodeIds.has(node.id)) {
      currentId = node.parentId;
      continue;
    }

    // 根节点不应包含在历史记录中
    if (node.parentId) {
      history.unshift(node);
    }
    currentId = node.parentId;
  }
  return history;
}

export const sessionLoader: ContextProcessor = {
  id: "primary:session-loader",
  name: "会话加载器",
  description: "加载会话历史记录并将其转换为可处理的消息格式。",
  priority: 100,
  execute: async (context: PipelineContext) => {
    if (!context.session) {
      const message = "上下文中缺少 session 对象，已跳过。";
      logger.warn(message);
      context.logs.push({
        processorId: "primary:session-loader",
        level: "warn",
        message,
      });
      return;
    }

    const historyNodes = getActiveBranchHistory(context.session);
    const messages: ProcessableMessage[] = [];

    for (const node of historyNodes) {
      // 忽略空消息 (仅针对纯文本，如果未来支持多模态，这里需要更复杂的判断)
      if (typeof node.content === 'string' && !node.content.trim()) {
        continue;
      }

      const processableMessage: ProcessableMessage = {
        role: node.role as any,
        content: node.content,
        sourceType: "session_history",
        sourceId: node.id,
      };
      messages.push(processableMessage);
    }

    context.messages = messages;
    const message = `已加载 ${messages.length} 条历史消息。`;
    logger.info(message, { count: messages.length });
    context.logs.push({
      processorId: "primary:session-loader",
      level: "info",
      message,
    });
  },
};