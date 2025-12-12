/**
 * Chat 正则管道工具函数
 *
 * 提供规则收集、应用和格式转换功能
 * @see design/chat-regex-pipeline.md
 */

import { escapeRegExp } from "lodash-es";
import type {
  ChatRegexConfig,
  ChatRegexPreset,
  ChatRegexRule,
  MessageRole,
} from "../types/chatRegex";
import type { MacroContext } from "../macro-engine/MacroContext";
import { MacroProcessor } from "../macro-engine/MacroProcessor";
import { processMacros } from "../core/context-utils/macro";

// =====================
// 规则收集与过滤
// =====================

/**
 * 从多个配置源收集适用于特定阶段的所有已启用规则
 * (用于 Pipeline 的第一步，不过滤 role 和 depth)
 *
 * @param stage - 当前处理阶段 (render/request)
 * @param configs - 配置列表 (Global, Agent, User)
 * @returns 排序后的规则列表
 */
export function collectRulesForPipeline(
  stage: "render" | "request",
  ...configs: (ChatRegexConfig | undefined)[]
): ChatRegexRule[] {
  const allRules: ChatRegexRule[] = [];

  for (const config of configs) {
    if (!config?.presets) continue;

    const enabledPresets = config.presets
      .filter((preset) => preset.enabled)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const preset of enabledPresets) {
      // 过滤出启用的、且适用于当前阶段的规则
      const applicableRules = preset.rules.filter(
        (rule) => rule.enabled && rule.applyTo[stage],
      );
      allRules.push(...applicableRules);
    }
  }

  return allRules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * 基础规则解析（不含深度过滤）
 * 别名函数，与 collectRulesForPipeline 功能相同
 * 用于 useChatRegexResolver 的缓存机制
 *
 * @param stage - 当前处理阶段 (render/request)
 * @param configs - 配置列表 (Global, Agent, User)
 * @returns 排序后的规则列表
 */
export function resolveRawRules(
  stage: "render" | "request",
  ...configs: (ChatRegexConfig | undefined)[]
): ChatRegexRule[] {
  return collectRulesForPipeline(stage, ...configs);
}

/**
 * 根据消息角色过滤规则
 *
 * @param rules - 规则列表
 * @param role - 消息角色
 * @returns 过滤后的规则列表
 */
export function filterRulesByRole(
  rules: ChatRegexRule[],
  role: MessageRole,
): ChatRegexRule[] {
  return rules.filter((rule) => rule.targetRoles.includes(role));
}

/**
 * 根据消息深度过滤规则
 *
 * @param rules - 规则列表
 * @param depth - 消息深度 (0=最新)
 * @returns 过滤后的规则列表
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
 * @deprecated 已被 useChatRegexResolver 取代，保留用于向后兼容
 * 获取消息节点最终应用的规则列表
 *
 * @param stage - 当前处理阶段 (render/request)
 * @param role - 消息角色 (system/user/assistant)
 * @param messageDepth - 消息深度 (0=最新)
 * @param configs - 配置列表 (Global, Agent, User)
 * @returns 过滤后的规则列表
 */
export function resolveRulesForMessage(
  stage: "render" | "request",
  role: MessageRole,
  messageDepth: number,
  ...configs: (ChatRegexConfig | undefined)[]
): ChatRegexRule[] {
  // 1. 收集所有适用于该阶段的规则
  const pipelineRules = collectRulesForPipeline(stage, ...configs);

  // 2. 根据 role 过滤
  const roleFiltered = filterRulesByRole(pipelineRules, role);

  // 3. 根据 depth 过滤
  return filterRulesByDepth(roleFiltered, messageDepth);
}

// =====================
// 宏处理
// =====================

/**
 * 对规则列表中的 `regex` 和 `trimStrings` 字段进行宏处理
 *
 * @param rules - 待处理的规则数组
 * @param macroContext - 用于宏替换的上下文对象
 * @returns 返回一个全新的、经过宏处理的规则数组 Promise
 */
