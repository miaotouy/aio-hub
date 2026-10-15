// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { Token, ParserContext } from "../types";
import type { AstNode, VcpRoleNode, VcpToolNode } from "../../types";
import { Tokenizer } from "../Tokenizer";

import {
  normalizeToolStatus,
  parseToolSummaryItems,
  type ToolSummaryItem,
} from "@/utils/vcpToolSummary";

type ToolResultSignature = {
  toolName: string;
  status: "success" | "error" | "info";
};

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase();
}

function collectToolResultSignatures(
  children: AstNode[]
): ToolResultSignature[] {
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
  const tokenizer = new Tokenizer({
    vcpFuzzyModeEnabled: ctx.getOptions().vcpFuzzyModeEnabled,
  });
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
          variant === "tool_summary"
            ? parseToolSummaryItems(content)
            : undefined,
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
