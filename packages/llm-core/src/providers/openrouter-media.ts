import type { JsonValue, WireJsonValue } from "../types/json";
import type {
  AsyncMediaTaskAdapter,
  AsyncMediaTaskSnapshot,
} from "../types/async-media";
import type {
  MediaInput,
  MediaInputSource,
  SyncMediaProviderAdapter,
} from "../types/media";
import type { ProviderProfile } from "../types/provider";
import type { MediaAssetRef } from "../types/response";
import type { WireRequest } from "../types/transport";
import { readWireResponseJson } from "../utils/wire-response";
import { openAiAudioAdapter } from "./sync-media";
import { openAiVideoTaskAdapter } from "./async-media";

/** Keep the gateway protocol when model routing remaps the provider identity. */
export function isOpenRouterProfile(profile: {
  provider?: string;
  type?: string;
  channelType?: string;
  baseUrl: string;
}): boolean {
  if (
    profile.provider === "openrouter" ||
    profile.type === "openrouter" ||
    profile.channelType === "openrouter"
  )
    return true;
  try {
    return new URL(profile.baseUrl).hostname === "openrouter.ai";
  } catch {
    return false;
  }
}

export const openRouterImageAdapter: SyncMediaProviderAdapter = {
  id: "openrouter-image",
  buildRequest(profile, request) {
    if (request.mask)
      throw new Error(
        "OpenRouter image generation does not support masks. Choose a model/channel with an image-editing endpoint."
      );
    const extensions = request.extensions ?? {};
    const outputFormat = extensions.output_format ?? request.responseFormat;
    const explicitSize = /^\d+x\d+$/i.test(request.size ?? "");
    const resolution = extensions.resolution;
    const quality =
      request.quality === "standard"
        ? "auto"
        : request.quality === "hd"
          ? "high"
          : request.quality;
    return jsonRequest(profile, "images", "imagesGenerations", {
      ...pick(extensions, [
        "provider",
        "background",
        "user",
        "session_id",
        "trace",
        "output_compression",
      ]),
      model: request.model,
      prompt: request.prompt,
      n: request.count,
      size: request.size,
      quality:
        quality &&
        ["auto", "low", "medium", "high", "xhigh", "max"].includes(quality)
          ? quality
          : undefined,
      resolution:
        !explicitSize &&
        typeof resolution === "string" &&
        ["512", "768", "1K", "1.5K", "2K", "4K"].includes(resolution)
          ? resolution
          : undefined,
      aspect_ratio: explicitSize
        ? undefined
        : (request.aspectRatio ?? extensions.aspect_ratio),
      seed:
        request.seed !== undefined && request.seed >= 0
          ? request.seed
          : undefined,
      output_format:
        typeof outputFormat === "string" &&
        ["png", "jpeg", "webp", "svg"].includes(outputFormat)
          ? outputFormat
          : undefined,
      input_references: references(request.inputs, "image"),
      stream: false,
    });
  },
  async parseResponse(response, request) {
    const imageMimeTypes: Record<string, string> = {
      png: "image/png",
      jpeg: "image/jpeg",
      webp: "image/webp",
      svg: "image/svg+xml",
    };
    const outputFormat =
      request.extensions?.output_format ?? request.responseFormat;
    const fallbackMime =
      typeof outputFormat === "string"
        ? (imageMimeTypes[outputFormat] ?? "image/png")
        : "image/png";
    const root = record(await readWireResponseJson(response));
    const assets: MediaAssetRef[] = [];
    for (const value of Array.isArray(root.data) ? root.data : []) {
      const image = record(value);
      if (typeof image.b64_json === "string" && image.b64_json) {
        assets.push({
          kind: "inline-base64",
          data: image.b64_json,
          contentType:
            typeof image.media_type === "string"
              ? image.media_type
              : fallbackMime,
        });
      }
    }
    if (!assets.length)
      throw new Error("OpenRouter image generation returned no images.");
    return { content: `Generated ${assets.length} images.`, assets };
  },
};

