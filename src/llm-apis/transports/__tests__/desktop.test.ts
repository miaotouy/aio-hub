import { describe, expect, it, vi } from "vitest";
import { runTransportContract } from "@aiohub/llm-core/testing";

vi.mock("@/llm-apis/common", () => ({
  ensureResponseOk: vi.fn(),
  fetchWithTimeout: vi.fn(),
}));
vi.mock("@/utils/serialization", () => ({
  asyncJsonStringify: vi.fn(),
}));

import { createDesktopLlmTransport } from "../desktop";

runTransportContract({
  name: "desktop shared transport contract",
  createTransport: ({ fetch, ensureResponseOk }) =>
    createDesktopLlmTransport({
      fetch,
      ensureResponseOk,
      serializeJson: async (value) => JSON.stringify(value),
    }),
});

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

  it("routes tagged JSON file references through native expansion", async () => {
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
          value: {
            image: {
              kind: "local-file-ref",
              path: "image.png",
              contentType: "image/png",
            },
          },
        },
        streaming: false,
      },
      { requestId: "request-3" }
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        hasLocalFile: true,
        body: expect.stringContaining('"kind":"local-file-ref"'),
      }),
      undefined,
      undefined
    );
  });

  it("sends top-level file references as native file bodies", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    const transport = createDesktopLlmTransport({
      fetch,
      ensureResponseOk: vi.fn(async () => undefined),
      serializeJson: vi.fn(async (value) => JSON.stringify(value)),
    });

    await transport.send(
      {
        method: "PUT",
        url: "https://example.com/upload",
        headers: {},
        body: {
          kind: "file-ref",
          ref: {
            kind: "local-file-ref",
            path: "video.mp4",
            contentType: "video/mp4",
          },
        },
        streaming: false,
      },
      { requestId: "request-4", network: { strategy: "native" } }
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        hasLocalFile: true,
        proxyBodyKind: "file-ref",
        networkStrategy: "native",
      }),
      undefined,
      undefined
    );
  });

  it("uses a native multipart manifest when a part references a file", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    const transport = createDesktopLlmTransport({
      fetch,
      ensureResponseOk: vi.fn(async () => undefined),
      serializeJson: vi.fn(async (value) => JSON.stringify(value)),
    });

    await transport.send(
      {
        method: "POST",
        url: "https://example.com/images/edits",
        headers: {},
        body: {
          kind: "multipart",
          parts: [
            { name: "prompt", body: { kind: "text", value: "edit" } },
            {
              name: "image",
              filename: "input.png",
              body: {
                kind: "file-ref",
                ref: {
                  kind: "local-file-ref",
                  path: "input.png",
                  contentType: "image/png",
                },
              },
            },
          ],
        },
        streaming: false,
      },
      { requestId: "request-5" }
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        hasLocalFile: true,
        proxyBodyKind: "multipart-manifest",
        body: expect.stringContaining('"kind":"file-ref"'),
      }),
      undefined,
      undefined
    );
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
