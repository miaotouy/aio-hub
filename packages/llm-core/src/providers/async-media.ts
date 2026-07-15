import type { JsonValue, WireJsonValue } from "../types/json";
import type {
  AsyncMediaRequest,
  AsyncMediaTaskAdapter,
  AsyncMediaTaskSnapshot,
  AsyncMediaTaskStatus,
} from "../types/async-media";
import type { MediaInputSource } from "../types/media";
import type { ProviderProfile } from "../types/provider";
import type { MediaAssetRef } from "../types/response";
import type { WireRequest } from "../types/transport";
import {
  readWireResponseBytes,
  readWireResponseJson,
} from "../utils/wire-response";

export const openAiVideoTaskAdapter: AsyncMediaTaskAdapter = {
  id: "openai-video-task",
  buildCreateRequest(profile, request) {
    const apiStyle = readString(request.parameters?.apiStyle) ?? "openai";
    const endpoint = apiStyle === "ark" ? "contents/generations/tasks" : "videos";
    const endpointKey = apiStyle === "ark" ? "arkVideos" : "videos";
    const body =
      apiStyle === "ark"
        ? buildArkVideoBody(request)
        : buildOpenAiVideoBody(request, apiStyle === "agnes");
    return jsonRequest(
      "POST",
      buildEndpointUrl(profile, endpoint, endpointKey),
      buildBearerHeaders(profile),
      body
    );
  },
  async parseCreateResponse(response, request) {
    return parseOpenAiVideoTask(
      await readWireResponseJson(response),
      request,
      undefined
    );
  },
  buildPollRequest(profile, request, task) {
    const apiStyle = readString(request.parameters?.apiStyle) ?? "openai";
    const endpoint =
      apiStyle === "ark"
        ? `contents/generations/tasks/${encodeURIComponent(task.id)}`
        : `videos/${encodeURIComponent(task.id)}`;
    return {
      method: "GET",
      url: buildEndpointUrl(profile, endpoint, "videoStatus", {
        video_id: task.id,
      }),
      headers: buildBearerHeaders(profile),
      streaming: false,
    };
  },
  async parsePollResponse(response, request, previous) {
    return parseOpenAiVideoTask(
      await readWireResponseJson(response),
      request,
      previous.id
    );
  },
  buildResultRequests(profile, request, task) {
    const apiStyle = readString(request.parameters?.apiStyle) ?? "openai";
    if (apiStyle === "ark" || task.assets?.length) return [];
    return [
      {
        method: "GET",
        url: buildEndpointUrl(
          profile,
          `videos/${encodeURIComponent(task.id)}/content`,
          "videoContent",
          { video_id: task.id }
        ),
        headers: buildBearerHeaders(profile),
        streaming: false,
      },
    ];
  },
  async parseResultResponses(responses, _request, task) {
    const bytes = await readWireResponseBytes(responses[0]);
    return {
      ...task,
      assets: [
        {
          kind: "inline-base64",
          data: encodeBase64(bytes),
          contentType: responses[0].headers["content-type"] ?? "video/mp4",
        },
      ],
    };
  },
};

export const geminiVideoTaskAdapter: AsyncMediaTaskAdapter = {
  id: "gemini-video-task",
  buildCreateRequest(profile, request) {
    const model = encodeURIComponent(request.model);
    return jsonRequest(
      "POST",
      buildEndpointUrl(
        { ...profile, provider: "gemini" },
        `models/${model}:predictLongRunning`,
        "predictLongRunning"
      ),
      buildGeminiHeaders(profile),
      {
        instances: [{ prompt: request.prompt }],
        parameters: compact({
          ...asWireRecord(request.parameters?.providerParameters),
          aspectRatio: request.parameters?.aspectRatio,
          resolution: request.parameters?.resolution,
          durationSeconds: request.parameters?.durationSeconds,
          negativePrompt: request.parameters?.negativePrompt,
          seed: request.parameters?.seed,
          promptEnhancement: request.parameters?.promptEnhancement,
          safetySetting: request.parameters?.safetySetting,
        }),
      }
    );
  },
  async parseCreateResponse(response) {
    return parseGeminiVideoOperation(await readWireResponseJson(response));
  },
  buildPollRequest(profile, _request, task) {
    return {
      method: "GET",
      url: buildEndpointUrl(
        { ...profile, provider: "gemini" },
        task.id,
        "operation",
        { operation_name: task.id }
      ),
      headers: buildGeminiHeaders(profile),
      streaming: false,
    };
  },
  async parsePollResponse(response) {
    return parseGeminiVideoOperation(await readWireResponseJson(response));
  },
};

