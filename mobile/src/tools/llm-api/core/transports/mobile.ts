import {
  containsLocalFileRef,
  type LlmTransport,
  type TransportOptions,
  type WireBody,
  type WireJsonValue,
  type WireRequest,
  type WireResponse,
} from "@aiohub/llm-core";
import { invoke } from "@tauri-apps/api/core";
import { ensureResponseOk, fetchWithTimeout } from "../common";

export interface MobileFetchOptions extends RequestInit {
  relaxIdCerts?: boolean;
  http1Only?: boolean;
}

export interface MobileLlmTransportDependencies {
  fetch: (
    url: string,
    options: MobileFetchOptions,
    timeout?: number,
    signal?: AbortSignal
  ) => Promise<Response>;
  ensureResponseOk: (response: Response) => Promise<void>;
  serializeJson?: (value: WireJsonValue) => string;
  sendFileRequest?: (request: MobileNativeFileRequest) => Promise<Response>;
  cancelFileRequest?: (requestId: string) => Promise<unknown>;
}

export interface MobileNativeFileRequest {
  requestId: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: NativeFileRequestBody;
  timeoutMs?: number;
  network?: {
    proxyUrl?: string;
    relaxInvalidCerts?: boolean;
    http1Only?: boolean;
  };
}

type NativeFileRequestBody =
  | { kind: "json"; value: WireJsonValue }
  | { kind: "file-ref"; ref: Extract<WireBody, { kind: "file-ref" }>["ref"] }
  | {
      kind: "multipart";
      parts: Array<{
        name: string;
        body:
          | { kind: "text"; value: string }
          | { kind: "bytes"; base64: string }
          | {
              kind: "file-ref";
              ref: Extract<WireBody, { kind: "file-ref" }>["ref"];
            };
        filename?: string;
        contentType?: string;
        headers?: Record<string, string>;
      }>;
    };

export function createMobileLlmTransport(
  dependencies: MobileLlmTransportDependencies
): LlmTransport {
  return {
    async send(
      request: WireRequest,
      options: TransportOptions
    ): Promise<WireResponse> {
      const startedAt = Date.now();
      options.observer?.onRequest?.({
        requestId: options.requestId,
        request,
        startedAt,
      });

      try {
        if (requiresNativeFileRequest(request.body)) {
          return await sendNativeFileRequest(request, options, dependencies, startedAt);
        }
        const body = serializeBody(
          request.body,
          dependencies.serializeJson ?? JSON.stringify
        );
        const response = await dependencies.fetch(
          request.url,
          {
            method: request.method,
            headers: request.headers,
            body,
            relaxIdCerts: options.network?.relaxInvalidCerts,
            http1Only: options.network?.http1Only,
          },
          options.timeoutMs,
          options.signal
        );
        await dependencies.ensureResponseOk(response);

        const headers = responseHeadersToRecord(response.headers);
        options.observer?.onResponseStart?.({
          requestId: options.requestId,
          status: response.status ?? 200,
          statusText: response.statusText ?? "",
          headers,
          startedAt,
        });

        return {
          status: response.status ?? 200,
          statusText: response.statusText ?? "",
          headers,
          body: responseBodyToAsyncIterable(response, options),
        };
      } catch (error) {
        options.observer?.onError?.({
          requestId: options.requestId,
          error,
          occurredAt: Date.now(),
        });
        throw error;
      }
    },
  };
}

export const mobileLlmTransport = createMobileLlmTransport({
  fetch: fetchWithTimeout,
  ensureResponseOk,
  sendFileRequest: invokeNativeFileRequest,
  cancelFileRequest: (requestId) =>
    invoke("cancel_llm_file_request", { requestId }),
});

