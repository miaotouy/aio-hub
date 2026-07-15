import { SseDataLineDecoder } from "../stream-parser/sse";
import type { JsonValue, WireJsonValue } from "../types/json";
import type {
  LlmStreamEvent,
  ProviderAdapter,
  ProviderProfile,
  ProviderStreamDecoder,
} from "../types/provider";
import type {
  LlmMessage,
  LlmMessageContent,
  LlmRequest,
  LlmToolChoice,
} from "../types/request";
import type {
  LlmResponse,
  LlmToolCall,
  TokenUsage,
} from "../types/response";
import type { WireRequest, WireResponse } from "../types/transport";

type JsonObject = Record<string, JsonValue>;
export type AnthropicMessagesBody = Record<string, WireJsonValue>;

const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const FILES_API_BETA = "files-api-2025-04-14";
const THINKING_BETA = "thinking-2025-12-05";

export function buildAnthropicMessagesUrl(profile: ProviderProfile): string {
  const customEndpoint = profile.endpoints?.messages;
  if (customEndpoint?.startsWith("http")) return customEndpoint;

  const host = profile.baseUrl.endsWith("/")
    ? profile.baseUrl
    : `${profile.baseUrl}/`;
  if (customEndpoint) {
    return `${host}${customEndpoint.replace(/^\//, "")}`;
  }
  const versionedHost = host.includes("/v1") ? host : `${host}v1/`;
  return `${versionedHost}messages`;
}

export function buildAnthropicMessagesRequest(
  profile: ProviderProfile,
  request: LlmRequest
): WireRequest {
  const betas = new Set<string>([FILES_API_BETA]);
  if (request.thinkingEnabled) betas.add(THINKING_BETA);
  for (const beta of readStringArray(profile.options?.anthropicBetas)) {
    betas.add(beta);
  }

  return {
    method: "POST",
    url: buildAnthropicMessagesUrl(profile),
    headers: {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { "x-api-key": profile.apiKey } : {}),
      "anthropic-version":
        readString(profile.options?.anthropicVersion) ??
        DEFAULT_ANTHROPIC_VERSION,
      "anthropic-beta": [...betas].join(","),
      ...(request.requestId ? { "X-Request-ID": request.requestId } : {}),
      ...profile.headers,
    },
    body: { kind: "json", value: buildAnthropicMessagesBody(request) },
    streaming: request.stream === true,
  };
}

export function buildAnthropicMessagesBody(
  request: LlmRequest
): AnthropicMessagesBody {
  const system = request.messages
    .filter(
      (message) => message.role === "system" || message.role === "developer"
    )
    .map(messageToSystemText)
    .filter(Boolean)
    .join("\n\n");
  const body: AnthropicMessagesBody = {
    model: request.model,
    messages: request.messages
      .filter(
        (message) =>
          message.role !== "system" && message.role !== "developer"
      )
      .map(buildAnthropicMessage),
    max_tokens: request.maxCompletionTokens ?? request.maxTokens ?? 4096,
  };

  if (system) body.system = system;
  assignDefined(body, "temperature", request.temperature);
  assignDefined(body, "top_k", request.topK);
  assignDefined(body, "top_p", request.topP);
  const stopSequences = toStopSequences(request.stop);
  if (stopSequences?.length) body.stop_sequences = stopSequences;
  if (request.metadata) body.metadata = request.metadata;

  if (request.thinkingEnabled) {
    body.thinking = {
      type: "enabled",
      budget_tokens: request.thinkingBudget ?? 4096,
    };
    delete body.temperature;
  }

  if (request.tools?.length) {
    body.tools = request.tools.map((tool) => ({
      type: "custom",
      name: tool.function.name,
      ...(tool.function.description
        ? { description: tool.function.description }
        : {}),
      input_schema: tool.function.parameters,
    }));
  }
  if (request.webSearchEnabled) {
    const webSearchTool = {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 5,
    };
    body.tools = Array.isArray(body.tools)
      ? [...body.tools, webSearchTool]
      : [webSearchTool];
  }
  const toolChoice = buildAnthropicToolChoice(
    request.toolChoice,
    request.parallelToolCalls
  );
  if (toolChoice) body.tool_choice = toolChoice;

  Object.assign(body, request.extraBody, request.extensions);
  if (request.stream) body.stream = true;
  return body;
}

export async function parseAnthropicMessagesResponse(
  response: WireResponse
): Promise<LlmResponse> {
  const text = await readWireResponseText(response);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Anthropic Messages response is not valid JSON");
  }
  return parseAnthropicMessagesResponseValue(value);
}

