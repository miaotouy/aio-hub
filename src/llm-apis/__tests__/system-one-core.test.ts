import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
import { callDecisionApi, callTypeSafeSystemOneApi } from "../system-one-core";
import { desktopLlmTransport } from "../transports/desktop";

afterEach(() => vi.restoreAllMocks());

describe("desktop TypeSafe System One facade", () => {
  it("uses the desktop transport without entering the chat adapter registry", async () => {
    const profile = createProfile();
    const send = vi.spyOn(desktopLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: chunks({
        model: "jev-1.13.0",
        answers: { urgent: { type: "noul", noul: 0.92 } },
        usage: { input_tokens: 25, output_tokens: 4 },
      }),
    });

    const result = await callTypeSafeSystemOneApi(profile, {
      model: "jev-1.13.0",
      state: "Please help immediately",
      questions: {
        urgent: {
          type: "noul",
          instructions: "Does the message convey urgency?",
        },
      },
      requestId: "typesafe-test",
      timeoutMs: 12_000,
    });

    expect(send.mock.calls[0][0]).toMatchObject({
      method: "POST",
      url: "https://api.typesafe.ai/v1/systemone",
      headers: { Authorization: "Bearer test-key" },
      body: {
        kind: "json",
        value: {
          model: "jev-1.13.0",
          state: "Please help immediately",
        },
      },
    });
    expect(send.mock.calls[0][1]).toMatchObject({
      requestId: "typesafe-test",
      timeoutMs: 12_000,
      network: { strategy: "proxy" },
    });
    expect(result).toEqual({
      model: "jev-1.13.0",
      answers: { urgent: { type: "noul", noul: 0.92 } },
      usage: { inputTokens: 25, outputTokens: 4 },
    });
  });

  it("passes images and Box answers through OpenRouter's compatible System One endpoint", async () => {
    const profile = {
      ...createProfile(),
      type: "openrouter" as const,
      baseUrl: "https://openrouter.ai/api/v1",
    };
    const box = { top: 0.25, bottom: 0.82, left: 0.44, right: 0.84 };
    const send = vi.spyOn(desktopLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: chunks({
        id: "gen-dec-test",
        model: "typesafe/jev-1.14",
        provider: "TypeSafe",
        answers: { target: { type: "box", box, confidence: 0.92 } },
        usage: { input_tokens: 290, output_tokens: 21, cost: 0.00001 },
      }),
    });
    const assets = {
      "photo-ref": { type: "image", format: "png", data_base64: "aW1hZ2U=" },
    } as const;
    const result = await callTypeSafeSystemOneApi(profile, {
      model: "typesafe/jev-1.14",
      state: { photo: "photo-ref" },
      assets,
      longContext: true,
      questions: { target: { type: "box", instructions: "The mug in photo" } },
    });
    expect(send.mock.calls[0][0]).toMatchObject({
      url: "https://openrouter.ai/api/v1/systemone",
      headers: {
        Authorization: "Bearer test-key",
        "TypeSafe-Danger-Zone-Images": "true",
        "TypeSafe-Danger-Zone-Long-Context": "true",
      },
      body: { kind: "json", value: { model: "typesafe/jev-1.14", assets } },
    });
    expect(result.answers.target).toEqual({
      type: "box",
      box,
      confidence: 0.92,
    });
  });

  it.each([
    {
      binding: undefined,
      adapterId: undefined,
      expected: "https://openrouter.ai/api/alpha/decisions",
    },
    {
      binding: "typesafe-system-one" as const,
      adapterId: undefined,
      expected: "https://openrouter.ai/api/v1/systemone",
    },
    {
      binding: "typesafe-system-one" as const,
      adapterId: "openrouter-decisions" as const,
      expected: "https://openrouter.ai/api/alpha/decisions",
    },
  ])(
    "dispatches persisted decision routes and explicit probe overrides: $expected",
    async ({ binding, adapterId, expected }) => {
      const model = "perplexity/pplx-decider-v1.1-27b";
      const source: LlmProfile = {
        ...createProfile(),
        type: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        models: [
          {
            id: model,
            name: model,
            routing: binding
              ? {
                  bindings: {
                    decision: { adapterId: binding, source: "manual" },
                  },
                }
              : undefined,
          },
        ],
      };
      const send = vi
        .spyOn(desktopLlmTransport, "send")
        .mockResolvedValue({
          status: 200,
          statusText: "OK",
          headers: {},
          body: chunks({
            model,
            answers: { urgent: { type: "noul", noul: 0.8 } },
            usage: { input_tokens: 3, output_tokens: 1 },
          }),
        });
      await callDecisionApi(source, {
        model,
        state: "Checkout failed",
        questions: { urgent: { type: "noul", instructions: "Urgent?" } },
        adapterId,
      });
      expect(send.mock.calls[0][0]).toMatchObject({
        url: expected,
        headers: { Authorization: "Bearer test-key" },
        body: { kind: "json", value: { model } },
      });
    }
  );

  it("uses the proxy for an absolute local Decisions override on a remote profile", async () => {
    const source: LlmProfile = {
      ...createProfile(),
      type: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      networkStrategy: "native",
      customEndpoints: { decisions: "http://127.0.0.1:13469/decisions" },
    };
    const send = vi
      .spyOn(desktopLlmTransport, "send")
      .mockResolvedValue({
        status: 200,
        statusText: "OK",
        headers: {},
        body: chunks({
          model: "local-decision",
          answers: { urgent: { type: "noul", noul: 0.8 } },
          usage: { input_tokens: 3, output_tokens: 1 },
        }),
      });
    await callDecisionApi(source, {
      model: "local-decision",
      state: "Checkout failed",
      questions: { urgent: { type: "noul", instructions: "Urgent?" } },
    });
    expect(send.mock.calls[0][0].url).toBe("http://127.0.0.1:13469/decisions");
    expect(send.mock.calls[0][1].network?.strategy).toBe("proxy");
  });

  it("forces the Rust proxy for local decision endpoints marked native", async () => {
    const profile = createProfile();
    profile.baseUrl = "http://127.0.0.1:13469/v1";
    profile.networkStrategy = "native";
    const send = vi.spyOn(desktopLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: chunks({
        model: "e2e-jev",
        answers: { risk: { type: "noul", noul: 0.1 } },
        usage: { input_tokens: 1, output_tokens: 0 },
      }),
    });

    await callTypeSafeSystemOneApi(profile, {
      model: "e2e-jev",
      state: "approve",
      questions: {
        risk: { type: "noul", instructions: "risk?" },
      },
      requestId: "typesafe-local",
    });

    expect(send.mock.calls[0][0].url).toBe(
      "http://127.0.0.1:13469/v1/systemone"
    );
    expect(send.mock.calls[0][1]).toMatchObject({
      network: { strategy: "proxy" },
    });
  });
});

function createProfile(): LlmProfile {
  return {
    id: "typesafe-profile",
    name: "TypeSafe",
    type: "typesafe",
    baseUrl: "https://api.typesafe.ai",
    apiKeys: ["test-key"],
    enabled: true,
    models: [],
    networkStrategy: "proxy",
  };
}

async function* chunks(value: unknown) {
  yield new TextEncoder().encode(JSON.stringify(value));
}
