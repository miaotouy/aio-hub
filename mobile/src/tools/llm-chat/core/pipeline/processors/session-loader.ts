import { createModuleLogger } from "@/utils/logger";
import {
  processorResult,
  type ContextProcessor,
  type PipelineContext,
  type ProcessableMessage,
} from "../../../types";
import type { ChatMessageNode } from "../../../types/message";
import {
  formatReplyReferenceContent,
  isChatMessageReference,
} from "../../../utils/replyReference";

const logger = createModuleLogger("primary:session-loader");

/**
 * 从会话的树状结构中提取当前活动分支的线性历史记录。
 */
function getActiveBranchHistory(
  session: PipelineContext["session"]
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
      const error = new Error("PIPELINE_SESSION_REQUIRED");
      const message = "上下文中缺少 session 对象，无法安全构造聊天请求。";
      logger.error(message, error);
      return processorResult.failed(message, error);
    }

    const historyNodes = getActiveBranchHistory(context.session);
    const messages: ProcessableMessage[] = [];

    for (const node of historyNodes) {
      if (!node.content.trim() && !node.attachments?.length) {
        continue;
      }

      const processableMessage: ProcessableMessage = {
        role: node.role as any,
        content: formatReplyReferenceContent(
          isChatMessageReference(node.metadata?.replyTo)
            ? node.metadata.replyTo
            : undefined,
          node.content
        ),
        sourceType: "session_history",
        sourceId: node.id,
        _attachments: node.attachments?.map(
          ({ id: _attachmentId, ...attachment }) => attachment
        ),
      };
      messages.push(processableMessage);
    }

    context.messages = messages;
    const message = `已加载 ${messages.length} 条历史消息。`;
    logger.info(message, { count: messages.length });
    return processorResult.applied(message, { count: messages.length });
  },
};
