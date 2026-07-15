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
  LlmToolDefinition,
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
export type OpenAiResponsesBody = Record<string, WireJsonValue>;

export const OPENAI_RESPONSES_REPLAY_ITEMS_METADATA_KEY =
  "openaiResponsesReplayItems";
export const OPENAI_RESPONSES_OUTPUT_METADATA_KEY = "openaiResponsesOutput";
export const OPENAI_RESPONSES_ID_METADATA_KEY = "openaiResponsesId";

export function buildOpenAiResponsesUrl(profile: ProviderProfile): string {
  const customEndpoint =
    profile.endpoints?.responses ?? profile.endpoints?.chatCompletions;
  if (customEndpoint?.startsWith("http")) return customEndpoint;

  const host = profile.baseUrl.endsWith("/")
    ? profile.baseUrl
    : `${profile.baseUrl}/`;
  if (customEndpoint) {
    return `${host}${customEndpoint.replace(/^\//, "")}`;
  }

  const versionedHost =
    host.includes("/v1") ||
    host.includes("/v2") ||
    host.includes("/v3") ||
    host.includes("/api/v")
      ? host
      : `${host}v1/`;
  return `${versionedHost}responses`;
}

export function buildOpenAiResponsesRequest(
  profile: ProviderProfile,
  request: LlmRequest
): WireRequest {
  return {
    method: "POST",
    url: buildOpenAiResponsesUrl(profile),
    headers: {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
      ...profile.headers,
    },
    body: { kind: "json", value: buildOpenAiResponsesBody(request) },
    streaming: request.stream === true,
  };
}

export function buildOpenAiResponsesBody(
  request: LlmRequest
): OpenAiResponsesBody {
  const inputItems = request.messages.flatMap(buildResponsesInputItems);
  const instructions = request.messages
    .filter(
      (message) => message.role === "system" || message.role === "developer"
    )
    .map(messageToInstruction)
    .filter(Boolean)
    .join("\n\n");
  const input =
    inputItems.length === 1 &&
    isObject(inputItems[0]) &&
    inputItems[0].role === "user" &&
    typeof inputItems[0].content === "string"
      ? inputItems[0].content
      : inputItems;

  const body: OpenAiResponsesBody = {
    model: request.model,
    input,
    temperature: request.temperature ?? 1,
  };
  if (instructions) body.instructions = instructions;

  assignDefined(
    body,
    "max_output_tokens",
    request.maxCompletionTokens ?? request.maxTokens
  );
  assignDefined(body, "top_p", request.topP);
  if (request.tools?.length) body.tools = request.tools.map(buildResponsesTool);
  if (request.toolChoice !== undefined) {
    body.tool_choice = buildResponsesToolChoice(request.toolChoice);
  }
  assignDefined(body, "parallel_tool_calls", request.parallelToolCalls);
  if (request.responseFormat !== undefined) {
    body.text = { format: request.responseFormat };
  }
  if (request.reasoningEffort) {
    body.reasoning = { effort: request.reasoningEffort };
  }
  if (request.thinkingEnabled !== undefined) {
    body.thinking = {
      type: request.thinkingEnabled ? "enabled" : "disabled",
      ...(request.thinkingBudget !== undefined
        ? { budget_tokens: request.thinkingBudget }
        : {}),
    };
  }
  assignDefined(body, "modalities", request.modalities);
  assignDefined(body, "audio", request.audio);
  const include = new Set(request.include ?? []);
  if (request.store === false) include.add("reasoning.encrypted_content");
  if (include.size > 0) body.include = [...include];
  assignDefined(body, "store", request.store);
  assignDefined(body, "metadata", request.metadata);
  if (request.stop !== undefined) {
    body.truncation = request.stop === "auto" ? "auto" : "disabled";
  }

  Object.assign(body, request.extraBody, request.extensions);
  if (request.stream) body.stream = true;
  return body;
}

