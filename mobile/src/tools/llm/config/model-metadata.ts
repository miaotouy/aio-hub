/**
 * 模型元数据匹配规则配置
 */
import type { ModelMetadataRule, ModelMetadataProperties } from "../types/model-metadata";
import { PRESET_ICONS_DIR } from "./preset-icons";
import { merge } from "lodash-es";

/**
 * 默认元数据规则配置
 */
export const DEFAULT_METADATA_RULES: ModelMetadataRule[] = [
  // === 能力自动匹配 ===
  {
    id: "capability-vision",
    matchType: "modelPrefix",
    matchValue: "vision|visual|multimodal|vlm|vl",
    useRegex: true,
    properties: {
      capabilities: { vision: true },
    },
    priority: 5,
    enabled: true,
  },
  {
    id: "capability-thinking",
    matchType: "modelPrefix",
    matchValue: "think|extended-thinking|reason|reasoning",
    useRegex: true,
    properties: {
      capabilities: { thinking: true },
    },
    priority: 5,
    enabled: true,
  },

  // === Provider 级别匹配 ===
  {
    id: "provider-openai",
    matchType: "provider",
    matchValue: "openai",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
    },
    priority: 10,
    enabled: true,
  },
  {
    id: "provider-anthropic",
    matchType: "provider",
    matchValue: "anthropic",
    properties: {
      icon: `${PRESET_ICONS_DIR}/claude-color.svg`,
      group: "Claude",
    },
    priority: 10,
    enabled: true,
  },
  {
    id: "provider-google",
    matchType: "provider",
    matchValue: "google",
    properties: {
      icon: `${PRESET_ICONS_DIR}/gemini-color.svg`,
      group: "Gemini",
    },
    priority: 10,
    enabled: true,
  },
  {
    id: "provider-deepseek",
    matchType: "provider",
    matchValue: "deepseek",
    properties: {
      icon: `${PRESET_ICONS_DIR}/deepseek-color.svg`,
      group: "DeepSeek",
    },
    priority: 10,
    enabled: true,
  },
  {
    id: "provider-qwen",
    matchType: "provider",
    matchValue: "qwen",
    properties: {
      icon: `${PRESET_ICONS_DIR}/qwen-color.svg`,
      group: "Qwen",
    },
    priority: 10,
    enabled: true,
  },

  // === Model Prefix 级别匹配 ===
  {
    id: "model-prefix-gpt-4o",
    matchType: "modelPrefix",
    matchValue: "gpt-4o",
    properties: {
      icon: `${PRESET_ICONS_DIR}/openai.svg`,
      group: "OpenAI",
      tokenizer: "gpt4o",
      capabilities: {
        vision: true,
        toolUse: true,
        jsonOutput: true,
        document: true,
      },
    },
    priority: 25,
    enabled: true,
  },
  {
    id: "model-prefix-claude-3",
    matchType: "modelPrefix",
    matchValue: "claude-3",
    properties: {
      icon: `${PRESET_ICONS_DIR}/claude-color.svg`,
      group: "Claude",
      tokenizer: "claude",
      capabilities: {
        vision: true,
        thinking: true,
        toolUse: true,
        document: true,
      },
    },
    priority: 25,
    enabled: true,
  },
  {
    id: "model-prefix-deepseek-v3",
    matchType: "modelPrefix",
    matchValue: "deepseek-v3",
    properties: {
      icon: `${PRESET_ICONS_DIR}/deepseek-color.svg`,
      group: "DeepSeek",
      tokenizer: "deepseek_v3",
      capabilities: {
        thinking: true,
        jsonOutput: true,
      },
    },
    priority: 25,
    enabled: true,
  },
];

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