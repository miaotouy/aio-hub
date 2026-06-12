import { Token, ParserContext } from "../types";
import { VcpRoleNode } from "../../types";
import { Tokenizer } from "../Tokenizer";

type ToolSummaryItem = {
  label: string;
  toolName: string;
  status: "success" | "error" | "info";
  statusLabel: string;
};

function parseToolSummaryItems(content: string): ToolSummaryItem[] {
  return content
    .split(/[；;]/)
    .map((item) => item.trim().replace(/[。.\s]+$/g, ""))
    .filter(Boolean)
    .map((label) => {
      const match = /^(.*?)\s*调用\s*(成功|失败|错误|异常)$/.exec(label);
      const toolName = match?.[1]?.trim() || label;
      const statusLabel = match?.[2] || "摘要";
      const status: ToolSummaryItem["status"] =
        statusLabel === "成功"
          ? "success"
          : ["失败", "错误", "异常"].includes(statusLabel)
            ? "error"
            : "info";

      return {
        label,
        toolName,
        status,
        statusLabel,
      };
    });
}

/**
 * 解析 VCP 角色容器
 */
export function parseVcpRole(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: VcpRoleNode | null; nextIndex: number } {
  const token = tokens[start];
  if (token.type !== "vcp_role") {
    return { node: null, nextIndex: start };
  }

  const { role, variant, content, closed } = token;

  // 对内容进行二次分词
  const tokenizer = new Tokenizer();
  const innerTokens = tokenizer.tokenize(content);

  // 递归解析内部块
  const children = ctx.parseBlocks(innerTokens);

  return {
    node: {
      id: "",
      type: "vcp_role",
      props: {
        role,
        variant,
        summaryItems:
          variant === "tool_summary" ? parseToolSummaryItems(content) : undefined,
        closed,
      },
      children,
      meta: {
        range: { start: 0, end: 0 },
        status: closed ? "stable" : "pending",
      },
    },
    nextIndex: start + 1,
  };
}
