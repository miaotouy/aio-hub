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

import { net } from "electron";
import { Readable } from "node:stream";

function responseHeaders(values: Record<string, string | string[]>): Headers {
  const headers = new Headers();
  for (const [name, entries] of Object.entries(values)) {
    for (const value of Array.isArray(entries) ? entries : [entries])
      headers.append(name, value);
  }
  return headers;
}

/** Chromium networking with readable manual redirects, system proxy and bounded Node/Web streams. */
export function chromiumFetch(
  url: string,
  init: RequestInit
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const request = net.request({
      url,
      method: init.method,
      redirect: "manual",
      credentials: init.credentials,
      cache: init.cache,
      referrerPolicy: init.referrerPolicy,
    });
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const fail = (error: unknown) => {
      cleanup();
      if (settled) return;
      settled = true;
      reject(error);
    };
    const onAbort = () => {
      fail(signal?.reason ?? new DOMException("网络请求已取消", "AbortError"));
      request.abort();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    request.on("error", fail);
    request.on("redirect", (statusCode, _method, destination, values) => {
      try {
        // net.fetch rejects manual redirects. Capture headers before cancelling the native redirect.
        const headers = responseHeaders(values);
        headers.set("location", destination);
        const response = new Response(null, { status: statusCode, headers });
        settled = true;
        cleanup();
        resolve(response);
      } catch (error) {
        fail(error);
      } finally {
        request.abort();
      }
    });
    request.on("response", (message) => {
      try {
        const incoming = message as unknown as Readable;
        incoming.once("end", cleanup);
        incoming.once("close", cleanup);
        const stream = Readable.toWeb(incoming, {
          strategy: {
            highWaterMark: 65536,
            size: (chunk: Uint8Array) => chunk.byteLength,
          },
        }) as unknown as ReadableStream<Uint8Array>;
        const hasBody =
          init.method !== "HEAD" &&
          ![204, 205, 304].includes(message.statusCode);
        if (!hasBody) void stream.cancel().catch(() => {});
        const response = new Response(hasBody ? stream : null, {
          status: message.statusCode,
          statusText: message.statusMessage,
          headers: responseHeaders(message.headers),
        });
        settled = true;
        resolve(response);
      } catch (error) {
        fail(error);
        request.abort();
      }
    });
    try {
      new Headers(init.headers).forEach((value, name) =>
        request.setHeader(name, value)
      );
      if (init.body instanceof Uint8Array)
        request.write(Buffer.from(init.body));
      else if (typeof init.body === "string") request.write(init.body);
      else if (init.body != null)
        throw new TypeError("原生网络请求内容需先编码为字节数组");
      request.end();
    } catch (error) {
      fail(error);
      request.abort();
    }
  });
}
