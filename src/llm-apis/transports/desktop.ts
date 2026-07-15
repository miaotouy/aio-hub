import {
  containsLocalFileRef,
  type LlmTransport,
  type TransportOptions,
  type WireBody,
  type WireJsonValue,
  type WireRequest,
  type WireResponse,
} from "@aiohub/llm-core";
import { ensureResponseOk, fetchWithTimeout } from "@/llm-apis/common";
import { asyncJsonStringify } from "@/utils/serialization";

export interface DesktopFetchOptions extends RequestInit {
  hasLocalFile?: boolean;
  forceProxy?: boolean;
  relaxIdCerts?: boolean;
  http1Only?: boolean;
  networkStrategy?: "auto" | "proxy" | "native";
  isStreaming?: boolean;
}

export interface DesktopLlmTransportDependencies {
  fetch: (
    url: string,
    options: DesktopFetchOptions,
    timeout?: number,
    signal?: AbortSignal
  ) => Promise<Response>;
  ensureResponseOk: (response: Response) => Promise<void>;
  serializeJson: (value: WireJsonValue) => Promise<string | Uint8Array>;
}

export function createDesktopLlmTransport(
  dependencies: DesktopLlmTransportDependencies
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
        const { body, hasLocalFile } = await serializeBody(
          request.body,
          dependencies.serializeJson
        );
        const strategy = options.network?.strategy;
        const response = await dependencies.fetch(
          request.url,
          {
            method: request.method,
            headers: request.headers,
            body: body as BodyInit | null | undefined,
            hasLocalFile,
            forceProxy: strategy === "proxy",
            relaxIdCerts: options.network?.relaxInvalidCerts,
            http1Only: options.network?.http1Only,
            networkStrategy: strategy,
            isStreaming: request.streaming,
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

export const desktopLlmTransport = createDesktopLlmTransport({
  fetch: fetchWithTimeout,
  ensureResponseOk,
  serializeJson: asyncJsonStringify,
});

async function serializeBody(
  body: WireBody | undefined,
  serializeJson: DesktopLlmTransportDependencies["serializeJson"]
): Promise<{ body?: BodyInit | Uint8Array; hasLocalFile: boolean }> {
  if (!body) return { hasLocalFile: false };

  switch (body.kind) {
    case "json": {
      if (containsLocalFileRef(body.value)) {
        throw new Error(
          "Desktop transport does not support tagged LocalFileRef JSON yet"
        );
      }
      return {
        body: await serializeJson(body.value),
        hasLocalFile: containsLegacyLocalFileProtocol(body.value),
      };
    }
    case "text":
      return { body: body.value, hasLocalFile: false };
    case "bytes":
      return { body: body.value, hasLocalFile: false };
    case "multipart": {
      const formData = new FormData();
      for (const part of body.parts) {
        if (part.body.kind === "file-ref") {
          throw new Error(
            "Desktop transport does not support multipart LocalFileRef yet"
          );
        }
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
      return { body: formData, hasLocalFile: false };
    }
    case "file-ref":
      throw new Error("Desktop transport does not support top-level file-ref yet");
  }
}

function containsLegacyLocalFileProtocol(value: WireJsonValue): boolean {
  const pending: WireJsonValue[] = [value];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (typeof current === "string" && current.includes("local-file://")) {
      return true;
    }
    if (Array.isArray(current)) {
      pending.push(...current);
    } else if (typeof current === "object" && current !== null) {
      pending.push(...Object.values(current));
    }
  }
  return false;
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
