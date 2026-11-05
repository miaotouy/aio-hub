// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createNodeLlmTransport, type NodeLlmTransport } from "./llm-transport";
import {
  createModelRequestExecutor,
  type ModelRequestPorts,
} from "../src/llm-apis/execution/modelRequestExecutor";
import { executeOpenAiChat } from "../src/llm-apis/adapters/openai/chat-executor";
import { createOpenAiHeaders } from "../src/llm-apis/adapters/openai/headers";
import type { LlmProfile } from "../src/types/llm-profiles";
import type { LlmRequestOptions } from "../src/llm-apis/common";
import { TimeoutError, LlmApiError } from "../src/llm-apis/errors";

interface Seen {
  path: string;
  headers: Record<string, unknown>;
  body: any;
}
let server: Server, origin: string, transport: NodeLlmTransport;
let seen: Seen[], closed: number;
let handler: (request: Seen, response: ServerResponse) => void;
const chunk = (content: string, finishReason: string | null = null) =>
  "data: " +
  JSON.stringify({
    id: "chatcmpl-fixture",
    choices: [{ index: 0, delta: { content }, finish_reason: finishReason }],
  }) +
  "\n\n";
beforeEach(async () => {
  seen = [];
  closed = 0;
  handler = (_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        choices: [{ message: { content: "answer" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      })
    );
  };
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const data of request) chunks.push(data);
    const body = Buffer.concat(chunks).toString();
    const entry = {
      path: request.url!,
      headers: request.headers,
      body: body ? JSON.parse(body) : undefined,
    };
    seen.push(entry);
    response.on("close", () => {
      closed++;
    });
    handler(entry, response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  transport = createNodeLlmTransport({
    getProxy: () => ({ mode: "none" }),
    resolveProxy: async () => "DIRECT",
  });
});
afterEach(async () => {
  transport.dispose();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
function fixture(virtual = false) {
  const profiles: LlmProfile[] = ["primary", "backup"].map((id) => ({
    id,
    name: id,
    type: "openai-compatible",
    enabled: true,
    baseUrl: `${origin}/${id}/v1`,
    apiKeys: [`fixture-${id}`],
    models: [
      {
        id: `${id}-model`,
        name: id,
        capabilities: {
          chat: true,
          toolUse: true,
          vision: true,
          thinking: true,
        },
        parameterSupport: { temperature: true },
      },
    ],
    customHeaders: { "X-Fixture": id },
  }));
  if (virtual)
    profiles.unshift({
      id: "virtual",
      name: "logical",
      type: "virtual",
      enabled: true,
      baseUrl: "",
      apiKeys: [],
      virtualChannel: {
        mode: "failover",
        members: ["primary", "backup"],
        maxAttempts: 2,
        totalTimeoutMs: 3000,
      },
      models: [
        {
          id: "logical-model",
          name: "logical",
          virtualBindings: {
            chat: profiles.map((profile) => ({
              profileId: profile.id,
              modelId: profile.models[0].id,
            })),
          },
        },
      ],
    });
  const contexts = new Map();
  const ports = {
    getProfiles: () => profiles,
    getVcpWsUrl: () => "",
    keys: {
      pickKey: vi.fn<ModelRequestPorts["keys"]["pickKey"]>(
        (profile) => profile.apiKeys[0]
      ),
      reportSuccess: vi.fn(),
      reportFailure: vi.fn(),
    },
    adapters: {
      "openai-compatible": {
        chat: (profile, options) =>
          executeOpenAiChat(profile, options, {
            transport,
            buildHeaders: (profile, id) =>
              createOpenAiHeaders(profile, id, (headers) => headers ?? {}),
          }),
      },
    },
    inspector: {
      shouldCaptureInternal: () => true,
      setContext: (id: string, context: unknown) => {
        contexts.set(id, context);
      },
      getContext: (id: string) => contexts.get(id),
      deleteContext: (id: string) => {
        contexts.delete(id);
      },
    },
    makeToolDiagnostics: (value) => value,
    interruptFetch: vi.fn(async () => new Response(null, { status: 204 })),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    errors: { error: vi.fn(), warn: vi.fn() },
  } satisfies ModelRequestPorts;
  const options: LlmRequestOptions = {
    profileId: virtual ? "virtual" : "primary",
    modelId: virtual ? "logical-model" : "primary-model",
    requestId: "owner-request",
    messages: [{ role: "user", content: "question" }],
    timeout: 2000,
  };
  const executor = createModelRequestExecutor(ports);
  return {
    profiles,
    ports,
    contexts,
    options,
    send: (overrides: Partial<LlmRequestOptions> = {}) =>
      executor.sendRequest({ ...options, ...overrides }),
  };
}

// Real Node sockets exercise the production scheduler, middleware, serializer,
// shared provider decoder and Electron's existing HTTP/file service together.
describe("host-owned model execution over Node HTTP", () => {
  it("fails over before output, preserving member authentication and request-capture attribution", async () => {
    const f = fixture(true);
    handler = (request, response) => {
      if (request.path.includes("/primary/")) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end('{"error":{"message":"try backup"}}');
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        chunk("backup answer") + chunk("", "stop") + "data: [DONE]\n\n"
      );
    };
    const text: string[] = [],
      routes: any[] = [],
      captures: any[] = [];
    const response = await f.send({
      stream: true,
      onStream: (delta) => text.push(delta),
      requestCapture: (route) => {
        routes.push(route);
        const record = {
          requests: [] as any[],
          completed: false,
          failed: false,
        };
        captures.push(record);
        return {
          observer: {
            onRequest: (event) => record.requests.push(event.request),
          },
          complete: () => {
            record.completed = true;
          },
          error: () => {
            record.failed = true;
          },
        };
      },
    });
    expect(response.content).toBe("backup answer");
    expect(text.join("")).toBe("backup answer");
    expect(seen.map((request) => request.path)).toEqual([
      "/primary/v1/chat/completions",
      "/backup/v1/chat/completions",
    ]);
    expect(seen.map((request) => request.headers.authorization)).toEqual([
      "Bearer fixture-primary",
      "Bearer fixture-backup",
    ]);
    expect(seen.map((request) => request.headers["x-fixture"])).toEqual([
      "primary",
      "backup",
    ]);
    expect(seen.map((request) => request.body.model)).toEqual([
      "primary-model",
      "backup-model",
    ]);
    expect(routes.map((route) => route.actualProfileId)).toEqual([
      "primary",
      "backup",
    ]);
    expect(
      captures.map((record) => [
        record.requests.length,
        record.completed,
        record.failed,
      ])
    ).toEqual([
      [1, false, true],
      [1, true, false],
    ]);
    expect(response.channelExecution?.actual.profileId).toBe("backup");
    expect(f.ports.keys.reportFailure).toHaveBeenCalledWith(
      "primary",
      "fixture-primary",
      expect.any(Error),
      { treatRateLimitAsImmediateBreak: false }
    );
    expect(f.ports.keys.reportSuccess).toHaveBeenCalledWith(
      "backup",
      "fixture-backup"
    );
    expect(f.contexts.size).toBe(0);
  });

  it("keeps partial output on the selected member when a real SSE connection fails", async () => {
    const f = fixture(true);
    const text: string[] = [];
    handler = (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(chunk("partial"));
      setTimeout(() => response.destroy(), 30);
    };
    await expect(
      f.send({ stream: true, onStream: (delta) => text.push(delta) })
    ).rejects.toThrow();
    expect(text.join("")).toBe("partial");
    expect(seen).toHaveLength(1);
    expect(f.ports.keys.reportSuccess).not.toHaveBeenCalled();
    expect(f.contexts.size).toBe(0);
  });

  it("cancels an in-flight stream and ignores subsequent deltas without a key penalty or fallback", async () => {
    const f = fixture(true);
    const controller = new AbortController();
    const text: string[] = [];
    handler = (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(chunk("first") + chunk("late"));
    };
    await expect(
      f.send({
        stream: true,
        signal: controller.signal,
        onStream: (delta) => {
          text.push(delta);
          controller.abort();
        },
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(text).toEqual(["first"]);
    expect(seen).toHaveLength(1);
    expect(f.ports.keys.reportFailure).not.toHaveBeenCalled();
    expect(f.ports.keys.reportSuccess).not.toHaveBeenCalled();
    expect(f.ports.interruptFetch).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(closed).toBe(1));
    expect(f.contexts.size).toBe(0);
  });

  it("enforces the request deadline after headers, classifying a stalled stream as timeout", async () => {
    const f = fixture();
    const text: string[] = [];
    handler = (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(chunk("partial"));
    };
    await expect(
      f.send({
        stream: true,
        timeout: 80,
        onStream: (delta) => text.push(delta),
      })
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(text).toEqual(["partial"]);
    expect(f.ports.interruptFetch).not.toHaveBeenCalled();
    expect(f.ports.keys.reportFailure).toHaveBeenCalledWith(
      "primary",
      "fixture-primary",
      expect.any(TimeoutError),
      { treatRateLimitAsImmediateBreak: false }
    );
    await vi.waitFor(() => expect(closed).toBe(1));
    expect(f.contexts.size).toBe(0);
  });

  it("expands a local attachment through the native file service before sending the exact chat body", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "aio-node-model-")
    );
    try {
      const file = path.join(directory, "附件.png");
      const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255]);
      await fs.writeFile(file, bytes);
      const f = fixture();
      await f.send({
        messages: [
          {
            role: "user",
            content: [
              { type: "image", imageBase64: `local-file://${file}` },
              { type: "text", text: "inspect" },
            ],
          },
        ],
      });
      const content = seen[0].body.messages[0].content;
      expect(content[0].image_url.url).toBe(
        "data:image/png;base64," + bytes.toString("base64")
      );
      expect(content[1]).toEqual({ type: "text", text: "inspect" });
      expect(f.ports.keys.reportSuccess).toHaveBeenCalledOnce();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves provider errors and authentication policy when diagnostics fail", async () => {
    const f = fixture();
    handler = (_request, response) => {
      response.writeHead(401);
      response.end('{"error":{"message":"fixture authentication rejected"}}');
    };
    await expect(
      f.send({
        requestCapture: () => ({
          observer: {
            onRequest() {
              throw Error("diagnostic failure");
            },
          },
          complete() {},
          error() {
            throw Error("diagnostic finish failure");
          },
        }),
      })
    ).rejects.toBeInstanceOf(LlmApiError);
    expect(seen).toHaveLength(1);
    expect(f.ports.keys.reportFailure).toHaveBeenCalledWith(
      "primary",
      "fixture-primary",
      expect.objectContaining({ status: 401 }),
      { forceBroken: true }
    );
    expect(f.contexts.size).toBe(0);
  });

  it("releases the native socket when a decoder stops reading before the HTTP stream ends", async () => {
    handler = (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(chunk("first"));
    };
    const response = await transport.send(
      {
        method: "POST",
        url: origin + "/stream",
        headers: {},
        body: { kind: "json", value: {} },
        streaming: true,
      },
      { requestId: "early-decoder-exit", timeoutMs: 2000 }
    );
    for await (const bytes of response.body) {
      expect(bytes.byteLength).toBeGreaterThan(0);
      break;
    }
    await vi.waitFor(() => expect(closed).toBe(1));
  });

  it("skips a pre-cancelled request before profile keys, diagnostics or the network are touched", async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(f.send({ signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(seen).toHaveLength(0);
    expect(f.ports.keys.pickKey).not.toHaveBeenCalled();
    expect(f.contexts.size).toBe(0);
  });

  it("cancels promptly while an application-owned key selection is pending and never dispatches late output", async () => {
    const f = fixture();
    let finish!: (key: string) => void;
    const gate = new Promise<string>((resolve) => {
      finish = resolve;
    });
    f.ports.keys.pickKey.mockReturnValue(gate);
    const controller = new AbortController();
    const completion = f.send({ signal: controller.signal });
    await vi.waitFor(() => expect(f.ports.keys.pickKey).toHaveBeenCalledOnce());
    controller.abort();
    await expect(completion).rejects.toMatchObject({ name: "AbortError" });
    finish("fixture-late-key");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toHaveLength(0);
    expect(f.ports.interruptFetch).not.toHaveBeenCalled();
    expect(f.ports.keys.reportSuccess).not.toHaveBeenCalled();
    expect(f.ports.keys.reportFailure).not.toHaveBeenCalled();
    expect(f.contexts.size).toBe(0);
  });

  it("disposes Worker-owned streams and rejects requests after transport shutdown", async () => {
    const f = fixture();
    handler = (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(chunk("partial"));
    };
    await expect(
      f.send({ stream: true, onStream: () => transport.dispose() })
    ).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(closed).toBe(1));
    await expect(f.send()).rejects.toThrow("模型传输已关闭");
  });
});