export async function parseOpenAiResponsesResponse(
  response: WireResponse
): Promise<LlmResponse> {
  const text = await readWireResponseText(response);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("OpenAI Responses response is not valid JSON");
  }
  return parseOpenAiResponsesResponseValue(value);
}

export function parseOpenAiResponsesResponseValue(value: unknown): LlmResponse {
  const root = asObject(value);
  if (!root) throw new Error("OpenAI Responses response is not a JSON object");

  const error = asObject(root.error);
  if (error) {
    throw new Error(
      `OpenAI Responses Error: ${readString(error.message) ?? JSON.stringify(error)}`
    );
  }

  let content = "";
  let reasoningContent = "";
  let refusal: string | null = null;
  const toolCalls: LlmToolCall[] = [];
  const annotations: LlmAnnotation[] = [];
  const images: MediaAssetRef[] = [];
  const output = readArray(root.output) ?? [];

  for (const rawItem of output) {
    const item = asObject(rawItem);
    if (!item) continue;

    if (item.type === "image_generation_call") {
      const data = readString(item.result);
      if (data) {
        images.push({
          kind: "inline-base64",
          data,
          contentType: "image/png",
          revisedPrompt: readString(item.revised_prompt),
        });
      }
      continue;
    }

    if (item.type === "function_call") {
      const toolCall = parseResponsesToolCall(item);
      if (toolCall) toolCalls.push(toolCall);
      continue;
    }

    for (const rawContent of readArray(item.content) ?? []) {
      const contentItem = asObject(rawContent);
      if (!contentItem) continue;
      if (contentItem.type === "output_text") {
        content += readString(contentItem.text) ?? "";
        annotations.push(...parseResponsesAnnotations(contentItem.annotations));
      } else if (
        contentItem.type === "reasoning_text" ||
        contentItem.type === "summary_text"
      ) {
        reasoningContent += readString(contentItem.text) ?? "";
      } else if (contentItem.type === "refusal") {
        refusal = readString(contentItem.refusal) ?? "";
      }
    }
  }

  if (!content) content = readString(root.output_text) ?? "";
  if (!content && images.length > 0) {
    content = `Generated ${images.length} images.`;
  }

  const metadata: Record<string, JsonValue> = {};
  const responseId = readString(root.id);
  if (responseId) metadata[OPENAI_RESPONSES_ID_METADATA_KEY] = responseId;
  if (isJsonValue(output)) {
    metadata[OPENAI_RESPONSES_OUTPUT_METADATA_KEY] = output;
  }

  return {
    content: refusal ? "" : content,
    ...(reasoningContent ? { reasoningContent } : {}),
    refusal,
    finishReason:
      toolCalls.length > 0
        ? "tool_calls"
        : root.status === "completed"
          ? "stop"
          : root.status === "incomplete"
            ? "length"
            : (readString(root.status) ?? null),
    ...(parseResponsesUsage(root.usage)
      ? { usage: parseResponsesUsage(root.usage) }
      : {}),
    ...(toolCalls.length ? { toolCalls } : {}),
    ...(annotations.length ? { annotations } : {}),
    ...(images.length ? { images } : {}),
    ...(Object.keys(metadata).length ? { metadata } : {}),
  };
}

export function parseResponsesUsage(value: unknown): TokenUsage | undefined {
  const usage = asObject(value);
  if (!usage) return undefined;
  const inputDetails = asObject(usage.input_tokens_details);
  const outputDetails = asObject(usage.output_tokens_details);
  return {
    promptTokens: readNumber(usage.input_tokens) ?? 0,
    completionTokens: readNumber(usage.output_tokens) ?? 0,
    totalTokens: readNumber(usage.total_tokens) ?? 0,
    ...(inputDetails
      ? {
          promptTokensDetails: {
            cachedTokens: readNumber(inputDetails.cached_tokens),
          },
        }
      : {}),
    ...(outputDetails
      ? {
          completionTokensDetails: {
            reasoningTokens: readNumber(outputDetails.reasoning_tokens),
          },
        }
      : {}),
  };
}

