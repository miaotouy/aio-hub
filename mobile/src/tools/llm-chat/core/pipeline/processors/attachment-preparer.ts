import { createModuleLogger } from "@/utils/logger";
import type { ManagedAssetRef } from "../../../../asset-manager/types";
import { extractAssetText } from "../../../../asset-manager/services/assetService";
import {
  isTextSnapshotCandidate,
  MAX_TEXT_SNAPSHOT_BYTES,
} from "../../../../asset-manager/services/assetTextSnapshotService";
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
  /** 发送前被文本化、不再作为托管引用进 wire 的 ready 附件数。 */
  inlinedTextCount: number;
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

  return {
    content: appendTextBlocks(content, fallbackBlocks),
    recoveredCount: fallbackBlocks.length,
  };
}

/** 内联文本上限与快照字符上限一致，超长截断以避免请求体无限膨胀。 */
const INLINE_TEXT_MAX_CHARS = 200_000;

/**
 * 内容寻址保证同一 assetId 原件内容不变，运行时缓存按 assetId 保存按需提取的
 * 文本即可，跨请求避免重复 IPC；不持久化，进程重启后按需重新提取。
 */
const inlineTextCache = new Map<string, string>();

export function clearInlineTextCache(): void {
  inlineTextCache.clear();
}

function isTextualAttachment(attachment: ManagedAssetRef): boolean {
  if (
    attachment.snapshot.kind !== "document" &&
    attachment.snapshot.kind !== "other"
  ) {
    return false;
  }
  return isTextSnapshotCandidate({
    mimeType: attachment.snapshot.mimeType,
    displayName: attachment.snapshot.displayName,
  });
}

/**
 * 发送前文本化决策：优先使用选择时持久化的快照文本；快照缺失时对不超过
 * 原生 2 MiB 上限的文本类原件调用受控提取。失败返回 null，调用方保留托管引用。
 */
export async function resolveReadyAttachmentText(
  attachment: ManagedAssetRef
): Promise<string | null> {
  if (!isTextualAttachment(attachment)) return null;

  const snapshotText = attachment.snapshot.extractedText?.trim();
  if (snapshotText) return snapshotText;

  const cached = inlineTextCache.get(attachment.assetId);
  if (cached) return cached;

  if (attachment.snapshot.sizeBytes > MAX_TEXT_SNAPSHOT_BYTES) return null;

  try {
    const extraction = await extractAssetText(attachment.assetId);
    const text = extraction.text?.trim();
    if (!text) return null;
    inlineTextCache.set(attachment.assetId, text);
    return text;
  } catch (cause) {
    logger.warn("就绪文本附件按需提取失败，保留托管引用发送", {
      assetId: attachment.assetId,
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }
}

function inlineTextBlock(attachment: ManagedAssetRef, text: string): string {
  const inlined =
    text.length > INLINE_TEXT_MAX_CHARS
      ? text.slice(0, INLINE_TEXT_MAX_CHARS)
      : text;
  if (inlined.length < text.length) {
    logger.warn("内联文本附件超长，已截断", {
      assetId: attachment.assetId,
      originalLength: text.length,
      inlinedLength: inlined.length,
    });
  }
  return [
    `<attachment_text name="${attachment.snapshot.displayName}" mime_type="${attachment.snapshot.mimeType}">`,
    inlined,
    "</attachment_text>",
  ].join("\n");
}

function appendTextBlocks(
  content: ProcessableMessage["content"],
  blocks: string[]
): ProcessableMessage["content"] {
  if (!blocks.length) return content;

  if (typeof content === "string") {
    return [content, ...blocks].filter(Boolean).join("\n\n");
  }
  return [
    ...content,
    ...blocks.map((text) => ({ type: "text" as const, text })),
  ];
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
    inlinedTextCount: 0,
  };
  if (!attachments.length) return stats;

  const availability = await getAttachmentAvailabilityMap(attachments);
  for (const message of context.messages) {
    if (!message._attachments?.length) continue;

    const { ready, unavailable } = partitionAttachmentsByAvailability(
      message._attachments,
      availability
    );
    stats.readyAttachmentCount += ready.length;

    // 发送前文本化：ready 的纯文本类附件不再进入 managed wire，直接内联。
    const inlineBlocks: string[] = [];
    const wireAttachments: ManagedAssetRef[] = [];
    for (const readyAttachment of ready) {
      const text = await resolveReadyAttachmentText(readyAttachment);
      if (text == null) {
        wireAttachments.push(readyAttachment);
        continue;
      }
      inlineBlocks.push(inlineTextBlock(readyAttachment, text));
      stats.inlinedTextCount += 1;
    }
    message._attachments = wireAttachments.length ? wireAttachments : undefined;

    const fallback = appendUnavailableAttachmentText(
      message.content,
      unavailable
    );
    message.content = appendTextBlocks(fallback.content, inlineBlocks);
    stats.textFallbackCount += fallback.recoveredCount;
    stats.skippedAttachmentCount +=
      unavailable.length - fallback.recoveredCount;
  }

  return stats;
}

/**
 * Keeps managed attachment references opaque until the Rust native transport,
 * converts persisted or freshly extracted plain-text snapshots into
 * deterministic prompt context before wire assembly, and falls back to
 * snapshot text when an original document has already been reclaimed.
 */
export const attachmentPreparer: ContextProcessor = {
  id: "primary:attachment-preparer",
  name: "附件可用性与文本化",
  description:
    "就绪的纯文本类附件发送前内联为文本上下文；媒体与复杂文档保留托管引用交原生传输；原件不可用时将已持久化的提取文本编排回请求上下文。",
  priority: 600,
  isCore: true,
  defaultEnabled: true,
  execute: async (context) => {
    const stats = await prepareAttachments(context);
    context.sharedData.set("attachmentPreparationStats", stats);
    if (
      !stats.readyAttachmentCount &&
      !stats.skippedAttachmentCount &&
      !stats.textFallbackCount &&
      !stats.inlinedTextCount
    ) {
      return processorResult.skipped("当前没有需要准备的附件。", stats);
    }

    const message = `附件准备完成：保留 ${stats.readyAttachmentCount - stats.inlinedTextCount} 个托管引用，内联 ${stats.inlinedTextCount} 个文本附件，使用 ${stats.textFallbackCount} 个文本回退，跳过 ${stats.skippedAttachmentCount} 个不可用附件。`;
    if (stats.textFallbackCount || stats.skippedAttachmentCount) {
      logger.warn(message, stats);
      return processorResult.degraded(message, stats);
    }

    logger.info(message, stats);
    return processorResult.applied(message, stats);
  },
};
