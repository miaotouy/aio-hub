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

    expect(result).toMatchObject({ success: true, firstByteMs: 10 });
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
    });
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
