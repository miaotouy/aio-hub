import { describe, expect, it } from "vitest";
import {
  findVcpToolBatch,
  findVcpRoleEnd,
  transformVcpTextOutsideBatches,
} from "../vcpToolBatch";
import { CustomParser } from "@/tools/rich-text-renderer/core/CustomParser";
import { VcpToolCallingProtocol } from "@/tools/tool-calling/core/protocols/vcp-protocol";
import type { AstNode, VcpRoleNode } from "@/tools/rich-text-renderer/types";

const stamp = "2026-10-30T11:16:59.391+08:00";
const start = (time = stamp) => `<<<[VCP_TOOL_BATCH_START:${time}]>>>`;
const end = (time = stamp) => `<<<[VCP_TOOL_BATCH_END:${time}]>>>`;
const request = (name: string) =>
  `<<<[TOOL_REQUEST]>>>\ntool_name:「始」${name}「末」\ncommand:「始」read「末」\n<<<[END_TOOL_REQUEST]>>>`;
const batches = (nodes: AstNode[]): VcpRoleNode[] =>
  nodes.flatMap((node) => [
    ...(node.type === "vcp_role" && node.props.variant === "tool_batch"
      ? [node]
      : []),
    ...batches(node.children ?? []),
  ]);

describe("VCP tool-result batch isolation", () => {
  it.each([stamp, "2026-10-30T03:16:59.391Z", "2026-10-29T22:16:59.391-05:00"])(
    "matches the original timestamp %s",
    (time) => {
      const text = `${start(time)}\nresult\n${end(time)}`;
      const batch = findVcpToolBatch(text)!;
      expect(batch.closed).toBe(true);
      expect(text.slice(batch.contentStart, batch.contentEnd)).toBe(
        "\nresult\n"
      );
      expect(batch.end).toBe(text.length);
    }
  );

  it("keeps nested protocol, Markdown and HTML literal until the exact end", () => {
    const body = `\n<<<[END_ROLE_DIVIDE_USER]>>>\n${request("quoted")}\n<script>unsafe</script>\n\`\`\`html\n${start("2026-10-30T00:00:00.000Z")}\n${end("2026-10-30T03:16:59.391Z")}\n[[VCP调用结果信息汇总:残缺结果\n`;
    const text = `<<<[ROLE_DIVIDE_USER]>>>\n${start()}${body}${end()}\n<<<[END_ROLE_DIVIDE_USER]>>>\n\n## 后续回复`;
    const nodes = new CustomParser().parse(text);
    expect(batches(nodes)).toHaveLength(1);
    expect(batches(nodes)[0]).toMatchObject({
      props: { batchContent: body, closed: true },
      children: [],
    });
    expect(nodes.some((node) => node.type === "heading")).toBe(true);
    expect(
      findVcpRoleEnd(
        text,
        "<<<[END_ROLE_DIVIDE_USER]>>>",
        text.indexOf(start())
      )
    ).toBe(text.lastIndexOf("<<<[END_ROLE_DIVIDE_USER]>>>"));
  });

  it("keeps a truncated batch isolated even after a wrong timestamp or outer close", () => {
    const body = `\n${end("2026-10-30T03:16:59.391Z")}\n<<<[END_ROLE_DIVIDE_USER]>>>\n${request("quoted")}\n# still a result`;
    const nodes = new CustomParser().parse(`${start()}${body}`);
    expect(batches(nodes)[0]).toMatchObject({
      props: { batchContent: body, closed: false },
      children: [],
      meta: { status: "pending" },
    });
    expect(
      new VcpToolCallingProtocol().parseToolRequests(`${start()}${body}`)
    ).toEqual([]);
  });

  it("resumes execution parsing only after a complete batch", () => {
    const text = `${request("before")}\n${start()}\n${request("quoted")}\n${end()}\n${request("after")}`;
    const calls = new VcpToolCallingProtocol().parseToolRequests(text);
    expect(calls.map((call) => call.toolId)).toEqual(["before", "after"]);
  });

  it.each(["", "ESCAPE"])(
    "preserves a request whose %s parameter quotes a batch delimiter",
    (escape) => {
      const content = `Batch example: \`${start()}\` needs support.\nRemaining note.`;
      const text = `<<<[TOOL_REQUEST]>>>\ntool_name:「始」DailyNote「末」,\nContent:「始${escape}」${content}「末${escape}」\n<<<[END_TOOL_REQUEST]>>>`;
      const nodes = new CustomParser().parse(text);
      const tool = nodes.find((node) => node.type === "vcp_tool");
      expect(tool).toMatchObject({
        props: {
          tool_name: "DailyNote",
          closed: true,
          args: { Content: content },
        },
      });
      expect(batches(nodes)).toEqual([]);
      const calls = new VcpToolCallingProtocol().parseToolRequests(text);
      expect(calls).toHaveLength(1);
      expect(calls[0].args.Content).toBe(content);
      expect(findVcpToolBatch(text)).toBeUndefined();
    }
  );

  it.each(["`", "``"])(
    "keeps a %s inline code example separate from the following real batch",
    (open) => {
      const example = `${open}${start()} quoted ${end()}${open}`;
      const text = `${example}\n${start()}real${end()}`;
      const nodes = new CustomParser().parse(text);
      expect(batches(nodes).map((node) => node.props.batchContent)).toEqual([
        "real",
      ]);
      expect(findVcpToolBatch(text)?.start).toBe(example.length + 1);
    }
  );

  it("resumes batch isolation after a request containing a literal delimiter", () => {
    const note = `<<<[TOOL_REQUEST]>>>\ntool_name:「始」DailyNote「末」\nContent:「始」${start()}\nplain example「末」\n<<<[END_TOOL_REQUEST]>>>`;
    const text = `${note}\n${start()}${request("quoted")}${end()}\n${request("after")}`;
    expect(
      new VcpToolCallingProtocol()
        .parseToolRequests(text)
        .map((call) => call.toolId)
    ).toEqual(["DailyNote", "after"]);
    expect(batches(new CustomParser().parse(text))[0]?.props.closed).toBe(true);
  });

  it("keeps a real batch visible after literal escape aliases", () => {
    const text = `<<<[TOOL_REQUEST_ESCAPE]>>>\nexample\n${start()}result${end()}`;
    expect(batches(new CustomParser().parse(text))[0]?.props).toMatchObject({
      batchContent: "result",
      closed: true,
    });
  });

  it("recognizes framing before an unclosed Markdown fence", () => {
    const nodes = new CustomParser().parse(
      `\`\`\`text\nexample\n${start()}\nresult\n${end()}`
    );
    expect(batches(nodes)[0]?.props).toMatchObject({
      batchContent: "\nresult\n",
      closed: true,
    });
  });
  it("isolates a server batch containing the close of an earlier Markdown fence", () => {
    const body = `\nresult\n\`\`\`\n${request("quoted")}\n`;
    const text = `\`\`\`text\nunfinished example\n${start()}${body}${end()}`;
    expect(batches(new CustomParser().parse(text))[0]?.props.batchContent).toBe(
      body
    );
    expect(new VcpToolCallingProtocol().parseToolRequests(text)).toEqual([]);
  });

  it("keeps consecutive and summary-only batches separate", () => {
    const next = "2026-10-30T11:17:00.000+08:00";
    const summary = "[本轮工具调用摘要:]Read 调用成功。[本轮工具调用摘要结束]";
    const nodes = new CustomParser().parse(
      `${start()}${summary}${end()}\n${start(next)}result${end(next)}\n\n## after`
    );
    expect(batches(nodes).map((node) => node.props.batchContent)).toEqual([
      summary,
      "result",
    ]);
    expect(nodes.some((node) => node.type === "heading")).toBe(true);
  });

  it("holds a partially received end delimiter without changing stored raw content", () => {
    const marker = end();
    for (let length = 4; length < marker.length; length++) {
      const text = `${start()}result${marker.slice(0, length)}`;
      const batch = findVcpToolBatch(text)!;
      expect(text.slice(batch.contentStart, batch.contentEnd)).toBe("result");
      expect(text.slice(batch.start, batch.end)).toBe(text);
      expect(batch.closed).toBe(false);
    }
  });
  it("preserves batch bytes while presentation transforms run on surrounding text", () => {
    const batch = `${start()}\r\n<!DOCTYPE html><html>raw</html>\r\n${end()}`;
    const transform = (text: string) =>
      text.replace(/raw/g, "changed").replace(/\r\n/g, "\n");
    expect(
      transformVcpTextOutsideBatches(`raw\r\n${batch}\r\nraw`, transform)
    ).toBe(`changed\n${batch}\nchanged`);
    expect(
      transformVcpTextOutsideBatches(`raw\n${start()}raw\r\n`, transform)
    ).toBe(`changed\n${start()}raw\r\n`);
  });
});
