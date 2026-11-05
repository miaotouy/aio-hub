import type { MessageRole } from "../types/common";
import type {
  ChatRegexConfig,
  ChatRegexPreset,
  ChatRegexRule,
  RegexRuleApplyTo,
  RegexStage,
} from "../types/chatRegex";

/**
 * 正则规则解析、跨配置源合并与应用的公共实现。
 * request 阶段（`core/pipeline/processors/regex-processor.ts`）与
 * render 阶段（`components/MessageContent.vue`）共用，保证两阶段语义一致。
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function isMessageRole(value: unknown): value is MessageRole {
  return value === "system" || value === "user" || value === "assistant";
}

/** 解析阶段开关；至少声明一个阶段才算有效规则，旧配置缺 render 时视为 false。 */
function readApplyTo(value: unknown): RegexRuleApplyTo | null {
  const record = asRecord(value);
  if (!record) return null;
  if (
    typeof record.request !== "boolean" &&
    typeof record.render !== "boolean"
  ) {
    return null;
  }
  return { render: record.render === true, request: record.request === true };
}

/** 从任意来源安全读取一条规则，字段非法时返回 null（不阻断整体流程）。 */
export function readRegexRule(value: unknown): ChatRegexRule | null {
  const record = asRecord(value);
  if (!record) return null;
  const applyTo = readApplyTo(record.applyTo);
  if (
    !applyTo ||
    typeof record.enabled !== "boolean" ||
    typeof record.regex !== "string" ||
    typeof record.replacement !== "string" ||
    !Array.isArray(record.targetRoles)
  ) {
    return null;
  }
  const targetRoles = record.targetRoles.filter(isMessageRole);
  if (!targetRoles.length) return null;
  const depth = asRecord(record.depthRange);
  // 宽容解析 trimStrings：仅保留字符串元素，无有效项时视为未配置。
  const trimStrings = Array.isArray(record.trimStrings)
    ? record.trimStrings.filter(
        (item): item is string => typeof item === "string"
      )
    : [];
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    enabled: record.enabled,
    name: typeof record.name === "string" ? record.name : undefined,
    regex: record.regex,
    replacement: record.replacement,
    flags: typeof record.flags === "string" ? record.flags : undefined,
    applyTo,
    targetRoles,
    depthRange: depth
      ? {
          min: typeof depth.min === "number" ? depth.min : undefined,
          max: typeof depth.max === "number" ? depth.max : undefined,
        }
      : undefined,
    replacementType: record.replacementType === "script" ? "script" : "regex",
    // 非法/缺失的 substitutionMode 一律回退 NONE，保证旧配置行为不变。
    substitutionMode:
      record.substitutionMode === "RAW" || record.substitutionMode === "ESCAPED"
        ? record.substitutionMode
        : "NONE",
    trimStrings: trimStrings.length ? trimStrings : undefined,
    order: typeof record.order === "number" ? record.order : undefined,
  };
}

/** 从任意来源安全读取一份配置，非对象或缺 presets 时返回 undefined。 */
export function readRegexConfig(value: unknown): ChatRegexConfig | undefined {
  const presetsValue = asRecord(value)?.presets;
  if (!Array.isArray(presetsValue)) return undefined;
  const presets: ChatRegexPreset[] = [];
  for (const raw of presetsValue) {
    const record = asRecord(raw);
    if (
      !record ||
      typeof record.enabled !== "boolean" ||
      !Array.isArray(record.rules)
    ) {
      continue;
    }
    presets.push({
      id: typeof record.id === "string" ? record.id : undefined,
      name: typeof record.name === "string" ? record.name : undefined,
      enabled: record.enabled,
      priority:
        typeof record.priority === "number" ? record.priority : undefined,
      order: typeof record.order === "number" ? record.order : undefined,
      rules: record.rules.flatMap((rule) => {
        const parsed = readRegexRule(rule);
        return parsed ? [parsed] : [];
      }),
    });
  }
  return { presets };
}

