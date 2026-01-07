/**
 * 模型元数据匹配规则配置 (移动端 - 复用桌面端配置)
 */
import type { ModelMetadataRule, ModelMetadataProperties } from "../types/model-metadata";
import { merge } from "lodash-es";
import { DEFAULT_METADATA_RULES as PRESET_RULES } from "@shared/config/model-metadata-presets";
import { AVAILABLE_ICONS } from "./preset-icons";

/**
 * 默认元数据规则配置
 */
export const DEFAULT_METADATA_RULES = PRESET_RULES as unknown as ModelMetadataRule[];

/**
 * 测试规则是否匹配模型
 */
export function testRuleMatch(
  rule: ModelMetadataRule,
  modelId: string,
  provider?: string
): boolean {
  let matched = false;

  switch (rule.matchType) {
    case "model":
      if (rule.useRegex) {
        try {
          const regex = new RegExp(rule.matchValue, "i");
          matched = regex.test(modelId);
        } catch (e) {
          matched = false;
        }
      } else {
        matched = modelId === rule.matchValue;
      }
      break;

    case "modelPrefix":
      if (rule.useRegex) {
        try {
          const regex = new RegExp(rule.matchValue, "i");
          matched = regex.test(modelId);
        } catch (e) {
          matched = false;
        }
      } else {
        matched = modelId.toLowerCase().includes(rule.matchValue.toLowerCase());
      }
      break;

    case "provider":
      if (provider && provider.toLowerCase() === rule.matchValue.toLowerCase()) {
        matched = true;
      }
      break;
  }

  return matched;
}

/**
 * 获取匹配模型的元数据属性
 */
export function getMatchedModelProperties(
  modelId: string,
  provider?: string,
  rules: ModelMetadataRule[] = DEFAULT_METADATA_RULES
): ModelMetadataProperties | undefined {
  const sortedEnabledRules = rules
    .filter((r) => r.enabled !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  let matchedRules = sortedEnabledRules.filter((rule) => testRuleMatch(rule, modelId, provider));

  if (matchedRules.length === 0) {
    return undefined;
  }

  const highestExclusiveRule = matchedRules.find((r) => r.exclusive === true);

  if (highestExclusiveRule) {
    const exclusivePriority = highestExclusiveRule.priority || 0;
    matchedRules = matchedRules.filter((r) => (r.priority || 0) >= exclusivePriority);
  }

  const finalProperties = matchedRules
    .reverse()
    .reduce((acc, rule) => merge(acc, rule.properties), {} as ModelMetadataProperties);

  return finalProperties;
}

/**
 * 获取模型图标路径
 */
export function getModelIconPath(
  modelId: string,
  provider?: string,
  rules: ModelMetadataRule[] = DEFAULT_METADATA_RULES
): string | undefined {
  const properties = getMatchedModelProperties(modelId, provider, rules);
  if (properties?.icon) {
    return properties.icon;
  }

  const candidates: string[] = [];
  if (provider) candidates.push(provider.toLowerCase());
  
  const normalizedModelId = modelId.toLowerCase();
  candidates.push(normalizedModelId);

  const parts = normalizedModelId.split(/[-_/]/);
  if (parts.length > 0) candidates.push(...parts);

  const uniqueCandidates = [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    if (candidate.length < 2) continue;

    const colorIcon = `${candidate}-color.svg`;
    const monoIcon = `${candidate}.svg`;

    if ((AVAILABLE_ICONS as readonly string[]).includes(colorIcon)) return colorIcon;
    if ((AVAILABLE_ICONS as readonly string[]).includes(monoIcon)) return monoIcon;
  }

  return undefined;
}

/**
 * 规范化图标路径
 */
export function normalizeIconPath(iconPath: string): string {
  if (!iconPath || typeof iconPath !== "string") return iconPath;

  const PRESET_PREFIX = "/model-icons/";
  if (iconPath.startsWith(PRESET_PREFIX)) {
    return iconPath.substring(PRESET_PREFIX.length);
  }

  return iconPath;
}

/**
 * 验证图标路径是否有效
 */
export function isValidIconPath(iconPath: string): boolean {
  if (!iconPath || typeof iconPath !== "string") return false;
  const validExtensions = [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"];
  return validExtensions.some((ext) => iconPath.toLowerCase().endsWith(ext));
}