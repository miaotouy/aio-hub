import { describe, expect, it } from "vitest";
import type { LlmMessageContent } from "@/tools/llm-api/types";
import { contentToTokenText } from "../contextTokenUsage";

const managedAssetSource = {
  kind: "managed-asset-ref" as const,
  assetId: "asset-1",
};

describe("contentToTokenText", () => {
  it("includes direct text and nested tool-result text", () => {
    const content: LlmMessageContent[] = [
      { type: "text", text: "user prompt" },
      {
        type: "tool_result",
        toolResultId: "call-1",
        toolResultContent: [
          { type: "text", text: "tool response" },
          {
            type: "tool_result",
            toolResultId: "call-2",
            toolResultContent: "nested response",
          },
        ],
      },
    ];

    expect(contentToTokenText(content)).toBe(
      "user prompt\ntool response\nnested response"
    );
  });

  it("excludes attachments and other non-text multimodal payloads", () => {
    const content: LlmMessageContent[] = [
      { type: "text", text: "keep this text" },
      {
        type: "image",
        imageBase64: "large-inline-image-payload",
        source: managedAssetSource,
        mimeType: "image/png",
      },
      {
        type: "audio",
        source: managedAssetSource,
        mimeType: "audio/wav",
      },
      {
        type: "video",
        source: managedAssetSource,
        mimeType: "video/mp4",
      },
      {
        type: "document",
        source: managedAssetSource,
        mimeType: "application/pdf",
      },
      {
        type: "tool_use",
        toolUseId: "call-3",
        toolName: "search_assets",
        toolInput: { query: "not a text-token estimate" },
      },
    ];

    expect(contentToTokenText(content)).toBe("keep this text");
  });
});
