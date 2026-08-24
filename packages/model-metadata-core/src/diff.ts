import { deepEqual } from "./fingerprint";
import type {
  BuiltinRuleDiff,
  CatalogUpdateResult,
  CatalogUpdateSelection,
  MetadataCatalogSnapshot,
  MetadataFieldDiff,
  MetadataProperties,
  ModelMetadataRule,
  ModelMetadataStoreV3,
} from "./types";

function getAtPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, segment) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[segment]
          : undefined,
      value
    );
}

function collectPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return prefix ? [prefix] : [];
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return prefix ? [prefix] : [];
  return entries.flatMap(([key, child]) =>
    collectPaths(child, prefix ? `${prefix}.${key}` : key)
  );
}

function diffFields(
  base: unknown,
  local: unknown,
  incoming: unknown
): MetadataFieldDiff[] {
  const paths = new Set([
    ...collectPaths(base),
    ...collectPaths(local),
    ...collectPaths(incoming),
  ]);
  return [...paths].sort().map((path) => {
    const baseValue = getAtPath(base, path);
    const localValue = getAtPath(local, path);
    const incomingValue = getAtPath(incoming, path);
    const kind = deepEqual(incomingValue, baseValue)
      ? "unchanged"
      : deepEqual(localValue, baseValue)
        ? "upstream"
        : deepEqual(localValue, incomingValue)
          ? "unchanged"
          : "conflict";
    return {
      path,
      base: baseValue,
      local: localValue,
      incoming: incomingValue,
      kind,
    };
  });
}

export function diffBuiltinCatalog<TProperties extends MetadataProperties>(
  store: ModelMetadataStoreV3<TProperties>,
  incomingRules: ModelMetadataRule<TProperties>[]
): BuiltinRuleDiff<TProperties>[] {
  const baseById = new Map(
    store.sourceSnapshot.rules.map((rule) => [rule.id, rule])
  );
  const incomingById = new Map(incomingRules.map((rule) => [rule.id, rule]));
  const ids = new Set([...baseById.keys(), ...incomingById.keys()]);
  return [...ids].sort().map((id) => {
    const base = baseById.get(id);
    const incoming = incomingById.get(id);
    const local = base ? (store.builtinOverrides[id] ?? base) : undefined;
    if (!base && incoming) return { id, status: "added", incoming, fields: [] };
    if (base && !incoming)
      return { id, status: "removed", base, local, fields: [] };
    const fields = diffFields(base, local, incoming);
    const hasConflict = fields.some((field) => field.kind === "conflict");
    const hasUpstream = fields.some((field) => field.kind === "upstream");
    const hasLocal = !deepEqual(base, local) && !hasConflict;
    return {
      id,
      status: hasConflict
        ? "conflict"
        : hasUpstream
          ? "upstream"
          : hasLocal
            ? "local"
            : "unchanged",
      base,
      local,
      incoming,
      fields,
    };
  });
}

function cloneRule<TProperties extends MetadataProperties>(
  rule: ModelMetadataRule<TProperties>
): ModelMetadataRule<TProperties> {
  return JSON.parse(JSON.stringify(rule)) as ModelMetadataRule<TProperties>;
}

function setAtPath(target: unknown, path: string, value: unknown): void {
  const segments = path.split(".");
  if (
    segments.some(
      (segment) =>
        segment === "__proto__" ||
        segment === "constructor" ||
        segment === "prototype"
    )
  ) {
    throw new Error(`Unsafe catalog update path: ${path}`);
  }
  let current = target as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  const finalSegment = segments[segments.length - 1];
  if (value === undefined) delete current[finalSegment];
  else current[finalSegment] = JSON.parse(JSON.stringify(value));
}

