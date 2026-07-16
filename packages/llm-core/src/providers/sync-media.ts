import type { JsonValue, WireJsonValue } from "../types/json";
import type {
  MediaInput,
  MediaInputSource,
  SyncMediaProviderAdapter,
  SyncMediaRequest,
  SyncMediaResponse,
} from "../types/media";
import type { ProviderProfile } from "../types/provider";
import type { MediaAssetRef } from "../types/response";
import type { MultipartPart, WireRequest } from "../types/transport";
import {
  readWireResponseBytes,
  readWireResponseJson,
} from "../utils/wire-response";
import {
  buildGoogleGenerateContentBody,
  parseGoogleGenerateContentResponseValue,
} from "./google-generate-content";

export const openAiImageAdapter: SyncMediaProviderAdapter = {
  id: "openai-image",
  buildRequest(profile, request) {
    const isAgnes = request.model.toLowerCase().includes("agnes-image-");
    const hasReferences = (request.inputs?.length ?? 0) > 0;
    const editMode = !isAgnes && (hasReferences || request.mask !== undefined);
    const endpoint = editMode ? "images/edits" : "images/generations";
    const headers = buildBearerHeaders(profile);
    const url = buildEndpointUrl(
      profile,
      endpoint,
      editMode ? "imagesEdits" : "imagesGenerations"
    );

    if (editMode) {
      deleteHeader(headers, "content-type");
      const parts: MultipartPart[] = [
        textPart("model", request.model),
        textPart("prompt", request.prompt),
        textPart("n", String(request.count ?? 1)),
        textPart("size", request.size ?? "1024x1024"),
      ];
      addOptionalText(parts, "quality", request.quality);
      addOptionalText(
        parts,
        "moderation",
        readString(request.extensions?.moderation)
      );
      addOptionalText(
        parts,
        "background",
        readString(request.extensions?.background)
      );
      addOptionalText(
        parts,
        "partial_images",
        readScalar(request.extensions?.partialImages)
      );
      addOptionalText(
        parts,
        "output_compression",
        readScalar(request.extensions?.outputCompression)
      );
      for (const input of request.inputs ?? []) {
        const part = mediaInputPart("image[]", input, "reference.png");
        if (part) parts.push(part);
      }
      if (request.mask) {
        const part = mediaInputPart("mask", request.mask, "mask.png");
        if (part) parts.push(part);
      }
      return post(url, headers, { kind: "multipart", parts });
    }

    const responseFormat = request.responseFormat?.trim() || "url";
    const body = isAgnes
      ? buildAgnesBody(request, responseFormat)
      : compact({
          model: request.model,
          prompt: request.prompt,
          negative_prompt: request.negativePrompt,
          n: request.count ?? 1,
          size: request.size ?? "1024x1024",
          quality: request.quality,
          style: request.style,
          output_format: responseFormat === "url" ? undefined : responseFormat,
          seed: request.seed,
          guidance_scale: request.guidanceScale,
          num_inference_steps: request.inferenceSteps,
          user: request.extensions?.user,
          background: request.extensions?.background,
          input_fidelity: request.extensions?.inputFidelity,
          partial_images: request.extensions?.partialImages,
          output_compression: request.extensions?.outputCompression,
          moderation: request.extensions?.moderation,
          aspect_ratio: request.aspectRatio ?? request.extensions?.aspect_ratio,
          resolution: request.extensions?.resolution,
        });
    return post(url, headers, { kind: "json", value: body });
  },
  async parseResponse(response) {
    return parseOpenAiImageResponse(await readWireResponseJson(response));
  },
};

export const siliconFlowImageAdapter: SyncMediaProviderAdapter = {
  id: "siliconflow-image",
  buildRequest(profile, request) {
    const body: Record<string, WireJsonValue | undefined> = {
      model: request.model,
      prompt: request.prompt,
      negative_prompt: request.negativePrompt,
      seed: request.seed === -1 ? undefined : request.seed,
      num_inference_steps: request.inferenceSteps,
      guidance_scale: request.guidanceScale,
      image_size: request.model.includes("Qwen-Image-Edit")
        ? undefined
        : request.size,
      batch_size: request.model.includes("Kolors")
        ? (request.count ?? 1)
        : undefined,
      cfg: request.extensions?.cfg,
    };
    const images = (request.inputs ?? []).filter(
      (input) => input.type === "image"
    );
    images.slice(0, 3).forEach((input, index) => {
      body[index === 0 ? "image" : `image${index + 1}`] = mediaSourceToJson(
        input.source
      );
    });
    return post(
      buildEndpointUrl(profile, "images/generations", "imagesGenerations"),
      buildBearerHeaders(profile),
      { kind: "json", value: compact(body) }
    );
  },
  async parseResponse(response) {
    return parseOpenAiImageResponse(await readWireResponseJson(response));
  },
};

