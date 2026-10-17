import { afterEach, describe, expect, it, vi } from "vitest";
const inspector = vi.hoisted(() => ({
  shouldCaptureInternal: vi.fn(() => true),
  getContext: vi.fn(),
  triggerRequest: vi.fn(),
  triggerResponse: vi.fn(),
  triggerStream: vi.fn(),
  triggerError: vi.fn(),
}));
vi.mock("@/tools/llm-inspector/core/hookRegistry", () => ({
  inspectorHookRegistry: inspector,
}));
import { fetchWithTimeout } from "../common";

describe("shared transport request classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it("工具请求可复用传输且保持模型诊断与默认模型请求行为独立", async () => {
    const fetch = vi.fn(
      async () =>
        new Response('{"ok":true}', {
          headers: { "Content-Type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetch);
    await fetchWithTimeout("https://example.com/v1/tools/search", {
      method: "POST",
      body: '{"query":"news"}',
      networkStrategy: "native",
      requestKind: "tool",
    });
    expect(inspector.triggerRequest).not.toHaveBeenCalled();
    await fetchWithTimeout("https://example.com/v1/chat/completions", {
      method: "POST",
      body: '{"model":"test"}',
      networkStrategy: "native",
    });
    expect(inspector.triggerRequest).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
