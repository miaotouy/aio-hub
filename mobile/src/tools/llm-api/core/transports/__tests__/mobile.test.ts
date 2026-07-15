import { describe, expect, it, vi } from "vitest";
import { runTransportContract } from "@aiohub/llm-core/testing";

vi.mock("../../common", () => ({
  ensureResponseOk: vi.fn(),
  fetchWithTimeout: vi.fn(),
}));

import { createMobileLlmTransport } from "../mobile";

runTransportContract({
  name: "mobile shared transport contract",
  createTransport: ({ fetch, ensureResponseOk }) =>
    createMobileLlmTransport({ fetch, ensureResponseOk }),
});

describe("mobile LLM transport", () => {
  it("serializes JSON and preserves response status, headers, and chunks", async () => {
    const fetch = vi.fn(async () =>
      new Response("first-second", {
        status: 201,
        statusText: "Created",
        headers: { "X-Test": "value" },
      })
    );
    const ensureResponseOk = vi.fn(async () => undefined);
    const onRequest = vi.fn();
    const onResponseStart = vi.fn();
    const onResponseChunk = vi.fn();
    const transport = createMobileLlmTransport({ fetch, ensureResponseOk });

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
        network: { relaxInvalidCerts: true, http1Only: true },
        observer: { onRequest, onResponseStart, onResponseChunk },
      }
    );

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/chat",
      expect.objectContaining({
        method: "POST",
        body: '{"model":"test"}',
        relaxIdCerts: true,
        http1Only: true,
      }),
      1234,
      undefined
    );
    expect(ensureResponseOk).toHaveBeenCalledOnce();
    expect(response).toEqual(
      expect.objectContaining({
        status: 201,
        statusText: "Created",
        headers: expect.objectContaining({ "x-test": "value" }),
      })
    );

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.body) chunks.push(chunk);
    expect(new TextDecoder().decode(concat(chunks))).toBe("first-second");
    expect(onRequest).toHaveBeenCalledOnce();
    expect(onResponseStart).toHaveBeenCalledOnce();
    expect(onResponseChunk).toHaveBeenCalled();
  });

  it("forwards cancellation and timeout controls to the platform fetch", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    const controller = new AbortController();
    const transport = createMobileLlmTransport({
      fetch,
      ensureResponseOk: vi.fn(async () => undefined),
    });

    await transport.send(
      {
        method: "GET",
        url: "https://example.com/models",
        headers: {},
        streaming: false,
      },
      {
        requestId: "request-2",
        timeoutMs: 4321,
        signal: controller.signal,
      }
    );

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/models",
      expect.objectContaining({ method: "GET" }),
      4321,
      controller.signal
    );
  });

  it("reports status validation failures through the observer", async () => {
    const error = new Error("upstream rejected request");
    const onError = vi.fn();
    const transport = createMobileLlmTransport({
      fetch: vi.fn(async () => new Response("failed", { status: 500 })),
      ensureResponseOk: vi.fn(async () => {
        throw error;
      }),
    });

    await expect(
      transport.send(
        {
          method: "POST",
          url: "https://example.com/chat",
          headers: {},
          streaming: false,
        },
        { requestId: "request-3", observer: { onError } }
      )
    ).rejects.toBe(error);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "request-3", error })
    );
  });

  it("rejects tagged file references until native expansion is implemented", async () => {
    const fetch = vi.fn();
    const transport = createMobileLlmTransport({
      fetch,
      ensureResponseOk: vi.fn(),
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
        { requestId: "request-4" }
      )
    ).rejects.toThrow("tagged LocalFileRef");
    expect(fetch).not.toHaveBeenCalled();
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
