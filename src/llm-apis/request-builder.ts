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
import { getMatchedModelProperties } from "../config/model-metadata";

/**
 * 模型家族类型
 * 用于识别模型所属的 API 风格/家族，以便应用正确的参数格式
 */
export type ModelFamily =
  | "openai" // OpenAI 及其兼容格式
  | "claude" // Anthropic Claude 系列
  | "gemini" // Google Gemini/Gemma 系列
  | "cohere" // Cohere Command 系列
  | "deepseek" // DeepSeek 系列
  | "qwen" // 通义千问系列
  | "unknown"; // 未知/通用

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
 * 获取模型所属的家族
 * 完全基于元数据系统判断，不再硬编码字符串匹配
 *
 * @param modelId - 模型 ID
 * @param provider - 提供商标识（可选）
 * @returns 模型家族类型
 */
export function getModelFamily(modelId: string, provider?: string): ModelFamily {
  const props = getMatchedModelProperties(modelId, provider);
  const group = props?.group?.toLowerCase();

  if (!group) {
    // 如果元数据没有匹配到，尝试通过 provider 推断
    if (provider) {
      const lowerProvider = provider.toLowerCase();
      if (lowerProvider === "anthropic" || lowerProvider === "claude") return "claude";
      if (
        lowerProvider === "google" ||
        lowerProvider === "gemini" ||
        lowerProvider === "vertexai"
      )
        return "gemini";
      if (lowerProvider === "cohere") return "cohere";
      if (lowerProvider === "deepseek") return "deepseek";
      if (lowerProvider === "qwen" || lowerProvider === "alibaba") return "qwen";
    }
    return "unknown";
  }

  // 基于 group 判断家族
  // OpenAI 系列
  if (group === "openai" || group === "openai responses" || group.startsWith("gpt")) {
    return "openai";
  }

  // Claude 系列
  if (group === "claude" || group.startsWith("claude")) {
    return "claude";
  }

  // Gemini 系列
  if (
    group === "gemini" ||
    group === "gemma" ||
    group.startsWith("gemini") ||
    group.startsWith("gemma")
  ) {
    return "gemini";
  }

  // Cohere 系列
  if (group === "cohere" || group === "command") {
    return "cohere";
  }

  // DeepSeek 系列
  if (group === "deepseek") {
    return "deepseek";
  }

  // Qwen 系列
  if (group === "qwen" || group.startsWith("qwen")) {
    return "qwen";
  }

  return "unknown";
}

/**
 * 判断是否为 Claude 系列模型
 * 基于统一的 getModelFamily 函数
 */
export function isClaudeModel(modelId: string, provider?: string): boolean {
  return getModelFamily(modelId, provider) === "claude";
}

/**
 * 判断是否为 OpenAI 系列模型
 * 基于统一的 getModelFamily 函数
 */
