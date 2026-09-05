import { describe, expect, it } from "vitest";
import {
  UnresolvedModelRouteError,
  isAggregateChannelType,
  listAdaptersForOperation,
  mergeDiscoveredModelRouting,
  resolveAdapterIdForEndpointType,
  resolveModelExecution,
  type LlmAdapterId,
  type LlmExecutionModel,
  type LlmExecutionProfile,
} from "../src";

interface TestProfile extends LlmExecutionProfile {
  customEndpoints?: Record<string, string | undefined>;
  marker?: string;
}

function profile(type = "openai"): TestProfile {
  return {
    type,
    marker: "keep-me",
    customEndpoints: { chatCompletions: "/legacy/chat" },
  };
}

function model(routing?: LlmExecutionModel["routing"]): LlmExecutionModel {
  return { id: "model-a", routing };
}

describe("resolveModelExecution", () => {
  it("preserves the complete legacy profile on provider-default resolution", () => {
    const source = profile("deepseek");

    const execution = resolveModelExecution({
      profile: source,
      model: model(),
      operation: "chat",
    });

    expect(execution).toMatchObject({
      adapterId: "openai-chat-completions",
      operation: "chat",
      routeSource: "profile-default",
      effectiveProfile: source,
    });
    expect(execution.effectiveProfile).toBe(source);
  });

  it("uses operation-specific legacy adapter identities without changing profile behavior", () => {
    const source = profile("openai-responses");

    const execution = resolveModelExecution({
      profile: source,
      model: model(),
      operation: "embedding",
    });

    expect(execution.adapterId).toBe("openai-embeddings");
    expect(execution.effectiveProfile).toBe(source);
  });

  it("uses a manual binding and routes its endpoint through a compatibility profile", () => {
    const source = profile("openai-compatible");

    const execution = resolveModelExecution({
      profile: source,
      model: model({
        bindings: {
          chat: {
            adapterId: "anthropic-messages",
            endpoint: "/v1/messages",
            source: "manual",
          },
        },
      }),
      operation: "chat",
    });

    expect(execution).toMatchObject({
      adapterId: "anthropic-messages",
      endpoint: "/v1/messages",
      routeSource: "manual",
      effectiveProfile: {
        type: "claude",
        marker: "keep-me",
        customEndpoints: {
          chatCompletions: "/legacy/chat",
          anthropicMessages: "/v1/messages",
        },
      },
    });
    expect(source.type).toBe("openai-compatible");
    expect(source.customEndpoints).toEqual({ chatCompletions: "/legacy/chat" });
  });

  it("uses a single compatible discovered endpoint but never guesses an ambiguous route", () => {
    const unique = resolveModelExecution({
      profile: profile(),
      model: model({ supportedEndpointTypes: ["openai-response"] }),
      operation: "chat",
    });
    const ambiguous = resolveModelExecution({
      profile: profile(),
      model: model({
        supportedEndpointTypes: ["openai", "anthropic", "unknown-provider"],
      }),
      operation: "chat",
    });

    expect(unique).toMatchObject({
      adapterId: "openai-responses",
      routeSource: "discovered",
      effectiveProfile: { type: "openai-responses" },
    });
    expect(ambiguous).toMatchObject({
      adapterId: "openai-chat-completions",
      routeSource: "profile-default",
      effectiveProfile: { type: "openai" },
    });
  });

  it("preserves manual bindings while refreshing remote endpoint declarations", () => {
    const binding = {
      adapterId: "anthropic-messages" as const,
      source: "manual" as const,
    };
    const existing = {
      bindings: { chat: binding },
      supportedEndpointTypes: ["openai"],
      discoveredAt: "2026-08-05T00:00:00.000Z",
    };

    const merged = mergeDiscoveredModelRouting(existing, {
      supportedEndpointTypes: ["openai-response", "future-protocol"],
      discoveredAt: "2026-08-06T00:00:00.000Z",
    });

    expect(merged).toEqual({
      bindings: { chat: binding },
      supportedEndpointTypes: ["openai-response", "future-protocol"],
      discoveredAt: "2026-08-06T00:00:00.000Z",
    });
    expect(mergeDiscoveredModelRouting(existing, undefined)).toBe(existing);
  });

  it("ignores an imported binding whose adapter is not yet known", () => {
    const execution = resolveModelExecution({
      profile: profile(),
      model: model({
        bindings: {
          chat: {
            adapterId: "future-adapter" as LlmAdapterId,
            source: "manual",
          },
        },
      }),
      operation: "chat",
    });

    expect(execution).toMatchObject({
      adapterId: "openai-chat-completions",
      routeSource: "profile-default",
      effectiveProfile: { type: "openai" },
    });
  });

  it("throws a recoverable configuration error for an unregistered channel type", () => {
    expect(() =>
      resolveModelExecution({
        profile: profile("unregistered-channel"),
        model: model(),
        operation: "chat",
      })
    ).toThrow("No default execution adapter is registered");
  });
});

