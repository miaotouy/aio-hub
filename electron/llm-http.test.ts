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

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { llmHttpFetch, proxyFromPac } from "./llm-http";
import { HttpRequests } from "./http";
import type { HttpRequestOptions, LlmHttpOptions } from "./shared";

let server: Server;
let origin: string;
let directory: string;
let filename: string;
let service: HttpRequests;
let finish: (() => void) | undefined;
const localBytes = Buffer.from([0, 1, 127, 128, 255]);
const config: LlmHttpOptions = {
  bodyKind: "raw",
  expandJson: false,
  proxy: { mode: "none" },
  relaxIdCerts: false,
};
const resolveProxy = vi.fn(async () => "DIRECT");
function options(
  route: string,
  body?: unknown,
  llm: Partial<LlmHttpOptions> = {}
): HttpRequestOptions {
  return {
    url: origin + route,
    method: body === undefined ? "GET" : "POST",
    headers: [
      ["Content-Type", "application/json"],
      ["Authorization", "Bearer local-test"],
    ],
    body: body === undefined ? undefined : Buffer.from(JSON.stringify(body)),
    redirect: "follow",
    credentials: "omit",
    llm: { ...config, ...llm },
  };
}
async function consume(id: string) {
  const chunks: Uint8Array[] = [];
  for (;;) {
    const next = await service.read(1, id);
    if (next.done) return Buffer.concat(chunks);
    chunks.push(next.value!);
  }
}
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "aio-llm-http-"));
  filename = path.join(directory, "附件.bin");
  await fs.writeFile(filename, localBytes);
  server = createServer(async (req, res) => {
    if (req.url === "/stream") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: first\n\n");
      finish = () => res.end("data: last\n\n");
      return;
    }
    if (req.url === "/slow") return;
    if (req.url === "/gzip") {
      res.writeHead(200, { "content-encoding": "gzip" });
      res.end(gzipSync("compressed response"));
      return;
    }
    if (req.url === "/redirect") {
      res.writeHead(307, { location: "/echo" });
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    res.setHeader("content-type", "application/json");
    if (req.headers["content-type"]?.startsWith("multipart/form-data")) {
      const form = await new Request(origin, {
        method: "POST",
        headers: { "content-type": req.headers["content-type"] },
        body,
      }).formData();
      const entries = [];
      for (const [key, value] of form)
        entries.push([
          key,
          typeof value === "string"
            ? value
            : {
                name: value.name,
                type: value.type,
                data: Buffer.from(await value.arrayBuffer()).toString("base64"),
              },
        ]);
      res.end(JSON.stringify(entries));
    } else
      res.end(
        JSON.stringify({
          url: req.url,
          body: body.toString("base64"),
          authorization: req.headers.authorization,
        })
      );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  service = new HttpRequests((url, init, opts) =>
    llmHttpFetch(url, init, opts.llm!, resolveProxy)
  );
});
afterAll(async () => {
  finish?.();
  service.disposeOwner(1);
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(directory, { recursive: true, force: true });
});
describe("Electron model transport", () => {
  it("expands only tagged and legacy data URL references, preserving plain user text and authentication", async () => {
    const body = {
      image: {
        kind: "local-file-ref",
        path: filename,
        contentType: "image/png",
      },
      legacy:
        "data:audio/wav;base64,local-file://" + encodeURIComponent(filename),
      text: "mention local-file://anything",
      path: filename,
    };
    await service.start(
      1,
      "json",
      options("/echo", body, { expandJson: true })
    );
    const result = JSON.parse((await consume("json")).toString());
    expect(result.authorization).toBe("Bearer local-test");
    expect(JSON.parse(Buffer.from(result.body, "base64").toString())).toEqual({
      image: "data:image/png;base64," + localBytes.toString("base64"),
      legacy: "data:audio/wav;base64," + localBytes.toString("base64"),
      text: body.text,
      path: filename,
    });
  });
  it("uploads raw files and reopens them correctly on a 307 redirect", async () => {
    const info = await service.start(
      1,
      "file",
      options(
        "/redirect",
        { kind: "local-file-ref", path: filename },
        { bodyKind: "file-ref" }
      )
    );
    expect(info.redirected).toBe(true);
    expect(JSON.parse((await consume("file")).toString()).body).toBe(
      localBytes.toString("base64")
    );
  });
  it("encodes text, bytes and repeated multipart files with MIME and filename metadata", async () => {
    const parts = [
      { name: "prompt", body: { kind: "text", value: "中文 prompt" } },
      {
        name: "image",
        filename: "first.bin",
        contentType: "application/octet-stream",
        body: { kind: "bytes", base64: localBytes.toString("base64") },
      },
      {
        name: "image",
        filename: "second.bin",
        body: {
          kind: "file-ref",
          ref: {
            kind: "local-file-ref",
            path: filename,
            contentType: "image/png",
          },
        },
      },
    ];
    await service.start(
      1,
      "multipart",
      options("/echo", { parts }, { bodyKind: "multipart-manifest" })
    );
    expect(JSON.parse((await consume("multipart")).toString())).toEqual([
      ["prompt", "中文 prompt"],
      [
        "image",
        {
          name: "first.bin",
          type: "application/octet-stream",
          data: localBytes.toString("base64"),
        },
      ],
      [
        "image",
        {
          name: "second.bin",
          type: "image/png",
          data: localBytes.toString("base64"),
        },
      ],
    ]);
  });
  it("rejects malformed references before sending and never treats arbitrary objects as files", async () => {
    await expect(
      service.start(
        1,
        "invalid",
        options(
          "/echo",
          { kind: "local-file-ref", path: filename, extra: true },
          { bodyKind: "file-ref" }
        )
      )
    ).rejects.toThrow("本地文件引用无效");
    await expect(
      service.start(
        1,
        "missing",
        options(
          "/echo",
          { kind: "local-file-ref", path: path.join(directory, "missing") },
          { bodyKind: "file-ref" }
        )
      )
    ).rejects.toThrow();
  });
  it("streams before completion, cancels after headers, and frees request ownership", async () => {
    await service.start(1, "sse", options("/stream"));
    expect(Buffer.from((await service.read(1, "sse")).value!).toString()).toBe(
      "data: first\n\n"
    );
    const pending = service.read(1, "sse");
    service.cancel(1, "sse");
    await expect(pending).rejects.toThrow();
    await expect(service.read(1, "sse")).rejects.toThrow("网络响应已释放");
  });
  it("times out waiting for headers and decodes compressed responses", async () => {
    await expect(
      service.start(1, "slow", { ...options("/slow"), connectTimeout: 30 })
    ).rejects.toMatchObject({ code: "ETIMEDOUT" });
    await service.start(1, "gzip", options("/gzip"));
    expect((await consume("gzip")).toString()).toBe("compressed response");
  });
  it("honors request-local custom/system/direct proxy modes and loopback bypass", async () => {
    const target = "http://provider.invalid/v1/chat/completions";
    const call = async (
      proxy: LlmHttpOptions["proxy"],
      resolver = resolveProxy
    ) =>
      llmHttpFetch(
        target,
        {
          method: "POST",
          body: Buffer.from("hello"),
          headers: { authorization: "Bearer proxy-test" },
        },
        { ...config, proxy },
        resolver
      );
    const custom = await call({ mode: "custom", customUrl: origin });
    expect(await custom.json()).toMatchObject({
      url: target,
      authorization: "Bearer proxy-test",
      body: Buffer.from("hello").toString("base64"),
    });
    const resolver = vi.fn(
      async () =>
        "PROXY 127.0.0.1:" + (server.address() as { port: number }).port
    );
    const system = await call({ mode: "system" }, resolver);
    expect((await system.json()).url).toBe(target);
    expect(resolver).toHaveBeenCalledWith(target);
    await expect(call({ mode: "none" })).rejects.toThrow();
    const local = await llmHttpFetch(
      origin,
      { method: "GET" },
      {
        ...config,
        proxy: { mode: "custom", customUrl: "http://unreachable.invalid" },
      },
      resolver
    );
    expect(local.status).toBe(200);
    await local.text();
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(proxyFromPac("SOCKS5 host:1080; DIRECT")).toBe(
      "socks5h://host:1080"
    );
  });
});
