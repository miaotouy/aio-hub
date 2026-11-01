import type { MetadataProperties, ModelMetadataRule } from "../types";

export interface MetadataSourceDefinition {
  id: string;
  name: string;
  description: string;
  url: string;
  homepage: string;
  license: string;
}

export interface ParsedMetadataCatalog<
  TProperties extends MetadataProperties = MetadataProperties,
> {
  sourceId: string;
  revision: string;
  generatedAt: string;
  rules: ModelMetadataRule<TProperties>[];
  warnings: string[];
}

export interface MetadataSourceAdapter<
  TProperties extends MetadataProperties = MetadataProperties,
> {
  definition: MetadataSourceDefinition;
  parse(payload: unknown, now?: string): ParsedMetadataCatalog<TProperties>;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function lastSegment(value: string): string {
  const parts = value.split("/");
  return parts[parts.length - 1]?.trim() ?? "";
}

export function slug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, 64) || "model";
}

export function compactObject<T extends Record<string, unknown>>(
  value: T
): T | undefined {
  const entries = Object.entries(value).filter(
    ([, item]) =>
      item !== undefined &&
      item !== null &&
      !(item && typeof item === "object" && Object.keys(item).length === 0)
  );
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}
