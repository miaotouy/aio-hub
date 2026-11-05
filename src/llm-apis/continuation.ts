// Copyright 2025-2026 miaotouy(Github@miaotouy)

import type { LlmRequestOptions, LlmMessage } from "./types";
import type { LlmModelInfo, LlmProfile } from "../types/llm-profiles";

export interface ContinuationSettings {
  mode: "auto" | "prompt";
  deepseekThinking: "inherit" | "enabled" | "disabled";
  prompt: string;
  tailLength: number;
  deduplicate: boolean;
}

export const DEFAULT_CONTINUATION_SETTINGS: Readonly<ContinuationSettings> = {
  mode: "auto",
  deepseekThinking: "inherit",
  prompt: [
    "已有助手正文在生成途中中断。请从下方原文末尾的最后一个字符之后直接接续，先补完尚未结束的句子或语法结构。",
    "仅输出需要追加的正文，保持原有语言、视角、语气和格式。不要重复原文或添加续写说明。代码围栏、字符串和列表从断点继续。",
  ].join("\n"),
  tailLength: 1200,
  deduplicate: true,
};

export function normalizeContinuationSettings(
  value?: Partial<ContinuationSettings>
): ContinuationSettings {
  return {
    mode: value?.mode === "prompt" ? "prompt" : "auto",
    deepseekThinking:
      value?.deepseekThinking === "enabled" ||
      value?.deepseekThinking === "disabled"
        ? value.deepseekThinking
        : "inherit",
    prompt:
      typeof value?.prompt === "string" && value.prompt.trim()
        ? value.prompt
        : DEFAULT_CONTINUATION_SETTINGS.prompt,
    tailLength:
      typeof value?.tailLength === "number" && Number.isFinite(value.tailLength)
        ? Math.max(100, Math.min(16000, Math.trunc(value.tailLength)))
        : DEFAULT_CONTINUATION_SETTINGS.tailLength,
    deduplicate: value?.deduplicate !== false,
  };
}

/** Resolve continuation against the selected physical model, including virtual-channel candidates. */
export function prepareContinuationMessages(
  messages: LlmMessage[] | undefined,
  profile: Pick<LlmProfile, "type">,
  model: Pick<LlmModelInfo, "capabilities">,
  settings?: Partial<ContinuationSettings>
): LlmMessage[] | undefined {
  if (!messages) return messages;
  let index = messages.length - 1;
  while (
    index >= 0 &&
    !(messages[index].role === "assistant" && messages[index].prefix === true)
  ) {
    index--;
  }
  if (index < 0) return messages;

  const config = normalizeContinuationSettings(settings);
  const native =
    config.mode === "auto" &&
    profile.type !== "openai-responses" &&
    (model.capabilities?.prefixCompletion ?? profile.type === "deepseek");
  const prepared = messages.map((message) =>
    message.prefix
      ? {
          ...message,
          prefix: undefined,
          reasoningContent: undefined,
          reasoningArtifacts: undefined,
        }
      : message
  );
  if (native && index === messages.length - 1) {
    prepared[index] = { ...prepared[index], prefix: true };
    return prepared;
  }

  const content = messages[index].content;
  const text =
    typeof content === "string"
      ? content
      : content
          .filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join("");
  const tail = text.slice(-config.tailLength).replace(/^[\uDC00-\uDFFF]/, "");
  prepared.push({
    role: "user",
    content: [
      config.prompt,
      "原文末尾（JSON 字符串，仅作定位参考）：",
      JSON.stringify(tail),
    ].join("\n"),
  });
  return prepared;
}

/** A per-request override takes precedence over model extension fields for DeepSeek. */
export function getContinuationThinkingOptions(
  options: LlmRequestOptions,
  isDeepSeek: boolean
): Pick<LlmRequestOptions, "thinkingEnabled" | "extraBody"> {
  const thinking = normalizeContinuationSettings(
    options.continuation
  ).deepseekThinking;
  if (
    !isDeepSeek ||
    thinking === "inherit" ||
    !options.messages?.some(
      (message) => message.role === "assistant" && message.prefix === true
    )
  )
    return {};
  return {
    thinkingEnabled: thinking === "enabled",
    extraBody: { ...options.extraBody, thinking: { type: thinking } },
  };
}
