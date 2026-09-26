import {
  processorResult,
  type ContextProcessor,
  type PipelineContext,
} from "../../../types/pipeline";
import type { ProcessableMessage } from "../../../types/context";
import type {
  MobileWorldbook,
  MobileWorldbookEntry,
  MobileWorldbookSettings,
  WorldbookSelectiveLogic,
} from "../../../types/worldbook";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/worldbook-injector");
const PROCESSOR_ID = "primary:worldbook-injector";

/** 无 scanDepth 时的移动端兜底扫描深度，保持与旧行为一致。 */
const DEFAULT_SCAN_DEPTH = 8;

export interface InjectWorldbookOptions {
  /** 可注入的随机源，测试用于确定性验证概率激活；默认 Math.random。 */
  random?: () => number;
}

interface MatchedEntry {
  entry: MobileWorldbookEntry;
  worldbookId: string;
  worldbookName: string;
  worldbookIndex: number;
  matchedKeys: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** 归一化 Agent 级或书级 worldbookSettings（兼容 camelCase / snake_case）。 */
export function resolveWorldbookSettings(
  raw: unknown
): MobileWorldbookSettings {
  if (!isRecord(raw)) return {};
  const settings: MobileWorldbookSettings = {};
  const scanDepth = readFiniteNumber(
    raw.defaultScanDepth ?? raw.scan_depth ?? raw.world_info_depth
  );
  if (scanDepth !== undefined) settings.defaultScanDepth = scanDepth;
  if (typeof raw.recursive === "boolean") settings.recursive = raw.recursive;
  if (typeof raw.disableRecursion === "boolean")
    settings.disableRecursion = raw.disableRecursion;
  const maxRecursion = readFiniteNumber(
    raw.maxRecursionSteps ?? raw.max_recursion_steps
  );
  if (maxRecursion !== undefined) settings.maxRecursionSteps = maxRecursion;
  return settings;
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

/** 次要关键词选择性逻辑；缺省 and_any。 */
function passesSelective(entry: MobileWorldbookEntry, scanText: string): boolean {
  if (!entry.selective) return true;
  const secondaryKeys = entry.secondaryKeys ?? [];
  if (secondaryKeys.length === 0) return true;
  const matchCount = secondaryKeys.filter((key) =>
    matchesKey(scanText, key, entry)
  ).length;
  const logic: WorldbookSelectiveLogic = entry.selectiveLogic ?? "and_any";
  switch (logic) {
    case "and_all":
      return matchCount === secondaryKeys.length;
    case "not_any":
      return matchCount === 0;
    case "not_all":
      return matchCount < secondaryKeys.length;
    case "and_any":
    default:
      return matchCount > 0;
  }
}

/** 概率激活：仅 useProbability 且 0 < probability < 100 时随机判定。 */
function passesProbability(
  entry: MobileWorldbookEntry,
  random: () => number
): boolean {
  if (!entry.useProbability) return true;
  const probability = entry.probability;
  if (probability === undefined || !Number.isFinite(probability)) return true;
  if (probability >= 100) return true;
  if (probability <= 0) return false;
  return random() * 100 <= probability;
}

/** entry.scanDepth > 书级 > Agent 级 > 默认 8。 */
function effectiveScanDepth(
  entry: MobileWorldbookEntry,
  bookSettings: MobileWorldbookSettings,
  agentSettings: MobileWorldbookSettings
): number {
  const requested =
    entry.scanDepth ??
    bookSettings.defaultScanDepth ??
    agentSettings.defaultScanDepth ??
    DEFAULT_SCAN_DEPTH;
  return Math.max(1, Math.floor(requested));
}

function matchEntries(
  context: PipelineContext,
  worldbooks: readonly MobileWorldbook[],
  random: () => number
): MatchedEntry[] {
  const history = context.messages
    .filter((message) => message.sourceType === "session_history")
    .map((message) => textContent(message.content));
  const agentSettings = resolveWorldbookSettings(
    context.agentConfig?.worldbookSettings
  );

  const matched: MatchedEntry[] = [];
  worldbooks.forEach((worldbook, worldbookIndex) => {
    const bookSettings = resolveWorldbookSettings(worldbook.settings);
    worldbook.entries.forEach((entry) => {
      if (!entry.enabled || !entry.content.trim()) return;
      let matchedKeys: string[] = [];
      if (!entry.constant) {
        const scanText = history
          .slice(-effectiveScanDepth(entry, bookSettings, agentSettings))
          .join("\n");
        matchedKeys = entry.keys.filter((key) =>
          matchesKey(scanText, key, entry)
        );
        if (matchedKeys.length === 0) return;
        if (!passesSelective(entry, scanText)) return;
      }
      if (!passesProbability(entry, random)) return;
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
    role: item.entry.role ?? "system",
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

function characterAnchorIndex(messages: ProcessableMessage[]): number {
  const index = messages.findIndex(
    (message) =>
      message.sourceType === "agent_preset" && message.role === "system"
  );
  return index >= 0 ? index : firstHistoryIndex(messages);
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

  const beforeCharacter = matched.filter(
    (item) => item.entry.position === "before_character"
  );
  if (beforeCharacter.length) {
    context.messages.splice(
      characterAnchorIndex(context.messages),
      0,
      ...beforeCharacter.map(toMessage)
    );
  }

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
    const index = characterAnchorIndex(context.messages) + 1;
    context.messages.splice(index, 0, ...afterCharacter.map(toMessage));
  }

  const afterHistory = matched.filter(
    (item) => item.entry.position === "after_history"
  );
  if (afterHistory.length) {
    context.messages.splice(
      firstHistoryIndex(context.messages) + 1,
      0,
      ...afterHistory.map(toMessage)
    );
  }

  // outlet 不注入消息列表，仅保留在激活结果中（移动端暂不支持 Outlet 宏提取）。

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
  worldbooks: readonly MobileWorldbook[],
  options: InjectWorldbookOptions = {}
): MatchedEntry[] {
  const random = options.random ?? Math.random;
  const matched = matchEntries(context, worldbooks, random);
  injectEntries(context, matched);
  return matched;
}

export const worldbookInjector: ContextProcessor = {
  id: PROCESSOR_ID,
  name: "关键词世界书注入器",
  description:
    "按 Agent 选择的世界书执行确定性关键词、次要关键词与概率匹配，并在预设和历史之间注入上下文。",
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
