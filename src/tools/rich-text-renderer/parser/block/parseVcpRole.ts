import type { Token, ParserContext } from "../types";
import type { AstNode, VcpRoleNode, VcpToolNode } from "../../types";
import { Tokenizer } from "../Tokenizer";

type ToolSummaryItem = {
  label: string;
  toolName: string;
  status: "success" | "error" | "info";
  statusLabel: string;
};

type NormalizedToolStatus = "success" | "error" | "info";

type ToolResultSignature = {
  toolName: string;
  status: NormalizedToolStatus;
};

const SUMMARY_STATUS_PATTERN =
  /(成功|完成|失败|错误|异常|超时|拒绝|取消|中止|跳过)$/;

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase();
}

function normalizeToolStatus(statusText: string): NormalizedToolStatus {
  if (/成功|完成|success|succeeded|ok/i.test(statusText)) {
    return "success";
  }

  if (
    /失败|错误|异常|超时|拒绝|取消|中止|error|fail|failed|timeout|rejected|cancel/i.test(
      statusText
    )
  ) {
    return "error";
  }

  return "info";
}

function parseToolSummaryItems(content: string): ToolSummaryItem[] {
  return content
    .split(/[；;]/)
    .map((item) => item.trim().replace(/[。.\s]+$/g, ""))
    .filter(Boolean)
    .map((label) => {
      const match = new RegExp(
        `^(.*?)\\s*调用\\s*${SUMMARY_STATUS_PATTERN.source}`
      ).exec(label);
      const toolName = match?.[1]?.trim() || label;
      const statusLabel = match?.[2] || "摘要";
      const status = normalizeToolStatus(statusLabel);

      return {
        label,
        toolName,
        status,
        statusLabel,
      };
    });
}

function collectToolResultSignatures(children: AstNode[]): ToolResultSignature[] {
  const signatures: ToolResultSignature[] = [];

  for (const child of children) {
    if (child.type === "vcp_tool" && child.props.isResult) {
      const toolNode = child as VcpToolNode;
      signatures.push({
        toolName: normalizeToolName(toolNode.props.tool_name),
        status: normalizeToolStatus(toolNode.props.status || ""),
      });
      continue;
    }

    if ("children" in child && Array.isArray(child.children)) {
      signatures.push(...collectToolResultSignatures(child.children));
    }
  }

  return signatures;
}

function isSummaryCoveredByResult(
  item: ToolSummaryItem,
  resultSignatures: ToolResultSignature[]
): boolean {
  const toolName = normalizeToolName(item.toolName);

  return resultSignatures.some(
    (result) => result.toolName === toolName && result.status === item.status
  );
}

function removeCoveredToolSummaries(children: AstNode[]): AstNode[] {
  const resultSignatures = collectToolResultSignatures(children);
  if (resultSignatures.length === 0) return children;

  return children
    .map((child) => {
      if (child.type !== "vcp_role" || child.props.variant !== "tool_summary") {
        return child;
      }

      const summaryItems = child.props.summaryItems || [];
      const visibleSummaryItems = summaryItems.filter(
        (item) => !isSummaryCoveredByResult(item, resultSignatures)
      );

      if (visibleSummaryItems.length === 0) {
        return null;
      }

      return {
        ...child,
        props: {
          ...child.props,
          summaryItems: visibleSummaryItems,
        },
      };
    })
    .filter((child): child is AstNode => child !== null);
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
  const children = removeCoveredToolSummaries(ctx.parseBlocks(innerTokens));

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
