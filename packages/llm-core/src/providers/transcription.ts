import type { ProviderProfile } from "../types/provider";
import type {
  TranscriptionProviderAdapter,
  TranscriptionRequest,
  TranscriptionResponse,
} from "../types/transcription";
import type { MultipartPart } from "../types/transport";
import { readWireResponseBytes } from "../utils/wire-response";

/**
 * OpenAI-style `/v1/audio/transcriptions` adapter. The request is sent as
 * `multipart/form-data` with a `model` text part and the audio as the `file`
 * part, matching the Whisper convention used by audio.cpp and compatible STT
 * servers. The response may be plain text or a JSON object with a `text`
 * field (and optional `segments` for `verbose_json`).
 */
export const openAiTranscriptionAdapter: TranscriptionProviderAdapter = {
  id: "openai-audio-transcriptions",
  buildRequest(profile, request) {
    const headers = buildBearerHeaders(profile);
    // Let the transport set the multipart boundary itself.
    deleteHeader(headers, "content-type");

    const parts: MultipartPart[] = [textPart("model", request.model)];
    addOptionalText(parts, "language", request.language);
    addOptionalText(parts, "prompt", request.prompt);
    addOptionalNumber(parts, "temperature", request.temperature);
    addOptionalText(parts, "response_format", request.responseFormat);

    const filePart = audioFilePart(request);
    if (filePart) parts.push(filePart);

    return {
      method: "POST",
      url: buildEndpointUrl(
        profile,
        "audio/transcriptions",
        "audioTranscriptions"
      ),
      headers,
      body: { kind: "multipart", parts },
      streaming: false,
    };
  },
  async parseResponse(response, _request) {
    const text = new TextDecoder().decode(
      await readWireResponseBytes(response)
    );
    const trimmed = text.trim();
    if (!trimmed) return { text: "" };

    // Plain-text transcripts are the common default (audio.cpp returns the
    // raw transcript). JSON payloads (Whisper `json`/`verbose_json`) carry a
    // `text` field and may include segments.
    if (isJsonResponse(response, trimmed)) {
      try {
        return parseJsonTranscript(JSON.parse(trimmed));
      } catch {
        return { text: trimmed, raw: trimmed };
      }
    }
    return { text: trimmed, raw: trimmed };
  },
};

function parseJsonTranscript(value: unknown): TranscriptionResponse {
  const root = asRecord(value);
  const text = readString(root.text) ?? readString(root.output_text) ?? "";
  const result: TranscriptionResponse = {
    text,
    raw: value,
  };
  const language = readString(root.language);
  if (language !== undefined) result.language = language;
  const duration = readNumber(root.duration);
  if (duration !== undefined) result.duration = duration;
  const rawSegments = readArray(root.segments);
  if (rawSegments.length > 0) {
    result.segments = rawSegments.flatMap((raw) => {
      const segment = asRecord(raw);
      const textValue = readString(segment.text);
      if (textValue === undefined) return [];
      return [
        {
          id: readNumber(segment.id),
          start: readNumber(segment.start),
          end: readNumber(segment.end),
          text: textValue,
        },
      ];
    });
  }
  return result;
}

function audioFilePart(
  request: TranscriptionRequest
): MultipartPart | undefined {
  const input = request.audio;
  const common = {
    name: "file",
    filename: input.filename ?? "audio.bin",
    contentType: audioContentType(input),
  };
  switch (input.source.kind) {
    case "local-file":
      return { ...common, body: { kind: "file-ref", ref: input.source.ref } };
    case "bytes":
      return { ...common, body: { kind: "bytes", value: input.source.data } };
    case "inline-base64":
      return {
        ...common,
        body: { kind: "bytes", value: decodeBase64(input.source.data) },
      };
    case "remote-url":
      return { ...common, body: { kind: "text", value: input.source.url } };
  }
}

function audioContentType(input: TranscriptionRequest["audio"]): string {
  if (input.source.kind === "remote-url") {
    return "application/octet-stream";
  }
  const contentType =
    input.source.kind === "local-file"
      ? input.source.ref.contentType
      : input.source.contentType;
  return contentType ?? "application/octet-stream";
}

function buildEndpointUrl(
  profile: ProviderProfile,
  endpoint: string,
  endpointKey: string
): string {
  const custom = profile.endpoints?.[endpointKey];
  if (custom) {
    if (/^https?:\/\//i.test(custom)) return custom;
    return joinUrl(profile.baseUrl, custom);
  }
  const base = profile.baseUrl.replace(/\/+$/, "");
  const versioned = /\/v\d+(?:beta)?$/i.test(base) ? base : `${base}/v1`;
  return `${versioned}/${endpoint}`;
}

function buildBearerHeaders(profile: ProviderProfile): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
    ...profile.headers,
  };
}

function joinUrl(baseUrl: string, endpoint: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

function textPart(name: string, value: string): MultipartPart {
  return { name, body: { kind: "text", value } };
}

function addOptionalText(
  parts: MultipartPart[],
  name: string,
  value: string | undefined
) {
  if (value !== undefined) parts.push(textPart(name, value));
}

function addOptionalNumber(
  parts: MultipartPart[],
  name: string,
  value: number | undefined
) {
  if (value !== undefined) parts.push(textPart(name, String(value)));
}

function deleteHeader(headers: Record<string, string>, target: string) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) delete headers[key];
  }
}

function isJsonResponse(
  response: { headers: Record<string, string> },
  trimmedBody: string
): boolean {
  const contentType = (
    response.headers["content-type"] ??
    response.headers["Content-Type"] ??
    ""
  ).toLowerCase();
  if (contentType.includes("application/json")) return true;
  if (contentType.includes("text/plain")) return false;
  return trimmedBody.startsWith("{") || trimmedBody.startsWith("[");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function decodeBase64(value: string): Uint8Array {
  const payload = value.includes(",")
    ? value.slice(value.indexOf(",") + 1)
    : value;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