export async function processRulesWithMacros(
  rules: ChatRegexRule[],
  macroContext: MacroContext,
): Promise<ChatRegexRule[]> {
  const processor = new MacroProcessor();
  const processedRules: ChatRegexRule[] = [];

  for (const rule of rules) {
    // 创建副本以避免修改 Pinia store 中的原始状态
    const newRule = JSON.parse(JSON.stringify(rule));

    if (newRule.substitutionMode && newRule.substitutionMode !== "NONE") {
      const transform =
        newRule.substitutionMode === "ESCAPED"
          ? (value: unknown) => escapeRegExp(String(value))
          : undefined;

      // 处理 regex 字段
      newRule.regex = await processMacros(
        processor,
        newRule.regex,
        macroContext,
        {
          valueTransformer: transform,
          silent: true, // 静默处理，避免在循环中刷屏
        },
      );

      // 处理 trimStrings 字段
      if (newRule.trimStrings) {
        newRule.trimStrings = await Promise.all(
          newRule.trimStrings.map((str: string) =>
            processMacros(processor, str, macroContext, {
              valueTransformer: transform, // 同样对 trimStrings 中的宏应用转义
              silent: true, // 静默处理
            }),
          ),
        );
      }
    }
    processedRules.push(newRule);
  }

  return processedRules;
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
export function applyRegexRules(
  content: string,
  rules: ChatRegexRule[],
): string {
  let result = content;

  for (const rule of rules) {
    try {
      const flags = rule.flags ?? "gm";
      const regex = new RegExp(rule.regex, flags);
      const replacement = rule.replacement;

      // 处理 trimStrings (后处理捕获组)
      if (rule.trimStrings && rule.trimStrings.length > 0) {
        result = result.replace(regex, (...args) => {
          // args: [match, p1, p2, ..., offset, string, groups]
          const match = args[0] as string; // 获取完整的匹配字符串
          const groups = args.slice(1, -2); // 排除 offset 和 string

          // 对每个捕获组应用 trimStrings
          let processedReplacement = replacement;
          groups.forEach((group, index) => {
            if (typeof group === "string") {
              let trimmedGroup = group;
              for (const trimStr of rule.trimStrings!) {
                trimmedGroup = trimmedGroup.split(trimStr).join("");
              }
              // 替换 $1, $2, ... 或 ${1}, ${2}, ...
              processedReplacement = processedReplacement
                .replace(
                  new RegExp(`\\$${index + 1}(?!\\d)`, "g"),
                  trimmedGroup,
                )
                .replace(
                  new RegExp(`\\$\\{${index + 1}\\}`, "g"),
                  trimmedGroup,
                );
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
      console.warn(
        `[ChatRegex] 规则 "${rule.name || rule.id}" 执行失败:`,
        error,
      );
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
export interface SillyTavernRegexScript {
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
 * 解析 SillyTavern 的正则字符串，提取模式和标志
 * ST 的 findRegex 可能是以下格式：
 * - `/pattern/flags` - 带分隔符的完整正则
 * - `pattern` - 纯模式字符串
 *
 * @param regexString - ST 的 findRegex 字符串
 * @returns 解析后的模式和标志
 */
function parseRegexString(regexString: string): {
  pattern: string;
  flags: string;
} {
  if (!regexString) {
    return { pattern: "", flags: "gm" };
  }

  // 尝试匹配 /pattern/flags 格式
  const regexMatch = regexString.match(/^\/(.*)\/([gimsuy]*)$/s);
  if (regexMatch) {
    const pattern = regexMatch[1]; // 获取捕获组 1
    const flags = regexMatch[2] || ""; // 获取捕获组 2
    return { pattern, flags: flags || "gm" };
  }

  // 如果不是 /pattern/flags 格式，当作纯模式处理
  return { pattern: regexString, flags: "gm" };
}

/**
 * 将 SillyTavern 的 RegexScript 转换为本系统的 ChatRegexRule
 */
export function convertSillyTavernScriptToRule(
  st: SillyTavernRegexScript,
): ChatRegexRule | null {
  if (!st.findRegex) return null;

  const applyTo = convertPlacementToApplyTo(st);
  const targetRoles = convertPlacementToTargetRoles(st);
  const depthRange =
    st.minDepth !== null || st.maxDepth !== null
      ? { min: st.minDepth ?? undefined, max: st.maxDepth ?? undefined }
      : undefined;

  // 转换 substituteRegex 枚举值到 substitutionMode
  const substitutionMode = convertSubstituteRegex(st.substituteRegex);

  // 解析正则字符串，提取模式和标志
  const { pattern, flags } = parseRegexString(st.findRegex);

  return {
    id: crypto.randomUUID(),
    enabled: !st.disabled, // 规则层级的开关
    name: st.scriptName || "未命名规则",
    regex: pattern,
    replacement: st.replaceString || "",
    flags: flags,
    applyTo: applyTo,
    targetRoles: targetRoles,
    depthRange: depthRange,
    substitutionMode: substitutionMode,
    trimStrings: st.trimStrings?.filter(Boolean),
    order: 0,
  };
}

/**
 * 将 SilyTavern 的 RegexScript 转换为本系统的 ChatRegexPreset
 */
export function convertFromSillyTavern(
  st: SillyTavernRegexScript,
): ChatRegexPreset {
  const rule = convertSillyTavernScriptToRule(st);
  const rules = rule ? [rule] : [];

  // 构建预设对象
  return {
    id: st.id || crypto.randomUUID(),
    name: st.scriptName || "未命名预设",
    enabled: !st.disabled,
    rules: rules,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    order: 0,
  };
}

/**
 * 将 SillyTavern 的 RegexScript 数组合并转换为单个 ChatRegexPreset
 */
export function convertSillyTavernArrayToPreset(
  scripts: SillyTavernRegexScript[],
  presetName?: string,
): ChatRegexPreset {
  const rules: ChatRegexRule[] = [];

  scripts.forEach((script, index) => {
    const rule = convertSillyTavernScriptToRule(script);
    if (rule) {
      // 保持原有顺序
      rule.order = index;
      // 如果脚本本身是禁用的，规则也禁用；预设整体默认启用
      rule.enabled = !script.disabled;
      rules.push(rule);
    }
  });

  return {
    id: crypto.randomUUID(),
    name:
      presetName || `SillyTavern 导入组 (${new Date().toLocaleDateString()})`,
    enabled: true,
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
function convertSubstituteRegex(
  value: number | undefined,
): "NONE" | "RAW" | "ESCAPED" {
  switch (value) {
    case 1:
      return "RAW";
    case 2:
      return "ESCAPED";
    default:
      return "NONE";
  }
}

/**
 * 转换 SillyTavern 的 placement 数组到 applyTo 对象
 */
function convertPlacementToApplyTo(script: SillyTavernRegexScript): {
  render: boolean;
  request: boolean;
} {
  // ST 逻辑: markdownOnly=true -> Render Only; promptOnly=true -> Request Only
  if (script.markdownOnly) {
    return { render: true, request: false };
  }
  if (script.promptOnly) {
    return { render: false, request: true };
  }

  // 如果都没设置，默认两者都开启，或者根据 placement 判断
  // 但 placement 更多是关于 Role 的，这里保持默认 true 比较安全，
  // 因为我们的系统区分了 render/request 阶段，而 ST 是混在一起的。
  return { render: true, request: true };
}

/**
 * 转换 SillyTavern 的 placement 数组到 targetRoles
 *
 * ST placement 枚举 (来自 engine.js):
 * - MD_DISPLAY = 0 (已废弃，但旧数据可能包含)
 * - USER_INPUT = 1 → user
 * - AI_OUTPUT = 2 → assistant
 * - SLASH_COMMAND = 3 (忽略，我们不支持)
 * - (4 = sendAs, legacy, 已迁移)
 * - WORLD_INFO = 5 → system (暂未实现世界信息，目前映射到系统消息)
 * - REASONING = 6 → assistant (推理内容属于 AI 输出)
 */
function convertPlacementToTargetRoles(
  script: SillyTavernRegexScript,
): MessageRole[] {
  if (!Array.isArray(script.placement) || script.placement.length === 0) {
    // 如果没有 placement，默认应用于所有角色
    return ["system", "user", "assistant"];
  }

  const roles = new Set<MessageRole>();

  // MD_DISPLAY (0) - 已废弃，但为了兼容旧数据，映射到所有角色
  if (script.placement.includes(0)) {
    roles.add("system");
    roles.add("user");
    roles.add("assistant");
  }

  // USER_INPUT (1) → user
  if (script.placement.includes(1)) {
    roles.add("user");
  }

  // AI_OUTPUT (2) → assistant
  if (script.placement.includes(2)) {
    roles.add("assistant");
  }

  // SLASH_COMMAND (3) - 忽略，我们不支持斜杠命令

  // WORLD_INFO (5) → system
  // 世界信息在 ST 中通常注入到上下文，映射到 system 角色
  if (script.placement.includes(5)) {
    roles.add("system");
  }

  // REASONING (6) → assistant
  // 推理内容属于 AI 的思考过程，映射到 assistant
  if (script.placement.includes(6)) {
    roles.add("assistant");
  }

  // 如果没有匹配到任何已知角色，回退到全部
  if (roles.size === 0) {
    return ["system", "user", "assistant"];
  }

  return Array.from(roles);
}

/**
 * 批量导入 SillyTavern 正则脚本 (旧版行为：每个脚本转为一个预设)
 * @deprecated 建议使用 convertSillyTavernArrayToPreset 将其合并为一个预设
 */
export function convertMultipleFromSillyTavern(
  scripts: SillyTavernRegexScript[],
): ChatRegexPreset[] {
  return scripts.map(convertFromSillyTavern);
}
