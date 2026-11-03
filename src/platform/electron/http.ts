// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { ClientOptions } from "../native/http";
import type {
  HttpReadResult,
  HttpResponseInfo,
} from "../../../electron/shared";
import { request, unsupported } from "./client";

function withResponseMetadata(
  response: Response,
  info: HttpResponseInfo
): Response {
  Object.defineProperties(response, {
    url: { value: info.url },
    redirected: { value: info.redirected },
    clone: {
      value: () =>
        withResponseMetadata(Response.prototype.clone.call(response), info),
    },
  });
  return response;
}

/** Fetch-compatible facade over bounded, pull-based host IPC. Upload bodies are buffered once. */
export async function electronFetch(
  input: URL | Request | string,
  init?: RequestInit & ClientOptions
): Promise<Response> {
  if (init?.proxy) unsupported("逐请求代理配置");
  if (init?.danger?.acceptInvalidCerts || init?.danger?.acceptInvalidHostnames)
    unsupported("跳过 TLS 证书校验");
  const source = new Request(input, init);
  if (source.integrity) unsupported("请求完整性校验");
  const signal = source.signal;
  const abortReason = () =>
    signal.reason ?? new DOMException("网络请求已取消", "AbortError");
  if (signal.aborted) throw abortReason();
  const body = source.body
    ? new Uint8Array(await source.arrayBuffer())
    : undefined;
  if (signal.aborted) throw abortReason();
  const id = crypto.randomUUID();
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let finished = false;
  const cancelHost = () => request("http.cancel", { id }).catch(() => {});
  const cleanup = () => {
    finished = true;
    signal.removeEventListener("abort", onAbort);
  };
  const onAbort = () => {
    if (finished) return;
    cleanup();
    streamController?.error(abortReason());
    void cancelHost();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const info = await request<HttpResponseInfo>("http.start", {
      id,
      options: {
        url: source.url,
        method: source.method,
        headers: [...source.headers.entries()],
        body,
        redirect: source.redirect,
        credentials: source.credentials,
        cache: source.cache,
        referrerPolicy: source.referrerPolicy,
        connectTimeout: init?.connectTimeout,
        maxRedirections: init?.maxRedirections,
      },
    });
    if (signal.aborted) throw abortReason();
    const stream = info.hasBody
      ? new ReadableStream<Uint8Array>(
          {
            start(controller) {
              streamController = controller;
            },
            async pull(controller) {
              try {
                const chunk = await request<HttpReadResult>("http.read", {
                  id,
                });
                if (finished) return;
                if (chunk.done) {
                  cleanup();
                  controller.close();
                } else if (chunk.value)
                  controller.enqueue(new Uint8Array(chunk.value));
              } catch (error) {
                if (finished) return;
                cleanup();
                controller.error(signal.aborted ? abortReason() : error);
                void cancelHost();
              }
            },
            async cancel() {
              cleanup();
              await cancelHost();
            },
          },
          { highWaterMark: 0 }
        )
      : null;
    if (!stream) cleanup();
    const response = new Response(stream, {
      status: info.status,
      statusText: info.statusText,
      headers: info.headers,
    });
    return withResponseMetadata(response, info);
  } catch (error) {
    cleanup();
    await cancelHost();
    if (signal.aborted) throw abortReason();
    throw error;
  }
}