function nextCustomRuleId<TProperties extends MetadataProperties>(
  originalId: string,
  customRules: ModelMetadataRule<TProperties>[]
): string {
  const base = `custom-${originalId.replace(/^custom-/, "")}`;
  const occupied = new Set(customRules.map((rule) => rule.id));
  if (!occupied.has(base)) return base;
  let index = 2;
  while (occupied.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

/**
 * Commit an explicitly resolved built-in catalog update. The incoming snapshot
 * becomes the new accepted source baseline; a kept local value is represented
 * as an explicit override, while a removed built-in can be retained as a
 * user-owned custom rule.
 */
export function applyBuiltinCatalogUpdate<
  TProperties extends MetadataProperties,
>(
  store: ModelMetadataStoreV3<TProperties>,
  incomingSnapshot: MetadataCatalogSnapshot<TProperties>,
  selections: CatalogUpdateSelection[] = []
): CatalogUpdateResult<TProperties> {
  const ruleSelectionById = new Map(
    selections
      .filter((selection) => !selection.path)
      .map((selection) => [selection.id, selection.resolution])
  );
  const fieldSelectionByKey = new Map(
    selections
      .filter(
        (selection): selection is CatalogUpdateSelection & { path: string } =>
          Boolean(selection.path)
      )
      .map((selection) => [
        `${selection.id}:${selection.path}`,
        selection.resolution,
      ])
  );
  const diffs = diffBuiltinCatalog(store, incomingSnapshot.rules);
  const incomingIds = new Set(incomingSnapshot.rules.map((rule) => rule.id));
  const builtinOverrides = { ...store.builtinOverrides };
  const suppressedBuiltinRuleIds = new Set(
    store.suppressedBuiltinRuleIds.filter((id) => incomingIds.has(id))
  );
  const customRules = store.customRules.map(cloneRule);
  const appliedRuleIds: string[] = [];
  const retainedAsCustomRuleIds: string[] = [];

  for (const diff of diffs) {
    const resolution = ruleSelectionById.get(diff.id);
    const local = diff.local ?? diff.base;

    if (diff.status === "conflict") {
      const incoming = diff.incoming;
      if (!incoming || !local) {
        throw new Error(`Conflict "${diff.id}" has incomplete rule data`);
      }
      const nextOverride = cloneRule(incoming);
      for (const field of diff.fields) {
        if (field.kind === "local") {
          setAtPath(nextOverride, field.path, field.local);
          continue;
        }
        if (field.kind !== "conflict") continue;
        const fieldResolution =
          resolution ?? fieldSelectionByKey.get(`${diff.id}:${field.path}`);
        if (
          fieldResolution !== "acceptIncoming" &&
          fieldResolution !== "keepLocal"
        ) {
          throw new Error(
            `Conflict field "${diff.id}:${field.path}" requires an explicit resolution`
          );
        }
        if (fieldResolution === "keepLocal") {
          setAtPath(nextOverride, field.path, field.local);
        }
      }
      if (deepEqual(nextOverride, incoming)) delete builtinOverrides[diff.id];
      else builtinOverrides[diff.id] = nextOverride;
      suppressedBuiltinRuleIds.delete(diff.id);
      appliedRuleIds.push(diff.id);
      continue;
    }

    if (diff.status === "removed") {
      if (resolution === "keepAsCustom" && local) {
        const customRule = cloneRule(local);
        customRule.id = nextCustomRuleId(diff.id, customRules);
        customRule.createdAt = customRule.createdAt ?? store.updatedAt;
        customRule.updatedAt = store.updatedAt;
        customRules.push(customRule);
        retainedAsCustomRuleIds.push(customRule.id);
      }
      delete builtinOverrides[diff.id];
      suppressedBuiltinRuleIds.delete(diff.id);
      appliedRuleIds.push(diff.id);
      continue;
    }

    if (diff.status === "upstream" || diff.status === "added") {
      delete builtinOverrides[diff.id];
      appliedRuleIds.push(diff.id);
      continue;
    }

    if (diff.status === "local" && local) {
      builtinOverrides[diff.id] = cloneRule(local);
      appliedRuleIds.push(diff.id);
    }
  }

  return {
    store: {
      ...store,
      sourceSnapshot: incomingSnapshot,
      builtinOverrides,
      suppressedBuiltinRuleIds: [...suppressedBuiltinRuleIds].sort(),
      customRules,
    },
    appliedRuleIds,
    retainedAsCustomRuleIds,
  };
}