export const openRouterAudioAdapter: SyncMediaProviderAdapter = {
  id: "openrouter-audio",
  buildRequest(profile, request) {
    const extensions = request.extensions ?? {};
    const format = request.audio?.format ?? "mp3";
    if (!["mp3", "pcm"].includes(format))
      throw new Error(
        "OpenRouter speech supports mp3 and pcm output. Select one of these formats."
      );
    const inputs = (request.inputs ?? []).filter(
      (input) => input.type === "audio" || input.type === "image"
    );
    const inputReferences = inputs.map((input): WireJsonValue =>
      input.type === "audio"
        ? {
            type: "input_audio",
            input_audio:
              input.source.kind === "remote-url"
                ? { url: input.source.url }
                : { data: mediaSource(input.source) },
          }
        : imageReference(input)
    );
    return jsonRequest(profile, "audio/speech", "audioSpeech", {
      ...pick(extensions, [
        "provider",
        "user",
        "session_id",
        "trace",
        "instructions",
        "input_references",
      ]),
      model: request.model,
      input: request.prompt,
      voice: request.audio?.voice || undefined,
      response_format: format,
      speed: request.audio?.speed,
      ...(inputReferences.length ? { input_references: inputReferences } : {}),
    });
  },
  parseResponse: openAiAudioAdapter.parseResponse,
};

export const openRouterVideoTaskAdapter: AsyncMediaTaskAdapter = {
  id: "openrouter-video-task",
  buildCreateRequest(profile, request) {
    const params = request.parameters ?? {};
    const providerParameters = record(params.providerParameters) as Record<
      string,
      JsonValue
    >;
    const frameImages = (request.inputs ?? [])
      .filter(
        (input) =>
          input.type === "image" &&
          (input.role === "first_frame" || input.role === "last_frame")
      )
      .map((input) => ({ ...imageReference(input), frame_type: input.role! }));
    const inputReferences = (request.inputs ?? [])
      .filter(
        (input) =>
          input.type !== "mask" &&
          input.role !== "first_frame" &&
          input.role !== "last_frame"
      )
      .map((input) => {
        const type = `${input.type}_url`;
        return { type, [type]: { url: mediaSource(input.source) } };
      });
    return jsonRequest(profile, "videos", "videos", {
      ...pick(providerParameters, [
        "provider",
        "callback_url",
        "previous_job_id",
        "upscale_factor",
        "creativity",
        "user",
        "session_id",
        "trace",
        "frame_images",
        "input_references",
      ]),
      model: request.model,
      prompt: request.prompt,
      duration: params.durationSeconds ?? providerParameters.duration,
      size:
        params.resolution === undefined && params.aspectRatio === undefined
          ? params.size
          : undefined,
      aspect_ratio: params.aspectRatio ?? providerParameters.aspect_ratio,
      resolution: params.resolution ?? providerParameters.resolution,
      seed:
        typeof params.seed === "number" && params.seed < 0
          ? undefined
          : (params.seed ?? providerParameters.seed),
      generate_audio: params.generateAudio ?? providerParameters.generate_audio,
      ...(frameImages.length ? { frame_images: frameImages } : {}),
      ...(inputReferences.length ? { input_references: inputReferences } : {}),
    });
  },
  async parseCreateResponse(response) {
    return parseVideoTask(await readWireResponseJson(response));
  },
  buildPollRequest(profile, _request, task) {
    let url = endpoint(
      profile,
      `videos/${encodeURIComponent(task.id)}`,
      "videoStatus",
      task.id
    );
    const pollingUrl = task.metadata?.pollingUrl;
    if (!profile.endpoints?.videoStatus && typeof pollingUrl === "string") {
      const base = new URL(endpoint(profile, "videos", "videos"));
      const resolved = new URL(pollingUrl, new URL(".", base));
      if (
        resolved.origin !== base.origin ||
        !["https:", "http:"].includes(resolved.protocol)
      ) {
        throw new Error(
          "OpenRouter returned a polling URL outside the configured API origin."
        );
      }
      url = resolved.href;
    }
    return { method: "GET", url, headers: headers(profile), streaming: false };
  },
  async parsePollResponse(response, _request, previous) {
    return parseVideoTask(await readWireResponseJson(response), previous);
  },
  buildResultRequests(profile, _request, task) {
    if (task.assets?.length) return [];
    return [
      {
        method: "GET",
        url: endpoint(
          profile,
          `videos/${encodeURIComponent(task.id)}/content`,
          "videoContent",
          task.id
        ),
        headers: headers(profile),
        streaming: false,
      },
    ];
  },
  parseResultResponses: openAiVideoTaskAdapter.parseResultResponses,
};

