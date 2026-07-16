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
    const fetch = vi.fn(
      async () =>
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

  it("routes tagged JSON file references through the native command", async () => {
    const fetch = vi.fn();
    const sendFileRequest = vi.fn(
      async () =>
        new Response('{"ok":true}', {
          status: 202,
          headers: { "X-Native": "yes" },
        })
    );
    const transport = createMobileLlmTransport({
      fetch,
      ensureResponseOk: vi.fn(async () => undefined),
      sendFileRequest,
    });

    const response = await transport.send(
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
      { requestId: "request-4", timeoutMs: 5000 }
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(sendFileRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request-4",
        timeoutMs: 5000,
        body: expect.objectContaining({ kind: "json" }),
      })
    );
    expect(response.status).toBe(202);
  });

  it("serializes top-level and multipart file refs without reading file bytes", async () => {
    const sendFileRequest = vi.fn(async () => new Response("{}"));
    const transport = createMobileLlmTransport({
      fetch: vi.fn(),
      ensureResponseOk: vi.fn(async () => undefined),
      sendFileRequest,
    });

    await transport.send(
      {
        method: "PUT",
        url: "https://example.com/upload",
        headers: {},
        body: {
          kind: "file-ref",
          ref: { kind: "local-file-ref", path: "video.mp4" },
        },
        streaming: false,
      },
      { requestId: "request-file" }
    );
    await transport.send(
      {
        method: "POST",
        url: "https://example.com/edit",
        headers: {},
        body: {
          kind: "multipart",
          parts: [
            { name: "prompt", body: { kind: "text", value: "edit" } },
            {
              name: "image",
              filename: "image.png",
              body: {
                kind: "file-ref",
                ref: { kind: "local-file-ref", path: "image.png" },
              },
            },
          ],
        },
        streaming: false,
      },
      { requestId: "request-multipart" }
    );

    expect(sendFileRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: expect.objectContaining({ kind: "file-ref" }),
      })
    );
    expect(sendFileRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: expect.objectContaining({
          kind: "multipart",
          parts: expect.arrayContaining([
            expect.objectContaining({
              body: expect.objectContaining({ kind: "file-ref" }),
            }),
          ]),
        }),
      })
    );
  });

  it("cancels an in-flight native file request", async () => {
    const controller = new AbortController();
    const cancelFileRequest = vi.fn(async () => true);
    const sendFileRequest = vi.fn(
      () =>
        new Promise<Response>((_, reject) => {
          controller.signal.addEventListener("abort", () =>
            reject(new Error("cancelled"))
          );
        })
    );
    const transport = createMobileLlmTransport({
      fetch: vi.fn(),
      ensureResponseOk: vi.fn(),
      sendFileRequest,
      cancelFileRequest,
    });
    const pending = transport.send(
      {
        method: "PUT",
        url: "https://example.com/upload",
        headers: {},
        body: {
          kind: "file-ref",
          ref: { kind: "local-file-ref", path: "video.mp4" },
        },
        streaming: false,
      },
      { requestId: "request-cancel", signal: controller.signal }
    );
    controller.abort();

    await expect(pending).rejects.toThrow("cancelled");
    expect(cancelFileRequest).toHaveBeenCalledWith("request-cancel");
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
