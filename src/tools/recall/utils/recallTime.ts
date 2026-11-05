// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

/** Recall legacy/native records use Unix seconds; browser edits also contain milliseconds. */
export function recallTimestampMs(timestamp: number): number {
  if (!Number.isFinite(timestamp)) return 0;
  return Math.abs(timestamp) < 100_000_000_000 ? timestamp * 1000 : timestamp;
}
