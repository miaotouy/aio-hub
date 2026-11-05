// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type {
  LlmTransport,
  TransportOptions,
  WireRequest,
  WireResponse,
} from "@aiohub/llm-core";
import {
  createLlmTransport,
  type LlmFetchOptions,
} from "../src/llm-apis/transports/transport";
import { TimeoutError, ensureResponseOk } from "../src/llm-apis/errors";
import { HttpRequests } from "./http";
import { llmHttpFetch } from "./llm-http";
import type { LlmHttpOptions } from "./shared";

export interface NodeLlmTransportDependencies {
  getProxy(): LlmHttpOptions["proxy"];
  resolveProxy(url: string): Promise<string>;
}
export interface NodeLlmTransport extends LlmTransport {
  /** Release application/Worker-owned requests without a renderer lifetime. */
  dispose(): void;
}

/** Native Node transport over the same redirects, file expansion, proxies and byte streams used by Electron HTTP. */
export function createNodeLlmTransport(
  dependencies: NodeLlmTransportDependencies
): NodeLlmTransport {
  const service = new HttpRequests((url, init, options) =>
    llmHttpFetch(url, init, options.llm!, dependencies.resolveProxy)
  );
  const active = new Set<AbortController>();
  let disposed = false;

  async function fetchResponse(
    url: string,
    options: LlmFetchOptions,
    _timeout?: number,
    signal?: AbortSignal
  ): Promise<Response> {
    signal?.throwIfAborted();
    const id = crypto.randomUUID();
    const headers = new Headers(options.headers);
    if (options.body instanceof FormData) headers.delete("content-type");
    const method = (options.method ?? "POST").toUpperCase();
    const request = new Request(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : options.body,
    });
    const body = request.body
      ? new Uint8Array(await request.arrayBuffer())
      : undefined;
    signal?.throwIfAborted();
    const onAbort = () => service.cancel(1, id);
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const result = await service.start(1, id, {
        url,
        method,
        headers: Array.from(request.headers.entries()),
        body,
        redirect: "follow",
        credentials: "omit",
        llm: {
          bodyKind: options.proxyBodyKind ?? "raw",
          expandJson:
            options.proxyBodyKind === undefined &&
            typeof options.body === "string" &&
            headers.get("content-type")?.includes("application/json") === true,
          proxy: dependencies.getProxy(),
          relaxIdCerts: options.relaxIdCerts ?? true,
        },
      });
      signal?.throwIfAborted();
      if (!result.hasBody) cleanup();
      return new Response(
        result.hasBody
          ? new ReadableStream<Uint8Array>({
              async pull(controller) {
                try {
                  const chunk = await service.read(1, id);
                  signal?.throwIfAborted();
                  if (chunk.done) {
                    cleanup();
                    controller.close();
                  } else controller.enqueue(chunk.value!);
                } catch (error) {
                  cleanup();
                  controller.error(signal?.aborted ? signal.reason : error);
                }
              },
              cancel() {
                service.cancel(1, id);
                cleanup();
              },
            })
          : null,
        {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
        }
      );
    } catch (error) {
      cleanup();
      service.cancel(1, id);
      throw signal?.aborted ? signal.reason : error;
    }
  }
  const transport = createLlmTransport({
    fetch: fetchResponse,
    ensureResponseOk,
    serializeJson: async (value) => JSON.stringify(value),
  });
  return {
    async send(
      request: WireRequest,
      options: TransportOptions
    ): Promise<WireResponse> {
      if (disposed) throw Error("模型传输已关闭");
      options.signal?.throwIfAborted();
      const timeoutMs = options.timeoutMs ?? 145000;
      if (
        !Number.isFinite(timeoutMs) ||
        timeoutMs <= 0 ||
        timeoutMs > 2147483647
      )
        throw new TypeError("模型请求超时需为有效的正毫秒数");
      const controller = new AbortController();
      active.add(controller);
      const onAbort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(
        () => controller.abort(new TimeoutError("模型请求超时")),
        timeoutMs
      );
      const cleanup = () => {
        controller.signal.removeEventListener("abort", cleanup);
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        active.delete(controller);
      };
      controller.signal.addEventListener("abort", cleanup, { once: true });
      try {
        const response = await transport.send(request, {
          ...options,
          signal: controller.signal,
        });
        return {
          ...response,
          body: (async function* () {
            try {
              yield* response.body;
            } finally {
              cleanup();
            }
          })(),
        };
      } catch (error) {
        cleanup();
        throw error;
      }
    },
    dispose() {
      disposed = true;
      for (const controller of active)
        controller.abort(new DOMException("模型传输已关闭", "AbortError"));
      service.disposeOwner(1);
    },
  };
}
