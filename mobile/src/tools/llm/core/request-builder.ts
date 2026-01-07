/**
 * LLM API 请求构建辅助模块
 *
 * 该模块包含用于将内部统一的 LlmRequestOptions 格式转换为
 * 各个 LLM API 提供商特定格式的通用辅助函数。
 */

import type { LlmMessageContent, LlmRequestOptions } from "../types/common";
import { getMatchedModelProperties } from "../config/model-metadata";

/**
 * 模型家族类型
 */
export type ModelFamily =
  | "openai"
  | "claude"
  | "gemini"
  | "cohere"
  | "deepseek"
  | "qwen"
  | "unknown";

/**
 * 解析后的消息内容结构
 */
export interface ParsedMessageContent {
  textParts: Array<{ text: string; cacheControl?: any }>;
  imageParts: Array<{
    base64: string;
    mimeType?: string;
    cacheControl?: any;
  }>;
  toolUseParts: Array<{
    id: string;
    name: string;
    input: Record<string, any>;
  }>;
  toolResultParts: Array<{
    id: string;
    content: string | LlmMessageContent[];
    isError?: boolean;
  }>;
  documentParts: Array<{ source: Record<string, any> }>;
  audioParts: Array<{ source: Record<string, any> }>;
  videoParts: Array<{
    source: Record<string, any>;
    videoMetadata?: Record<string, any>;
  }>;
}

/**
 * 解析消息内容数组
 */
export function parseMessageContents(messages: LlmMessageContent[]): ParsedMessageContent {
  const result: ParsedMessageContent = {
    textParts: [],
    imageParts: [],
    toolUseParts: [],
    toolResultParts: [],
    documentParts: [],
    audioParts: [],
    videoParts: [],
  };

  for (const msg of messages) {
    switch (msg.type) {
      case "text":
        if (msg.text) {
          result.textParts.push({ text: msg.text });
        }
        break;

      case "image":
        if (msg.imageBase64) {
          result.imageParts.push({
            base64: msg.imageBase64,
            mimeType: inferImageMimeType(msg.imageBase64),
          });
        }
        break;

      case "tool_use":
        if (msg.toolUseId && msg.toolName) {
          result.toolUseParts.push({
            id: msg.toolUseId,
            name: msg.toolName,
            input: msg.toolInput || {},
          });
        }
        break;

      case "tool_result":
        if (msg.toolResultId) {
          result.toolResultParts.push({
            id: msg.toolResultId,
            content: msg.toolResultContent || "",
            isError: msg.isError,
          });
        }
        break;

      case "document":
        if (msg.source) {
          result.documentParts.push({ source: msg.source });
        }
        break;

      case "audio":
        if (msg.source) {
          result.audioParts.push({ source: msg.source });
        }
        break;

      case "video":
        if (msg.source) {
          result.videoParts.push({
            source: msg.source,
            videoMetadata: msg.videoMetadata,
          });
        }
        break;
    }
  }

  return result;
}

/**
 * 通用的工具定义结构
 */
export interface CommonToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, any>;
  strict?: boolean;
}

/**
 * 从 LlmRequestOptions 中提取工具定义
 */
export function extractToolDefinitions(
  tools?: LlmRequestOptions["tools"]
): CommonToolDefinition[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool: any) => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters || {
      type: "object",
      properties: {},
    },
    strict: tool.function.strict,
  }));
}

/**
 * 通用参数集合
 */
export interface CommonParameters {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stop?: string | string[];
}

/**
 * 从 LlmRequestOptions 中提取通用参数
 */
export function extractCommonParameters(options: LlmRequestOptions): CommonParameters {
  const params: CommonParameters = {};

  if (options.temperature !== undefined) params.temperature = options.temperature;
  if (options.topP !== undefined) params.topP = options.topP;
  if (options.topK !== undefined) params.topK = options.topK;
  if (options.maxTokens !== undefined) params.maxTokens = options.maxTokens;
  if (options.frequencyPenalty !== undefined) params.frequencyPenalty = options.frequencyPenalty;
  if (options.presencePenalty !== undefined) params.presencePenalty = options.presencePenalty;
  if (options.seed !== undefined) params.seed = options.seed;
  if (options.stop !== undefined) params.stop = options.stop;

  return params;
}

/**
 * 工具选择策略类型
 */
export type ToolChoiceType = "auto" | "none" | "required" | { functionName: string };

/**
 * 解析工具选择策略
 */
export function parseToolChoice(
  toolChoice?: LlmRequestOptions["toolChoice"]
): ToolChoiceType | undefined {
  if (!toolChoice) return undefined;

  if (typeof toolChoice === "string") {
    return toolChoice as "auto" | "none" | "required";
  }

  if (toolChoice.type === "function") {
    return { functionName: toolChoice.function.name };
  }

  return undefined;
}

/**
 * 推断图片的 MIME 类型
 */
