import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse, LlmMessageContent, LlmMessage } from "./common";
import type { EmbeddingRequestOptions, EmbeddingResponse } from "./embedding-types";
import { fetchWithTimeout, ensureResponseOk } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { createModuleLogger } from "@utils/logger";
import { parseSSEStream, extractTextFromSSE } from "@utils/sse-parser";
import {
  parseMessageContents,
  extractCommonParameters,
  inferImageMimeType,
  extractToolDefinitions,
  parseToolChoice,
  applyCustomParameters,
} from "./request-builder";

const logger = createModuleLogger("VertexAiApi");

/**
 * Vertex AI Content Part 类型
 */
interface VertexAiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, any>;
  };
}

/**
 * Vertex AI Content 类型
 */
interface VertexAiContent {
  role?: "user" | "model";
  parts: VertexAiPart[];
}

/**
 * Vertex AI Tool 定义
 */
interface VertexAiTool {
  functionDeclarations?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  }>;
}

/**
 * Vertex AI Tool 配置
 */
interface VertexAiToolConfig {
  functionCallingConfig?: {
    mode?: "AUTO" | "ANY" | "NONE";
    allowedFunctionNames?: string[];
  };
}

/**
 * Vertex AI Generation Config
 */
interface VertexAiGenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
}

/**
 * Vertex AI Gemini 请求体（Google Publisher）
 */
interface VertexAiGeminiRequest {
  contents: VertexAiContent[];
  generationConfig?: VertexAiGenerationConfig;
  systemInstruction?: VertexAiContent;
  tools?: VertexAiTool[];
  toolConfig?: VertexAiToolConfig;
}

/**
 * Vertex AI Claude 请求体（Anthropic Publisher）
 */
interface VertexAiClaudeRequest {
  anthropic_version: string;
  messages: Array<{
    role: "user" | "assistant";
    content:
    | string
    | Array<{
      type: "text" | "image";
      text?: string;
      source?: {
        type: "base64";
        media_type: string;
        data: string;
      };
    }>;
  }>;
  max_tokens: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  system?: string;
  stop_sequences?: string[];
}

/**
 * 检测模型发布者类型
 */
function detectPublisher(modelId: string): "google" | "anthropic" {
  // Claude 模型特征：包含 claude 关键词
  if (modelId.toLowerCase().includes("claude")) {
    return "anthropic";
  }
  // 默认为 Google (Gemini)
  return "google";
}

/**
 * 构建 Vertex AI Parts（Gemini 格式）
 */
function buildVertexAiParts(messages: LlmMessageContent[]): VertexAiPart[] {
  const parsed = parseMessageContents(messages);
  const parts: VertexAiPart[] = [];

  // 文本部分
  for (const textPart of parsed.textParts) {
    parts.push({ text: textPart.text });
  }

  // 图片部分
  for (const imagePart of parsed.imageParts) {
    parts.push({
      inlineData: {
        mimeType: imagePart.mimeType || inferImageMimeType(imagePart.base64),
        data: imagePart.base64,
      },
    });
  }

  // 工具调用
  for (const toolUse of parsed.toolUseParts) {
    parts.push({
      functionCall: {
        name: toolUse.name,
        args: toolUse.input,
      },
    });
  }

  // 工具结果
  for (const toolResult of parsed.toolResultParts) {
    const response =
      typeof toolResult.content === "string"
        ? { result: toolResult.content }
        : { result: JSON.stringify(toolResult.content) };

    parts.push({
      functionResponse: {
        name: toolResult.id,
        response,
      },
    });
  }

  return parts;
}

/**
 * 构建多轮对话 Contents（Gemini 格式）
 * 注意：system 消息会被单独提取到 systemInstruction，不包含在 contents 中
 */
function buildVertexAiContents(messages: LlmMessage[]): VertexAiContent[] {
  const contents: VertexAiContent[] = [];

  // 过滤掉 system 消息，只处理 user 和 assistant
  for (const msg of messages) {
    if (msg.role === "system") continue;

    const parts =
      typeof msg.content === "string" ? [{ text: msg.content }] : buildVertexAiParts(msg.content);

    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts,
    });
  }

  return contents;
}

