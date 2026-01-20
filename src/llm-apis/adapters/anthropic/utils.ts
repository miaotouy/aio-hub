import type { LlmRequestOptions, LlmMessageContent, LlmMessage } from "@/llm-apis/common";
import type { LlmModelInfo } from "@/types/llm-profiles";
import { DEFAULT_METADATA_RULES, testRuleMatch } from "@/config/model-metadata";
import {
  parseMessageContents,
  extractToolDefinitions,
  parseToolChoice,
  buildBase64DataUrl,
} from "@/llm-apis/request-builder";

/**
 * Claude API 消息内容块类型
 */
export interface ClaudeContentBlock {
  type: "text" | "image" | "tool_use" | "tool_result" | "document";
  text?: string;
  source?: {
    type: "base64";
    media_type: string;
    data: string | ArrayBuffer | Uint8Array;
  };
  id?: string;
  name?: string;
  input?: Record<string, any>;
  tool_use_id?: string;
  content?: string | ClaudeContentBlock[];
  is_error?: boolean;
  cache_control?: {
    type: "ephemeral";
  };
}

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

export interface ClaudeTool {
  type?: "custom" | "computer_20241022" | "bash_20241022" | "text_editor_20241022";
  name: string;
  description?: string;
  input_schema?: Record<string, any>;
  display_width_px?: number;
  display_height_px?: number;
  display_number?: number;
  cache_control?: {
    type: "ephemeral";
  };
}

export type ClaudeToolChoice =
  | { type: "auto"; disable_parallel_tool_use?: boolean }
  | { type: "any"; disable_parallel_tool_use?: boolean }
  | { type: "tool"; name: string; disable_parallel_tool_use?: boolean };

export interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  max_tokens: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  system?: string;
  stop_sequences?: string[];
  stream?: boolean;
  metadata?: {
    user_id?: string;
  };
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
  tools?: ClaudeTool[];
  tool_choice?: ClaudeToolChoice;
}

/**
 * Claude 适配器的 URL 处理逻辑
 */
export const claudeUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const versionedHost = host.includes('/v1') ? host : `${host}v1/`;
    return endpoint ? `${versionedHost}${endpoint}` : `${versionedHost}messages`;
  },
  getHint: (): string => {
    return '将自动添加 /v1/messages';
  }
};

/**
 * 转换内容块
 */
export const convertContentBlocks = (messages: LlmMessageContent[]): ClaudeContentBlock[] => {
  const parsed = parseMessageContents(messages);
  const blocks: ClaudeContentBlock[] = [];

  for (const textPart of parsed.textParts) {
    blocks.push({ type: "text", text: textPart.text, cache_control: textPart.cacheControl });
  }

  for (const imagePart of parsed.imageParts) {
    const data = buildBase64DataUrl(imagePart.base64, imagePart.mimeType, { rawBase64: true });
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: imagePart.mimeType || "image/png",
        data: data as any,
      },
      cache_control: imagePart.cacheControl,
    });
  }

  for (const toolUse of parsed.toolUseParts) {
    blocks.push({ type: "tool_use", id: toolUse.id, name: toolUse.name, input: toolUse.input });
  }

  for (const toolResult of parsed.toolResultParts) {
    const toolResultBlock: ClaudeContentBlock = {
      type: "tool_result",
      tool_use_id: toolResult.id,
      is_error: toolResult.isError,
    };
    if (typeof toolResult.content === "string") toolResultBlock.content = toolResult.content;
    else if (Array.isArray(toolResult.content)) toolResultBlock.content = convertContentBlocks(toolResult.content);
    blocks.push(toolResultBlock);
  }

  for (const doc of parsed.documentParts) {
    const source = doc.source;
    if (source.type === "base64" || (source as any).data || (source as any).base64) {
      const data = buildBase64DataUrl(
        (source as any).data || (source as any).base64,
        source.media_type || (source as any).mimeType,
        { rawBase64: true }
      );
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: source.media_type || (source as any).mimeType || "application/pdf",
          data: data as any,
        },
      });
    } else if (source.type === "file") {
      blocks.push({ type: "document", source: { type: "file", file_id: (source as any).file_id } as any });
    } else if (source.type === "url") {
      blocks.push({ type: "document", source: { type: "url", url: (source as any).url } as any });
    }
  }

  return blocks;
};

/**
 * 将内部消息格式转换为 Claude API 格式
 */
export const convertToClaudeMessages = (messages: LlmMessage[]): ClaudeMessage[] => {
  return messages.map(msg => ({
    role: msg.role === "assistant" ? "assistant" : "user",
    content: typeof msg.content === "string" ? msg.content : convertContentBlocks(msg.content),
  }));
};

/**
 * 转换工具定义
 */
export const convertTools = (tools?: LlmRequestOptions["tools"]): ClaudeTool[] | undefined => {
  const commonTools = extractToolDefinitions(tools);
  if (!commonTools) return undefined;
  return commonTools.map((tool) => ({
    type: "custom" as const,
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
};

/**
 * 转换工具选择策略
 */
export const convertToolChoice = (
  toolChoice?: LlmRequestOptions["toolChoice"],
  parallelToolCalls?: boolean
): ClaudeToolChoice | undefined => {
  const parsed = parseToolChoice(toolChoice);
  if (!parsed) return undefined;
  const disableParallel = parallelToolCalls === false;
  if (parsed === "auto") return { type: "auto", disable_parallel_tool_use: disableParallel };
  else if (parsed === "required") return { type: "any", disable_parallel_tool_use: disableParallel };
  else if (typeof parsed === "object" && "functionName" in parsed) {
    return { type: "tool", name: parsed.functionName, disable_parallel_tool_use: disableParallel };
  }
  return undefined;
};

/**
 * 解析 Anthropic 模型列表响应
 */
export function parseAnthropicModelsResponse(data: any): LlmModelInfo[] {
  const models: LlmModelInfo[] = [];

  if (data.data && Array.isArray(data.data)) {
    for (const model of data.data) {
      if (model.type === "model") {
        const presetCapabilities = extractModelCapabilities(model.id, "anthropic");

        models.push({
          id: model.id,
          name: model.display_name || model.id,
          group: extractModelGroup(model.id, "anthropic"),
          provider: "anthropic",
          description: model.description,
          capabilities: {
            ...presetCapabilities,
            vision:
              model.id.includes("opus") ||
              model.id.includes("sonnet") ||
              model.id.includes("haiku"),
          },
        });
      }
    }
  }

  return models;
}

function extractModelCapabilities(modelId: string, provider?: string) {
  const rules = DEFAULT_METADATA_RULES.filter(
    (r: any) => r.enabled !== false && r.properties?.capabilities
  ).sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));

  for (const rule of rules) {
    if (testRuleMatch(rule, modelId, provider) && rule.properties?.capabilities) {
      return rule.properties.capabilities;
    }
  }
  return undefined;
}

function extractModelGroup(modelId: string, provider?: string): string {
  const rules = DEFAULT_METADATA_RULES.filter(
    (r: any) => r.enabled !== false && r.properties?.group
  ).sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));

  for (const rule of rules) {
    if (testRuleMatch(rule, modelId, provider) && rule.properties?.group) {
      return rule.properties.group;
    }
  }

  const id = modelId.toLowerCase();
  if (id.includes("opus")) return "Claude Opus";
  if (id.includes("sonnet")) return "Claude Sonnet";
  if (id.includes("haiku")) return "Claude Haiku";
  return "Claude";
}
