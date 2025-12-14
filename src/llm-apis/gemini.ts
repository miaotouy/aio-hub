import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse, LlmMessageContent } from "./common";
import { fetchWithTimeout, ensureResponseOk } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { parseSSEStream, extractTextFromSSE } from "@utils/sse-parser";
import {
  parseMessageContents,
  extractToolDefinitions,
  parseToolChoice,
  extractCommonParameters,
  inferMediaMimeType,
  applyCustomParameters,
} from "./request-builder";

/**
 * Gemini API 类型定义
 * 基于 Google Gemini Generate Content API 规范
 */

// Part 类型 - 支持多种内容类型
interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64 编码
  };
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, any>;
  };
  executableCode?: {
    language: "PYTHON" | "LANGUAGE_UNSPECIFIED";
    code: string;
  };
  codeExecutionResult?: {
    outcome: "OUTCOME_OK" | "OUTCOME_FAILED" | "OUTCOME_DEADLINE_EXCEEDED" | "OUTCOME_UNSPECIFIED";
    output: string;
  };
  // Gemini 视频/音频元数据
  videoMetadata?: {
    startOffset?: string; // e.g. "10s"
    endOffset?: string;
    fps?: number;
  };
}

// Content 类型
interface GeminiContent {
  parts: GeminiPart[];
  role?: "user" | "model" | "function" | "tool";
}

// Tool 配置
interface GeminiTool {
  functionDeclarations?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  }>;
  codeExecution?: Record<string, never>; // 空对象，启用代码执行
}

// Tool 配置
interface GeminiToolConfig {
  functionCallingConfig?: {
    mode?: "AUTO" | "ANY" | "NONE" | "MODE_UNSPECIFIED";
    allowedFunctionNames?: string[];
  };
}

// 安全设置
interface GeminiSafetySetting {
  category:
  | "HARM_CATEGORY_HARASSMENT"
  | "HARM_CATEGORY_HATE_SPEECH"
  | "HARM_CATEGORY_SEXUALLY_EXPLICIT"
  | "HARM_CATEGORY_DANGEROUS_CONTENT"
  | "HARM_CATEGORY_CIVIC_INTEGRITY";
  threshold:
  | "BLOCK_NONE"
  | "BLOCK_ONLY_HIGH"
  | "BLOCK_MEDIUM_AND_ABOVE"
  | "BLOCK_LOW_AND_ABOVE"
  | "HARM_BLOCK_THRESHOLD_UNSPECIFIED"
  | "OFF";
}

// 响应 Schema - 支持完整的 JSON Schema
interface GeminiSchema {
  type: "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN" | "ARRAY" | "OBJECT" | "TYPE_UNSPECIFIED";
  description?: string;
  enum?: string[];
  example?: any;
  nullable?: boolean;
  format?: string; // 如 "date", "date-time" 等
  items?: GeminiSchema; // 用于 ARRAY 类型
  properties?: Record<string, GeminiSchema>; // 用于 OBJECT 类型
  required?: string[]; // 必需属性列表
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
}

// 语音配置
interface GeminiSpeechConfig {
  voiceConfig?: {
    prebuiltVoiceConfig?: {
      voiceName?: string;
    };
  };
  multiSpeakerVoiceConfig?: {
    speakerVoiceConfigs?: Array<{
      speaker?: string;
      voiceConfig?: {
        prebuiltVoiceConfig?: {
          voiceName?: string;
        };
      };
    }>;
  };
  languageCode?: string; // 如 "zh-CN", "en-US"
}

// 思考配置
interface GeminiThinkingConfig {
  includeThoughts?: boolean;
  thinkingBudget?: number; // 模型应生成的想法 token 数量
}

// 生成配置
interface GeminiGenerationConfig {
  stopSequences?: string[];
  responseMimeType?: string; // "text/plain", "application/json", "text/x.enum"
  responseSchema?: GeminiSchema;
  responseModalities?: Array<"TEXT" | "IMAGE" | "AUDIO">; // 请求的响应模式
  candidateCount?: number;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  seed?: number; // 用于确定性采样
  presencePenalty?: number;
  frequencyPenalty?: number;
  responseLogprobs?: boolean;
  logprobs?: number; // 返回的顶部 logprob 数量
  enableEnhancedCivicAnswers?: boolean; // 启用增强型城市服务回答
  speechConfig?: GeminiSpeechConfig; // 语音生成配置
  thinkingConfig?: GeminiThinkingConfig; // 思考功能配置
  mediaResolution?:
  | "MEDIA_RESOLUTION_LOW"
  | "MEDIA_RESOLUTION_MEDIUM"
  | "MEDIA_RESOLUTION_HIGH"
  | "MEDIA_RESOLUTION_UNSPECIFIED";
}

