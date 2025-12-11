/**
 * LLM API 请求构建辅助模块
 *
 * 该模块包含用于将内部统一的 LlmRequestOptions 格式转换为
 * 各个 LLM API 提供商特定格式的通用辅助函数。
 *
 * 设计原则：
 * - 提取通用逻辑，减少代码重复
 * - 保持灵活性，各 API 模块可根据需要进一步定制
 * - 不强制统一所有差异，尊重各 API 的独特性
 */

import type { LlmMessageContent, LlmRequestOptions } from "./common";
import type { LlmProfile, LlmModelInfo } from "../types/llm-profiles";
import { getProviderTypeInfo } from "../config/llm-providers";

/**
 * 解析后的消息内容结构
 * 将 LlmMessageContent[] 解析为分类的各个部分，便于后续转换
 */
export interface ParsedMessageContent {
  /** 所有文本部分 */
  textParts: Array<{ text: string; cacheControl?: any }>;
  /** 所有图片部分 */
  imageParts: Array<{
    base64: string;
    mimeType?: string;
    cacheControl?: any;
  }>;
  /** 所有工具使用部分 */
  toolUseParts: Array<{
    id: string;
    name: string;
    input: Record<string, any>;
  }>;
  /** 所有工具结果部分 */
  toolResultParts: Array<{
    id: string;
    content: string | LlmMessageContent[];
    isError?: boolean;
  }>;
  /** 所有文档部分 */
  documentParts: Array<{
    source: Record<string, any>;
  }>;
}

/**
 * 解析消息内容数组
 * 将 LlmMessageContent[] 解析为分类的各个部分
 *
 * @param messages - 要解析的消息内容数组
 * @returns 解析后的消息内容结构
 */
export function parseMessageContents(messages: LlmMessageContent[]): ParsedMessageContent {
  const result: ParsedMessageContent = {
    textParts: [],
    imageParts: [],
    toolUseParts: [],
    toolResultParts: [],
    documentParts: [],
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
            mimeType: inferImageMimeType(msg.imageBase64), // 自动推断 MIME 类型
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
        if (msg.documentSource) {
          result.documentParts.push({
            source: msg.documentSource,
          });
        }
        break;
    }
  }

  return result;
}

/**
 * 通用的工具定义结构
 * 代表从 LlmRequestOptions.tools 中提取的标准化工具信息
 */
export interface CommonToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, any>;
  strict?: boolean;
}

/**
 * 从 LlmRequestOptions 中提取工具定义
 *
 * @param tools - LlmRequestOptions 中的工具数组
 * @returns 标准化的工具定义数组，如果没有工具则返回 undefined
 */
export function extractToolDefinitions(
  tools?: LlmRequestOptions["tools"]
): CommonToolDefinition[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
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
 * 从 LlmRequestOptions 中提取的常见参数
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
 *
 * @param options - LLM 请求选项
 * @returns 标准化的通用参数对象
 */
export function extractCommonParameters(options: LlmRequestOptions): CommonParameters {
  const params: CommonParameters = {};

  if (options.temperature !== undefined) {
    params.temperature = options.temperature;
  }
  if (options.topP !== undefined) {
    params.topP = options.topP;
  }
  if (options.topK !== undefined) {
    params.topK = options.topK;
  }
  if (options.maxTokens !== undefined) {
    params.maxTokens = options.maxTokens;
  }
  if (options.frequencyPenalty !== undefined) {
    params.frequencyPenalty = options.frequencyPenalty;
  }
  if (options.presencePenalty !== undefined) {
    params.presencePenalty = options.presencePenalty;
  }
  if (options.seed !== undefined) {
    params.seed = options.seed;
  }
  if (options.stop !== undefined) {
    params.stop = options.stop;
  }

  return params;
}

/**
 * 工具选择策略类型
 */
export type ToolChoiceType = "auto" | "none" | "required" | { functionName: string };

/**
 * 解析工具选择策略
 * 将 LlmRequestOptions.toolChoice 转换为标准化格式
 *
 * @param toolChoice - LlmRequestOptions 中的工具选择策略
 * @returns 标准化的工具选择类型
 */
export function parseToolChoice(
  toolChoice?: LlmRequestOptions["toolChoice"]
): ToolChoiceType | undefined {
  if (!toolChoice) {
    return undefined;
  }

  if (typeof toolChoice === "string") {
    return toolChoice as "auto" | "none" | "required";
  }

  if (toolChoice.type === "function") {
    return { functionName: toolChoice.function.name };
  }

  return undefined;
}

/**
 * 合并对话历史和当前消息
 * 这是许多 API 都需要的常见操作
 *
 * @param currentMessages - 当前要发送的消息
 * @param conversationHistory - 对话历史
 * @returns 合并后的完整消息数组
 */
export function mergeConversationHistory(
  currentMessages: LlmMessageContent[],
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string | LlmMessageContent[];
  }>
): Array<{
  role: "user" | "assistant";
  content: string | LlmMessageContent[];
}> {
  const messages: Array<{
    role: "user" | "assistant";
    content: string | LlmMessageContent[];
  }> = [];

  // 添加历史消息
  if (conversationHistory && conversationHistory.length > 0) {
    messages.push(...conversationHistory);
  }

  // 添加当前消息
  if (currentMessages.length > 0) {
    messages.push({
      role: "user",
      content: currentMessages,
    });
  }

  return messages;
}

