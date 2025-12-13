/**
 * 内置的后处理器集合
 * 这些处理器负责在将消息发送给 LLM 之前进行最终的格式转换和调整。
 * 采用类似宏注册的模式，将所有处理器定义在一个文件中，以减少文件数量。
 */

import type { ContextProcessor, PipelineContext } from "../../pipeline/types";
import type { ProcessableMessage } from "../../../types/context";
import { createModuleLogger } from "@/utils/logger";
import type { LlmMessageContent } from "@/llm-apis/common";

const logger = createModuleLogger("llm-chat/builtin-post-processors");

// --- 1. 核心处理逻辑 (从旧的 message-processor.ts 迁移) ---

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

// --- 2. 处理器定义 ---

const mergeSystemToHeadProcessor: ContextProcessor = {
  id: "post:merge-system-to-head",
  name: "合并 System 消息到头部",
  description: "将所有 system 角色的消息合并为一条，并放在消息列表的最开头。",
  priority: 100,
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
  execute: async (context: PipelineContext) => {
    const separator =
      context.agentConfig.parameters?.contextPostProcessing?.rules?.find(
        (r) => r.type === "post:merge-system-to-head",
      )?.separator || DEFAULT_SEPARATOR;
    context.messages = handleMergeSystemToHead(context.messages, separator);
  },
};

const mergeConsecutiveRolesProcessor: ContextProcessor = {
  id: "post:merge-consecutive-roles",
  name: "合并连续相同角色",
  description: "合并连续出现的相同角色消息（如两个 user 消息相邻）。",
  priority: 200,
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
  execute: async (context: PipelineContext) => {
    const separator =
      context.agentConfig.parameters?.contextPostProcessing?.rules?.find(
        (r) => r.type === "post:merge-consecutive-roles",
      )?.separator || DEFAULT_SEPARATOR;
    context.messages = handleMergeConsecutiveRoles(context.messages, separator);
  },
};

const convertSystemToUserProcessor: ContextProcessor = {
  id: "post:convert-system-to-user",
  name: "转换 System 为 User",
  description:
    "将所有 system 角色转换为 user 角色（适用于不支持 system 角色的模型）。",
  priority: 300,
  isCore: true,
  defaultEnabled: false,
  execute: async (context: PipelineContext) => {
    context.messages = handleConvertSystemToUser(context.messages);
  },
};

const ensureAlternatingRolesProcessor: ContextProcessor = {
  id: "post:ensure-alternating-roles",
  name: "确保角色交替",
  description: "强制实现 user 和 assistant 的严格交替对话模式。",
  priority: 400,
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
  execute: async (context: PipelineContext) => {
    const ruleConfig =
      context.agentConfig.parameters?.contextPostProcessing?.rules?.find(
        (r) => r.type === "post:ensure-alternating-roles",
      );
    const userPlaceholder =
      ruleConfig?.userPlaceholder || DEFAULT_USER_PLACEHOLDER;
    const assistantPlaceholder =
      ruleConfig?.assistantPlaceholder || DEFAULT_ASSISTANT_PLACEHOLDER;
    context.messages = handleEnsureAlternatingRoles(
      context.messages,
      userPlaceholder,
      assistantPlaceholder,
    );
  },
};

// --- 3. 导出处理器列表 ---

export const BuiltinPostProcessors: ContextProcessor[] = [
  mergeSystemToHeadProcessor,
  mergeConsecutiveRolesProcessor,
  convertSystemToUserProcessor,
  ensureAlternatingRolesProcessor,
];

