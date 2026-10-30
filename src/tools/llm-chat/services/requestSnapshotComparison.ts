import type { TokenUsage } from "@aiohub/llm-core";
import type { ChatSessionDetail } from "../types/session";
import type {
  ChatRequestAttemptSnapshot,
  SnapshotContentPart,
  SnapshotMessageItem,
  SnapshotSource,
} from "../types/requestSnapshot";

export function defaultSnapshot(
  attempts: ChatRequestAttemptSnapshot[],
  nodeId: string | null
) {
  const matching = attempts.filter(
    (attempt) =>
      nodeId &&
      (attempt.assistantNodeIds.includes(nodeId) ||
        attempt.triggerNodeId === nodeId)
  );
  return (
    [...matching].reverse().find((attempt) => attempt.status === "completed") ??
    matching[matching.length - 1]
  );
}
export function ancestorNodeIds(
  detail: ChatSessionDetail | null,
  nodeId: string | null
): Set<string> {
  const ancestors = new Set<string>();
  let current = nodeId ? detail?.nodes[nodeId] : undefined;
  while (current && !ancestors.has(current.id)) {
    ancestors.add(current.id);
    current = current.parentId ? detail?.nodes[current.parentId] : undefined;
  }
  return ancestors;
}
export function defaultSnapshotBaseline(
  attempts: ChatRequestAttemptSnapshot[],
  selected: ChatRequestAttemptSnapshot,
  detail: ChatSessionDetail | null
) {
  const ancestors = ancestorNodeIds(
    detail,
    selected.triggerNodeId ?? selected.assistantNodeIds[0] ?? null
  );
  return [...attempts]
    .reverse()
    .find(
      (attempt) =>
        attempt.attemptId !== selected.attemptId &&
        attempt.startedAt <= selected.startedAt &&
        attempt.requestId !== selected.requestId &&
        attempt.assistantNodeIds.some((id) => ancestors.has(id))
    );
}
export function usageReadRatio(
  usage: TokenUsage | undefined
): number | undefined {
  if (
    !usage ||
    usage.isLocalEstimated ||
    !Object.keys(usage.reportedUsageFields ?? {}).some((key) =>
      /^(input_tokens|prompt_tokens|promptTokenCount)$/.test(key)
    ) ||
    usage.promptTokens <= 0 ||
    usage.promptTokensDetails?.cachedTokens === undefined
  )
    return undefined;
  return usage.promptTokensDetails.cachedTokens / usage.promptTokens;
}
const sourceIdentity = (source: SnapshotSource) =>
  JSON.stringify([
    source.sourceType ?? "unknown",
    source.sourceId ?? null,
    source.occurrence,
  ]);
