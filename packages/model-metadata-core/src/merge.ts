import { deepClone, isSafePath } from "./fingerprint";
import type { MetadataProperties, ModelMetadataRule } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeInto(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = deepClone(target);
  for (const [key, value] of Object.entries(source)) {
    if (!isSafePath(key)) continue;
    const current = result[key];
    result[key] =
      isPlainObject(current) && isPlainObject(value)
        ? mergeInto(current, value)
        : deepClone(value);
  }
  return result;
}

function unsetPath(value: Record<string, unknown>, path: string): void {
  if (!isSafePath(path)) return;
  const parts = path.split(".");
  let current: Record<string, unknown> = value;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!isPlainObject(next)) return;
    current = next;
  }
  delete current[parts[parts.length - 1]];
}

export function mergeRuleProperties<TProperties extends MetadataProperties>(
  rules: ModelMetadataRule<TProperties>[]
): TProperties | undefined {
  if (rules.length === 0) return undefined;
  let result: Record<string, unknown> = {};
  for (const rule of rules) {
    result = mergeInto(result, rule.properties);
    for (const path of rule.unsetPaths ?? []) unsetPath(result, path);
  }
  return result as TProperties;
}
