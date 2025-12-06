/**
 * Chat 正则管道工具函数
 *
 * 提供规则收集、应用和格式转换功能
 * @see design/chat-regex-pipeline.md
 */

import type {
  ChatRegexConfig,
  ChatRegexPreset,
  ChatRegexRule,
  MessageRole,
} from '../types/chatRegex';

// =====================
// 规则收集
// =====================

/**
 * 获取消息节点最终应用的规则列表
 *
 * @param stage - 当前处理阶段 (render/request)
 * @param role - 消息角色 (system/user/assistant)
 * @param messageDepth - 消息深度 (0=最新)
 * @param configs - 配置列表 (Global, Agent, User)
 */
export function resolveRulesForMessage(
  stage: 'render' | 'request',
  role: MessageRole,
  messageDepth: number,
  ...configs: (ChatRegexConfig | undefined)[]
): ChatRegexRule[] {
  const allRules: ChatRegexRule[] = [];

  // 1. 收集所有启用的预设中的规则
  for (const config of configs) {
    if (!config?.presets) continue;

    const enabledPresets = config.presets
      .filter((preset) => preset.enabled)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const preset of enabledPresets) {
      allRules.push(...preset.rules);
    }
  }

  // 2. 对扁平化的规则列表进行过滤和排序
  return allRules
    .filter((rule) => {
      if (!rule.enabled) return false;
      if (!rule.applyTo[stage]) return false;
      if (!rule.targetRoles.includes(role)) return false;
      // 深度检查
      if (rule.depthRange) {
        if (rule.depthRange.min !== undefined && messageDepth < rule.depthRange.min) return false;
        if (rule.depthRange.max !== undefined && messageDepth > rule.depthRange.max) return false;
      }
      return true;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// =====================
// 规则应用
// =====================

/**
 * 应用正则规则到内容
 *
 * @param content - 原始内容
 * @param rules - 要应用的规则列表
 * @returns 处理后的内容
 */
export function applyRegexRules(content: string, rules: ChatRegexRule[]): string {
  let result = content;

  for (const rule of rules) {
    try {
      const flags = rule.flags ?? 'gm';
      const regex = new RegExp(rule.regex, flags);
      let replacement = rule.replacement;

      // 处理 trimStrings (后处理捕获组)
      if (rule.trimStrings && rule.trimStrings.length > 0) {
        result = result.replace(regex, (...args) => {
          // args: [match, p1, p2, ..., offset, string, groups]
          // 获取捕获组
          const match = args[0];
          const groups = args.slice(1, -2); // 排除 offset 和 string

          // 对每个捕获组应用 trimStrings
          let processedReplacement = replacement;
          groups.forEach((group, index) => {
            if (typeof group === 'string') {
              let trimmedGroup = group;
              for (const trimStr of rule.trimStrings!) {
                trimmedGroup = trimmedGroup.replaceAll(trimStr, '');
              }
              // 替换 $1, $2, ... 或 ${1}, ${2}, ...
              processedReplacement = processedReplacement
                .replace(new RegExp(`\\$${index + 1}(?!\\d)`, 'g'), trimmedGroup)
                .replace(new RegExp(`\\$\\{${index + 1}\\}`, 'g'), trimmedGroup);
            }
          });

          // 处理 $& (整个匹配)
          processedReplacement = processedReplacement.replace(/\$&/g, match);

          return processedReplacement;
        });
      } else {
        // 简单替换
        result = result.replace(regex, replacement);
      }
    } catch (error) {
      // 规则执行失败，跳过此规则
      console.warn(`[ChatRegex] 规则 "${rule.name || rule.id}" 执行失败:`, error);
    }
  }

  return result;
}

// =====================
// SillyTavern 导入
// =====================

/**
 * SillyTavern 正则脚本格式
 */
interface SillyTavernRegexScript {
  id?: string;
  scriptName: string;
  findRegex: string;
  replaceString: string;
  placement: number[];
  disabled: boolean;
  markdownOnly?: boolean;
  promptOnly?: boolean;
  minDepth: number | null;
  maxDepth: number | null;
  trimStrings?: string[];
  substituteRegex?: number;
}

/**
 * 将 SillyTavern 的 RegexScript 转换为本系统的 ChatRegexPreset
 */
export function convertFromSillyTavern(st: SillyTavernRegexScript): ChatRegexPreset {
  const rules: ChatRegexRule[] = [];
  const applyTo = convertPlacementToApplyTo(st);
  const depthRange =
    st.minDepth !== null || st.maxDepth !== null
      ? { min: st.minDepth ?? undefined, max: st.maxDepth ?? undefined }
      : undefined;

  // 转换 substituteRegex 枚举值到 substitutionMode
  const substitutionMode = convertSubstituteRegex(st.substituteRegex);

  // 主规则
  if (st.findRegex) {
    rules.push({
      id: crypto.randomUUID(),
      enabled: true,
      name: '主规则',
      regex: st.findRegex,
      replacement: st.replaceString || '',
      flags: 'gm',
      applyTo: applyTo,
      targetRoles: ['system', 'user', 'assistant'],
      depthRange: depthRange,
      substitutionMode: substitutionMode,
      trimStrings: st.trimStrings?.filter(Boolean),
      order: 0,
    });
  }

  // 构建预设对象
  return {
    id: st.id || crypto.randomUUID(),
    name: st.scriptName || '未命名预设',
    enabled: !st.disabled,
    rules: rules,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    order: 0,
  };
}

/**
 * 转换 SillyTavern 的 substituteRegex 枚举值
 * @see SillyTavern: public/scripts/extensions/regex/engine.js
 */
function convertSubstituteRegex(value: number | undefined): 'NONE' | 'RAW' | 'ESCAPED' {
  switch (value) {
    case 1:
      return 'RAW';
    case 2:
      return 'ESCAPED';
    default:
      return 'NONE';
  }
}

/**
 * 转换 SillyTavern 的 placement 数组到 applyTo 对象
 */
function convertPlacementToApplyTo(script: SillyTavernRegexScript): {
  render: boolean;
  request: boolean;
} {
  let render = script.placement.includes(1);
  let request = script.placement.includes(2);
  if (script.markdownOnly) {
    render = true;
    request = false;
  }
  if (script.promptOnly) {
    render = false;
    request = true;
  }
  if (!render && !request) {
    render = true;
    request = true;
  }
  return { render, request };
}

/**
 * 批量导入 SillyTavern 正则脚本
 */
export function convertMultipleFromSillyTavern(scripts: SillyTavernRegexScript[]): ChatRegexPreset[] {
  return scripts.map(convertFromSillyTavern);
}