export const sunoMusicTaskAdapter: AsyncMediaTaskAdapter = {
  id: "suno-music-task",
  buildCreateRequest(profile, request) {
    return jsonRequest(
      "POST",
      buildEndpointUrl(profile, "suno/submit/music", "submitMusic", undefined, false),
      buildBearerHeaders(profile),
      asWireRecord(request.parameters?.body) ?? {}
    );
  },
  async parseCreateResponse(response) {
    const root = asRecord(normalizeJson(await readWireResponseJson(response)));
    if (readString(root.code)?.toLowerCase() !== "success") {
      throw new Error(readString(root.message) ?? "Suno task submission failed");
    }
    const id = readString(root.data);
    if (!id) throw new Error("Suno task submission did not return a task id");
    return { id, status: "queued", progress: 0 };
  },
  buildPollRequest(profile, _request, task) {
    return {
      method: "GET",
      url: buildEndpointUrl(
        profile,
        `suno/fetch/${encodeURIComponent(task.id)}`,
        "fetchTask",
        { task_id: task.id },
        false
      ),
      headers: buildBearerHeaders(profile),
      streaming: false,
    };
  },
  async parsePollResponse(response, _request, previous) {
    const root = asRecord(normalizeJson(await readWireResponseJson(response)));
    const data = asRecord(root.data);
    const rawStatus = readString(data.status) ?? "PENDING";
    const status = normalizeSunoStatus(rawStatus);
    const progress = parsePercentage(readString(data.progress));
    const { assets, clipIds } = extractSunoClips(data.data);
    const clips =
      data.data === undefined
        ? undefined
        : Array.isArray(data.data)
          ? data.data
          : [data.data];
    return {
      id: previous.id,
      status,
      progress,
      assets,
      error: status === "failed" ? readString(data.fail_reason) : undefined,
      metadata:
        clipIds.length || clips
          ? compactJson({
              clipIds: clipIds.length ? clipIds : undefined,
              clips,
            })
          : undefined,
    };
  },
  buildResultRequests(profile, _request, task) {
    if (task.assets?.length) return [];
    const clipIds = readStringArray(task.metadata?.clipIds) ?? [];
    return clipIds.map((clipId) => ({
      method: "GET" as const,
      url: buildEndpointUrl(
        profile,
        `suno/feed/${encodeURIComponent(clipId)}`,
        "feed",
        { clip_id: clipId },
        false
      ),
      headers: buildBearerHeaders(profile),
      streaming: false,
    }));
  },
  async parseResultResponses(responses, _request, task) {
    const assets: MediaAssetRef[] = [];
    const clips: JsonValue[] = [];
    for (const response of responses) {
      const value = normalizeJson(await readWireResponseJson(response));
      const entries = Array.isArray(value) ? value : [value];
      for (const entry of entries) {
        const clip = asRecord(entry);
        const url =
          readString(clip.audio_url) ??
          readString(clip.audioUrl) ??
          readString(clip.url);
        if (url) assets.push({ kind: "remote-url", url, contentType: "audio/mpeg" });
        clips.push(entry);
      }
    }
    return {
      ...task,
      assets,
      metadata: { ...task.metadata, clips },
    };
  },
};

