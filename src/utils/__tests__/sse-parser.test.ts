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