describe("aggregate channels", () => {
  it("maps the channel default to the protocol adapter and remaps the compatibility profile", () => {
    const execution = resolveModelExecution({
      profile: profile("new-api"),
      model: model(),
      operation: "chat",
    });

    expect(execution).toMatchObject({
      adapterId: "openai-chat-completions",
      routeSource: "profile-default",
      effectiveProfile: {
        type: "openai-compatible",
        marker: "keep-me",
      },
    });
  });

  it("uses aggregate operation defaults for embedding and rerank", () => {
    const embedding = resolveModelExecution({
      profile: profile("sub2api"),
      model: model(),
      operation: "embedding",
    });
    const rerank = resolveModelExecution({
      profile: profile("new-api"),
      model: model(),
      operation: "rerank",
    });

    expect(embedding).toMatchObject({
      adapterId: "openai-embeddings",
      effectiveProfile: { type: "openai-compatible" },
    });
    expect(rerank).toMatchObject({
      adapterId: "jina-rerank",
      effectiveProfile: { type: "openai-compatible" },
    });
  });

  it("prefers user channel routing defaults over the built-in model route table", () => {
    const execution = resolveModelExecution({
      profile: {
        ...profile("opencode-go"),
        options: {
          routingDefaults: { chat: "openai-chat-completions" },
        },
      },
      model: { id: "gpt-5.6-luna" },
      operation: "chat",
    });

    expect(execution).toMatchObject({
      adapterId: "openai-chat-completions",
      effectiveProfile: { type: "openai-compatible" },
    });
  });

  it("treats a cleared channel default as unset and falls back to the built-in table", () => {
    const execution = resolveModelExecution({
      profile: {
        ...profile("opencode-go"),
        options: {
          routingDefaults: { chat: "" as LlmAdapterId },
        },
      },
      model: { id: "gpt-5.6-luna" },
      operation: "chat",
    });

    expect(execution).toMatchObject({
      adapterId: "openai-responses",
      routeSource: "profile-default",
      effectiveProfile: { type: "openai-responses" },
    });
  });

  it("resolves OpenCode Go models through the built-in route table", () => {
    const chatModel = resolveModelExecution({
      profile: profile("opencode-go"),
      model: { id: "kimi-k3" },
      operation: "chat",
    });
    const responsesModel = resolveModelExecution({
      profile: profile("opencode-go"),
      model: { id: "gpt-5.6-luna" },
      operation: "chat",
    });
    const messagesModel = resolveModelExecution({
      profile: profile("opencode-go"),
      model: { id: "qwen3.7-plus" },
      operation: "chat",
    });

    expect(chatModel).toMatchObject({
      adapterId: "openai-chat-completions",
      effectiveProfile: { type: "openai-compatible" },
    });
    expect(responsesModel).toMatchObject({
      adapterId: "openai-responses",
      effectiveProfile: { type: "openai-responses" },
    });
    expect(messagesModel).toMatchObject({
      adapterId: "anthropic-messages",
      effectiveProfile: { type: "claude" },
    });
  });

  it("never guesses a protocol for OpenCode Go models outside the built-in table", () => {
    expect(() =>
      resolveModelExecution({
        profile: profile("opencode-go"),
        model: { id: "future-model-2027" },
        operation: "chat",
      })
    ).toThrowError(UnresolvedModelRouteError);
  });

  it("requires an explicit route on aggregate-compatible channels", () => {
    const error = (() => {
      try {
        resolveModelExecution({
          profile: profile("aggregate-compatible"),
          model: model(),
          operation: "chat",
        });
      } catch (caught) {
        return caught as UnresolvedModelRouteError;
      }
      throw new Error("expected UnresolvedModelRouteError");
    })();

    expect(error).toBeInstanceOf(UnresolvedModelRouteError);
    expect(error.channelType).toBe("aggregate-compatible");
    expect(error.modelId).toBe("model-a");
    expect(error.operation).toBe("chat");
  });

  it("ignores channel routing defaults on legacy channels", () => {
    const execution = resolveModelExecution({
      profile: {
        ...profile("openai"),
        options: { routingDefaults: { chat: "anthropic-messages" } },
      },
      model: model(),
      operation: "chat",
    });

    expect(execution).toMatchObject({
      adapterId: "openai-chat-completions",
      routeSource: "profile-default",
      effectiveProfile: { type: "openai" },
    });
  });

  it("treats a manual binding on aggregate channels as any other binding", () => {
    const execution = resolveModelExecution({
      profile: profile("new-api"),
      model: model({
        bindings: {
          chat: {
            adapterId: "anthropic-messages",
            endpoint: "/v1/messages",
            source: "manual",
          },
        },
      }),
      operation: "chat",
    });

    expect(execution).toMatchObject({
      adapterId: "anthropic-messages",
      endpoint: "/v1/messages",
      routeSource: "manual",
      effectiveProfile: {
        type: "claude",
        customEndpoints: {
          chatCompletions: "/legacy/chat",
          anthropicMessages: "/v1/messages",
        },
      },
    });
  });

  it("flags aggregate provider types through isAggregateChannelType", () => {
    expect(isAggregateChannelType("new-api")).toBe(true);
    expect(isAggregateChannelType("sub2api")).toBe(true);
    expect(isAggregateChannelType("aggregate-compatible")).toBe(true);
    expect(isAggregateChannelType("opencode-go")).toBe(true);
    expect(isAggregateChannelType("openai")).toBe(false);
    expect(isAggregateChannelType("unknown")).toBe(false);
  });
});

