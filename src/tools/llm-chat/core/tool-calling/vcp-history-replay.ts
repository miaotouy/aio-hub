// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { ProcessableMessage } from "../../types/context";
import type { ChatMessageNode } from "../../types/message";

function segmentIdentity(message: ProcessableMessage) {
  const segment = message.metadata?.vcpResponse;
  if (
    message.sourceType !== "session_history" ||
    !segment?.requestId ||
    !segment.contextReplay ||
    message.metadata?.isCompressionNode ||
    (message._historyRole ?? message.role) !== segment.kind
  )
    return;
  return segment;
}

/** Rebuild new VCP responses from their captured framing, leaving old nodes alone. */
export function mergeVcpResponseHistory(
  messages: ProcessableMessage[],
  nodes: Readonly<Record<string, ChatMessageNode>>
): ProcessableMessage[] {
  const result: ProcessableMessage[] = [];
  let group: ProcessableMessage[] = [];
  const flush = () => {
    if (!group.length) return;
    const first = group[0];
    result.push({
      ...first,
      role: "assistant",
      _historyRole: "assistant",
      content: group
        .map((message) => {
          const framing = message.metadata!.vcpResponse!.contextReplay!;
          return framing.prefix + message.content + framing.suffix;
        })
        .join(""),
      reasoningContent: undefined,
      reasoningArtifacts: undefined,
      _attachments: group.flatMap((message) => message._attachments ?? []),
      _mergedSources: group,
      metadata: {
        ...first.metadata,
        vcpResponse: undefined,
        reasoningContent: undefined,
        reasoningArtifacts: undefined,
      },
    });
    group = [];
  };
  for (const message of messages) {
    const segment = segmentIdentity(message);
    if (!segment || typeof message.content !== "string") {
      flush();
      result.push(message);
      continue;
    }
    const previous = group[group.length - 1];
    if (
      previous &&
      (previous.metadata!.vcpResponse!.requestId !== segment.requestId ||
        nodes[String(message.sourceId)]?.parentId !== previous.sourceId)
    ) {
      flush();
    }
    group.push(message);
  }
  flush();
  return result;
}
