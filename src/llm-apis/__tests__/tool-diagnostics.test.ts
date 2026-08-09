import { describe, expect, it } from "vitest";
import {
  buildDecodedToolDiagnostics,
  inspectNativeToolRequestBody,
} from "../tool-diagnostics";

describe("tool diagnostics", () => {
  it("counts OpenAI-style and Gemini native tool declarations from the final request body", () => {
    expect(
      inspectNativeToolRequestBody(
        JSON.stringify({ tools: [{ type: "function" }, { type: "function" }] })
      )
    ).toEqual({ requestToolCount: 2, hasNativeTools: true });
    expect(
      inspectNativeToolRequestBody(
        JSON.stringify({
          tools: [
            {
              functionDeclarations: [{ name: "lookup" }, { name: "get_time" }],
            },
          ],
        })
      )
    ).toEqual({ requestToolCount: 2, hasNativeTools: true });
    expect(
      inspectNativeToolRequestBody(JSON.stringify({ model: "text-only" }))
    ).toEqual({
      requestToolCount: 0,
      hasNativeTools: false,
    });
  });

  it("keeps decoded tool calls, finish reason, and VCP marker diagnostics separate", () => {
    expect(
      buildDecodedToolDiagnostics({
        content: "<<<[TOOL_REQUEST]>>>\n{}",
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: "call_lookup_1",
            type: "function",
            function: { name: "lookup", arguments: '{"query":"aio"}' },
          },
        ],
      })
    ).toEqual({
      decodedFinishReason: "tool_calls",
      decodedToolCalls: [
        {
          id: "call_lookup_1",
          name: "lookup",
          arguments: '{"query":"aio"}',
        },
      ],
      responseContainsVcpMarker: true,
    });
  });
});
