/** Mobile metadata configuration. Matching and merging are provided by the shared pure core. */
import {
  getMatchedRuleChain,
  mergeRuleProperties,
  testRuleMatch as testCoreRuleMatch,
} from "@aiohub/model-metadata-core";
import type {
  ModelMetadataRule,
  ModelMetadataProperties,
} from "../types/model-metadata";
import { DEFAULT_METADATA_RULES as PRESET_RULES } from "@shared/config/model-metadata-presets";
import { AVAILABLE_ICONS } from "./preset-icons";

export const DEFAULT_METADATA_RULES: ModelMetadataRule[] = PRESET_RULES;

export function testRuleMatch(
  rule: ModelMetadataRule,
  modelId: string,
  provider?: string
): boolean {
  return testCoreRuleMatch(rule, { modelId, provider });
}

export function getMatchedModelProperties(
  modelId: string,
  provider?: string,
  rules: ModelMetadataRule[] = DEFAULT_METADATA_RULES
): ModelMetadataProperties | undefined {
  return mergeRuleProperties(getMatchedRuleChain(rules, { modelId, provider }));
}

export function getModelIconPath(
  modelId: string,
  provider?: string,
  rules: ModelMetadataRule[] = DEFAULT_METADATA_RULES
): string | undefined {
  const properties = getMatchedModelProperties(modelId, provider, rules);
  if (properties?.icon) return properties.icon;
  const candidates = [
    provider?.toLowerCase(),
    modelId.toLowerCase(),
    ...modelId.toLowerCase().split(/[-_/]/),
  ].filter((candidate): candidate is string =>
    Boolean(candidate && candidate.length >= 2)
  );
  for (const candidate of new Set(candidates)) {
    const color = `/model-icons/${candidate}-color.svg`;
    const mono = `/model-icons/${candidate}.svg`;
    if ((AVAILABLE_ICONS as readonly string[]).includes(color)) return color;
    if ((AVAILABLE_ICONS as readonly string[]).includes(mono)) return mono;
  }
  return undefined;
}

export function normalizeIconPath(iconPath: string): string {
  if (!iconPath || typeof iconPath !== "string") return iconPath;
  if (
    !iconPath.includes("/") &&
    !iconPath.includes("\\") &&
    (AVAILABLE_ICONS as readonly string[]).includes(iconPath)
  ) {
    return `/model-icons/${iconPath}`;
  }
  return iconPath;
}

export function isValidIconPath(iconPath: string): boolean {
  return (
    Boolean(iconPath) &&
    [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"].some((extension) =>
      iconPath.toLowerCase().endsWith(extension)
    )
  );
}