export class OpenAiResponsesStreamDecoder implements ProviderStreamDecoder {
  private readonly decoder = new SseDataLineDecoder();
  private content = "";
  private reasoningContent = "";
  private refusal: string | null = null;
  private completed = false;
  private finalResponse: LlmResponse | undefined;

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

      if (type === "error" || type === "response.failed") {
        const error =
          asObject(event.error) ?? asObject(asObject(event.response)?.error);
        throw new Error(
          `OpenAI Responses Error: ${readString(error?.message) ?? JSON.stringify(error ?? event)}`
        );
      }
      if (type === "response.output_text.delta") {
        const delta = readString(event.delta);
        if (delta) {
          this.content += delta;
          events.push({ type: "text-delta", delta });
        }
      } else if (
        type === "response.reasoning_text.delta" ||
        type === "response.reasoning_summary_text.delta"
      ) {
        const delta = readString(event.delta);
        if (delta) {
          this.reasoningContent += delta;
          events.push({ type: "reasoning-delta", delta });
        }
      } else if (type === "response.refusal.delta") {
        this.refusal = `${this.refusal ?? ""}${readString(event.delta) ?? ""}`;
      } else if (
        type === "response.image_generation_call.partial_image" &&
        readString(event.partial_image_b64)
      ) {
        events.push({
          type: "partial-image",
          index: readNumber(event.partial_image_index) ?? 0,
          asset: {
            kind: "inline-base64",
            data: readString(event.partial_image_b64)!,
            contentType: "image/png",
          },
        });
      } else if (type === "response.completed") {
        const response = parseOpenAiResponsesResponseValue(event.response);
        this.finalResponse = {
          ...response,
          content:
            response.content || response.refusal
              ? response.content
              : this.content,
          reasoningContent:
            response.reasoningContent || this.reasoningContent || undefined,
        };
        events.push(...this.complete());
      }
    }
    return events;
  }

  private complete(): LlmStreamEvent[] {
    if (this.completed) return [];
    this.completed = true;
    const response = this.finalResponse ?? {
      content: this.refusal ? "" : this.content,
      ...(this.reasoningContent
        ? { reasoningContent: this.reasoningContent }
        : {}),
      refusal: this.refusal,
      finishReason: null,
    };
    const events: LlmStreamEvent[] = [];
    if (response.usage) events.push({ type: "usage", usage: response.usage });
    for (const toolCall of response.toolCalls ?? []) {
      events.push({ type: "tool-call", toolCall });
    }
    events.push({ type: "completed", response });
    return events;
  }
}

export const openAiResponsesAdapter: ProviderAdapter = {
  id: "openai-responses",
  buildRequest: buildOpenAiResponsesRequest,
  parseResponse: parseOpenAiResponsesResponse,
  createStreamDecoder: () => new OpenAiResponsesStreamDecoder(),
};

function buildResponsesInputItems(message: LlmMessage): WireJsonValue[] {
  if (message.role === "system" || message.role === "developer") return [];

  const replayItems =
    message.metadata?.[OPENAI_RESPONSES_REPLAY_ITEMS_METADATA_KEY];
  if (message.role === "assistant" && Array.isArray(replayItems)) {
    return replayItems as WireJsonValue[];
  }

  if (typeof message.content === "string") {
    if (message.role === "tool" && message.toolCallId) {
      return [
        {
          type: "function_call_output",
          call_id: message.toolCallId,
          output: message.content,
        },
      ];
    }
    return [{ role: message.role, content: message.content }];
  }

  const messageContent: WireJsonValue[] = [];
  const standaloneItems: WireJsonValue[] = [];
  for (const content of message.content) {
    if (content.type === "tool_use") {
      standaloneItems.push({
        type: "function_call",
        call_id: content.id,
        name: content.name,
        arguments: JSON.stringify(content.input),
      });
    } else if (content.type === "tool_result") {
      standaloneItems.push({
        type: "function_call_output",
        call_id: content.toolUseId,
        output:
          typeof content.content === "string"
            ? content.content
            : JSON.stringify(content.content),
      });
    } else {
      const part = buildResponsesContentPart(content);
      if (part !== undefined) messageContent.push(part);
    }
  }

  return [
    ...(messageContent.length
      ? [{ role: message.role, content: messageContent }]
      : []),
    ...standaloneItems,
  ];
}

