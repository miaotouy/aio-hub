import type { JsonValue } from "./json";

export type LlmMessageRole =
  "system" | "developer" | "user" | "assistant" | "tool";

export interface LlmTextContent {
  type: "text";
  text: string;
}

export interface LlmImageContent {
  type: "image";
  source: JsonValue;
}

export interface LlmAudioContent {
  type: "audio";
  source: JsonValue;
}

export interface LlmVideoContent {
  type: "video";
  source: JsonValue;
  metadata?: JsonValue;
}

export interface LlmDocumentContent {
  type: "document";
  source: JsonValue;
}

export interface LlmToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: JsonValue;
}

export interface LlmToolResultContent {
  type: "tool_result";
  toolUseId: string;
  content: string | JsonValue;
  isError?: boolean;
}

export type LlmMessageContent =
  | LlmTextContent
  | LlmImageContent
  | LlmAudioContent
  | LlmVideoContent
  | LlmDocumentContent
  | LlmToolUseContent
  | LlmToolResultContent;

export interface LlmMessage {
  role: LlmMessageRole;
  content: string | LlmMessageContent[];
  name?: string;
  toolCallId?: string;
  prefix?: boolean;
  reasoningContent?: string;
  metadata?: Record<string, JsonValue>;
}

export interface LlmToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: JsonValue;
    strict?: boolean;
  };
}

export type LlmToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

export interface LlmRequest {
  model: string;
  messages: LlmMessage[];
  stream?: boolean;
  maxTokens?: number;
  maxCompletionTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
  stop?: string | string[];
  seed?: number;
  n?: number;
  logprobs?: boolean;
  topLogprobs?: number;
  reasoningEffort?: string;
  tools?: LlmToolDefinition[];
  toolChoice?: LlmToolChoice;
  parallelToolCalls?: boolean;
  responseFormat?: JsonValue;
  user?: string;
  logitBias?: Record<string, number>;
  store?: boolean;
  metadata?: Record<string, JsonValue>;
  modalities?: string[];
  prediction?: JsonValue;
  audio?: JsonValue;
  serviceTier?: string;
  webSearchOptions?: JsonValue;
  streamOptions?: JsonValue;
  thinkingEnabled?: boolean;
  thinkingBudget?: number;
  extraBody?: Record<string, JsonValue>;
  extensions?: Record<string, JsonValue>;
}
