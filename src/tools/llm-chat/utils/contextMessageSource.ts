// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import type { ProcessableMessage } from "../types/context";

type SourceMessage = Pick<
  ProcessableMessage,
  "sourceType" | "sourceId" | "sourceIndex" | "_name" | "_snapshotIdentity"
> & {
  _mergedSources?: readonly SourceMessage[];
};
export interface ContextMessageSource {
  source:
    "agent_preset" | "session_history" | "injection" | "mixed" | "unknown";
  sourceLabel: string;
}

/** Resolve provenance from pipeline metadata, independently of preview-array matches. */
export function describeContextMessageSource(
  message: SourceMessage
): ContextMessageSource {
  if (message.sourceType === "merged" && message._mergedSources?.length) {
    const children = message._mergedSources.map(describeContextMessageSource);
    const labels = [...new Set(children.map((child) => child.sourceLabel))];
    return {
      source: children.every((child) => child.source === children[0].source)
        ? children[0].source
        : "mixed",
      sourceLabel: labels.join(" / "),
    };
  }
  if (message.sourceType === "session_history")
    return { source: "session_history", sourceLabel: "历史" };
  if (message.sourceType === "agent_preset")
    return { source: "agent_preset", sourceLabel: "预设" };
  if (
    message._snapshotIdentity?.type === "recall" ||
    message.sourceId === "recall:auto"
  ) {
    return { source: "injection", sourceLabel: "记忆召回" };
  }
  if (
    message.sourceType === "depth_injection" ||
    message.sourceType === "anchor_injection"
  ) {
    const kind =
      message.sourceType === "depth_injection" ? "深度注入" : "锚点注入";
    return message.sourceIndex !== undefined
      ? { source: "agent_preset", sourceLabel: "预设 · " + kind }
      : { source: "injection", sourceLabel: message._name || kind };
  }
  return { source: "unknown", sourceLabel: message._name || "来源未记录" };
}
