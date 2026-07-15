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
  LlmAnnotation,
  LlmResponse,
  LlmToolCall,
  MediaAssetRef,
  TokenUsage,
} from "../types/response";
import type { WireRequest, WireResponse } from "../types/transport";

type JsonObject = Record<string, JsonValue>;
export type GoogleGenerateContentBody = Record<string, WireJsonValue>;

const DEFAULT_SAFETY_SETTINGS: JsonValue[] = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
  { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
];

export function buildGoogleGenerateContentRequest(
  profile: ProviderProfile,
  request: LlmRequest
): WireRequest {
  return {
    method: "POST",
    url: buildGoogleGenerateContentUrl(profile, request),
    headers: buildGoogleGenerateContentHeaders(profile, request),
    body: { kind: "json", value: buildGoogleGenerateContentBody(profile, request) },
    streaming: request.stream === true,
  };
}

export function buildGoogleGenerateContentUrl(
  profile: ProviderProfile,
  request: LlmRequest
): string {
  const customEndpoint = profile.endpoints?.chatCompletions;
  if (customEndpoint) {
    const endpoint = customEndpoint.split("{model}").join(request.model);
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${ensureTrailingSlash(profile.baseUrl)}${endpoint.replace(/^\//, "")}`;
    return appendGoogleQuery(url, profile, request);
  }

  const action = request.stream
    ? "streamGenerateContent"
    : "generateContent";
  const style = readString(profile.options?.apiStyle) ?? "developer";
  let url: string;

  if (style === "vertex") {
    const host = ensureTrailingSlash(profile.baseUrl);
    const versionedHost = /\/v1(?:\/|$)/.test(host) ? host : `${host}v1/`;
    const projectId = readString(profile.options?.projectId);
    const location = readString(profile.options?.location) ?? "us-central1";
    const hasResourcePrefix = /\/projects\/[^/]+\/locations\/[^/]+\/?$/.test(
      versionedHost
    );
    const resourcePrefix = !hasResourcePrefix && projectId
      ? `projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/`
      : "";
    url = `${versionedHost}${resourcePrefix}publishers/google/models/${encodeURIComponent(request.model)}:${action}`;
  } else {
    const host = ensureTrailingSlash(profile.baseUrl);
    const versionedHost = /\/v1(?:beta)?\/?$/.test(host)
      ? host
      : `${host}v1beta/`;
    url = `${versionedHost}models/${encodeURIComponent(request.model)}:${action}`;
  }

  return appendGoogleQuery(url, profile, request);
}

function appendGoogleQuery(
  url: string,
  profile: ProviderProfile,
  request: LlmRequest
): string {
  if (readString(profile.options?.apiStyle) === "vertex") return url;
  const separator = url.includes("?") ? "&" : "?";
  const query: string[] = [];
  if (profile.apiKey) query.push(`key=${encodeURIComponent(profile.apiKey)}`);
  if (request.stream) query.push("alt=sse");
  return query.length ? `${url}${separator}${query.join("&")}` : url;
}

function buildGoogleGenerateContentHeaders(
  profile: ProviderProfile,
  request: LlmRequest
): Record<string, string> {
  const vertex = readString(profile.options?.apiStyle) === "vertex";
  return {
    "Content-Type": "application/json",
    ...(vertex && profile.apiKey
      ? { Authorization: `Bearer ${profile.apiKey}` }
      : {}),
    ...(!vertex && profile.apiKey ? { "x-goog-api-key": profile.apiKey } : {}),
    ...(request.requestId ? { "X-Request-ID": request.requestId } : {}),
    ...profile.headers,
  };
}

export function buildGoogleGenerateContentBody(
  profile: ProviderProfile,
  request: LlmRequest
): GoogleGenerateContentBody {
  const body: GoogleGenerateContentBody = {
    contents: request.messages
      .filter(
        (message) =>
          message.role !== "system" && message.role !== "developer"
      )
      .map(buildGoogleContent),
    generationConfig: buildGenerationConfig(request),
  };

  const system = request.messages
    .filter(
      (message) => message.role === "system" || message.role === "developer"
    )
    .map(messageToSystemText)
    .filter(Boolean)
    .join("\n\n");
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const tools = buildGoogleTools(request);
  if (tools) body.tools = tools;
  const toolConfig = buildGoogleToolConfig(request.toolChoice);
  if (toolConfig) body.toolConfig = toolConfig;

  const customSafety = readArray(request.safetySettings);
  if (customSafety?.length) {
    body.safetySettings = mergeSafetySettings(customSafety);
  } else if (readString(profile.options?.apiStyle) !== "vertex") {
    body.safetySettings = DEFAULT_SAFETY_SETTINGS;
  }
  if (request.cachedContent) body.cachedContent = request.cachedContent;

  Object.assign(body, request.extraBody, request.extensions);
  return body;
}

function buildGoogleContent(message: LlmMessage): WireJsonValue {
  const replayParts = readArray(message.metadata?.geminiReplayParts);
  return {
    role: message.role === "assistant" ? "model" : "user",
    parts:
      replayParts?.length
        ? replayParts
        : typeof message.content === "string"
          ? [{ text: message.content }]
          : message.content.flatMap(buildGooglePart),
  };
}

function buildGooglePart(content: LlmMessageContent): WireJsonValue[] {
  switch (content.type) {
    case "text":
      return [{ text: content.text }];
    case "image":
    case "audio":
    case "document":
      return [buildMediaPart(content.source)];
    case "video": {
      const part = asObject(buildMediaPart(content.source)) ?? {};
      if (content.metadata !== undefined) part.videoMetadata = content.metadata;
      return [part];
    }
    case "tool_use":
      return [
        {
          functionCall: {
            name: content.name,
            args: content.input,
          },
        },
      ];
    case "tool_result":
      return [
        {
          functionResponse: {
            name: content.toolUseId,
            response: {
              result:
                typeof content.content === "string"
                  ? content.content
                  : JSON.stringify(content.content),
              ...(content.isError ? { isError: true } : {}),
            },
          },
        },
      ];
  }
}

function buildMediaPart(source: JsonValue): JsonObject {
  if (typeof source === "string") {
    const dataUrl = parseDataUrl(source);
    return dataUrl
      ? { inlineData: { mimeType: dataUrl.contentType, data: dataUrl.data } }
      : { fileData: { mimeType: inferMimeType(source), fileUri: source } };
  }

  const sourceObject = asObject(source);
  const type = readString(sourceObject?.type);
  const contentType =
    readString(sourceObject?.media_type) ??
    readString(sourceObject?.mimeType) ??
    "application/octet-stream";
  const data = readString(sourceObject?.data);
  const uri =
    readString(sourceObject?.uri) ?? readString(sourceObject?.fileUri);
  if (type === "base64" || data) {
    return { inlineData: { mimeType: contentType, data: data ?? "" } };
  }
  if (type === "uri" || uri) {
    return { fileData: { mimeType: contentType, fileUri: uri ?? "" } };
  }
  return { inlineData: { mimeType: contentType, data: "" } };
}

function buildGenerationConfig(request: LlmRequest): JsonObject {
  const config: JsonObject = {
    maxOutputTokens: request.maxCompletionTokens ?? request.maxTokens ?? 8192,
    temperature: request.temperature ?? 1,
  };
  assignDefined(config, "topP", request.topP);
  assignDefined(config, "topK", request.topK);
  assignDefined(config, "presencePenalty", request.presencePenalty);
  assignDefined(config, "frequencyPenalty", request.frequencyPenalty);
  assignDefined(config, "seed", request.seed);
  if (request.stop) {
    config.stopSequences = Array.isArray(request.stop)
      ? request.stop
      : [request.stop];
  }

  const responseFormat = asObject(request.responseFormat);
  if (responseFormat?.type === "json_object") {
    config.responseMimeType = "application/json";
  } else if (responseFormat?.type === "json_schema") {
    const schemaContainer = asObject(responseFormat.json_schema);
    if (schemaContainer?.schema !== undefined) {
      config.responseMimeType = "application/json";
      config.responseSchema = convertGoogleSchema(schemaContainer.schema);
    }
  }
  if (request.logprobs) {
    config.responseLogprobs = true;
    assignDefined(config, "logprobs", request.topLogprobs);
  }

  const shouldIncludeThoughts =
    request.includeThoughts === true || request.thinkingEnabled === true;
  if (
    shouldIncludeThoughts ||
    request.thinkingBudget !== undefined ||
    request.thinkingLevel !== undefined ||
    request.reasoningEffort !== undefined
  ) {
    const thinkingConfig: JsonObject = {};
    if (shouldIncludeThoughts) thinkingConfig.includeThoughts = true;
    const level = (request.thinkingLevel ?? request.reasoningEffort)?.toLowerCase();
    if (request.model.includes("gemini-3") && level) {
      thinkingConfig.thinkingLevel = normalizeThinkingLevel(level);
    } else if (request.thinkingBudget !== undefined) {
      thinkingConfig.thinkingBudget = request.thinkingBudget;
    } else if (level) {
      thinkingConfig.thinkingBudget =
        level === "high" || level === "max" ? -1 : 1024;
    }
    config.thinkingConfig = thinkingConfig;
  }

  if (request.speechConfig !== undefined) config.speechConfig = request.speechConfig;
  if (request.responseModalities) config.responseModalities = request.responseModalities;
  if (request.mediaResolution) config.mediaResolution = request.mediaResolution;
  if (request.enableEnhancedCivicAnswers !== undefined) {
    config.enableEnhancedCivicAnswers = request.enableEnhancedCivicAnswers;
  }
  return config;
}

function buildGoogleTools(request: LlmRequest): JsonValue[] | undefined {
  const tools: JsonValue[] = [];
  if (request.tools?.length) {
    tools.push({
      functionDeclarations: request.tools.map((tool) => ({
        name: tool.function.name,
        ...(tool.function.description
          ? { description: tool.function.description }
          : {}),
        parameters: tool.function.parameters,
      })),
    });
  }
  if (request.enableCodeExecution) tools.push({ codeExecution: {} });
  if (request.webSearchEnabled) tools.push({ googleSearch: {} });
  return tools.length ? tools : undefined;
}

function buildGoogleToolConfig(
  choice: LlmToolChoice | undefined
): JsonValue | undefined {
  if (!choice) return undefined;
  if (choice === "auto") return { functionCallingConfig: { mode: "AUTO" } };
  if (choice === "none") return { functionCallingConfig: { mode: "NONE" } };
  if (choice === "required") return { functionCallingConfig: { mode: "ANY" } };
  return {
    functionCallingConfig: {
      mode: "ANY",
      allowedFunctionNames: [choice.function.name],
    },
  };
}

function mergeSafetySettings(custom: JsonValue[]): JsonValue[] {
  const settings = new Map<string, JsonValue>();
  for (const item of DEFAULT_SAFETY_SETTINGS) {
    const object = asObject(item);
    const category = readString(object?.category);
    if (category) settings.set(category, item);
  }
  for (const item of custom) {
    const object = asObject(item);
    const category = readString(object?.category);
    if (category) settings.set(category, item);
  }
  return [...settings.values()];
}

export async function parseGoogleGenerateContentResponse(
  response: WireResponse
): Promise<LlmResponse> {
  const text = await readWireResponseText(response);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Google GenerateContent response is not valid JSON");
  }
  return parseGoogleGenerateContentResponseValue(value);
}

export function parseGoogleGenerateContentResponseValue(
  value: unknown
): LlmResponse {
  const root = asObject(value);
  if (!root) throw new Error("Google GenerateContent response is not a JSON object");
  throwGoogleError(root);
  const candidate = asObject(readArray(root.candidates)?.[0]);
  if (!candidate) {
    const feedback = asObject(root.promptFeedback);
    const blockReason = readString(feedback?.blockReason);
    if (blockReason) throw new Error(`Google GenerateContent blocked: ${blockReason}`);
    throw new Error("Google GenerateContent response has no candidate");
  }

  const parts = readArray(asObject(candidate.content)?.parts) ?? [];
  const parsed = parseGoogleParts(parts);
  if (
    !parsed.content &&
    !parsed.reasoningContent &&
    !parsed.toolCalls.length &&
    !parsed.images.length &&
    !parsed.audios.length
  ) {
    throw new Error("Google GenerateContent response has no supported content");
  }
  const annotations = parseGroundingAnnotations(candidate.groundingMetadata);
  const metadata = compactMetadata({
    geminiParts: parts.length ? parts : undefined,
    logprobs: parseGoogleLogprobs(candidate.logprobsResult),
  });

  return {
    content: parsed.content,
    ...(parsed.reasoningContent
      ? { reasoningContent: parsed.reasoningContent }
      : {}),
    finishReason: mapGoogleFinishReason(readString(candidate.finishReason)),
    ...(parseGoogleUsage(root.usageMetadata)
      ? { usage: parseGoogleUsage(root.usageMetadata) }
      : {}),
    ...(parsed.toolCalls.length ? { toolCalls: parsed.toolCalls } : {}),
    ...(annotations.length ? { annotations } : {}),
    ...(parsed.images.length ? { images: parsed.images } : {}),
    ...(parsed.audios.length ? { audios: parsed.audios } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

interface ParsedGoogleParts {
  content: string;
  reasoningContent: string;
  toolCalls: LlmToolCall[];
  images: MediaAssetRef[];
  audios: MediaAssetRef[];
}

function parseGoogleParts(parts: JsonValue[]): ParsedGoogleParts {
  let content = "";
  let reasoningContent = "";
  const toolCalls: LlmToolCall[] = [];
  const images: MediaAssetRef[] = [];
  const audios: MediaAssetRef[] = [];

  for (const rawPart of parts) {
    const part = asObject(rawPart);
    if (!part) continue;
    const text = readString(part.text);
    if (text) {
      if (part.thought === true) reasoningContent += text;
      else content += text;
    }
    const functionCall = asObject(part.functionCall);
    const name = readString(functionCall?.name);
    if (functionCall && name) {
      toolCalls.push({
        id: readString(functionCall.id) ?? `call_${toolCalls.length}`,
        type: "function",
        function: {
          name,
          arguments: JSON.stringify(functionCall.args ?? {}),
        },
      });
    }
    const executableCode = asObject(part.executableCode);
    const code = readString(executableCode?.code);
    if (code) {
      content += `\n\`\`\`${(readString(executableCode?.language) ?? "").toLowerCase()}\n${code}\n\`\`\`\n`;
    }
    const executionResult = asObject(part.codeExecutionResult);
    const output = readString(executionResult?.output);
    if (output) content += `\n\`\`\`\n${output}\n\`\`\`\n`;

    const inlineData = asObject(part.inlineData);
    const data = readString(inlineData?.data);
    const contentType = readString(inlineData?.mimeType);
    if (data && contentType?.startsWith("image/")) {
      images.push({ kind: "inline-base64", data, contentType });
    } else if (data && contentType?.startsWith("audio/")) {
      audios.push({ kind: "inline-base64", data, contentType });
    }
  }
  return { content, reasoningContent, toolCalls, images, audios };
}

export function parseGoogleUsage(value: unknown): TokenUsage | undefined {
  const usage = asObject(value);
  if (!usage) return undefined;
  return {
    promptTokens: readNumber(usage.promptTokenCount) ?? 0,
    completionTokens: readNumber(usage.candidatesTokenCount) ?? 0,
    totalTokens: readNumber(usage.totalTokenCount) ?? 0,
    ...(readNumber(usage.cachedContentTokenCount) === undefined
      ? {}
      : {
          promptTokensDetails: {
            cachedTokens: readNumber(usage.cachedContentTokenCount),
          },
        }),
    ...(readNumber(usage.thoughtsTokenCount) === undefined
      ? {}
      : {
          completionTokensDetails: {
            reasoningTokens: readNumber(usage.thoughtsTokenCount),
          },
        }),
  };
}

export class GoogleGenerateContentStreamDecoder
  implements ProviderStreamDecoder
{
  private readonly decoder = new SseDataLineDecoder();
  private content = "";
  private reasoningContent = "";
  private finishReason: LlmResponse["finishReason"] = null;
  private usage: TokenUsage | undefined;
  private readonly toolCalls: LlmToolCall[] = [];
  private readonly replayParts: JsonValue[] = [];
  private annotations: LlmAnnotation[] = [];
  private readonly images: MediaAssetRef[] = [];
  private readonly audios: MediaAssetRef[] = [];
  private completed = false;

  push(chunk: Uint8Array): LlmStreamEvent[] {
    return this.decoder.push(chunk).flatMap((data) => this.consume(data));
  }

  finish(): LlmStreamEvent[] {
    const events = this.decoder.finish().flatMap((data) => this.consume(data));
    if (!this.completed) events.push(this.complete());
    return events;
  }

  private consume(data: string): LlmStreamEvent[] {
    if (!data || data === "[DONE]") return [];
    let value: unknown;
    try {
      value = JSON.parse(data);
    } catch {
      throw new Error("Google GenerateContent stream event is not valid JSON");
    }
    const root = asObject(value);
    if (!root) return [];
    throwGoogleError(root);
    const events: LlmStreamEvent[] = [];
    const usage = parseGoogleUsage(root.usageMetadata);
    if (usage) {
      this.usage = usage;
      events.push({ type: "usage", usage });
    }
    const candidate = asObject(readArray(root.candidates)?.[0]);
    if (!candidate) return events;
    const finishReason = readString(candidate.finishReason);
    if (finishReason) this.finishReason = mapGoogleFinishReason(finishReason);
    const annotations = parseGroundingAnnotations(candidate.groundingMetadata);
    if (annotations.length) this.annotations = annotations;
    const parts = readArray(asObject(candidate.content)?.parts) ?? [];
    this.replayParts.push(...parts);
    const parsed = parseGoogleParts(parts);
    if (parsed.reasoningContent) {
      this.reasoningContent += parsed.reasoningContent;
      events.push({ type: "reasoning-delta", delta: parsed.reasoningContent });
    }
    if (parsed.content) {
      this.content += parsed.content;
      events.push({ type: "text-delta", delta: parsed.content });
    }
    for (const toolCall of parsed.toolCalls) {
      const normalized = {
        ...toolCall,
        id: `call_${this.toolCalls.length}`,
      };
      this.toolCalls.push(normalized);
      events.push({ type: "tool-call", toolCall: normalized });
    }
    this.images.push(...parsed.images);
    this.audios.push(...parsed.audios);
    return events;
  }

  private complete(): LlmStreamEvent {
    this.completed = true;
    return {
      type: "completed",
      response: {
        content: this.content,
        ...(this.reasoningContent
          ? { reasoningContent: this.reasoningContent }
          : {}),
        finishReason: this.finishReason,
        ...(this.usage ? { usage: this.usage } : {}),
        ...(this.toolCalls.length ? { toolCalls: this.toolCalls } : {}),
        ...(this.annotations.length ? { annotations: this.annotations } : {}),
        ...(this.images.length ? { images: this.images } : {}),
        ...(this.audios.length ? { audios: this.audios } : {}),
        ...(this.replayParts.length
          ? { metadata: { geminiParts: this.replayParts } }
          : {}),
      },
    };
  }
}

function parseGroundingAnnotations(value: unknown): LlmAnnotation[] {
  const metadata = asObject(value);
  if (!metadata) return [];
  const chunks = readArray(metadata.groundingChunks) ?? [];
  const supports = readArray(metadata.groundingSupports) ?? [];
  const annotations: LlmAnnotation[] = [];

  if (supports.length) {
    for (const rawSupport of supports) {
      const support = asObject(rawSupport);
      const segment = asObject(support?.segment);
      for (const index of readNumberArray(support?.groundingChunkIndices)) {
        const web = asObject(asObject(chunks[index])?.web);
        const url = readString(web?.uri);
        if (!url) continue;
        annotations.push({
          type: "url_citation",
          url_citation: {
            start_index: readNumber(segment?.startIndex) ?? 0,
            end_index: readNumber(segment?.endIndex) ?? 0,
            url,
            title: readString(web?.title) ?? url,
          },
        });
      }
    }
  } else {
    for (const chunk of chunks) {
      const web = asObject(asObject(chunk)?.web);
      const url = readString(web?.uri);
      if (!url) continue;
      annotations.push({
        type: "url_citation",
        url_citation: {
          start_index: 0,
          end_index: 0,
          url,
          title: readString(web?.title) ?? url,
        },
      });
    }
  }
  return annotations;
}

function parseGoogleLogprobs(value: unknown): JsonValue | undefined {
  const root = asObject(value);
  const topCandidates = readArray(root?.topCandidates);
  if (!topCandidates?.length) return undefined;
  const content: JsonValue[] = [];
  for (const rawTopCandidate of topCandidates) {
    const candidates = readArray(asObject(rawTopCandidate)?.candidates) ?? [];
    const first = asObject(candidates[0]);
    if (!first) continue;
    content.push({
      token: readString(first.token) ?? "",
      logprob: readNumber(first.logProbability) ?? 0,
      bytes: null,
      topLogprobs: candidates.slice(0, 5).map((rawCandidate) => {
        const candidate = asObject(rawCandidate);
        return {
          token: readString(candidate?.token) ?? "",
          logprob: readNumber(candidate?.logProbability) ?? 0,
          bytes: null,
        };
      }),
    });
  }
  return content.length ? { content } : undefined;
}

function mapGoogleFinishReason(reason: string | undefined) {
  if (!reason) return null;
  const map: Record<string, LlmResponse["finishReason"]> = {
    STOP: "stop",
    MAX_TOKENS: "max_tokens",
    SAFETY: "content_filter",
    RECITATION: "content_filter",
    LANGUAGE: "content_filter",
    BLOCKLIST: "content_filter",
    PROHIBITED_CONTENT: "content_filter",
    SPII: "content_filter",
    IMAGE_SAFETY: "content_filter",
    MALFORMED_FUNCTION_CALL: "stop",
    OTHER: "stop",
  };
  return map[reason] ?? "stop";
}

function throwGoogleError(root: JsonObject): void {
  const error = asObject(root.error);
  if (error) {
    throw new Error(
      `Google GenerateContent Error: ${readString(error.message) ?? JSON.stringify(error)}`
    );
  }
}

function convertGoogleSchema(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(convertGoogleSchema);
  const object = asObject(value);
  if (!object) return value;
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(object)) {
    if (key === "type" && typeof item === "string") {
      result.type = item.toUpperCase();
    } else if (key === "properties" && asObject(item)) {
      const properties: JsonObject = {};
      for (const [property, schema] of Object.entries(asObject(item)!)) {
        properties[property] = convertGoogleSchema(schema);
      }
      result.properties = properties;
    } else {
      result[key] = convertGoogleSchema(item);
    }
  }
  return result;
}

function messageToSystemText(message: LlmMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((content) => content.type === "text")
    .map((content) => (content.type === "text" ? content.text : ""))
    .join("\n");
}

function normalizeThinkingLevel(level: string): string {
  if (["minimal", "low", "medium", "high"].includes(level)) return level;
  return level === "max" ? "high" : "low";
}

function parseDataUrl(value: string) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(value);
  return match ? { contentType: match[1], data: match[2] } : undefined;
}

function inferMimeType(value: string): string {
  const lower = value.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
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
  target: JsonObject,
  key: string,
  value: JsonValue | undefined
): void {
  if (value !== undefined) target[key] = value;
}

function compactMetadata(
  value: Record<string, JsonValue | undefined>
): Record<string, JsonValue> | undefined {
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) result[key] = item;
  }
  return Object.keys(result).length ? result : undefined;
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

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is number =>
          typeof item === "number" && Number.isInteger(item) && item >= 0
      )
    : [];
}

export const googleGenerateContentAdapter: ProviderAdapter = {
  id: "google-generate-content",
  buildRequest: buildGoogleGenerateContentRequest,
  parseResponse: parseGoogleGenerateContentResponse,
  createStreamDecoder: () => new GoogleGenerateContentStreamDecoder(),
};
