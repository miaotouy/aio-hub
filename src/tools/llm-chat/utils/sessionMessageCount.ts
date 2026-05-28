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