export const minimaxMusicTaskAdapter: AsyncMediaTaskAdapter = {
  id: "minimax-music-task",
  buildCreateRequest(profile, request) {
    return jsonRequest(
      "POST",
      buildEndpointUrl(profile, "v1/music_generation", "musicGeneration", undefined, false),
      buildBearerHeaders(profile),
      asWireRecord(request.parameters?.body) ?? {}
    );
  },
  async parseCreateResponse(response, request) {
    const root = asRecord(normalizeJson(await readWireResponseJson(response)));
    const baseResponse = asRecord(root.base_resp);
    const statusCode = readNumber(baseResponse.status_code);
    if (statusCode !== undefined && statusCode !== 0) {
      throw new Error(
        `MiniMax Music API error ${statusCode}: ${readString(baseResponse.status_msg) ?? "request failed"}`
      );
    }
    const data = asRecord(root.data);
    if (readNumber(data.status) === 1) {
      return {
        id: readString(root.trace_id) ?? "minimax-immediate",
        status: "failed",
        error: readString(data.error_message) ?? "MiniMax music generation failed",
      };
    }
    const audio = readString(data.audio_url) ?? readString(data.audio);
    const outputFormat = readString(request.parameters?.outputFormat) ?? "hex";
    const assets: MediaAssetRef[] = [];
    if (audio) {
      if (outputFormat === "url") {
        assets.push({ kind: "remote-url", url: audio, contentType: "audio/mpeg" });
      } else {
        assets.push({
          kind: "inline-base64",
          data: hexToBase64(audio),
          contentType: `audio/${readString(request.parameters?.audioFormat) ?? "mp3"}`,
        });
      }
    }
    const extraInfo = asRecord(root.extra_info);
    const durationMs = readNumber(extraInfo.music_duration);
    return {
      id: readString(root.trace_id) ?? "minimax-immediate",
      status: "succeeded",
      progress: 100,
      assets,
      metadata: compactJson({
        duration:
          durationMs !== undefined ? durationMs / 1000 : readNumber(data.duration),
        lyrics: root.lyrics,
        subtitle: data.subtitle_file,
        extraInfo: root.extra_info,
      }),
    };
  },
  buildPollRequest() {
    throw new Error("MiniMax music generation completes in the create response");
  },
  async parsePollResponse() {
    throw new Error("MiniMax music generation does not use polling");
  },
};

function parseOpenAiVideoTask(
  value: unknown,
  request: AsyncMediaRequest,
  fallbackId?: string
): AsyncMediaTaskSnapshot {
  const root = asRecord(normalizeJson(value));
  const data = asRecord(root.data);
  const id =
    firstString([
      root.id,
      root.task_id,
      root.taskId,
      root.video_id,
      root.videoId,
      data.id,
      data.task_id,
      data.taskId,
      data.video_id,
      data.videoId,
    ]) ?? fallbackId;
  if (!id) throw new Error("Video generation did not return a task id");
  const rawStatus = (firstString([root.status, data.status]) ?? "").toLowerCase();
  const url = extractVideoUrl(root);
  const apiStyle = readString(request.parameters?.apiStyle) ?? "openai";
  const status = normalizeVideoStatus(rawStatus, Boolean(url), apiStyle);
  const assets = url
    ? [{ kind: "remote-url" as const, url, contentType: "video/mp4" }]
    : undefined;
  return {
    id,
    status,
    progress: status === "succeeded" ? 100 : readNumber(root.progress),
    assets,
    error: status === "failed" ? extractError(root) : undefined,
    metadata: compactJson({
      thumbnailUrl: extractThumbnailUrl(root),
      raw: root,
    }),
  };
}

function parseGeminiVideoOperation(value: unknown): AsyncMediaTaskSnapshot {
  const root = asRecord(normalizeJson(value));
  const id = readString(root.name);
  if (!id) throw new Error("Gemini video operation did not return a name");
  const error = asRecord(root.error);
  if (Object.keys(error).length > 0) {
    return {
      id,
      status: "failed",
      error: readString(error.message) ?? "Gemini video generation failed",
    };
  }
  if (root.done !== true) return { id, status: "running" };
  const response = asRecord(root.response);
  const generated = asRecord(response.generateVideoResponse);
  const assets = readArray(generated.generatedSamples).flatMap((sample) => {
    const video = asRecord(asRecord(sample).video);
    const url = readString(video.uri);
    return url ? [{ kind: "remote-url" as const, url, contentType: "video/mp4" }] : [];
  });
  return { id, status: "succeeded", progress: 100, assets };
}

