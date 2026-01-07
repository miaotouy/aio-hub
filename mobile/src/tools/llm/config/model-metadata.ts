/**
 * 模型元数据匹配规则配置
 */
import type { ModelMetadataRule, ModelMetadataProperties } from "../types/model-metadata";
import { merge } from "lodash-es";
import { DEFAULT_METADATA_RULES as PRESET_RULES } from "@shared/config/model-metadata-presets";

/**
 * 默认元数据规则配置
 * 
 * 移动端直接复用桌面端的预设规则定义
 * 使用类型断言解决跨项目类型引用时的 TS 不匹配问题
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