function leaves(
  snapshot: ChatRequestAttemptSnapshot,
  keys: string[]
): SnapshotSource[] {
  const byKey = new Map(
    snapshot.sources.map((source) => [source.sourceKey, source])
  );
  const visited = new Set<string>();
  const result: SnapshotSource[] = [];
  function visit(key: string) {
    if (visited.has(key)) return;
    visited.add(key);
    const source = byKey.get(key);
    if (!source) return;
    if (source.parentSourceKeys?.length) source.parentSourceKeys.forEach(visit);
    else result.push(source);
  }
  keys.forEach(visit);
  return result;
}
export function compareSnapshotParts(
  before: SnapshotContentPart[],
  after: SnapshotContentPart[]
) {
  let firstPart = 0;
  while (
    firstPart < Math.min(before.length, after.length) &&
    before[firstPart].contentHash === after[firstPart].contentHash
  )
    firstPart++;
  const left = before[firstPart];
  const right = after[firstPart];
  let commonCharacters = 0;
  let prefixQuality: "exact" | "lowerBound" | "unavailable" = "unavailable";
  if (
    left?.textPreview !== undefined &&
    right?.textPreview !== undefined &&
    left.textState !== "redacted" &&
    right.textState !== "redacted"
  ) {
    const length = Math.min(left.textPreview.length, right.textPreview.length);
    while (
      commonCharacters < length &&
      left.textPreview[commonCharacters] === right.textPreview[commonCharacters]
    )
      commonCharacters++;
    // Avoid counting half a Unicode surrogate pair as a character.
    if (
      commonCharacters > 0 &&
      /[\uD800-\uDBFF]/.test(left.textPreview[commonCharacters - 1])
    )
      commonCharacters--;
    prefixQuality =
      left.textState === "full" && right.textState === "full"
        ? "exact"
        : "lowerBound";
  }
  return { firstPart, left, right, commonCharacters, prefixQuality };
}
export function compareRequestSnapshots(
  before: ChatRequestAttemptSnapshot,
  after: ChatRequestAttemptSnapshot
) {
  const configurationChanges: string[] = [];
  if (before.route.actualModelId !== after.route.actualModelId)
    configurationChanges.push("实际模型变化");
  if (before.route.actualProfileId !== after.route.actualProfileId)
    configurationChanges.push("渠道配置身份变化");
  if (
    before.route.adapterId !== after.route.adapterId ||
    before.route.providerType !== after.route.providerType
  )
    configurationChanges.push("请求协议变化");
  if (before.route.cacheScopeFingerprint !== after.route.cacheScopeFingerprint)
    configurationChanges.push("缓存范围配置变化");
  const toolsChanged =
    before.nativeToolsDigest?.schemaHash !==
    after.nativeToolsDigest?.schemaHash;
  const systemChanged =
    before.topLevelSystem?.wireHash !== after.topLevelSystem?.wireHash;
  const optionsChanged = before.promptOptionsHash !== after.promptOptionsHash;
  if (toolsChanged) configurationChanges.push("工具定义变化");
  if (optionsChanged) configurationChanges.push("输入配置变化");
  let firstDiffIndex = 0;
  while (
    firstDiffIndex < Math.min(before.messages.length, after.messages.length) &&
    before.messages[firstDiffIndex].role ===
      after.messages[firstDiffIndex].role &&
    before.messages[firstDiffIndex].wireHash ===
      after.messages[firstDiffIndex].wireHash
  )
    firstDiffIndex++;
  const boundaryEqual =
    firstDiffIndex === before.messages.length &&
    firstDiffIndex === after.messages.length;
  const leadingEqual =
    !toolsChanged &&
    !systemChanged &&
    !optionsChanged &&
    configurationChanges.length === 0;
  const summaryOnly =
    before.captureQuality === "summaryOnly" ||
    after.captureQuality === "summaryOnly";
  const kind =
    before.inputHash === after.inputHash
      ? "equal"
      : summaryOnly
        ? "summary"
        : leadingEqual &&
            firstDiffIndex === before.messages.length &&
            after.messages.length > before.messages.length
          ? "append"
          : leadingEqual &&
              firstDiffIndex === after.messages.length &&
              before.messages.length > after.messages.length
            ? "shorten"
            : "changed";
  const left: SnapshotMessageItem | undefined = before.messages[firstDiffIndex];
  const right: SnapshotMessageItem | undefined = after.messages[firstDiffIndex];
  const partDiff = systemChanged
    ? compareSnapshotParts(
        before.topLevelSystem?.parts ?? [],
        after.topLevelSystem?.parts ?? []
      )
    : compareSnapshotParts(left?.parts ?? [], right?.parts ?? []);
  const causes: string[] = [];
  const oldSources = new Map(
    before.sources.map((source) => [sourceIdentity(source), source])
  );
  const newSources = new Map(
    after.sources.map((source) => [sourceIdentity(source), source])
  );
  for (const source of after.sources) {
    const old = oldSources.get(sourceIdentity(source));
    if (source.sourceType === "merged") continue;
    if (old?.executedMacros && source.executedMacros) {
      const macroKey = (macro: { name: string; occurrence: number }) =>
        `${macro.name}:${macro.occurrence}`;
      const beforeMacros = new Map(
        old.executedMacros.map((macro) => [macroKey(macro), macro])
      );
      const afterMacros = new Map(
        source.executedMacros.map((macro) => [macroKey(macro), macro])
      );
      const changed = [
        ...new Set([...beforeMacros.keys(), ...afterMacros.keys()]),
      ]
        .filter(
          (key) =>
            beforeMacros.get(key)?.outputHash !==
            afterMacros.get(key)?.outputHash
        )
        .map((key) => (afterMacros.get(key) ?? beforeMacros.get(key))!.name);
      if (changed.length)
        causes.push(`动态宏结果变化：${[...new Set(changed)].join("、")}`);
    }
    if (
      old &&
      source.sourceType === "session_history" &&
      old.contentHash !== source.contentHash
    )
      causes.push("历史来源内容变化");
    if (
      ["recall", "worldbook"].includes(source.sourceType ?? "") &&
      (!old || old.contentHash !== source.contentHash)
    )
      causes.push(
        `${source.sourceType === "recall" ? "Recall" : "世界书"}注入内容变化`
      );
  }
  const removed = before.sources.filter(
    (source) =>
      source.sourceType === "session_history" &&
      !newSources.has(sourceIdentity(source))
  );
  if (removed.length)
    causes.push(`先前输入中的 ${removed.length} 条历史来源已移出当前输入`);
  const oldLeaves = leaves(before, left?.sourceKeys ?? []);
  const newLeaves = leaves(after, right?.sourceKeys ?? []);
  if (
    left &&
    right &&
    newLeaves.length > oldLeaves.length &&
    oldLeaves.length > 0 &&
    oldLeaves.every(
      (source, index) =>
        sourceIdentity(source) === sourceIdentity(newLeaves[index]) &&
        source.contentHash === newLeaves[index].contentHash
    )
  )
    causes.push("消息合并扩展了末条内容");
  const positionMap = new Map<string, number>();
  before.messages.forEach((message, index) =>
    leaves(before, message.sourceKeys).forEach((source) =>
      positionMap.set(sourceIdentity(source), index)
    )
  );
  const moved = after.messages.some((message, index) =>
    leaves(after, message.sourceKeys).some((source) => {
      const key = sourceIdentity(source);
      return (
        oldSources.get(key)?.contentHash === source.contentHash &&
        positionMap.has(key) &&
        positionMap.get(key) !== index
      );
    })
  );
  if (moved) causes.push("正文稳定的来源在消息列表中发生位置移动");
  const relatedKeys = systemChanged
    ? (after.topLevelSystem?.sourceKeys ?? [])
    : (right?.sourceKeys ?? []);
  if (kind !== "equal" && !relatedKeys.length && !summaryOnly && !boundaryEqual)
    causes.push("变化片段的来源待确认");
  return {
    kind,
    firstDiffIndex,
    boundaryEqual,
    configurationChanges,
    systemChanged,
    toolsChanged,
    optionsChanged,
    partDiff,
    causes: [...new Set(causes)],
    summaryOnly,
    sources: leaves(after, relatedKeys),
  };
}
