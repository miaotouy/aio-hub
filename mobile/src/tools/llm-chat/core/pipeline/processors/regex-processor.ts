import {
  processorResult,
  type ContextProcessor,
  type PipelineContext,
} from "../../../types/pipeline";
import type { ProcessableMessage } from "../../../types/context";
import { createModuleLogger } from "@/utils/logger";
import {
  applyRegexRules,
  collectStageRules,
  filterRulesByDepth,
  filterRulesByRole,
  preprocessRegexRuleMacros,
  type RegexMacroValues,
} from "../../../utils/chatRegex";

const logger = createModuleLogger("llm-chat/regex-processor");
const PROCESSOR_ID = "primary:regex-processor";

/** 移动端暂无全局正则设置载体；存在时按全局源参与合并，缺省为空。 */
function readGlobalRegexConfig(settings: PipelineContext["settings"]): unknown {
  return (settings as { regexConfig?: unknown }).regexConfig;
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
    const rules = collectStageRules(
      "request",
      readGlobalRegexConfig(context.settings),
      context.agentConfig?.regexConfig
    );
    if (!rules.length) {
      return processorResult.skipped("当前没有可执行的请求正则规则。");
    }
    if (!context.messages.length) {
      return processorResult.skipped("当前没有可供正则处理的消息。");
    }

    let replacements = 0;
    let skippedScripts = 0;
    const failedRules: Array<{ name: string; error: string }> = [];
    // request 阶段已有 agentConfig / userProfile 上下文，可低成本接入宏预处理。
    const macroValues: RegexMacroValues = {
      user:
        context.userProfile?.displayName ||
        context.userProfile?.name ||
        "User",
      char:
        context.agentConfig?.displayName ||
        context.agentConfig?.name ||
        "Assistant",
    };
    const total = context.messages.length;
    for (const [index, message] of context.messages.entries()) {
      const applicable = filterRulesByDepth(
        filterRulesByRole(rules, message.role),
        total - index - 1
      ).map((rule) => preprocessRegexRuleMacros(rule, macroValues));
      if (!applicable.length) continue;

      const textPart = getTextPart(message);
      const original =
        typeof message.content === "string" ? message.content : textPart?.text;
      if (original === undefined) continue;

      const outcome = applyRegexRules(original, applicable);
      replacements += outcome.replacements;
      skippedScripts += outcome.skippedScripts;
      failedRules.push(...outcome.failedRules);
      if (outcome.text !== original) {
        if (typeof message.content === "string") message.content = outcome.text;
        else if (textPart) textPart.text = outcome.text;
      }
    }

    for (const failure of failedRules) {
      logger.warn(
        `正则规则“${failure.name}”执行失败，已安全跳过。`,
        failure
      );
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