/**
 * 合并多个配置源（不排序、不去重）。
 *
 * 合并顺序即参数顺序，对齐桌面 `resolveRawRules("request", global, agent, profile)`：
 * 全局排在 agent 与档案之前。真正的执行顺序由 `collectStageRules` 按
 * 预设 `priority`（越小越先）与规则 `order` 统一决定；同优先级时保持
 * 合并顺序（稳定排序）。移动端当前没有全局/档案级 regexConfig 载体，
 * 调用方把全局源传空即可，后续接入时无需改动本函数。
 */
export function mergeRegexConfigs(
  ...configs: unknown[]
): ChatRegexConfig | undefined {
  const presets: ChatRegexPreset[] = [];
  for (const config of configs) {
    const parsed = readRegexConfig(config);
    if (!parsed) continue;
    presets.push(...parsed.presets);
  }
  return presets.length ? { presets } : undefined;
}

/**
 * 从多个配置源收集指定阶段的已启用规则（不过滤角色与深度）。
 * 排序规则：预设先按 `order`，随后所有规则按预设 `priority` 再按规则
 * `order`；同权重保持来源顺序，与桌面语义一致。
 */
export function collectStageRules(
  stage: RegexStage,
  ...configs: unknown[]
): ChatRegexRule[] {
  const weighted: Array<{
    rule: ChatRegexRule;
    priority: number;
    order: number;
    index: number;
  }> = [];
  let index = 0;

  for (const config of configs) {
    const parsed = readRegexConfig(config);
    if (!parsed) continue;
    const enabledPresets = parsed.presets
      .map((preset, presetIndex) => ({ preset, presetIndex }))
      .filter(({ preset }) => preset.enabled)
      .sort(
        (left, right) =>
          (left.preset.order ?? 0) - (right.preset.order ?? 0) ||
          left.presetIndex - right.presetIndex
      );
    for (const { preset } of enabledPresets) {
      for (const rule of preset.rules) {
        if (!rule.enabled || !rule.applyTo[stage]) continue;
        weighted.push({
          rule,
          priority: preset.priority ?? 100,
          order: rule.order ?? 0,
          index: index++,
        });
      }
    }
  }

  return weighted
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.order - right.order ||
        left.index - right.index
    )
    .map((entry) => entry.rule);
}

export function filterRulesByRole(
  rules: ChatRegexRule[],
  role: MessageRole
): ChatRegexRule[] {
  return rules.filter((rule) => rule.targetRoles.includes(role));
}

/** 深度过滤，0 表示最新消息，越旧数值越大。 */
export function filterRulesByDepth(
  rules: ChatRegexRule[],
  depth: number
): ChatRegexRule[] {
  return rules.filter((rule) => {
    if (!rule.depthRange) return true;
    const { min, max } = rule.depthRange;
    if (min !== undefined && depth < min) return false;
    if (max !== undefined && depth > max) return false;
    return true;
  });
}

/** 一次性解析某条消息最终要执行的规则列表。 */
export function resolveMessageRules(
  stage: RegexStage,
  role: MessageRole,
  depth: number,
  ...configs: unknown[]
): ChatRegexRule[] {
  return filterRulesByDepth(
    filterRulesByRole(collectStageRules(stage, ...configs), role),
    depth
  );
}

/** ST findRegex 支持 /pattern/flags 与纯模式两种写法。 */
export function parseRegexString(regex: string): {
  pattern: string;
  flags: string;
} {
  const matched = regex.match(/^\/(.*)\/([gimsuy]*)$/s);
  return matched
    ? { pattern: matched[1], flags: matched[2] || "gm" }
    : { pattern: regex, flags: "gm" };
}

/** render/request 两阶段可安全解析的宏值，移动端只暴露 user / char。 */
export interface RegexMacroValues {
  user?: string;
  char?: string;
}

