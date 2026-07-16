import { describe, expect, it, vi } from "vitest";
import type { ProbeValidationInput } from "@aiohub/llm-core";
import type { LlmProfile } from "../../types";
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
    let clock = 0;
    const service = createChannelProbeService({
      executeChat: vi.fn(async (value, options) => {
        receivedProfile = value;
        options.transportObserver?.onResponseStart?.({
          requestId: options.requestId,
          status: 200,
          statusText: "OK",
          headers: {},
          startedAt: 1,
        });
        return { content: "ok" };
      }),
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
      status: 200,
    });
    expect(receivedProfile).not.toBe(source);
    expect(receivedProfile?.apiKeys).toEqual(["explicit-key"]);
    expect(source.apiKeys).toEqual(["profile-key"]);
  });

  it("returns a semantic failure for an empty canonical response", async () => {
    const service = createChannelProbeService({
      executeChat: vi.fn(async () => ({ content: "" })),
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
    const service = createChannelProbeService({
      executePlan: vi.fn(async ({ model, plan }) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return {
          response: { content: model.id },
          validation: {
            capability: plan.capability,
            response: { content: model.id },
          } satisfies ProbeValidationInput,
        };
      }),
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

  it("does not route unsupported video models through chat", async () => {
    const source = profile(["video"]);
    source.models[0].capabilities = { videoGeneration: true };
    const executeChat = vi.fn(async () => ({ content: "wrong" }));
    const service = createChannelProbeService({ executeChat });
    const result = await service.probe({
      kind: "inference",
      profile: source,
      modelId: "video",
    });
    expect(result.category).toBe("unsupported-capability");
    expect(executeChat).not.toHaveBeenCalled();
  });

  it("does not start more work after cancellation", async () => {
    const controller = new AbortController();
    const started: string[] = [];
    const service = createChannelProbeService({
      executePlan: vi.fn(async ({ model, plan }) => {
        started.push(model.id);
        controller.abort();
        return {
          response: { content: "ok" },
          validation: {
            capability: plan.capability,
            response: { content: "ok" },
          },
        };
      }),
    });
    const results = await service.probeBatch({
      profile: profile(["a", "b", "c"]),
      modelIds: ["a", "b", "c"],
      concurrency: 1,
      signal: controller.signal,
    });
    expect(started).toEqual(["a"]);
    expect(
      results.slice(1).every((item) => item.category === "cancelled")
    ).toBe(true);
  });
});
