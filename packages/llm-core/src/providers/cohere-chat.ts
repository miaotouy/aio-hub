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
import type { LlmResponse, LlmToolCall, TokenUsage } from "../types/response";
import type { WireRequest, WireResponse } from "../types/transport";

type JsonObject = Record<string, JsonValue>;
export type CohereChatBody = Record<string, WireJsonValue>;

export function buildCohereChatUrl(profile: ProviderProfile): string {
  const customEndpoint = profile.endpoints?.chat;
  if (customEndpoint?.startsWith("http")) return customEndpoint;

  const normalizedBase = profile.baseUrl.replace(/\/v1\/?$/, "");
  const host = normalizedBase.endsWith("/")
    ? normalizedBase
    : `${normalizedBase}/`;
  if (customEndpoint) {
    return `${host}${customEndpoint.replace(/^\//, "")}`;
  }
  const versionedHost = host.includes("/v2") ? host : `${host}v2/`;
  return `${versionedHost}chat`;
}

export function buildCohereChatRequest(
  profile: ProviderProfile,
  request: LlmRequest
): WireRequest {
  return {
    method: "POST",
    url: buildCohereChatUrl(profile),
    headers: {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
      ...(request.requestId ? { "X-Request-ID": request.requestId } : {}),
      ...profile.headers,
    },
    body: { kind: "json", value: buildCohereChatBody(request) },
    streaming: request.stream === true,
  };
}

export function buildCohereChatBody(request: LlmRequest): CohereChatBody {
  const body: CohereChatBody = {
    model: request.model,
    messages: request.messages.map(buildCohereMessage),
    temperature: request.temperature ?? 0.5,
  };
  assignDefined(
    body,
    "max_tokens",
    request.maxCompletionTokens ?? request.maxTokens
  );
  assignDefined(body, "p", request.topP);
  assignDefined(body, "k", request.topK);
  assignDefined(body, "frequency_penalty", request.frequencyPenalty);
  assignDefined(body, "presence_penalty", request.presencePenalty);
  assignDefined(body, "seed", request.seed);
  const stopSequences = toStopSequences(request.stop);
  if (stopSequences?.length) body.stop_sequences = stopSequences;

  if (request.thinkingEnabled !== undefined) {
    body.thinking = request.thinkingEnabled
      ? {
          type: "enabled",
          ...(request.thinkingBudget
            ? { budget_tokens: request.thinkingBudget }
            : {}),
        }
      : { type: "disabled" };
  }
  if (request.tools?.length) {
    body.tools = request.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.function.name,
        ...(tool.function.description
          ? { description: tool.function.description }
          : {}),
        parameters: tool.function.parameters,
      },
    }));
  }
  const toolChoice = buildCohereToolChoice(request.toolChoice);
  if (toolChoice) body.tool_choice = toolChoice;

  Object.assign(body, request.extraBody, request.extensions);
  delete body.requestId;
  if (request.stream) body.stream = true;
  return body;
}

export async function parseCohereChatResponse(
  response: WireResponse
): Promise<LlmResponse> {
  const text = await readWireResponseText(response);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Cohere Chat response is not valid JSON");
  }
  return parseCohereChatResponseValue(value);
}

export function parseCohereChatResponseValue(value: unknown): LlmResponse {
  const root = asObject(value);
  if (!root) throw new Error("Cohere Chat response is not a JSON object");
  if (root.type === "error" || asObject(root.error)) {
    const error = asObject(root.error);
    throw new Error(
      `Cohere Chat Error: ${readString(error?.message) ?? readString(root.message) ?? JSON.stringify(error ?? root)}`
    );
  }

  const message = asObject(root.message);
  let content = "";
  let reasoningContent = "";
  for (const rawPart of readArray(message?.content) ?? []) {
    const part = asObject(rawPart);
    if (!part) continue;
    if (part.type === "text") content += readString(part.text) ?? "";
    if (part.type === "thinking") {
      reasoningContent +=
        readString(part.thinking) ?? readString(part.text) ?? "";
    }
  }
  if (!content) content = readString(root.text) ?? "";
  if (!content && !message && root.text === undefined) {
    throw new Error(
      `Cohere Chat response format is invalid: ${JSON.stringify(root)}`
    );
  }

  const toolCalls = parseCohereToolCalls(message?.tool_calls);
  const usage = parseCohereUsage(root.usage) ?? parseCohereUsage(root.meta);
  return {
    content,
    ...(reasoningContent ? { reasoningContent } : {}),
    finishReason: normalizeFinishReason(
      readString(root.finish_reason) ?? readString(message?.finish_reason)
    ),
    ...(usage ? { usage } : {}),
    ...(toolCalls.length ? { toolCalls } : {}),
    ...(readString(root.id)
      ? { metadata: { cohereResponseId: readString(root.id)! } }
      : {}),
  };
}

