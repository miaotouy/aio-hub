import { createModuleLogger } from "@/utils/logger";
import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import type { ProcessableMessage } from "@/tools/llm-chat/types/context";
import type { ChatMessageNode } from "@/tools/llm-chat/types";

const logger = createModuleLogger("primary:session-loader");

/**
 * 从会话的树状结构中提取当前活动分支的线性历史记录。
 * @param session - 聊天会话对象
 * @returns 线性消息节点数组
 */
function getActiveBranchHistory(
  session: PipelineContext["session"],
): ChatMessageNode[] {
  const history: ChatMessageNode[] = [];
  let currentId: string | null = session.activeLeafId;

  // 1. 收集被压缩节点 ID (这些节点应该被隐藏)
  const hiddenNodeIds = new Set<string>();

  // 第一遍遍历：收集 hiddenNodeIds
  // 注意：我们需要从叶子往上遍历，因为摘要节点通常在被压缩节点之后（或作为其子节点）
  // 但在这个树结构中，Summary 节点是 LastCompressedNode 的子节点。
  // 所以从 activeLeafId 往上遍历时，会先遇到 Summary 节点。
  let tempId: string | null = currentId;
  while (tempId) {
    const node: ChatMessageNode = session.nodes[tempId];
    if (!node) break;

    if (node.metadata?.isCompressionNode && node.isEnabled !== false) {
      const compressedIds = node.metadata.compressedNodeIds || [];
      compressedIds.forEach((id: string) => hiddenNodeIds.add(id));
    }
    tempId = node.parentId;
  }

  // 2. 第二遍遍历：构建历史记录并过滤
  while (currentId) {
    const node: ChatMessageNode | undefined = session.nodes[currentId];
    if (!node) {
      logger.warn("提取历史记录中断：找不到节点", { nodeId: currentId });
      break;
    }

    // 如果是被隐藏的节点，跳过
    // 注意：Summary 节点本身不应该被过滤（除非它也被另一个 Summary 压缩了）
    if (hiddenNodeIds.has(node.id)) {
      currentId = node.parentId;
      continue;
    }

    // 根节点（通常是 system prompt）不应包含在历史记录中
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
      logger.warn(message, { context });
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
      // 忽略空消息且没有附件的消息
      const hasContent = !!node.content.trim();
      const hasAttachments = !!(node.attachments && node.attachments.length > 0);

      if (!hasContent && !hasAttachments) {
        continue;
      }
      const processableMessage: ProcessableMessage = {
        role: node.role,
        content: node.content,
        sourceType: "session_history",
        sourceId: node.id,
        _attachments: node.attachments,
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
