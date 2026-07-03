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

/**
 * LLM Inspector — 请求/响应消息块解析器（A2）
 *
 * 将不同厂商的 LLM API 请求/响应体解析为统一的 ParsedMessage 结构，
 * 供详情面板的「结构化」Tab 渲染。
 *
 * 设计原则：
 * - 解析失败不抛错，所有错误都收集到 `result.errors`，让 UI 决定如何提示。
 * - 不做内容修改 / 截断，所有归一化都保留原始引用（`raw` 字段）便于排查。
 * - 复用 `utils.ts` 的 `detectApiFormat` 与各格式特性认知，避免重复维护。
 */

import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import type {
  ParsedMessage,
  ParsedMessageBlock,
  RequestParseResult,
  ResponseParseResult,
} from "../types";
import { detectApiFormat, type ApiFormat } from "./apiFormat";

const logger = createModuleLogger("LlmInspector/MessageParser");
const errorHandler = createModuleErrorHandler("LlmInspector/MessageParser");

// ===================================================================
// 入口函数
// ===================================================================

/**
 * 解析请求消息块
 *
 * @param body 请求体原始字符串（一般是 JSON）
 * @param format 调用方已检测好的 API 格式；缺省时从空字符串当作 unknown
 */
export function parseRequestMessages(
  body: string | undefined,
  format: ApiFormat
): RequestParseResult {
  const result: RequestParseResult = {
    format,
    messages: [],
    errors: [],
  };

  if (!body) {
    result.errors.push("请求体为空");
    return result;
  }

  const parsed = safeJsonParse(body);
  if (parsed === undefined) {
    result.errors.push("请求体不是合法 JSON");
    return result;
  }

  try {
    switch (format) {
      case "openai-chat":
      case "openai-completions":
      case "ollama":
        return parseOpenAIChatRequest(parsed, format, result);
      case "openai-responses":
        return parseOpenAIResponsesRequest(parsed, format, result);
      case "anthropic":
        return parseAnthropicRequest(parsed, format, result);
      case "gemini":
        return parseGeminiRequest(parsed, format, result);
      case "cohere":
        return parseCohereRequest(parsed, format, result);
      default:
        return parseGenericRequest(parsed, format, result);
    }
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "解析请求消息块失败",
      showToUser: false,
      context: { format },
    });
    result.errors.push(
      `解析异常: ${(error as Error).message ?? String(error)}`
    );
    return result;
  }
}

/**
 * 解析响应消息块
 */
export function parseResponseMessages(
  body: string | undefined,
  format: ApiFormat
): ResponseParseResult {
  const result: ResponseParseResult = {
    format,
    messages: [],
    errors: [],
  };

  if (!body) {
    result.errors.push("响应体为空");
    return result;
  }

  const parsed = safeJsonParse(body);
  if (parsed === undefined) {
    // 流式响应是 SSE 文本，这里不处理（由 streamProcessor 累积后再调用）
    result.errors.push("响应体不是合法 JSON（可能是流式 SSE，需先累积聚合）");
    return result;
  }

  try {
    switch (format) {
      case "openai-chat":
      case "openai-completions":
      case "ollama":
        return parseOpenAIChatResponse(parsed, format, result);
      case "openai-responses":
        return parseOpenAIResponsesResponse(parsed, format, result);
      case "anthropic":
        return parseAnthropicResponse(parsed, format, result);
      case "gemini":
        return parseGeminiResponse(parsed, format, result);
      case "cohere":
        return parseCohereResponse(parsed, format, result);
      default:
        return parseGenericResponse(parsed, format, result);
    }
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "解析响应消息块失败",
      showToUser: false,
      context: { format },
    });
    result.errors.push(
      `解析异常: ${(error as Error).message ?? String(error)}`
    );
    return result;
  }
}

/**
 * 自动检测格式并解析（便利函数）
 */
export function parseRequestMessagesAuto(
  body: string | undefined,
  url: string
): RequestParseResult {
  return parseRequestMessages(body, detectApiFormat(url));
}

export function parseResponseMessagesAuto(
  body: string | undefined,
  url: string
): ResponseParseResult {
  return parseResponseMessages(body, detectApiFormat(url));
}

