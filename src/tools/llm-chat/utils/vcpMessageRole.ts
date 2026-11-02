// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { ChatMessageNode } from "../types/message";

/** Restore the server-owned segment identity when loading older chat trees. */
export function restoreVcpToolRoles(
  nodes: Record<string, ChatMessageNode>
): void {
  for (const node of Object.values(nodes)) {
    if (node.metadata?.vcpResponse?.kind === "tool") node.role = "tool";
  }
}