export function inferImageMimeType(base64Data?: string, fileExt?: string): string {
  if (fileExt) {
    const extMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      bmp: "image/bmp",
      svg: "image/svg+xml",
    };
    const ext = fileExt.toLowerCase().replace(".", "");
    if (extMap[ext]) return extMap[ext];
  }

  if (base64Data) {
    const header = base64Data.substring(0, 20);
    if (header.startsWith("iVBOR")) return "image/png";
    if (header.startsWith("/9j/")) return "image/jpeg";
    if (header.startsWith("R0lGO")) return "image/gif";
    if (header.startsWith("UklGR")) return "image/webp";
  }

  return "image/png";
}

/**
 * 推断媒体的 MIME 类型
 */
export function inferMediaMimeType(base64Data?: string, fileExt?: string): string {
  const imageMimeType = inferImageMimeType(base64Data, fileExt);
  if (imageMimeType !== "image/png" || !fileExt) return imageMimeType;

  if (fileExt) {
    const extMap: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      aac: "audio/aac",
      flac: "audio/flac",
      mp4: "video/mp4",
      mpeg: "video/mpeg",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      webm: "video/webm",
      pdf: "application/pdf",
    };
    const ext = fileExt.toLowerCase().replace(".", "");
    if (extMap[ext]) return extMap[ext];
  }

  return imageMimeType;
}

/**
 * 构建 Base64 Data URL
 */
export function buildBase64DataUrl(base64Data: string, mimeType?: string): string {
  const finalMimeType = mimeType || inferImageMimeType(base64Data);
  return `data:${finalMimeType};base64,${base64Data}`;
}

/**
 * 获取模型所属的家族
 */
export function getModelFamily(modelId: string, provider?: string): ModelFamily {
  const props = getMatchedModelProperties(modelId, provider);
  const group = props?.group?.toLowerCase();

  if (!group) {
    if (provider) {
      const lowerProvider = provider.toLowerCase();
      if (lowerProvider === "anthropic" || lowerProvider === "claude") return "claude";
      if (lowerProvider === "google" || lowerProvider === "gemini" || lowerProvider === "vertexai") return "gemini";
      if (lowerProvider === "cohere") return "cohere";
      if (lowerProvider === "deepseek") return "deepseek";
      if (lowerProvider === "qwen" || lowerProvider === "alibaba") return "qwen";
    }
    return "unknown";
  }

  if (group === "openai" || group === "openai responses" || group.startsWith("gpt")) return "openai";
  if (group === "claude" || group.startsWith("claude")) return "claude";
  if (group === "gemini" || group === "gemma" || group.startsWith("gemini") || group.startsWith("gemma")) return "gemini";
  if (group === "cohere" || group === "command") return "cohere";
  if (group === "deepseek") return "deepseek";
  if (group === "qwen" || group.startsWith("qwen")) return "qwen";

  return "unknown";
}

/**
 * 定义所有已知的、非自定义透传的选项键
 */
export const KNOWN_NON_MODEL_OPTIONS_KEYS = new Set([
  "messages",
  "modelId",
  "profileId",
  "stream",
  "onStream",
  "onReasoningStream",
  "signal",
  "timeout",
  "temperature",
  "maxTokens",
  "topP",
  "topK",
  "frequencyPenalty",
  "presencePenalty",
  "seed",
  "stop",
  "n",
  "logprobs",
  "topLogprobs",
  "maxCompletionTokens",
  "responseFormat",
  "tools",
  "toolChoice",
  "parallelToolCalls",
  "reasoningEffort",
  "thinkingEnabled",
  "thinkingBudget",
  "thinkingLevel",
  "includeThoughts",
  "webSearchOptions",
  "streamOptions",
  "user",
  "serviceTier",
  "logitBias",
  "store",
  "metadata",
  "stopSequences",
  "claudeMetadata",
  "safetySettings",
  "enableCodeExecution",
  "speechConfig",
  "responseModalities",
  "mediaResolution",
  "enableEnhancedCivicAnswers",
]);

/**
 * 将未知的自定义参数合并到请求体中
 */
export function applyCustomParameters(body: any, options: LlmRequestOptions): any {
  for (const key in options) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      if (!KNOWN_NON_MODEL_OPTIONS_KEYS.has(key) && (options as any)[key] !== undefined) {
        const value = (options as any)[key];
        if (
          body[key] &&
          typeof body[key] === "object" &&
          !Array.isArray(body[key]) &&
          body[key] !== null &&
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          value !== null
        ) {
          body[key] = { ...body[key], ...value };
        } else {
          body[key] = value;
        }
      }
    }
  }
  return body;
}

/**
 * 清理请求体中的内部字段
 */
export function cleanPayload(body: any): any {
  if (!body || typeof body !== "object") return body;

  const forbiddenKeys = [
    "profileId",
    "onStream",
    "onReasoningStream",
    "signal",
    "timeout",
    "thinkingEnabled",
    "thinkingBudget",
    "thinkingLevel",
    "reasoningEffort",
    "includeThoughts",
  ];

  for (const key of forbiddenKeys) {
    if (key in body) {
      delete body[key];
    }
  }

  return body;
}