// 请求体
interface GeminiRequest {
  contents: GeminiContent[];
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  safetySettings?: GeminiSafetySetting[];
  systemInstruction?: GeminiContent;
  generationConfig?: GeminiGenerationConfig;
  cachedContent?: string; // 缓存内容的名称
}

/**
 * 构建 Gemini Parts
 * 使用共享的 parseMessageContents，然后转换为 Gemini 特定格式
 * 支持文本、图片、音频、视频、PDF、工具调用等
 */
function buildGeminiParts(messages: LlmMessageContent[]): GeminiPart[] {
  const parsed = parseMessageContents(messages);
  const parts: GeminiPart[] = [];

  // 转换文本部分
  for (const textPart of parsed.textParts) {
    parts.push({ text: textPart.text });
  }

  // 转换图片部分
  for (const imagePart of parsed.imageParts) {
    parts.push({
      inlineData: {
        mimeType: imagePart.mimeType || inferMediaMimeType(imagePart.base64),
        data: imagePart.base64,
      },
    });
  }

  // 转换文档部分
  // 转换音频部分
  for (const audio of parsed.audioParts) {
    if (audio.source.type === "base64") {
      parts.push({
        inlineData: {
          mimeType: audio.source.media_type,
          data: audio.source.data,
        },
      });
    } else if (audio.source.type === "uri") {
      parts.push({
        fileData: {
          mimeType: audio.source.media_type,
          fileUri: audio.source.uri,
        },
      });
    }
  }

  // 转换视频部分
  for (const video of parsed.videoParts) {
    let part: GeminiPart = {};
    if (video.source.type === "base64") {
      part = {
        inlineData: {
          mimeType: video.source.media_type,
          data: video.source.data,
        },
      };
    } else if (video.source.type === "uri") {
      part = {
        fileData: {
          mimeType: video.source.media_type,
          fileUri: video.source.uri,
        },
      };
    }

    // 附加视频元数据
    if (video.videoMetadata) {
      part.videoMetadata = video.videoMetadata;
    }
    parts.push(part);
  }

  // 转换文档部分（现在只处理纯文档）
  for (const doc of parsed.documentParts) {
    if (doc.source.type === "base64") {
      parts.push({
        inlineData: {
          mimeType: doc.source.media_type,
          data: doc.source.data,
        },
      });
    } else if (doc.source.type === "uri") {
      parts.push({
        fileData: {
          mimeType: doc.source.media_type,
          fileUri: doc.source.uri,
        },
      });
    }
  }
  // 转换工具使用部分
  for (const toolUse of parsed.toolUseParts) {
    parts.push({
      functionCall: {
        name: toolUse.name,
        args: toolUse.input,
      },
    });
  }

  // 转换工具结果部分
  for (const toolResult of parsed.toolResultParts) {
    const response =
      typeof toolResult.content === "string"
        ? { result: toolResult.content }
        : { result: JSON.stringify(toolResult.content) };

    parts.push({
      functionResponse: {
        name: toolResult.id, // Gemini 使用工具名称而不是 ID
        response,
      },
    });
  }

  return parts;
}

/**
 * 构建多轮对话的 contents
 * 注意：system 消息会被单独提取到 systemInstruction，不包含在 contents 中
 */
function buildGeminiContents(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | LlmMessageContent[] }>
): GeminiContent[] {
  const contents: GeminiContent[] = [];

  // 过滤掉 system 消息，只处理 user 和 assistant
  for (const msg of messages) {
    if (msg.role === 'system') continue;

    const parts =
      typeof msg.content === "string" ? [{ text: msg.content }] : buildGeminiParts(msg.content);

    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts,
    });
  }

  return contents;
}

/**
 * 构建工具配置
 * 使用共享的 extractToolDefinitions 辅助函数
 */
function buildGeminiTools(options: LlmRequestOptions): GeminiTool[] | undefined {
  const tools: GeminiTool[] = [];

  // 函数声明
  const commonTools = extractToolDefinitions(options.tools);
  if (commonTools) {
    const functionDeclarations = commonTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));

    tools.push({ functionDeclarations });
  }

  // 代码执行（Gemini 特有功能）
  // 检查是否需要启用代码执行（通过特殊标记或配置）
  if ((options as ExtendedLlmRequestOptions).enableCodeExecution) {
    tools.push({ codeExecution: {} });
  }

  return tools.length > 0 ? tools : undefined;
}