/**
 * 构建工具配置（Gemini 格式）
 */
function buildVertexAiTools(options: LlmRequestOptions): VertexAiTool[] | undefined {
  const commonTools = extractToolDefinitions(options.tools);
  if (!commonTools) return undefined;

  const functionDeclarations = commonTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  return [{ functionDeclarations }];
}

/**
 * 构建工具调用配置（Gemini 格式）
 */
function buildVertexAiToolConfig(options: LlmRequestOptions): VertexAiToolConfig | undefined {
  const parsed = parseToolChoice(options.toolChoice);
  if (!parsed) return undefined;

  const config: VertexAiToolConfig = {
    functionCallingConfig: {},
  };

  if (parsed === "auto") {
    config.functionCallingConfig!.mode = "AUTO";
  } else if (parsed === "none") {
    config.functionCallingConfig!.mode = "NONE";
  } else if (parsed === "required") {
    config.functionCallingConfig!.mode = "ANY";
  } else if (typeof parsed === "object" && "functionName" in parsed) {
    config.functionCallingConfig!.mode = "ANY";
    config.functionCallingConfig!.allowedFunctionNames = [parsed.functionName];
  }

  return config;
}

/**
 * 构建 Claude 格式的消息（Anthropic Publisher）
 * 注意：system 消息会被单独提取，不包含在 messages 中
 */
function buildClaudeMessages(messages: LlmMessage[]): VertexAiClaudeRequest["messages"] {
  const claudeMessages: VertexAiClaudeRequest["messages"] = [];

  // 过滤掉 system 消息
  for (const msg of messages) {
    if (msg.role === "system") continue;

    // 处理角色适配
    const role = msg.role === "assistant" ? "assistant" : "user";

    if (typeof msg.content === "string") {
      claudeMessages.push({
        role,
        content: msg.content,
      });
    } else {
      const parsed = parseMessageContents(msg.content);
      const contentBlocks: any[] = [];

      for (const textPart of parsed.textParts) {
        contentBlocks.push({ type: "text", text: textPart.text });
      }

      for (const imagePart of parsed.imageParts) {
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: imagePart.mimeType || inferImageMimeType(imagePart.base64),
            data: imagePart.base64,
          },
        });
      }

      claudeMessages.push({
        role,
        content: contentBlocks,
      });
    }
  }

  return claudeMessages;
}

/**
 * 调用 Vertex AI API（Google Publisher - Gemini 模型）
 */