function buildOpenAiVideoBody(
  request: AsyncMediaRequest,
  isAgnes: boolean
): WireJsonValue {
  const parameters = request.parameters ?? {};
  const providerParameters = asWireRecord(parameters.providerParameters) ?? {};
  const body: Record<string, WireJsonValue> = {
    model: request.model,
    prompt: request.prompt,
    size: readString(parameters.size) ?? "1280x720",
    seconds: String(readNumber(parameters.durationSeconds) ?? 8),
    ...providerParameters,
  };
  if (isAgnes) {
    const images = (request.inputs ?? [])
      .filter((input) => input.type === "image" || input.type === "mask")
      .map((input) => mediaSourceToWire(input.source));
    if (images.length) {
      body.extra_body = {
        ...asWireRecord(body.extra_body),
        image: images,
      };
    }
  }
  return body;
}

function buildArkVideoBody(request: AsyncMediaRequest): WireJsonValue {
  const parameters = request.parameters ?? {};
  const flags: string[] = [];
  const addFlag = (name: string, value: JsonValue | undefined) => {
    if (value !== undefined && value !== null && value !== "") {
      flags.push(`--${name} ${String(value)}`);
    }
  };
  addFlag("ratio", parameters.aspectRatio);
  addFlag("resolution", parameters.resolution);
  addFlag("duration", parameters.durationSeconds ?? 8);
  if (parameters.seed !== -1) addFlag("seed", parameters.seed);
  addFlag("audio", parameters.generateAudio);
  addFlag("watermark", parameters.watermark);
  addFlag("camerafixed", parameters.cameraFixed);
  const content: WireJsonValue[] = [
    { type: "text", text: [request.prompt.trim(), ...flags].filter(Boolean).join(" ") },
  ];
  for (const input of request.inputs ?? []) {
    if (input.type !== "image" && input.type !== "mask") continue;
    content.push({
      type: "image_url",
      image_url: { url: mediaSourceToWire(input.source) },
    });
  }
  return { model: request.model, content };
}

