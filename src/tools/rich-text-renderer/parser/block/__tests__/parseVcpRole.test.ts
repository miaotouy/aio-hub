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

import { describe, expect, it } from "vitest";
import { CustomParser } from "../../../core/CustomParser";
import type { AstNode, VcpRoleNode } from "../../../types";

function parse(content: string): AstNode[] {
  return new CustomParser().parse(content);
}

function findVcpRoles(nodes: AstNode[]): VcpRoleNode[] {
  const roles: VcpRoleNode[] = [];

  for (const node of nodes) {
    if (node.type === "vcp_role") {
      roles.push(node);
    }

    if ("children" in node && Array.isArray(node.children)) {
      roles.push(...findVcpRoles(node.children));
    }
  }

  return roles;
}

function findToolSummaryRoles(nodes: AstNode[]): VcpRoleNode[] {
  return findVcpRoles(nodes).filter(
    (node) => node.props.variant === "tool_summary"
  );
}

function findToolResultCount(nodes: AstNode[]): number {
  let count = 0;

  for (const node of nodes) {
    if (node.type === "vcp_tool" && node.props.isResult) {
      count++;
    }

    if ("children" in node && Array.isArray(node.children)) {
      count += findToolResultCount(node.children);
    }
  }

  return count;
}

describe("parseVcpRole", () => {
  it("hides duplicate tool summary when a matching result exists in the same role fence", () => {
    const ast = parse(`
<<<[ROLE_DIVIDE_USER]>>>

[[VCP调用结果信息汇总:
- 工具名称: DailyNote
- 执行状态: ✅ SUCCESS
- 返回内容: 咕咕 的日记已保存到 VCP开发 文件夹
VCP调用结果结束]]

[本轮工具调用摘要:]
DailyNote 调用成功。
[本轮工具调用摘要结束]

<<<[END_ROLE_DIVIDE_USER]>>>
`);

    expect(findToolResultCount(ast)).toBe(1);
    expect(findToolSummaryRoles(ast)).toHaveLength(0);
  });

  it("keeps a standalone tool summary when no result detail is present", () => {
    const ast = parse(`
<<<[ROLE_DIVIDE_USER]>>>

[本轮工具调用摘要:]
DailyNote 调用成功。
[本轮工具调用摘要结束]

<<<[END_ROLE_DIVIDE_USER]>>>
`);

    const summaries = findToolSummaryRoles(ast);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].props.summaryItems).toEqual([
      {
        label: "DailyNote 调用成功",
        toolName: "DailyNote",
        status: "success",
        statusLabel: "成功",
      },
    ]);
  });

  it("keeps only summary items that are not covered by result details", () => {
    const ast = parse(`
<<<[ROLE_DIVIDE_USER]>>>

[[VCP调用结果信息汇总:
- 工具名称: DailyNote
- 执行状态: ✅ SUCCESS
- 返回内容: done
VCP调用结果结束]]

[本轮工具调用摘要:]
DailyNote 调用成功；ServerCodeSearcher 调用失败。
[本轮工具调用摘要结束]

<<<[END_ROLE_DIVIDE_USER]>>>
`);

    const summaries = findToolSummaryRoles(ast);
    expect(findToolResultCount(ast)).toBe(1);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].props.summaryItems).toEqual([
      {
        label: "ServerCodeSearcher 调用失败",
        toolName: "ServerCodeSearcher",
        status: "error",
        statusLabel: "失败",
      },
    ]);
  });
});
