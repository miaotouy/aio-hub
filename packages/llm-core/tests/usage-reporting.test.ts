import { describe, expect, it } from "vitest";
import {
  parseAnthropicUsage,
  AnthropicMessagesStreamDecoder,
} from "../src/providers/anthropic-messages";
import {
  parseOpenAiUsage,
  OpenAiCompatibleStreamDecoder,
} from "../src/providers/openai-compatible";
import { parseGoogleUsage } from "../src/providers/google-generate-content";
import { parseResponsesUsage } from "../src/providers/openai-responses";

describe("provider usage provenance", () => {
  it("includes Anthropic read and creation once, retaining TTL breakdown", () => {
    expect(
      parseAnthropicUsage({
        input_tokens: 100,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 200,
        output_tokens: 20,
        cache_creation: {
          ephemeral_5m_input_tokens: 50,
          ephemeral_1h_input_tokens: 150,
        },
      })
    ).toEqual({
      promptTokens: 1200,
      completionTokens: 20,
      totalTokens: 1220,
      promptTokensDetails: {
        cachedTokens: 900,
        cacheWriteTokens: 200,
        cacheWrite5mTokens: 50,
        cacheWrite1hTokens: 150,
      },
      providerUsageStatus: "reported",
      reportedUsageFields: {
        input_tokens: 100,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 200,
        output_tokens: 20,
        "cache_creation.ephemeral_5m_input_tokens": 50,
        "cache_creation.ephemeral_1h_input_tokens": 150,
      },
    });
  });
  it.each([
    [parseAnthropicUsage, "input_tokens", "output_tokens"],
    [parseOpenAiUsage, "prompt_tokens", "completion_tokens"],
    [parseGoogleUsage, "promptTokenCount", "candidatesTokenCount"],
    [parseResponsesUsage, "input_tokens", "output_tokens"],
  ] as const)(
    "preserves missing, partial and explicit-zero main counts (%#)",
    (parse, input, output) => {
      expect(parse(undefined)).toBeUndefined();
      expect(parse({})?.providerUsageStatus).toBe("missing");
      expect(parse({ [input]: 0 })).toMatchObject({
        providerUsageStatus: "partial",
        reportedUsageFields: { [input]: 0 },
      });
      expect(parse({ [input]: 0, [output]: 0 })).toMatchObject({
        providerUsageStatus: "reported",
        reportedUsageFields: { [input]: 0, [output]: 0 },
      });
      expect(parse({ [input]: 4, [output]: 3 })?.totalTokens).toBe(7);
    }
  );
  it("retains Anthropic input, reads and writes across output-only cumulative updates", () => {
    const decoder = new AnthropicMessagesStreamDecoder();
    const encode = (value: unknown) =>
      new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
    decoder.push(
      encode({
        type: "message_start",
        message: {
          usage: {
            input_tokens: 100,
            cache_read_input_tokens: 900,
            cache_creation_input_tokens: 200,
            cache_creation: { ephemeral_5m_input_tokens: 200 },
          },
        },
      })
    );
    decoder.push(
      encode({ type: "message_delta", usage: { output_tokens: 10 } })
    );
    decoder.push(
      encode({ type: "message_delta", usage: { output_tokens: 20 } })
    );
    const completed = decoder
      .finish()
      .find((event) => event.type === "completed");
    expect(
      completed?.type === "completed" && completed.response.usage
    ).toMatchObject({
      promptTokens: 1200,
      completionTokens: 20,
      totalTokens: 1220,
      providerUsageStatus: "reported",
      promptTokensDetails: {
        cachedTokens: 900,
        cacheWriteTokens: 200,
        cacheWrite5mTokens: 200,
      },
    });
  });
  it("keeps explicit zero cache reads when a later OpenAI usage update omits details", () => {
    const decoder = new OpenAiCompatibleStreamDecoder();
    const events = decoder.push(
      new TextEncoder().encode(
        [
          {
            usage: {
              prompt_tokens: 10,
              prompt_tokens_details: { cached_tokens: 0 },
            },
            choices: [],
          },
          {
            usage: { completion_tokens: 3 },
            choices: [{ finish_reason: "stop", delta: {} }],
          },
        ]
          .map((value) => `data: ${JSON.stringify(value)}\n\n`)
          .join("") + "data: [DONE]\n\n"
      )
    );
    const completed = events.find((event) => event.type === "completed");
    expect(
      completed?.type === "completed" && completed.response.usage
    ).toMatchObject({
      promptTokens: 10,
      completionTokens: 3,
      totalTokens: 13,
      providerUsageStatus: "reported",
      promptTokensDetails: { cachedTokens: 0 },
    });
  });
});
