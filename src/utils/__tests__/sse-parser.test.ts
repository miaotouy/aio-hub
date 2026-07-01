import { describe, expect, it } from "vitest";
import {
  extractReasoningFromSSE,
  extractTextFromSSE,
  parseSSEStream,
} from "../sse-parser";

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

  it("flushes a final SSE data line without trailing newline", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"text":"tail"}'));
        controller.close();
      },
    });
    const chunks: string[] = [];

    await parseSSEStream(stream.getReader(), (chunk) => chunks.push(chunk));

    expect(chunks).toEqual(['{"text":"tail"}']);
  });
});