/**
 * 推断图片的 MIME 类型
 * 基于 base64 数据头或文件扩展名
 *
 * @param base64Data - base64 编码的图片数据
 * @param fileExt - 可选的文件扩展名
 * @returns MIME 类型字符串
 */
export function inferImageMimeType(base64Data?: string, fileExt?: string): string {
  // 根据文件扩展名推测
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

  // 根据 base64 数据头推测
  if (base64Data) {
    const header = base64Data.substring(0, 20);
    if (header.startsWith("iVBOR")) return "image/png";
    if (header.startsWith("/9j/")) return "image/jpeg";
    if (header.startsWith("R0lGO")) return "image/gif";
    if (header.startsWith("UklGR")) return "image/webp";
  }

  return "image/png"; // 默认
}

/**
 * 推断媒体的 MIME 类型（支持图片、音频、视频、文档）
 * 基于 base64 数据头或文件扩展名
 * 这是 inferImageMimeType 的扩展版本，支持更多媒体类型
 *
 * @param base64Data - base64 编码的媒体数据
 * @param fileExt - 可选的文件扩展名
 * @returns MIME 类型字符串
 */
export function inferMediaMimeType(base64Data?: string, fileExt?: string): string {
  // 首先尝试推断图片类型
  const imageMimeType = inferImageMimeType(base64Data, fileExt);

  // 如果不是默认的 image/png，说明已经成功识别了图片类型
  if (imageMimeType !== "image/png" || !fileExt) {
    return imageMimeType;
  }

  // 扩展支持音频、视频等其他媒体类型
  if (fileExt) {
    const extMap: Record<string, string> = {
      // 音频
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      aac: "audio/aac",
      flac: "audio/flac",
      // 视频
      mp4: "video/mp4",
      mpeg: "video/mpeg",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      webm: "video/webm",
      // 文档
      pdf: "application/pdf",
    };
    const ext = fileExt.toLowerCase().replace(".", "");
    if (extMap[ext]) return extMap[ext];
  }

  // 如果都没匹配到，返回默认值
  return imageMimeType;
}

/**
 * 构建 Base64 Data URL
 * 将 base64 数据和 MIME 类型组合成标准的 Data URL 格式
 *
 * @param base64Data - base64 编码的数据
 * @param mimeType - MIME 类型，如果未提供则自动推断
 * @returns Data URL 字符串，格式为 "data:mimeType;base64,data"
 */
export function buildBase64DataUrl(base64Data: string, mimeType?: string): string {
  const finalMimeType = mimeType || inferImageMimeType(base64Data);
  return `data:${finalMimeType};base64,${base64Data}`;
}

/**
 * 根据 Profile 和 Model 配置智能过滤 LLM 参数
 *
 * 双重过滤策略：
 * 1. 根据 Provider 的 supportedParameters 过滤（API 层面支持）
 * 2. 根据 Model 的 capabilities 过滤（模型能力层面支持）
 *
 * @param options - 完整的 LLM 请求选项
 * @param profile - LLM Profile 配置
 * @param model - 模型信息（可选，如果提供则进行更精确的过滤）
 * @returns 过滤后的参数对象
 */
