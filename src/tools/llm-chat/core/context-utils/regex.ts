/**
 * Chat 正则规则解析核心算法
 */

import type {
  ChatRegexConfig,
  ChatRegexRule,
  MessageRole,
} from "../../types/chatRegex";

/**
 * 从多个配置源收集适用于特定阶段的所有已启用规则
 * (不过滤 role 和 depth，用于缓存)
 */
export function resolveRawRules(
  stage: "render" | "request",
  ...configs: (ChatRegexConfig | undefined)[]
): ChatRegexRule[] {
  type WeightedRule = {
    rule: ChatRegexRule;
    priority: number;
    order: number;
  };

  const weightedRules: WeightedRule[] = [];

  for (const config of configs) {
    if (!config?.presets) continue;

    const enabledPresets = config.presets
      .filter((preset) => preset.enabled)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const preset of enabledPresets) {
      const applicableRules = preset.rules.filter(
        (rule) => rule.enabled && rule.applyTo[stage],
      );

      for (const rule of applicableRules) {
        weightedRules.push({
          rule,
          priority: preset.priority ?? 100,
          order: rule.order ?? 0,
        });
      }
    }
  }

  weightedRules.sort((a, b) => {
    const priorityDiff = a.priority - b.priority;
    if (priorityDiff !== 0) return priorityDiff;
    return a.order - b.order;
  });

  return weightedRules.map((w) => w.rule);
}

/**
 * 根据消息角色过滤规则
 */
export function filterRulesByRole(
  rules: ChatRegexRule[],
  role: MessageRole,
): ChatRegexRule[] {
  return rules.filter((rule) => rule.targetRoles.includes(role));
}

/**
 * 根据消息深度过滤规则
 */
export function filterRulesByDepth(
  rules: ChatRegexRule[],
  depth: number,
): ChatRegexRule[] {
  return rules.filter((rule) => {
    if (!rule.depthRange) return true;
    const { min, max } = rule.depthRange;
    if (min !== undefined && depth < min) return false;
    if (max !== undefined && depth > max) return false;
    return true;
  });
}

/**
 * 构建缓存键
 */
export function buildCacheKey(
  agentId: string | undefined | null,
  userId: string | undefined | null,
  stage: "render" | "request",
): string {
  return `${agentId || "none"}|${userId || "none"}|${stage}`;
}
