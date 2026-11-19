// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

/** Preserve embedded code fences inside a single context text block. */
export function formatFencedText(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  let fenceLength = 3;
  for (const run of runs) fenceLength = Math.max(fenceLength, run.length + 1);
  const fence = "`".repeat(fenceLength);
  return `${fence}\n${text}\n${fence}`;
}
