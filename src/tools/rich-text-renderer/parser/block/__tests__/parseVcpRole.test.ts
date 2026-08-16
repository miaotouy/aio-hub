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
import type { AstNode, VcpRoleNode, VcpToolNode } from "../../../types";

function parse(content: string, vcpFuzzyModeEnabled = true): AstNode[] {
  return new CustomParser(
    new Set(["think"]),
    [],
    false,
    vcpFuzzyModeEnabled
  ).parse(content);
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

function findToolRequests(nodes: AstNode[]): VcpToolNode[] {
  const requests: VcpToolNode[] = [];

  for (const node of nodes) {
    if (node.type === "vcp_tool" && !node.props.isResult) {
      requests.push(node as VcpToolNode);
    }

    if ("children" in node && Array.isArray(node.children)) {
      requests.push(...findToolRequests(node.children));
    }
  }

  return requests;
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

  it("does not merge a malformed request block with the following valid request", () => {
    const ast = parse(`
<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command:「始」echo「末」,
message:「始」broken block has no end
<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command:「始」echo「末」,
message:「始」valid-after-bad「末」
<<<[END_TOOL_REQUEST]>>>
`);

    const requests = findToolRequests(ast);

    expect(requests).toHaveLength(1);
    expect(requests[0].props.args.message).toBe("valid-after-bad");
    expect(requests[0].props.raw).not.toContain("broken block has no end");
  });

  it("keeps standard request markers nested in a complete escape block", () => {
    const ast = parse(`
<<<[TOOL_REQUEST_ESCAPE]>>>
tool_name:「始」mock-sync「末」,
command:「始」echo「末」,
message:「始ESCAPE」示例：
<<<[TOOL_REQUEST]>>>
tool_name:「始」nested「末」
<<<[END_TOOL_REQUEST]>>>
「末ESCAPE」
<<<[END_TOOL_REQUEST_ESCAPE]>>>
`);

    const requests = findToolRequests(ast);

    expect(requests).toHaveLength(1);
    expect(requests[0].props.args.message).toContain("<<<[TOOL_REQUEST]>>>");
  });

  it("parses ESCAPE args with optional whitespace after the colon", () => {
    const ast = parse(`
<<<[TOOL_REQUEST]>>>
tool_name: 「始」mock-sync「末」,
command: 「始」echo「末」,
message: 「始ESCAPE」含「始」「末」的内容「末ESCAPE」
<<<[END_TOOL_REQUEST]>>>
`);

    const requests = findToolRequests(ast);

    expect(requests).toHaveLength(1);
    expect(requests[0].props.tool_name).toBe("mock-sync");
    expect(requests[0].props.command).toBe("echo");
    expect(requests[0].props.args.message).toBe("含「始」「末」的内容");
  });

  it("does not split a block when nested request markers sit inside an ESCAPE fence", () => {
    const ast = parse(`
<<<[TOOL_REQUEST]>>>
tool_name:「始」FileOperator「末」,
path:「始ESCAPE」<<<[TOOL_REQUEST]>>>tool_name:「始」inner「末」<<<[END_TOOL_REQUEST]>>>「末ESCAPE」
<<<[END_TOOL_REQUEST]>>>
`);

    const requests = findToolRequests(ast);

    expect(requests).toHaveLength(1);
    expect(requests[0].props.tool_name).toBe("FileOperator");
    expect(requests[0].props.args.path).toContain("<<<[TOOL_REQUEST]>>>");
    expect(requests[0].props.args.path).toContain("<<<[END_TOOL_REQUEST]>>>");
  });

  it("does not split a block when nested escape markers sit inside an ESCAPE fence", () => {
    const ast = parse(`
<<<[TOOL_REQUEST]>>>
tool_name:「始」FileOperator「末」,
content:「始ESCAPE」{"desc": "<<<[TOOL_REQUEST_ESCAPE]>>>tool_name:「始」inner「末」<<<[END_TOOL_REQUEST_ESCAPE]>>>"}「末ESCAPE」
<<<[END_TOOL_REQUEST]>>>
`);

    const requests = findToolRequests(ast);

    expect(requests).toHaveLength(1);
    expect(requests[0].props.tool_name).toBe("FileOperator");
    expect(requests[0].props.args.content).toContain(
      "<<<[TOOL_REQUEST_ESCAPE]>>>"
    );
    expect(requests[0].props.args.content).toContain(
      "<<<[END_TOOL_REQUEST_ESCAPE]>>>"
    );
  });

  it("repairs an ESCAPE field closed by a standard end marker for rendering only", () => {
    const ast = parse(`
<<<[TOOL_REQUEST]>>>
tool_name:「始」DailyNote「末」,
command:「始」create「末」,
Content:「始ESCAPE」正文包含普通围栏示例：参数:「始」值「末」
Tag: VCP开发「末」,
Tag:「始」VCP开发「末」
<<<[END_TOOL_REQUEST]>>>

后续正文不应被工具节点吞掉。
`);

    const requests = findToolRequests(ast);

    expect(requests).toHaveLength(1);
    expect(requests[0].props.closed).toBe(true);
    expect(requests[0].props.args.Content).toContain("参数:「始」值「末」");
    expect(requests[0].props.args.Content).toContain("Tag: VCP开发");
    expect(requests[0].props.args.Tag).toBe("VCP开发");
    expect(requests[0].props.fenceError).toContain(
      "「始ESCAPE」使用了普通「末」闭合"
    );
    expect(
      ast.some(
        (node) =>
          node.type === "paragraph" &&
          JSON.stringify(node).includes("后续正文不应被工具节点吞掉")
      )
    ).toBe(true);
  });

  it("keeps malformed ESCAPE fences unclosed when fuzzy mode is disabled", () => {
    const ast = parse(
      `
<<<[TOOL_REQUEST]>>>
tool_name:「始」DailyNote「末」,
command:「始」create「末」,
Content:「始ESCAPE」正文「末」
<<<[END_TOOL_REQUEST]>>>

后续正文
`,
      false
    );

    const requests = findToolRequests(ast);

    expect(requests).toHaveLength(1);
    expect(requests[0].props.closed).toBe(false);
    expect(requests[0].props.fenceError).toBeUndefined();
    expect(requests[0].props.raw).toContain("后续正文");
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
