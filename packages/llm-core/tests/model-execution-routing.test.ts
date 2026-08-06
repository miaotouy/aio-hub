import { describe, expect, it } from "vitest";
import {
  resolveModelExecution,
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

  it("throws a recoverable configuration error for an unregistered channel type", () => {
    expect(() =>
      resolveModelExecution({
        profile: profile("aggregate-compatible"),
        model: model(),
        operation: "chat",
      })
    ).toThrow("No default execution adapter is registered");
  });
});
