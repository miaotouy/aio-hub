import {
  processorResult,
  type ContextProcessor,
  type PipelineContext,
} from "../../../types/pipeline";
import type { ProcessableMessage } from "../../../types/context";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/regex-processor");
const PROCESSOR_ID = "primary:regex-processor";
type MessageRole = ProcessableMessage["role"];

interface RegexRule {
  enabled: boolean;
  name?: string;
  regex: string;
  replacement: string;
  flags?: string;
  applyTo: { request: boolean };
  targetRoles: MessageRole[];
  depthRange?: { min?: number; max?: number };
  replacementType?: "regex" | "script";
  order?: number;
}

interface RegexPreset {
  enabled: boolean;
  priority?: number;
  order?: number;
  rules: RegexRule[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readRule(value: unknown): RegexRule | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.enabled !== "boolean" ||
    typeof record.regex !== "string" ||
    typeof record.replacement !== "string" ||
    !asRecord(record.applyTo) ||
    !Array.isArray(record.targetRoles)
  ) {
    return null;
  }
  const roles = record.targetRoles.filter(
    (role): role is MessageRole =>
      role === "system" || role === "user" || role === "assistant"
  );
  if (!roles.length || typeof asRecord(record.applyTo)?.request !== "boolean") {
    return null;
  }
  const depth = asRecord(record.depthRange);
  return {
    enabled: record.enabled,
    name: typeof record.name === "string" ? record.name : undefined,
    regex: record.regex,
    replacement: record.replacement,
    flags: typeof record.flags === "string" ? record.flags : undefined,
    applyTo: { request: asRecord(record.applyTo)?.request === true },
    targetRoles: roles,
    depthRange: depth
      ? {
          min: typeof depth.min === "number" ? depth.min : undefined,
          max: typeof depth.max === "number" ? depth.max : undefined,
        }
      : undefined,
    replacementType: record.replacementType === "script" ? "script" : "regex",
    order: typeof record.order === "number" ? record.order : undefined,
  };
}

function readPresets(config: unknown): RegexPreset[] {
  const presets = asRecord(config)?.presets;
  if (!Array.isArray(presets)) return [];
  return presets.flatMap((value) => {
    const record = asRecord(value);
    if (
      !record ||
      typeof record.enabled !== "boolean" ||
      !Array.isArray(record.rules)
    ) {
      return [];
    }
    return [
      {
        enabled: record.enabled,
        priority:
          typeof record.priority === "number" ? record.priority : undefined,
        order: typeof record.order === "number" ? record.order : undefined,
        rules: record.rules.flatMap((rule) => {
          const parsed = readRule(rule);
          return parsed ? [parsed] : [];
        }),
      },
    ];
  });
}

function resolveRequestRules(config: unknown): RegexRule[] {
  return readPresets(config)
    .filter((preset) => preset.enabled)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .flatMap((preset) =>
      preset.rules
        .filter((rule) => rule.enabled && rule.applyTo.request)
        .map((rule) => ({ rule, priority: preset.priority ?? 100 }))
    )
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        (left.rule.order ?? 0) - (right.rule.order ?? 0)
    )
    .map(({ rule }) => rule);
}

function parseRegexString(regex: string): { pattern: string; flags: string } {
  const matched = regex.match(/^\/(.*)\/([gimsuy]*)$/s);
  return matched
    ? { pattern: matched[1], flags: matched[2] || "gm" }
    : { pattern: regex, flags: "gm" };
}

function appliesAtDepth(rule: RegexRule, depth: number): boolean {
  if (!rule.depthRange) return true;
  return (
    (rule.depthRange.min === undefined || depth >= rule.depthRange.min) &&
    (rule.depthRange.max === undefined || depth <= rule.depthRange.max)
  );
}

function getTextPart(message: ProcessableMessage): { text: string } | null {
  if (!Array.isArray(message.content)) return null;
  const part = message.content.find(
    (value): value is { type: "text"; text: string } =>
      !!value &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === "text" &&
      typeof (value as { text?: unknown }).text === "string"
  );
  return part ?? null;
}

export const regexProcessor: ContextProcessor = {
  id: PROCESSOR_ID,
  name: "正则处理器",
  description: "将导入智能体中的请求阶段正则规则应用到会话历史。",
  priority: 300,
  isCore: true,
  defaultEnabled: true,
  execute: async (context: PipelineContext) => {
    const rules = resolveRequestRules(context.agentConfig?.regexConfig);
    if (!rules.length) {
      return processorResult.skipped("当前没有可执行的请求正则规则。");
    }
    if (!context.messages.length) {
      return processorResult.skipped("当前没有可供正则处理的消息。");
    }

    let replacements = 0;
    let skippedScripts = 0;
    const failedRules: Array<{ name: string; error: string }> = [];
    const total = context.messages.length;
    for (const [index, message] of context.messages.entries()) {
      const applicable = rules.filter(
        (rule) =>
          rule.targetRoles.includes(message.role) &&
          appliesAtDepth(rule, total - index - 1)
      );
      if (!applicable.length) continue;

      const textPart = getTextPart(message);
      const original =
        typeof message.content === "string" ? message.content : textPart?.text;
      if (original === undefined) continue;
      let next = original;
      for (const rule of applicable) {
        if (rule.replacementType === "script") {
          skippedScripts++;
          continue;
        }
        try {
          const parsed = parseRegexString(rule.regex);
          const replaced = next.replace(
            new RegExp(parsed.pattern, rule.flags || parsed.flags || "gm"),
            rule.replacement
          );
          if (replaced !== next) replacements++;
          next = replaced;
        } catch (error) {
          const failure = {
            name: rule.name || "未命名",
            error: error instanceof Error ? error.message : String(error),
          };
          failedRules.push(failure);
          logger.warn(
            `正则规则“${failure.name}”执行失败，已安全跳过。`,
            failure
          );
        }
      }
      if (next !== original) {
        if (typeof message.content === "string") message.content = next;
        else if (textPart) textPart.text = next;
      }
    }

    const details = {
      replacements,
      skippedScripts,
      failedRules,
    };
    if (skippedScripts || failedRules.length) {
      const message = `正则处理已降级完成：执行 ${replacements} 次替换，跳过 ${skippedScripts} 次脚本规则和 ${failedRules.length} 次无效规则。`;
      logger.warn(message, details);
      return processorResult.degraded(message, details);
    }
    if (!replacements) {
      return processorResult.skipped(
        "请求正则规则未匹配到需要替换的内容。",
        details
      );
    }

    const message = `正则处理完成，执行 ${replacements} 次替换。`;
    logger.debug(message, details);
    return processorResult.applied(message, details);
  },
};
