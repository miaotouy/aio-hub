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
