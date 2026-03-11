import type { KnowledgeRequestSettings } from "../../types";

/**
 * 通用带重试的请求执行器 (纯逻辑版)
 */
export async function executeWithRetry<T>(
  task: () => Promise<T>,
  options: {
    requestSettings?: KnowledgeRequestSettings;
    label?: string;
    onRetry?: (attempt: number, delay: number) => void;
  } = {}
): Promise<T> {
  const { requestSettings, label = "Task", onRetry } = options;
  const maxRetries = requestSettings?.maxRetries ?? 2;
  const retryInterval = requestSettings?.retryInterval ?? 3000;
  const timeout = requestSettings?.timeout ?? 60000;
  const retryMode = requestSettings?.retryMode ?? "fixed";

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = retryMode === "exponential" ? retryInterval * Math.pow(2, attempt - 1) : retryInterval;
        onRetry?.(attempt, delay);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      return await Promise.race([
        task(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} 请求超时`)), timeout)),
      ]);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
    }
  }

  throw lastError || new Error(`${label} 失败`);
}
