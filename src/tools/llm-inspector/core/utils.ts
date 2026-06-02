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

/**
 * 格式化流式响应（SSE格式）
 */
export function formatStreamingResponse(str: string): string {
  if (!str) return "";

  // 分割SSE事件
  const events = str.split(/\n\n/);
  let formatted = "";

  events.forEach((event, index) => {
    if (!event.trim()) return;

    const lines = event.split("\n");
    let eventData = "";

    lines.forEach((line) => {
      if (line.startsWith("data: ")) {
        const data = line.substring(6);

        // 尝试格式化JSON数据
        if (data.trim() && data.trim() !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);
            eventData += `data: ${JSON.stringify(parsed, null, 2)}\n`;
          } catch {
            eventData += `${line}\n`;
          }
        } else {
          eventData += `${line}\n`;
        }
      } else {
        eventData += `${line}\n`;
      }
    });

    if (eventData) {
      formatted += eventData;
      if (index < events.length - 1) {
        formatted += "\n";
      }
    }
  });

  return formatted || str;
}

/**
 * 从流式响应中提取正文内容
 */
/** 已知的 API 格式类型 */
export type ApiFormat =
  | "openai-chat" // /v1/chat/completions
  | "openai-responses" // /v1/responses
  | "openai-completions" // /v1/completions (legacy)
  | "anthropic" // /v1/messages
  | "gemini" // :generateContent, :streamGenerateContent
  | "cohere" // /v1/chat, /v2/chat
  | "ollama" // /api/chat, /api/generate
  | "unknown";

/** 通过请求 URL 路径检测 API 格式 */
export function detectApiFormat(url: string): ApiFormat {
  const path = extractPath(url);

  // OpenAI 系列
  if (path.includes("/chat/completions")) return "openai-chat";
  if (path.includes("/responses")) return "openai-responses";
  if (path.includes("/completions") && !path.includes("/chat/"))
    return "openai-completions";

  // Anthropic
  if (path.includes("/messages")) return "anthropic";

  // Google Gemini
  if (
    path.includes(":generateContent") ||
    path.includes(":streamGenerateContent")
  )
    return "gemini";

  // Cohere
  if (path.match(/\/v[12]\/chat/)) return "cohere";

  // Ollama
  if (path.includes("/api/chat") || path.includes("/api/generate"))
    return "ollama";

  return "unknown";
}

function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * 从流式响应中提取正文内容
 */
