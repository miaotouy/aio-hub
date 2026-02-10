import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { createModuleLogger } from "@/utils/logger";
import type { ChatRegexConfig, ChatRegexRule, MessageRole } from "../../types/chatRegex";
import { useChatSettings } from "@/tools/llm-chat/composables/settings/useChatSettings";
import { parseRegexString } from "../../utils/chatRegexUtils";

const logger = createModuleLogger("primary:regex-processor");

/**
 * 从多个配置源收集适用于特定阶段的所有已启用规则
 * (不过滤 role 和 depth，用于缓存)
 */
function resolveRawRules(
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
      const applicableRules = preset.rules.filter((rule) => rule.enabled && rule.applyTo[stage]);

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

export const regexProcessor: ContextProcessor = {
  id: "primary:regex-processor",
  name: "正则处理器",
  description: "对历史消息应用正则规则。",
  priority: 200,
  execute: async (context: PipelineContext) => {
    const { messages, agentConfig, userProfile } = context;
    if (!messages || messages.length === 0) {
      return;
    }

    // 1. 解析和缓存原始规则集
    const { settings } = useChatSettings();
    const globalConfig = settings.value.regexConfig;

    const rawRules = resolveRawRules(
      "request",
      globalConfig,
      agentConfig.regexConfig,
      userProfile?.regexConfig
    );

    if (rawRules.length === 0) {
      const message = "未找到适用于 request 阶段的正则规则，已跳过。";
      context.logs.push({
        processorId: "primary:regex-processor",
        level: "info",
        message,
      });
      return;
    }

    let replacementsCount = 0;
    const totalMessages = messages.length;

    // 2. 遍历每条消息应用规则
    for (let i = 0; i < totalMessages; i++) {
      const message = messages[i];
      const depth = totalMessages - 1 - i; // 0 = 最新消息

      // 3. 根据角色和深度过滤规则
      const roleFilteredRules = filterRulesByRole(rawRules, message.role as MessageRole);
      const finalRules = filterRulesByDepth(roleFilteredRules, depth);

      if (finalRules.length === 0) {
        continue;
      }

      // 4. 应用规则
      let originalContent = "";
      if (typeof message.content === "string") {
        originalContent = message.content;
      } else if (Array.isArray(message.content)) {
        // 对于多模态内容，只处理 text 部分
        const textPart = message.content.find((p) => p.type === "text");
        if (textPart && typeof textPart.text === "string") {
          originalContent = textPart.text;
        } else {
          continue; // 没有文本部分，跳过
        }
      }

      let newContent = originalContent;
      for (const rule of finalRules) {
        try {
          // 使用与 UI 测试一致的解析逻辑
          const parsed = parseRegexString(rule.regex);
          const flags = rule.flags || parsed.flags || "gm";
          const regex = new RegExp(parsed.pattern, flags);

          const tempContent = newContent.replace(regex, rule.replacement);

          if (tempContent !== newContent) {
            replacementsCount++;
            newContent = tempContent;
          }
        } catch (e) {
          logger.error("应用正则表达式时出错", { error: e, rule });
          context.logs.push({
            processorId: "primary:regex-processor",
            level: "error",
            message: `应用规则 "${rule.name}" 时出错: ${e instanceof Error ? e.message : String(e)}`,
            details: { rule },
          });
        }
      }

      // 5. 更新消息内容
      if (newContent !== originalContent) {
        if (typeof message.content === "string") {
          message.content = newContent;
        } else if (Array.isArray(message.content)) {
          const textPart = message.content.find((p) => p.type === "text");
          if (textPart) {
            textPart.text = newContent;
          }
        }
      }
    }

    const message = `正则处理完成，共执行 ${replacementsCount} 次替换。`;
    logger.info(message, { replacementsCount });
    context.logs.push({
      processorId: "primary:regex-processor",
      level: "info",
      message,
    });
  },
};
