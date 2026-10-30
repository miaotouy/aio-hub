// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

/** Decode an extracted ESCAPE value without re-entering protocol scanning. */
export function restoreVcpEscapedLiterals(value: string): string {
  return value
    .replace(/<<<\[(END_)?TOOL_REQUEST_ESCAPE\]>>>/g, "<<<[$1TOOL_REQUEST]>>>")
    .replace(/「(始|末)ESCAPE」/g, "「$1」");
}
