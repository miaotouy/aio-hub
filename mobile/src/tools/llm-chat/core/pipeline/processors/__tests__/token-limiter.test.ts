import { describe, expect, it, vi } from "vitest";
import type {
  PipelineContext,
  ProcessableMessage,
} from "@/tools/llm-chat/types";

const tokenCounting = vi.hoisted(() => ({
  countTokensBatch: vi.fn(),
}));

vi.mock("@/utils/tokenCounting", () => tokenCounting);

import { limitHistoryByTokens, tokenLimiter } from "../token-limiter";

const preset: ProcessableMessage = {
  role: "system",
  content: "preset",
  sourceType: "agent_preset",
};
const history: ProcessableMessage[] = [
  { role: "user", content: "oldest history", sourceType: "session_history" },
  {
    role: "assistant",
    content: "middle history",
    sourceType: "session_history",
  },
  { role: "user", content: "newest history", sourceType: "session_history" },
];

describe("tokenLimiter", () => {
  it("drops all history when fixed messages exhaust the budget", () => {
    const result = limitHistoryByTokens(
      [preset, ...history],
      [10, 2, 2, 2],
      10
    );
    expect(result.messages).toEqual([preset]);
    expect(result.stats.finalHistoryCount).toBe(0);
    expect(result.stats.savedTokens).toBe(6);
  });

  it("retains the newest messages while keeping original message order", () => {
    const result = limitHistoryByTokens([preset, ...history], [2, 3, 3, 3], 8);
    expect(result.messages.map((message) => message.content)).toEqual([
      "preset",
      "middle history",
      "newest history",
    ]);
    expect(result.stats.savedTokens).toBe(3);
  });

  it("keeps a partial string message when the retained-character fallback fits", () => {
    const result = limitHistoryByTokens([preset, history[0]], [1, 10], 10, 3, [
      undefined,
      8,
    ]);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1].content).toBe("old\n...(已截断)");
    expect(result.stats.truncatedCount).toBe(1);
    expect(result.stats.totalTokens).toBe(9);
  });

  it("does not use a character-ratio estimate without an exact partial count", () => {
    const result = limitHistoryByTokens([preset, history[0]], [1, 10], 10, 3);
    expect(result.messages).toEqual([preset]);
    expect(result.stats.truncatedCount).toBe(0);
  });

  it("reports degraded details when fixed messages exceed the token budget", async () => {
    tokenCounting.countTokensBatch.mockResolvedValueOnce({
      counts: [12, 2, 2, 2],
      total: 18,
      tokenizer: "test",
      estimated: false,
      fallback: false,
    });
    const pipelineContext: PipelineContext = {
      messages: [structuredClone(preset), ...structuredClone(history)],
      session: {} as PipelineContext["session"],
      agentConfig: {
        parameters: {
          contextManagement: {
            enabled: true,
            maxContextTokens: 10,
          },
        },
      } as PipelineContext["agentConfig"],
      settings: {} as PipelineContext["settings"],
      timestamp: 0,
      sharedData: new Map(),
      logs: [],
    };

    const result = await tokenLimiter.execute(pipelineContext);

    expect(pipelineContext.messages).toEqual([preset]);
    expect(result).toEqual(
      expect.objectContaining({
        status: "degraded",
        message: expect.stringContaining("历史消息已全部删除"),
        details: expect.objectContaining({
          presetTokens: 12,
          maxContextTokens: 10,
          overflowTokens: 2,
          historyFullyRemoved: true,
        }),
      })
    );
  });

  it("reports a safe degradation when native token counting uses the character fallback", async () => {
    tokenCounting.countTokensBatch.mockResolvedValueOnce({
      counts: [4],
      total: 4,
      tokenizer: "character_fallback",
      estimated: true,
      fallback: true,
    });
    const pipelineContext: PipelineContext = {
      messages: [structuredClone(history[0])],
      session: {} as PipelineContext["session"],
      agentConfig: {
        parameters: {
          contextManagement: {
            enabled: true,
            maxContextTokens: 100,
          },
        },
      } as PipelineContext["agentConfig"],
      settings: {} as PipelineContext["settings"],
      timestamp: 0,
      sharedData: new Map(),
      logs: [],
    };

    const result = await tokenLimiter.execute(pipelineContext);

    expect(result).toEqual(
      expect.objectContaining({
        status: "degraded",
        message: expect.stringContaining("字符估算"),
      })
    );
  });
});
