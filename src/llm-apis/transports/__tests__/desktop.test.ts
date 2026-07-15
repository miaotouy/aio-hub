import { describe, expect, it, vi } from "vitest";

vi.mock("@/llm-apis/common", () => ({
  ensureResponseOk: vi.fn(),
  fetchWithTimeout: vi.fn(),
}));
vi.mock("@/utils/serialization", () => ({
  asyncJsonStringify: vi.fn(),
}));

import { createDesktopLlmTransport } from "../desktop";

describe("desktop LLM transport", () => {
  it("serializes JSON and preserves the response stream contract", async () => {
    const fetch = vi.fn(async () =>
      new Response("first-second", {
        status: 201,
        statusText: "Created",
        headers: { "X-Test": "value" },
      })
    );
    const onResponseChunk = vi.fn();
    const transport = createDesktopLlmTransport({
      fetch,
      ensureResponseOk: vi.fn(async () => undefined),
      serializeJson: vi.fn(async (value) => JSON.stringify(value)),
    });

    const response = await transport.send(
      {
        method: "POST",
        url: "https://example.com/chat",
        headers: { Authorization: "Bearer key" },
        body: { kind: "json", value: { model: "test" } },
        streaming: true,
      },
      {
        requestId: "request-1",
        timeoutMs: 1234,
        network: {
          strategy: "proxy",
          relaxInvalidCerts: true,
          http1Only: true,
        },
        observer: { onResponseChunk },
      }
    );

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/chat",
      expect.objectContaining({
        method: "POST",
        body: '{"model":"test"}',
        forceProxy: true,
        networkStrategy: "proxy",
        relaxIdCerts: true,
        http1Only: true,
        isStreaming: true,
      }),
      1234,
      undefined
    );
    expect(response).toEqual(
      expect.objectContaining({
        status: 201,
        statusText: "Created",
        headers: expect.objectContaining({ "x-test": "value" }),
      })
    );

    const chunks = [];
    for await (const chunk of response.body) chunks.push(chunk);
    expect(new TextDecoder().decode(concat(chunks))).toBe("first-second");
    expect(onResponseChunk).toHaveBeenCalled();
  });

  it("marks legacy local-file payloads for the current Rust proxy", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    const transport = createDesktopLlmTransport({
      fetch,
      ensureResponseOk: vi.fn(async () => undefined),
      serializeJson: vi.fn(async (value) => JSON.stringify(value)),
    });

    await transport.send(
      {
        method: "POST",
        url: "https://example.com/chat",
        headers: {},
        body: {
          kind: "json",
          value: { image: "data:image/png;base64,local-file://image.png" },
        },
        streaming: false,
      },
      { requestId: "request-2" }
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ hasLocalFile: true }),
      undefined,
      undefined
    );
  });

  it("rejects tagged file references until the Rust transport supports them", async () => {
    const transport = createDesktopLlmTransport({
      fetch: vi.fn(),
      ensureResponseOk: vi.fn(),
      serializeJson: vi.fn(),
    });

    await expect(
      transport.send(
        {
          method: "POST",
          url: "https://example.com/chat",
          headers: {},
          body: {
            kind: "json",
            value: { image: { kind: "local-file-ref", path: "image.png" } },
          },
          streaming: false,
        },
        { requestId: "request-3" }
      )
    ).rejects.toThrow("tagged LocalFileRef");
  });
});

function concat(chunks: Uint8Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