export function extractStreamContent(
  body: string,
  requestUrl?: string
): string {
  const format = requestUrl ? detectApiFormat(requestUrl) : "unknown";
  const contents: string[] = [];
  const lines = body.split("\n");

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.substring(6).trim();
      if (data && data !== "[DONE]") {
        try {
          const parsed = JSON.parse(data);
          const text = extractDeltaByFormat(parsed, format);
          if (text) contents.push(text);
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  return contents.join("");
}

/**
 * 从流式响应中实时提取思维链内容
 * 与 extractStreamContent 完全同构，扫描相同的 SSE 流，但只挑出 reasoning/thinking 字段。
 */
export function extractStreamReasoning(
  body: string,
  requestUrl?: string
): string {
  const format = requestUrl ? detectApiFormat(requestUrl) : "unknown";
  const contents: string[] = [];
  const lines = body.split("\n");

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.substring(6).trim();
      if (data && data !== "[DONE]") {
        try {
          const parsed = JSON.parse(data);
          const text = extractReasoningDeltaByFormat(parsed, format);
          if (text) contents.push(text);
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  return contents.join("");
}

/** 根据格式从流式 delta 中提取思维链文本 */
function extractReasoningDeltaByFormat(parsed: any, format: ApiFormat): string {
  switch (format) {
    case "openai-chat":
    case "openai-completions":
    case "ollama":
      // DeepSeek-R1: reasoning_content；其他模型可能用 reasoning / thinking
      return (
        parsed.choices?.[0]?.delta?.reasoning_content ??
        parsed.choices?.[0]?.delta?.reasoning ??
        parsed.choices?.[0]?.delta?.thinking ??
        ""
      );

    case "openai-responses":
      // Responses API: response.reasoning_summary_text.delta 事件
      if (parsed.type === "response.reasoning_summary_text.delta")
        return parsed.delta ?? "";
      return "";

    case "anthropic":
      // Claude: content_block_delta + delta.type === "thinking_delta"
      if (
        parsed.type === "content_block_delta" &&
        parsed.delta?.type === "thinking_delta"
      )
        return parsed.delta?.thinking ?? "";
      return "";

    case "gemini": {
      // Gemini: parts[].thought === true 时 parts[].text 是思维链
      const parts = parsed.candidates?.[0]?.content?.parts ?? [];
      return parts
        .filter((p: any) => p?.thought === true)
        .map((p: any) => p?.text ?? "")
        .join("");
    }

    case "cohere":
      // Cohere v2: delta.message.content.type === "thinking"
      if (
        parsed.type === "content-delta" &&
        parsed.delta?.message?.content?.type === "thinking"
      )
        return parsed.delta.message.content.thinking ?? "";
      return "";

    default:
      // 通用启发式：尝试常见路径
      return (
        parsed.choices?.[0]?.delta?.reasoning_content ??
        parsed.choices?.[0]?.delta?.reasoning ??
        parsed.choices?.[0]?.delta?.thinking ??
        ""
      );
  }
}

/** 根据格式从流式 delta 中提取文本 */
function extractDeltaByFormat(parsed: any, format: ApiFormat): string {
  switch (format) {
    case "openai-chat":
    case "openai-completions":
    case "ollama":
      // choices[0].delta.content (chat) 或 choices[0].text (completions)
      return (
        parsed.choices?.[0]?.delta?.content ??
        parsed.choices?.[0]?.text ??
        parsed.message?.content ?? // Ollama 格式
        ""
      );

    case "openai-responses":
      // Responses API 使用不同的事件结构
      // output_text.delta 事件
      if (parsed.type === "response.output_text.delta")
        return parsed.delta ?? "";
      // content_part.delta 事件
      if (parsed.type === "response.content_part.delta")
        return parsed.delta?.text ?? "";
      // 兼容简化格式
      if (parsed.delta)
        return typeof parsed.delta === "string"
          ? parsed.delta
          : (parsed.delta?.text ?? "");
      return "";

    case "anthropic":
      // content_block_delta 事件
      if (parsed.type === "content_block_delta")
        return parsed.delta?.text ?? "";
      // 简化格式
      if (parsed.delta?.text) return parsed.delta.text;
      // thinking block
      if (
        parsed.type === "content_block_delta" &&
        parsed.delta?.type === "thinking_delta"
      )
        return parsed.delta?.thinking ?? "";
      return "";

    case "gemini":
      return parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    case "cohere":
      // Cohere v2 stream
      if (parsed.type === "content-delta")
        return parsed.delta?.message?.content?.text ?? "";
      // Cohere v1 stream
      return parsed.text ?? "";

    default:
      // 通用启发式：按优先级尝试所有已知路径
      return (
        parsed.choices?.[0]?.delta?.content ??
        parsed.delta?.text ??
        parsed.candidates?.[0]?.content?.parts?.[0]?.text ??
        parsed.content ??
        parsed.message?.content ??
        parsed.text ??
        ""
      );
  }
}

/**
 * 从JSON响应中提取正文内容
 */
export function extractJsonContent(body: string, requestUrl?: string): string {
  try {
    const parsed = JSON.parse(body);
    const format = requestUrl ? detectApiFormat(requestUrl) : "unknown";
    return extractResponseByFormat(parsed, format);
  } catch {
    return body;
  }
}

/** 根据格式从完整响应中提取文本 */
function extractResponseByFormat(parsed: any, format: ApiFormat): string {
  switch (format) {
    case "openai-chat":
    case "openai-completions":
      return extractOpenAIChatResponse(parsed);

    case "openai-responses":
      return extractOpenAIResponsesResponse(parsed);

    case "anthropic":
      return extractAnthropicResponse(parsed);

    case "gemini":
      return extractGeminiResponse(parsed);

    case "cohere":
      return (
        parsed.text ??
        parsed.message?.content?.[0]?.text ??
        JSON.stringify(parsed, null, 2)
      );

    case "ollama":
      return parsed.message?.content ?? parsed.response ?? "";

    default:
      return extractGenericResponse(parsed);
  }
}

// ===== 各格式专用提取器 =====

function extractOpenAIChatResponse(parsed: any): string {
  const parts: string[] = [];

  // 支持多 choice
  const choices = parsed.choices ?? [];
  for (const choice of choices) {
    const msg = choice.message ?? choice;

    // reasoning_content (o1/o3 thinking)
    if (msg.reasoning_content) {
      parts.push(`[Thinking]\n${msg.reasoning_content}\n[/Thinking]`);
    }

    // 主内容
    if (msg.content) parts.push(msg.content);

    // tool_calls
    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        parts.push(
          `[Tool Call: ${tc.function?.name ?? tc.type}]\n${tc.function?.arguments ?? JSON.stringify(tc)}`
        );
      }
    }

    // function_call (legacy)
    if (msg.function_call) {
      parts.push(
        `[Function Call: ${msg.function_call.name}]\n${msg.function_call.arguments}`
      );
    }
  }

  return parts.join("\n\n") || JSON.stringify(parsed, null, 2);
}

function extractOpenAIResponsesResponse(parsed: any): string {
  const parts: string[] = [];

  // Responses API: output 是一个数组
  const outputs = parsed.output ?? [];
  for (const output of outputs) {
    if (output.type === "message") {
      for (const content of output.content ?? []) {
        if (content.type === "output_text") parts.push(content.text);
        else if (content.type === "refusal")
          parts.push(`[Refusal] ${content.refusal}`);
      }
    }
    // reasoning items
    if (output.type === "reasoning") {
      const summaries = output.summary?.map((s: any) => s.text).join("\n");
      if (summaries) parts.push(`[Reasoning]\n${summaries}\n[/Reasoning]`);
    }
    // tool calls in responses API
    if (output.type === "function_call") {
      parts.push(`[Tool Call: ${output.name}]\n${output.arguments}`);
    }
  }

  // 顶层 output_text 快捷字段
  if (!parts.length && parsed.output_text) {
    parts.push(parsed.output_text);
  }

  return parts.join("\n\n") || JSON.stringify(parsed, null, 2);
}

function extractAnthropicResponse(parsed: any): string {
  const parts: string[] = [];

  // content 是一个 block 数组
  const blocks = parsed.content ?? [];
  for (const block of blocks) {
    if (block.type === "text") parts.push(block.text);
    if (block.type === "thinking")
      parts.push(`[Thinking]\n${block.thinking}\n[/Thinking]`);
    if (block.type === "tool_use") {
      parts.push(
        `[Tool Use: ${block.name}]\n${JSON.stringify(block.input, null, 2)}`
      );
    }
  }

  return parts.join("\n\n") || JSON.stringify(parsed, null, 2);
}

function extractGeminiResponse(parsed: any): string {
  const parts: string[] = [];

  const candidates = parsed.candidates ?? [];
  for (const candidate of candidates) {
    const contentParts = candidate.content?.parts ?? [];
    for (const part of contentParts) {
      if (part.text) parts.push(part.text);
      if (part.functionCall) {
        parts.push(
          `[Function Call: ${part.functionCall.name}]\n${JSON.stringify(part.functionCall.args, null, 2)}`
        );
      }
    }
  }

  return parts.join("\n\n") || JSON.stringify(parsed, null, 2);
}

function extractGenericResponse(parsed: any): string {
  // 按优先级尝试所有已知路径
  return (
    parsed.choices?.[0]?.message?.content ??
    parsed.content?.[0]?.text ??
    parsed.candidates?.[0]?.content?.parts?.[0]?.text ??
    parsed.output?.[0]?.content?.[0]?.text ??
    parsed.output_text ??
    parsed.message?.content ??
    (typeof parsed.content === "string" ? parsed.content : null) ??
    (typeof parsed.message === "string" ? parsed.message : null) ??
    parsed.response ??
    parsed.text ??
    JSON.stringify(parsed, null, 2)
  );
}
