/**
 * LLM Inspector — 通用工具函数
 *
 * 这里只放与「记录展示 / 通用文本处理」相关的小工具。
 *
 * - API 格式检测：见 [`apiFormat.ts`](./apiFormat.ts)
 * - 流式 / JSON 正文提取：见 [`contentExtractor.ts`](./contentExtractor.ts)
 * - 结构化消息解析：见 [`messageParser.ts`](./messageParser.ts)
 */

import type { CombinedRecord, FilterOptions } from "../types";
import { formatDateTime } from "@/utils/time";

/**
 * 格式化 URL，只显示路径和查询参数
 */
export function formatUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/**
 * 格式化时间戳为本地时间字符串
 */
export function formatTime(timestamp: number): string {
  return formatDateTime(timestamp, "HH:mm:ss");
}

/**
 * 格式化文件大小
 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * 获取状态码对应的 CSS 类名
 */
export function getStatusClass(status?: number): string {
  if (!status) return "";
  if (status >= 200 && status < 300) return "success";
  if (status >= 400 && status < 500) return "client-error";
  if (status >= 500) return "server-error";
  return "";
}

/**
 * 检查字符串是否为有效的 JSON
 */
export function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * 格式化 JSON 字符串
 */
export function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

/**
 * 过滤记录列表
 */
export function filterRecords(
  records: CombinedRecord[],
  options: FilterOptions
): CombinedRecord[] {
  let filtered = records;

  // 按搜索词过滤
  if (options.searchQuery) {
    const query = options.searchQuery.toLowerCase();
    filtered = filtered.filter((record) => {
      return (
        record.request.url.toLowerCase().includes(query) ||
        record.request.body?.toLowerCase().includes(query) ||
        record.response?.body?.toLowerCase().includes(query)
      );
    });
  }

  // 按状态码过滤
  if (options.filterStatus) {
    filtered = filtered.filter((record) => {
      if (!record.response) return false;
      const status = record.response.status.toString();
      return status.startsWith(options.filterStatus[0]);
    });
  }

  // 按时间倒序排列
  return filtered.sort((a, b) => b.request.timestamp - a.request.timestamp);
}

/**
 * API Key 打码功能
 */
export function maskSensitiveData(text: string): string {
  // 常见的 API Key 模式
  const patterns = [
    // Authorization 请求头：Bearer aken、API Key 等
    /(?<=Authorization:\s*)(Bearer\s+)?[\w-]{20,}/gi,
    /(?<=X-API-Key:\s*)[\w-]{20,}/gi,
    /(?<=API-Key:\s*)[\w-]{20,}/gi,
    /(?<=x-api-key:\s*)[\w-]{20,}/gi,

    // OpenAI API 密钥
    /(?<=api[_-]?key["']?\s*[:=]\s*["']?)sk-[\w-]{40,}/gi,
    /\bsk-[\w-]{40,}\b/g,

    // Anthropic API 密钥
    /(?<=x-api-key:\s*)sk-ant-[\w-]{40,}/gi,
    /\bsk-ant-[\w-]{40,}\b/g,

    // Google/Gemini API 密钥
    /(?<=key[\"']?\s*[:=]\s*[\"']?)AIza[\w-]{35}/gi,
    /\bAIza[\w-]{35}\b/g,

    // JSON 中的通用 API 密钥
    /(?<="api[_-]?key"\s*:\s*")[^"]{20,}(?=")/gi,
    /(?<='api[_-]?key'\s*:\s*')[^']{20,}(?=')/gi,
  ];

  let maskedText = text;
  patterns.forEach((pattern) => {
    maskedText = maskedText.replace(pattern, (match) => {
      // 保留前6个字符，其余用星号替换
      if (match.length <= 10) return match;
      const prefix = match.substring(0, 6);
      const suffix = match.length > 15 ? match.substring(match.length - 4) : "";
      const stars = "*".repeat(
        Math.min(20, match.length - prefix.length - suffix.length)
      );
      return `${prefix}${stars}${suffix}`;
    });
  });

  return maskedText;
}

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(
  text: string,
  message: string = "已复制到剪贴板"
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error("复制到剪贴板失败:", err);
    throw new Error(`复制失败: ${message}`);
  }
}