// ===================================================================
// OpenAI Chat / Completions / Ollama 请求
// ===================================================================

function parseOpenAIChatRequest(
  parsed: any,
  format: ApiFormat,
  result: RequestParseResult
): RequestParseResult {
  result.format = format;
  result.model = typeof parsed.model === "string" ? parsed.model : undefined;
  result.stream =
    parsed.stream === true ? true : parsed.stream === false ? false : undefined;

  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  for (const msg of messages) {
    result.messages.push(parseOpenAIChatRequestMessage(msg));
  }

  if (!messages.length && typeof parsed.prompt === "string") {
    // legacy /v1/completions
    result.messages.push({
      role: "user",
      blocks: [{ type: "text", text: parsed.prompt }],
      raw: parsed.prompt,
    });
  }

  return result;
}

function parseOpenAIChatRequestMessage(msg: any): ParsedMessage {
  const role = normalizeRole(msg?.role);
  const blocks: ParsedMessageBlock[] = [];

  // 1. content：string 或 part array
  const content = msg?.content;
  if (typeof content === "string") {
    if (content) blocks.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const part of content) {
      blocks.push(parseOpenAIContentPart(part));
    }
  }

  // 2. tool_calls (assistant)
  if (Array.isArray(msg?.tool_calls)) {
    for (const tc of msg.tool_calls) {
      blocks.push({
        type: "tool_call",
        toolName: tc?.function?.name ?? tc?.type ?? "unknown",
        toolArguments:
          tryParseJson(tc?.function?.arguments) ?? tc?.function?.arguments,
        toolCallId: tc?.id,
        raw: tc,
      });
    }
  }

  // 3. function_call (legacy)
  if (msg?.function_call) {
    blocks.push({
      type: "tool_call",
      toolName: msg.function_call.name,
      toolArguments:
        tryParseJson(msg.function_call.arguments) ??
        msg.function_call.arguments,
      raw: msg.function_call,
    });
  }

  // 4. tool 响应消息
  if (role === "tool") {
    blocks.push({
      type: "tool_result",
      toolName: msg?.name,
      toolCallId: msg?.tool_call_id,
      toolResult: tryParseJson(content) ?? content,
      raw: content,
    });
  }

  return { role, blocks, raw: msg };
}

function parseOpenAIContentPart(part: any): ParsedMessageBlock {
  if (!part || typeof part !== "object") {
    return { type: "unknown", raw: part };
  }
  switch (part.type) {
    case "text":
    case "input_text":
    case "output_text":
      return { type: "text", text: part.text ?? "" };
    case "image_url":
      return {
        type: "image",
        imageRef:
          typeof part.image_url === "string"
            ? part.image_url
            : part.image_url?.url,
        raw: part,
      };
    case "input_image":
      return { type: "image", imageRef: part.image_url ?? part.url, raw: part };
    case "refusal":
      return { type: "refusal", text: part.refusal ?? "" };
    default:
      return { type: "unknown", raw: part };
  }
}

// ===================================================================
// OpenAI Responses API 请求
// ===================================================================

function parseOpenAIResponsesRequest(
  parsed: any,
  format: ApiFormat,
  result: RequestParseResult
): RequestParseResult {
  result.format = format;
  result.model = typeof parsed.model === "string" ? parsed.model : undefined;
  result.stream =
    parsed.stream === true ? true : parsed.stream === false ? false : undefined;

  // instructions 字段当作 system message
  if (typeof parsed.instructions === "string" && parsed.instructions) {
    result.messages.push({
      role: "system",
      blocks: [{ type: "text", text: parsed.instructions }],
      raw: { instructions: parsed.instructions },
    });
  }

  // input：可能是 string，也可能是 message array
  const input = parsed.input;
  if (typeof input === "string") {
    result.messages.push({
      role: "user",
      blocks: [{ type: "text", text: input }],
      raw: input,
    });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (item?.type === "message" || item?.role) {
        result.messages.push(parseOpenAIChatRequestMessage(item));
      } else if (item?.type === "function_call") {
        result.messages.push({
          role: "assistant",
          blocks: [
            {
              type: "tool_call",
              toolName: item.name,
              toolArguments: tryParseJson(item.arguments) ?? item.arguments,
              toolCallId: item.call_id ?? item.id,
              raw: item,
            },
          ],
          raw: item,
        });
      } else if (item?.type === "function_call_output") {
        result.messages.push({
          role: "tool",
          blocks: [
            {
              type: "tool_result",
              toolCallId: item.call_id ?? item.id,
              toolResult: tryParseJson(item.output) ?? item.output,
              raw: item,
            },
          ],
          raw: item,
        });
      } else {
        result.messages.push({
          role: "unknown",
          blocks: [{ type: "unknown", raw: item }],
          raw: item,
        });
      }
    }
  }

  return result;
}

