import { describe, expect, it } from "vitest";
import type { ProcessableMessage } from "@/tools/llm-chat/types";
import { limitHistoryByTokens } from "../token-limiter";

const preset: ProcessableMessage = {
  role: "system",
  content: "preset",
  sourceType: "agent_preset",
};
const history: ProcessableMessage[] = [
  { role: "user", content: "oldest history", sourceType: "session_history" },
  { role: "assistant", content: "middle history", sourceType: "session_history" },
  { role: "user", content: "newest history", sourceType: "session_history" },
];

describe("tokenLimiter", () => {
  it("drops all history when fixed messages exhaust the budget", () => {
    const result = limitHistoryByTokens([preset, ...history], [10, 2, 2, 2], 10);
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
    const result = limitHistoryByTokens([preset, history[0]], [1, 10], 10, 3);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1].content).toBe("old\n...(已截断)");
    expect(result.stats.truncatedCount).toBe(1);
  });
});