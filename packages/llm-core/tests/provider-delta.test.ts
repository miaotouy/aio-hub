import { describe, expect, it } from "vitest";
import { extractReasoningFromSSE, extractTextFromSSE } from "../src";

describe("provider delta extraction", () => {
  it.each([
    ["openai", { choices: [{ delta: { content: "openai" } }] }, "openai"],
    ["deepseek", { choices: [{ delta: { content: "deepseek" } }] }, "deepseek"],
    ["oneapi", { choices: [{ delta: { content: "oneapi" } }] }, "oneapi"],
    [
      "openai-responses",
      { type: "response.output_text.delta", delta: "responses" },
      "responses",
    ],
    [
      "gemini",
      { candidates: [{ content: { parts: [{ text: "gemini" }] } }] },
      "gemini",
    ],
    [
      "vertexai",
      { candidates: [{ content: { parts: [{ text: "vertex" }] } }] },
      "vertex",
    ],
    [
      "claude",
      { type: "content_block_delta", delta: { text: "claude" } },
      "claude",
    ],
    [
      "cohere",
      {
        type: "content-delta",
        delta: { message: { content: { text: "cohere" } } },
      },
      "cohere",
    ],
    ["huggingface", { token: { text: "hf" } }, "hf"],
  ])("extracts %s text deltas", (provider, payload, expected) => {
    expect(extractTextFromSSE(JSON.stringify(payload), provider)).toBe(
      expected
    );
  });

  it("extracts OpenAI-compatible and Cohere reasoning deltas", () => {
    expect(
      extractReasoningFromSSE(
        JSON.stringify({
          choices: [{ delta: { reasoning_content: "thought" } }],
        }),
        "openai"
      )
    ).toBe("thought");
    expect(
      extractReasoningFromSSE(
        JSON.stringify({
          type: "content-delta",
          delta: { message: { content: { thinking: "cohere thought" } } },
        }),
        "cohere"
      )
    ).toBe("cohere thought");
  });

  it("returns null for malformed, unrelated, and empty values", () => {
    expect(extractTextFromSSE("not-json", "openai")).toBeNull();
    expect(extractTextFromSSE("{}", "unknown")).toBeNull();
    expect(
      extractTextFromSSE('{"choices":[{"delta":{"content":""}}]}', "openai")
    ).toBeNull();
  });
});
