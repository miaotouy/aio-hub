// Copyright 2025-2026 miaotouy(Github@miaotouy)
import type { ChatMessageNode } from "../types";

/** Derive per-response throughput from the same timestamps used by TTFT and duration. */
export function getMessagePerformanceMetadata(
  metadata: ChatMessageNode["metadata"]
) {
  const contentTokens = metadata?.usage?.completionTokens;
  const firstTokenTime = metadata?.firstTokenTime;
  const requestEndTime = metadata?.requestEndTime;
  const generationTime =
    firstTokenTime !== undefined && requestEndTime !== undefined
      ? requestEndTime - firstTokenTime
      : 0;
  const tokensPerSecond =
    contentTokens !== undefined &&
    Number.isFinite(contentTokens) &&
    contentTokens >= 0 &&
    generationTime > 0
      ? Math.round((contentTokens / generationTime) * 100000) / 100
      : undefined;

  return { contentTokens, tokensPerSecond };
}
