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

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { HttpRequests } from "./http";
import type { HttpRequestOptions } from "./shared";

let server: Server;
let origin: string;
let service: HttpRequests;
let finishStream: (() => void) | undefined;
const defaults = (
  pathname: string,
  overrides: Partial<HttpRequestOptions> = {}
): HttpRequestOptions => ({
  url: origin + pathname,
  method: "GET",
  headers: [],
  redirect: "follow",
  credentials: "omit",
  ...overrides,
});
async function body(owner: number, id: string) {
  const chunks: Uint8Array[] = [];
  for (;;) {
    const chunk = await service.read(owner, id);
    if (chunk.done) break;
    chunks.push(chunk.value!);
  }
  return Buffer.concat(chunks);
}
beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (req.url === "/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write("data: first\n\n");
      finishStream = () => res.end("data: last\n\n");
      return;
    }
    if (req.url === "/slow") {
      return;
    }
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/echo" });
      res.end();
      return;
    }
    if (req.url === "/foreign") {
      res.writeHead(307, {
        Location: origin.replace("127.0.0.1", "localhost") + "/echo",
      });
      res.end();
      return;
    }
    if (req.url === "/unsafe") {
      res.writeHead(302, { Location: "file:///private" });
      res.end();
      return;
    }
    if (req.url === "/loop") {
      res.writeHead(302, { Location: "/loop" });
      res.end();
      return;
    }
    if (req.url === "/empty") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url === "/large") {
      res.end(Buffer.alloc(180000, 255));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    res.writeHead(req.url === "/error" ? 429 : 200, {
      "Content-Type": "application/json",
      "X-Result": "native",
    });
    res.end(
      JSON.stringify({
        method: req.method,
        bytes: Array.from(Buffer.concat(chunks)),
        authorization: req.headers.authorization ?? null,
        cookie: req.headers.cookie ?? null,
        contentType: req.headers["content-type"] ?? null,
      })
    );
  });
  server.listen(0);
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(() => {
  service?.disposeOwner(1);
  service?.disposeOwner(2);
  finishStream?.();
  finishStream = undefined;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Electron native HTTP transport", () => {
  it("preserves status, headers and binary uploads without treating HTTP errors as transport failures", async () => {
    service = new HttpRequests(fetch);
    const info = await service.start(
      1,
      "upload",
      defaults("/error", {
        method: "POST",
        body: new Uint8Array([0, 128, 255]),
        headers: [["Content-Type", "application/octet-stream"]],
      })
    );
    expect(info).toMatchObject({
      status: 429,
      url: origin + "/error",
      hasBody: true,
      redirected: false,
    });
    expect(info.headers).toContainEqual(["x-result", "native"]);
    expect(JSON.parse((await body(1, "upload")).toString())).toMatchObject({
      method: "POST",
      bytes: [0, 128, 255],
    });
    expect(await service.start(1, "empty", defaults("/empty"))).toMatchObject({
      status: 204,
      hasBody: false,
    });
  });
  it("returns streaming bytes before completion and bounds each IPC payload", async () => {
    service = new HttpRequests(fetch);
    await service.start(
      1,
      "stream",
      defaults("/stream", { connectTimeout: 1000 })
    );
    const first = await service.read(1, "stream");
    expect(Buffer.from(first.value!).toString()).toBe("data: first\n\n");
    finishStream!();
    expect((await body(1, "stream")).toString()).toBe("data: last\n\n");
    await service.start(1, "large", defaults("/large"));
    let count = 0;
    for (;;) {
      const next = await service.read(1, "large");
      if (next.done) break;
      expect(next.value!.byteLength).toBeLessThanOrEqual(65536);
      count += next.value!.byteLength;
    }
    expect(count).toBe(180000);
  });
  it("isolates request ownership and cancels pending headers and readers on owner teardown", async () => {
    service = new HttpRequests(fetch);
    await service.start(1, "owned", defaults("/stream"));
    await expect(service.read(2, "owned")).rejects.toThrow("未获授权");
    service.cancel(2, "owned");
    expect((await service.read(1, "owned")).done).toBe(false);
    const pendingRead = service.read(1, "owned");
    const rejectedRead = expect(pendingRead).rejects.toMatchObject({
      code: "ABORT_ERR",
    });
    service.disposeOwner(1);
    await rejectedRead;
    const pendingHeaders = service.start(1, "pending", defaults("/slow"));
    const rejectedHeaders = expect(pendingHeaders).rejects.toMatchObject({
      code: "ABORT_ERR",
    });
    service.cancel(1, "pending");
    await rejectedHeaders;
    service.cancel(1, "pending");
  });
  it("times out waiting for headers while leaving the body lifetime to the caller", async () => {
    service = new HttpRequests(fetch);
    await expect(
      service.start(1, "timeout", defaults("/slow", { connectTimeout: 20 }))
    ).rejects.toMatchObject({ code: "ETIMEDOUT" });
    await service.start(
      1,
      "stream",
      defaults("/stream", { connectTimeout: 100 })
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await service.read(1, "stream")).done).toBe(false);
  });
  it("follows HTTP redirects with method rewriting and strips credentials on origin changes", async () => {
    service = new HttpRequests(fetch);
    const opts = {
      method: "POST",
      body: new Uint8Array([1, 2]),
      headers: [
        ["authorization", "Bearer demo"],
        ["cookie", "demo=1"],
        ["content-type", "text/plain"],
      ] as [string, string][],
    };
    expect(
      await service.start(1, "redirect", defaults("/redirect", opts))
    ).toMatchObject({ url: origin + "/echo", redirected: true });
    expect(JSON.parse((await body(1, "redirect")).toString())).toMatchObject({
      method: "GET",
      bytes: [],
      authorization: "Bearer demo",
      contentType: null,
    });
    await service.start(1, "foreign", defaults("/foreign", opts));
    expect(JSON.parse((await body(1, "foreign")).toString())).toMatchObject({
      method: "POST",
      bytes: [1, 2],
      authorization: null,
      cookie: null,
    });
    expect(
      await service.start(
        1,
        "manual",
        defaults("/redirect", { maxRedirections: 0 })
      )
    ).toMatchObject({ status: 302, redirected: false });
    service.cancel(1, "manual");
    await expect(
      service.start(1, "unsafe", defaults("/unsafe"))
    ).rejects.toThrow("HTTP/HTTPS");
    await expect(
      service.start(1, "loop", defaults("/loop", { maxRedirections: 1 }))
    ).rejects.toThrow("重定向次数");
    await expect(
      service.start(
        1,
        "error",
        defaults("/redirect", { redirect: "error", maxRedirections: 0 })
      )
    ).rejects.toThrow("遇到重定向");
  });
});
