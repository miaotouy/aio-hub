import { createModuleLogger } from "@/utils/logger";
import type { ContextProcessor, PipelineContext } from "../../pipeline/types";
import { buildMessageContentForLlm } from "../../context-utils/builder";
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

  while (currentId) {
    const node: ChatMessageNode | undefined = session.nodes[currentId];
    if (!node) {
      logger.warn("提取历史记录中断：找不到节点", { nodeId: currentId });
      break;
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
      // 忽略空消息或只有空白字符的消息
      if (!node.content.trim()) {
        continue;
      }
      const processableMessage: ProcessableMessage = {
        role: node.role,
        content: await buildMessageContentForLlm(
          node.content,
          node.attachments,
        ),
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