function normalizeVideoStatus(
  status: string,
  hasAsset: boolean,
  apiStyle: string
): AsyncMediaTaskStatus {
  if (hasAsset || ["completed", "succeeded", "success", "done"].includes(status)) {
    return "succeeded";
  }
  if (["failed", "expired", "error"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  if (["in_progress", "processing", "running"].includes(status)) return "running";
  if (["queued", "pending", "created"].includes(status)) return "queued";
  return apiStyle === "ark" ? "queued" : "succeeded";
}

function normalizeSunoStatus(status: string): AsyncMediaTaskStatus {
  const normalized = status.toUpperCase();
  if (normalized === "SUCCESS") return "succeeded";
  if (normalized === "FAILURE") return "failed";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "cancelled";
  return normalized === "SUBMITTED" ? "queued" : "running";
}

function extractSunoClips(value: JsonValue | undefined): {
  assets: MediaAssetRef[];
  clipIds: string[];
} {
  const entries = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const assets: MediaAssetRef[] = [];
  const clipIds: string[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      clipIds.push(entry);
      continue;
    }
    const clip = asRecord(entry);
    const id = readString(clip.id);
    if (id) clipIds.push(id);
    const url = readString(clip.audio_url) ?? readString(clip.audioUrl) ?? readString(clip.url);
    if (url) assets.push({ kind: "remote-url", url, contentType: "audio/mpeg" });
  }
  return { assets, clipIds };
}

function extractVideoUrl(root: Record<string, JsonValue>): string | undefined {
  const data = asRecord(root.data);
  const content = asRecord(root.content);
  const dataContent = asRecord(data.content);
  const output = asRecord(root.output);
  const result = asRecord(root.result);
  return firstUrl([
    content.video_url,
    content.videoUrl,
    root.video_url,
    root.videoUrl,
    root.remixed_from_video_id,
    root.remixedFromVideoId,
    root.url,
    output.video_url,
    output.videoUrl,
    result.video_url,
    result.videoUrl,
    dataContent.video_url,
    dataContent.videoUrl,
    data.video_url,
    data.videoUrl,
    data.url,
    readArray(root.videos)[0],
    readArray(data.videos)[0],
  ]);
}

function extractThumbnailUrl(root: Record<string, JsonValue>): string | undefined {
  const data = asRecord(root.data);
  const content = asRecord(root.content);
  const dataContent = asRecord(data.content);
  return firstUrl([
    content.image_url,
    content.imageUrl,
    root.thumbnail_url,
    root.thumbnailUrl,
    dataContent.image_url,
    dataContent.imageUrl,
  ]);
}

function extractError(root: Record<string, JsonValue>): string | undefined {
  const error = asRecord(root.error);
  const dataError = asRecord(asRecord(root.data).error);
  return firstString([
    error.message,
    error.msg,
    error.code,
    dataError.message,
    dataError.msg,
    dataError.code,
  ]);
}

function buildEndpointUrl(
  profile: ProviderProfile,
  endpoint: string,
  endpointKey: string,
  pathParameters?: Record<string, string>,
  addVersion = true
): string {
  let custom = profile.endpoints?.[endpointKey];
  if (custom) {
    for (const [key, value] of Object.entries(pathParameters ?? {})) {
      custom = custom.replace(`{${key}}`, encodeURIComponent(value));
    }
    return /^https?:\/\//i.test(custom)
      ? custom
      : joinUrl(profile.baseUrl, custom);
  }
  const base = profile.baseUrl.replace(/\/+$/, "");
  if (profile.provider === "gemini") {
    const versioned = /\/v1(?:beta)?$/i.test(base) ? base : `${base}/v1beta`;
    const url = joinUrl(versioned, endpoint);
    return profile.apiKey
      ? `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(profile.apiKey)}`
      : url;
  }
  if (!addVersion) return joinUrl(base, endpoint);
  const versioned = /\/v\d+(?:beta)?$/i.test(base) ? base : `${base}/v1`;
  return joinUrl(versioned, endpoint);
}

function buildBearerHeaders(profile: ProviderProfile): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
    ...profile.headers,
  };
}

function buildGeminiHeaders(profile: ProviderProfile): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(profile.apiKey ? { "x-goog-api-key": profile.apiKey } : {}),
    ...profile.headers,
  };
}

function jsonRequest(
  method: "POST" | "PUT" | "PATCH",
  url: string,
  headers: Record<string, string>,
  value: WireJsonValue
): WireRequest {
  return { method, url, headers, body: { kind: "json", value }, streaming: false };
}

function mediaSourceToWire(source: MediaInputSource): WireJsonValue {
  if (source.kind === "remote-url") return source.url;
  if (source.kind === "local-file") return source.ref;
  const data = source.kind === "bytes" ? encodeBase64(source.data) : source.data;
  return `data:${source.contentType};base64,${data}`;
}

function firstUrl(values: Array<JsonValue | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    const url = readString(asRecord(value).url);
    if (url) return url;
  }
  return undefined;
}

function firstString(values: Array<JsonValue | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function parsePercentage(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compact(
  value: Record<string, WireJsonValue | undefined>
): Record<string, WireJsonValue> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, WireJsonValue] => entry[1] !== undefined)
  );
}

function compactJson(
  value: Record<string, JsonValue | undefined>
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
  );
}

function joinUrl(base: string, endpoint: string): string {
  return `${base.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

function normalizeJson(value: unknown): JsonValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return value as JsonValue;
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeJson(item)])
    );
  }
  return null;
}

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function asWireRecord(
  value: WireJsonValue | undefined
): Record<string, WireJsonValue> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, WireJsonValue>)
    : undefined;
}

function readArray(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readStringArray(value: JsonValue | undefined): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function readNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    binary += String.fromCharCode(...value.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function hexToBase64(hex: string): string {
  const normalized = hex.trim().replace(/^0x/i, "");
  if (normalized.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(normalized)) {
    throw new Error("MiniMax returned invalid hex audio data");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return encodeBase64(bytes);
}
