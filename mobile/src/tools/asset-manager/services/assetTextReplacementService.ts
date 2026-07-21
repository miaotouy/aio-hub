import { createModuleLogger } from "@/utils/logger";
import {
  drainAssetUsageOutbox,
  replaceChatAssetWithText,
} from "../../llm-chat/services/chatStorageService";
import type { AssetDetail } from "../types";
import {
  analyzeAssetDeletion,
  deleteAssets,
  extractAssetText,
  getAssetDetail,
} from "./assetService";

const logger = createModuleLogger("asset-manager/text-replacement");
const MAX_OUTBOX_DRAIN_ROUNDS = 20;

export interface AssetTextReplacementItemResult {
  assetId: string;
  status: "completed" | "failed";
  updatedAttachments: number;
  affectedMessages: number;
  errorCode?: string;
}

export interface AssetTextReplacementBatchResult {
  completedCount: number;
  failedCount: number;
  items: AssetTextReplacementItemResult[];
}

function failureCode(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function validateChatReplacementScope(detail: AssetDetail): number {
  if (detail.availability !== "ready") {
    throw new Error("ASSET_TEXT_REPLACEMENT_NOT_READY");
  }
  if (detail.kind !== "document") {
    throw new Error("ASSET_TEXT_REPLACEMENT_NOT_DOCUMENT");
  }
  if (detail.retentionPolicy === "pinned") {
    throw new Error("ASSET_TEXT_REPLACEMENT_PINNED");
  }
  if (detail.usages.length === 0) {
    throw new Error("ASSET_TEXT_REPLACEMENT_NO_CONSUMER");
  }
  if (
    detail.usages.some(
      (usage) =>
        usage.moduleId !== "llm-chat" ||
        usage.entityType !== "message" ||
        usage.role !== "attachment"
    )
  ) {
    throw new Error("ASSET_TEXT_REPLACEMENT_UNSUPPORTED_CONSUMER");
  }
  return new Set(detail.usages.map((usage) => usage.entityId)).size;
}

async function drainUsageOutbox(): Promise<void> {
  for (let round = 0; round < MAX_OUTBOX_DRAIN_ROUNDS; round += 1) {
    const result = await drainAssetUsageOutbox(50);
    if (result.inspected === 0) return;
  }
  throw new Error("ASSET_TEXT_REPLACEMENT_OUTBOX_BUSY");
}

async function replaceOneAsset(
  assetId: string
): Promise<AssetTextReplacementItemResult> {
  const detail = await getAssetDetail(assetId);
  const expectedMessages = validateChatReplacementScope(detail);
  const extraction = await extractAssetText(assetId);
  const replacement = await replaceChatAssetWithText(assetId, extraction.text);
  if (
    replacement.updatedAttachments !== expectedMessages ||
    replacement.affectedMessages !== expectedMessages
  ) {
    throw new Error("ASSET_TEXT_REPLACEMENT_INCOMPLETE");
  }
  await drainUsageOutbox();
  const analysis = await analyzeAssetDeletion([assetId]);
  const item = analysis.items[0];
  if (!analysis.canDeleteAll || !item?.canDelete) {
    throw new Error(item?.blockedReason ?? "ASSET_TEXT_REPLACEMENT_DELETE_BLOCKED");
  }
  const deletion = await deleteAssets(
    [assetId],
    analysis.requiresAdvisoryConfirmation
  );
  if (deletion.deletedCount + deletion.reclaimedCount !== 1) {
    throw new Error("ASSET_TEXT_REPLACEMENT_DELETE_INCOMPLETE");
  }
  return {
    assetId,
    status: "completed",
    updatedAttachments: replacement.updatedAttachments,
    affectedMessages: replacement.affectedMessages,
  };
}

export async function replaceAssetsWithExtractedText(
  assetIds: string[]
): Promise<AssetTextReplacementBatchResult> {
  const items: AssetTextReplacementItemResult[] = [];
  for (const assetId of [...new Set(assetIds)]) {
    try {
      items.push(await replaceOneAsset(assetId));
    } catch (cause) {
      const errorCode = failureCode(cause);
      logger.warn("Asset text replacement item failed", {
        assetId,
        errorCode,
      });
      items.push({
        assetId,
        status: "failed",
        updatedAttachments: 0,
        affectedMessages: 0,
        errorCode,
      });
    }
  }
  return {
    completedCount: items.filter((item) => item.status === "completed").length,
    failedCount: items.filter((item) => item.status === "failed").length,
    items,
  };
}
