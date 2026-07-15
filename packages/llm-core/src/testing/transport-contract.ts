import { describe, expect, it, vi } from "vitest";
import type { LlmTransport } from "../types/transport";

export interface TransportContractDependencies {
  fetch: (
    url: string,
    options: RequestInit,
    timeout?: number,
    signal?: AbortSignal
  ) => Promise<Response>;
  ensureResponseOk: (response: Response) => Promise<void>;
}

export interface TransportContractOptions {
  name: string;
  createTransport: (
    dependencies: TransportContractDependencies
  ) => LlmTransport;
}

export function runTransportContract(options: TransportContractOptions): void {
  describe(options.name, () => {
    it("preserves status, headers, and streamed response bytes", async () => {
      const fetch = vi.fn(async () =>
        new Response("first-second", {
          status: 201,
          statusText: "Created",
          headers: { "X-Contract": "preserved" },
        })
      );
      const transport = options.createTransport({
        fetch,
        ensureResponseOk: vi.fn(async () => undefined),
      });
      const onResponseChunk = vi.fn();

      const response = await transport.send(
        {
          method: "POST",
          url: "https://example.com/chat",
          headers: { Authorization: "Bearer key" },
          body: { kind: "json", value: { model: "contract" } },
          streaming: true,
        },
        {
          requestId: "contract-stream",
          timeoutMs: 1234,
          observer: { onResponseChunk },
        }
      );

      expect(fetch).toHaveBeenCalledWith(
        "https://example.com/chat",
        expect.objectContaining({ method: "POST" }),
        1234,
        undefined
      );
      expect(response.status).toBe(201);
      expect(response.statusText).toBe("Created");
      expect(response.headers["x-contract"]).toBe("preserved");
      expect(new TextDecoder().decode(await collect(response.body))).toBe(
        "first-second"
      );
      expect(onResponseChunk).toHaveBeenCalled();
    });

    it("forwards timeout and cancellation controls", async () => {
      const fetch = vi.fn(async () => new Response("{}"));
      const transport = options.createTransport({
        fetch,
        ensureResponseOk: vi.fn(async () => undefined),
      });
      const controller = new AbortController();

      await transport.send(
        {
          method: "GET",
          url: "https://example.com/models",
          headers: {},
          streaming: false,
        },
        {
          requestId: "contract-cancel",
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

    it("reports response validation failures", async () => {
      const error = new Error("upstream rejected request");
      const onError = vi.fn();
      const transport = options.createTransport({
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
          { requestId: "contract-error", observer: { onError } }
        )
      ).rejects.toBe(error);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: "contract-error", error })
      );
    });

    it("preserves stream interruptions and reports them", async () => {
      const interruption = new Error("stream interrupted");
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("partial"));
          controller.error(interruption);
        },
      });
      const onError = vi.fn();
      const transport = options.createTransport({
        fetch: vi.fn(
          async () => new Response(stream, { status: 200 })
        ),
        ensureResponseOk: vi.fn(async () => undefined),
      });
      const response = await transport.send(
        {
          method: "POST",
          url: "https://example.com/chat",
          headers: {},
          streaming: true,
        },
        { requestId: "contract-interruption", observer: { onError } }
      );

      await expect(collect(response.body)).rejects.toBe(interruption);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "contract-interruption",
          error: interruption,
        })
      );
    });
  });
}

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of stream) {
    chunks.push(chunk);
    length += chunk.length;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
