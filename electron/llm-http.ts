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

import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { prepareLlmBody } from "./llm-body";
import type { LlmHttpOptions } from "./shared";

/** Electron supplies OS/PAC resolution; explicit proxy settings stay local to each request. */
export function proxyFromPac(pac: string): string {
  for (const rule of pac.split(";")) {
    const [scheme, address] = rule.trim().split(/\s+/);
    if (scheme === "DIRECT") return "";
    const protocol = (
      {
        PROXY: "http",
        HTTPS: "https",
        SOCKS: "socks4",
        SOCKS4: "socks4",
        SOCKS5: "socks5h",
      } as Record<string, string>
    )[scheme];
    if (protocol && address) return protocol + "://" + address;
  }
  throw new TypeError("系统代理未返回可用地址");
}
function loopback(url: URL): boolean {
  return (
    url.hostname === "localhost" ||
    url.hostname === "[::1]" ||
    /^127\./.test(url.hostname)
  );
}
export async function llmHttpFetch(
  address: string,
  init: RequestInit,
  options: LlmHttpOptions,
  resolveProxy: (url: string) => Promise<string>
): Promise<Response> {
  const url = new URL(address);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new TypeError("模型请求需使用 HTTP/HTTPS 地址");
  if (
    !options ||
    !["raw", "file-ref", "multipart-manifest"].includes(options.bodyKind) ||
    !["system", "none", "custom"].includes(options.proxy?.mode) ||
    typeof options.relaxIdCerts !== "boolean" ||
    typeof options.expandJson !== "boolean"
  )
    throw new TypeError("模型网络配置无效");
  const signal = init.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  const upload = await prepareLlmBody(
    init.body as Uint8Array | undefined,
    new Headers(init.headers),
    options,
    signal
  );
  // Do not forward Rust proxy-control headers to a provider.
  for (const name of [...upload.headers.keys()]) {
    if (name.startsWith("x-aio-") || name === "x-proxy-token")
      upload.headers.delete(name);
  }
  let proxy = "";
  if (!loopback(url) && options.proxy.mode !== "none") {
    if (options.proxy.mode === "custom") {
      if (
        typeof options.proxy.customUrl !== "string" ||
        !options.proxy.customUrl
      )
        throw new TypeError("请填写自定义代理地址");
      proxy = options.proxy.customUrl;
    } else proxy = proxyFromPac(await resolveProxy(address));
  }
  signal.throwIfAborted();
  let agent: http.Agent | undefined;
  if (proxy) {
    const parsed = new URL(proxy);
    if (["http:", "https:"].includes(parsed.protocol)) {
      agent =
        url.protocol === "https:"
          ? new HttpsProxyAgent(parsed)
          : new HttpProxyAgent(parsed);
    } else if (
      ["socks:", "socks4:", "socks4a:", "socks5:", "socks5h:"].includes(
        parsed.protocol
      )
    ) {
      agent = new SocksProxyAgent(parsed);
    } else throw new TypeError("代理地址需使用 HTTP、HTTPS 或 SOCKS 协议");
  }
  if (!upload.headers.has("accept-encoding"))
    upload.headers.set("accept-encoding", "gzip, deflate, br");
  // HTTP/1.1 preserves the desktop default and works when http1Only is relaxed as well.
  return new Promise<Response>((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request(url, {
      method: init.method,
      headers: Object.fromEntries(upload.headers),
      signal,
      agent: agent ?? false,
      rejectUnauthorized: !options.relaxIdCerts,
    });
    const dispose = () => agent?.destroy();
    request.once("error", (error) => {
      dispose();
      reject(error);
    });
    request.once("response", (incoming) => {
      try {
        const headers = new Headers();
        for (let i = 0; i < incoming.rawHeaders.length; i += 2)
          headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
        const status = incoming.statusCode!;
        const hasBody =
          init.method !== "HEAD" && ![204, 205, 304].includes(status);
        incoming.once("close", dispose);
        if (!hasBody) {
          incoming.resume();
          resolve(
            new Response(null, {
              status,
              statusText: incoming.statusMessage,
              headers,
            })
          );
          return;
        }
        const encoding = headers.get("content-encoding")?.toLowerCase();
        const decoder =
          encoding === "gzip"
            ? createGunzip()
            : encoding === "deflate"
              ? createInflate()
              : encoding === "br"
                ? createBrotliDecompress()
                : undefined;
        const stream = decoder ?? incoming;
        if (decoder) {
          headers.delete("content-encoding");
          headers.delete("content-length");
          void pipeline(incoming, decoder).catch(() => {});
        }
        stream.once("close", () => {
          incoming.destroy();
          dispose();
        });
        const body = Readable.toWeb(
          stream
        ) as unknown as ReadableStream<Uint8Array>;
        resolve(
          new Response(body, {
            status,
            statusText: incoming.statusMessage,
            headers,
          })
        );
      } catch (error) {
        incoming.destroy();
        request.destroy();
        dispose();
        reject(error);
      }
    });
    void pipeline(Readable.from(upload.chunks), request).catch((error) => {
      request.destroy();
      dispose();
      reject(error);
    });
  });
}
