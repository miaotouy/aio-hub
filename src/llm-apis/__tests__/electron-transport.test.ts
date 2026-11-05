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
const host = vi.hoisted(() => ({ fetch: vi.fn(), invoke: vi.fn() }));
vi.mock("@/platform/modules/llm-http", () => ({
  isElectronRuntime: () => true,
  fetchElectronLlm: host.fetch,
}));
vi.mock("@/platform/native/core", () => ({ invoke: host.invoke }));
vi.mock("@/stores/appSettingsStore", () => ({
  useAppSettingsStore: () => ({
    settings: { proxy: { mode: "custom", customUrl: "http://localhost:8080" } },
  }),
}));
vi.mock("@/tools/llm-inspector/core/hookRegistry", () => ({
  inspectorHookRegistry: { shouldCaptureInternal: () => false },
}));
import { fetchWithTimeout, TimeoutError } from "../common";
afterEach(() => vi.clearAllMocks());
describe("model request Electron routing", () => {
  it("uses host transport by default and preserves tagged payloads for host-only expansion", async () => {
    const reply = new Response("ok");
    host.fetch.mockResolvedValue(reply);
    const body = JSON.stringify({
      image: { kind: "local-file-ref", path: "C:/example.png" },
    });
    expect(
      await fetchWithTimeout("https://provider.test/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer example",
        },
        body,
        hasLocalFile: true,
      })
    ).toBe(reply);
    const [url, init, settings] = host.fetch.mock.calls[0];
    expect(url).toBe("https://provider.test/chat");
    expect(init.body).toBe(body);
    expect(init.headers.get("authorization")).toBe("Bearer example");
    expect(settings).toEqual({
      bodyKind: "raw",
      expandJson: true,
      relaxIdCerts: true,
      proxy: { mode: "custom", customUrl: "http://localhost:8080" },
    });
    expect(host.invoke).not.toHaveBeenCalled();
  });
  it("keeps external cancellation connected after headers and respects the caller signal", async () => {
    host.fetch.mockResolvedValue(new Response("ok"));
    const external = new AbortController();
    const caller = new AbortController();
    await fetchWithTimeout(
      "https://provider.test/chat",
      { method: "GET", signal: caller.signal, networkStrategy: "native" },
      1000,
      external.signal
    );
    const signal = host.fetch.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    external.abort(new DOMException("stop streaming", "AbortError"));
    expect(signal.aborted).toBe(true);
    expect(signal.reason.message).toBe("stop streaming");
    await fetchWithTimeout("https://provider.test/chat", {
      method: "GET",
      signal: caller.signal,
    });
    caller.abort();
    expect(host.fetch.mock.calls[1][1].signal.aborted).toBe(true);
  });
  it("preserves timeout errors and explicit multipart/strict certificate settings", async () => {
    host.fetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () =>
            reject(init.signal.reason)
          )
        )
    );
    await expect(
      fetchWithTimeout(
        "https://provider.test/upload",
        {
          body: '{"parts":[]}',
          proxyBodyKind: "multipart-manifest",
          relaxIdCerts: false,
        },
        10
      )
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(host.fetch.mock.calls[0][2]).toMatchObject({
      bodyKind: "multipart-manifest",
      expandJson: false,
      relaxIdCerts: false,
    });
  });
});