export function parseAnthropicMessagesResponseValue(
  value: unknown
): LlmResponse {
  const root = asObject(value);
  if (!root) throw new Error("Anthropic Messages response is not a JSON object");
  if (root.type === "error" || asObject(root.error)) {
    const error = asObject(root.error);
    throw new Error(
      `Anthropic Messages Error: ${readString(error?.message) ?? JSON.stringify(error ?? root)}`
    );
  }

  let content = "";
  let reasoningContent = "";
  const toolCalls: LlmToolCall[] = [];
  for (const rawBlock of readArray(root.content) ?? []) {
    const block = asObject(rawBlock);
    if (!block) continue;
    if (block.type === "text") {
      content += readString(block.text) ?? "";
    } else if (block.type === "thinking") {
      reasoningContent += readString(block.thinking) ?? "";
    } else if (block.type === "tool_use") {
      const toolCall = parseAnthropicToolCall(block);
      if (toolCall) toolCalls.push(toolCall);
    }
  }

  return {
    content,
    ...(reasoningContent ? { reasoningContent } : {}),
    finishReason: readString(root.stop_reason) ?? null,
    stopSequence: readNullableString(root.stop_sequence),
    ...(parseAnthropicUsage(root.usage)
      ? { usage: parseAnthropicUsage(root.usage) }
      : {}),
    ...(toolCalls.length ? { toolCalls } : {}),
    metadata: compactMetadata({
      anthropicMessageId: readString(root.id),
      anthropicModel: readString(root.model),
    }),
  };
}

export function parseAnthropicUsage(value: unknown): TokenUsage | undefined {
  const usage = asObject(value);
  if (!usage) return undefined;
  const inputTokens = readNumber(usage.input_tokens) ?? 0;
  const outputTokens = readNumber(usage.output_tokens) ?? 0;
  const cachedTokens = readNumber(usage.cache_read_input_tokens);
  return {
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens: inputTokens + outputTokens,
    ...(cachedTokens === undefined
      ? {}
      : { promptTokensDetails: { cachedTokens } }),
  };
}

interface PendingToolCall {
  id: string;
  name: string;
  input: string;
}

