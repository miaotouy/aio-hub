import { SseDataLineDecoder } from "../stream-parser/sse";
import type { JsonValue, WireJsonValue } from "../types/json";
import type {
  LlmStreamEvent,
  ProviderAdapter,
  ProviderProfile,
  ProviderStreamDecoder,
  StreamDecoderContext,
} from "../types/provider";
import type {
  LlmMessage,
  LlmMessageContent,
  LlmRequest,
} from "../types/request";
import type {
  LlmAnnotation,
  LlmResponse,
  LlmToolCall,
  MediaAssetRef,
  TokenUsage,
} from "../types/response";
import type { WireRequest, WireResponse } from "../types/transport";

type JsonObject = Record<string, JsonValue>;
export type OpenAiCompatibleBody = Record<string, WireJsonValue>;

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

export function buildOpenAiCompatibleUrl(
  profile: ProviderProfile,
  endpoint = "chat/completions"
): string {
  const customEndpoint =
    profile.endpoints?.chatCompletions ?? profile.endpoints?.[endpoint];

  if (customEndpoint?.startsWith("http")) return customEndpoint;

  const host = profile.baseUrl.endsWith("/")
    ? profile.baseUrl
    : `${profile.baseUrl}/`;

  if (customEndpoint) {
    return `${host}${customEndpoint.replace(/^\//, "")}`;
  }

  if (endpoint.startsWith("http")) return endpoint;

  const versionedHost =
    host.includes("/v1") ||
    host.includes("/v2") ||
    host.includes("/v3") ||
    host.includes("/api/v")
      ? host
      : `${host}v1/`;

  return `${versionedHost}${endpoint}`;
}

export function buildOpenAiCompatibleRequest(
  profile: ProviderProfile,
  request: LlmRequest
): WireRequest {
  const body = buildOpenAiCompatibleBody(request);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
    ...profile.headers,
  };

  return {
    method: "POST",
    url: buildOpenAiCompatibleUrl(profile),
    headers,
    body: { kind: "json", value: body },
    streaming: request.stream ?? false,
  };
}

export function buildOpenAiCompatibleBody(
  request: LlmRequest,
  messages: WireJsonValue[] = request.messages.map(buildOpenAiMessage)
): OpenAiCompatibleBody {
  const body: OpenAiCompatibleBody = {
    model: request.model,
    messages,
    temperature: request.temperature ?? 0.5,
  };

  if (request.maxCompletionTokens !== undefined) {
    body.max_completion_tokens = request.maxCompletionTokens;
  } else if (request.maxTokens !== undefined) {
    body.max_tokens = request.maxTokens;
  }

  assignDefined(body, "top_p", request.topP);
  assignDefined(body, "top_k", request.topK);
  assignDefined(body, "frequency_penalty", request.frequencyPenalty);
  assignDefined(body, "presence_penalty", request.presencePenalty);
  assignDefined(body, "repetition_penalty", request.repetitionPenalty);
  assignDefined(body, "stop", request.stop);
  assignDefined(body, "seed", request.seed);
  assignDefined(body, "n", request.n);
  assignDefined(body, "logprobs", request.logprobs);
  assignDefined(body, "top_logprobs", request.topLogprobs);
  assignDefined(body, "reasoning_effort", request.reasoningEffort);
  assignDefined(body, "response_format", request.responseFormat);
  assignDefined(body, "tools", request.tools as unknown as JsonValue);
  assignDefined(
    body,
    "tool_choice",
    request.toolChoice as unknown as JsonValue
  );
  assignDefined(body, "parallel_tool_calls", request.parallelToolCalls);
  assignDefined(body, "user", request.user);
  assignDefined(body, "logit_bias", request.logitBias);
  assignDefined(body, "store", request.store);
  assignDefined(body, "metadata", request.metadata);
  assignDefined(body, "modalities", request.modalities);
  assignDefined(body, "prediction", request.prediction);
  assignDefined(body, "audio", request.audio);
  assignDefined(body, "service_tier", request.serviceTier);
  assignDefined(body, "web_search_options", request.webSearchOptions);
  assignDefined(body, "stream_options", request.streamOptions);

  if (request.thinkingEnabled !== undefined) {
    body.thinking = {
      type: request.thinkingEnabled ? "enabled" : "disabled",
      ...(request.thinkingBudget !== undefined
        ? { budget_tokens: request.thinkingBudget }
        : {}),
    };
  }

  Object.assign(body, request.extraBody, request.extensions);
  if (request.stream) body.stream = true;
  return body;
}

