/**
 * LLM Inspector — Token 估算与服务端 usage 提取（A3）
 *
 * 客户端职责：
 * - `estimateMessages`：复用项目已有的 `tokenCalculatorEngine` 单例，对一组
 *   `ParsedMessage` 做文本 Token 估算；附件 Token 暂留 stub 返回 0，等 F2/F3
 *   接入多模态策略后再补齐。
 * - `extractServerUsage`：从响应体里提取三大厂商上报的 usage 字段，统一归一
 *   到 `{ promptTokens, completionTokens, totalTokens }`，供 UI 与客户端估算
 *   做对比。
 *
 * 设计原则：
 * - 不引入新依赖，完全复用 token-calculator 的 transformers.js + profile 工具链。
 * - 提取失败返回 null 而不是 0，让 UI 能区分「服务端没上报」和「上报为零」。
 */

import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import {
  tokenCalculatorEngine,
  type TokenCalculationResult,
} from "@/tools/token-calculator/core/tokenCalculatorEngine";
import type { ParsedMessage } from "../types";
import type { ApiFormat } from "./apiFormat";

const logger = createModuleLogger("LlmInspector/TokenEstimator");
const errorHandler = createModuleErrorHandler("LlmInspector/TokenEstimator");

/**
 * 客户端消息估算结果
 */
export interface MessageTokenEstimate {
  /** 文本部分 Token 数（含 system/user/assistant 全部文本） */
  text: number;
  /** 附件 Token 数（暂留 stub，恒为 0；F2/F3 实装后接入） */
  attachment: number;
  /** 总 Token 数（text + attachment） */
  total: number;
  /** 使用的算法标识（profile id / "estimator" / "none"） */
  algorithm: string;
  /** 是否为粗略估算（true 表示走了字符级 fallback，没有命中 tokenizer profile） */
  isEstimated: boolean;
}

/**
 * 服务端 usage 字段统一结构
 */
export interface ServerUsage {
  /** 输入 Token（prompt） */
  promptTokens: number;
  /** 输出 Token（completion） */
  completionTokens: number;
  /** 总 Token（若服务端没给，自动推导 prompt + completion） */
  totalTokens: number;
}

// ===================================================================
// 客户端估算
// ===================================================================

/**
 * 估算一组消息的 Token 数
 *
 * 将所有 text/thinking/refusal 块的文本拼接成单一长字符串，并把
 * tool_call/tool_result 序列化为 JSON 文本一并计入，再调用 token-calculator
 * 引擎做一次性 encode。这样可以避免逐块 encode 时丢失上下文增量带来的偏差。
 *
 * @param messages 已解析的消息（来自 messageParser.parseRequestMessages 等）
 * @param model 模型 ID（用于 token-calculator 解析 profile）
 */
export async function estimateMessages(
  messages: ParsedMessage[],
  model: string | undefined
): Promise<MessageTokenEstimate> {
  try {
    const flattened = flattenMessagesToText(messages);
    if (!flattened) {
      return emptyEstimate();
    }

    const result: TokenCalculationResult = model
      ? await tokenCalculatorEngine.calculateTokens(flattened, model)
      : tokenCalculatorEngine.estimateTokens(flattened);

    const attachment = estimateAttachmentTokens(messages);
    return {
      text: result.count,
      attachment,
      total: result.count + attachment,
      algorithm: result.tokenizerName,
      isEstimated: result.isEstimated,
    };
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "Token 估算失败",
      showToUser: false,
      context: { model, messageCount: messages.length },
    });
    return emptyEstimate();
  }
}

/**
 * 附件 Token 估算（A3 阶段 stub，恒返回 0）
 *
 * F2/F3 接入多模态策略后会读取 ParsedMessageBlock.imageRef，结合各家
 * 模型的 VisionTokenCost 配置返回真实值。
 */
function estimateAttachmentTokens(_messages: ParsedMessage[]): number {
  return 0;
}

function emptyEstimate(): MessageTokenEstimate {
  return {
    text: 0,
    attachment: 0,
    total: 0,
    algorithm: "none",
    isEstimated: false,
  };
}

/**
 * 把 ParsedMessage[] 扁平化为单一字符串，用于一次性送入 tokenizer。
 *
 * - text / thinking / refusal：直接拼接文本
 * - tool_call：以 JSON 形式序列化 toolName + toolArguments
 * - tool_result：序列化 toolResult
 * - image / unknown：占位（避免计入空洞，按图像策略由 attachment 单独算）
 */
