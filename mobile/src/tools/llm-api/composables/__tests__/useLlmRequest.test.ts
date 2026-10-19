import { describe, expect, it, vi } from "vitest";
import { LlmApiError, TimeoutError } from "../../core/common";
import type { LlmProfile } from "../../types";
import type { LlmRequestOptions, LlmResponse } from "../../types/common";
import {
  createLlmRequest,
  type LlmRequestDependencies,
} from "../useLlmRequest";

function createProfile(overrides: Partial<LlmProfile> = {}): LlmProfile {
  return {
    id: "profile-default",
    name: "Default Profile",
    type: "openai",
    baseUrl: "https://api.example.com/v1",
    apiKeys: ["default-key"],
    enabled: true,
    models: [{ id: "default-model", name: "Default Model" }],
    ...overrides,
  };
}

function createDependencies(
  profiles: LlmProfile[],
  selectedProfile: LlmProfile | null = profiles[0] ?? null
) {
  const executeAdapter =
    vi.fn<
      (profile: LlmProfile, options: LlmRequestOptions) => Promise<LlmResponse>
    >();
  const dependencies: LlmRequestDependencies = {
    store: {
      isLoaded: true,
      init: vi.fn(async () => undefined),
      profiles,
      selectedProfile,
    },
    keyManager: {
      pickKey: vi.fn(() => "picked-key"),
      reportSuccess: vi.fn(),
      reportFailure: vi.fn(),
    },
    executeAdapter,
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
    },
    errorHandler: {
      error: vi.fn(),
      handle: vi.fn(),
    },
  };

  return { dependencies, executeAdapter };
}