export class AnthropicMessagesStreamDecoder
  implements ProviderStreamDecoder
{
  private readonly decoder = new SseDataLineDecoder();
  private readonly pendingTools = new Map<number, PendingToolCall>();
  private readonly toolCalls: LlmToolCall[] = [];
  private content = "";
  private reasoningContent = "";
  private stopReason: string | null = null;
  private stopSequence: string | null = null;
  private inputTokens = 0;
  private outputTokens = 0;
  private cachedTokens: number | undefined;
  private hasUsage = false;
  private completed = false;

  push(chunk: Uint8Array): LlmStreamEvent[] {
    if (this.completed) return [];
    return this.decodeLines(this.decoder.push(chunk));
  }

  finish(): LlmStreamEvent[] {
    if (this.completed) return [];
    const events = this.decodeLines(this.decoder.finish());
    if (!this.completed) events.push(...this.complete());
    return events;
  }

  private decodeLines(lines: string[]): LlmStreamEvent[] {
    const events: LlmStreamEvent[] = [];
    for (const line of lines) {
      if (!line || line === "[DONE]") {
        if (line === "[DONE]" && !this.completed) {
          events.push(...this.complete());
        }
        continue;
      }

      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        continue;
      }
      const event = asObject(value);
      if (!event) continue;
      const type = readString(event.type);
      if (type === "error") {
        const error = asObject(event.error);
        throw new Error(
          `Anthropic Messages Error: ${readString(error?.message) ?? JSON.stringify(error ?? event)}`
        );
      }

      if (type === "message_start") {
        this.mergeUsage(asObject(event.message)?.usage);
      } else if (type === "content_block_start") {
        events.push(...this.startContentBlock(event));
      } else if (type === "content_block_delta") {
        events.push(...this.applyContentDelta(event));
      } else if (type === "content_block_stop") {
        events.push(...this.finishToolCall(readNumber(event.index) ?? 0));
      } else if (type === "message_delta") {
        const delta = asObject(event.delta);
        if (delta) {
          this.stopReason = readString(delta.stop_reason) ?? this.stopReason;
          if (delta.stop_sequence !== undefined) {
            this.stopSequence = readNullableString(delta.stop_sequence);
          }
        }
        this.mergeUsage(event.usage);
      } else if (type === "message_stop") {
        events.push(...this.complete());
      }
    }
    return events;
  }

  private startContentBlock(event: JsonObject): LlmStreamEvent[] {
    const block = asObject(event.content_block);
    if (!block) return [];
    const index = readNumber(event.index) ?? 0;
    if (block.type === "tool_use") {
      this.pendingTools.set(index, {
        id: readString(block.id) ?? "",
        name: readString(block.name) ?? "",
        input: initialToolInput(block.input),
      });
      return [];
    }
    if (block.type === "text") {
      const delta = readString(block.text);
      if (delta) {
        this.content += delta;
        return [{ type: "text-delta", delta }];
      }
    }
    if (block.type === "thinking") {
      const delta = readString(block.thinking);
      if (delta) {
        this.reasoningContent += delta;
        return [{ type: "reasoning-delta", delta }];
      }
    }
    return [];
  }

  private applyContentDelta(event: JsonObject): LlmStreamEvent[] {
    const delta = asObject(event.delta);
    if (!delta) return [];
    const type = readString(delta.type);
    if (type === "text_delta") {
      const text = readString(delta.text);
      if (!text) return [];
      this.content += text;
      return [{ type: "text-delta", delta: text }];
    }
    if (type === "thinking_delta") {
      const thinking = readString(delta.thinking);
      if (!thinking) return [];
      this.reasoningContent += thinking;
      return [{ type: "reasoning-delta", delta: thinking }];
    }
    if (type === "input_json_delta") {
      const tool = this.pendingTools.get(readNumber(event.index) ?? 0);
      if (tool) tool.input += readString(delta.partial_json) ?? "";
    }
    return [];
  }

  private finishToolCall(index: number): LlmStreamEvent[] {
    const pending = this.pendingTools.get(index);
    if (!pending) return [];
    this.pendingTools.delete(index);
    const toolCall: LlmToolCall = {
      id: pending.id,
      type: "function",
      function: { name: pending.name, arguments: pending.input || "{}" },
    };
    this.toolCalls.push(toolCall);
    return [{ type: "tool-call", toolCall }];
  }

  private mergeUsage(value: unknown): void {
    const usage = asObject(value);
    if (!usage) return;
    const inputTokens = readNumber(usage.input_tokens);
    const outputTokens = readNumber(usage.output_tokens);
    const cachedTokens = readNumber(usage.cache_read_input_tokens);
    if (inputTokens !== undefined) this.inputTokens = inputTokens;
    if (outputTokens !== undefined) this.outputTokens = outputTokens;
    if (cachedTokens !== undefined) this.cachedTokens = cachedTokens;
    this.hasUsage = true;
  }

  private complete(): LlmStreamEvent[] {
    if (this.completed) return [];
    const events: LlmStreamEvent[] = [];
    for (const index of this.pendingTools.keys()) {
      events.push(...this.finishToolCall(index));
    }
    this.completed = true;
    const usage = this.hasUsage
      ? {
          promptTokens: this.inputTokens,
          completionTokens: this.outputTokens,
          totalTokens: this.inputTokens + this.outputTokens,
          ...(this.cachedTokens === undefined
            ? {}
            : { promptTokensDetails: { cachedTokens: this.cachedTokens } }),
        }
      : undefined;
    if (usage) events.push({ type: "usage", usage });
    events.push({
      type: "completed",
      response: {
        content: this.content,
        ...(this.reasoningContent
          ? { reasoningContent: this.reasoningContent }
          : {}),
        finishReason:
          this.stopReason ?? (this.toolCalls.length ? "tool_use" : null),
        stopSequence: this.stopSequence,
        ...(usage ? { usage } : {}),
        ...(this.toolCalls.length ? { toolCalls: this.toolCalls } : {}),
      },
    });
    return events;
  }
}

export const anthropicMessagesAdapter: ProviderAdapter = {
  id: "anthropic-messages",
  buildRequest: buildAnthropicMessagesRequest,
  parseResponse: parseAnthropicMessagesResponse,
  createStreamDecoder: () => new AnthropicMessagesStreamDecoder(),
};

function buildAnthropicMessage(message: LlmMessage): WireJsonValue {
  return {
    role: message.role === "assistant" ? "assistant" : "user",
    content:
      typeof message.content === "string"
        ? message.content
        : message.content
            .map(buildAnthropicContentBlock)
            .filter((value): value is WireJsonValue => value !== undefined),
  };
}

