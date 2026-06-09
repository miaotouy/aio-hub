import { describe, expect, it } from "vitest";
import { extractReasoningFromSSE, extractTextFromSSE } from "../sse-parser";

describe("sse-parser", () => {
  it("extracts Cohere v2 content-delta text without requiring content.type", () => {
    const data = JSON.stringify({
      type: "content-delta",
      index: 0,
      delta: {
        message: {
          content: {
            text: "LL",
          },
        },
      },
    });

    expect(extractTextFromSSE(data, "cohere")).toBe("LL");
  });

  it("extracts Cohere v2 thinking deltas when present", () => {
    const data = JSON.stringify({
      type: "content-delta",
      index: 0,
      delta: {
        message: {
          content: {
            thinking: "reasoning",
          },
        },
      },
    });

    expect(extractReasoningFromSSE(data, "cohere")).toBe("reasoning");
  });
});