export async function parseOpenAiCompatibleResponse(
  response: WireResponse
): Promise<LlmResponse> {
  const text = await readWireResponseText(response);
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("OpenAI-compatible response is not valid JSON");
  }

  return parseOpenAiCompatibleResponseValue(value);
}

export function parseOpenAiCompatibleResponseValue(
  value: unknown
): LlmResponse {
  const root = asObject(value);
  if (!root) {
    throw new Error("OpenAI-compatible response is not a JSON object");
  }
  const choice = asObject(readArray(root.choices)?.[0]);
  if (!choice) {
    throw new Error("OpenAI-compatible response does not contain a choice");
  }

  const message = asObject(choice.message);
  const content = readString(message?.content) ?? "";
  const reasoningContent = firstString(message, [
    "reasoning_content",
    "reasoning",
    "thinking",
    "thought",
  ]);
  const refusal = readString(message?.refusal);
  const toolCalls = parseToolCalls(message?.tool_calls);
  const images = collectOpenAiImages([
    root.images,
    root.data,
    root.output,
    message?.images,
    message?.content,
    message?.tool_calls,
  ]);
  const annotations = parseAnnotations(message?.annotations);
  const usage = parseOpenAiUsage(root.usage);
  const metadata = compactJsonObject({
    systemFingerprint: root.system_fingerprint,
    serviceTier: root.service_tier,
    logprobs: choice.logprobs,
    audio: message?.audio,
  });

  return {
    content: refusal ? "" : content,
    ...(reasoningContent ? { reasoningContent } : {}),
    refusal: refusal ?? null,
    finishReason: readString(choice.finish_reason),
    ...(usage ? { usage } : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(annotations.length > 0 ? { annotations } : {}),
    ...(images.length > 0 ? { images } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

export function parseOpenAiUsage(value: unknown): TokenUsage | undefined {
  const usage = asObject(value);
  if (!usage) return undefined;

  const promptDetails = asObject(usage.prompt_tokens_details);
  const completionDetails = asObject(usage.completion_tokens_details);

  return {
    promptTokens: readNumber(usage.prompt_tokens) ?? 0,
    completionTokens: readNumber(usage.completion_tokens) ?? 0,
    totalTokens: readNumber(usage.total_tokens) ?? 0,
    ...(promptDetails
      ? {
          promptTokensDetails: {
            cachedTokens: readNumber(promptDetails.cached_tokens),
            audioTokens: readNumber(promptDetails.audio_tokens),
          },
        }
      : {}),
    ...(completionDetails
      ? {
          completionTokensDetails: {
            reasoningTokens: readNumber(completionDetails.reasoning_tokens),
            audioTokens: readNumber(completionDetails.audio_tokens),
            acceptedPredictionTokens: readNumber(
              completionDetails.accepted_prediction_tokens
            ),
            rejectedPredictionTokens: readNumber(
              completionDetails.rejected_prediction_tokens
            ),
          },
        }
      : {}),
  };
}

export class OpenAiCompatibleStreamDecoder implements ProviderStreamDecoder {
  private readonly decoder = new SseDataLineDecoder();
  private readonly toolCalls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  private content = "";
  private reasoningContent = "";
  private usage: TokenUsage | undefined;
  private finishReason: string | null | undefined;
  private completed = false;

  push(chunk: Uint8Array): LlmStreamEvent[] {
    if (this.completed) return [];
    return this.decodeDataLines(this.decoder.push(chunk));
  }

  finish(): LlmStreamEvent[] {
    if (this.completed) return [];
    const events = this.decodeDataLines(this.decoder.finish());
    if (!this.completed) events.push(...this.complete());
    return events;
  }

  private decodeDataLines(lines: string[]): LlmStreamEvent[] {
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

      const root = asObject(value);
      const choice = asObject(readArray(root?.choices)?.[0]);
      const delta = asObject(choice?.delta);
      const text = readString(delta?.content);
      const reasoning = firstString(delta, [
        "reasoning_content",
        "reasoning",
        "thinking",
        "thought",
      ]);

      if (text) {
        this.content += text;
        events.push({ type: "text-delta", delta: text });
      }
      if (reasoning) {
        this.reasoningContent += reasoning;
        events.push({ type: "reasoning-delta", delta: reasoning });
      }

      this.collectToolCallDeltas(delta?.tool_calls);
      this.finishReason =
        readString(choice?.finish_reason) ?? this.finishReason;

      const usage = parseOpenAiUsage(root?.usage);
      if (usage) {
        this.usage = usage;
        events.push({ type: "usage", usage });
      }
    }

    return events;
  }

  private collectToolCallDeltas(value: unknown): void {
    for (const [fallbackIndex, rawCall] of (readArray(value) ?? []).entries()) {
      const call = asObject(rawCall);
      if (!call) continue;
      const index = readNumber(call.index) ?? fallbackIndex;
      const functionValue = asObject(call.function);
      const current = this.toolCalls.get(index) ?? {
        id: "",
        name: "",
        arguments: "",
      };

      current.id = readString(call.id) ?? current.id;
      current.name += readString(functionValue?.name) ?? "";
      current.arguments += readString(functionValue?.arguments) ?? "";
      this.toolCalls.set(index, current);
    }
  }

  private complete(): LlmStreamEvent[] {
    this.completed = true;
    const toolCalls = [...this.toolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call], index): LlmToolCall => ({
        id: call.id || `tool-call-${index}`,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      }));

    const response: LlmResponse = {
      content: this.content,
      ...(this.reasoningContent
        ? { reasoningContent: this.reasoningContent }
        : {}),
      ...(this.finishReason !== undefined
        ? { finishReason: this.finishReason }
        : {}),
      ...(this.usage ? { usage: this.usage } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };

    return [
      ...toolCalls.map((toolCall): LlmStreamEvent => ({
        type: "tool-call",
        toolCall,
      })),
      {
        type: "completed",
        response,
      },
    ];
  }
}

export const openAiCompatibleAdapter: ProviderAdapter = {
  id: "openai-compatible",
  buildRequest: buildOpenAiCompatibleRequest,
  parseResponse: parseOpenAiCompatibleResponse,
  createStreamDecoder(_context: StreamDecoderContext): ProviderStreamDecoder {
    return new OpenAiCompatibleStreamDecoder();
  },
};

function buildOpenAiMessage(message: LlmMessage): WireJsonValue {
  const result: OpenAiCompatibleBody = {
    role: message.role,
  };

  if (typeof message.content === "string") {
    result.content = message.content;
  } else {
    const content: WireJsonValue[] = [];
    const toolCalls: WireJsonValue[] = [];

    for (const part of message.content) {
      const mapped = mapOpenAiContent(part);
      if (mapped.content) content.push(mapped.content);
      if (mapped.toolCall) toolCalls.push(mapped.toolCall);
      if (mapped.toolResult) {
        result.content = mapped.toolResult.content;
        result.tool_call_id = mapped.toolResult.toolCallId;
      }
    }

    if (!("content" in result)) result.content = content;
    if (toolCalls.length > 0) result.tool_calls = toolCalls;
  }

  assignDefined(result, "name", message.name);
  assignDefined(result, "tool_call_id", message.toolCallId);
  assignDefined(result, "reasoning_content", message.reasoningContent);
  if (message.prefix) result.prefix = true;
  return result;
}

function mapOpenAiContent(part: LlmMessageContent): {
  content?: WireJsonValue;
  toolCall?: WireJsonValue;
  toolResult?: { content: WireJsonValue; toolCallId: string };
} {
  switch (part.type) {
    case "text":
      return { content: { type: "text", text: part.text } };
    case "image":
      return {
        content: {
          type: "image_url",
          image_url: { url: mediaSourceToUrl(part.source) },
        },
      };
    case "audio": {
      const source = asObject(part.source);
      const contentType = readMediaType(source);
      return {
        content: {
          type: "input_audio",
          input_audio: {
            data: readString(source?.data) ?? "",
            format: contentType === "audio/wav" ? "wav" : "mp3",
          },
        },
      };
    }
    case "video":
      return {
        content: {
          type: "image_url",
          image_url: { url: mediaSourceToUrl(part.source) },
          ...(part.metadata ? { video_metadata: part.metadata } : {}),
        },
      };
    case "document": {
      const source = asObject(part.source);
      const contentType = readMediaType(source);
      if (contentType.startsWith("image/")) {
        return {
          content: {
            type: "image_url",
            image_url: { url: mediaSourceToUrl(part.source) },
          },
        };
      }
      if (contentType === "application/pdf") {
        return {
          content: {
            type: "file",
            file: {
              filename: "document.pdf",
              file_data: mediaSourceToUrl(part.source),
            },
          },
        };
      }
      return { content: { type: "document", source: part.source } };
    }
    case "tool_use":
      return {
        toolCall: {
          id: part.id,
          type: "function",
          function: {
            name: part.name,
            arguments: JSON.stringify(part.input),
          },
        },
      };
    case "tool_result":
      return {
        toolResult: {
          content:
            typeof part.content === "string"
              ? part.content
              : JSON.stringify(part.content),
          toolCallId: part.toolUseId,
        },
      };
  }
}

function mediaSourceToUrl(sourceValue: JsonValue): WireJsonValue {
  if (typeof sourceValue === "string") return sourceValue;
  const source = asObject(sourceValue);
  const url = readString(source?.url) ?? readString(source?.file_uri);
  if (url) return url;

  const data = readString(source?.data);
  if (data) {
    return data.startsWith("data:")
      ? data
      : `data:${readMediaType(source)};base64,${data}`;
  }

  return sourceValue;
}

function readMediaType(source: JsonObject | undefined): string {
  return (
    readString(source?.contentType) ??
    readString(source?.mediaType) ??
    readString(source?.media_type) ??
    readString(source?.mime_type) ??
    DEFAULT_CONTENT_TYPE
  );
}

function parseToolCalls(value: unknown): LlmToolCall[] {
  const result: LlmToolCall[] = [];
  for (const item of readArray(value) ?? []) {
    const call = asObject(item);
    const fn = asObject(call?.function);
    const id = readString(call?.id);
    const name = readString(fn?.name);
    if (!id || !name) continue;
    result.push({
      id,
      type: "function",
      function: {
        name,
        arguments: readString(fn?.arguments) ?? "",
      },
    });
  }
  return result;
}

function parseAnnotations(value: unknown): LlmAnnotation[] {
  const annotations: LlmAnnotation[] = [];
  for (const item of readArray(value) ?? []) {
    const annotation = asObject(item);
    if (!annotation) continue;
    annotations.push({
      ...annotation,
      type: readString(annotation.type) ?? "url_citation",
    });
  }
  return annotations;
}

function collectOpenAiImages(values: unknown[]): MediaAssetRef[] {
  const result: MediaAssetRef[] = [];
  const seen = new Set<string>();

  const push = (asset: MediaAssetRef) => {
    const key =
      asset.kind === "remote-url"
        ? asset.url
        : asset.kind === "inline-base64"
          ? asset.data
          : asset.id;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(asset);
  };

  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      for (const match of value.matchAll(
        /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=_-]+)/g
      )) {
        push({ kind: "inline-base64", contentType: match[1], data: match[2] });
      }
      for (const match of value.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)) {
        push({ kind: "remote-url", url: match[1] });
      }
      for (const match of value.matchAll(
        /https?:\/\/[^\s"'<>)]*\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>)]*)?/gi
      )) {
        push({ kind: "remote-url", url: match[0] });
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const item = asObject(value);
    if (!item) return;

    const revisedPrompt =
      readString(item.revised_prompt) ?? readString(item.revisedPrompt);
    const rawUrl =
      readString(item.url) ??
      readString(item.image_url) ??
      readString(asObject(item.image_url)?.url) ??
      readString(item.output_url) ??
      readString(item.outputUrl);
    const rawBase64 =
      readString(item.b64_json) ??
      readString(item.b64) ??
      readString(item.base64) ??
      readString(item.image_base64) ??
      readString(item.imageBase64) ??
      readString(item.result);
    const itemType = readString(item.type);
    const hasImageSignal =
      itemType?.includes("image") ||
      rawUrl !== undefined ||
      item.b64_json !== undefined ||
      item.image_base64 !== undefined ||
      item.imageBase64 !== undefined ||
      (item.result !== undefined && revisedPrompt !== undefined);

    if (rawBase64 && hasImageSignal) {
      push({
        kind: "inline-base64",
        contentType: "image/png",
        data: rawBase64.startsWith("data:")
          ? (rawBase64.split(",", 2)[1] ?? rawBase64)
          : rawBase64,
        ...(revisedPrompt ? { revisedPrompt } : {}),
      });
    } else if (rawUrl) {
      push({
        kind: "remote-url",
        url: rawUrl,
        ...(revisedPrompt ? { revisedPrompt } : {}),
      });
    }

    if (
      readString(asObject(item.function)?.name)?.toLowerCase().includes("image")
    ) {
      const argumentsValue = readString(asObject(item.function)?.arguments);
      if (argumentsValue) {
        try {
          visit(JSON.parse(argumentsValue));
        } catch {
          visit(argumentsValue);
        }
      }
    }

    for (const key of ["content", "data", "images", "output", "result"]) {
      visit(item[key]);
    }
  };

  values.forEach(visit);
  return result;
}

async function readWireResponseText(response: WireResponse): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of response.body) {
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

function compactJsonObject(value: Record<string, unknown>): JsonObject {
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (isJsonValue(item)) result[key] = item;
  }
  return result;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
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

function assignDefined(
  target: OpenAiCompatibleBody,
  key: string,
  value: WireJsonValue | JsonValue | undefined
): void {
  if (value !== undefined) target[key] = value;
}

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function firstString(
  value: JsonObject | undefined,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const result = readString(value?.[key]);
    if (result) return result;
  }
  return undefined;
}