async function callVertexAiGemini(
  profile: LlmProfile,
  options: LlmRequestOptions,
  url: string,
  apiKey: string
): Promise<LlmResponse> {
  const commonParams = extractCommonParameters(options);

  // 从 messages 中提取 system 消息
  const systemMessages = options.messages.filter(m => m.role === 'system');

  // 构建 generationConfig
  const generationConfig: VertexAiGenerationConfig = {
    maxOutputTokens: commonParams.maxTokens || 8192,
    temperature: commonParams.temperature ?? 1.0,
    topP: commonParams.topP,
    topK: commonParams.topK,
    stopSequences: commonParams.stop
      ? Array.isArray(commonParams.stop)
        ? commonParams.stop
        : [commonParams.stop]
      : undefined,
  };

  // 添加思考配置（从 gemini.ts 借鉴）
  const extendedOptions = options as any;
  // 如果 includeThoughts 为 true 或 thinkingEnabled 为 true（向后兼容），则创建 thinkingConfig
  const shouldIncludeThoughts = extendedOptions.includeThoughts === true || extendedOptions.thinkingEnabled === true;
  const hasThinkingBudget = extendedOptions.thinkingBudget !== undefined;
  const hasReasoningEffort = extendedOptions.reasoningEffort !== undefined;

  if (shouldIncludeThoughts || hasThinkingBudget || hasReasoningEffort) {
    const thinkingConfig: any = {};

    // 只有当显式要求返回思考时才设置 includeThoughts
    if (extendedOptions.includeThoughts === true) {
      thinkingConfig.includeThoughts = true;
    } else if (extendedOptions.thinkingEnabled === true) {
      // 向后兼容：thinkingEnabled 也意味着 includeThoughts
      thinkingConfig.includeThoughts = true;
    }

    // 注意：thinkingBudget 可以是 0（禁用思考）或 -1（动态思考）
    if (extendedOptions.thinkingBudget !== undefined) {
      thinkingConfig.thinkingBudget = extendedOptions.thinkingBudget;
    }

    // 注意：API 文档显示 thinkingLevel 应该使用小写值
    if (extendedOptions.reasoningEffort) {
      thinkingConfig.thinkingLevel = extendedOptions.reasoningEffort.toLowerCase();
    }

    // @ts-ignore - a little hacky but works
    generationConfig.thinkingConfig = thinkingConfig;
  }

  // 构建请求体
  const body: VertexAiGeminiRequest = {
    contents: buildVertexAiContents(options.messages),
    generationConfig,
  };

  // 系统指令 - 从 messages 中提取的 system 消息
  if (systemMessages.length > 0) {
    // 合并所有 system 消息的内容
    const systemContent = systemMessages
      .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      .join('\n\n');
    body.systemInstruction = {
      parts: [{ text: systemContent }],
    };
  }

  // 工具配置
  const tools = buildVertexAiTools(options);
  if (tools) {
    body.tools = tools;
  }

  const toolConfig = buildVertexAiToolConfig(options);
  if (toolConfig) {
    body.toolConfig = toolConfig;
  }

  // 应用自定义参数
  applyCustomParameters(body, options);

  logger.info("发送 Vertex AI Gemini 请求", {
    model: options.modelId,
    hasTools: !!tools,
    stream: !!options.stream,
  });

  // 构建请求头
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // 应用自定义请求头
  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  // 流式响应
  if (options.stream && options.onStream) {
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      options.timeout,
      options.signal
    );

    await ensureResponseOk(response);

    if (!response.body) {
      throw new Error("响应体为空");
    }

    const reader = response.body.getReader();
    let fullContent = "";
    let usage: LlmResponse["usage"] | undefined;
    let finishReason: LlmResponse["finishReason"] = null;
    let toolCalls: LlmResponse["toolCalls"] = undefined;

    let reasoningContent = "";

    await parseSSEStream(reader, (data) => {
      // 提取元数据
      try {
        const json = JSON.parse(data);

        if (json.usageMetadata) {
          usage = {
            promptTokens: json.usageMetadata.promptTokenCount || 0,
            completionTokens: json.usageMetadata.candidatesTokenCount || 0,
            totalTokens: json.usageMetadata.totalTokenCount || 0,
          };
        }

        if (json.candidates?.[0]?.finishReason) {
          finishReason = mapVertexAiFinishReason(json.candidates[0].finishReason);
        }

        // 遍历 parts 处理文本和思考摘要
        const parts = json.candidates?.[0]?.content?.parts;
        if (parts && Array.isArray(parts)) {
          for (const part of parts) {
            if (part.text) {
              // 检查是否为思考摘要
              if (part.thought) {
                reasoningContent += part.text;
                if (options.onReasoningStream) {
                  options.onReasoningStream(part.text);
                }
              } else {
                fullContent += part.text;
                options.onStream!(part.text);
              }
            } else if (part.functionCall) {
              // 提取函数调用
              toolCalls = [
                {
                  id: `call_${Date.now()}`,
                  type: "function",
                  function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args || {}),
                  },
                },
              ];
            }
          }
        }
      } catch {
        // 如果不是 JSON，尝试使用旧的文本提取方式
        const text = extractTextFromSSE(data, "gemini");
        if (text) {
          fullContent += text;
          options.onStream!(text);
        }
      }
    }, undefined, options.signal);

    const result: LlmResponse = {
      content: fullContent,
      usage,
      finishReason,
      toolCalls,
      isStream: true,
    };

    // 添加思考摘要
    if (reasoningContent) {
      result.reasoningContent = reasoningContent;
    }

    return result;
  }

  // 非流式响应
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    options.timeout,
    options.signal
  );

  await ensureResponseOk(response);

  const data = await response.json();

  // 解析响应
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error(`Vertex AI 响应格式异常: 没有候选回答`);
  }

  let content = "";
  let toolCalls: LlmResponse["toolCalls"] = undefined;
  let reasoningContent = "";

  if (candidate.content?.parts) {
    for (const part of candidate.content.parts) {
      // 检查是否为思考摘要
      if (part.thought && part.text) {
        reasoningContent += part.text;
        continue;
      }

      if (part.text) {
        content += part.text;
      } else if (part.functionCall) {
        if (!toolCalls) toolCalls = [];
        toolCalls.push({
          id: `call_${Date.now()}_${toolCalls.length}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        });
      }
    }
  }

  if (!content && !toolCalls) {
    throw new Error(`Vertex AI 响应格式异常: ${JSON.stringify(data)}`);
  }

  logger.info("Vertex AI Gemini 响应成功", {
    contentLength: content.length,
    toolCallsCount: toolCalls?.length || 0,
    hasReasoningContent: !!reasoningContent,
  });

  const result: LlmResponse = {
    content,
    usage: data.usageMetadata
      ? {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata.totalTokenCount || 0,
      }
      : undefined,
    finishReason: mapVertexAiFinishReason(candidate.finishReason),
    toolCalls,
  };

  // 添加思考摘要
  if (reasoningContent) {
    result.reasoningContent = reasoningContent;
  }

  return result;
}

/**
 * 调用 Vertex AI API（Anthropic Publisher - Claude 模型）
 */
async function callVertexAiClaude(
  profile: LlmProfile,
  options: LlmRequestOptions,
  url: string,
  apiKey: string
): Promise<LlmResponse> {
  const commonParams = extractCommonParameters(options);

  // 从 messages 中提取 system 消息
  const systemMessages = options.messages.filter(m => m.role === 'system');

  // 构建请求体
  const body: VertexAiClaudeRequest = {
    anthropic_version: "vertex-2023-10-16",
    messages: buildClaudeMessages(options.messages),
    max_tokens: commonParams.maxTokens || 8192,
  };

  // 添加参数
  if (commonParams.temperature !== undefined) {
    body.temperature = commonParams.temperature;
  }
  if (commonParams.topK !== undefined) {
    body.top_k = commonParams.topK;
  }
  if (commonParams.topP !== undefined) {
    body.top_p = commonParams.topP;
  }

  // 系统提示 - 从 messages 中提取的 system 消息
  if (systemMessages.length > 0) {
    // 合并所有 system 消息的内容
    const systemContent = systemMessages
      .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      .join('\n\n');
    body.system = systemContent;
  }

  // 停止序列
  if (options.stopSequences && options.stopSequences.length > 0) {
    body.stop_sequences = options.stopSequences;
  }

  // 应用自定义参数
  applyCustomParameters(body, options);

  logger.info("发送 Vertex AI Claude 请求", {
    model: options.modelId,
    messageCount: body.messages.length,
    stream: !!options.stream,
  });

  // 构建请求头
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // 应用自定义请求头
  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  // 流式响应
  if (options.stream && options.onStream) {
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      options.timeout,
      options.signal
    );

    await ensureResponseOk(response);

    if (!response.body) {
      throw new Error("响应体为空");
    }

    const reader = response.body.getReader();
    let fullContent = "";
    let usage: LlmResponse["usage"] | undefined;
    let stopReason: string | undefined;

    await parseSSEStream(reader, (data) => {
      try {
        const event = JSON.parse(data);

        // Claude 流式事件处理
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          const text = event.delta.text;
          if (text) {
            fullContent += text;
            options.onStream!(text);
          }
        } else if (event.type === "message_delta") {
          if (event.delta?.stop_reason) {
            stopReason = event.delta.stop_reason;
          }
          if (event.usage) {
            usage = {
              promptTokens: event.usage.input_tokens || 0,
              completionTokens: event.usage.output_tokens || 0,
              totalTokens: (event.usage.input_tokens || 0) + (event.usage.output_tokens || 0),
            };
          }
        } else if (event.type === "error") {
          throw new Error(`Vertex AI Claude 错误: ${event.error?.message}`);
        }
      } catch (parseError) {
        logger.warn("解析 Claude 流数据失败", { data, error: parseError });
      }
    }, undefined, options.signal);

    return {
      content: fullContent,
      usage,
      finishReason: stopReason as LlmResponse["finishReason"],
      isStream: true,
    };
  }

  // 非流式响应
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    options.timeout,
    options.signal
  );

  await ensureResponseOk(response);

  const data = await response.json();

  // 提取文本内容
  let textContent = "";
  if (data.content && Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === "text" && block.text) {
        textContent += block.text;
      }
    }
  }

  if (!textContent) {
    throw new Error(`Vertex AI Claude 响应格式异常: ${JSON.stringify(data)}`);
  }

  logger.info("Vertex AI Claude 响应成功", {
    contentLength: textContent.length,
    stopReason: data.stop_reason,
  });

  return {
    content: textContent,
    usage: data.usage
      ? {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      }
      : undefined,
    finishReason: data.stop_reason,
    stopSequence: data.stop_sequence,
  };
}

/**
 * 映射 Vertex AI finishReason 到通用格式
 */
function mapVertexAiFinishReason(reason: string | undefined): LlmResponse["finishReason"] {
  if (!reason) return null;

  const reasonMap: Record<string, LlmResponse["finishReason"]> = {
    STOP: "stop",
    MAX_TOKENS: "max_tokens",
    SAFETY: "content_filter",
    RECITATION: "content_filter",
    OTHER: "stop",
  };

  return reasonMap[reason] || "stop";
}

/**
 * 调用 Vertex AI API
 * 自动检测模型发布者类型（Google/Anthropic）并调用相应的实现
 */
export const callVertexAiApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  // 获取 Access Token
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

  // 检测发布者类型
  const publisher = detectPublisher(options.modelId);

  // 构建端点 URL
  let endpoint: string;
  if (publisher === "google") {
    // Gemini 模型
    endpoint =
      options.stream && options.onStream
        ? `publishers/google/models/${options.modelId}:streamGenerateContent`
        : `publishers/google/models/${options.modelId}:generateContent`;
  } else {
    // Claude 模型
    endpoint =
      options.stream && options.onStream
        ? `publishers/anthropic/models/${options.modelId}:streamRawPredict`
        : `publishers/anthropic/models/${options.modelId}:rawPredict`;
  }

  const url = buildLlmApiUrl(profile.baseUrl, "vertexai", endpoint);

  logger.info("调用 Vertex AI API", {
    publisher,
    model: options.modelId,
    endpoint,
  });

  // 根据发布者调用不同的实现
  if (publisher === "google") {
    return callVertexAiGemini(profile, options, url, apiKey);
  } else {
    return callVertexAiClaude(profile, options, url, apiKey);
  }
};

/**
 * 调用 Vertex AI Embedding API
 */
export const callVertexAiEmbeddingApi = async (
  profile: LlmProfile,
  options: EmbeddingRequestOptions
): Promise<EmbeddingResponse> => {
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";
  const endpoint = `publishers/google/models/${options.modelId}:predict`;
  const url = buildLlmApiUrl(profile.baseUrl, "vertexai", endpoint);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  const taskType = options.taskType || 'RETRIEVAL_QUERY';
  const inputs = Array.isArray(options.input) ? options.input : [options.input];

  const body = {
    instances: inputs.map(text => ({
      content: text,
      task_type: taskType,
      ...(options.title && taskType === 'RETRIEVAL_DOCUMENT' ? { title: options.title } : {})
    }))
  };

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    options.timeout,
    options.signal
  );

  await ensureResponseOk(response);

  const data = await response.json();

  return {
    object: "list",
    data: data.predictions.map((pred: any, index: number) => ({
      object: "embedding",
      index,
      embedding: pred.embeddings.values,
    })),
    model: options.modelId,
    usage: {
      promptTokens: 0,
      totalTokens: 0,
    },
  };
};