// ===================================================================
// Anthropic 请求
// ===================================================================

function parseAnthropicRequest(
  parsed: any,
  format: ApiFormat,
  result: RequestParseResult
): RequestParseResult {
  result.format = format;
  result.model = typeof parsed.model === "string" ? parsed.model : undefined;
  result.stream =
    parsed.stream === true ? true : parsed.stream === false ? false : undefined;

  // system 是顶层字段，可能是字符串或 block 数组
  if (typeof parsed.system === "string" && parsed.system) {
    result.messages.push({
      role: "system",
      blocks: [{ type: "text", text: parsed.system }],
      raw: parsed.system,
    });
  } else if (Array.isArray(parsed.system)) {
    const blocks: ParsedMessageBlock[] = [];
    for (const block of parsed.system) {
      blocks.push(parseAnthropicContentBlock(block));
    }
    if (blocks.length) {
      result.messages.push({ role: "system", blocks, raw: parsed.system });
    }
  }

  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  for (const msg of messages) {
    result.messages.push(parseAnthropicMessage(msg));
  }

  return result;
}

function parseAnthropicMessage(msg: any): ParsedMessage {
  const role = normalizeRole(msg?.role);
  const blocks: ParsedMessageBlock[] = [];
  const content = msg?.content;

  if (typeof content === "string") {
    if (content) blocks.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const block of content) {
      blocks.push(parseAnthropicContentBlock(block));
    }
  }

  return { role, blocks, raw: msg };
}

function parseAnthropicContentBlock(block: any): ParsedMessageBlock {
  if (!block || typeof block !== "object") {
    return { type: "unknown", raw: block };
  }
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text ?? "" };
    case "thinking":
      return { type: "thinking", text: block.thinking ?? "" };
    case "tool_use":
      return {
        type: "tool_call",
        toolName: block.name,
        toolArguments: block.input,
        toolCallId: block.id,
        raw: block,
      };
    case "tool_result":
      return {
        type: "tool_result",
        toolCallId: block.tool_use_id,
        toolResult: block.content,
        raw: block,
      };
    case "image":
      return {
        type: "image",
        imageRef:
          block.source?.url ??
          (block.source?.type === "base64"
            ? `data:${block.source?.media_type ?? "image/*"};base64,...`
            : undefined),
        raw: block,
      };
    default:
      return { type: "unknown", raw: block };
  }
}

// ===================================================================
// Gemini 请求
// ===================================================================

function parseGeminiRequest(
  parsed: any,
  format: ApiFormat,
  result: RequestParseResult
): RequestParseResult {
  result.format = format;
  result.model = typeof parsed.model === "string" ? parsed.model : undefined;
  result.stream = undefined; // Gemini 的 stream 由 URL endpoint 决定，不在 body 中

  // systemInstruction
  const sys = parsed.systemInstruction ?? parsed.system_instruction;
  if (sys) {
    const blocks = parseGeminiParts(sys.parts ?? []);
    if (blocks.length) {
      result.messages.push({ role: "system", blocks, raw: sys });
    }
  }

  const contents = Array.isArray(parsed.contents) ? parsed.contents : [];
  for (const content of contents) {
    result.messages.push({
      role: normalizeRole(content?.role),
      blocks: parseGeminiParts(content?.parts ?? []),
      raw: content,
    });
  }

  return result;
}

