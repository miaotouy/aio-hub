import { describe, expect, it } from "vitest";
import {
  attachmentToMessageContent,
  buildMessageContent,
} from "../attachmentContent";

const attachment = {
  assetId: "asset-1",
  usagePolicy: "advisory" as const,
  snapshot: {
    displayName: "photo.png",
    kind: "image" as const,
    mimeType: "image/png",
    sizeBytes: 12,
  },
};

describe("chat attachment content", () => {
  it("emits an opaque managed ref without reading asset bytes", () => {
    expect(attachmentToMessageContent(attachment)).toEqual({
      type: "image",
      imageBase64: "",
      mimeType: "image/png",
      source: { kind: "managed-asset-ref", assetId: "asset-1" },
    });
  });

  it("keeps text and appends attachments as multimodal parts", () => {
    expect(buildMessageContent("hello", [attachment])).toEqual([
      { type: "text", text: "hello" },
      expect.objectContaining({
        type: "image",
        source: { kind: "managed-asset-ref", assetId: "asset-1" },
      }),
    ]);
  });
});
