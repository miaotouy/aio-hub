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
import type { EmbeddingRequestOptions } from "../src/llm-apis/embedding-types";
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
let selectedKey: string | undefined;
let requestObserved: (() => void) | undefined;
beforeEach(async () => {
  calls = [];
  seen = [];
  profiles = [];
  loadGate = undefined;
  selectedKey = undefined;
  requestObserved = undefined;
  respond = (request, response) => {
    response.setHeader("content-type", "application/json");
    let body: unknown;
    if (
      request.url.includes("embedContent") ||
      request.url.includes("batchEmbedContents")
    )
      body = { embedding: { values: [0.25, 0.75] } };
    else if (request.url.includes("/v2/embed"))
      body = { embeddings: { float: [[0.25, 0.75]] } };
    else if (request.url.includes(":predict"))
      body = { predictions: [{ embeddings: { values: [0.25, 0.75] } }] };
    else if (request.url.includes("embeddings"))
      body = {
        object: "list",
        data: [{ object: "embedding", index: 0, embedding: [0.25, 0.75] }],
        model: "embedding-fixture",
        usage: { prompt_tokens: 2, total_tokens: 2 },
      };
    else if (request.url.includes(":generateContent"))
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
    requestObserved?.();
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
            ? { key: selectedKey ?? request.params.profile.apiKeys[0] }
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
it.each([
  ["openai-compatible", "/embeddings"],
  ["gemini", "embedContent"],
  ["cohere", "/v2/embed"],
  ["vertexai", "publishers/google/"],
  ["azure", "api-version="],
  ["deepseek", "/embeddings"],
] as const)(
  "runs %s embeddings through the scope's Node transport",
  async (type, path) => {
    profiles = [profile(type)];
    const scope = await service.createScope(options());
    const request: EmbeddingRequestOptions = {
      modelId: "embedding-fixture",
      input: "background vector",
      requestId: "embedding-request",
    };
    const result = await scope.sendEmbedding(type, request);
    expect(result.data[0].embedding).toEqual([0.25, 0.75]);
    expect(seen[0].url).toContain(path);
    expect(seen[0].headers["x-fixture"]).toBe("AIO Hub/fixture/zh-CN");
    if (type === "azure") {
      expect(seen[0].headers["api-key"]).toBe("fixture-key");
      expect(seen[0].headers.authorization).toBeUndefined();
    } else if (type !== "gemini") {
      expect(seen[0].headers.authorization).toBe("Bearer fixture-key");
    }
    if (type === "openai-compatible")
      expect(seen[0].headers["x-request-id"]).toBe("embedding-request");
    await scope.dispose();
  }
);
it.each(["physical", "virtual"] as const)(
  "aborts an in-flight %s embedding request when its task scope is released",
  async (kind) => {
    const member = profile("openai-compatible", "embedding-fixture");
    member.models[0].capabilities!.embedding = true;
    const channel = embeddingChannel(member);
    profiles = kind === "virtual" ? [channel, member] : [member];
    respond = (_request, response) => {
      response.setHeader("content-type", "application/json");
      response.write('{"object":"list","data":');
    };
    const scope = await service.createScope(options());
    const pending = scope.sendEmbedding(
      kind === "virtual" ? channel.id : member.id,
      {
        modelId: kind === "virtual" ? "logical-embedding" : "embedding-fixture",
        input: "cancel me",
      }
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    const observed = Promise.withResolvers<void>();
    requestObserved = observed.resolve;
    if (seen.length) observed.resolve();
    await observed.promise;
    await scope.dispose();
    await rejected;
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

function embeddingChannel(member: LlmProfile): LlmProfile {
  return {
    id: "virtual-embedding",
    name: "Embedding channel",
    type: "virtual",
    enabled: true,
    baseUrl: "",
    apiKeys: [],
    virtualChannel: {
      mode: "failover",
      members: [member.id],
      maxAttempts: 1,
      totalTimeoutMs: 3000,
    },
    models: [
      {
        id: "logical-embedding",
        name: "Logical embedding",
        virtualBindings: {
          embedding: [{ profileId: member.id, modelId: member.models[0].id }],
        },
      },
    ],
  } as LlmProfile;
}

it("routes a virtual embedding binding with Main-selected credentials and member protocol overrides", async () => {
  const member = profile("openai-compatible", "physical-vector");
  member.models[0].capabilities!.embedding = true;
  member.models[0].routing = {
    bindings: {
      embedding: {
        adapterId: "gemini-generate-content",
        source: "manual",
      },
    },
  };
  member.apiKeys = ["unused-key", "selected-key"];
  selectedKey = "selected-key";
  const virtual = embeddingChannel(member);
  profiles = [virtual, member];
  const scope = await service.createScope(options());
  const result = await scope.sendEmbedding(virtual.id, {
    modelId: "logical-embedding",
    input: "virtual vector",
    requestId: "logical-request",
    forceProxy: true,
  });
  expect(result.data[0].embedding).toEqual([0.25, 0.75]);
  expect(result.channelExecution).toMatchObject({
    requested: { profileId: virtual.id, modelId: "logical-embedding" },
    actual: { profileId: member.id, modelId: "physical-vector" },
    operation: "embedding",
    attempts: [{ status: "success" }],
  });
  expect(seen).toHaveLength(1);
  expect(seen[0].url).toContain("physical-vector:embedContent");
  expect(seen[0].headers["x-goog-api-key"]).toBe("selected-key");
  expect(seen[0].body).toMatchObject({
    content: { parts: [{ text: "virtual vector" }] },
  });
  expect(
    calls
      .filter((call) => call.method === "llm.keys.execute")
      .map((call) => call.params)
  ).toMatchObject([
    { method: "pick", profile: { id: member.id } },
    { method: "success", profileId: member.id, key: "selected-key" },
  ]);
});

it.each(["disabled", "multiple-targets"] as const)(
  "rejects %s embedding bindings before selecting a key or sending HTTP",
  async (invalid) => {
    const member = profile("openai-compatible", "physical-vector");
    member.models[0].capabilities!.embedding = true;
    const virtual = embeddingChannel(member);
    profiles = [virtual, member];
    if (invalid === "disabled") member.enabled = false;
    else {
      const backup = { ...member, id: "backup" };
      profiles.push(backup);
      virtual.virtualChannel!.members.push(backup.id);
      virtual.models[0].virtualBindings!.embedding!.push({
        profileId: backup.id,
        modelId: "physical-vector",
      });
    }
    const scope = await service.createScope(options());
    await expect(
      scope.sendEmbedding(virtual.id, {
        modelId: "logical-embedding",
        input: "invalid",
      })
    ).rejects.toMatchObject({ name: "ChannelConfigurationError" });
    expect(seen).toHaveLength(0);
    expect(
      calls.filter((call) => call.method === "llm.keys.execute")
    ).toHaveLength(0);
  }
);

it("reports virtual embedding authentication failures against the selected physical member", async () => {
  const member = profile("openai-compatible", "physical-vector");
  member.models[0].capabilities!.embedding = true;
  const virtual = embeddingChannel(member);
  profiles = [virtual, member];
  respond = (_request, response) => {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "invalid key" } }));
  };
  const scope = await service.createScope(options());
  await expect(
    scope.sendEmbedding(virtual.id, {
      modelId: "logical-embedding",
      input: "failure",
    })
  ).rejects.toMatchObject({ name: "ChannelExecutionError" });
  expect(seen).toHaveLength(1);
  expect(
    calls
      .filter((call) => call.method === "llm.keys.execute")
      .map((call) => call.params)
  ).toMatchObject([
    { method: "pick", profile: { id: member.id } },
    {
      method: "failure",
      profileId: member.id,
      key: "fixture-key",
      error: { status: 401 },
    },
  ]);
});

it.each(["binding", "discovered", "aggregate"] as const)(
  "resolves %s physical embedding routes before choosing a Node adapter",
  async (route) => {
    const member = profile(
      route === "aggregate" ? "siliconflow" : "openai-compatible",
      "physical-vector"
    );
    member.models[0].routing =
      route === "binding"
        ? {
            bindings: {
              embedding: {
                adapterId: "gemini-generate-content",
                source: "manual",
              },
            },
          }
        : route === "discovered"
          ? { supportedEndpointTypes: ["gemini"] }
          : undefined;
    profiles = [member];
    const scope = await service.createScope(options());
    const result = await scope.sendEmbedding(member.id, {
      modelId: "physical-vector",
      input: "route",
    });
    expect(result.data[0].embedding).toEqual([0.25, 0.75]);
    expect(seen[0].url).toContain(
      route === "aggregate" ? "/embeddings" : "physical-vector:embedContent"
    );
  }
);

it("cancels virtual embeddings while Main key selection is pending and ignores a late key", async () => {
  const member = profile("openai-compatible", "physical-vector");
  member.models[0].capabilities!.embedding = true;
  const virtual = embeddingChannel(member);
  profiles = [virtual, member];
  const key = Promise.withResolvers<string>();
  const selecting = Promise.withResolvers<void>();
  vi.spyOn(host.keys, "pickKey").mockImplementation(() => {
    selecting.resolve();
    return key.promise;
  });
  const scope = await service.createScope(options());
  const pending = scope.sendEmbedding(virtual.id, {
    modelId: "logical-embedding",
    input: "late key",
  });
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await selecting.promise;
  await scope.dispose();
  await rejected;
  key.resolve("late-key");
  await key.promise;
  expect(seen).toHaveLength(0);
});