function buildResponsesContentPart(
  content: Exclude<LlmMessageContent, { type: "tool_use" | "tool_result" }>
): WireJsonValue | undefined {
  if (content.type === "text") {
    return { type: "input_text", text: content.text };
  }
  if (content.type === "image") {
    const imageUrl = sourceToDataUrl(content.source);
    return imageUrl ? { type: "input_image", image_url: imageUrl } : undefined;
  }
  if (content.type === "document") {
    return buildResponsesFilePart(content.source);
  }
  if (content.type === "audio") {
    return { type: "input_audio", input_audio: content.source };
  }
  return { type: "input_video", input_video: content.source };
}

function buildResponsesFilePart(source: JsonValue): WireJsonValue | undefined {
  const value = asObject(source);
  if (!value) return undefined;
  if (typeof value.file_url === "string") {
    return { type: "input_file", file_url: value.file_url };
  }
  if (typeof value.file_id === "string") {
    return { type: "input_file", file_id: value.file_id };
  }
  if (typeof value.file_data === "string") {
    return {
      type: "input_file",
      filename: readString(value.filename) ?? "document.pdf",
      file_data: sourceToDataUrl(value) ?? value.file_data,
    };
  }
  const dataUrl = sourceToDataUrl(value);
  return dataUrl
    ? {
        type: "input_file",
        filename: readString(value.filename) ?? "document.pdf",
        file_data: dataUrl,
      }
    : undefined;
}

function buildResponsesTool(tool: LlmToolDefinition): WireJsonValue {
  return {
    type: "function",
    name: tool.function.name,
    ...(tool.function.description
      ? { description: tool.function.description }
      : {}),
    parameters: tool.function.parameters,
    ...(tool.function.strict !== undefined
      ? { strict: tool.function.strict }
      : {}),
  };
}

function buildResponsesToolChoice(choice: LlmToolChoice): WireJsonValue {
  if (typeof choice === "string") return choice;
  return { type: "function", name: choice.function.name };
}

function messageToInstruction(message: LlmMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((content) =>
      content.type === "text" ? content.text : JSON.stringify(content)
    )
    .join("\n");
}

function sourceToDataUrl(source: JsonValue): string | undefined {
  if (typeof source === "string") return source;
  const value = asObject(source);
  if (!value) return undefined;
  const url = readString(value.url) ?? readString(value.file_url);
  if (url) return url;
  const data = readString(value.data) ?? readString(value.file_data);
  if (!data) return undefined;
  if (data.startsWith("data:")) return data;
  const mediaType =
    readString(value.media_type) ??
    readString(value.mime_type) ??
    "application/octet-stream";
  return `data:${mediaType};base64,${data}`;
}

function parseResponsesToolCall(item: JsonObject): LlmToolCall | undefined {
  const name = readString(item.name);
  if (!name) return undefined;
  return {
    id: readString(item.call_id) ?? readString(item.id) ?? "",
    type: "function",
    function: {
      name,
      arguments: readString(item.arguments) ?? "",
    },
  };
}

function parseResponsesAnnotations(value: unknown): LlmAnnotation[] {
  const result: LlmAnnotation[] = [];
  for (const rawAnnotation of readArray(value) ?? []) {
    const annotation = asObject(rawAnnotation);
    const type = readString(annotation?.type);
    if (!annotation || !type || !isJsonValue(annotation)) continue;
    result.push({ type, ...annotation });
  }
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

function assignDefined(
  target: OpenAiResponsesBody,
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

function isObject(value: unknown): value is JsonObject {
  return asObject(value) !== undefined;
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