function flattenMessagesToText(messages: ParsedMessage[]): string {
  const parts: string[] = [];
  for (const message of messages) {
    parts.push(`<<${message.role}>>`);
    for (const block of message.blocks) {
      switch (block.type) {
        case "text":
        case "thinking":
        case "refusal":
          if (block.text) parts.push(block.text);
          break;
        case "tool_call": {
          const args =
            block.toolArguments === undefined
              ? ""
              : typeof block.toolArguments === "string"
                ? block.toolArguments
                : safeStringify(block.toolArguments);
          parts.push(`[tool_call:${block.toolName ?? "unknown"}] ${args}`);
          break;
        }
        case "tool_result": {
          const out =
            block.toolResult === undefined
              ? ""
              : typeof block.toolResult === "string"
                ? block.toolResult
                : safeStringify(block.toolResult);
          parts.push(`[tool_result:${block.toolName ?? "unknown"}] ${out}`);
          break;
        }
        case "image":
          parts.push("[IMAGE]");
          break;
        default:
          // unknown 块不计入文本
          break;
      }
    }
  }
  return parts.join("\n");
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ===================================================================
// 服务端 usage 提取
// ===================================================================

/**
 * 从响应体里提取服务端上报的 usage 字段
 *
 * @param body 响应体字符串（JSON）。流式响应需先聚合为最终 JSON 后再调用。
 * @param format 已检测的 API 格式
 * @returns 归一化的 usage；若响应体无效 / 未上报 usage 则返回 null
 */
export function extractServerUsage(
  body: string | undefined,
  format: ApiFormat
): ServerUsage | null {
  if (!body) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    logger.debug("响应体不是 JSON，无法提取 usage", { error: String(error) });
    return null;
  }

  switch (format) {
    case "openai-chat":
    case "openai-completions":
      return extractOpenAIUsage(parsed);
    case "openai-responses":
      return extractOpenAIResponsesUsage(parsed);
    case "anthropic":
      return extractAnthropicUsage(parsed);
    case "gemini":
      return extractGeminiUsage(parsed);
    case "cohere":
      return extractCohereUsage(parsed);
    case "ollama":
      return extractOllamaUsage(parsed);
    default:
      return extractGenericUsage(parsed);
  }
}

function extractOpenAIUsage(parsed: any): ServerUsage | null {
  const usage = parsed?.usage;
  if (!usage) return null;
  const prompt = toNumber(usage.prompt_tokens);
  const completion = toNumber(usage.completion_tokens);
  const total = toNumber(usage.total_tokens) ?? sumOrNull(prompt, completion);
  if (prompt === null && completion === null && total === null) return null;
  return {
    promptTokens: prompt ?? 0,
    completionTokens: completion ?? 0,
    totalTokens: total ?? (prompt ?? 0) + (completion ?? 0),
  };
}

function extractOpenAIResponsesUsage(parsed: any): ServerUsage | null {
  const usage = parsed?.usage;
  if (!usage) return null;
  // Responses API 字段叫 input_tokens / output_tokens / total_tokens
  const prompt = toNumber(usage.input_tokens) ?? toNumber(usage.prompt_tokens);
  const completion =
    toNumber(usage.output_tokens) ?? toNumber(usage.completion_tokens);
  const total = toNumber(usage.total_tokens) ?? sumOrNull(prompt, completion);
  if (prompt === null && completion === null && total === null) return null;
  return {
    promptTokens: prompt ?? 0,
    completionTokens: completion ?? 0,
    totalTokens: total ?? (prompt ?? 0) + (completion ?? 0),
  };
}

function extractAnthropicUsage(parsed: any): ServerUsage | null {
  const usage = parsed?.usage;
  if (!usage) return null;
  const prompt = toNumber(usage.input_tokens);
  const completion = toNumber(usage.output_tokens);
  // Anthropic 不直接给 total，自行求和
  if (prompt === null && completion === null) return null;
  return {
    promptTokens: prompt ?? 0,
    completionTokens: completion ?? 0,
    totalTokens: (prompt ?? 0) + (completion ?? 0),
  };
}

function extractGeminiUsage(parsed: any): ServerUsage | null {
  const usage = parsed?.usageMetadata;
  if (!usage) return null;
  const prompt = toNumber(usage.promptTokenCount);
  const completion = toNumber(usage.candidatesTokenCount);
  const total =
    toNumber(usage.totalTokenCount) ?? sumOrNull(prompt, completion);
  if (prompt === null && completion === null && total === null) return null;
  return {
    promptTokens: prompt ?? 0,
    completionTokens: completion ?? 0,
    totalTokens: total ?? (prompt ?? 0) + (completion ?? 0),
  };
}

function extractCohereUsage(parsed: any): ServerUsage | null {
  // Cohere v2: usage.billed_units.input_tokens / output_tokens
  // Cohere v1: meta.tokens.input_tokens / output_tokens
  const billed =
    parsed?.usage?.billed_units ?? parsed?.meta?.billed_units ?? null;
  const tokens = parsed?.meta?.tokens ?? null;
  const source = billed ?? tokens;
  if (!source) return null;
  const prompt = toNumber(source.input_tokens);
  const completion = toNumber(source.output_tokens);
  if (prompt === null && completion === null) return null;
  return {
    promptTokens: prompt ?? 0,
    completionTokens: completion ?? 0,
    totalTokens: (prompt ?? 0) + (completion ?? 0),
  };
}

function extractOllamaUsage(parsed: any): ServerUsage | null {
  // Ollama 返回 prompt_eval_count / eval_count
  const prompt = toNumber(parsed?.prompt_eval_count);
  const completion = toNumber(parsed?.eval_count);
  if (prompt === null && completion === null) return null;
  return {
    promptTokens: prompt ?? 0,
    completionTokens: completion ?? 0,
    totalTokens: (prompt ?? 0) + (completion ?? 0),
  };
}

/**
 * 通用兜底：按常见字段顺序尝试
 */
function extractGenericUsage(parsed: any): ServerUsage | null {
  return (
    extractOpenAIUsage(parsed) ??
    extractAnthropicUsage(parsed) ??
    extractGeminiUsage(parsed) ??
    extractOllamaUsage(parsed)
  );
}

function toNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const n = Number(input);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sumOrNull(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}
