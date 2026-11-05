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

import { afterEach, describe, expect, it, vi } from "vitest";
import { electronFetch } from "./http";

const info = {
  status: 200,
  statusText: "OK",
  headers: [["content-type", "text/plain"]],
  url: "https://example.test/final",
  redirected: true,
  hasBody: true,
};
function bridge(
  handler: (
    operation: string,
    args: Record<string, unknown>
  ) => unknown | Promise<unknown>
) {
  const host = vi.fn(
    async (operation: string, args: Record<string, unknown>) => {
      try {
        return { ok: true, value: await handler(operation, args) };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: (error as { code?: string }).code ?? "HOST_ERROR",
            message: (error as Error).message,
          },
        };
      }
    }
  );
  Object.assign(window, { aiohub: { platform: "electron", request: host } });
  return host;
}
afterEach(() => {
  delete (window as Window & { aiohub?: unknown }).aiohub;
});

describe("Electron fetch facade", () => {
  it("serializes Request bodies, exposes response metadata and pulls bytes only when consumed", async () => {
    const reads = [new Uint8Array([0, 128, 255]), undefined];
    const host = bridge((operation) =>
      operation === "http.start"
        ? info
        : operation === "http.read"
          ? (() => {
              const value = reads.shift();
              return { done: !value, value };
            })()
          : undefined
    );
    const response = await electronFetch(
      new Request("https://example.test/upload", {
        method: "POST",
        body: new Uint8Array([1, 0, 255]),
        headers: { "content-type": "application/octet-stream" },
        credentials: "include",
      })
    );
    expect(host.mock.calls.map(([op]) => op)).toEqual(["http.start"]);
    expect(host.mock.calls[0][1].options).toMatchObject({
      method: "POST",
      body: new Uint8Array([1, 0, 255]),
      credentials: "include",
    });
    expect(response.url).toBe(info.url);
    expect(response.redirected).toBe(true);
    const clone = response.clone();
    expect(clone.url).toBe(info.url);
    expect(clone.redirected).toBe(true);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0, 128, 255])
    );
    expect(response.bodyUsed).toBe(true);
    expect(new Uint8Array(await clone.arrayBuffer())).toEqual(
      new Uint8Array([0, 128, 255])
    );
  });
  it("returns bodyless and unsuccessful HTTP responses through the normal Response contract", async () => {
    bridge((operation) =>
      operation === "http.start"
        ? { ...info, status: 204, statusText: "No Content", hasBody: false }
        : undefined
    );
    const empty = await electronFetch("https://example.test/");
    expect(empty.body).toBeNull();
    expect(await empty.text()).toBe("");
    bridge((operation) =>
      operation === "http.start"
        ? { ...info, status: 503, statusText: "Unavailable", hasBody: false }
        : undefined
    );
    expect((await electronFetch("https://example.test/")).ok).toBe(false);
  });
  it("propagates abort before headers and after headers, and drops bodies explicitly cancelled by consumers", async () => {
    const abort = new AbortController();
    let rejectStart: ((error: Error) => void) | undefined;
    const host = bridge((operation) => {
      if (operation === "http.start")
        return new Promise((_resolve, reject) => {
          rejectStart = reject;
        });
      if (operation === "http.cancel") rejectStart?.(new Error("cancelled"));
    });
    const pending = electronFetch("https://example.test/", {
      signal: abort.signal,
    });
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    abort.abort();
    await rejected;
    expect(host.mock.calls.some(([op]) => op === "http.cancel")).toBe(true);
    const bodyAbort = new AbortController();
    const bodyHost = bridge((operation) =>
      operation === "http.start"
        ? info
        : { done: false, value: new Uint8Array([1]) }
    );
    const response = await electronFetch("https://example.test/", {
      signal: bodyAbort.signal,
    });
    bodyAbort.abort();
    await expect(response.text()).rejects.toMatchObject({ name: "AbortError" });
    expect(bodyHost.mock.calls.some(([op]) => op === "http.cancel")).toBe(true);
    const cancellationHost = bridge((operation) =>
      operation === "http.start" ? info : undefined
    );
    const unused = await electronFetch("https://example.test/");
    await unused.body!.cancel();
    expect(cancellationHost.mock.calls.map(([op]) => op)).toEqual([
      "http.start",
      "http.cancel",
    ]);
  });
  it("reports unsupported security/proxy options before creating a host request", async () => {
    const host = bridge(() => info);
    await expect(
      electronFetch("https://example.test/", {
        proxy: { all: "http://127.0.0.1:8080" },
      })
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    await expect(
      electronFetch("https://example.test/", {
        danger: { acceptInvalidCerts: true },
      })
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(host).not.toHaveBeenCalled();
  });
});
