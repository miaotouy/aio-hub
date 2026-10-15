import { describe, expect, it } from "vitest";
import {
  OpenAiCompatibleStreamDecoder,
  type LlmResponseChunk,
} from "@aiohub/llm-core";
import { VcpStreamSegmenter } from "../vcp-stream-segmenter";

const usage = (promptTokens: number, completionTokens: number) => ({
  promptTokens,
  completionTokens,
  totalTokens: promptTokens + completionTokens,
});
const delta = (responseId: string, content: string): LlmResponseChunk => ({
  responseId,
  content,
});

describe("VCP response segmentation", () => {
  it("preserves turn order and per-turn usage through a byte-split SSE agent response", () => {
    const upstream = (
      id: string,
      content: string,
      prompt: number,
      completion: number
    ) => [
      { id, choices: [{ delta: { content }, finish_reason: null }] },
      { id, choices: [{ delta: {}, finish_reason: "stop" }] },
      {
        id,
        choices: [],
        usage: {
          prompt_tokens: prompt,
          completion_tokens: completion,
          total_tokens: prompt + completion,
        },
      },
    ];
    const frames = [
      ...upstream(
        "first",
        "先查询<<<[TOOL_REQUEST]>>>请求<<<[END_TOOL_REQUEST]>>>",
        10,
        3
      ),
      {
        id: "chatcmpl-vcp-start-1",
        choices: [{ delta: { content: "\n<<<[ROLE_DIVIDE_USER]>>>\n" } }],
      },
      {
        id: "chatcmpl-vcp-2",
        choices: [
          {
            delta: { content: "[[VCP调用结果信息汇总:结果 VCP调用结果结束]]" },
          },
        ],
      },
      {
        id: "chatcmpl-vcp-summary-3",
        choices: [
          {
            delta: {
              content:
                "[本轮工具调用摘要:]Search 调用成功。[本轮工具调用摘要结束]",
            },
          },
        ],
      },
      {
        id: "chatcmpl-vcp-end-4",
        choices: [{ delta: { content: "\n<<<[END_ROLE_DIVIDE_USER]>>>\n" } }],
      },
      {
        id: "chatcmpl-VCP-separator-5",
        choices: [{ delta: { content: "\n" } }],
      },
      ...upstream("second", "最终回答", 20, 4),
      {
        id: "chatcmpl-VCP-final-stop-6",
        choices: [{ delta: {}, finish_reason: "stop" }],
      },
    ];
    const wire =
      frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") +
      "data: [DONE]\n\n";
    const decoder = new OpenAiCompatibleStreamDecoder(true);
    const segmenter = new VcpStreamSegmenter();
    let completions = 0;
    for (const byte of new TextEncoder().encode(wire)) {
      for (const event of decoder.push(new Uint8Array([byte]))) {
        if (event.type === "response-chunk") segmenter.push(event.chunk);
        if (event.type === "completed") completions++;
      }
    }
    expect(segmenter.segments.map((segment) => segment.kind)).toEqual([
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(segmenter.segments[0]).toMatchObject({
      content: "先查询<<<[TOOL_REQUEST]>>>请求<<<[END_TOOL_REQUEST]>>>",
      usage: usage(10, 3),
      finishReason: "stop",
    });
    expect(segmenter.segments[1]).toMatchObject({
      content:
        "[[VCP调用结果信息汇总:结果 VCP调用结果结束]]" +
        "[本轮工具调用摘要:]Search 调用成功。[本轮工具调用摘要结束]",
      toolStatus: "success",
    });
    expect(segmenter.segments[2]).toMatchObject({
      content: "最终回答",
      usage: usage(20, 4),
      finishReason: "stop",
    });
    expect(completions).toBe(1);
  });

  it("splits repeated upstream IDs without usage and keeps reasoning on its own turn", () => {
    const segmenter = new VcpStreamSegmenter();
    segmenter.push({ responseId: "same", reasoningContent: "分析" });
    segmenter.push(delta("same", "请求"));
    segmenter.push({ responseId: "same", finishReason: "stop" });
    segmenter.push(delta("chatcmpl-VCP-reasoning-close-1", "</think>"));
    segmenter.push(
      delta(
        "chatcmpl-vcp-summary-2",
        "[本轮工具调用摘要:]Search 调用超时。[本轮工具调用摘要结束]"
      )
    );
    segmenter.push(delta("same", "重试建议"));
    segmenter.push({ responseId: "same", finishReason: "stop" });
    expect(
      segmenter.segments.map((segment) => [
        segment.kind,
        segment.content,
        segment.reasoningContent,
      ])
    ).toEqual([
      ["assistant", "请求</think>", "分析"],
      [
        "tool",
        "[本轮工具调用摘要:]Search 调用超时。[本轮工具调用摘要结束]",
        "",
      ],
      ["assistant", "重试建议", ""],
    ]);
    expect(segmenter.segments[1]).toMatchObject({
      toolStatus: "error",
      toolCalls: [{ toolName: "Search", status: "error" }],
    });
  });

  it("keeps marker examples inside model output and retains timeout notifications", () => {
    const segmenter = new VcpStreamSegmenter();
    const example =
      "示例：<<<[ROLE_DIVIDE_USER]>>>工具示例<<<[END_ROLE_DIVIDE_USER]>>>";
    segmenter.push(delta("upstream", example));
    segmenter.push({
      responseId: "chatcmpl-VCP-stall-1",
      content: "[上游响应超时，流已中断]",
      finishReason: "stop",
    });
    expect(segmenter.segments).toHaveLength(1);
    expect(segmenter.segments[0].content).toBe(
      example + "[上游响应超时，流已中断]"
    );
  });

  it("uses server tool chunks as a fallback when upstream omits finish reasons", () => {
    const segmenter = new VcpStreamSegmenter();
    segmenter.push(delta("first", "工具请求"));
    segmenter.push(delta("chatcmpl-vcp-summary-1", "工具已执行"));
    segmenter.push(delta("chatcmpl-VCP-separator-2", "\n"));
    segmenter.push(delta("second", "结果"));
    segmenter.push({ responseId: "second", usage: usage(8, 2) });
    expect(segmenter.segments.map((segment) => segment.content)).toEqual([
      "工具请求",
      "工具已执行",
      "结果",
    ]);
    expect(segmenter.segments[2].usage).toEqual(usage(8, 2));
  });
  it("maps named parallel tool outcomes even when summaries include record IDs", () => {
    const segmenter = new VcpStreamSegmenter();
    segmenter.push(
      delta(
        "chatcmpl-vcp-summary-1",
        "[本轮工具调用摘要:]Read 调用成功 (记录ID: abc)；Write 调用拒绝 (记录ID: def)。[本轮工具调用摘要结束]"
      )
    );
    expect(segmenter.segments[0]).toMatchObject({
      kind: "tool",
      toolStatus: "error",
      toolCalls: [
        { toolName: "Read", status: "success" },
        { toolName: "Write", status: "denied" },
      ],
    });
  });
});