function buildAnthropicContentBlock(
  content: LlmMessageContent
): WireJsonValue | undefined {
  if (content.type === "text") {
    return {
      type: "text",
      text: content.text,
      ...(content.cacheControl
        ? { cache_control: content.cacheControl }
        : {}),
    };
  }
  if (content.type === "image") {
    const source = normalizeAnthropicSource(content.source, "image/png");
    return source
      ? {
          type: "image",
          source,
          ...(content.cacheControl
            ? { cache_control: content.cacheControl }
            : {}),
        }
      : undefined;
  }
  if (content.type === "document") {
    const source = normalizeAnthropicDocumentSource(content.source);
    return source
      ? {
          type: "document",
          source,
          ...(content.cacheControl
            ? { cache_control: content.cacheControl }
            : {}),
        }
      : undefined;
  }
  if (content.type === "tool_use") {
    return {
      type: "tool_use",
      id: content.id,
      name: content.name,
      input: content.input,
    };
  }
  if (content.type === "tool_result") {
    return {
      type: "tool_result",
      tool_use_id: content.toolUseId,
      content: normalizeToolResultContent(content.content),
      ...(content.isError === undefined ? {} : { is_error: content.isError }),
    };
  }
  return undefined;
}

function normalizeToolResultContent(value: string | JsonValue): WireJsonValue {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    const content = asObject(item);
    if (content?.type === "text" && typeof content.text === "string") {
      return { type: "text", text: content.text };
    }
    if (content?.type === "image") {
      const source = normalizeAnthropicSource(content.source, "image/png");
      if (source) return { type: "image", source };
    }
    return item;
  });
}

function normalizeAnthropicSource(
  source: JsonValue,
  fallbackMediaType: string
): WireJsonValue | undefined {
  if (typeof source === "string") {
    if (source.startsWith("data:")) return parseDataUrl(source);
    if (/^https?:\/\//.test(source)) return { type: "url", url: source };
    return { type: "base64", media_type: fallbackMediaType, data: source };
  }
  const value = asObject(source);
  if (!value) return undefined;
  const url = readString(value.url);
  if (url) return { type: "url", url };
  const data = readString(value.data) ?? readString(value.base64);
  if (!data) return isJsonValue(value) ? value : undefined;
  if (data.startsWith("data:")) return parseDataUrl(data);
  return {
    type: "base64",
    media_type:
      readString(value.media_type) ??
      readString(value.mimeType) ??
      readString(value.mime_type) ??
      fallbackMediaType,
    data,
  };
}

function normalizeAnthropicDocumentSource(
  source: JsonValue
): WireJsonValue | undefined {
  const value = asObject(source);
  if (value?.type === "file" && typeof value.file_id === "string") {
    return { type: "file", file_id: value.file_id };
  }
  if (value?.type === "url" && typeof value.url === "string") {
    return { type: "url", url: value.url };
  }
  return normalizeAnthropicSource(source, "application/pdf");
}

function parseDataUrl(value: string): WireJsonValue | undefined {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(value);
  return match
    ? { type: "base64", media_type: match[1], data: match[2] }
    : undefined;
}

function buildAnthropicToolChoice(
  choice: LlmToolChoice | undefined,
  parallelToolCalls: boolean | undefined
): WireJsonValue | undefined {
  if (!choice || choice === "none") return undefined;
  const disableParallel = parallelToolCalls === false;
  if (choice === "auto") {
    return { type: "auto", disable_parallel_tool_use: disableParallel };
  }
  if (choice === "required") {
    return { type: "any", disable_parallel_tool_use: disableParallel };
  }
  return {
    type: "tool",
    name: choice.function.name,
    disable_parallel_tool_use: disableParallel,
  };
}

function messageToSystemText(message: LlmMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((content) =>
      content.type === "text" ? content.text : JSON.stringify(content)
    )
    .join("\n");
}

function toStopSequences(value: LlmRequest["stop"]): string[] | undefined {
  if (typeof value === "string") return [value];
  return value;
}

function parseAnthropicToolCall(item: JsonObject): LlmToolCall | undefined {
  const name = readString(item.name);
  if (!name) return undefined;
  return {
    id: readString(item.id) ?? "",
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(item.input ?? {}),
    },
  };
}

function initialToolInput(value: unknown): string {
  const input = asObject(value);
  return input && Object.keys(input).length > 0 ? JSON.stringify(input) : "";
}

function compactMetadata(
  value: Record<string, string | undefined>
): Record<string, JsonValue> | undefined {
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) result[key] = item;
  }
  return Object.keys(result).length ? result : undefined;
}

async function readWireResponseText(response: WireResponse): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of response.body) {
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

function assignDefined(
  target: AnthropicMessagesBody,
  key: string,
  value: JsonValue | undefined
): void {
  if (value !== undefined) target[key] = value;
}

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function readArray(value: unknown): JsonValue[] | undefined {
  return Array.isArray(value) ? (value as JsonValue[]) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every(isJsonValue)
  );
}