export const geminiImageAdapter: SyncMediaProviderAdapter = {
  id: "gemini-image",
  buildRequest(profile, request) {
    const coreBody = buildGoogleGenerateContentBody(profile, {
      model: request.model,
      messages:
        request.messages && request.messages.length > 0
          ? request.messages
          : [{ role: "user", content: request.prompt }],
      stream: false,
      temperature: readNumber(request.extensions?.temperature),
      topP: readNumber(request.extensions?.topP),
      topK: readNumber(request.extensions?.topK),
      maxTokens: readNumber(request.extensions?.maxTokens),
      stop: readStringArray(request.extensions?.stop),
      webSearchEnabled: request.extensions?.webSearch === true,
    });
    const contents = coreBody.contents as WireJsonValue[];
    const lastContent = asWireRecord(contents[contents.length - 1]);
    const parts = Array.isArray(lastContent?.parts)
      ? (lastContent.parts as WireJsonValue[])
      : [];
    for (const input of request.inputs ?? []) {
      const part = mediaSourceToGeminiPart(input.source);
      if (part) parts.push(part);
    }
    const imageConfig = compact({
      aspectRatio: request.aspectRatio,
      imageSize: request.size?.toUpperCase(),
    });
    const generationConfig = compact({
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig:
        Object.keys(imageConfig).length > 0 ? imageConfig : undefined,
      temperature: request.extensions?.temperature,
      topP: request.extensions?.topP,
      topK: request.extensions?.topK,
      maxOutputTokens: request.extensions?.maxTokens,
      stopSequences: request.extensions?.stop,
    });
    if (lastContent) lastContent.parts = parts;
    const body = compact({
      ...coreBody,
      generationConfig,
    });
    const endpoint = `models/${encodeURIComponent(request.model)}:generateContent`;
    const url = buildEndpointUrl(profile, endpoint, "generateContent");
    return post(url, buildGeminiHeaders(profile), {
      kind: "json",
      value: body,
    });
  },
  async parseResponse(response) {
    const parsed = parseGoogleGenerateContentResponseValue(
      await readWireResponseJson(response)
    );
    const assets = parsed.images ?? [];
    return {
      content: parsed.content,
      assets,
      metadata: parsed.metadata,
    };
  },
};

export const openAiAudioAdapter: SyncMediaProviderAdapter = {
  id: "openai-audio",
  buildRequest(profile, request) {
    const format = request.audio?.format ?? "mp3";
    return post(
      buildEndpointUrl(profile, "audio/speech", "audioSpeech"),
      buildBearerHeaders(profile),
      {
        kind: "json",
        value: compact({
          model: request.model,
          input: request.prompt,
          voice: request.audio?.voice ?? "alloy",
          response_format: format,
          speed: request.audio?.speed ?? 1,
          instructions: request.extensions?.instructions,
        }),
      }
    );
  },
  async parseResponse(response, request) {
    const bytes = await readWireResponseBytes(response);
    const format = request.audio?.format ?? "mp3";
    return {
      content: "Audio generated successfully.",
      assets: [
        {
          kind: "inline-base64",
          data: encodeBase64(bytes),
          contentType: response.headers["content-type"] ?? `audio/${format}`,
        },
      ],
      binary: bytes,
      metadata: { format },
    };
  },
};

function post(
  url: string,
  headers: Record<string, string>,
  body: WireRequest["body"]
): WireRequest {
  return { method: "POST", url, headers, body, streaming: false };
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
  if (profile.provider === "gemini") {
    const versioned = /\/v1(?:beta)?$/i.test(base) ? base : `${base}/v1beta`;
    return `${versioned}/${endpoint}`;
  }
  const versioned = /\/v\d+(?:beta)?$/i.test(base) ? base : `${base}/v1`;
  return `${versioned}/${endpoint}`;
}

