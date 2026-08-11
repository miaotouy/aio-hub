import type { LlmMessageContent } from "@/tools/llm-api/types";
import { createModuleLogger } from "@/utils/logger";
import type { ManagedAssetRef } from "../../../../asset-manager/types";
import { getReplacedAssetText } from "../../../../asset-manager/services/assetTextReplacementCache";
import {
  processorResult,
  type ContextProcessor,
  type PipelineContext,
  type ProcessableMessage,
} from "../../../types";
import {
  getAttachmentAvailabilityMap,
  partitionAttachmentsByAvailability,
} from "../../../utils/attachmentStatus";

const logger = createModuleLogger("primary:attachment-preparer");

export interface AttachmentPreparationStats {
  readyAttachmentCount: number;
  skippedAttachmentCount: number;
  textFallbackCount: number;
}

function attachmentTextFallback(attachment: ManagedAssetRef): string | null {
  const extractedText =
    attachment.snapshot.extractedText?.trim() ??
    getReplacedAssetText(attachment.assetId);
  if (!extractedText) return null;

  return [
    `<attachment_text name="${attachment.snapshot.displayName}" mime_type="${attachment.snapshot.mimeType}">`,
    extractedText,
    "</attachment_text>",
  ].join("\n");
}

export function appendUnavailableAttachmentText(
  content: ProcessableMessage["content"],
  attachments: ManagedAssetRef[]
): { content: ProcessableMessage["content"]; recoveredCount: number } {
  const fallbackBlocks = attachments
    .map(attachmentTextFallback)
    .filter((block): block is string => Boolean(block));
  if (!fallbackBlocks.length) return { content, recoveredCount: 0 };

  if (typeof content === "string") {
    return {
      content: [content, ...fallbackBlocks].filter(Boolean).join("\n\n"),
      recoveredCount: fallbackBlocks.length,
    };
  }

  const textParts: LlmMessageContent[] = fallbackBlocks.map((text) => ({
    type: "text",
    text,
  }));
  return {
    content: [...content, ...textParts],
    recoveredCount: fallbackBlocks.length,
  };
}

export async function prepareAttachments(
  context: PipelineContext
): Promise<AttachmentPreparationStats> {
  const attachments = context.messages.flatMap(
    (message) => message._attachments ?? []
  );
  const stats: AttachmentPreparationStats = {
    readyAttachmentCount: 0,
    skippedAttachmentCount: 0,
    textFallbackCount: 0,
  };
  if (!attachments.length) return stats;

  const availability = await getAttachmentAvailabilityMap(attachments);
  for (const message of context.messages) {
    if (!message._attachments?.length) continue;

    const { ready, unavailable } = partitionAttachmentsByAvailability(
      message._attachments,
      availability
    );
    message._attachments = ready.length ? ready : undefined;
    stats.readyAttachmentCount += ready.length;

    const fallback = appendUnavailableAttachmentText(
      message.content,
      unavailable
    );
    message.content = fallback.content;
    stats.textFallbackCount += fallback.recoveredCount;
    stats.skippedAttachmentCount +=
      unavailable.length - fallback.recoveredCount;
  }

  return stats;
}

/**
 * Keeps managed attachment references opaque until the Rust native transport,
 * while converting persisted text snapshots into deterministic prompt context
 * when an original document has already been reclaimed.
 */
export const attachmentPreparer: ContextProcessor = {
  id: "primary:attachment-preparer",
  name: "附件可用性与文本回退",
  description:
    "保留可用附件的托管引用；原件不可用时将已持久化的提取文本编排回请求上下文。",
  priority: 600,
  isCore: true,
  defaultEnabled: true,
  execute: async (context) => {
    const stats = await prepareAttachments(context);
    context.sharedData.set("attachmentPreparationStats", stats);
    if (
      !stats.readyAttachmentCount &&
      !stats.skippedAttachmentCount &&
      !stats.textFallbackCount
    ) {
      return processorResult.skipped("当前没有需要准备的附件。", stats);
    }

    const message = `附件准备完成：保留 ${stats.readyAttachmentCount} 个托管引用，使用 ${stats.textFallbackCount} 个文本回退，跳过 ${stats.skippedAttachmentCount} 个不可用附件。`;
    if (stats.textFallbackCount || stats.skippedAttachmentCount) {
      logger.warn(message, stats);
      return processorResult.degraded(message, stats);
    }

    logger.info(message, stats);
    return processorResult.applied(message, stats);
  },
};
