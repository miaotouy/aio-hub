/**
 * 消息格式化处理器集合
 * 这些处理器负责在将消息发送给 LLM 之前进行最终的格式转换和调整。
 * 对应架构中的 Step 5: 消息格式化
 */

import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import type { ProcessableMessage } from "../../types/context";
import { createModuleLogger } from "@/utils/logger";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { LlmModelInfo } from "@/types/llm-profiles";
import type { ContextPostProcessRule } from "../../types/llm";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";

const logger = createModuleLogger("llm-chat/message-format-processors");

// --- 1. 核心处理逻辑 ---

export const DEFAULT_SEPARATOR = "\n\n---\n\n";
export const DEFAULT_USER_PLACEHOLDER = "继续";
export const DEFAULT_ASSISTANT_PLACEHOLDER = "好的";

const contentToString = (content: string | LlmMessageContent[]): string => {
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && !!part.text,
    )
    .map((part) => part.text)
    .join("\n");
};

export const handleMergeSystemToHead = (
  messages: ProcessableMessage[],
  separator: string,
): ProcessableMessage[] => {
  const systemMessages: ProcessableMessage[] = [];
  const nonSystemMessages: ProcessableMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemMessages.push(msg);
    } else {
      nonSystemMessages.push(msg);
    }
  }

  if (systemMessages.length <= 1) {
    return messages;
  }

  const mergedSystemContent = systemMessages
    .map((msg) => contentToString(msg.content))
    .join(separator);

  const mergedSystemMessage: ProcessableMessage = {
    role: "system",
    content: mergedSystemContent,
    sourceType: "merged",
    _mergedSources: systemMessages,
  };

  logger.debug("合并 system 消息", {
    originalCount: systemMessages.length,
    mergedLength: mergedSystemContent.length,
  });

  return [mergedSystemMessage, ...nonSystemMessages];
};

export const handleMergeConsecutiveRoles = (
  messages: ProcessableMessage[],
  separator: string,
): ProcessableMessage[] => {
  if (messages.length < 2) return messages;

  const result: ProcessableMessage[] = [];
  let currentGroup: ProcessableMessage[] = [messages[0]];

  for (let i = 1; i < messages.length; i++) {
    const current = messages[i];
    const previous = messages[i - 1];

    if (current.role === previous.role) {
      currentGroup.push(current);
    } else {
      if (currentGroup.length > 1) {
        const mergedContent = currentGroup
          .map((msg) => contentToString(msg.content))
          .join(separator);
        result.push({
          role: currentGroup[0].role,
          content: mergedContent,
          sourceType: "merged",
          _mergedSources: currentGroup,
        });
      } else {
        result.push(currentGroup[0]);
      }
      currentGroup = [current];
    }
  }

  if (currentGroup.length > 1) {
    const mergedContent = currentGroup
      .map((msg) => contentToString(msg.content))
      .join(separator);
    result.push({
      role: currentGroup[0].role,
      content: mergedContent,
      sourceType: "merged",
      _mergedSources: currentGroup,
    });
  } else if (currentGroup.length === 1) {
    result.push(currentGroup[0]);
  }

  return result;
};

export const handleEnsureAlternatingRoles = (
  messages: ProcessableMessage[],
  userPlaceholder: string = DEFAULT_USER_PLACEHOLDER,
  assistantPlaceholder: string = DEFAULT_ASSISTANT_PLACEHOLDER,
): ProcessableMessage[] => {
  if (messages.length < 2) return messages;
  const result: ProcessableMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const current = messages[i];
    result.push(current);

    if (i < messages.length - 1) {
      const next = messages[i + 1];
      if (current.role === "assistant" && next.role === "assistant") {
        result.push({ role: "user", content: userPlaceholder });
      } else if (current.role === "user" && next.role === "user") {
        result.push({ role: "assistant", content: assistantPlaceholder });
      }
    }
  }
  return result;
};

