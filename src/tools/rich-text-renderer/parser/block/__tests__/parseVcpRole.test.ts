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
import { VcpToolCallingProtocol } from "@/tools/tool-calling/core/protocols/vcp-protocol";
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
  it.each([
    { tag: "think", escaped: false, fuzzy: true },
    { tag: "guguthink", escaped: false, fuzzy: false },
    { tag: "guguthink", escaped: true, fuzzy: true },
  ])(
    "renders a request directly after </$tag> (escaped: $escaped)",
    ({ tag, escaped, fuzzy }) => {
      const marker = escaped ? "TOOL_REQUEST_ESCAPE" : "TOOL_REQUEST";
      const request = `<<<[${marker}]>>>
maid:「始」咕咕「末」,
JEV:「始」请使用 {联网搜索}，搜索 Mercury 3 benchmark。「末」
<<<[END_${marker}]>>>`;
      const parser = new CustomParser(new Set([tag]), [], false, fuzzy);
      const ast = parser.parse(`<${tag}>思考内容</${tag}>${request}`);
      const requests = findToolRequests(ast);

      expect(ast[0].type).toBe("llm_think");
      expect(requests).toHaveLength(1);
      expect(requests[0].props).toMatchObject({
        tool_name: "JEV",
        maid: "咕咕",
        closed: true,
        raw: request,
        args: { JEV: "请使用 {联网搜索}，搜索 Mercury 3 benchmark。" },
      });
    }
  );

  it("preserves tool request examples in inline and fenced code after thinking", () => {
    const marker = "<<<[TOOL_REQUEST]>>>";
    const request = `${marker}
JEV:「始」搜索「末」
<<<[END_TOOL_REQUEST]>>>`;
    const fence = "```";
    const ast = parse(`<think>思考</think>\`${marker}\`

${fence}text
${request}
${fence}`);
    const codeBlock = ast.find((node) => node.type === "code_block");

    expect(codeBlock?.props).toMatchObject({ content: request, closed: true });
    const paragraph = ast.find((node) => node.type === "paragraph");
    expect(paragraph?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "inline_code",
          props: { content: marker },
        }),
      ])
    );
    expect(findToolRequests(ast)).toHaveLength(0);
  });

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

  describe("malformed request display recovery", () => {
    const fields = "maid:「始」咕咕「末」,\nJEV:「始」搜索证书事件「末」";
    const validRequest = `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
message:「始」valid-after-bad「末」
<<<[END_TOOL_REQUEST]>>>`;

    it.each([
      "",
      "<<<[END_TOOL_REQUEST]",
      "<<<[END_",
      "<<<[END_TOOL_REQUEST]>>",
    ])(
      "recovers following thinking and a later request after a broken end %j",
      (ending) => {
        const broken = `<<<[TOOL_REQUEST]>>>\n${fields}\n${ending}`;
        const thinking = "<guguthink>继续**分析**</guguthink>";
        const ast = new CustomParser(new Set(["guguthink"])).parse(
          `${broken}${thinking}\n\n${validRequest}`
        );
        const requests = findToolRequests(ast);
        expect(requests).toHaveLength(2);
        expect(requests[0].props).toMatchObject({
          tool_name: "JEV",
          args: { JEV: "搜索证书事件" },
          raw: broken,
          closed: true,
        });
        expect(requests[0].props.fenceError).toBeTruthy();
        const thoughts = ast.filter((node) => node.type === "llm_think");
        expect(thoughts).toHaveLength(1);
        expect(thoughts[0].props.rawContent).toBe("继续**分析**");
        expect(thoughts[0].props.isThinking).toBe(false);
        expect(requests[1].props.args.message).toBe("valid-after-bad");
      }
    );

    it("keeps display recovery separate from executable requests", () => {
      const body = `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command:「始」echo「末」,
message:「始」example「末」`;
      const protocol = new VcpToolCallingProtocol();
      expect(
        protocol.parseToolRequests(`${body}\n<<<[END_TOOL_REQUEST]>>>`)
      ).toHaveLength(1);
      const malformed = `${body}\n<<<[END_TOOL_REQUEST]<think>后续思考</think>`;
      expect(
        findToolRequests(parse(malformed))[0].props.fenceError
      ).toBeTruthy();
      expect(protocol.parseToolRequests(malformed)).toHaveLength(0);
    });
    it("releases Markdown after a truncated end marker", () => {
      const broken = `<<<[TOOL_REQUEST]>>>\n${fields}\n<<<[END_TOOL_REQUEST]`;
      const ast = parse(`${broken}\n\n后续**正文**`);
      const requests = findToolRequests(ast);
      expect(requests).toHaveLength(1);
      expect(requests[0].props.raw).toBe(broken);
      expect(ast[1].type).toBe("paragraph");
      expect(ast[1].children?.some((node) => node.type === "strong")).toBe(
        true
      );
    });

    it("isolates a complete request interrupted by a new request marker", () => {
      const broken = `<<<[TOOL_REQUEST]>>>\n${fields}\n\n`;
      const requests = findToolRequests(parse(broken + validRequest));
      expect(requests).toHaveLength(2);
      expect(requests[0].props.raw).toBe(broken);
      expect(requests[0].props.fenceError).toBeTruthy();
      expect(requests[1].props.args.message).toBe("valid-after-bad");
    });

    it.each(["", "ESCAPE", "exp"])(
      "preserves thinking tags and broken-marker examples in %j parameter values",
      (variant) => {
        const value =
          "示例 <think>参数里的思考</think>\n<<<[END_TOOL_REQUEST]\n仍在参数内";
        const content = `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
message:「始${variant}」${value}「末${variant}」
<<<[END_TOOL_REQUEST]>>>`;
        const ast = parse(content);
        const requests = findToolRequests(ast);
        expect(ast).toHaveLength(1);
        expect(requests[0].props.args.message).toBe(value);
        expect(requests[0].props.raw).toBe(content);
        expect(requests[0].props.fenceError).toBeUndefined();
      }
    );

    it("recovers an ESCAPE request while retaining nested protocol examples", () => {
      const nested = `<<<[TOOL_REQUEST]>>>tool_name:「始」inner「末」<<<[END_TOOL_REQUEST]>>>`;
      const broken = `<<<[TOOL_REQUEST_ESCAPE]>>>
tool_name:「始」mock-sync「末」,
message:「始ESCAPE」${nested}「末ESCAPE」
<<<[END_TOOL_REQUEST_ESCAPE]`;
      const ast = parse(`${broken}<think>后续思考</think>`);
      const requests = findToolRequests(ast);
      expect(requests).toHaveLength(1);
      expect(requests[0].props.args.message).toBe(nested);
      expect(requests[0].props.raw).toBe(broken);
      expect(requests[0].props.fenceError).toBeTruthy();
      expect(ast[1].type).toBe("llm_think");
    });
    it("waits for incomplete streamed end markers before deciding recovery", () => {
      const body = `<<<[TOOL_REQUEST]>>>\n${fields}\n`;
      const ending = "<<<[END_TOOL_REQUEST]>>>";
      for (let length = 0; length <= ending.length; length++) {
        const content = body + ending.slice(0, length);
        const [request] = findToolRequests(parse(content));
        expect(request.props.raw).toBe(content);
        expect(request.props.closed).toBe(length === ending.length);
        expect(request.props.fenceError).toBeUndefined();
      }
    });

    it("keeps strict display behavior when fuzzy mode is disabled", () => {
      const content = `<<<[TOOL_REQUEST]>>>\n${fields}\n<<<[END_TOOL_REQUEST]<think>后续思考</think>`;
      const ast = parse(content, false);
      const [request] = findToolRequests(ast);
      expect(ast).toHaveLength(1);
      expect(request.props.raw).toBe(content);
      expect(request.props.closed).toBe(false);
      expect(request.props.fenceError).toBeUndefined();
    });
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

  it("keeps Markdown code fences inside a standard Content field", () => {
    const codeFence = "```";
    const ast = parse(`
<<<[TOOL_REQUEST]>>>
tool_name:「始」DailyNote「末」,
command:「始」create「末」,
Content:「始」### 标题

${codeFence}text
JEV:「始」{意图类别} '子路由' 【核心Query/Payload】[参数约束1][参数约束2]「末」
Tag:
架构思辨, JSON去魅, 符号DSL
${codeFence}
<<<[END_TOOL_REQUEST]>>>
`);

    const requests = findToolRequests(ast);

    expect(requests).toHaveLength(1);
    expect(requests[0].props.args.Content).toContain("JEV:「始」{意图类别}");
    expect(requests[0].props.args.Content).toContain("Tag:");
    expect(requests[0].props.args.Content).toContain("JSON去魅, 符号DSL");
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

  it("recognizes a JEV natural-language request by its prefix without parsing the instruction", () => {
    const ast = parse(`
<<<[TOOL_REQUEST]>>>
maid:「始」咕咕「末」,
JEV:「始」请使用 {联网搜索} 中的 \`B站搜索\`，搜索【明日方舟 结城理 联动】，并[搜视频]。「末」
<<<[END_TOOL_REQUEST]>>>
<<<[TOOL_REQUEST]>>>
maid:「始」咕咕「末」,
JEV:「始」请使用 {联网搜索}，围绕【明日方舟 焰狐龙梓兰 怪猎联动 干员】进行搜索。「末」
<<<[END_TOOL_REQUEST]>>>
`);

    const requests = findToolRequests(ast);

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.props.tool_name).toBe("JEV");
      expect(request.props.maid).toBe("咕咕");
      expect(request.props.args.JEV).toContain("请使用 {联网搜索}");
      expect(request.props.closed).toBe(true);
    }
    expect(requests[0].props.args.JEV).toContain("B站搜索");
    expect(requests[1].props.args.JEV).toContain("焰狐龙梓兰");
  });
});