function parseGeminiParts(parts: any[]): ParsedMessageBlock[] {
  const blocks: ParsedMessageBlock[] = [];
  if (!Array.isArray(parts)) return blocks;

  for (const part of parts) {
    if (!part || typeof part !== "object") {
      blocks.push({ type: "unknown", raw: part });
      continue;
    }
    if (typeof part.text === "string") {
      // thought 字段标记思维链
      if (part.thought) {
        blocks.push({ type: "thinking", text: part.text });
      } else {
        blocks.push({ type: "text", text: part.text });
      }
      continue;
    }
    if (part.functionCall) {
      blocks.push({
        type: "tool_call",
        toolName: part.functionCall.name,
        toolArguments: part.functionCall.args,
        raw: part,
      });
      continue;
    }
    if (part.functionResponse) {
      blocks.push({
        type: "tool_result",
        toolName: part.functionResponse.name,
        toolResult: part.functionResponse.response,
        raw: part,
      });
      continue;
    }
    if (part.inlineData || part.fileData) {
      blocks.push({
        type: "image",
        imageRef:
          part.fileData?.fileUri ??
          (part.inlineData?.mimeType
            ? `data:${part.inlineData.mimeType};base64,...`
            : undefined),
        raw: part,
      });
      continue;
    }
    blocks.push({ type: "unknown", raw: part });
  }

  return blocks;
}

// ===================================================================
// Cohere 请求（简化处理）
// ===================================================================

function parseCohereRequest(
  parsed: any,
  format: ApiFormat,
  result: RequestParseResult
): RequestParseResult {
  result.format = format;
  result.model = typeof parsed.model === "string" ? parsed.model : undefined;
  result.stream =
    parsed.stream === true ? true : parsed.stream === false ? false : undefined;

  // v2 messages
  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  for (const msg of messages) {
    const role = normalizeRole(msg?.role);
    const blocks: ParsedMessageBlock[] = [];
    const content = msg?.content;
    if (typeof content === "string") {
      if (content) blocks.push({ type: "text", text: content });
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === "text") {
          blocks.push({ type: "text", text: part.text ?? "" });
        } else {
          blocks.push({ type: "unknown", raw: part });
        }
      }
    }
    result.messages.push({ role, blocks, raw: msg });
  }

  // v1 message + chat_history
  if (!messages.length && typeof parsed.message === "string") {
    const history = Array.isArray(parsed.chat_history)
      ? parsed.chat_history
      : [];
    for (const h of history) {
      result.messages.push({
        role: normalizeRole(h?.role),
        blocks: [{ type: "text", text: h?.message ?? "" }],
        raw: h,
      });
    }
    result.messages.push({
      role: "user",
      blocks: [{ type: "text", text: parsed.message }],
      raw: parsed.message,
    });
  }

  return result;
}

// ===================================================================
// 通用兜底
// ===================================================================

function parseGenericRequest(
  parsed: any,
  format: ApiFormat,
  result: RequestParseResult
): RequestParseResult {
  result.format = format;
  result.model = typeof parsed?.model === "string" ? parsed.model : undefined;
  result.errors.push("未识别的 API 格式，已使用通用启发式解析");

  // 兜底：识别 messages / contents / prompt
  if (Array.isArray(parsed?.messages)) {
    for (const msg of parsed.messages) {
      result.messages.push(parseOpenAIChatRequestMessage(msg));
    }
  } else if (Array.isArray(parsed?.contents)) {
    for (const content of parsed.contents) {
      result.messages.push({
        role: normalizeRole(content?.role),
        blocks: parseGeminiParts(content?.parts ?? []),
        raw: content,
      });
    }
  } else if (typeof parsed?.prompt === "string") {
    result.messages.push({
      role: "user",
      blocks: [{ type: "text", text: parsed.prompt }],
      raw: parsed.prompt,
    });
  }

  return result;
}

// ===================================================================
// OpenAI Chat / Completions / Ollama 响应
// ===================================================================

