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

/** 递归扫描硬性轮次上限，避免条目内容互相触发导致死循环。 */
const MAX_RECURSION_LOOPS = 20;

/** 递归缓冲段与历史窗口之间的分隔符，避免跨段关键词误匹配。 */
const RECURSION_SEPARATOR = "\x01";

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

interface ScanCandidate {
  entry: MobileWorldbookEntry;
  worldbook: MobileWorldbook;
  worldbookIndex: number;
  bookSettings: MobileWorldbookSettings;
}

/** 拼接历史窗口与递归缓冲；递归段以分隔符隔开，避免跨消息关键词误匹配。 */
function buildScanText(
  history: readonly string[],
  depth: number,
  recurseBuffer: readonly string[]
): string {
  const historyText = history.slice(-depth).join("\n");
  if (recurseBuffer.length === 0) return historyText;
  return (
    historyText +
    "\n" +
    RECURSION_SEPARATOR +
    "\n" +
    recurseBuffer.join("\n" + RECURSION_SEPARATOR + "\n")
  );
}

/**
 * 递归开关：Agent 级或任一书级明确 disableRecursion / recursive=false 时关闭。
 * ST 默认递归开启，因此 recursive 未定义视为开启，仅显式 false 才关闭。
 */
function resolveRecursionEnabled(
  agentSettings: MobileWorldbookSettings,
  worldbooks: readonly MobileWorldbook[]
): boolean {
  if (
    agentSettings.disableRecursion === true ||
    agentSettings.recursive === false
  ) {
    return false;
  }
  return worldbooks.every((worldbook) => {
    const bookSettings = resolveWorldbookSettings(worldbook.settings);
    return (
      bookSettings.disableRecursion !== true &&
      bookSettings.recursive !== false
    );
  });
}

/** 递归轮次上限：Agent 级优先，其次任一书级；未配置为 0（不限制）。 */
function resolveMaxRecursionSteps(
  agentSettings: MobileWorldbookSettings,
  worldbooks: readonly MobileWorldbook[]
): number {
  if (agentSettings.maxRecursionSteps !== undefined) {
    return agentSettings.maxRecursionSteps;
  }
  for (const worldbook of worldbooks) {
    const steps = resolveWorldbookSettings(worldbook.settings)
      .maxRecursionSteps;
    if (steps !== undefined) return steps;
  }
  return 0;
}

/**
 * 多轮递归扫描：
 * - INITIAL：按历史窗口做首轮关键词 / 次要关键词 / 概率匹配。
 * - RECURSION：把上一轮新激活且未 preventRecursion 的条目内容拼进扫描文本，
 *   再次匹配未激活条目；excludeRecursion / preventRecursion 条目仅在首轮参与，
 *   delayUntilRecursion 条目仅在递归轮且层级提升到位后参与。
 * - DONE：本轮无新增激活且无待提升的 delay 层级。
 */
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

  const candidates: ScanCandidate[] = [];
  worldbooks.forEach((worldbook, worldbookIndex) => {
    const bookSettings = resolveWorldbookSettings(worldbook.settings);
    worldbook.entries.forEach((entry) => {
      if (!entry.enabled || !entry.content.trim()) return;
      candidates.push({ entry, worldbook, worldbookIndex, bookSettings });
    });
  });

  const recursionEnabled = resolveRecursionEnabled(agentSettings, worldbooks);
  const maxRecursionSteps = resolveMaxRecursionSteps(agentSettings, worldbooks);

  // 延迟递归层级按升序分层提升；无 delayUntilRecursion 条目时列表为空。
  const delayLevels = [
    ...new Set(
      candidates
        .filter((candidate) => candidate.entry.delayUntilRecursion)
        .map((candidate) => candidate.entry.delayUntilRecursionLevel ?? 1)
    ),
  ].sort((left, right) => left - right);
  let currentDelayLevel = delayLevels.length > 0 ? delayLevels[0] : 0;
  let nextDelayIndex = 1;

  const activated = new Map<string, MatchedEntry>();
  const recurseBuffer: string[] = [];
  let scanState: "INITIAL" | "RECURSION" | "DONE" = "INITIAL";
  let loopCount = 0;

  while (scanState !== "DONE") {
    if (maxRecursionSteps > 0 && loopCount >= maxRecursionSteps) break;
    if (loopCount >= MAX_RECURSION_LOOPS) break;

    loopCount++;
    const newlyActivated: MatchedEntry[] = [];

    for (const candidate of candidates) {
      const { entry } = candidate;
      const activationKey = `${candidate.worldbook.id}:${entry.id}`;
      if (activated.has(activationKey)) continue;

      if (entry.delayUntilRecursion) {
        // 延迟条目只在递归轮、且层级提升到位后才参与。
        if (!recursionEnabled || scanState !== "RECURSION") continue;
        if ((entry.delayUntilRecursionLevel ?? 1) > currentDelayLevel) continue;
      } else if (scanState === "RECURSION" && entry.excludeRecursion === true) {
        // excludeRecursion 条目不被其他条目的递归激活，只在 INITIAL 轮有机会。
        continue;
      }

      let matchedKeys: string[] = [];
      if (!entry.constant) {
        const scanText = buildScanText(
          history,
          effectiveScanDepth(entry, candidate.bookSettings, agentSettings),
          recurseBuffer
        );
        matchedKeys = entry.keys.filter((key) =>
          matchesKey(scanText, key, entry)
        );
        if (matchedKeys.length === 0) continue;
        if (!passesSelective(entry, scanText)) continue;
      }
      if (!passesProbability(entry, random)) continue;

      newlyActivated.push({
        entry,
        worldbookId: candidate.worldbook.id,
        worldbookName: candidate.worldbook.name,
        worldbookIndex: candidate.worldbookIndex,
        matchedKeys,
      });
    }

    if (newlyActivated.length > 0) {
      let addedForRecursion = false;
      for (const item of newlyActivated) {
        activated.set(`${item.worldbookId}:${item.entry.id}`, item);
        if (recursionEnabled && item.entry.preventRecursion !== true) {
          recurseBuffer.push(item.entry.content);
          addedForRecursion = true;
        }
      }
      if (addedForRecursion) {
        scanState = "RECURSION";
      } else if (recursionEnabled && nextDelayIndex < delayLevels.length) {
        currentDelayLevel = delayLevels[nextDelayIndex++];
        scanState = "RECURSION";
      } else {
        scanState = "DONE";
      }
    } else if (recursionEnabled && nextDelayIndex < delayLevels.length) {
      // 本轮无新增激活，但仍有待提升的 delay 层级。
      currentDelayLevel = delayLevels[nextDelayIndex++];
      scanState = "RECURSION";
    } else {
      scanState = "DONE";
    }
  }

  return [...activated.values()].sort(
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
    "按 Agent 选择的世界书执行确定性关键词、次要关键词与概率匹配，并按递归扫描激活关联条目后注入上下文。",
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
