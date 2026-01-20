import { 
  parseMessageContents, 
  inferImageMimeType, 
  extractToolDefinitions, 
  parseToolChoice 
} from "../../request-builder";
import type { LlmRequestOptions, LlmMessageContent, LlmMessage } from "../../common";
import type { LlmModelInfo } from "../../../types/llm-profiles";
import { DEFAULT_METADATA_RULES, testRuleMatch } from "../../../config/model-metadata";

/**
 * Vertex AI 适配器的 URL 处理逻辑
 */
export const vertexAiUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const versionedHost = host.includes('/v1') ? host : `${host}v1/`;
    return endpoint ? `${versionedHost}${endpoint}` : `${versionedHost}projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent`;
  },
  getHint: (): string => {
    return '将自动添加 /v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent';
  }
};

/**
 * 检测模型发布者类型
 */
export function detectPublisher(modelId: string): "google" | "anthropic" {
  // Claude 模型特征：包含 claude 关键词
  if (modelId.toLowerCase().includes("claude")) {
    return "anthropic";
  }
  // 默认为 Google (Gemini)
  return "google";
}

// --- 类型定义 ---

export interface VertexAiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string | ArrayBuffer | Uint8Array;
  };
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, any>;
  };
  thought?: boolean; // 支持思考摘要
}

export interface VertexAiContent {
  role?: "user" | "model";
  parts: VertexAiPart[];
}

export interface VertexAiTool {
  functionDeclarations?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  }>;
}

export interface VertexAiToolConfig {
  functionCallingConfig?: {
    mode?: "AUTO" | "ANY" | "NONE";
    allowedFunctionNames?: string[];
  };
}

export interface VertexAiGenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinkingConfig?: {
    includeThoughts?: boolean;
    thinkingBudget?: number;
    thinkingLevel?: string;
  };
}

export interface VertexAiGeminiRequest {
  contents: VertexAiContent[];
  generationConfig?: VertexAiGenerationConfig;
  systemInstruction?: VertexAiContent;
  tools?: VertexAiTool[];
  toolConfig?: VertexAiToolConfig;
}

export interface VertexAiClaudeRequest {
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

// --- 辅助函数 ---

/**
 * 构建 Vertex AI Parts（Gemini 格式）
 */
export function buildVertexAiParts(messages: LlmMessageContent[]): VertexAiPart[] {
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
 */
export function buildVertexAiContents(messages: LlmMessage[]): VertexAiContent[] {
  const contents: VertexAiContent[] = [];

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
export function buildVertexAiTools(options: LlmRequestOptions): VertexAiTool[] | undefined {
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
export function buildVertexAiToolConfig(options: LlmRequestOptions): VertexAiToolConfig | undefined {
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
 */
export function buildClaudeMessages(messages: LlmMessage[]): VertexAiClaudeRequest["messages"] {
  const claudeMessages: VertexAiClaudeRequest["messages"] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

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
 * 解析 Vertex AI 模型列表响应
 */
export function parseVertexAiModelsResponse(data: any): LlmModelInfo[] {
  const models: LlmModelInfo[] = [];

  if (data.models && Array.isArray(data.models)) {
    for (const model of data.models) {
      const modelId = model.name.split("/").pop() || model.name;
      const presetCapabilities = extractModelCapabilities(modelId, "google");

      models.push({
        id: modelId,
        name: model.displayName || modelId,
        group: extractModelGroup(modelId, "google"),
        provider: "google",
        capabilities: {
          ...presetCapabilities,
          vision: true,
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
  if (id.includes("gemini")) return "Gemini";
  return "Models";
}