function parseOpenAIChatResponse(
  parsed: any,
  format: ApiFormat,
  result: ResponseParseResult
): ResponseParseResult {
  result.format = format;
  result.model = typeof parsed.model === "string" ? parsed.model : undefined;

  const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
  for (const choice of choices) {
    const msg = choice?.message ?? choice;
    const role = normalizeRole(msg?.role ?? "assistant");
    const blocks: ParsedMessageBlock[] = [];

    // reasoning_content (o1/o3/DeepSeek 思维链)
    if (typeof msg?.reasoning_content === "string" && msg.reasoning_content) {
      blocks.push({ type: "thinking", text: msg.reasoning_content });
    }

    const content = msg?.content;
    if (typeof content === "string") {
      if (content) blocks.push({ type: "text", text: content });
    } else if (Array.isArray(content)) {
      for (const part of content) {
        blocks.push(parseOpenAIContentPart(part));
      }
    }

    // refusal
    if (typeof msg?.refusal === "string" && msg.refusal) {
      blocks.push({ type: "refusal", text: msg.refusal });
    }

    // tool_calls
    if (Array.isArray(msg?.tool_calls)) {
      for (const tc of msg.tool_calls) {
        blocks.push({
          type: "tool_call",
          toolName: tc?.function?.name ?? tc?.type ?? "unknown",
          toolArguments:
            tryParseJson(tc?.function?.arguments) ?? tc?.function?.arguments,
          toolCallId: tc?.id,
          raw: tc,
        });
      }
    }

    if (msg?.function_call) {
      blocks.push({
        type: "tool_call",
        toolName: msg.function_call.name,
        toolArguments:
          tryParseJson(msg.function_call.arguments) ??
          msg.function_call.arguments,
        raw: msg.function_call,
      });
    }

    // legacy completions: text 字段
    if (!blocks.length && typeof choice?.text === "string") {
      blocks.push({ type: "text", text: choice.text });
    }

    result.messages.push({ role, blocks, raw: choice });

    if (!result.stopReason && typeof choice?.finish_reason === "string") {
      result.stopReason = choice.finish_reason;
    }
  }

  // Ollama 单消息结构
  if (!result.messages.length && parsed?.message) {
    result.messages.push(parseOpenAIChatRequestMessage(parsed.message));
  }

  return result;
}

// ===================================================================
// OpenAI Responses API 响应
// ===================================================================

function parseOpenAIResponsesResponse(
  parsed: any,
  format: ApiFormat,
  result: ResponseParseResult
): ResponseParseResult {
  result.format = format;
  result.model = typeof parsed.model === "string" ? parsed.model : undefined;
  result.stopReason = parsed.status ?? parsed.finish_reason;

  const outputs = Array.isArray(parsed.output) ? parsed.output : [];
  const blocks: ParsedMessageBlock[] = [];

  for (const output of outputs) {
    if (!output || typeof output !== "object") continue;
    if (output.type === "message") {
      for (const part of output.content ?? []) {
        if (part?.type === "output_text") {
          blocks.push({ type: "text", text: part.text ?? "" });
        } else if (part?.type === "refusal") {
          blocks.push({ type: "refusal", text: part.refusal ?? "" });
        } else {
          blocks.push({ type: "unknown", raw: part });
        }
      }
    } else if (output.type === "reasoning") {
      const summaries = (output.summary ?? [])
        .map((s: any) => s?.text)
        .filter(Boolean)
        .join("\n");
      if (summaries) blocks.push({ type: "thinking", text: summaries });
    } else if (output.type === "function_call") {
      blocks.push({
        type: "tool_call",
        toolName: output.name,
        toolArguments: tryParseJson(output.arguments) ?? output.arguments,
        toolCallId: output.call_id ?? output.id,
        raw: output,
      });
    } else {
      blocks.push({ type: "unknown", raw: output });
    }
  }

  // 兜底：顶层 output_text
  if (!blocks.length && typeof parsed.output_text === "string") {
    blocks.push({ type: "text", text: parsed.output_text });
  }

  if (blocks.length) {
    result.messages.push({ role: "assistant", blocks, raw: parsed.output });
  }

  return result;
}

// ===================================================================
// Anthropic 响应
// ===================================================================

