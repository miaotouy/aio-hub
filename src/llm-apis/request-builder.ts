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
export function parseMessageContents(
  messages: LlmMessageContent[]
): ParsedMessageContent {
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
            mimeType: "image/png", // 默认，调用方可以覆盖
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
export function extractCommonParameters(
  options: LlmRequestOptions
): CommonParameters {
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
export function inferImageMimeType(
  base64Data?: string,
  fileExt?: string
): string {
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