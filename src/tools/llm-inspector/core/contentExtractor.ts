/**
 * LLM Inspector — 流式 / 非流式响应正文提取
 *
 * 这里集中处理「从 SSE 累积文本 / JSON 响应中按厂商格式抽取文本与思维链」
 * 的所有逻辑。原本散落在 `core/utils.ts`，2026-06 重构时按主题拆出。
 *
 * 与 `messageParser.ts` 的区别：
 * - 本模块输出**纯字符串**（用于流式实时回显），针对增量场景；
 * - `messageParser.ts` 输出**结构化 ParsedMessage[]**，针对完成态消息。
 *
 * 未来若 `messageParser` 支持「增量 / 部分输入」，本模块可考虑下沉为
 * messageParser 的一个 stream-friendly adapter。
 */

import { detectApiFormat, type ApiFormat } from "./apiFormat";

// ===================================================================
// SSE 流式格式化（仅排版用，不做语义提取）
// ===================================================================

/** 把 SSE 文本按事件块美化（用于「原始」视图） */
export function formatStreamingResponse(str: string): string {
  if (!str) return "";

  const events = str.split(/\n\n/);
  let formatted = "";

  events.forEach((event, index) => {
    if (!event.trim()) return;

    const lines = event.split("\n");
    let eventData = "";

    lines.forEach((line) => {
      if (line.startsWith("data: ")) {
        const data = line.substring(6);

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

// ===================================================================
// 流式 SSE 正文提取
// ===================================================================

/** 从流式响应中提取正文内容（拼接所有 delta.content 等字段） */
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
 *
 * 与 {@link extractStreamContent} 同构扫描同一 SSE 流，但只挑出 reasoning /
 * thinking 字段。非流式场景应走 `parseResponseMessages` 提取 thinking 块。
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

// ===================================================================
// 非流式 JSON 正文提取
// ===================================================================

/** 从 JSON 响应中提取正文内容（含 reasoning / tool_calls / refusal 等） */
export function extractJsonContent(body: string, requestUrl?: string): string {
  try {
    const parsed = JSON.parse(body);
    const format = requestUrl ? detectApiFormat(requestUrl) : "unknown";
    return extractResponseByFormat(parsed, format);
  } catch {
    return body;
  }
}

// ===================================================================
// 按格式分发 — 流式 delta
// ===================================================================

function extractDeltaByFormat(parsed: any, format: ApiFormat): string {
  switch (format) {
    case "openai-chat":
    case "openai-completions":
    case "ollama":
      return (
        parsed.choices?.[0]?.delta?.content ??
        parsed.choices?.[0]?.text ??
        parsed.message?.content ?? // Ollama 格式
        ""
      );

    case "openai-responses":
      if (parsed.type === "response.output_text.delta") {
        return parsed.delta ?? "";
      }
      if (parsed.type === "response.content_part.delta") {
        return parsed.delta?.text ?? "";
      }
      if (parsed.delta) {
        return typeof parsed.delta === "string"
          ? parsed.delta
          : (parsed.delta?.text ?? "");
      }
      return "";

    case "anthropic":
      if (parsed.type === "content_block_delta") {
        return parsed.delta?.text ?? "";
      }
      if (parsed.delta?.text) return parsed.delta.text;
      if (
        parsed.type === "content_block_delta" &&
        parsed.delta?.type === "thinking_delta"
      ) {
        return parsed.delta?.thinking ?? "";
      }
      return "";

    case "gemini":
      return parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    case "cohere":
      if (parsed.type === "content-delta") {
        return parsed.delta?.message?.content?.text ?? "";
      }
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
      if (parsed.type === "response.reasoning_summary_text.delta") {
        return parsed.delta ?? "";
      }
      return "";

    case "anthropic":
      if (
        parsed.type === "content_block_delta" &&
        parsed.delta?.type === "thinking_delta"
      ) {
        return parsed.delta?.thinking ?? "";
      }
      return "";

    case "gemini": {
      const parts = parsed.candidates?.[0]?.content?.parts ?? [];
      return parts
        .filter((p: any) => p?.thought === true)
        .map((p: any) => p?.text ?? "")
        .join("");
    }

    case "cohere":
      if (
        parsed.type === "content-delta" &&
        parsed.delta?.message?.content?.type === "thinking"
      ) {
        return parsed.delta.message.content.thinking ?? "";
      }
      return "";

    default:
      return (
        parsed.choices?.[0]?.delta?.reasoning_content ??
        parsed.choices?.[0]?.delta?.reasoning ??
        parsed.choices?.[0]?.delta?.thinking ??
        ""
      );
  }
}

// ===================================================================
// 按格式分发 — 非流式 response
// ===================================================================

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

function extractOpenAIChatResponse(parsed: any): string {
  const parts: string[] = [];

  const choices = parsed.choices ?? [];
  for (const choice of choices) {
    const msg = choice.message ?? choice;

    // reasoning_content (o1/o3 thinking)
    if (msg.reasoning_content) {
      parts.push(`[Thinking]\n${msg.reasoning_content}\n[/Thinking]`);
    }

    if (msg.content) parts.push(msg.content);

    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        parts.push(
          `[Tool Call: ${tc.function?.name ?? tc.type}]\n${tc.function?.arguments ?? JSON.stringify(tc)}`
        );
      }
    }

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

  const outputs = parsed.output ?? [];
  for (const output of outputs) {
    if (output.type === "message") {
      for (const content of output.content ?? []) {
        if (content.type === "output_text") parts.push(content.text);
        else if (content.type === "refusal") {
          parts.push(`[Refusal] ${content.refusal}`);
        }
      }
    }
    if (output.type === "reasoning") {
      const summaries = output.summary?.map((s: any) => s.text).join("\n");
      if (summaries) parts.push(`[Reasoning]\n${summaries}\n[/Reasoning]`);
    }
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

  const blocks = parsed.content ?? [];
  for (const block of blocks) {
    if (block.type === "text") parts.push(block.text);
    if (block.type === "thinking") {
      parts.push(`[Thinking]\n${block.thinking}\n[/Thinking]`);
    }
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
