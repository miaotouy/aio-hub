import {
  processorResult,
  type ContextProcessor,
  type PipelineContext,
} from "../../../types/pipeline";
import type { ProcessableMessage } from "../../../types/context";
import type {
  MobileWorldbook,
  MobileWorldbookEntry,
} from "../../../types/worldbook";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/worldbook-injector");
const PROCESSOR_ID = "primary:worldbook-injector";

interface MatchedEntry {
  entry: MobileWorldbookEntry;
  worldbookId: string;
  worldbookName: string;
  worldbookIndex: number;
  matchedKeys: string[];
}

function textContent(content: ProcessableMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

function matchesKey(
  haystack: string,
  key: string,
  entry: MobileWorldbookEntry
): boolean {
  if (!key) return false;
  const source = entry.caseSensitive ? haystack : haystack.toLocaleLowerCase();
  const needle = entry.caseSensitive ? key : key.toLocaleLowerCase();
  if (!entry.matchWholeWords) return source.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:^|\\W)${escaped}(?=$|\\W)`,
    entry.caseSensitive ? "" : "i"
  ).test(haystack);
}

function matchEntries(
  context: PipelineContext,
  worldbooks: readonly MobileWorldbook[]
): MatchedEntry[] {
  const history = context.messages
    .filter((message) => message.sourceType === "session_history")
    .map((message) => textContent(message.content));

  const matched: MatchedEntry[] = [];
  worldbooks.forEach((worldbook, worldbookIndex) => {
    worldbook.entries.forEach((entry) => {
      if (!entry.enabled || !entry.content.trim()) return;
      const scanText = history
        .slice(-Math.max(1, entry.scanDepth ?? 8))
        .join("\n");
      const matchedKeys = entry.keys.filter((key) =>
        matchesKey(scanText, key, entry)
      );
      if (!entry.constant && matchedKeys.length === 0) return;
      matched.push({
        entry,
        worldbookId: worldbook.id,
        worldbookName: worldbook.name,
        worldbookIndex,
        matchedKeys,
      });
    });
  });

  return matched.sort(
    (left, right) =>
      right.entry.order - left.entry.order ||
      left.worldbookIndex - right.worldbookIndex ||
      left.entry.id.localeCompare(right.entry.id)
  );
}

function toMessage(item: MatchedEntry): ProcessableMessage {
  return {
    role: "system",
    content: item.entry.content,
    sourceType: "worldbook_injection",
    sourceId: `${item.worldbookId}:${item.entry.id}`,
  };
}

function firstHistoryIndex(messages: ProcessableMessage[]): number {
  const index = messages.findIndex(
    (message) => message.sourceType === "session_history"
  );
  return index >= 0 ? index : messages.length;
}

function injectEntries(
  context: PipelineContext,
  matched: readonly MatchedEntry[]
): void {
  // Depth is always relative to the original session history. Other worldbook
  // insertions must not become synthetic history distance or move the clamp
  // boundary into character/preset messages.
  const historyAnchors = context.messages.filter(
    (message) => message.sourceType === "session_history"
  );

  const beforeHistory = matched.filter(
    (item) => item.entry.position === "before_history"
  );
  if (beforeHistory.length) {
    context.messages.splice(
      firstHistoryIndex(context.messages),
      0,
      ...beforeHistory.map(toMessage)
    );
  }

  const afterCharacter = matched.filter(
    (item) => item.entry.position === "after_character"
  );
  if (afterCharacter.length) {
    const characterIndex = context.messages.findIndex(
      (message) =>
        message.sourceType === "agent_preset" && message.role === "system"
    );
    const index =
      characterIndex >= 0
        ? characterIndex + 1
        : firstHistoryIndex(context.messages);
    context.messages.splice(index, 0, ...afterCharacter.map(toMessage));
  }

  const depths = matched
    .filter((item) => item.entry.position === "depth")
    .reduce((groups, item) => {
      const requestedDepth = Math.max(0, Math.floor(item.entry.depth ?? 4));
      const depth = Math.min(requestedDepth, historyAnchors.length);
      const group = groups.get(depth) ?? [];
      group.push(item);
      groups.set(depth, group);
      return groups;
    }, new Map<number, MatchedEntry[]>());

  for (const [depth, entries] of [...depths.entries()].sort(
    ([a], [b]) => a - b
  )) {
    if (historyAnchors.length === 0) {
      context.messages.push(...entries.map(toMessage));
      continue;
    }
    const anchor =
      depth === 0
        ? historyAnchors[historyAnchors.length - 1]
        : historyAnchors[historyAnchors.length - depth];
    const anchorIndex = context.messages.indexOf(anchor);
    const insertionIndex =
      anchorIndex < 0
        ? context.messages.length
        : anchorIndex + (depth === 0 ? 1 : 0);
    context.messages.splice(insertionIndex, 0, ...entries.map(toMessage));
  }
}

export function injectWorldbooks(
  context: PipelineContext,
  worldbooks: readonly MobileWorldbook[]
): MatchedEntry[] {
  const matched = matchEntries(context, worldbooks);
  injectEntries(context, matched);
  return matched;
}

export const worldbookInjector: ContextProcessor = {
  id: PROCESSOR_ID,
  name: "关键词世界书注入器",
  description:
    "按 Agent 选择的世界书执行确定性关键词匹配，并在预设和历史之间注入上下文。",
  priority: 450,
  isCore: true,
  execute: async (context) => {
    const worldbooks = context.sharedData.get("worldbooks") as
      MobileWorldbook[] | undefined;
    if (!worldbooks?.length) {
      return processorResult.skipped("当前没有已绑定的世界书。");
    }
    const matched = injectWorldbooks(context, worldbooks);
    context.sharedData.set("activatedWorldbookEntries", matched);
    if (!matched.length) {
      return processorResult.skipped("世界书未命中当前会话内容。", {
        worldbookCount: worldbooks.length,
        matched: 0,
      });
    }

    const message = `已激活 ${matched.length} 条世界书条目。`;
    const details = {
      worldbookCount: worldbooks.length,
      matched: matched.length,
    };
    logger.info(message, details);
    return processorResult.applied(message, details);
  },
};
