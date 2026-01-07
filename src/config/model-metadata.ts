/**
 * 模型元数据默认配置
 *
 * 这个文件定义了所有预设的模型元数据匹配规则。
 * 当前主要包含图标和分组信息，未来可以扩展更多属性。
 */

import type { ModelMetadataRule, ModelMetadataProperties } from "../types/model-metadata";
import { createModuleLogger } from "@utils/logger";
import { merge } from "lodash-es";
import { PRESET_ICONS, AVAILABLE_ICONS } from "./preset-icons";
import { DEFAULT_METADATA_RULES as PRESET_RULES } from "./model-metadata-presets";

// 创建模块日志器
const logger = createModuleLogger("model-metadata");

// 重新导出预设图标配置供外部使用
export { PRESET_ICONS };

/**
 * 默认元数据规则配置
 * 
 * 从 model-metadata-presets.ts 导入纯数据定义
 */
export const DEFAULT_METADATA_RULES: ModelMetadataRule[] = PRESET_RULES;

/**
 * 测试规则是否匹配模型
 * @param rule 规则对象
 * @param modelId 模型 ID
 * @param provider 提供商（可选）
 * @returns 是否匹配
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
          logger.warn("无效的正则表达式模式", {
            ruleId: rule.id,
            matchValue: rule.matchValue,
            error: e instanceof Error ? e.message : String(e),
          });
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
          logger.warn("无效的正则表达式模式", {
            ruleId: rule.id,
            matchValue: rule.matchValue,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      } else {
        // 对整个模型 ID 进行不区分大小写的包含匹配，以兼容 user/model-name 格式
        matched = modelId.toLowerCase().includes(rule.matchValue.toLowerCase());
      }
      break;

    case "modelGroup":
      // modelGroup 已废弃，分组功能通过 properties.group 字段实现
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
 * @param modelId 模型 ID
 * @param provider 提供商
 * @param rules 元数据规则列表（可选，默认使用内置规则）
 * @returns 匹配的元数据属性对象或 undefined
 */
export function getMatchedModelProperties(
  modelId: string,
  provider?: string,
  rules: ModelMetadataRule[] = DEFAULT_METADATA_RULES
): ModelMetadataProperties | undefined {
  // 1. 过滤启用的规则并按优先级排序
  const sortedEnabledRules = rules
    .filter((r) => r.enabled !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // 2. 找出所有匹配的规则
  let matchedRules = sortedEnabledRules.filter((rule) => testRuleMatch(rule, modelId, provider));

  // 如果没有匹配的规则，直接返回
  if (matchedRules.length === 0) {
    return undefined;
  }

  // 3. 处理独占规则 (exclusive)
  const highestExclusiveRule = matchedRules.find((r) => r.exclusive === true);

  if (highestExclusiveRule) {
    const exclusivePriority = highestExclusiveRule.priority || 0;
    matchedRules = matchedRules.filter((r) => (r.priority || 0) >= exclusivePriority);
  }

  // 4. 按优先级从低到高合并属性
  const finalProperties = matchedRules
    .reverse()
    .reduce((acc, rule) => merge(acc, rule.properties), {} as ModelMetadataProperties);

  return finalProperties;
}

/**
 * 获取模型图标路径（向后兼容函数）
 * @param modelId 模型 ID
 * @param provider 提供商
 * @param rules 元数据规则列表（可选，默认使用内置规则）
 * @returns 图标路径或 undefined
 */
export function getModelIconPath(
  modelId: string,
  provider?: string,
  rules: ModelMetadataRule[] = DEFAULT_METADATA_RULES
): string | undefined {
  // 1. 尝试使用规则匹配
  const properties = getMatchedModelProperties(modelId, provider, rules);
  if (properties?.icon) {
    return properties.icon;
  }

  // 2. 规则未匹配到图标，尝试动态查找
  const candidates: string[] = [];

  if (provider) {
    candidates.push(provider.toLowerCase());
  }

  const normalizedModelId = modelId.toLowerCase();
  candidates.push(normalizedModelId);

  const parts = normalizedModelId.split(/[-_/]/);
  if (parts.length > 0) {
    candidates.push(...parts);
  }

  const uniqueCandidates = [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    if (candidate.length < 2) continue;

    const colorIcon = `${candidate}-color.svg`;
    const monoIcon = `${candidate}.svg`;

    if ((AVAILABLE_ICONS as readonly string[]).includes(colorIcon)) {
      return colorIcon;
    }

    if ((AVAILABLE_ICONS as readonly string[]).includes(monoIcon)) {
      return monoIcon;
    }
  }

  return undefined;
}

/**
 * 验证图标路径是否有效
 * @param iconPath 图标路径
 * @returns 是否有效
 */
/**
 * 规范化图标路径（向后兼容）
 * 将旧的带路径配置（如 /model-icons/xxx.png）转换为新的只有文件名的格式
 * @param iconPath 图标路径
 * @returns 规范化后的路径
 */
export function normalizeIconPath(iconPath: string): string {
  if (!iconPath || typeof iconPath !== "string") {
    return iconPath;
  }

  // 如果是以 /model-icons/ 开头的预设图标路径，截取文件名部分
  const PRESET_PREFIX = "/model-icons/";
  if (iconPath.startsWith(PRESET_PREFIX)) {
    return iconPath.substring(PRESET_PREFIX.length);
  }

  return iconPath;
}

/**
 * 验证图标路径是否有效
 * @param iconPath 图标路径
 * @returns 是否有效
 */
export function isValidIconPath(iconPath: string): boolean {
  if (!iconPath || typeof iconPath !== "string") {
    return false;
  }

  const validExtensions = [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"];
  const hasValidExtension = validExtensions.some((ext) => iconPath.toLowerCase().endsWith(ext));

  return hasValidExtension;
}