export function filterParametersByCapabilities(
  options: LlmRequestOptions,
  profile: LlmProfile,
  model?: LlmModelInfo
): Partial<LlmRequestOptions> {
  const providerInfo = getProviderTypeInfo(profile.type);
  const supported = providerInfo?.supportedParameters;
  const capabilities = model?.capabilities;
  
  const filtered: Partial<LlmRequestOptions> = {};

  // 核心参数始终保留
  filtered.modelId = options.modelId;
  filtered.messages = options.messages;
  filtered.stream = options.stream;
  filtered.onStream = options.onStream;
  filtered.onReasoningStream = options.onReasoningStream;
  filtered.signal = options.signal;
  filtered.timeout = options.timeout;

  // 如果没有 provider 配置，保守策略：保留所有参数
  if (!supported) {
    return { ...options };
  }

  // ===== 基础采样参数（大多数 provider 都支持） =====
  if (supported.temperature && options.temperature !== undefined) {
    filtered.temperature = options.temperature;
  }
  if (supported.maxTokens && options.maxTokens !== undefined) {
    filtered.maxTokens = options.maxTokens;
  }
  if (supported.topP && options.topP !== undefined) {
    filtered.topP = options.topP;
  }
  if (supported.topK && options.topK !== undefined) {
    filtered.topK = options.topK;
  }
  if (supported.frequencyPenalty && options.frequencyPenalty !== undefined) {
    filtered.frequencyPenalty = options.frequencyPenalty;
  }
  if (supported.presencePenalty && options.presencePenalty !== undefined) {
    filtered.presencePenalty = options.presencePenalty;
  }
  if (supported.seed && options.seed !== undefined) {
    filtered.seed = options.seed;
  }
  if (supported.stop && options.stop !== undefined) {
    filtered.stop = options.stop;
  }

  // ===== 高级参数 =====
  if (supported.maxCompletionTokens && options.maxCompletionTokens !== undefined) {
    filtered.maxCompletionTokens = options.maxCompletionTokens;
  }
  if (supported.logprobs && options.logprobs !== undefined) {
    filtered.logprobs = options.logprobs;
  }
  if (supported.topLogprobs && options.topLogprobs !== undefined) {
    filtered.topLogprobs = options.topLogprobs;
  }
  if (supported.responseFormat && options.responseFormat !== undefined) {
    filtered.responseFormat = options.responseFormat;
  }

  // ===== 工具调用（需要同时检查 provider 支持和模型能力） =====
  const supportsTools = supported.tools && (!capabilities || capabilities.toolUse);
  if (supportsTools && options.tools !== undefined) {
    filtered.tools = options.tools;
  }
  if (supportsTools && supported.toolChoice && options.toolChoice !== undefined) {
    filtered.toolChoice = options.toolChoice;
  }
  if (supportsTools && supported.parallelToolCalls && options.parallelToolCalls !== undefined) {
    filtered.parallelToolCalls = options.parallelToolCalls;
  }

  // ===== 推理模式（o系列模型） =====
  // 兼容旧的 reasoningEffort 检查，或者新的 thinking 检查
  const supportsReasoning =
    (supported.reasoningEffort || supported.thinking) &&
    (!capabilities || capabilities.thinking);

  if (supportsReasoning && options.reasoningEffort !== undefined) {
    filtered.reasoningEffort = options.reasoningEffort;
  }

  // ===== 思考模式 (通用) =====
  // 只要 Provider 支持 thinking，就允许传递这些通用参数
  // 具体参数的转换由各 API 模块内部处理
  const supportsThinking = supported.thinking && (!capabilities || capabilities.thinking);
  if (supportsThinking) {
    if (options.thinkingEnabled !== undefined) filtered.thinkingEnabled = options.thinkingEnabled;
    if (options.thinkingBudget !== undefined) filtered.thinkingBudget = options.thinkingBudget;
  }

  // ===== 网络搜索 =====
  const supportsWebSearch = supported.webSearch && (!capabilities || capabilities.webSearch);
  if (supportsWebSearch && options.webSearchOptions !== undefined) {
    filtered.webSearchOptions = options.webSearchOptions;
  }

  // ===== 多模态输出 =====
  if (supported.modalities && options.modalities !== undefined) {
    filtered.modalities = options.modalities;
  }
  if (supported.audio && options.audio !== undefined) {
    filtered.audio = options.audio;
  }
  if (supported.prediction && options.prediction !== undefined) {
    filtered.prediction = options.prediction;
  }

  // ===== Provider 特有参数 =====
  
  // OpenAI 特有参数
  if (profile.type === 'openai' || profile.type === 'openai-responses') {
    if (options.n !== undefined) filtered.n = options.n;
    if (options.logitBias !== undefined) filtered.logitBias = options.logitBias;
    if (options.store !== undefined) filtered.store = options.store;
    if (options.user !== undefined) filtered.user = options.user;
    if (options.serviceTier !== undefined) filtered.serviceTier = options.serviceTier;
    if (options.streamOptions !== undefined) filtered.streamOptions = options.streamOptions;
    if (options.metadata !== undefined) filtered.metadata = options.metadata;
  }

  // Claude 特有参数
  if (profile.type === 'claude') {
    if (options.stopSequences !== undefined) filtered.stopSequences = options.stopSequences;
    if (options.claudeMetadata !== undefined) filtered.claudeMetadata = options.claudeMetadata;
  }

  // Gemini/VertexAI 特有参数
  if (profile.type === 'gemini' || profile.type === 'vertexai') {
    // 安全设置
    const extendedOptions = options as any;
    if (extendedOptions.safetySettings !== undefined) {
      (filtered as any).safetySettings = extendedOptions.safetySettings;
    }

    // 代码执行
    const supportsCodeExecution = supported.codeExecution && (!capabilities || capabilities.codeExecution);
    if (supportsCodeExecution) {
      // 代码执行相关参数在 gemini.ts 中处理
    }
  }

  return filtered;
}

