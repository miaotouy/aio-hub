import {
  containsLocalFileRef,
  type LlmTransport,
  type TransportOptions,
  type WireBody,
  type WireJsonValue,
  type WireRequest,
  type WireResponse,
} from "@aiohub/llm-core";
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
}

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
});

function serializeBody(
  body: WireBody | undefined,
  serializeJson: (value: WireJsonValue) => string
): BodyInit | null | undefined {
  if (!body) return undefined;

  switch (body.kind) {
    case "json":
      if (containsLocalFileRef(body.value)) {
        throw new Error(
          "Mobile transport does not support tagged LocalFileRef JSON yet"
        );
      }
      return serializeJson(body.value);
    case "text":
      return body.value;
    case "bytes":
      return body.value.slice().buffer as ArrayBuffer;
    case "multipart": {
      const formData = new FormData();
      for (const part of body.parts) {
        if (part.body.kind === "file-ref") {
          throw new Error(
            "Mobile transport does not support multipart LocalFileRef yet"
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
      return formData;
    }
    case "file-ref":
      throw new Error("Mobile transport does not support top-level file-ref yet");
  }
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
