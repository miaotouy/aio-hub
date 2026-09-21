import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
import { callTypeSafeSystemOneApi } from "../system-one-core";
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
