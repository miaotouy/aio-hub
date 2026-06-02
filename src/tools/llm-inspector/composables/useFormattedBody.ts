import { formatJson } from "../core/utils";
import { LruCache } from "../core/lruCache";

// 简单的内存缓存，避免每次渲染都重新 formatJson
const formatCache = new LruCache<string, { raw: string; formatted: string }>(
  100,
  // 一次只淘汰最旧的 1 条，行为接近原 FIFO
  1 / 100
);

export function useFormattedBody() {
  function getFormattedJson(recordId: string, rawBody?: string): string {
    if (!rawBody) return "";

    const cacheKey = `${recordId}_${rawBody.length}`;
    const cached = formatCache.get(cacheKey);
    if (cached && cached.raw === rawBody) {
      return cached.formatted;
    }

    const formatted = formatJson(rawBody);
    formatCache.set(cacheKey, { raw: rawBody, formatted });

    return formatted;
  }

  return {
    getFormattedJson,
  };
}