export function parseCohereUsage(value: unknown): TokenUsage | undefined {
  const root = asObject(value);
  const tokens = asObject(root?.tokens) ?? asObject(root?.billed_units);
  if (!tokens) return undefined;
  const inputTokens = readNumber(tokens.input_tokens) ?? 0;
  const outputTokens = readNumber(tokens.output_tokens) ?? 0;
  return {
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

export class CohereChatStreamDecoder implements ProviderStreamDecoder {
  private readonly decoder = new SseDataLineDecoder();
  private readonly pendingTools = new Map<number, PendingToolCall>();
  private readonly toolCalls: LlmToolCall[] = [];
  private content = "";
  private reasoningContent = "";
  private finishReason: string | null = null;
  private usage: TokenUsage | undefined;
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
      if (line === "[DONE]") {
        if (!this.completed) events.push(...this.complete());
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
          `Cohere Chat Error: ${readString(error?.message) ?? readString(event.message) ?? JSON.stringify(error ?? event)}`
        );
      }

      if (type === "content-delta") {
        events.push(...this.applyContentDelta(event));
      } else if (type === "tool-call-start") {
        this.startToolCall(event);
      } else if (type === "tool-call-delta") {
        this.updateToolCall(event);
      } else if (type === "tool-call-end") {
        events.push(...this.finishToolCall(readNumber(event.index) ?? 0));
      } else if (type === "message-end") {
        const delta = asObject(event.delta);
        this.finishReason = normalizeFinishReason(
          readString(delta?.finish_reason) ?? readString(event.finish_reason)
        );
        this.usage =
          parseCohereUsage(delta?.usage) ??
          parseCohereUsage(event.usage) ??
          this.usage;
        events.push(...this.complete());
      } else {
        const legacyText = readString(event.text);
        if (legacyText) {
          this.content += legacyText;
          events.push({ type: "text-delta", delta: legacyText });
        }
      }
    }
    return events;
  }

  private applyContentDelta(event: JsonObject): LlmStreamEvent[] {
    const content = asObject(asObject(asObject(event.delta)?.message)?.content);
    const text = readString(content?.text);
    const thinking = readString(content?.thinking);
    const events: LlmStreamEvent[] = [];
    if (text) {
      this.content += text;
      events.push({ type: "text-delta", delta: text });
    }
    if (thinking) {
      this.reasoningContent += thinking;
      events.push({ type: "reasoning-delta", delta: thinking });
    }
    return events;
  }

  private startToolCall(event: JsonObject): void {
    const toolCall = readToolCallDelta(event);
    if (!toolCall) return;
    this.pendingTools.set(readNumber(event.index) ?? 0, toolCall);
  }

  private updateToolCall(event: JsonObject): void {
    const index = readNumber(event.index) ?? 0;
    const delta = readToolCallDelta(event);
    const pending = this.pendingTools.get(index);
    if (!pending) {
      if (delta) this.pendingTools.set(index, delta);
      return;
    }
    if (delta?.id) pending.id = delta.id;
    if (delta?.name) pending.name = delta.name;
    if (delta?.arguments) pending.arguments += delta.arguments;
  }

  private finishToolCall(index: number): LlmStreamEvent[] {
    const pending = this.pendingTools.get(index);
    if (!pending) return [];
    this.pendingTools.delete(index);
    const toolCall: LlmToolCall = {
      id: pending.id,
      type: "function",
      function: {
        name: pending.name,
        arguments: pending.arguments || "{}",
      },
    };
    this.toolCalls.push(toolCall);
    return [{ type: "tool-call", toolCall }];
  }

  private complete(): LlmStreamEvent[] {
    if (this.completed) return [];
    const events: LlmStreamEvent[] = [];
    for (const index of this.pendingTools.keys()) {
      events.push(...this.finishToolCall(index));
    }
    this.completed = true;
    if (this.usage) events.push({ type: "usage", usage: this.usage });
    events.push({
      type: "completed",
      response: {
        content: this.content,
        ...(this.reasoningContent
          ? { reasoningContent: this.reasoningContent }
          : {}),
        finishReason:
          this.finishReason ?? (this.toolCalls.length ? "tool_calls" : null),
        ...(this.usage ? { usage: this.usage } : {}),
        ...(this.toolCalls.length ? { toolCalls: this.toolCalls } : {}),
      },
    });
    return events;
  }
}