/**
 * 定义所有已知的、在顶层处理的、非自定义透传的选项键。
 * 用于从 options 中分离出需要透传的未知自定义参数。
 *
 * 这个列表的目的是防止已经被明确处理过的参数被错误地再次当成自定义参数合并到请求体中。
 */
export const KNOWN_NON_MODEL_OPTIONS_KEYS = new Set([
  // 核心请求控制参数
  "messages",
  "modelId",
  "profileId", // 在 useLlmRequest 中使用，不应透传
  "stream",
  "onStream",
  "onReasoningStream",
  "signal",
  "timeout",

  // 通用采样参数 (LlmParameters)
  "temperature",
  "maxTokens",
  "topP",
  "topK",
  "frequencyPenalty",
  "presencePenalty",
  "seed",
  "stop",

  // 高级通用参数
  "n",
  "logprobs",
  "topLogprobs",
  "maxCompletionTokens",
  "responseFormat",

  // 工具调用相关
  "tools",
  "toolChoice",
  "parallelToolCalls",

  // 思考/推理相关
  "reasoningEffort",
  "thinking", // 旧版兼容
  "thinkingEnabled",
  "thinkingBudget",

  // 多模态与特定功能
  "modalities",
  "audio",
  "prediction",
  "webSearchOptions",
  "streamOptions",

  // Provider 特有参数
  "user", // OpenAI
  "serviceTier", // OpenAI
  "logitBias", // OpenAI
  "store", // OpenAI
  "metadata", // OpenAI, Claude
  "stopSequences", // Claude
  "claudeMetadata", // Claude
  "safetySettings", // Gemini
  "enableCodeExecution", // Gemini
  "speechConfig", // Gemini
  "responseModalities", // Gemini
  "mediaResolution", // Gemini
  "enableEnhancedCivicAnswers", // Gemini

  // 内部控制字段
  "contextManagement",
  "contextPostProcessing",
  "enabledParameters",
  "custom", // 旧版参数容器
]);

/**
 * 将未知的自定义参数合并到请求体中。
 * 这个函数会遍历 options 对象，找到所有未被 KNOWN_NON_MODEL_OPTIONS_KEYS 定义的键，
 * 并将它们（及其值）合并到 body 对象中。
 *
 * @param body - 将要发送给 API 的请求体对象 (将被原地修改)。
 * @param options - 包含所有参数的原始 LlmRequestOptions 对象。
 * @returns 修改后的 body 对象。
 */
export function applyCustomParameters(body: any, options: LlmRequestOptions): any {
  for (const key in options) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      // @ts-expect-error - key is a string
      if (!KNOWN_NON_MODEL_OPTIONS_KEYS.has(key) && options[key] !== undefined) {
        const rawKey = key;
        // @ts-expect-error - key is a string
        const value = options[key];

        // 检查是否需要合并对象（浅合并）
        // 这对于像 metadata 或 generationConfig 这样的顶层对象很有用
        if (
          body[rawKey] &&
          typeof body[rawKey] === "object" &&
          !Array.isArray(body[rawKey]) &&
          body[rawKey] !== null &&
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          value !== null
        ) {
          body[rawKey] = { ...body[rawKey], ...value };
        } else {
          body[rawKey] = value;
        }
      }
    }
  }
  return body;
}