function parseVideoTask(
  value: unknown,
  previous?: AsyncMediaTaskSnapshot
): AsyncMediaTaskSnapshot {
  const root = record(value);
  const id = typeof root.id === "string" ? root.id : previous?.id;
  if (!id) throw new Error("OpenRouter video generation returned no task id.");
  const statuses = {
    pending: "queued",
    in_progress: "running",
    completed: "succeeded",
    failed: "failed",
    cancelled: "cancelled",
    expired: "failed",
  } as const;
  const rawStatus = typeof root.status === "string" ? root.status : "pending";
  if (!(rawStatus in statuses))
    throw new Error(`Unknown OpenRouter video status: ${rawStatus}`);
  const status = statuses[rawStatus as keyof typeof statuses];
  const assets: MediaAssetRef[] = (
    Array.isArray(root.unsigned_urls) ? root.unsigned_urls : []
  )
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .map((url) => ({ kind: "remote-url", url, contentType: "video/mp4" }));
  const metadata: Record<string, JsonValue> = { ...previous?.metadata };
  if (typeof root.polling_url === "string")
    metadata.pollingUrl = root.polling_url;
  if (typeof root.generation_id === "string")
    metadata.generationId = root.generation_id;
  const error =
    typeof root.error === "string" ? root.error : record(root.error).message;
  return {
    id,
    status,
    assets: assets.length ? assets : previous?.assets,
    progress: status === "succeeded" ? 100 : undefined,
    error:
      status === "failed"
        ? typeof error === "string"
          ? error
          : rawStatus === "expired"
            ? "OpenRouter video generation expired. Submit a new task."
            : "OpenRouter video generation failed."
        : undefined,
    metadata,
  };
}

function references(
  inputs: MediaInput[] | undefined,
  type: "image"
): WireJsonValue[] | undefined {
  const values = (inputs ?? [])
    .filter((input) => input.type === type)
    .map(imageReference);
  return values.length ? values : undefined;
}

function imageReference(input: MediaInput): {
  type: string;
  image_url: { url: WireJsonValue };
} {
  return { type: "image_url", image_url: { url: mediaSource(input.source) } };
}

function mediaSource(source: MediaInputSource): WireJsonValue {
  if (source.kind === "remote-url") return source.url;
  if (source.kind === "local-file") return source.ref;
  if (source.kind === "inline-base64")
    return `data:${source.contentType};base64,${source.data}`;
  let binary = "";
  for (let offset = 0; offset < source.data.length; offset += 0x8000)
    binary += String.fromCharCode(
      ...source.data.subarray(offset, offset + 0x8000)
    );
  return `data:${source.contentType};base64,${btoa(binary)}`;
}

function pick(
  values: Record<string, JsonValue>,
  keys: string[]
): Record<string, WireJsonValue> {
  return Object.fromEntries(
    keys
      .filter((key) => values[key] !== undefined)
      .map((key) => [key, values[key]])
  );
}

function jsonRequest(
  profile: ProviderProfile,
  path: string,
  key: string,
  body: Record<string, WireJsonValue | undefined>
): WireRequest {
  return {
    method: "POST",
    url: endpoint(profile, path, key),
    headers: headers(profile),
    streaming: false,
    body: {
      kind: "json",
      value: Object.fromEntries(
        Object.entries(body).filter(
          (entry): entry is [string, WireJsonValue] => entry[1] !== undefined
        )
      ),
    },
  };
}

function endpoint(
  profile: ProviderProfile,
  path: string,
  key: string,
  id?: string
): string {
  const custom = profile.endpoints?.[key]?.replace(
    /\{video_id\}/g,
    encodeURIComponent(id ?? "")
  );
  if (custom && /^https?:\/\//i.test(custom)) return custom;
  const base = profile.baseUrl.replace(/\/+$/, "");
  if (custom) return `${base}/${custom.replace(/^\/+/, "")}`;
  const versioned = /\/v\d+$/i.test(base)
    ? base
    : new URL(base).hostname === "openrouter.ai"
      ? `${base}${new URL(base).pathname === "/api" ? "/v1" : "/api/v1"}`
      : `${base}/v1`;
  return `${versioned}/${path}`;
}

function headers(profile: ProviderProfile): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
    ...profile.headers,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