export const cohereChatAdapter: ProviderAdapter = {
  id: "cohere-chat",
  buildRequest: buildCohereChatRequest,
  parseResponse: parseCohereChatResponse,
  createStreamDecoder: () => new CohereChatStreamDecoder(),
};

function buildCohereMessage(message: LlmMessage): WireJsonValue {
  if (typeof message.content === "string") {
    return { role: message.role, content: message.content };
  }
  const text = message.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n");
  const images = message.content
    .filter((content) => content.type === "image")
    .map(buildCohereImagePart)
    .filter((value): value is WireJsonValue => value !== undefined);
  return {
    role: message.role,
    content: images.length
      ? [...(text ? [{ type: "text", text }] : []), ...images]
      : text,
  };
}

function buildCohereImagePart(
  content: Extract<LlmMessageContent, { type: "image" }>
): WireJsonValue | undefined {
  const url = sourceToDataUrl(content.source);
  return url ? { type: "image_url", image_url: { url } } : undefined;
}

function sourceToDataUrl(source: JsonValue): string | undefined {
  if (typeof source === "string") return source;
  const value = asObject(source);
  if (!value) return undefined;
  const url = readString(value.url);
  if (url) return url;
  const data = readString(value.data) ?? readString(value.base64);
  if (!data) return undefined;
  if (data.startsWith("data:")) return data;
  const mediaType =
    readString(value.media_type) ??
    readString(value.mimeType) ??
    readString(value.mime_type) ??
    "image/png";
  return `data:${mediaType};base64,${data}`;
}

function buildCohereToolChoice(
  choice: LlmToolChoice | undefined
): WireJsonValue | undefined {
  if (!choice) return undefined;
  if (typeof choice === "string") return { type: choice };
  return { type: "function", function: { name: choice.function.name } };
}

function parseCohereToolCalls(value: unknown): LlmToolCall[] {
  const rawCalls = Array.isArray(value) ? value : value ? [value] : [];
  const result: LlmToolCall[] = [];
  for (const rawCall of rawCalls) {
    const call = asObject(rawCall);
    const fn = asObject(call?.function);
    const name = readString(fn?.name);
    if (!call || !name) continue;
    const argumentsValue = fn?.arguments;
    result.push({
      id: readString(call.id) ?? "",
      type: "function",
      function: {
        name,
        arguments:
          typeof argumentsValue === "string"
            ? argumentsValue
            : JSON.stringify(argumentsValue ?? {}),
      },
    });
  }
  return result;
}

function readToolCallDelta(event: JsonObject): PendingToolCall | undefined {
  const delta = asObject(event.delta);
  const message = asObject(delta?.message);
  const rawCalls = message?.tool_calls;
  const rawCall = Array.isArray(rawCalls) ? rawCalls[0] : rawCalls;
  const call = asObject(rawCall);
  const fn = asObject(call?.function);
  if (!call && !fn) return undefined;
  const argumentsValue = fn?.arguments;
  return {
    id: readString(call?.id) ?? "",
    name: readString(fn?.name) ?? "",
    arguments:
      typeof argumentsValue === "string"
        ? argumentsValue
        : argumentsValue === undefined
          ? ""
          : JSON.stringify(argumentsValue),
  };
}

function normalizeFinishReason(value: string | undefined): string | null {
  const normalized = value?.toUpperCase();
  if (!normalized) return null;
  if (normalized === "COMPLETE") return "stop";
  if (normalized === "MAX_TOKENS") return "length";
  if (normalized === "TOOL_CALL") return "tool_calls";
  return value!.toLowerCase();
}

function toStopSequences(value: LlmRequest["stop"]): string[] | undefined {
  if (typeof value === "string") return [value];
  return value;
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
  target: CohereChatBody,
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

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
