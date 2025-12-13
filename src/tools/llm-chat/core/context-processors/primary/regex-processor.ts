import type { ContextProcessor, PipelineContext } from "../../pipeline/types";
import { createModuleLogger } from "@/utils/logger";
import {
  resolveRawRules,
  filterRulesByRole,
  filterRulesByDepth,
} from "../../context-utils/regex";
import type { MessageRole } from "@/tools/llm-chat/types/chatRegex";
import { useChatSettings } from "@/tools/llm-chat/composables/useChatSettings";

const logger = createModuleLogger("primary:regex-processor");

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
      userProfile?.regexConfig,
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
      const roleFilteredRules = filterRulesByRole(
        rawRules,
        message.role as MessageRole,
      );
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
          const regex = new RegExp(rule.regex, rule.flags || "g");
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