/**
 * 构建工具调用配置
 * 使用共享的 parseToolChoice 辅助函数
 */
function buildGeminiToolConfig(options: LlmRequestOptions): GeminiToolConfig | undefined {
  const parsed = parseToolChoice(options.toolChoice);
  if (!parsed) return undefined;

  const config: GeminiToolConfig = {
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
 * 构建安全设置
 */
function buildGeminiSafetySettings(options: LlmRequestOptions): GeminiSafetySetting[] | undefined {
  const defaultSettings: GeminiSafetySetting[] = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
    { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
  ];

  // 可以通过 options 传入自定义安全设置
  const customSettings = (options as ExtendedLlmRequestOptions).safetySettings;

  if (!customSettings || customSettings.length === 0) {
    return defaultSettings;
  }

  // 合并逻辑：默认设置 + 自定义设置（覆盖同名 category）
  // 使用 Map 来去重，以 category 为 key
  const settingsMap = new Map<string, GeminiSafetySetting>();

  // 先放入默认设置
  for (const setting of defaultSettings) {
    settingsMap.set(setting.category, setting);
  }

  // 再放入自定义设置（覆盖默认）
  for (const setting of customSettings) {
    settingsMap.set(setting.category, setting);
  }

  return Array.from(settingsMap.values());
}

/**
 * 构建生成配置
 * 使用共享的 extractCommonParameters，支持完整的 Gemini 生成参数
 */
function buildGeminiGenerationConfig(options: LlmRequestOptions): GeminiGenerationConfig {
  // 使用共享函数提取通用参数
  const commonParams = extractCommonParameters(options);

  const config: GeminiGenerationConfig = {
    maxOutputTokens: commonParams.maxTokens || 8192,
    temperature: commonParams.temperature ?? 1.0,
  };

  // 添加通用参数
  if (commonParams.topP !== undefined) config.topP = commonParams.topP;
  if (commonParams.topK !== undefined) config.topK = commonParams.topK;
  if (commonParams.presencePenalty !== undefined)
    config.presencePenalty = commonParams.presencePenalty;
  if (commonParams.frequencyPenalty !== undefined)
    config.frequencyPenalty = commonParams.frequencyPenalty;
  if (commonParams.seed !== undefined) config.seed = commonParams.seed;

  // 停止序列
  if (commonParams.stop) {
    config.stopSequences = Array.isArray(commonParams.stop)
      ? commonParams.stop
      : [commonParams.stop];
  }

  // 响应格式
  if (options.responseFormat) {
    if (options.responseFormat.type === "json_object") {
      config.responseMimeType = "application/json";
    } else if (
      options.responseFormat.type === "json_schema" &&
      options.responseFormat.json_schema
    ) {
      config.responseMimeType = "application/json";
      // 将 JSON Schema 转换为 Gemini Schema
      config.responseSchema = convertToGeminiSchema(options.responseFormat.json_schema.schema);
    }
  }

  // 对数概率
  if (options.logprobs) {
    config.responseLogprobs = true;
    if (options.topLogprobs !== undefined) {
      config.logprobs = options.topLogprobs;
    }
  }

  // 扩展参数支持
  const extendedOptions = options as ExtendedLlmRequestOptions;

  // 思考配置
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

    // Gemini 2.5+ Budget 模式
    // 注意：thinkingBudget 可以是 0（禁用思考）或 -1（动态思考）
    if (extendedOptions.thinkingBudget !== undefined) {
      thinkingConfig.thinkingBudget = extendedOptions.thinkingBudget;
    }

    // Gemini 3.0 Level 模式 (low/high)
    // 注意：API 文档显示 thinkingLevel 应该使用小写值
    if (extendedOptions.reasoningEffort) {
      // @ts-ignore
      thinkingConfig.thinkingLevel = extendedOptions.reasoningEffort.toLowerCase();
    }

    config.thinkingConfig = thinkingConfig;
  }

  // 语音配置
  if (extendedOptions.speechConfig) {
    config.speechConfig = extendedOptions.speechConfig;
  }

  // 响应模式
  if (extendedOptions.responseModalities) {
    config.responseModalities = extendedOptions.responseModalities;
  }

  // 媒体分辨率
  if (extendedOptions.mediaResolution) {
    config.mediaResolution = extendedOptions.mediaResolution;
  }

  // 增强型城市服务回答
  if (extendedOptions.enableEnhancedCivicAnswers !== undefined) {
    config.enableEnhancedCivicAnswers = extendedOptions.enableEnhancedCivicAnswers;
  }

  return config;
}

/**
 * 转换 JSON Schema 到 Gemini Schema
 */
function convertToGeminiSchema(schema: Record<string, any>): GeminiSchema {
  const geminiSchema: GeminiSchema = {
    type: convertSchemaType(schema.type),
  };

  if (schema.description) geminiSchema.description = schema.description;
  if (schema.enum) geminiSchema.enum = schema.enum;
  if (schema.nullable) geminiSchema.nullable = schema.nullable;

  if (schema.type === "array" && schema.items) {
    geminiSchema.items = convertToGeminiSchema(schema.items);
  }

  if (schema.type === "object") {
    if (schema.properties) {
      geminiSchema.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        geminiSchema.properties[key] = convertToGeminiSchema(value as Record<string, any>);
      }
    }
    if (schema.required) {
      geminiSchema.required = schema.required;
    }
  }

  return geminiSchema;
}