function parseAnthropicResponse(
  parsed: any,
  format: ApiFormat,
  result: ResponseParseResult
): ResponseParseResult {
  result.format = format;
  result.model = typeof parsed.model === "string" ? parsed.model : undefined;
  result.stopReason =
    typeof parsed.stop_reason === "string" ? parsed.stop_reason : undefined;

  const role = normalizeRole(parsed.role ?? "assistant");
  const contentBlocks = Array.isArray(parsed.content) ? parsed.content : [];
  const blocks: ParsedMessageBlock[] = [];

  for (const block of contentBlocks) {
    blocks.push(parseAnthropicContentBlock(block));
  }

  if (blocks.length) {
    result.messages.push({ role, blocks, raw: parsed.content });
  }

  return result;
}

// ===================================================================
// Gemini 响应
// ===================================================================

function parseGeminiResponse(
  parsed: any,
  format: ApiFormat,
  result: ResponseParseResult
): ResponseParseResult {
  result.format = format;
  result.model =
    typeof parsed.modelVersion === "string" ? parsed.modelVersion : undefined;

  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  for (const candidate of candidates) {
    const blocks = parseGeminiParts(candidate?.content?.parts ?? []);
    if (blocks.length) {
      result.messages.push({
        role: normalizeRole(candidate?.content?.role ?? "model"),
        blocks,
        raw: candidate,
      });
    }
    if (!result.stopReason && typeof candidate?.finishReason === "string") {
      result.stopReason = candidate.finishReason;
    }
  }

  return result;
}

// ===================================================================
// Cohere 响应
// ===================================================================

function parseCohereResponse(
  parsed: any,
  format: ApiFormat,
  result: ResponseParseResult
): ResponseParseResult {
  result.format = format;
  result.model = typeof parsed.model === "string" ? parsed.model : undefined;
  result.stopReason = parsed.finish_reason;

  const blocks: ParsedMessageBlock[] = [];
  // v2 message.content
  const msgContent = parsed.message?.content;
  if (Array.isArray(msgContent)) {
    for (const part of msgContent) {
      if (part?.type === "text") {
        blocks.push({ type: "text", text: part.text ?? "" });
      } else {
        blocks.push({ type: "unknown", raw: part });
      }
    }
  } else if (typeof parsed.text === "string") {
    // v1
    blocks.push({ type: "text", text: parsed.text });
  }

  if (blocks.length) {
    result.messages.push({ role: "assistant", blocks, raw: parsed });
  }

  return result;
}

// ===================================================================
// 通用兜底响应
// ===================================================================

function parseGenericResponse(
  parsed: any,
  format: ApiFormat,
  result: ResponseParseResult
): ResponseParseResult {
  result.format = format;
  result.model = typeof parsed?.model === "string" ? parsed.model : undefined;
  result.errors.push("未识别的 API 格式，已使用通用启发式解析");

  const blocks: ParsedMessageBlock[] = [];
  // 复用 OpenAI 兜底
  if (Array.isArray(parsed?.choices) && parsed.choices.length) {
    return parseOpenAIChatResponse(parsed, format, result);
  }
  if (Array.isArray(parsed?.content)) {
    for (const block of parsed.content) {
      blocks.push(parseAnthropicContentBlock(block));
    }
  } else if (Array.isArray(parsed?.candidates)) {
    return parseGeminiResponse(parsed, format, result);
  } else if (typeof parsed?.text === "string") {
    blocks.push({ type: "text", text: parsed.text });
  }

  if (blocks.length) {
    result.messages.push({ role: "assistant", blocks, raw: parsed });
  }

  return result;
}

// ===================================================================
// 工具函数
// ===================================================================

function safeJsonParse(input: string): any {
  try {
    return JSON.parse(input);
  } catch (error) {
    logger.debug("JSON 解析失败", { error: String(error) });
    return undefined;
  }
}

function tryParseJson(input: unknown): unknown {
  if (typeof input !== "string") return undefined;
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}

function normalizeRole(role: unknown): ParsedMessage["role"] {
  if (typeof role !== "string") return "unknown";
  const lower = role.toLowerCase();
  switch (lower) {
    case "system":
    case "developer": // OpenAI Responses 新 role
      return "system";
    case "user":
    case "human":
      return "user";
    case "assistant":
    case "ai":
      return "assistant";
    case "model": // Gemini
      return "model";
    case "tool":
    case "function":
      return "tool";
    default:
      return "unknown";
  }
}
