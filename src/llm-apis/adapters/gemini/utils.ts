import type { LlmRequestOptions, LlmMessageContent, LlmMessage } from "../../common";
import type { LlmModelInfo } from "../../../types/llm-profiles";
import { DEFAULT_METADATA_RULES, testRuleMatch } from "../../../config/model-metadata";
import {
  parseMessageContents,
  extractToolDefinitions,
  parseToolChoice,
  extractCommonParameters,
  inferMediaMimeType,
  buildBase64DataUrl,
} from "../../request-builder";

/**
 * Gemini API 类型定义
 */
export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string | ArrayBuffer | Uint8Array;
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
  videoMetadata?: {
    startOffset?: string;
    endOffset?: string;
    fps?: number;
  };
}

export interface GeminiContent {
  parts: GeminiPart[];
  role?: "user" | "model" | "function" | "tool";
}

export interface GeminiTool {
  functionDeclarations?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  }>;
  codeExecution?: Record<string, never>;
}

export interface GeminiToolConfig {
  functionCallingConfig?: {
    mode?: "AUTO" | "ANY" | "NONE" | "MODE_UNSPECIFIED";
    allowedFunctionNames?: string[];
  };
}

export interface GeminiSafetySetting {
  category: string;
  threshold: string;
}

export interface GeminiSchema {
  type: "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN" | "ARRAY" | "OBJECT" | "TYPE_UNSPECIFIED";
  description?: string;
  enum?: string[];
  example?: any;
  nullable?: boolean;
  format?: string;
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
}

export interface GeminiGenerationConfig {
  stopSequences?: string[];
  responseMimeType?: string;
  responseSchema?: GeminiSchema;
  responseModalities?: Array<"TEXT" | "IMAGE" | "AUDIO">;
  candidateCount?: number;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  responseLogprobs?: boolean;
  logprobs?: number;
  thinkingConfig?: {
    includeThoughts?: boolean;
    thinkingBudget?: number;
    thinkingLevel?: "minimal" | "low" | "medium" | "high";
  };
  speechConfig?: any;
  mediaResolution?: string;
  enableEnhancedCivicAnswers?: boolean;
}

export interface GeminiRequest {
  contents: GeminiContent[];
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  safetySettings?: GeminiSafetySetting[];
  systemInstruction?: GeminiContent;
  generationConfig?: GeminiGenerationConfig;
}

/**
 * Gemini 适配器的 URL 处理逻辑
 */
export const geminiUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const versionedHost = host.includes('/v1') ? host : `${host}v1beta/`;
    return endpoint ? `${versionedHost}${endpoint}` : `${versionedHost}models/{model}:generateContent`;
  },
  getHint: (): string => {
    return '将自动添加 /v1beta/models/{model}:generateContent';
  }
};

/**
 * 构建 Gemini Parts
 */
