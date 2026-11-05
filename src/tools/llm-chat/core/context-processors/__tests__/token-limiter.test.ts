// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { tokenLimiter } from "../token-limiter";
import type { PipelineContext } from "../../../types/pipeline";
import type { ProcessableMessage } from "../../../types/context";
import type { LlmReasoningArtifact } from "@/llm-apis/common";
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug() {}, info() {}, warn() {} }),
}));
vi.mock("@/tools/token-calculator/token-calculator.registry", () => ({
  tokenCalculatorService: {
    createScope: () => ({
      calculateMessageTokens: async (text: string) => ({ count: text.length }),
    }),
  },
}));
const artifact: LlmReasoningArtifact = {
  provider: "openai",
  kind: "response.output_item",
  replayPolicy: "always",
  payload: { id: "reasoning" },
};
const history = (
  id: string,
  content: string,
  replay = false
): ProcessableMessage => ({
  role: "user",
  content,
  sourceType: "session_history",
  sourceId: id,
  ...(replay ? { reasoningArtifacts: [artifact] } : {}),
});
const preset = (id: string, content: string): ProcessableMessage => ({
  role: "system",
  content,
  sourceType: "agent_preset",
  sourceId: id,
});
function context(
  messages: ProcessableMessage[],
  budget: number,
  retainedCharacters = 0
) {
  return {
    messages,
    agentConfig: {
      modelId: "model",
      parameters: {
        contextManagement: {
          enabled: true,
          maxContextTokens: budget,
          retainedCharacters,
        },
      },
    },
    sharedData: new Map(),
    logs: [],
  } as unknown as PipelineContext;
}
describe("token limiter selection", () => {
  it("优先保留预设与最新历史，保持交错顺序和节省量", async () => {
    const ctx = context(
      [
        history("old", "12345"),
        preset("p1", "p"),
        history("latest", "1234"),
        preset("p2", "q"),
      ],
      10
    );
    await tokenLimiter.execute(ctx);
    expect(ctx.messages.map((m) => m.sourceId)).toEqual(["p1", "latest", "p2"]);
    expect(ctx.sharedData.get("tokenLimiterStats")).toMatchObject({
      finalHistoryCount: 1,
      presetTokens: 2,
      historyTokens: 4,
      savedTokens: 5,
      savedChars: 5,
      originalTotalChars: 11,
    });
  });
  it("部分截断保留开头，清除回放状态并记录被删除的更早历史", async () => {
    const truncated = "xxx\n...(已截断)";
    const candidate = history("partial", "x".repeat(30), true);
    const ctx = context(
      [
        history("old", "older", true),
        candidate,
        preset("p", "p"),
        history("latest", "new"),
      ],
      4 + truncated.length,
      3
    );
    await tokenLimiter.execute(ctx);
    expect(ctx.messages.map((m) => m.sourceId)).toEqual([
      "partial",
      "p",
      "latest",
    ]);
    expect(ctx.messages[0]).toMatchObject({
      content: truncated,
      reasoningArtifactsDropped: true,
      metadata: { reasoningStateStatus: "broken" },
    });
    expect(ctx.messages[0].reasoningArtifacts).toBeUndefined();
    expect(candidate.reasoningArtifacts).toEqual([artifact]);
    expect(
      (
        ctx.sharedData.get("reasoningArtifactsDropped") as Array<{
          sourceId: string;
        }>
      )
        .map((r) => r.sourceId)
        .sort()
    ).toEqual(["old", "partial"]);
    expect(ctx.sharedData.get("tokenLimiterStats")).toMatchObject({
      finalHistoryCount: 2,
      truncatedCount: 2,
      totalTokens: 4 + truncated.length,
    });
  });
  it("预设耗尽预算时保留预设并记录历史回放丢弃", async () => {
    const p = preset("p", "long");
    const ctx = context([history("old", "xx", true), p], 2);
    await tokenLimiter.execute(ctx);
    expect(ctx.messages).toEqual([p]);
    expect(ctx.messages[0]).toBe(p);
    expect(ctx.sharedData.get("reasoningArtifactsDropped")).toEqual([
      expect.objectContaining({ sourceId: "old", artifactCount: 1 }),
    ]);
  });
});
