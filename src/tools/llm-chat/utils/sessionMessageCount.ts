// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { ChatMessageNode } from "../types";

export function isLiveGreetingNode(node: ChatMessageNode | undefined): boolean {
  return !!node?.metadata?.isGreeting && node.metadata.greetingLive === true;
}

export function isSessionRootNode(
  node: ChatMessageNode | undefined,
  rootNodeId?: string
): boolean {
  if (!node) return false;
  return node.id === rootNodeId || node.parentId === null;
}

/**
 * Count user-useful messages in a session.
 *
 * Excludes the hidden root node and live greetings that have not been
 * solidified by the first user message yet.
 */
export function getEffectiveMessageCount(
  nodes: Record<string, ChatMessageNode> | undefined,
  rootNodeId?: string
): number {
  if (!nodes) return 0;

  return Object.values(nodes).filter(
    (node) => !isSessionRootNode(node, rootNodeId) && !isLiveGreetingNode(node)
  ).length;
}