describe("listAdaptersForOperation", () => {
  it("returns only adapters that can serve the operation", () => {
    expect(listAdaptersForOperation("chat")).toEqual(
      expect.arrayContaining([
        "openai-chat-completions",
        "openai-responses",
        "anthropic-messages",
        "gemini-generate-content",
        "cohere-chat",
        "vertex-google",
        "vertex-anthropic",
      ])
    );
    expect(listAdaptersForOperation("chat")).not.toContain("openai-embeddings");
    expect(listAdaptersForOperation("embedding")).toEqual(
      expect.arrayContaining([
        "openai-embeddings",
        "gemini-generate-content",
        "cohere-chat",
        "vertex-google",
      ])
    );
    expect(listAdaptersForOperation("rerank")).toEqual(["jina-rerank"]);
    expect(listAdaptersForOperation("music")).toEqual([
      "suno-newapi",
      "minimax-music",
    ]);
  });
});

describe("resolveAdapterIdForEndpointType", () => {
  it("maps recognized endpoint types case-insensitively for a compatible operation", () => {
    expect(resolveAdapterIdForEndpointType("openai-chat", "chat")).toBe(
      "openai-chat-completions"
    );
    expect(resolveAdapterIdForEndpointType("OPENAI-RESPONSE", "chat")).toBe(
      "openai-responses"
    );
    expect(resolveAdapterIdForEndpointType("anthropic", "chat")).toBe(
      "anthropic-messages"
    );
    expect(resolveAdapterIdForEndpointType("gemini", "chat")).toBe(
      "gemini-generate-content"
    );
    expect(resolveAdapterIdForEndpointType("embeddings", "embedding")).toBe(
      "openai-embeddings"
    );
    expect(resolveAdapterIdForEndpointType("jina-rerank", "rerank")).toBe(
      "jina-rerank"
    );
    expect(resolveAdapterIdForEndpointType("image-generation", "image")).toBe(
      "openai-image-generation"
    );
  });

  it("rejects unknown endpoint types and operation mismatches", () => {
    expect(resolveAdapterIdForEndpointType("future-protocol", "chat")).toBe(
      undefined
    );
    expect(resolveAdapterIdForEndpointType("openai-chat", "embedding")).toBe(
      undefined
    );
    expect(resolveAdapterIdForEndpointType("embeddings", "chat")).toBe(
      undefined
    );
  });
});