export function buildGeminiParts(messages: LlmMessageContent[]): GeminiPart[] {
  const parsed = parseMessageContents(messages);
  const parts: GeminiPart[] = [];

  for (const textPart of parsed.textParts) {
    parts.push({ text: textPart.text });
  }

  for (const imagePart of parsed.imageParts) {
    const data = buildBase64DataUrl(imagePart.base64, imagePart.mimeType, { rawBase64: true });
    parts.push({
      inlineData: {
        mimeType: imagePart.mimeType || inferMediaMimeType(imagePart.base64),
        data: data as any,
      },
    });
  }

  for (const audio of parsed.audioParts) {
    if (audio.source.type === "base64") {
      const data = buildBase64DataUrl(audio.source.data, audio.source.media_type, { rawBase64: true });
      parts.push({
        inlineData: {
          mimeType: audio.source.media_type,
          data: data as any,
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

  for (const video of parsed.videoParts) {
    let part: GeminiPart = {};
    if (video.source.type === "base64") {
      const data = buildBase64DataUrl(video.source.data, video.source.media_type, { rawBase64: true });
      part = {
        inlineData: {
          mimeType: video.source.media_type,
          data: data as any,
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
    if (video.videoMetadata) part.videoMetadata = video.videoMetadata;
    parts.push(part);
  }

  for (const doc of parsed.documentParts) {
    if (doc.source.type === "base64") {
      const data = buildBase64DataUrl(doc.source.data, doc.source.media_type, { rawBase64: true });
      parts.push({
        inlineData: {
          mimeType: doc.source.media_type,
          data: data as any,
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

  for (const toolUse of parsed.toolUseParts) {
    parts.push({
      functionCall: {
        name: toolUse.name,
        args: toolUse.input,
      },
    });
  }

  for (const toolResult of parsed.toolResultParts) {
    const response = typeof toolResult.content === "string" ? { result: toolResult.content } : { result: JSON.stringify(toolResult.content) };
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
 * 构建多轮对话的 contents
 */
export function buildGeminiContents(messages: LlmMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const parts = typeof msg.content === "string" ? [{ text: msg.content }] : buildGeminiParts(msg.content);
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts,
    });
  }
  return contents;
}

/**
 * 构建工具配置
 */
export function buildGeminiTools(options: LlmRequestOptions): GeminiTool[] | undefined {
  const tools: GeminiTool[] = [];
  const commonTools = extractToolDefinitions(options.tools);
  if (commonTools) {
    tools.push({
      functionDeclarations: commonTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }))
    });
  }
  if ((options as any).enableCodeExecution) tools.push({ codeExecution: {} });
  return tools.length > 0 ? tools : undefined;
}

/**
 * 构建工具调用配置
 */
export function buildGeminiToolConfig(options: LlmRequestOptions): GeminiToolConfig | undefined {
  const parsed = parseToolChoice(options.toolChoice);
  if (!parsed) return undefined;
  const config: GeminiToolConfig = { functionCallingConfig: {} };
  if (parsed === "auto") config.functionCallingConfig!.mode = "AUTO";
  else if (parsed === "none") config.functionCallingConfig!.mode = "NONE";
  else if (parsed === "required") config.functionCallingConfig!.mode = "ANY";
  else if (typeof parsed === "object" && "functionName" in parsed) {
    config.functionCallingConfig!.mode = "ANY";
    config.functionCallingConfig!.allowedFunctionNames = [parsed.functionName];
  }
  return config;
}

/**
 * 构建安全设置
 */
export function buildGeminiSafetySettings(options: LlmRequestOptions): GeminiSafetySetting[] | undefined {
  const defaultSettings: GeminiSafetySetting[] = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
    { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
  ];
  const customSettings = (options as any).safetySettings;
  if (!customSettings || customSettings.length === 0) return defaultSettings;
  const settingsMap = new Map<string, GeminiSafetySetting>();
  for (const setting of defaultSettings) settingsMap.set(setting.category, setting);
  for (const setting of customSettings) settingsMap.set(setting.category, setting);
  return Array.from(settingsMap.values());
}

/**
 * 构建生成配置
 */
export function buildGeminiGenerationConfig(options: LlmRequestOptions): GeminiGenerationConfig {
  const commonParams = extractCommonParameters(options);
  const config: GeminiGenerationConfig = {
    maxOutputTokens: commonParams.maxTokens || 8192,
    temperature: commonParams.temperature ?? 1.0,
  };
  if (commonParams.topP !== undefined) config.topP = commonParams.topP;
  if (commonParams.topK !== undefined) config.topK = commonParams.topK;
  if (commonParams.presencePenalty !== undefined) config.presencePenalty = commonParams.presencePenalty;
  if (commonParams.frequencyPenalty !== undefined) config.frequencyPenalty = commonParams.frequencyPenalty;
  if (commonParams.seed !== undefined) config.seed = commonParams.seed;
  if (commonParams.stop) config.stopSequences = Array.isArray(commonParams.stop) ? commonParams.stop : [commonParams.stop];

  if (options.responseFormat) {
    if (options.responseFormat.type === "json_object") config.responseMimeType = "application/json";
    else if (options.responseFormat.type === "json_schema" && options.responseFormat.json_schema) {
      config.responseMimeType = "application/json";
      config.responseSchema = convertToGeminiSchema(options.responseFormat.json_schema.schema);
    }
  }

  if (options.logprobs) {
    config.responseLogprobs = true;
    if (options.topLogprobs !== undefined) config.logprobs = options.topLogprobs;
  }

  // 思考配置
  const ext = options as any;
  const isGemini3 = options.modelId.includes("gemini-3");
  const shouldIncludeThoughts = ext.includeThoughts === true || ext.thinkingEnabled === true;
  if (ext.thinkingLevel !== undefined || ext.reasoningEffort !== undefined || ext.thinkingBudget !== undefined || shouldIncludeThoughts) {
    const thinkingConfig: any = {};
    if (shouldIncludeThoughts) thinkingConfig.includeThoughts = true;
    if (isGemini3) {
      const level = (ext.thinkingLevel || ext.reasoningEffort)?.toLowerCase();
      if (level && ["minimal", "low", "medium", "high"].includes(level)) thinkingConfig.thinkingLevel = level;
      else if (level) thinkingConfig.thinkingLevel = level === "max" ? "high" : "low";
      if (!thinkingConfig.thinkingLevel && ext.thinkingBudget !== undefined) thinkingConfig.thinkingBudget = ext.thinkingBudget;
    } else if (ext.thinkingBudget !== undefined) {
      thinkingConfig.thinkingBudget = ext.thinkingBudget;
    }
    config.thinkingConfig = thinkingConfig;
  }

  if (ext.speechConfig) config.speechConfig = ext.speechConfig;
  if (ext.responseModalities) config.responseModalities = ext.responseModalities;
  if (ext.mediaResolution) config.mediaResolution = ext.mediaResolution;
  if (ext.enableEnhancedCivicAnswers !== undefined) config.enableEnhancedCivicAnswers = ext.enableEnhancedCivicAnswers;

  return config;
}

function convertToGeminiSchema(schema: Record<string, any>): GeminiSchema {
  const geminiSchema: GeminiSchema = { type: convertSchemaType(schema.type) };
  if (schema.description) geminiSchema.description = schema.description;
  if (schema.enum) geminiSchema.enum = schema.enum;
  if (schema.nullable) geminiSchema.nullable = schema.nullable;
  if (schema.type === "array" && schema.items) geminiSchema.items = convertToGeminiSchema(schema.items);
  if (schema.type === "object") {
    if (schema.properties) {
      geminiSchema.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) geminiSchema.properties[key] = convertToGeminiSchema(value as any);
    }
    if (schema.required) geminiSchema.required = schema.required;
  }
  return geminiSchema;
}

function convertSchemaType(type: string): GeminiSchema["type"] {
  const typeMap: Record<string, GeminiSchema["type"]> = { string: "STRING", number: "NUMBER", integer: "INTEGER", boolean: "BOOLEAN", array: "ARRAY", object: "OBJECT" };
  return typeMap[type] || "STRING";
}

/**
 * 解析 Gemini 模型列表响应
 */
export function parseGeminiModelsResponse(data: any): LlmModelInfo[] {
  const models: LlmModelInfo[] = [];

  if (data.models && Array.isArray(data.models)) {
    for (const model of data.models) {
      const modelId = model.name.replace("models/", "");
      const supportsVision =
        model.supportedGenerationMethods?.includes("generateContent") &&
        !modelId.includes("embedding");

      const presetCapabilities = extractModelCapabilities(modelId, "gemini");

      models.push({
        id: modelId,
        name: model.displayName || modelId,
        group: extractModelGroup(modelId, "gemini"),
        provider: "gemini",
        version: model.version,
        description: model.description,
        capabilities: {
          ...presetCapabilities,
          vision: supportsVision,
          thinking: model.thinking === true,
        },
        tokenLimits: {
          contextLength: model.inputTokenLimit,
          output: model.outputTokenLimit,
        },
        supportedFeatures: {
          generationMethods: model.supportedGenerationMethods,
        },
        defaultParameters: {
          temperature: model.temperature,
          topP: model.topP,
          topK: model.topK,
          maxTemperature: model.maxTemperature,
        },
      });
    }
  }

  return models;
}

function extractModelCapabilities(modelId: string, provider?: string) {
  const rules = DEFAULT_METADATA_RULES.filter(
    (r) => r.enabled !== false && r.properties?.capabilities
  ).sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of rules) {
    if (testRuleMatch(rule, modelId, provider) && rule.properties?.capabilities) {
      return rule.properties.capabilities;
    }
  }
  return undefined;
}

function extractModelGroup(modelId: string, provider?: string): string {
  const rules = DEFAULT_METADATA_RULES.filter(
    (r) => r.enabled !== false && r.properties?.group
  ).sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of rules) {
    if (testRuleMatch(rule, modelId, provider) && rule.properties?.group) {
      return rule.properties.group;
    }
  }

  const id = modelId.toLowerCase();
  if (id.includes("2.5")) return "Gemini 2.5";
  if (id.includes("2.0")) return "Gemini 2.0";
  if (id.includes("1.5")) return "Gemini 1.5";
  if (id.includes("1.0")) return "Gemini 1.0";
  return "Gemini";
}