const REGEX_MACRO_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** 正则元字符转义，用于 substitutionMode=ESCAPED 的宏结果。 */
function escapeRegexValue(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 解析单个宏名；未知宏返回 undefined，由调用方保留原文。 */
function resolveRegexMacroValue(
  rawName: string,
  macroValues: RegexMacroValues
): string | undefined {
  const name = rawName.trim().toLowerCase();
  if (name === "user") return macroValues.user;
  // 宏引擎中 `agent` 与 `char` 等价，这里保持同一语义。
  if (name === "char" || name === "agent") return macroValues.char;
  return undefined;
}

/**
 * render / request 阶段共享的宏预处理纯函数。
 *
 * render 阶段在组件层执行、拿不到完整 PipelineContext，因此不接入完整宏引擎，
 * 只把规则 `regex` 与 `trimStrings` 中的 `{{user}}`/`{{char}}` 替换为调用方
 * 提供的值。substitutionMode=NONE（缺省）不做任何替换；RAW 原样写入；ESCAPED
 * 先对宏结果做正则元字符转义。无实际替换时返回原对象，避免下游无谓重算。
 */
export function preprocessRegexRuleMacros(
  rule: ChatRegexRule,
  macroValues: RegexMacroValues
): ChatRegexRule {
  const mode = rule.substitutionMode ?? "NONE";
  if (mode === "NONE") return rule;

  const substitute = (source: string): string =>
    source.replace(REGEX_MACRO_PATTERN, (full, rawName: string) => {
      const value = resolveRegexMacroValue(rawName, macroValues);
      if (value === undefined) return full;
      return mode === "ESCAPED" ? escapeRegexValue(value) : value;
    });

  const nextRegex = substitute(rule.regex);
  const nextTrimStrings = rule.trimStrings?.map((item) => substitute(item));
  const regexChanged = nextRegex !== rule.regex;
  const trimChanged =
    nextTrimStrings?.some(
      (item, index) => item !== rule.trimStrings?.[index]
    ) === true;

  if (!regexChanged && !trimChanged) return rule;
  return {
    ...rule,
    regex: nextRegex,
    ...(nextTrimStrings ? { trimStrings: nextTrimStrings } : {}),
  };
}

export interface ApplyRegexRulesResult {
  text: string;
  replacements: number;
  skippedScripts: number;
  failedRules: Array<{ name: string; error: string }>;
}

/**
 * 对一段文本依次应用规则；脚本规则不执行，只计数交由调用方降级提示。
 * 单条规则出错只记录不抛出，保证不影响其余规则与整体流程。
 */
export function applyRegexRules(
  text: string,
  rules: ChatRegexRule[]
): ApplyRegexRulesResult {
  let next = text;
  let replacements = 0;
  let skippedScripts = 0;
  const failedRules: ApplyRegexRulesResult["failedRules"] = [];

  for (const rule of rules) {
    if (rule.replacementType === "script") {
      skippedScripts++;
      continue;
    }
    try {
      const parsed = parseRegexString(rule.regex);
      const regex = new RegExp(
        parsed.pattern,
        rule.flags || parsed.flags || "gm"
      );
      let replaced: string;
      if (rule.trimStrings && rule.trimStrings.length) {
        // 捕获组后处理：先按 trimStrings 裁剪每个捕获组，再回填 replacement
        // 中的 $N / ${N} / $&（对齐桌面端语义，但不额外转换 \n / \t）。
        replaced = next.replace(regex, (...args: unknown[]) => {
          const match = args[0] as string;
          const groups = args.slice(1, -2);
          let processed = rule.replacement;
          groups.forEach((group, index) => {
            if (typeof group !== "string") return;
            let trimmed = group;
            for (const trimString of rule.trimStrings!) {
              trimmed = trimmed.split(trimString).join("");
            }
            processed = processed
              .replace(new RegExp(`\\$${index + 1}(?!\\d)`, "g"), trimmed)
              .replace(new RegExp(`\\$\\{${index + 1}\\}`, "g"), trimmed);
          });
          processed = processed.replace(/\$&/g, match);
          return processed;
        });
      } else {
        replaced = next.replace(regex, rule.replacement);
      }
      if (replaced !== next) replacements++;
      next = replaced;
    } catch (error) {
      failedRules.push({
        name: rule.name || "未命名",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { text: next, replacements, skippedScripts, failedRules };
}