function joinUrl(baseUrl: string, endpoint: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

function buildAgnesBody(
  request: SyncMediaRequest,
  responseFormat: string
): WireJsonValue {
  const references = (request.inputs ?? [])
    .filter((input) => input.type === "image")
    .map((input) => mediaSourceToJson(input.source));
  const agnesResponseFormat =
    responseFormat === "b64_json" ? "b64_json" : "url";
  const extraBody = compact({
    image: references.length > 0 ? references : undefined,
    response_format: references.length > 0 ? agnesResponseFormat : undefined,
  });
  return compact({
    model: request.model,
    prompt: request.prompt,
    size: request.size ?? "1024x1024",
    return_base64:
      references.length === 0 && agnesResponseFormat === "b64_json"
        ? true
        : undefined,
    extra_body: Object.keys(extraBody).length > 0 ? extraBody : undefined,
  });
}

function mediaInputPart(
  name: string,
  input: MediaInput,
  fallbackFilename: string
): MultipartPart | undefined {
  const common = {
    name,
    filename: input.filename ?? fallbackFilename,
    contentType: mediaSourceContentType(input.source),
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

function mediaSourceToGeminiPart(
  source: MediaInputSource
): WireJsonValue | undefined {
  switch (source.kind) {
    case "remote-url":
      return {
        fileData: { fileUri: source.url, mimeType: "application/octet-stream" },
      };
    case "local-file":
      return {
        inlineData: {
          mimeType: source.ref.contentType ?? "application/octet-stream",
          data: source.ref,
        },
      };
    case "inline-base64":
      return {
        inlineData: { mimeType: source.contentType, data: source.data },
      };
    case "bytes":
      return {
        inlineData: {
          mimeType: source.contentType,
          data: encodeBase64(source.data),
        },
      };
  }
}

function mediaSourceToJson(source: MediaInputSource): WireJsonValue {
  switch (source.kind) {
    case "remote-url":
      return source.url;
    case "inline-base64":
      return `data:${source.contentType};base64,${source.data}`;
    case "bytes":
      return `data:${source.contentType};base64,${encodeBase64(source.data)}`;
    case "local-file":
      return source.ref;
  }
}

function mediaSourceContentType(source: MediaInputSource): string | undefined {
  return source.kind === "remote-url"
    ? undefined
    : source.kind === "local-file"
      ? source.ref.contentType
      : source.contentType;
}

function parseOpenAiImageResponse(value: unknown): SyncMediaResponse {
  const root = asRecord(value);
  const rawImages =
    readArray(root.data).length > 0
      ? readArray(root.data)
      : readArray(root.images);
  const assets: MediaAssetRef[] = [];
  for (const raw of rawImages) {
    const item = asRecord(raw);
    const revisedPrompt =
      readString(item.revised_prompt) ?? readString(item.revisedPrompt);
    const url = readString(item.url);
    const base64 = readString(item.b64_json);
    if (url) assets.push({ kind: "remote-url", url, revisedPrompt });
    else if (base64) {
      assets.push({
        kind: "inline-base64",
        data: base64,
        contentType: "image/png",
        revisedPrompt,
      });
    }
  }
  return {
    content:
      assets.length > 0
        ? `Generated ${assets.length} images.`
        : "No images generated.",
    assets,
    metadata: compactJson({
      revisedPrompt:
        assets[0] && "revisedPrompt" in assets[0]
          ? assets[0].revisedPrompt
          : undefined,
      seed: toJsonValue(root.seed),
      timings: toJsonValue(root.timings),
      systemFingerprint: toJsonValue(root.system_fingerprint),
    }),
  };
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

function compact(
  value: Record<string, WireJsonValue | undefined>
): Record<string, WireJsonValue> {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, WireJsonValue] => entry[1] !== undefined
    )
  );
}

function compactJson(
  value: Record<string, JsonValue | undefined>
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, JsonValue] => entry[1] !== undefined
    )
  );
}

function deleteHeader(headers: Record<string, string>, target: string) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) delete headers[key];
  }
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

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function asWireRecord(
  value: WireJsonValue | undefined
): Record<string, WireJsonValue> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, WireJsonValue>)
    : undefined;
}

function readScalar(value: unknown): string | undefined {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : undefined;
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    ["string", "number", "boolean"].includes(typeof value)
  ) {
    return value as JsonValue;
  }
  if (Array.isArray(value)) {
    const values = value.map(toJsonValue);
    return values.every((item) => item !== undefined)
      ? (values as JsonValue[])
      : undefined;
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const normalized = toJsonValue(item);
      if (normalized !== undefined) result[key] = normalized;
    }
    return result;
  }
  return undefined;
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

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...value.subarray(offset, offset + chunkSize)
    );
  }
  return btoa(binary);
}
