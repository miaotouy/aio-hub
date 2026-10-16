import { describe, expect, it } from "vitest";
import { resolveModelExecution } from "@aiohub/llm-core";
import { migrateAggregateProfile } from "../llm-aggregate-profile";
import type { LlmProfile } from "../../types/llm-profiles";

function legacy(overrides: Partial<LlmProfile> = {}): LlmProfile {
  return {
    id: "existing",
    name: "My channel",
    type: "openai",
    baseUrl: "https://api.together.xyz",
    enabled: true,
    apiKeys: ["fixture-key"],
    customHeaders: { "X-Client": "fixture" },
    customEndpoints: { chatCompletions: "https://gateway.example/chat" },
    models: [
      {
        id: "custom/model",
        name: "Custom model",
        routing: {
          bindings: {
            chat: { adapterId: "openai-responses", source: "manual" },
          },
        },
      },
    ],
    ...overrides,
  };
}

describe("aggregate profile migration", () => {
  it("preserves credentials, model bindings, endpoints and user options during a platform upgrade", () => {
    const source = legacy({
      icon: "/model-icons/lmstudio.svg",
      options: {
        customFlag: true,
        routingDefaults: { embedding: "cohere-chat" },
      },
    });
    const upgraded = migrateAggregateProfile(source);
    expect(upgraded.type).toBe("together");
    for (const key of [
      "id",
      "name",
      "baseUrl",
      "apiKeys",
      "customHeaders",
      "customEndpoints",
      "models",
    ] as const) {
      expect(upgraded[key]).toEqual(source[key]);
    }
    expect(upgraded.options?.customFlag).toBe(true);
    expect(upgraded.options?.routingDefaults.embedding).toBe("cohere-chat");
    expect(
      resolveModelExecution({
        profile: upgraded,
        model: { id: "fresh-model" },
        operation: "chat",
      }).adapterId
    ).toBe("openai-chat-completions");
    expect(
      resolveModelExecution({
        profile: upgraded,
        model: upgraded.models[0],
        operation: "chat",
      }).adapterId
    ).toBe("openai-responses");
    expect(migrateAggregateProfile(upgraded)).toEqual(upgraded);
    expect(source.type).toBe("openai");
  });

  it.each([
    ["https://api.fireworks.ai", "fireworks"],
    ["https://api.deepinfra.com", "deepinfra"],
    ["https://api-inference.huggingface.co", "huggingface"],
    ["https://router.huggingface.co/v1", "huggingface"],
    ["https://api-inference.modelscope.cn/v1", "modelscope"],
    ["https://openrouter.ai/api/v1", "openrouter"],
  ])("recognizes the exact official host %s", (baseUrl, type) => {
    expect(migrateAggregateProfile(legacy({ baseUrl })).type).toBe(type);
  });

  it("keeps a legacy Responses channel on Responses after recognizing its platform", () => {
    const upgraded = migrateAggregateProfile(
      legacy({ type: "openai-responses" })
    );
    expect(
      resolveModelExecution({
        profile: upgraded,
        model: { id: "fresh-model" },
        operation: "chat",
      }).adapterId
    ).toBe("openai-responses");
    expect(
      resolveModelExecution({
        profile: upgraded,
        model: { id: "fresh-model" },
        operation: "image",
      }).adapterId
    ).toBe("openai-responses");
  });

  it.each([
    ["/model-icons/newapi-color.svg", "new-api"],
    ["/model-icons/vcpchat.png", "vcp"],
    ["/model-icons/lmstudio.svg", "lmstudio"],
  ])(
    "recognizes a customized installation from saved preset identity %s",
    (icon, type) => {
      const source = legacy({ baseUrl: "http://localhost:9876", icon });
      expect(migrateAggregateProfile(source).type).toBe(type);
    }
  );

  it.each([
    "https://api.together.xyz.attacker.example",
    "http://localhost:1234/v1",
    "https://custom.example",
    "invalid",
  ])("keeps unrecognized user configuration unchanged: %s", (baseUrl) => {
    const source = legacy({ name: "NewAPI", baseUrl });
    expect(migrateAggregateProfile(source)).toEqual(source);
  });
});
