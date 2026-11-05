// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BackgroundModelServices } from "./background-model-services";
import { BackgroundHostClient } from "./background-host-client";
import type { HostServiceRequest } from "./background-host-protocol";
import type { LlmProfile } from "../src/types/llm-profiles";
import type { LlmRequestOptions } from "../src/llm-apis/types";
const headers = {
  appName: "AIO Hub",
  appVersion: "fixture",
  userAgent: "Fixture/1",
  secChUa: "Fixture",
  secChUaPlatform: "Windows",
  acceptLanguage: "zh-CN",
};
const options = () => ({
  headers: { ...headers },
  proxy: { mode: "none" as const },
  vcpWsUrl: "",
});
const diagnostics = {
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  errors: { error: vi.fn(), warn: vi.fn() },
};
let server: Server,
  origin: string,
  service: BackgroundModelServices,
  host: BackgroundHostClient;
let profiles: LlmProfile[],
  calls: HostServiceRequest[],
  seen: Array<{ url: string; body: any; headers: Record<string, unknown> }>;
let respond: (
  request: (typeof seen)[number],
  response: import("node:http").ServerResponse
) => void;
let loadGate: Promise<void> | undefined;
beforeEach(async () => {
  calls = [];
  seen = [];
  profiles = [];
  loadGate = undefined;
  respond = (request, response) => {
    response.setHeader("content-type", "application/json");
    let body: unknown;
    if (request.url.includes(":generateContent"))
      body = {
        candidates: [
          {
            content: { role: "model", parts: [{ text: "answer" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 3,
          candidatesTokenCount: 2,
          totalTokenCount: 5,
        },
      };
    else if (request.url.includes("responses"))
      body = {
        id: "resp",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "answer" }],
          },
        ],
        usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
      };
    else if (
      request.url.includes("messages") ||
      request.url.includes("rawPredict")
    )
      body = {
        id: "msg",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "answer" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 3, output_tokens: 2 },
      };
    else if (request.url.includes("cohere"))
      body = {
        id: "cohere",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "answer" }],
        },
        finish_reason: "COMPLETE",
        usage: {
          billed_units: { input_tokens: 3, output_tokens: 2 },
          tokens: { input_tokens: 3, output_tokens: 2 },
        },
      };
    else
      body = {
        choices: [
          {
            message: { role: "assistant", content: "answer" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      };
    response.end(JSON.stringify(body));
  };
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    const entry = {
      url: request.url!,
      body: body ? JSON.parse(body) : undefined,
      headers: request.headers,
    };
    seen.push(entry);
    respond(entry, response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  host = new BackgroundHostClient((request) => {
    calls.push(request);
    void (async () => {
      let result: unknown;
      if (request.method === "llm.configuration.load") {
        await loadGate;
        result = {
          profiles: structuredClone(profiles),
          revision: String(profiles.length),
        };
      } else if (request.method === "llm.keys.execute")
        result =
          request.params.method === "pick"
            ? { key: request.params.profile.apiKeys[0] }
            : {};
      else if (request.method === "llm.proxy.resolve") result = "DIRECT";
      else throw Error("Unexpected method");
      host.receive({ type: "host-response", id: request.id, ok: true, result });
    })().catch(() =>
      host.receive({
        type: "host-response",
        id: request.id,
        ok: false,
        error: { code: "FIXTURE", message: "Host failed" },
      })
    );
  });
  service = new BackgroundModelServices(host, diagnostics);
});
afterEach(async () => {
  await service.shutdown();
  host.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
function profile(type: LlmProfile["type"], modelId = "model"): LlmProfile {
  const value = {
    id: type,
    name: type,
    type,
    enabled: true,
    baseUrl: origin + "/" + type + "/v1",
    apiKeys: ["fixture-key"],
    models: [
      {
        id: modelId,
        name: modelId,
        capabilities: {
          chat: true,
          vision: true,
          toolUse: true,
          thinking: true,
        },
        parameterSupport: { reasoningEffort: true },
      },
    ],
    customHeaders: {
      "X-Fixture": "{{appName}}/{{appVersion}}/{{acceptLanguage}}",
    },
  } as LlmProfile;
  if (type === "azure")
    value.baseUrl = origin + "/azure/openai/deployments/deployment";
  if (type === "vertexai") {
    value.baseUrl = origin + "/vertexai";
    value.options = { projectId: "project", location: "location" };
  }
  return value;
}
async function request(
  type: LlmProfile["type"],
  model = "model",
  extra: Partial<LlmRequestOptions> = {}
) {
  profiles = [profile(type, model)];
  const scope = await service.createScope(options());
  return {
    scope,
    result: await scope.sendRequest({
      profileId: type,
      modelId: model,
      messages: [{ role: "user", content: "question" }],
      timeout: 2000,
      ...extra,
    }),
  };
}
it.each([
  ["openai-compatible", "gpt-fixture", "/chat/completions"],
  ["openai-responses", "gpt-fixture", "/responses"],
  ["gemini", "gemini-fixture", ":generateContent"],
  ["claude", "claude-fixture", "/messages"],
  ["cohere", "command-fixture", "/chat"],
  ["azure", "gpt-fixture", "api-version="],
  ["deepseek", "deepseek-fixture", "/chat/completions"],
  ["vertexai", "gemini-fixture", "publishers/google/"],
  ["vertexai", "claude-fixture", "publishers/anthropic/"],
] as const)(
  "executes %s / %s over real Node HTTP with shared mapping, headers and Main key operations",
  async (type, model, path) => {
    const { scope, result } = await request(type, model, {
      reasoningEffort: "medium",
    });
    expect(result.content).toBe("answer");
    expect(result.usage?.promptTokens).toBe(3);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toContain(path);
    expect(seen[0].headers["x-fixture"]).toBe("AIO Hub/fixture/zh-CN");
    if (type === "azure") {
      expect(seen[0].headers["api-key"]).toBe("fixture-key");
      expect(seen[0].headers.authorization).toBeUndefined();
    } else if (type === "claude")
      expect(seen[0].headers["x-api-key"]).toBe("fixture-key");
    else if (type !== "gemini")
      expect(seen[0].headers.authorization).toBe("Bearer fixture-key");
    if (type === "deepseek") expect(seen[0].body.reasoning_effort).toBe("high");
    expect(
      calls.some(
        (call) =>
          call.method === "llm.keys.execute" && call.params.method === "success"
      )
    ).toBe(true);
    await scope.dispose();
  }
);
it("pins task configuration and header inputs, exposes defensive profile projections and refreshes on a new scope", async () => {
  expect(calls).toEqual([]);
  profiles = [profile("openai-compatible")];
  const input = options();
  const scope = await service.createScope(input);
  input.headers.appVersion = "changed";
  profiles[0].baseUrl = origin + "/changed/v1";
  const projection = scope.getProfiles();
  projection[0].baseUrl = origin + "/bad";
  await scope.sendRequest({
    profileId: "openai-compatible",
    modelId: "model",
    messages: [{ role: "user", content: "one" }],
  });
  expect(seen[0].url).toContain("/openai-compatible/");
  expect(seen[0].headers["x-fixture"]).toContain("/fixture/");
  const next = await service.createScope(input);
  await next.sendRequest({
    profileId: "openai-compatible",
    modelId: "model",
    messages: [{ role: "user", content: "two" }],
  });
  expect(seen[1].url).toContain("/changed/");
  expect(seen[1].headers["x-fixture"]).toContain("/changed/");
});
it("streams text/reasoning updates through the shared OpenAI mapping and cancels request ownership on release", async () => {
  respond = (_request, response) => {
    response.setHeader("content-type", "text/event-stream");
    response.write(
      "data: " +
        JSON.stringify({
          choices: [
            {
              delta: { content: "part", reasoning_content: "thought" },
              finish_reason: null,
            },
          ],
        }) +
        "\n\n"
    );
  };
  profiles = [profile("openai-compatible")];
  const scope = await service.createScope(options());
  const streamed = Promise.withResolvers<void>();
  const reasoning: string[] = [];
  const pending = scope.sendRequest({
    profileId: "openai-compatible",
    modelId: "model",
    messages: [{ role: "user", content: "stream" }],
    stream: true,
    onStream: () => streamed.resolve(),
    onReasoningStream: (chunk) => reasoning.push(chunk),
  });
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await streamed.promise;
  await scope.dispose();
  await rejected;
  expect(reasoning.join("")).toBe("thought");
  await expect(
    scope.sendRequest({ profileId: "openai-compatible", modelId: "model" })
  ).rejects.toMatchObject({ name: "AbortError" });
});
it("cancels scope preparation during shutdown and refuses later scopes", async () => {
  profiles = [profile("openai-compatible")];
  const gate = Promise.withResolvers<void>();
  loadGate = gate.promise;
  const pending = service.createScope(options());
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await service.shutdown();
  await rejected;
  gate.resolve();
  await expect(service.createScope(options())).rejects.toThrow(
    "后台模型服务已关闭"
  );
});

it("fails over Responses members through the original virtual-channel scheduler", async () => {
  const first = profile("openai-responses", "gpt-fixture"),
    second = {
      ...profile("openai-responses", "gpt-backup"),
      id: "backup",
      baseUrl: origin + "/backup/v1",
    };
  const virtual = {
    id: "virtual",
    name: "Virtual",
    type: "virtual",
    enabled: true,
    baseUrl: "",
    apiKeys: [],
    virtualChannel: {
      mode: "failover",
      members: [first.id, second.id],
      maxAttempts: 2,
      totalTimeoutMs: 3000,
    },
    models: [
      {
        id: "logical",
        name: "Logical",
        virtualBindings: {
          chat: [first, second].map((p) => ({
            profileId: p.id,
            modelId: p.models[0].id,
          })),
        },
      },
    ],
  } as LlmProfile;
  profiles = [virtual, first, second];
  const original = respond;
  respond = (request, response) => {
    if (request.url.startsWith("/openai-responses/")) {
      response.writeHead(503);
      response.end("busy");
    } else original(request, response);
  };
  const scope = await service.createScope(options());
  const result = await scope.sendRequest({
    profileId: "virtual",
    modelId: "logical",
    messages: [{ role: "user", content: "fallback" }],
  });
  expect(result.content).toBe("answer");
  expect(seen.map((item) => item.url)).toEqual([
    expect.stringContaining("/responses"),
    expect.stringContaining("/backup/v1/responses"),
  ]);
});
