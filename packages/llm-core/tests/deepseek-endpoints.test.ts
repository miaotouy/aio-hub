import { describe, expect, it } from "vitest";
import {
  buildOpenAiCompatibleRequest,
  modelListAdapter,
  normalizeDeepSeekProfile,
  type LlmRequest,
  type ProviderProfile,
} from "../src";

const profile: ProviderProfile = {
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  apiKey: "test-only",
};
const prefix: Partial<LlmRequest> = {
  messages: [
    { role: "user", content: "Continue" },
    { role: "assistant", content: "Start", prefix: true },
  ],
};
const strict: Partial<LlmRequest> = {
  tools: [
    {
      type: "function",
      function: {
        name: "lookup",
        strict: true,
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
  ],
};
function chat(connection: ProviderProfile, extra: Partial<LlmRequest> = {}) {
  return buildOpenAiCompatibleRequest(connection, {
    model: "deepseek-flash",
    messages: [{ role: "user", content: "Hello" }],
    ...extra,
  });
}

describe("DeepSeek Beta endpoint preference", () => {
  it("normalizes legacy URLs, defaults on, preserves explicit false and unrelated configuration", () => {
    const legacy = {
      ...profile,
      baseUrl: "https://proxy.example/service/beta/",
      options: { preserved: "value" },
      headers: { "X-Test": "kept" },
    };
    const migrated = normalizeDeepSeekProfile(legacy);
    expect(migrated).toEqual({
      ...legacy,
      baseUrl: "https://proxy.example/service",
      options: { preserved: "value", deepseekBeta: true },
    });
    expect(normalizeDeepSeekProfile(migrated)).toBe(migrated);
    expect(legacy.baseUrl).toBe("https://proxy.example/service/beta/");
    expect(normalizeDeepSeekProfile(profile).options?.deepseekBeta).toBe(true);
    expect(
      normalizeDeepSeekProfile({ ...legacy, options: { deepseekBeta: false } })
        .options?.deepseekBeta
    ).toBe(false);
    const otherProvider = { ...legacy, provider: "openai-compatible" };
    expect(normalizeDeepSeekProfile(otherProvider)).toBe(otherProvider);
  });

  it.each([undefined, true, false])(
    "keeps normal chat and model listing stable with Beta preference %s",
    (deepseekBeta) => {
      const connection = {
        ...profile,
        baseUrl: "https://api.deepseek.com/beta",
        options: deepseekBeta === undefined ? undefined : { deepseekBeta },
      };
      expect(chat(connection).url).toBe(
        "https://api.deepseek.com/v1/chat/completions"
      );
      expect(
        chat(connection, {
          tools: [
            {
              type: "function",
              function: {
                name: "normal_tool",
                parameters: { type: "object", properties: {} },
              },
            },
          ],
        }).url
      ).toBe("https://api.deepseek.com/v1/chat/completions");
      expect(
        modelListAdapter.buildRequest(connection, {
          provider: "deepseek",
          endpoint: "models",
        }).url
      ).toBe("https://api.deepseek.com/v1/models");
      expect(connection.baseUrl).toBe("https://api.deepseek.com/beta");
    }
  );

  it.each([
    { name: "prefix", request: prefix },
    { name: "strict tools", request: strict },
  ])(
    "routes $name through Beta by default and permits stable endpoints when switched off",
    ({ request }) => {
      expect(chat(profile, request).url).toBe(
        "https://api.deepseek.com/beta/chat/completions"
      );
      expect(
        chat({ ...profile, options: { deepseekBeta: true } }, request).url
      ).toBe("https://api.deepseek.com/beta/chat/completions");
      const stable = chat(
        { ...profile, options: { deepseekBeta: false } },
        request
      );
      expect(stable.url).toBe("https://api.deepseek.com/v1/chat/completions");
      if (stable.body?.kind !== "json")
        throw new Error("Expected JSON request");
      expect(stable.body.value).toMatchObject(request);
    }
  );

  it("preserves reverse proxy prefixes and removes version segments before the Beta route", () => {
    const connection = {
      ...profile,
      baseUrl: "https://proxy.example/service/v1",
    };
    expect(chat(connection, prefix).url).toBe(
      "https://proxy.example/service/beta/chat/completions"
    );
    const legacy = {
      ...profile,
      baseUrl: "https://proxy.example/service/beta/v1",
    };
    expect(chat(legacy).url).toBe(
      "https://proxy.example/service/v1/chat/completions"
    );
    expect(
      modelListAdapter.buildRequest(legacy, {
        provider: "deepseek",
        endpoint: "models",
      }).url
    ).toBe("https://proxy.example/service/v1/models");
  });

  it("uses final wire-body features and keeps explicit endpoint overrides authoritative", () => {
    expect(
      chat(profile, {
        extensions: {
          messages: [{ role: "assistant", content: "Start", prefix: true }],
        },
      }).url
    ).toBe("https://api.deepseek.com/beta/chat/completions");
    for (const endpoint of ["https://custom.example/chat", "/gateway/chat"]) {
      expect(
        chat({ ...profile, endpoints: { chatCompletions: endpoint } }, prefix)
          .url
      ).toBe(
        endpoint.startsWith("https:")
          ? endpoint
          : "https://api.deepseek.com/gateway/chat"
      );
    }
    expect(
      chat({ ...profile, provider: "openai-compatible" }, prefix).url
    ).toBe("https://api.deepseek.com/v1/chat/completions");
  });
});
