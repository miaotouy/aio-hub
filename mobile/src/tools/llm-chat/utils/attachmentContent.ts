import type { LlmMessageContent, MediaSource } from "@/tools/llm-api/types";
import type { ManagedAssetRef } from "../../asset-manager/types";

function managedSource(ref: ManagedAssetRef): MediaSource {
  return {
    kind: "managed-asset-ref",
    assetId: ref.assetId,
  };
}

export function attachmentToMessageContent(
  attachment: ManagedAssetRef
): LlmMessageContent {
  const source = managedSource(attachment);
  switch (attachment.snapshot.kind) {
    case "image":
      return {
        type: "image",
        imageBase64: "",
        mimeType: attachment.snapshot.mimeType,
        source,
      };
    case "audio":
      return { type: "audio", source, mimeType: attachment.snapshot.mimeType };
    case "video":
      return { type: "video", source, mimeType: attachment.snapshot.mimeType };
    case "document":
    case "other":
      return {
        type: "document",
        source,
        mimeType: attachment.snapshot.mimeType,
      };
  }
}

export function buildMessageContent(
  content: string | LlmMessageContent[],
  attachments: ManagedAssetRef[] = []
): string | LlmMessageContent[] {
  if (!attachments.length) return content;
  const parts =
    typeof content === "string"
      ? content
        ? [{ type: "text" as const, text: content }]
        : []
      : content;
  return [...parts, ...attachments.map(attachmentToMessageContent)];
}