describe("createLlmRequest", () => {
  it("uses the explicit profile and preserves generation and stream contracts", async () => {
    const selectedProfile = createProfile();
    const explicitProfile = createProfile({
      id: "profile-agent",
      name: "Agent Profile",
      models: [{ id: "agent-model", name: "Agent Model" }],
      apiKeys: ["agent-key-a", "agent-key-b"],
      relaxIdCerts: true,
      http1Only: true,
    });
    const { dependencies, executeAdapter } = createDependencies(
      [selectedProfile, explicitProfile],
      selectedProfile
    );
    const streamChunks: string[] = [];
    const reasoningChunks: string[] = [];
    const response: LlmResponse = {
      content: "answer",
      reasoningContent: "reasoning",
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
      },
      isStream: true,
    };

    executeAdapter.mockImplementation(async (_profile, options) => {
      options.onStream?.("answer");
      options.onReasoningStream?.("reasoning");
      return response;
    });

    const request = createLlmRequest(dependencies);
    const options: LlmRequestOptions = {
      modelId: "agent-model",
      messages: [{ role: "user", content: "hello" }],
      maxTokens: 1024,
      temperature: 0.2,
      topP: 0.8,
      frequencyPenalty: 0.1,
      presencePenalty: 0.3,
      stop: ["END"],
      onStream: (chunk) => streamChunks.push(chunk),
      onReasoningStream: (chunk) => reasoningChunks.push(chunk),
    };

    const result = await request.sendRequest(options, explicitProfile.id);

    expect(executeAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        id: explicitProfile.id,
        apiKeys: ["picked-key"],
      }),
      expect.objectContaining({
        modelId: "agent-model",
        maxTokens: 1024,
        temperature: 0.2,
        topP: 0.8,
        frequencyPenalty: 0.1,
        presencePenalty: 0.3,
        stop: ["END"],
        stream: true,
        timeout: 300000,
        relaxIdCerts: true,
        http1Only: true,
      })
    );
    expect(dependencies.keyManager.pickKey).toHaveBeenCalledWith(
      explicitProfile
    );
    expect(dependencies.keyManager.reportSuccess).toHaveBeenCalledWith(
      explicitProfile.id,
      "picked-key"
    );
    expect(streamChunks).toEqual(["answer"]);
    expect(reasoningChunks).toEqual(["reasoning"]);
    expect(result).toBe(response);
    expect(result.usage).toEqual(response.usage);
    expect(request.isSending.value).toBe(false);
  });

  it("initializes the store and uses the selected profile when no override is given", async () => {
    const selectedProfile = createProfile();
    const { dependencies, executeAdapter } = createDependencies(
      [selectedProfile],
      selectedProfile
    );
    dependencies.store.isLoaded = false;
    executeAdapter.mockResolvedValue({ content: "ok", isStream: false });

    const request = createLlmRequest(dependencies);
    await request.sendRequest({
      modelId: "default-model",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
      timeout: 1000,
    });

    expect(dependencies.store.init).toHaveBeenCalledOnce();
    expect(executeAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ id: selectedProfile.id }),
      expect.objectContaining({ stream: false, timeout: 1000 })
    );
  });

  it("retries a recoverable failure up to the configured limit", async () => {
    vi.useFakeTimers();
    try {
      const profile = createProfile();
      const { dependencies, executeAdapter } = createDependencies([profile]);
      executeAdapter
        .mockRejectedValueOnce(
          new LlmApiError("temporary outage", 503, "Service Unavailable")
        )
        .mockResolvedValueOnce({ content: "ok", isStream: false });

      const request = createLlmRequest(dependencies);
      const resultPromise = request.sendRequest({
        modelId: "default-model",
        messages: [{ role: "user", content: "hello" }],
        maxRetries: 1,
      });
      await vi.advanceTimersByTimeAsync(300);

      await expect(resultPromise).resolves.toMatchObject({ content: "ok" });
      expect(executeAdapter).toHaveBeenCalledTimes(2);
      expect(dependencies.keyManager.reportFailure).toHaveBeenCalledOnce();
      expect(dependencies.keyManager.reportSuccess).toHaveBeenCalledOnce();
      expect(dependencies.errorHandler.handle).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry after a stream has emitted content", async () => {
    const profile = createProfile();
    const { dependencies, executeAdapter } = createDependencies([profile]);
    const failure = new TimeoutError();
    executeAdapter.mockImplementation(async (_profile, options) => {
      options.onStream?.("partial");
      throw failure;
    });

    const request = createLlmRequest(dependencies);
    await expect(
      request.sendRequest({
        modelId: "default-model",
        messages: [{ role: "user", content: "hello" }],
        maxRetries: 2,
        onStream: vi.fn(),
      })
    ).rejects.toBe(failure);

    expect(executeAdapter).toHaveBeenCalledOnce();
    expect(dependencies.errorHandler.handle).toHaveBeenCalledOnce();
  });

  it("reports adapter failures against the selected key and rethrows them", async () => {
    const profile = createProfile();
    const { dependencies, executeAdapter } = createDependencies([profile]);
    const failure = new Error("provider unavailable");
    executeAdapter.mockRejectedValue(failure);

    const request = createLlmRequest(dependencies);
    await expect(
      request.sendRequest({
        modelId: "default-model",
        messages: [{ role: "user", content: "hello" }],
      })
    ).rejects.toBe(failure);

    expect(dependencies.keyManager.reportFailure).toHaveBeenCalledWith(
      profile.id,
      "picked-key",
      failure
    );
    expect(dependencies.errorHandler.handle).toHaveBeenCalledWith(failure, {
      showToUser: false,
      context: { modelId: "default-model" },
    });
    expect(dependencies.keyManager.reportSuccess).not.toHaveBeenCalled();
    expect(request.isSending.value).toBe(false);
  });
  it("uses ordered virtual members with their own keys and one shared attempt budget", async () => {
    const members = ["primary", "backup"].map((id) =>
      createProfile({ id, models: [{ id: id + "-model", name: id }] })
    );
    const profile = createProfile({
      id: "logical",
      type: "virtual",
      baseUrl: "",
      apiKeys: [],
      virtualChannel: {
        mode: "failover",
        members: members.map((p) => p.id),
        maxAttempts: 2,
        totalTimeoutMs: 1000,
      },
      models: [
        {
          id: "logical-model",
          name: "chat",
          virtualBindings: {
            chat: members.map((p) => ({
              profileId: p.id,
              modelId: p.models[0].id,
            })),
          },
        },
      ],
    });
    const { dependencies, executeAdapter } = createDependencies([
      profile,
      ...members,
    ]);
    executeAdapter
      .mockRejectedValueOnce(
        new LlmApiError("unavailable", 503, "Service Unavailable")
      )
      .mockResolvedValue({ content: "backup response" });
    const request = createLlmRequest(dependencies);
    const result = await request.sendRequest({
      profileId: profile.id,
      modelId: "logical-model",
      messages: [{ role: "user", content: "hi" }],
      maxRetries: 10,
    });
    expect(
      executeAdapter.mock.calls.map(([p, o]) => [p.id, o.modelId, o.maxRetries])
    ).toEqual([
      ["primary", "primary-model", 0],
      ["backup", "backup-model", 0],
    ]);
    expect(result.channelExecution?.requested).toEqual({
      profileId: "logical",
      modelId: "logical-model",
    });
    expect(result.channelExecution?.actual.profileId).toBe("backup");
    expect(dependencies.keyManager.pickKey).toHaveBeenCalledTimes(2);
    expect(request.isSending.value).toBe(false);
  });
});

it("applies model output and discovered sampling limits before executing the mobile adapter", async () => {
  const profile = createProfile({
    models: [
      {
        id: "custom-model",
        name: "Custom",
        tokenLimits: { output: 128000 },
        supportedFeatures: { parameters: ["top_p"] },
      },
    ],
  });
  const { dependencies, executeAdapter } = createDependencies([profile]);
  executeAdapter.mockResolvedValue({ content: "answer", isStream: false });
  await createLlmRequest(dependencies).sendRequest({
    modelId: "custom-model",
    messages: [{ role: "user", content: "hello" }],
    maxTokens: 262144,
    maxCompletionTokens: 262144,
    temperature: 0.2,
    topP: 0.8,
  });
  const sent = executeAdapter.mock.calls[0][1];
  expect(sent).toMatchObject({
    maxTokens: 128000,
    maxCompletionTokens: 128000,
    topP: 0.8,
  });
  expect(sent.temperature).toBeUndefined();
});
