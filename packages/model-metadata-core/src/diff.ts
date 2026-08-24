import { deepEqual } from "./fingerprint";
import type {
  BuiltinRuleDiff,
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
