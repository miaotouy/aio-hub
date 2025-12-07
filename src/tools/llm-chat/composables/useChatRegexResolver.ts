/**
 * Chat 正则规则解析器
 *
 * 实现 Message-Bound 策略的规则解析和缓存机制
 * 基于 AgentID + UserID + Stage 的 RuleSetCache
 *
 * @see design/chat-regex-pipeline.md
 */

import { ref } from 'vue';
import { createModuleLogger } from '@/utils/logger';
import { useAgentStore } from '../agentStore';
import { useUserProfileStore } from '../userProfileStore';
import { useChatSettings } from './useChatSettings';
import type { ChatMessageNode } from '../types';
import type { ChatRegexConfig, ChatRegexRule, MessageRole } from '../types/chatRegex';

const logger = createModuleLogger('llm-chat/regex-resolver');

/**
 * 规则集缓存
 * Key: `${agentId}|${userId}|${stage}`
 * Value: 预解析的规则列表 (未经深度过滤)
 */
const ruleSetCache = new Map<string, ChatRegexRule[]>();

/**
 * 缓存版本信号
 * 用于通知 Vue 响应式系统缓存已发生变化
 */
const cacheVersion = ref(0);

/**
 * 从多个配置源收集适用于特定阶段的所有已启用规则
 * (不过滤 role 和 depth，用于缓存)
 */
function resolveRawRules(
  stage: 'render' | 'request',
  ...configs: (ChatRegexConfig | undefined)[]
): ChatRegexRule[] {
  // 临时包装类型，用于排序
  type WeightedRule = {
    rule: ChatRegexRule;
    priority: number; // Preset priority (default 100)
    order: number; // Rule order (default 0)
  };

  const weightedRules: WeightedRule[] = [];

  for (const config of configs) {
    if (!config?.presets) continue;

    const enabledPresets = config.presets
      .filter((preset) => preset.enabled)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const preset of enabledPresets) {
      // 过滤出启用的、且适用于当前阶段的规则
      const applicableRules = preset.rules.filter(
        (rule) => rule.enabled && rule.applyTo[stage]
      );

      // 包装并携带权重
      for (const rule of applicableRules) {
        weightedRules.push({
          rule,
          priority: preset.priority ?? 100, // 默认权重 100
          order: rule.order ?? 0,
        });
      }
    }
  }

  // 排序: 优先级(小->大) > 规则顺序(小->大)
  // 优先级越小越先执行
  weightedRules.sort((a, b) => {
    const priorityDiff = a.priority - b.priority;
    if (priorityDiff !== 0) return priorityDiff;
    return a.order - b.order;
  });

  // 解包
  return weightedRules.map((w) => w.rule);
}

/**
 * 根据消息角色过滤规则
 */
function filterRulesByRole(rules: ChatRegexRule[], role: MessageRole): ChatRegexRule[] {
  return rules.filter((rule) => rule.targetRoles.includes(role));
}

/**
 * 根据消息深度过滤规则
 */
