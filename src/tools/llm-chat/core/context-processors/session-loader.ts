import { createModuleLogger } from "@/utils/logger";
import TurndownService from "turndown";
import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import type { ProcessableMessage } from "@/tools/llm-chat/types/context";
import type { ChatMessageNode } from "@/tools/llm-chat/types";

const logger = createModuleLogger("primary:session-loader");

/**
 * 对 turndown 输出的 Markdown 进行后处理，清理结构问题以节约 token。
 * - 合并连续空行为单个空行
 * - 移除 HTML 注释
 * - 清理行尾多余空白
 * - 移除残留的空链接/空图片标签
 */
function postProcessMarkdown(md: string): string {
  return (
    md
      // 移除 HTML 注释 <!-- ... -->
      .replace(/<!--[\s\S]*?-->/g, "")
      // 移除残留的空链接 []() 和空图片 ![]()
      .replace(/!?\[]\(\s*\)/g, "")
      // 清理行尾空白（保留换行本身）
      .replace(/[ \t]+$/gm, "")
      // 合并 3 个及以上连续换行为 2 个（即一个空行）
      .replace(/\n{3,}/g, "\n\n")
      // 去除首尾多余空白
      .trim()
  );
}

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
    const { convertHtmlToMd, htmlToMdLastMessages } =
      context.settings.contextOptimization || {
        convertHtmlToMd: false,
        htmlToMdLastMessages: 5,
      };

    let turndownService: TurndownService | null = null;
    if (convertHtmlToMd) {
      turndownService = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        emDelimiter: "*",
      });
      // 保持某些可能对模型理解有帮助的标签
      turndownService.keep(["del", "ins", "sub", "sup"]);

      // 完全禁用 Markdown 转义：这些内容是给 AI 消费的上下文，不需要防止 Markdown 误解析
      // turndown 默认会把 * _ [ ] 等字符都加反斜杠（如 **text** → \*\*text\*\*），
      // 这在 AI 场景下纯粹浪费 token，直接返回原字符串即可
      turndownService.escape = (str: string) => str;
    }

    const messages: ProcessableMessage[] = [];
    const historyCount = historyNodes.length;

    for (let i = 0; i < historyCount; i++) {
      const node = historyNodes[i];
      // 忽略空消息且没有附件的消息
      const hasContent = !!node.content.trim();
      const hasAttachments = !!(node.attachments && node.attachments.length > 0);

      if (!hasContent && !hasAttachments) {
        continue;
      }

      let finalContent = node.content;

      // 检查是否需要进行 HTML 到 Markdown 的转换
      // 规则：开启了转换，且当前消息在倒数 N 条之外（即较旧的消息）
      if (turndownService && historyCount - i > htmlToMdLastMessages) {
        // 启发式判断是否包含 HTML 标签，且避开可能是简单数学符号的情况
        if (/<[a-z][\s\S]*>/i.test(finalContent)) {
          try {
            // 只有当内容中确实存在 HTML 结构时才转换
            finalContent = turndownService.turndown(finalContent);
            // 后处理：清理 turndown 输出中的结构问题
            finalContent = postProcessMarkdown(finalContent);
          } catch (e) {
            logger.warn("HTML 转 Markdown 失败", { error: e, nodeId: node.id });
          }
        }
      }

      const processableMessage: ProcessableMessage = {
        role: node.role,
        content: finalContent,
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
