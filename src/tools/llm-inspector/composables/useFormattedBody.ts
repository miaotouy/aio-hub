import { formatJson } from "../core/utils";

// 简单的内存缓存，避免每次渲染都重新 formatJson
const formatCache = new Map<string, { raw: string; formatted: string }>();

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

    // 限制缓存大小，防止内存泄漏
    if (formatCache.size > 100) {
      const firstKey = formatCache.keys().next().value;
      if (firstKey) formatCache.delete(firstKey);
    }

    return formatted;
  }

  return {
    getFormattedJson,
  };
}