export const handleConvertSystemToUser = (
  messages: ProcessableMessage[],
): ProcessableMessage[] => {
  return messages.map((msg) => {
    if (msg.role === "system") {
      return { ...msg, role: "user" as const };
    }
    return msg;
  });
};

// --- 2. 子处理器定义 (用于 UI 配置和元数据) ---

const mergeSystemToHeadProcessor: ContextProcessor = {
  id: "post:merge-system-to-head",
  name: "合并 System 消息到头部",
  description: "将所有 system 角色的消息合并为一条，并放在消息列表的最开头。",
  priority: 500,
  isCore: true,
  defaultEnabled: true,
  configFields: [
    {
      key: "separator",
      label: "合并分隔符",
      type: "text",
      placeholder: `默认: ${DEFAULT_SEPARATOR.replace(/\n/g, "\\n")}`,
      default: DEFAULT_SEPARATOR,
    },
  ],
  execute: async () => { }, // 实际执行由 messageFormatter 统一调度
};

const mergeConsecutiveRolesProcessor: ContextProcessor = {
  id: "post:merge-consecutive-roles",
  name: "合并连续相同角色",
  description: "合并连续出现的相同角色消息（如两个 user 消息相邻）。",
  priority: 600,
  isCore: true,
  defaultEnabled: true,
  configFields: [
    {
      key: "separator",
      label: "合并分隔符",
      type: "text",
      placeholder: `默认: ${DEFAULT_SEPARATOR.replace(/\n/g, "\\n")}`,
      default: DEFAULT_SEPARATOR,
    },
  ],
  execute: async () => { },
};

const convertSystemToUserProcessor: ContextProcessor = {
  id: "post:convert-system-to-user",
  name: "转换 System 为 User",
  description:
    "将所有 system 角色转换为 user 角色（适用于不支持 system 角色的模型）。",
  priority: 700,
  isCore: true,
  defaultEnabled: false,
  execute: async () => { },
};

const ensureAlternatingRolesProcessor: ContextProcessor = {
  id: "post:ensure-alternating-roles",
  name: "确保角色交替",
  description: "强制实现 user 和 assistant 的严格交替对话模式。",
  priority: 800,
  isCore: true,
  defaultEnabled: false,
  configFields: [
    {
      key: "userPlaceholder",
      label: "User 占位符",
      type: "text",
      placeholder: `默认: ${DEFAULT_USER_PLACEHOLDER}`,
      default: DEFAULT_USER_PLACEHOLDER,
    },
    {
      key: "assistantPlaceholder",
      label: "Assistant 占位符",
      type: "text",
      placeholder: `默认: ${DEFAULT_ASSISTANT_PLACEHOLDER}`,
      default: DEFAULT_ASSISTANT_PLACEHOLDER,
    },
  ],
  execute: async () => { },
};

// --- 3. 导出 ---

/**
 * 可用的格式化器列表，用于 UI 配置展示
 */
export const AvailableFormatters: ContextProcessor[] = [
  mergeSystemToHeadProcessor,
  mergeConsecutiveRolesProcessor,
  convertSystemToUserProcessor,
  ensureAlternatingRolesProcessor,
];

/**
 * 统一的消息格式化处理器
 * 负责按顺序执行所有启用的格式化规则
 */