/**
 * 转换 Schema 类型
 */
function convertSchemaType(type: string): GeminiSchema["type"] {
  const typeMap: Record<string, GeminiSchema["type"]> = {
    string: "STRING",
    number: "NUMBER",
    integer: "INTEGER",
    boolean: "BOOLEAN",
    array: "ARRAY",
    object: "OBJECT",
  };
  return typeMap[type] || "STRING";
}

/**
 * 调用 Google Gemini API
 */
export const callGeminiApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  // 获取第一个可用的 API Key
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

  // 流式响应使用不同的端点
  const endpoint =
    options.stream && options.onStream
      ? `models/${options.modelId}:streamGenerateContent`
      : `models/${options.modelId}:generateContent`;

  const baseUrl = buildLlmApiUrl(profile.baseUrl, "gemini", endpoint);
  const url = `${baseUrl}?key=${apiKey}${options.stream ? "&alt=sse" : ""}`;

  // 从 messages 中提取 system 消息
  const systemMessages = options.messages.filter(m => m.role === 'system');

  // 构建请求体
  const body: GeminiRequest = {
    contents: buildGeminiContents(options.messages),
    generationConfig: buildGeminiGenerationConfig(options),
  };

  // 添加系统指令 - 从 messages 中提取的 system 消息
  if (systemMessages.length > 0) {
    // 合并所有 system 消息的内容
    const systemContent = systemMessages
      .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      .join('\n\n');
    body.systemInstruction = {
      parts: [{ text: systemContent }],
    };
  }

  // 添加工具
  const tools = buildGeminiTools(options);
  if (tools) {
    body.tools = tools;
  }

  // 添加工具配置
  const toolConfig = buildGeminiToolConfig(options);
  if (toolConfig) {
    body.toolConfig = toolConfig;
  }

  // 添加安全设置
  const safetySettings = buildGeminiSafetySettings(options);
  if (safetySettings) {
    body.safetySettings = safetySettings;
  }

  // 应用自定义参数
  applyCustomParameters(body, options);

  // 构建请求头
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 应用自定义请求头
  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  // 如果启用流式响应
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
      // 尝试从流数据中提取详细信息
      try {
        const json = JSON.parse(data);

        // 提取 usage 信息
        if (json.usageMetadata) {
          usage = {
            promptTokens: json.usageMetadata.promptTokenCount || 0,
            completionTokens: json.usageMetadata.candidatesTokenCount || 0,
            totalTokens: json.usageMetadata.totalTokenCount || 0,
          };
        }

        // 提取 finishReason
        if (json.candidates?.[0]?.finishReason) {
          finishReason = mapGeminiFinishReason(json.candidates[0].finishReason);
        }

        // 遍历 parts 处理文本和思考摘要
        const parts = json.candidates?.[0]?.content?.parts;
        if (parts && Array.isArray(parts)) {
          for (const part of parts) {
            if (part.text) {
              // 检查是否为思考摘要
              if (part.thought) {
                reasoningContent += part.text;
                // 如果有思考流回调，调用它
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
                  id: `call_${Date.now()}`, // Gemini 不提供 ID，生成一个
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
    options.signal // 补上 signal
  );

  await ensureResponseOk(response);

  const data = await response.json();

  // 处理响应
  return parseGeminiResponse(data);
};

/**
 * 解析 Gemini API 响应
 * 支持文本、工具调用、代码执行、思考内容、logprobs 等
 */
function parseGeminiResponse(data: any): LlmResponse {
  const candidate = data.candidates?.[0];

  if (!candidate) {
    throw new Error(`Gemini API 响应格式异常: 没有候选回答`);
  }

  // 提取文本内容
  let content = "";
  let toolCalls: LlmResponse["toolCalls"] = undefined;
  let thoughtsContent = ""; // 思考摘要内容

  if (candidate.content?.parts) {
    for (const part of candidate.content.parts) {
      // 跳过没有文本的 part
      if (!part.text && !part.functionCall && !part.executableCode && !part.codeExecutionResult) {
        continue;
      }

      // 检查是否为思考摘要（Gemini 通过 part.thought 属性标识）
      if (part.thought && part.text) {
        thoughtsContent += part.text;
        continue; // 思考内容不加入主内容
      }

      if (part.text) {
        content += part.text;
      } else if (part.functionCall) {
        // 函数调用
        if (!toolCalls) toolCalls = [];
        toolCalls.push({
          id: `call_${Date.now()}_${toolCalls.length}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        });
      } else if (part.executableCode) {
        // 可执行代码
        content += `\n\`\`\`${part.executableCode.language.toLowerCase()}\n${part.executableCode.code}\n\`\`\`\n`;
      } else if (part.codeExecutionResult) {
        // 代码执行结果
        const outcomeText = part.codeExecutionResult.outcome === "OUTCOME_OK" ? "成功" : "失败";
        content += `\n**代码执行结果 (${outcomeText}):**\n\`\`\`\n${part.codeExecutionResult.output}\n\`\`\`\n`;
      }
    }
  }

  // 如果没有内容且没有函数调用，检查是否有错误或安全过滤
  if (!content && !toolCalls) {
    // 检查是否因安全设置被屏蔽
    if (data.promptFeedback?.blockReason) {
      throw new Error(`请求被屏蔽: ${data.promptFeedback.blockReason}`);
    }

    throw new Error(`Gemini API 响应格式异常: ${JSON.stringify(data)}`);
  }

  const result: LlmResponse = {
    content,
    finishReason: mapGeminiFinishReason(candidate.finishReason),
  };

  // 添加 usage 信息
  if (data.usageMetadata) {
    result.usage = {
      promptTokens: data.usageMetadata.promptTokenCount || 0,
      completionTokens: data.usageMetadata.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata.totalTokenCount || 0,
    };
  }

  // 添加工具调用
  if (toolCalls) {
    result.toolCalls = toolCalls;
  }

  // 添加思考内容（使用 reasoningContent 字段）
  if (thoughtsContent) {
    result.reasoningContent = thoughtsContent;
  }

  // 添加 logprobs 信息
  if (candidate.logprobsResult) {
    result.logprobs = parseGeminiLogprobs(candidate.logprobsResult);
  }

  return result;
}

/**
 * 解析 Gemini Logprobs 结果
 */
function parseGeminiLogprobs(logprobsResult: any): LlmResponse["logprobs"] {
  if (!logprobsResult?.topCandidates) return undefined;

  const content = logprobsResult.topCandidates
    .map((topCandidate: any) => {
      if (!topCandidate.candidates?.[0]) return null;

      const candidate = topCandidate.candidates[0];
      return {
        token: candidate.token || "",
        logprob: candidate.logProbability || 0,
        bytes: null, // Gemini 不提供 bytes
        topLogprobs: topCandidate.candidates.slice(0, 5).map((c: any) => ({
          token: c.token || "",
          logprob: c.logProbability || 0,
          bytes: null,
        })),
      };
    })
    .filter(Boolean);

  return content.length > 0 ? { content } : undefined;
}

/**
 * 扩展的请求选项接口
 */
interface ExtendedLlmRequestOptions extends LlmRequestOptions {
  enableCodeExecution?: boolean;
  safetySettings?: GeminiSafetySetting[];
  thinkingConfig?: GeminiThinkingConfig;
  speechConfig?: GeminiSpeechConfig;
  responseModalities?: Array<"TEXT" | "IMAGE" | "AUDIO">;
  mediaResolution?: GeminiGenerationConfig["mediaResolution"];
  enableEnhancedCivicAnswers?: boolean;
}

/**
 * 映射 Gemini finishReason 到通用格式
 */
function mapGeminiFinishReason(reason: string | undefined): LlmResponse["finishReason"] {
  if (!reason) return null;

  const reasonMap: Record<string, LlmResponse["finishReason"]> = {
    STOP: "stop",
    MAX_TOKENS: "max_tokens",
    SAFETY: "content_filter",
    RECITATION: "content_filter",
    LANGUAGE: "content_filter",
    OTHER: "stop",
    BLOCKLIST: "content_filter",
    PROHIBITED_CONTENT: "content_filter",
    SPII: "content_filter",
    MALFORMED_FUNCTION_CALL: "stop",
    IMAGE_SAFETY: "content_filter",
  };

  return reasonMap[reason] || "stop";
}
