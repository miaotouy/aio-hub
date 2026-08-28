// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 模型元数据默认配置
 *
 * 这个文件定义了所有预设的模型元数据匹配规则。
 * 当前主要包含图标和分组信息，未来可以扩展更多属性。
 */

import type {
  ModelMetadataRule,
  ModelMetadataProperties,
} from "../types/model-metadata";
import {
  getMatchedRuleChain as getCoreMatchedRuleChain,
  mergeRuleProperties,
  testRuleMatch as testCoreRuleMatch,
} from "@aiohub/model-metadata-core";
import { PRESET_ICONS, AVAILABLE_ICONS } from "./preset-icons";
import { DEFAULT_METADATA_RULES as PRESET_RULES } from "./model-metadata-presets";

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
  return testCoreRuleMatch(rule, { modelId, provider });
}

/**
 * 获取模型的规则合并链。共享核心保证桌面、移动端和覆盖分析顺序一致。
 */
export function getMatchedRuleChain(
  rules: ModelMetadataRule[],
  modelId: string,
  provider?: string
): ModelMetadataRule[] {
  return getCoreMatchedRuleChain(rules, { modelId, provider });
}

export function getMatchedModelProperties(
  rules: ModelMetadataRule[],
  modelId: string,
  provider?: string
): ModelMetadataProperties | undefined {
  return mergeRuleProperties(getMatchedRuleChain(rules, modelId, provider));
}

/**
 * Resolve a bundled icon by an identifier without consulting metadata rules.
 * This is suitable only for legacy display fallbacks; persisted model.icon
 * remains authoritative for configured models.
 */
export function getBundledModelIconPath(
  modelId: string,
  provider?: string
): string | undefined {
  // 模型 ID 是产品身份，优先于传输渠道/协议类型。
  // 例如 New API 返回 OpenAI 风格响应时，provider 可能是 openai，
  // 但 gemini-* 模型仍必须显示 Gemini 图标。
  const candidates = [
    modelId.toLowerCase(),
    ...modelId.toLowerCase().split(/[-_/]/),
    provider?.toLowerCase(),
  ].filter((candidate): candidate is string =>
    Boolean(candidate && candidate.length >= 2)
  );
  for (const candidate of new Set(candidates)) {
    const color = `/model-icons/${candidate}-color.svg`;
    const monochrome = `/model-icons/${candidate}.svg`;
    if ((AVAILABLE_ICONS as readonly string[]).includes(color)) return color;
    if ((AVAILABLE_ICONS as readonly string[]).includes(monochrome))
      return monochrome;
  }
  return undefined;
}

/** Resolve an explicit rule icon first, then use the static bundled-icon fallback. */
export function getModelIconPath(
  rules: ModelMetadataRule[],
  modelId: string,
  provider?: string
): string | undefined {
  const properties = getMatchedModelProperties(rules, modelId, provider);
  return properties?.icon ?? getBundledModelIconPath(modelId, provider);
}
/**
 * 规范化图标路径（向后兼容）
 * 确保预设图标路径都带有 /model-icons/ 前缀。
 * 如果输入是纯文件名，尝试补全前缀并检查是否存在。
 * @param iconPath 图标路径
 * @returns 规范化后的路径
 */
export function normalizeIconPath(iconPath: string): string {
  if (!iconPath || typeof iconPath !== "string") {
    return iconPath;
  }

  // 如果是纯文件名，尝试补全前缀
  if (!iconPath.includes("/") && !iconPath.includes("\\")) {
    const fullPath = `/model-icons/${iconPath}`;
    if ((AVAILABLE_ICONS as readonly string[]).includes(fullPath)) {
      return fullPath;
    }
  }

  return iconPath;
}

/**
 * 检查 /model-icons/ 路径是否存在于内置 Lobe 图标或本地图标库中。
 * @param iconPath 图标路径
 * @returns 是否存在
 */
export function isAvailableModelIconPath(iconPath: string): boolean {
  return (AVAILABLE_ICONS as readonly string[]).includes(iconPath);
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
  const hasValidExtension = validExtensions.some((ext) =>
    iconPath.toLowerCase().endsWith(ext)
  );

  if (iconPath.startsWith("/model-icons/")) {
    return isAvailableModelIconPath(iconPath);
  }

  return hasValidExtension;
}