export const messageFormatter: ContextProcessor = {
  id: "message-formatter",
  name: "消息格式化",
  description: "应用一系列消息格式化规则（合并 System、合并连续角色等）",
  priority: 500,
  defaultEnabled: true,
  execute: async (context: PipelineContext) => {
    // 计算 Token 和字符数辅助函数
    const calculateTotals = async (msgs: ProcessableMessage[], modelId: string) => {
      let totalTokens = 0;
      let totalChars = 0;
      for (const msg of msgs) {
        const contentStr = contentToString(msg.content);
        totalChars += contentStr.length;
        try {
          const result = await tokenCalculatorService.calculateTokens(contentStr, modelId);
          totalTokens += result.count;
        } catch (error) {
          logger.warn("计算 Token 失败", { error, msg });
        }
      }
      return { totalTokens, totalChars };
    };

    const isPreview = context.sharedData.get("isPreviewMode");
    let inputTokens = 0;
    let inputChars = 0;

    if (isPreview && context.agentConfig.modelId) {
      const { totalTokens, totalChars } = await calculateTotals(
        context.messages,
        context.agentConfig.modelId,
      );
      inputTokens = totalTokens;
      inputChars = totalChars;
    }

    // 1. 获取并合并规则配置 (Agent 优先，模型兜底)
    const agentRules =
      context.agentConfig.parameters?.contextPostProcessing?.rules || [];

    const model = context.sharedData.get("model") as LlmModelInfo | undefined;
    let modelRules: ContextPostProcessRule[] = [];

    if (model?.defaultPostProcessingRules) {
      if (
        model.defaultPostProcessingRules.length > 0 &&
        typeof model.defaultPostProcessingRules[0] === "string"
      ) {
        modelRules = (
          model.defaultPostProcessingRules as unknown as string[]
        ).map((id) => ({
          type: id,
          enabled: true,
        }));
      } else {
        modelRules =
          model.defaultPostProcessingRules as ContextPostProcessRule[];
      }
    }

    const mergedRulesMap = new Map<string, ContextPostProcessRule>();

    // 默认启用状态
    AvailableFormatters.forEach(p => {
      mergedRulesMap.set(p.id, {
        type: p.id,
        enabled: p.defaultEnabled !== false
      });
    });

    // 模型规则覆盖
    modelRules.forEach((rule) => {
      mergedRulesMap.set(rule.type, rule);
    });

    // Agent 规则覆盖
    agentRules.forEach((rule) => {
      mergedRulesMap.set(rule.type, rule);
    });

    const getRule = (id: string) => mergedRulesMap.get(id);
    const isEnabled = (id: string) => mergedRulesMap.get(id)?.enabled === true;

    // 2. 按固定顺序执行子逻辑

    // Step 1: 合并 System 消息到头部
    if (isEnabled("post:merge-system-to-head")) {
      const rule = getRule("post:merge-system-to-head");
      const separator = rule?.separator || DEFAULT_SEPARATOR;
      context.messages = handleMergeSystemToHead(context.messages, separator);
    }

    // Step 2: 合并连续相同角色
    if (isEnabled("post:merge-consecutive-roles")) {
      const rule = getRule("post:merge-consecutive-roles");
      const separator = rule?.separator || DEFAULT_SEPARATOR;
      context.messages = handleMergeConsecutiveRoles(context.messages, separator);
    }

    // Step 3: 转换 System 为 User
    if (isEnabled("post:convert-system-to-user")) {
      context.messages = handleConvertSystemToUser(context.messages);
    }

    // Step 4: 确保角色交替
    if (isEnabled("post:ensure-alternating-roles")) {
      const rule = getRule("post:ensure-alternating-roles");
      const userPlaceholder = rule?.userPlaceholder || DEFAULT_USER_PLACEHOLDER;
      const assistantPlaceholder = rule?.assistantPlaceholder || DEFAULT_ASSISTANT_PLACEHOLDER;
      context.messages = handleEnsureAlternatingRoles(
        context.messages,
        userPlaceholder,
        assistantPlaceholder
      );
    }

    if (isPreview && context.agentConfig.modelId) {
      const { totalTokens: outputTokens, totalChars: outputChars } = await calculateTotals(
        context.messages,
        context.agentConfig.modelId,
      );
      const tokenDelta = outputTokens - inputTokens;
      const charDelta = outputChars - inputChars;

      context.sharedData.set("postProcessingTokenDelta", tokenDelta);
      context.sharedData.set("postProcessingCharDelta", charDelta);

      logger.debug("计算后处理差异", {
        inputTokens,
        outputTokens,
        tokenDelta,
        inputChars,
        outputChars,
        charDelta,
      });
    }

    logger.debug("消息格式化完成", { messageCount: context.messages.length });
  },
};