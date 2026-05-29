import { describe, it, expect, vi, beforeEach } from "vitest";
import { callDeepSeekChatApi } from "../chat";
import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions } from "@/llm-apis/common";

vi.mock("@/llm-apis/common", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
    ensureResponseOk: vi.fn(),
  };
});

vi.mock("@/utils/serialization", () => ({
  asyncJsonStringify: vi.fn(async (obj) => JSON.stringify(obj)),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { fetchWithTimeout } from "@/llm-apis/common";

describe("DeepSeek Adapter - Chat", () => {
  const mockProfile: LlmProfile = {
    id: "deepseek-profile",
    name: "DeepSeek Profile",
    baseUrl: "https://api.deepseek.com/v1",
    apiKeys: ["test-key"],
    type: "deepseek",
    enabled: true,
    models: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes DeepSeek thinking options without sending OpenAI reasoning_effort", async () => {
    const options: LlmRequestOptions = {
      profileId: "deepseek-profile",
      modelId: "deepseek-v4-flash",
      messages: [{ role: "user", content: "Name this topic" }],
      reasoningEffort: "low",
      thinkingEnabled: false,
      extraBody: {
        custom_flag: true,
      },
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: "DeepSeek topic" },
            finish_reason: "stop",
          },
        ],
      }),
    });

    await callDeepSeekChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.reasoning_effort).toBeUndefined();
    expect(body.extra_body).toEqual({
      thinking: { type: "disabled" },
      custom_flag: true,
    });
  });
});
