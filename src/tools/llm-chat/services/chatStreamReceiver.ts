// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import type { ChatMessageNode, ChatSessionDetail } from "../types";

export interface ChatStreamingDelta {
  sessionId: string;
  nodeId: string;
  delta: string;
  isReasoning: boolean;
  /** Absolute UTF-16 offset before this delta, including any continuation prefix. */
  offset: number;
  requestStartTime?: number;
}
const live = (node: ChatMessageNode) =>
  node.status === "generating" || node.status === "waiting";
const sameRequest = (a?: number, b?: number) => a === b;

/** Reconcile stream ranges with authoritative periodic snapshots, without mutating wire state. */
export class ChatStreamReceiver {
  private pending = new Map<string, ChatStreamingDelta>();
  constructor(
    private readonly options: {
      sessions: Map<string, ChatSessionDetail>;
      onContent: (nodeId: string, content: string, appended: string) => void;
      onComplete: (nodeId: string) => void;
      requestSnapshot: () => void;
    }
  ) {}

  receive(delta: ChatStreamingDelta): void {
    if (
      !delta ||
      typeof delta.delta !== "string" ||
      !Number.isInteger(delta.offset) ||
      delta.offset < 0
    )
      return;
    const detail = this.options.sessions.get(delta.sessionId);
    const node = detail?.nodes[delta.nodeId];
    if (
      node &&
      (!live(node) ||
        !sameRequest(node.metadata?.requestStartTime, delta.requestStartTime))
    )
      return;
    const current = delta.isReasoning
      ? (node?.metadata?.reasoningContent ?? "")
      : (node?.content ?? "");
    if (!node || delta.offset > current.length) {
      this.remember(delta);
      this.options.requestSnapshot();
      return;
    }
    const appended = delta.delta.slice(
      Math.max(0, current.length - delta.offset)
    );
    if (!appended) return;
    const metadata = (node.metadata ??= {});
    const now = Date.now();
    if (delta.isReasoning) {
      if (!metadata.reasoningActive) metadata.reasoningActiveSince = now;
      metadata.reasoningActive = true;
      metadata.reasoningStartTime ??= now;
      metadata.reasoningContent = current + appended;
    } else {
      if (metadata.reasoningActive && metadata.reasoningActiveSince) {
        metadata.reasoningDurationMs =
          (metadata.reasoningDurationMs ?? 0) +
          Math.max(0, now - metadata.reasoningActiveSince);
      }
      metadata.reasoningActive = false;
      metadata.reasoningActiveSince = undefined;
      if (metadata.reasoningStartTime) metadata.reasoningEndTime = now;
    }
    node.status = "generating";
    if (!delta.isReasoning) node.content = current + appended;
    if (!delta.isReasoning && node.role === "assistant") {
      this.options.onContent(delta.nodeId, current, appended);
    }
  }

  snapshot(incoming: ChatSessionDetail): ChatSessionDetail {
    const previous = this.options.sessions.get(incoming.id);
    const detail = { ...incoming, nodes: { ...incoming.nodes } };
    for (const [id, node] of Object.entries(detail.nodes)) {
      const old = previous?.nodes[id];
      if (!live(node)) {
        if (old && live(old)) this.options.onComplete(id);
        continue;
      }
      detail.nodes[id] = { ...node, metadata: { ...node.metadata } };
      if (
        !old ||
        !sameRequest(
          old.metadata?.requestStartTime,
          node.metadata?.requestStartTime
        )
      )
        continue;
      if (
        node.role === "assistant" &&
        node.content.startsWith(old.content) &&
        node.content.length > old.content.length
      ) {
        this.options.onContent(
          id,
          old.content,
          node.content.slice(old.content.length)
        );
      }
      const content = old.content.startsWith(node.content)
        ? old.content
        : node.content;
      const reasoning = node.metadata?.reasoningContent ?? "";
      const oldReasoning = old.metadata?.reasoningContent ?? "";
      detail.nodes[id] = {
        ...node,
        content,
        metadata: {
          ...node.metadata,
          ...(oldReasoning.length > reasoning.length ||
          old.content.length > node.content.length
            ? {
                reasoningActive: old.metadata?.reasoningActive,
                reasoningActiveSince: old.metadata?.reasoningActiveSince,
                reasoningStartTime: old.metadata?.reasoningStartTime,
                reasoningEndTime: old.metadata?.reasoningEndTime,
                reasoningDurationMs: old.metadata?.reasoningDurationMs,
              }
            : {}),
          reasoningContent: oldReasoning.startsWith(reasoning)
            ? oldReasoning
            : reasoning,
        },
      };
    }
    this.options.sessions.set(detail.id, detail);
    for (const [key, delta] of [...this.pending]) {
      if (delta.sessionId !== detail.id) continue;
      this.pending.delete(key);
      this.receive(delta);
    }
    return this.options.sessions.get(detail.id)!;
  }

  private remember(delta: ChatStreamingDelta): void {
    const key = JSON.stringify([
      delta.sessionId,
      delta.nodeId,
      delta.isReasoning,
    ]);
    const old = this.pending.get(key);
    if (
      old &&
      sameRequest(old.requestStartTime, delta.requestStartTime) &&
      delta.offset >= old.offset &&
      delta.offset <= old.offset + old.delta.length
    ) {
      const overlap = old.offset + old.delta.length - delta.offset;
      delta = { ...old, delta: old.delta + delta.delta.slice(overlap) };
    }
    // A missing node/transport gap is repaired by a snapshot; keep its staging bounded.
    if (delta.delta.length > 1024 * 1024) {
      this.pending.delete(key);
      return;
    }
    this.pending.set(key, delta);
    if (this.pending.size > 64)
      this.pending.delete(this.pending.keys().next().value!);
  }

  clear(): void {
    this.pending.clear();
  }
}
