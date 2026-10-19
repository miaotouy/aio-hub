import { describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
import type {
  LlmRequestOptions,
  MediaGenerationOptions,
  LlmResponse,
} from "@/llm-apis/common";
vi.mock("@/tools/vcp-connector/stores/vcpConnectorStore", () => ({
  useVcpStore: () => ({ config: { wsUrl: "" } }),
}));
import { sendChannelRequest } from "../llmChannelExecution";

function fixture() {
  const members: LlmProfile[] = ["primary", "backup"].map((id) => ({
    id,
    name: id,
    type: "openai",
    enabled: true,
    baseUrl: "https://" + id + ".example",
    apiKeys: [],
    models: [
      {
        id: id + "-model",
        name: id,
        capabilities: { toolUse: true, vision: true },
      },
    ],
  }));
  const profile: LlmProfile = {
    id: "virtual",
    name: "logical",
    type: "virtual",
    enabled: true,
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
  };
  const options: LlmRequestOptions = {
    profileId: profile.id,
    modelId: "logical-model",
    messages: [{ role: "user", content: "hi" }],
    stream: true,
  };
  return {
    profile,
    members,
    options,
    getProfiles: () => [profile, ...members],
  };
}
const unavailable = () =>
  Object.assign(new Error("temporarily unavailable"), { status: 503 });
describe("desktop channel boundary", () => {
  it("dispatches physical model IDs with member policy and retains the logical identity", async () => {
    const input = fixture();
    const send = vi.fn(
      async (
        options: LlmRequestOptions | MediaGenerationOptions
      ): Promise<LlmResponse> => {
        if (options.profileId === "primary") throw unavailable();
        return { content: "ok" };
      }
    );
    const response = await sendChannelRequest(
      {
        ...input.options,
        forceProxy: true,
        networkStrategy: "native",
        http1Only: true,
        inspectorContext: { sessionId: "session" },
      },
      input.getProfiles,
      send
    );
    expect(send.mock.calls.map(([o]) => [o.profileId, o.modelId])).toEqual([
      ["primary", "primary-model"],
      ["backup", "backup-model"],
    ]);
    expect(send.mock.calls[1][0]).toMatchObject({
      apiKey: undefined,
      forceProxy: undefined,
      networkStrategy: undefined,
      http1Only: undefined,
      inspectorContext: {
        sessionId: "session",
        logicalProfileId: "virtual",
        logicalModelId: "logical-model",
      },
    });
    expect(response.channelExecution?.actual.profileId).toBe("backup");
  });
  it("ignores late output from an abandoned member", async () => {
    const input = fixture();
    const seen = vi.fn();
    let abandoned: LlmRequestOptions | MediaGenerationOptions;
    const send = vi.fn(
      async (options: LlmRequestOptions | MediaGenerationOptions) => {
        if (options.profileId === "primary") {
          abandoned = options;
          throw unavailable();
        }
        abandoned.onStream?.("late");
        options.onStream?.("backup");
        return { content: "backup" };
      }
    );
    await sendChannelRequest(
      { ...input.options, onStream: seen },
      input.getProfiles,
      send
    );
    expect(seen.mock.calls).toEqual([["backup"]]);
  });
  it("stops after tool stream bytes even if no text callback is supplied", async () => {
    const input = fixture();
    const send = vi.fn(
      async (options: LlmRequestOptions | MediaGenerationOptions) => {
        options.transportObserver?.onResponseChunk?.({
          requestId: "test",
          receivedAt: Date.now(),
          chunk: new TextEncoder().encode('data: {"tool_calls":[{"index":0}]}'),
        });
        throw unavailable();
      }
    );
    await expect(
      sendChannelRequest(input.options, input.getProfiles, send)
    ).rejects.toMatchObject({
      retryable: false,
      attempts: [{ decision: { reason: "output_started" } }],
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("validates input capabilities and tool handling before any attempt", async () => {
    const input = fixture();
    input.members[1].models[0].capabilities!.vision = false;
    const send = vi.fn();
    await expect(
      sendChannelRequest(
        {
          ...input.options,
          messages: [
            {
              role: "user",
              content: [{ type: "image", imageBase64: "sample" }],
            },
          ],
        },
        input.getProfiles,
        send
      )
    ).rejects.toThrow("能力不足");
    input.members[1].toolHandling = {
      callConsumer: "upstream",
      upstreamProtocol: "vcp-text",
    };
    await expect(
      sendChannelRequest(input.options, input.getProfiles, send)
    ).rejects.toThrow("工具处理方式");
    expect(send).toHaveBeenCalledTimes(0);
  });
  it("validates PDF document input capabilities before dispatching a virtual binding", async () => {
    const input = fixture();
    input.members[0].models[0].capabilities!.document = true;
    input.members[1].models[0].capabilities!.document = false;
    const send = vi.fn();
    await expect(
      sendChannelRequest(
        {
          ...input.options,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: "pdf",
                  },
                },
              ],
            },
          ],
        },
        input.getProfiles,
        send
      )
    ).rejects.toThrow("能力不足");
    expect(send).not.toHaveBeenCalled();
  });
  it("pins opaque reasoning replay to the member that produced it", async () => {
    const input = fixture();
    const payload = { encrypted_content: "opaque-state" };
    const send = vi.fn(
      async (
        options: LlmRequestOptions | MediaGenerationOptions
      ): Promise<LlmResponse> => {
        if (options.profileId === "primary") throw unavailable();
        return {
          content: "ok",
          reasoningArtifacts: [
            {
              provider: "openai-responses",
              kind: "reasoning",
              replayPolicy: "always",
              payload,
            },
          ],
        };
      }
    );
    const first = await sendChannelRequest(
      input.options,
      input.getProfiles,
      send
    );
    expect(first.reasoningArtifacts?.[0].payload).toBe(payload);
    expect(first.reasoningArtifacts?.[0].channelTarget).toEqual({
      profileId: "backup",
      modelId: "backup-model",
    });
    send.mockClear();
    await sendChannelRequest(
      {
        ...input.options,
        messages: [
          {
            role: "assistant",
            content: "ok",
            reasoningArtifacts: first.reasoningArtifacts,
          },
        ],
      },
      input.getProfiles,
      send
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].profileId).toBe("backup");
  });
});
