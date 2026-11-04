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

import type {
  HttpRequestOptions,
  HttpResponseInfo,
  HttpReadResult,
} from "./shared";

interface ActiveRequest {
  controller: AbortController;
  reader?: ReadableStreamDefaultReader<Uint8Array>;
  remainder?: Uint8Array;
  reading: boolean;
}
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
function httpUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new TypeError("原生网络仅支持 HTTP/HTTPS，登录凭证请使用请求头传递");
  return url;
}
const abortError = () =>
  Object.assign(new Error("网络请求已取消"), { code: "ABORT_ERR" });

/** Pull-based response transport. Each renderer owns its requests and lifecycle. */
export class HttpRequests {
  private owners = new Map<number, Map<string, ActiveRequest>>();
  constructor(
    private fetcher: (
      url: string,
      init: RequestInit,
      options: HttpRequestOptions
    ) => Promise<Response>
  ) {}

  async start(
    owner: number,
    id: string,
    options: HttpRequestOptions
  ): Promise<HttpResponseInfo> {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id))
      throw new TypeError("网络请求标识无效");
    let url = httpUrl(options.url);
    const limit = options.maxRedirections ?? 20;
    if (!Number.isInteger(limit) || limit < 0 || limit > 100)
      throw new TypeError("重定向次数需在 0–100 之间");
    if (
      options.connectTimeout !== undefined &&
      (!Number.isFinite(options.connectTimeout) ||
        options.connectTimeout <= 0 ||
        options.connectTimeout > 2147483647)
    )
      throw new TypeError("连接超时需为有效的正毫秒数");
    if (!["follow", "manual", "error"].includes(options.redirect))
      throw new TypeError("重定向策略无效");
    if (!["omit", "same-origin", "include"].includes(options.credentials))
      throw new TypeError("网络凭证策略无效");
    if (options.body !== undefined && !(options.body instanceof Uint8Array))
      throw new TypeError("请求内容需为字节数组");
    let requests = this.owners.get(owner);
    if (!requests) this.owners.set(owner, (requests = new Map()));
    if (requests.has(id)) throw new Error("网络请求标识已占用");
    if (requests.size >= 64)
      throw new Error("并行网络请求过多，请完成或取消现有请求后重试");
    const entry: ActiveRequest = {
      controller: new AbortController(),
      reading: false,
    };
    requests.set(id, entry);
    let timedOut = false;
    // Electron fetch exposes response headers rather than a socket-connect hook.
    const timer =
      options.connectTimeout === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            entry.controller.abort();
          }, options.connectTimeout);
    try {
      let method = options.method;
      let body = options.body;
      const headers = new Headers(options.headers);
      let redirected = false;
      for (let redirects = 0; ; redirects++) {
        if (entry.controller.signal.aborted) throw abortError();
        const response = await this.fetcher(
          url.href,
          {
            method,
            headers,
            body,
            redirect: "manual",
            signal: entry.controller.signal,
            // Match a standalone HTTP client: renderer cookies stay out of native calls by default.
            credentials: options.credentials === "include" ? "include" : "omit",
            cache: options.cache,
            referrerPolicy: options.referrerPolicy,
          },
          options
        );
        if (entry.controller.signal.aborted) {
          void response.body?.cancel().catch(() => {});
          throw abortError();
        }
        const location = response.headers.get("location");
        if (
          redirectStatuses.has(response.status) &&
          location &&
          options.redirect !== "manual" &&
          (limit !== 0 || options.redirect === "error")
        ) {
          await response.body?.cancel();
          if (options.redirect === "error")
            throw new TypeError("请求遇到重定向");
          if (redirects >= limit)
            throw new TypeError("请求超过允许的重定向次数");
          const next = httpUrl(new URL(location, url).href);
          if (url.origin !== next.origin) {
            for (const header of [
              "authorization",
              "proxy-authorization",
              "cookie",
              "host",
            ])
              headers.delete(header);
          }
          if (
            (response.status === 303 &&
              method !== "HEAD" &&
              method !== "GET") ||
            ([301, 302].includes(response.status) && method === "POST")
          ) {
            method = "GET";
            body = undefined;
            for (const header of [
              "content-type",
              "content-length",
              "content-encoding",
              "content-language",
              "content-location",
            ])
              headers.delete(header);
          }
          url = next;
          redirected = true;
          continue;
        }
        entry.reader = response.body?.getReader();
        if (!entry.reader) this.remove(owner, id, entry);
        return {
          status: response.status,
          statusText: response.statusText,
          headers: (() => {
            const values: [string, string][] = [];
            response.headers.forEach((value, name) =>
              values.push([name, value])
            );
            return values;
          })(),
          url: url.href,
          redirected,
          hasBody: !!entry.reader,
        };
      }
    } catch (error) {
      const aborted = entry.controller.signal.aborted;
      this.release(owner, id, entry);
      if (timedOut)
        throw Object.assign(
          new Error("网络连接或等待响应头超时，请检查服务地址与网络"),
          { code: "ETIMEDOUT" }
        );
      if (aborted) throw abortError();
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async read(owner: number, id: string): Promise<HttpReadResult> {
    const entry = this.owners.get(owner)?.get(id);
    if (!entry?.reader) throw new Error("网络响应已释放或未获授权");
    if (entry.reading) throw new Error("网络响应正在读取");
    entry.reading = true;
    try {
      const result = entry.remainder
        ? { done: false, value: entry.remainder }
        : await entry.reader.read();
      if (entry.controller.signal.aborted) throw abortError();
      if (result.done) {
        this.remove(owner, id, entry);
        entry.reader.releaseLock();
        return { done: true };
      }
      const value = result.value!;
      const chunk = value.slice(0, 65536);
      entry.remainder =
        value.byteLength > 65536 ? value.subarray(65536) : undefined;
      return { done: false, value: chunk };
    } catch (error) {
      const aborted = entry.controller.signal.aborted;
      this.release(owner, id, entry);
      if (aborted) throw abortError();
      throw error;
    } finally {
      entry.reading = false;
    }
  }
  cancel(owner: number, id: string) {
    const entry = this.owners.get(owner)?.get(id);
    if (!entry) return;
    this.release(owner, id, entry);
  }
  private release(owner: number, id: string, entry: ActiveRequest) {
    this.remove(owner, id, entry);
    entry.controller.abort();
    void entry.reader?.cancel().catch(() => {});
  }
  disposeOwner(owner: number) {
    for (const id of this.owners.get(owner)?.keys() ?? [])
      this.cancel(owner, id);
  }
  private remove(owner: number, id: string, entry: ActiveRequest) {
    const requests = this.owners.get(owner);
    if (requests?.get(id) !== entry) return;
    requests.delete(id);
    if (!requests.size) this.owners.delete(owner);
  }
}
