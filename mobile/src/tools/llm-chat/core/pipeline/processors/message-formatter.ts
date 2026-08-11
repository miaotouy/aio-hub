import {
  processorResult,
  type ContextProcessor,
} from "../../../types/pipeline";
import type { ProcessableMessage } from "../../../types/context";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/message-formatter");

export const DEFAULT_SEPARATOR = "\n\n---\n\n";
export const DEFAULT_USER_PLACEHOLDER = "继续";
export const DEFAULT_ASSISTANT_PLACEHOLDER = "好的";

export interface ContextPostProcessRule {
  type: string;
  enabled: boolean;
  separator?: string;
  userPlaceholder?: string;
  assistantPlaceholder?: string;
}

function contentToString(message: ProcessableMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter(
      (
        part
      ): part is Extract<(typeof message.content)[number], { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n");
}

function mergeMessages(
  messages: ProcessableMessage[],
  separator: string
): ProcessableMessage {
  return {
    role: messages[0].role,
    content: messages.map(contentToString).join(separator),
    sourceType: "merged",
    _mergedSources: messages,
    _attachments: messages.flatMap((message) => message._attachments ?? []),
  };
}

export function handleMergeSystemToHead(
  messages: ProcessableMessage[],
  separator: string
): ProcessableMessage[] {
  const systems = messages.filter((message) => message.role === "system");
  if (systems.length <= 1) return messages;
  return [
    mergeMessages(systems, separator),
    ...messages.filter((message) => message.role !== "system"),
  ];
}

export function handleMergeConsecutiveRoles(
  messages: ProcessableMessage[],
  separator: string
): ProcessableMessage[] {
  if (messages.length < 2) return messages;
  const result: ProcessableMessage[] = [];
  let group: ProcessableMessage[] = [];
  const flush = () => {
    if (group.length === 1) result.push(group[0]);
    else if (group.length > 1) result.push(mergeMessages(group, separator));
    group = [];
  };

  for (const message of messages) {
    if (group.length && group[0].role !== message.role) flush();
    group.push(message);
  }
  flush();
  return result;
}

export function handleConvertSystemToUser(
  messages: ProcessableMessage[]
): ProcessableMessage[] {
  return messages.map((message) =>
    message.role === "system" ? { ...message, role: "user" } : message
  );
}

export function handleEnsureAlternatingRoles(
  messages: ProcessableMessage[],
  userPlaceholder = DEFAULT_USER_PLACEHOLDER,
  assistantPlaceholder = DEFAULT_ASSISTANT_PLACEHOLDER
): ProcessableMessage[] {
  const result: ProcessableMessage[] = [];
  for (const [index, message] of messages.entries()) {
    result.push(message);
    const next = messages[index + 1];
    if (!next) continue;
    if (message.role === "assistant" && next.role === "assistant") {
      result.push({ role: "user", content: userPlaceholder });
    } else if (message.role === "user" && next.role === "user") {
      result.push({ role: "assistant", content: assistantPlaceholder });
    }
  }
  return result;
}

function readRules(value: unknown): ContextPostProcessRule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((rule) => {
    if (typeof rule === "string") return [{ type: rule, enabled: true }];
    if (
      rule &&
      typeof rule === "object" &&
      typeof (rule as ContextPostProcessRule).type === "string"
    ) {
      return [rule as ContextPostProcessRule];
    }
    return [];
  });
}

export const messageFormatter: ContextProcessor = {
  id: "primary:message-formatter",
  name: "消息格式化",
  description: "按模型和智能体规则合并消息并适配角色顺序。",
  priority: 800,
  isCore: true,
  defaultEnabled: true,
  execute: async (context) => {
    const model = context.sharedData.get("model") as
      { defaultPostProcessingRules?: unknown } | undefined;
    const agentParameters = context.agentConfig?.parameters as
      { contextPostProcessing?: { rules?: unknown } } | undefined;
    const rules = new Map<string, ContextPostProcessRule>([
      [
        "post:merge-system-to-head",
        { type: "post:merge-system-to-head", enabled: true },
      ],
      [
        "post:merge-consecutive-roles",
        { type: "post:merge-consecutive-roles", enabled: true },
      ],
      [
        "post:convert-system-to-user",
        { type: "post:convert-system-to-user", enabled: false },
      ],
      [
        "post:ensure-alternating-roles",
        { type: "post:ensure-alternating-roles", enabled: false },
      ],
    ]);
    for (const rule of readRules(model?.defaultPostProcessingRules)) {
      rules.set(rule.type, rule);
    }
    for (const rule of readRules(
      agentParameters?.contextPostProcessing?.rules
    )) {
      rules.set(rule.type, rule);
    }

    const getRule = (type: string) => rules.get(type);
    if (getRule("post:merge-system-to-head")?.enabled) {
      context.messages = handleMergeSystemToHead(
        context.messages,
        getRule("post:merge-system-to-head")?.separator ?? DEFAULT_SEPARATOR
      );
    }
    if (getRule("post:merge-consecutive-roles")?.enabled) {
      context.messages = handleMergeConsecutiveRoles(
        context.messages,
        getRule("post:merge-consecutive-roles")?.separator ?? DEFAULT_SEPARATOR
      );
    }
    if (getRule("post:convert-system-to-user")?.enabled) {
      context.messages = handleConvertSystemToUser(context.messages);
    }
    if (getRule("post:ensure-alternating-roles")?.enabled) {
      const rule = getRule("post:ensure-alternating-roles");
      context.messages = handleEnsureAlternatingRoles(
        context.messages,
        rule?.userPlaceholder ?? DEFAULT_USER_PLACEHOLDER,
        rule?.assistantPlaceholder ?? DEFAULT_ASSISTANT_PLACEHOLDER
      );
    }

    const message = `消息格式化完成，最终 ${context.messages.length} 条。`;
    logger.debug(message, { messageCount: context.messages.length });
    return processorResult.applied(message, {
      messageCount: context.messages.length,
    });
  },
};
