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

import type { TranslationChannel } from "../types";

/**
 * 替换 prompt 模板中的占位符：`{text}` / `{sourceLang}` / `{targetLang}`。
 * 未识别的占位符保持原样。
 */
function replaceAllTemplate(input: string, values: Record<string, string>) {
  return input.replace(/\{(text|sourceLang|targetLang)\}/g, (_, key) => {
    return values[key] ?? "";
  });
}

/**
 * 用渠道自身的 prompt（若有）覆盖预设级 basePrompt，并填入占位符。
 */
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

/**
 * 把任意错误（含 AbortError）转换为面向用户的简短消息。
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "翻译已停止";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
