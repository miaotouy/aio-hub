import { describe, expect, it } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
import {
  getConfiguredProbeEndpoint,
  resolveEffectiveProbeEndpointType,
  resolveProbeTarget,
} from "../endpoint-options";

function profile(): LlmProfile {
  return {
    id: "profile-1",
    name: "Test",
    type: "openai",
    baseUrl: "https://example.com",
    apiKeys: ["secret"],
    enabled: true,
    models: [{ id: "model-1", name: "Model" }],
    customEndpoints: {
      chatCompletions: "/legacy/chat",
      responses: "/custom/responses",
      anthropicMessages: "/custom/messages",
      geminiGenerateContent: "/custom/models/{model}:generateContent",
    },
  };
}

describe("probe endpoint options", () => {
  it("uses protocol-specific endpoint fields across provider types", () => {
    const source = profile();

    expect(getConfiguredProbeEndpoint(source, "openai-responses")).toBe(
      "/custom/responses"
    );
    expect(getConfiguredProbeEndpoint(source, "anthropic-messages")).toBe(
      "/custom/messages"
    );
    expect(getConfiguredProbeEndpoint(source, "gemini-generate-content")).toBe(
      "/custom/models/{model}:generateContent"
    );
  });

  it("only falls back to legacy chat configuration for the native protocol", () => {
    const source = profile();
    source.customEndpoints = { chatCompletions: "/legacy/native" };

    expect(getConfiguredProbeEndpoint(source, "openai-chat")).toBe(
      "/legacy/native"
    );
    expect(
      getConfiguredProbeEndpoint(source, "openai-responses")
    ).toBeUndefined();
    expect(
      getConfiguredProbeEndpoint(source, "anthropic-messages")
    ).toBeUndefined();
    expect(
      getConfiguredProbeEndpoint(source, "gemini-generate-content")
    ).toBeUndefined();

    source.type = "openai-responses";
    expect(getConfiguredProbeEndpoint(source, "openai-responses")).toBe(
      "/legacy/native"
    );
  });

  it("creates an immutable protocol snapshot without leaking chat endpoints", () => {
    const source = profile();
    const target = resolveProbeTarget(source, "anthropic-messages");

    expect(target).toMatchObject({
      capability: "chat",
      supportsStream: true,
      profile: {
        type: "claude",
        customEndpoints: {
          anthropicMessages: "/custom/messages",
        },
      },
    });
    expect(target.profile).not.toBe(source);
    expect(target.profile.customEndpoints).not.toBe(source.customEndpoints);
    expect(target.profile.customEndpoints?.chatCompletions).toBeUndefined();
    expect(source.customEndpoints?.chatCompletions).toBe("/legacy/chat");
  });

  it("forces non-chat endpoint capabilities to non-streaming", () => {
    expect(resolveProbeTarget(profile(), "embeddings")).toMatchObject({
      capability: "embedding",
      supportsStream: false,
      profile: { type: "openai-compatible" },
    });
    expect(resolveProbeTarget(profile(), "jina-rerank")).toMatchObject({
      capability: "rerank",
      supportsStream: false,
    });
    expect(resolveProbeTarget(profile(), "image-generation")).toMatchObject({
      capability: "image",
      supportsStream: false,
    });
  });

  it("resolves the endpoint actually used by automatic probes", () => {
    const source = profile();

    expect(resolveEffectiveProbeEndpointType(source, "chat")).toBe(
      "openai-chat"
    );
    expect(resolveEffectiveProbeEndpointType(source, "embedding")).toBe(
      "embeddings"
    );
    expect(resolveEffectiveProbeEndpointType(source, "rerank")).toBe(
      "jina-rerank"
    );
    expect(resolveEffectiveProbeEndpointType(source, "image")).toBe(
      "image-generation"
    );

    source.type = "openai-responses";
    expect(resolveEffectiveProbeEndpointType(source, "chat")).toBe(
      "openai-responses"
    );
    source.type = "claude";
    expect(resolveEffectiveProbeEndpointType(source, "chat")).toBe(
      "anthropic-messages"
    );
    source.type = "gemini";
    expect(resolveEffectiveProbeEndpointType(source, "chat")).toBe(
      "gemini-generate-content"
    );
  });

  it("preserves explicit endpoints and unknown automatic protocols", () => {
    const source = profile();
    source.type = "cohere";

    expect(
      resolveEffectiveProbeEndpointType(source, "chat", "openai-responses")
    ).toBe("openai-responses");
    expect(resolveEffectiveProbeEndpointType(source, "chat")).toBe("auto");
    expect(resolveEffectiveProbeEndpointType(source, "audio")).toBe("auto");
  });
});
