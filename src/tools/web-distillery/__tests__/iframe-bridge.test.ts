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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@/platform/native/core";
import { iframeBridge } from "../core/iframe-bridge";
vi.mock("@/platform/native/core", () => ({ invoke: vi.fn() }));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
vi.mock("../core/cookie-profile-store", () => ({
  cookieProfileStore: {
    load: vi.fn(),
    getActiveProfileForUrl: vi.fn(async () => null),
  },
}));
const store = vi.hoisted(() => ({
  setWebviewCreated: vi.fn(),
  setLoading: vi.fn(),
  setPickerMode: vi.fn(),
  setHoveredElement: vi.fn(),
}));
vi.mock("../stores/store", () => ({ useWebDistilleryStore: () => store }));
const origin = "http://0123456789abcdef0123456789abcdef.localhost:12345";
let container: HTMLElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.mocked(invoke)
    .mockReset()
    .mockImplementation(async (command) => {
      if (command === "distillery_get_proxy_port") return 0 as any;
      if (command === "distillery_start_proxy") return 12345 as any;
      if (command === "distillery_get_proxy_origin") return origin as any;
      return null as any;
    });
});
afterEach(async () => {
  await iframeBridge.forceCleanup();
  iframeBridge.dispose();
  container.remove();
  await Promise.resolve();
});
async function create() {
  const promise = iframeBridge.create({
    url: "https://example.test/article",
    container,
  });
  await vi.waitFor(() =>
    expect(container.querySelector("iframe")).not.toBeNull()
  );
  const frame = container.querySelector("iframe")!;
  frame.dispatchEvent(new Event("load"));
  await promise;
  return frame;
}
function deliver(frame: HTMLIFrameElement, payload: unknown, sender = origin) {
  window.dispatchEvent(
    new MessageEvent("message", {
      source: frame.contentWindow,
      origin: sender,
      data: payload,
    })
  );
}
function recordRequests(frame: HTMLIFrameElement) {
  const responses: any[] = [];
  vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(((
    message: any
  ) => {
    const remote = {
      location: { href: "https://example.test/article" },
      __DISTILLERY_BRIDGE__: {
        send: (payload: unknown) => responses.push(payload),
      },
    };
    const doc = {
      readyState: "complete",
      querySelector: () => true,
      documentElement: { outerHTML: "<article>snapshot</article>" },
      title: "Article",
    };
    new Function("window", "document", message.script)(remote, doc);
  }) as any);
  return responses;
}
describe("isolated browser extraction sessions", () => {
  it("restores the explicitly bound recipe identity before navigation", async () => {
    const ready = iframeBridge.create({
      url: "https://example.test/article",
      container,
      profile: {
        id: "recipe-profile",
        name: "Recipe identity",
        cookies: [{ name: "session", value: "synthetic" }],
        localStorage: { token: "fixture" },
      } as any,
    });
    await vi.waitFor(() =>
      expect(container.querySelector("iframe")).not.toBeNull()
    );
    container.querySelector("iframe")!.dispatchEvent(new Event("load"));
    await ready;
    expect(invoke).toHaveBeenCalledWith("distillery_set_proxy_cookies", {
      cookies: "session=synthetic",
    });
    expect(invoke).toHaveBeenCalledWith("distillery_set_proxy_local_storage", {
      data: JSON.stringify({ token: "fixture" }),
    });
  });
  it("loads only the private proxy origin and ignores messages from a different origin", async () => {
    const frame = await create();
    expect(new URL(frame.src).origin).toBe(origin);
    const replies = recordRequests(frame);
    const pending = iframeBridge.extractCurrentDom();
    await Promise.resolve();
    let finished = false;
    void pending.then(() => {
      finished = true;
    });
    deliver(frame, replies[0], "https://attacker.test");
    await Promise.resolve();
    expect(finished).toBe(false);
    deliver(frame, replies[0]);
    expect((await pending).html).toBe("<article>snapshot</article>");
  });
  it("associates reversed concurrent replies with their original requests", async () => {
    const frame = await create();
    const replies = recordRequests(frame);
    const first = iframeBridge.extractCurrentDom();
    const second = iframeBridge.extractCurrentDom();
    await Promise.resolve();
    expect(replies).toHaveLength(2);
    deliver(frame, { ...replies[1], html: "second" });
    deliver(frame, { ...replies[0], html: "first" });
    expect((await first).html).toBe("first");
    expect((await second).html).toBe("second");
  });
  it("rejects outstanding waits and stops the native proxy on cleanup", async () => {
    await create();
    const dom = expect(iframeBridge.waitForDomExtracted()).rejects.toThrow(
      "关闭"
    );
    const cookies = expect(
      iframeBridge.waitForCookiesExtracted()
    ).rejects.toThrow("关闭");
    const storage = expect(
      iframeBridge.waitForLocalStorageExtracted()
    ).rejects.toThrow("关闭");
    await iframeBridge.forceCleanup();
    await Promise.all([dom, cookies, storage]);
    expect(container.querySelector("iframe")).toBeNull();
    expect(invoke).toHaveBeenCalledWith("distillery_stop_proxy");
  });
  it("does not create a frame or server after cleanup during initialization", async () => {
    let finish!: (value: number) => void;
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = iframeBridge.create({
      url: "https://example.test/article",
      container,
    });
    await Promise.resolve();
    const cleanup = iframeBridge.forceCleanup();
    finish(0);
    await cleanup;
    await expect(pending).rejects.toThrow("关闭");
    expect(container.querySelector("iframe")).toBeNull();
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some((call) => call[0] === "distillery_start_proxy")
    ).toBe(false);
  });
  it("ignores an expired DOM reply rather than completing the next extraction", async () => {
    const frame = await create();
    const replies = recordRequests(frame);
    const old = iframeBridge.waitForDomExtracted(5);
    const failed = expect(old).rejects.toThrow("超时");
    await iframeBridge.extractDom();
    await failed;
    const next = iframeBridge.extractCurrentDom();
    await Promise.resolve();
    let finished = false;
    void next.then(() => {
      finished = true;
    });
    deliver(frame, replies[0]);
    await Promise.resolve();
    expect(finished).toBe(false);
    deliver(frame, replies[1]);
    expect((await next).html).toBe("<article>snapshot</article>");
  });
});