function filterRulesByDepth(rules: ChatRegexRule[], depth: number): ChatRegexRule[] {
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
function buildCacheKey(
  agentId: string | undefined | null,
  userId: string | undefined | null,
  stage: 'render' | 'request'
): string {
  return `${agentId || 'none'}|${userId || 'none'}|${stage}`;
}

/**
 * Chat 正则规则解析器 Composable
 *
 * 实现 Message-Bound 策略：
 * - 每条消息使用其生成时的 Agent/User 配置
 * - 基于 AgentID + UserID + Stage 的缓存机制
 */
export function useChatRegexResolver() {
  const agentStore = useAgentStore();
  const userProfileStore = useUserProfileStore();
  const { settings } = useChatSettings();

  /**
   * 获取消息对应的规则集（带缓存）
   *
   * @param agentId - 消息生成时的智能体 ID
   * @param userId - 消息生成时的用户档案 ID
   * @param stage - 处理阶段 (render/request)
   * @returns 未经深度过滤的规则列表
   */
  function getRuleSetForMessage(
    agentId: string | undefined | null,
    userId: string | undefined | null,
    stage: 'render' | 'request'
  ): ChatRegexRule[] {
    // 建立响应式依赖：访问 cacheVersion
    // 这样当 cacheVersion 变化时，依赖此函数的 computed 会自动重新计算
    const _version = cacheVersion.value;
    void _version;

    const cacheKey = buildCacheKey(agentId, userId, stage);

    // 查缓存
    if (ruleSetCache.has(cacheKey)) {
      return ruleSetCache.get(cacheKey)!;
    }

    // 获取配置对象
    const globalConfig = settings.value.regexConfig;
    const agentConfig = agentId ? agentStore.getAgentById(agentId)?.regexConfig : undefined;
    const userConfig = userId ? userProfileStore.getProfileById(userId)?.regexConfig : undefined;

    // 解析规则 (扁平化 + 阶段过滤)
    const rules = resolveRawRules(stage, globalConfig, agentConfig, userConfig);

    // 存入缓存
    ruleSetCache.set(cacheKey, rules);

    logger.debug(`[RuleSetCache] 缓存规则集`, {
      cacheKey,
      rulesCount: rules.length,
    });

    return rules;
  }

  /**
   * 为特定消息解析最终规则列表
   *
   * @param message - 消息对象 (需包含 metadata)
   * @param stage - 处理阶段 (render/request)
   * @param depth - 消息深度 (0=最新)
   * @returns 经过角色和深度过滤的规则列表
   */
  function resolveRules(
    message: ChatMessageNode,
    stage: 'render' | 'request',
    depth: number
  ): ChatRegexRule[] {
    // 从消息元数据获取 agentId 和 userProfileId
    const agentId = message.metadata?.agentId;
    const userId = message.metadata?.userProfileId;

    // 获取缓存的规则集
    const cachedRules = getRuleSetForMessage(agentId, userId, stage);

    // 动态过滤：角色 + 深度
    const roleFiltered = filterRulesByRole(cachedRules, message.role as MessageRole);
    const finalRules = filterRulesByDepth(roleFiltered, depth);

    return finalRules;
  }

  /**
   * 为特定消息解析规则（使用显式参数）
   *
   * 用于 Request Pipeline，可以直接传入 agentId 和 userId
   *
   * @param agentId - 智能体 ID
   * @param userId - 用户档案 ID
   * @param role - 消息角色
   * @param stage - 处理阶段
   * @param depth - 消息深度
   * @returns 经过角色和深度过滤的规则列表
   */
  function resolveRulesExplicit(
    agentId: string | undefined | null,
    userId: string | undefined | null,
    role: MessageRole,
    stage: 'render' | 'request',
    depth: number
  ): ChatRegexRule[] {
    // 获取缓存的规则集
    const cachedRules = getRuleSetForMessage(agentId, userId, stage);

    // 动态过滤：角色 + 深度
    const roleFiltered = filterRulesByRole(cachedRules, role);
    const finalRules = filterRulesByDepth(roleFiltered, depth);

    return finalRules;
  }

  /**
   * 清除所有缓存
   * 当 Global/Agent/User 配置更新时应调用此方法
   */
  function clearCache(): void {
    const size = ruleSetCache.size;
    ruleSetCache.clear();
    cacheVersion.value++; // 触发响应式更新
    logger.info(`[RuleSetCache] 缓存已清除`, { clearedEntries: size });
  }

  /**
   * 清除特定 Agent 相关的缓存
   */
  function clearCacheForAgent(agentId: string): void {
    let cleared = 0;
    for (const key of ruleSetCache.keys()) {
      if (key.startsWith(`${agentId}|`)) {
        ruleSetCache.delete(key);
        cleared++;
      }
    }
    if (cleared > 0) {
      cacheVersion.value++; // 触发响应式更新
      logger.debug(`[RuleSetCache] 清除 Agent 相关缓存`, { agentId, clearedEntries: cleared });
    }
  }

  /**
   * 清除特定 User 相关的缓存
   */
  function clearCacheForUser(userId: string): void {
    let cleared = 0;
    for (const key of ruleSetCache.keys()) {
      if (key.includes(`|${userId}|`)) {
        ruleSetCache.delete(key);
        cleared++;
      }
    }
    if (cleared > 0) {
      cacheVersion.value++; // 触发响应式更新
      logger.debug(`[RuleSetCache] 清除 User 相关缓存`, { userId, clearedEntries: cleared });
    }
  }

  /**
   * 获取缓存统计信息
   */
  function getCacheStats(): { size: number; keys: string[] } {
    return {
      size: ruleSetCache.size,
      keys: Array.from(ruleSetCache.keys()),
    };
  }

  return {
    resolveRules,
    resolveRulesExplicit,
    getRuleSetForMessage,
    clearCache,
    clearCacheForAgent,
    clearCacheForUser,
    getCacheStats,
    // 导出工具函数供外部使用
    filterRulesByRole,
    filterRulesByDepth,
  };
}

// 导出工具函数供直接使用
export { resolveRawRules, filterRulesByRole, filterRulesByDepth };