export function isOpenAIModel(modelId: string, provider?: string): boolean {
  return getModelFamily(modelId, provider) === "openai";
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

  // ===== Provider/Model Family 特有参数 =====
  // 使用统一的 getModelFamily 函数判断模型所属家族，而非仅依赖 profile.type
  // 这样可以正确处理通过 OpenAI 兼容渠道访问其他厂商模型的场景
  const modelFamily = getModelFamily(options.modelId, profile.type);

  // OpenAI 特有参数
  // 条件：profile.type 是 openai 系列，且模型家族也是 openai（排除通过 OpenAI 渠道访问其他厂商的情况）
  const isOpenAIProfile = profile.type === "openai" || profile.type === "openai-responses";
  const shouldApplyOpenAIParams = isOpenAIProfile && (modelFamily === "openai" || modelFamily === "unknown");
  if (shouldApplyOpenAIParams) {
    if (options.n !== undefined) filtered.n = options.n;
    if (options.logitBias !== undefined) filtered.logitBias = options.logitBias;
    if (options.store !== undefined) filtered.store = options.store;
    if (options.user !== undefined) filtered.user = options.user;
    if (options.serviceTier !== undefined) filtered.serviceTier = options.serviceTier;
    if (options.streamOptions !== undefined) filtered.streamOptions = options.streamOptions;
    if (options.metadata !== undefined) filtered.metadata = options.metadata;
  }

  // Claude 特有参数
  // 条件：profile.type 是 claude，或者模型家族是 claude（通过其他渠道访问 Claude 模型）
  const shouldApplyClaudeParams = profile.type === "claude" || modelFamily === "claude";
  if (shouldApplyClaudeParams) {
    if (options.stopSequences !== undefined) filtered.stopSequences = options.stopSequences;
    if (options.claudeMetadata !== undefined) filtered.claudeMetadata = options.claudeMetadata;
  }

  // Gemini/VertexAI 特有参数
  // 条件：profile.type 是 gemini/vertexai，或者模型家族是 gemini（通过 OpenAI 渠道访问 Gemini 模型）
  const shouldApplyGeminiParams =
    profile.type === "gemini" || profile.type === "vertexai" || modelFamily === "gemini";
  if (shouldApplyGeminiParams) {
    // 安全设置
    const extendedOptions = options as any;
    if (extendedOptions.safetySettings !== undefined) {
      (filtered as any).safetySettings = extendedOptions.safetySettings;
    }

    // 其他 Gemini 特有参数
    const geminiSpecificKeys = [
      "enableCodeExecution",
      "speechConfig",
      "responseModalities",
      "mediaResolution",
      "enableEnhancedCivicAnswers",
      "includeThoughts", // Gemini 的思考摘要参数
    ] as const;

    for (const key of geminiSpecificKeys) {
      if (extendedOptions[key] !== undefined) {
        (filtered as any)[key] = extendedOptions[key];
      }
    }

    // 代码执行
    const supportsCodeExecution =
      supported.codeExecution && (!capabilities || capabilities.codeExecution);
    if (supportsCodeExecution) {
      // 代码执行相关参数在 gemini.ts 中处理
    }
  }

  // DeepSeek 特有参数
  // 条件：模型家族是 deepseek
  if (modelFamily === "deepseek") {
    const extendedOptions = options as any;
    // DeepSeek 支持 FIM 和 prefix completion，相关参数保留
    if (extendedOptions.prefix !== undefined) {
      (filtered as any).prefix = extendedOptions.prefix;
    }
  }

  // Cohere 特有参数
  // 条件：profile.type 是 cohere，或者模型家族是 cohere
  const shouldApplyCohereParams = profile.type === "cohere" || modelFamily === "cohere";
  if (shouldApplyCohereParams) {
    const extendedOptions = options as any;
    // Cohere 特有的参数
    if (extendedOptions.connectors !== undefined) {
      (filtered as any).connectors = extendedOptions.connectors;
    }
    if (extendedOptions.searchQueriesOnly !== undefined) {
      (filtered as any).searchQueriesOnly = extendedOptions.searchQueriesOnly;
    }
    if (extendedOptions.documents !== undefined) {
      (filtered as any).documents = extendedOptions.documents;
    }
    if (extendedOptions.citationQuality !== undefined) {
      (filtered as any).citationQuality = extendedOptions.citationQuality;
    }
  }

  // ===== 透传自定义参数 =====

  // 1. 优先处理 options.custom 中的参数（前端 ModelParametersEditor 组件产生的结构）
  // 必须将其展平到顶层，否则会被忽略
  const customParams = (options as any).custom;
  if (customParams && typeof customParams === "object") {
    for (const key in customParams) {
      if (Object.prototype.hasOwnProperty.call(customParams, key)) {
        // 只有当该参数不在 KNOWN_NON_MODEL_OPTIONS_KEYS 中时才添加
        // 这样可以防止用户通过 custom 覆盖核心参数（如 modelId, messages 等）
        if (!KNOWN_NON_MODEL_OPTIONS_KEYS.has(key) && customParams[key] !== undefined) {
          (filtered as any)[key] = customParams[key];
        }
      }
    }
  }

  // 2. 将所有未知的自定义参数（不在 KNOWN_NON_MODEL_OPTIONS_KEYS 中的）也保留下来
  // 这样它们才能在后续的 applyCustomParameters 中被处理
  for (const key in options) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      // @ts-expect-error - key is a string
      if (!KNOWN_NON_MODEL_OPTIONS_KEYS.has(key) && options[key] !== undefined) {
        // @ts-expect-error - key is a string
        (filtered as any)[key] = options[key];
      }
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
