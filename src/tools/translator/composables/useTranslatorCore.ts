// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useLlmRequest } from "@/composables/useLlmRequest";
import type { TranslationChannel, TranslationResult } from "../types";
import { buildPrompt } from "../core/prompt";

export interface TranslateChannelOptions {
  targetLang: string;
  sourceLang?: string;
  basePrompt: string;
  maxTokens?: number;
  temperature?: number;
  onStream?: (chunk: string) => void;
  signal?: AbortSignal;
}

/**
 * 单渠道翻译执行 composable。
 *
 * 负责把"渠道 + 输入文本 + 选项"组装成对 LLM 的一次请求，
 * 处理流式累积与最终内容的最长保护逻辑，并返回标准化的 `TranslationResult`。
 *
 * 注意：本 composable 是状态/请求粘合层（依赖 `useLlmRequest`），
 * 纯函数 `buildPrompt` / `toErrorMessage` 已下沉到 [`core/prompt.ts`](../core/prompt.ts)。
 */
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
      inspectorContext: {
        toolName: "translator",
        sessionId: channel.id,
        purpose: "translate",
      },
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
