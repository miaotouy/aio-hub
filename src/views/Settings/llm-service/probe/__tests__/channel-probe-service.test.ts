import { describe, expect, it, vi } from "vitest";
import type { LlmAdapter } from "@/llm-apis/adapters";
import type { LlmProfile } from "@/types/llm-profiles";
import { createChannelProbeService } from "../channel-probe-service";

function profile(modelIds = ["chat-model"]): LlmProfile {
  return {
    id: "profile-1",
    name: "Test",
    type: "openai",
    baseUrl: "https://example.com",
    apiKeys: ["profile-key"],
    enabled: false,
    models: modelIds.map((id) => ({ id, name: id })),
  };
}

describe("createChannelProbeService", () => {
  it("executes against an immutable snapshot and explicit key", async () => {
    const source = profile();
    let receivedProfile: LlmProfile | undefined;
    const adapter: LlmAdapter = {
      chat: vi.fn(async (value, options) => {
        receivedProfile = value;
        options.transportObserver?.onResponseStart?.({
          requestId: options.requestId!,
          status: 200,
          statusText: "OK",
          headers: {},
          startedAt: 2,
        });
        return { content: "ok" };
      }),
    };
    let clock = 0;
    const service = createChannelProbeService({
      adapters: { openai: adapter },
      now: () => 1,
      monotonicNow: () => (clock += 10),
    });

    const result = await service.probe({
      kind: "key",
      profile: source,
      modelId: "chat-model",
      apiKey: "explicit-key",
    });

    expect(result).toMatchObject({
      success: true,
      firstByteMs: 10,
      endpointType: "openai-chat",
    });
    expect(receivedProfile).not.toBe(source);
    expect(receivedProfile?.apiKeys).toEqual(["explicit-key"]);
    expect(source.apiKeys).toEqual(["profile-key"]);
  });

  it("returns a semantic failure for an empty canonical response", async () => {
    const service = createChannelProbeService({
      adapters: { openai: { chat: vi.fn(async () => ({ content: "" })) } },
    });
    const result = await service.probe({
      kind: "inference",
      profile: profile(),
      modelId: "chat-model",
    });
    expect(result).toMatchObject({
      success: false,
      phase: "semantic-validation",
      category: "provider",
      endpointType: "openai-chat",
    });
  });

  it.each([
    ["openai-chat", "openai-compatible", "chatCompletions", true],
    ["openai-responses", "openai-responses", "responses", true],
    ["anthropic-messages", "claude", "anthropicMessages", true],
    ["gemini-generate-content", "gemini", "geminiGenerateContent", true],
  ] as const)(
    "routes %s through its formal adapter with an immutable endpoint snapshot",
    async (endpointType, providerType, endpointKey, expectedStream) => {
      const source = profile();
      source.customEndpoints = {
        chatCompletions: "/legacy/chat",
        responses: "/custom/responses",
        anthropicMessages: "/custom/messages",
        geminiGenerateContent: "/custom/models/{model}:generateContent",
      };
      let receivedProfile: LlmProfile | undefined;
      let receivedStream: boolean | undefined;
      const chat = vi.fn(async (value: LlmProfile, options) => {
        receivedProfile = value;
        receivedStream = options.stream;
        options.onStream?.("ok");
        return { content: "ok" };
      });
      const service = createChannelProbeService({
        adapters: { [providerType]: { chat } },
      });

      const result = await service.probe({
        kind: "inference",
        profile: source,
        modelId: "chat-model",
        endpointType,
        stream: true,
      });

      expect(result).toMatchObject({ success: true, endpointType });
      expect(receivedProfile?.type).toBe(providerType);
      expect(receivedProfile?.customEndpoints?.[endpointKey]).toBe(
        source.customEndpoints[endpointKey]
      );
      expect(receivedStream).toBe(expectedStream);
      expect(source.type).toBe("openai");
      expect(source.customEndpoints.chatCompletions).toBe("/legacy/chat");
    }
  );

  it("forces non-streaming endpoint plans and marks the selected endpoint", async () => {
    const source = profile(["embedding-model"]);
    const embedding = vi.fn(async (_value, options) => ({
      model: options.modelId,
      data: [{ index: 0, object: "embedding" as const, embedding: [0.1, 0.2] }],
      usage: { promptTokens: 1, totalTokens: 1 },
      object: "list" as const,
    }));
    const service = createChannelProbeService({
      adapters: { "openai-compatible": { chat: vi.fn(), embedding } },
    });

    const result = await service.probe({
      kind: "inference",
      profile: source,
      modelId: "embedding-model",
      endpointType: "embeddings",
      stream: true,
    });

    expect(result).toMatchObject({
      success: true,
      capability: "embedding",
      endpointType: "embeddings",
    });
    expect(embedding).toHaveBeenCalledOnce();
  });

  it("keeps batch concurrency bounded and result order stable", async () => {
    let active = 0;
    let maximum = 0;
    const adapter: LlmAdapter = {
      chat: vi.fn(async (_profile, options) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { content: options.modelId };
      }),
    };
    const service = createChannelProbeService({
      adapters: { openai: adapter },
    });
    const modelIds = ["a", "b", "c", "d", "e"];
    const results = await service.probeBatch({
      profile: profile(modelIds),
      modelIds,
      concurrency: 2,
    });
    expect(maximum).toBe(2);
    expect(results.map((result) => result.modelId)).toEqual(modelIds);
    expect(results.every((result) => result.success)).toBe(true);
  });

  it("passes the endpoint through a batch and labels unstarted cancellations", async () => {
    const controller = new AbortController();
    const adapter: LlmAdapter = {
      chat: vi.fn(async (_value, options) => {
        controller.abort();
        return { content: options.modelId };
      }),
    };
    const service = createChannelProbeService({
      adapters: { "openai-responses": adapter },
      now: () => 42,
    });

    const results = await service.probeBatch({
      profile: profile(["a", "b", "c"]),
      modelIds: ["a", "b", "c"],
      concurrency: 1,
      endpointType: "openai-responses",
      signal: controller.signal,
    });

    expect(results.map((result) => result.endpointType)).toEqual([
      "openai-responses",
      "openai-responses",
      "openai-responses",
    ]);
    expect(results.map((result) => result.category)).toEqual([
      undefined,
      "cancelled",
      "cancelled",
    ]);
  });

  it("does not route video models through chat", async () => {
    const source = profile(["video"]);
    source.models[0].capabilities = { videoGeneration: true };
    const chat = vi.fn(async () => ({ content: "wrong" }));
    const service = createChannelProbeService({
      adapters: { openai: { chat } },
    });
    const result = await service.probe({
      kind: "inference",
      profile: source,
      modelId: "video",
    });
    expect(result.category).toBe("unsupported-capability");
    expect(chat).not.toHaveBeenCalled();
  });
});
