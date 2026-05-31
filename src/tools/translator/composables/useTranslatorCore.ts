import { useLlmRequest } from "@/composables/useLlmRequest";
import type { TranslationChannel, TranslationResult } from "../types";

function replaceAllTemplate(input: string, values: Record<string, string>) {
  return input.replace(/\{(text|sourceLang|targetLang)\}/g, (_, key) => {
    return values[key] ?? "";
  });
}

export function buildPrompt(
  text: string,
  channel: TranslationChannel,
  options: {
    targetLang: string;
    sourceLang?: string;
    basePrompt: string;
  }
) {
  const template = channel.prompt?.trim() || options.basePrompt;
  return replaceAllTemplate(template, {
    text,
    sourceLang: options.sourceLang || "auto",
    targetLang: options.targetLang,
  });
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "翻译已停止";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export interface TranslateChannelOptions {
  targetLang: string;
  sourceLang?: string;
  basePrompt: string;
  maxTokens?: number;
  temperature?: number;
  onStream?: (chunk: string) => void;
  signal?: AbortSignal;
}

export function useTranslatorCore() {
  const { sendRequest } = useLlmRequest();

  const translateChannel = async (
    text: string,
    channel: TranslationChannel,
    options: TranslateChannelOptions
  ): Promise<TranslationResult> => {
    const prompt = buildPrompt(text, channel, options);
    const startTime = Date.now();
    let streamedContent = "";

    const response = await sendRequest({
      profileId: channel.profileId,
      modelId: channel.modelId,
      messages: [{ role: "user", content: prompt }],
      temperature: options.temperature ?? channel.temperature ?? 0.3,
      maxTokens: options.maxTokens ?? channel.maxTokens ?? 8192,
      stream: !!options.onStream,
      onStream: options.onStream
        ? (chunk) => {
            streamedContent += chunk;
            options.onStream?.(chunk);
          }
        : undefined,
      signal: options.signal,
    });

    // 选择更长的版本：有的适配器最终 content 比流式累积短（或反之）
    const responseContent = response.content.trim();
    const streamed = streamedContent.trim();
    const content =
      streamed.length > responseContent.length ? streamed : responseContent;

    return {
      channelId: channel.id,
      channelName: channel.displayName,
      content,
      status: "completed",
      isStreaming: false,
      duration: Date.now() - startTime,
      finishReason: response.finishReason,
      tokenUsage: response.usage,
    };
  };

  return { translateChannel };
}

