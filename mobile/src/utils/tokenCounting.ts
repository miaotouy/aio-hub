import { invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "./errorHandler";

const errorHandler = createModuleErrorHandler("utils/token-counting");

interface TokenCountCommandResult {
  count: number;
  tokenizer: string;
  estimated: boolean;
}

interface TokenCountBatchCommandResult {
  counts: number[];
  total: number;
  tokenizer: string;
  estimated: boolean;
}

export interface TokenCountResult extends TokenCountCommandResult {
  fallback: boolean;
}

export interface TokenCountBatchResult extends TokenCountBatchCommandResult {
  fallback: boolean;
}

export function estimateTokensByCharacters(text: string): number {
  if (!text) return 0;

  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const specialChars = (text.match(/[^\w\s\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars - specialChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4 + specialChars);
}

export async function countTokens(text: string): Promise<TokenCountResult> {
  const result = await errorHandler.wrapAsync(
    () => invoke<TokenCountCommandResult>("count_tokens", { text }),
    {
      showToUser: false,
      context: { textLength: text.length },
    }
  );

  if (result) return { ...result, fallback: false };

  return {
    count: estimateTokensByCharacters(text),
    tokenizer: "character_fallback",
    estimated: true,
    fallback: true,
  };
}

export async function countTokensBatch(
  texts: string[]
): Promise<TokenCountBatchResult> {
  const result = await errorHandler.wrapAsync(
    () => invoke<TokenCountBatchCommandResult>("count_tokens_batch", { texts }),
    {
      showToUser: false,
      context: { textCount: texts.length },
    }
  );

  if (result) return { ...result, fallback: false };

  const counts = texts.map(estimateTokensByCharacters);
  return {
    counts,
    total: counts.reduce((sum, count) => sum + count, 0),
    tokenizer: "character_fallback",
    estimated: true,
    fallback: true,
  };
}