function serializeBody(
  body: WireBody | undefined,
  serializeJson: (value: WireJsonValue) => string
): BodyInit | null | undefined {
  if (!body) return undefined;

  switch (body.kind) {
    case "json":
      return serializeJson(body.value);
    case "text":
      return body.value;
    case "bytes":
      return body.value.slice().buffer as ArrayBuffer;
    case "multipart": {
      const formData = new FormData();
      for (const part of body.parts) {
        if (part.body.kind === "file-ref") continue;
        if (part.body.kind === "text") {
          formData.append(part.name, part.body.value);
          continue;
        }
        const bytes = part.body.value.slice().buffer as ArrayBuffer;
        const blob = new Blob([bytes], {
          type: part.contentType ?? "application/octet-stream",
        });
        formData.append(part.name, blob, part.filename);
      }
      return formData;
    }
    case "file-ref":
      return undefined;
  }
}

function requiresNativeFileRequest(body: WireBody | undefined): boolean {
  if (!body) return false;
  if (body.kind === "file-ref") return true;
  if (body.kind === "json") return containsLocalFileRef(body.value);
  return (
    body.kind === "multipart" &&
    body.parts.some((part) => part.body.kind === "file-ref")
  );
}

async function sendNativeFileRequest(
  request: WireRequest,
  options: TransportOptions,
  dependencies: MobileLlmTransportDependencies,
  startedAt: number
): Promise<WireResponse> {
  if (!request.body) throw new Error("Native file request requires a body");
  if (!dependencies.sendFileRequest) {
    throw new Error("Mobile native file transport is unavailable");
  }
  if (options.signal?.aborted) throw createAbortError();

  const onAbort = () => {
    void dependencies.cancelFileRequest?.(options.requestId);
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await dependencies.sendFileRequest({
      requestId: options.requestId,
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: toNativeFileRequestBody(request.body),
      timeoutMs: options.timeoutMs,
      network: options.network
        ? {
            proxyUrl: options.network.proxyUrl,
            relaxInvalidCerts: options.network.relaxInvalidCerts,
            http1Only: options.network.http1Only,
          }
        : undefined,
    });
    if (options.signal?.aborted) throw createAbortError();
    await dependencies.ensureResponseOk(response);
    const headers = responseHeadersToRecord(response.headers);
    options.observer?.onResponseStart?.({
      requestId: options.requestId,
      status: response.status,
      statusText: response.statusText,
      headers,
      startedAt,
    });
    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body: responseBodyToAsyncIterable(response, options),
    };
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}

function toNativeFileRequestBody(body: WireBody): NativeFileRequestBody {
  if (body.kind === "json") return body;
  if (body.kind === "file-ref") return body;
  if (body.kind !== "multipart") {
    throw new Error("Native file transport received an unsupported body");
  }
  return {
    kind: "multipart",
    parts: body.parts.map((part) => ({
      name: part.name,
      filename: part.filename,
      contentType: part.contentType,
      headers: part.headers,
      body:
        part.body.kind === "bytes"
          ? { kind: "bytes", base64: encodeBase64(part.body.value) }
          : part.body,
    })),
  };
}

async function invokeNativeFileRequest(
  request: MobileNativeFileRequest
): Promise<Response> {
  const result = await invoke<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: number[] | Uint8Array;
  }>("send_llm_file_request", { request });
  return new Response(new Uint8Array(result.body), {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    binary += String.fromCharCode(...value.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function createAbortError(): Error {
  return typeof DOMException === "undefined"
    ? new Error("The request was aborted")
    : new DOMException("The request was aborted", "AbortError");
}

function responseHeadersToRecord(headers: Headers | undefined) {
  const result: Record<string, string> = {};
  headers?.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

async function* responseBodyToAsyncIterable(
  response: Response,
  options: TransportOptions
): AsyncIterable<Uint8Array> {
  if (!response.body) {
    const fallbackValue =
      typeof response.text === "function"
        ? await response.text()
        : JSON.stringify(await response.json());
    if (fallbackValue) yield new TextEncoder().encode(fallbackValue);
    return;
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      options.observer?.onResponseChunk?.({
        requestId: options.requestId,
        chunk: value,
        receivedAt: Date.now(),
      });
      yield value;
    }
  } catch (error) {
    options.observer?.onError?.({
      requestId: options.requestId,
      error,
      occurredAt: Date.now(),
    });
    throw error;
  } finally {
    reader.releaseLock();
  }
}
