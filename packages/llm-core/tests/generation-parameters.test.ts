import { describe, expect, it } from "vitest";
import {
  buildOpenAiCompatibleBody,
  buildOpenAiResponsesBody,
  buildAnthropicMessagesBody,
  buildCohereChatBody,
  buildGoogleGenerateContentRequest,
  DEFAULT_MAX_OUTPUT_TOKENS,
  limitOutputTokens,
  isSamplingParameterUnsupported,
  type LlmRequest,
} from "../src";

const messages: LlmRequest["messages"] = [{ role: "user", content: "Hello" }];

describe("generation parameter wire contracts", () => {
  it.each([
    ["gpt-4o", undefined, 0.2, "max_tokens"],
    ["gpt-5.1", "none", 0.2, "max_completion_tokens"],
    ["openai/gpt-5.2:online", "high", undefined, "max_completion_tokens"],
    ["gpt-5-mini", undefined, undefined, "max_completion_tokens"],
    ["o3-mini", undefined, undefined, "max_completion_tokens"],
    ["gpt-6-sol", "none", 0.2, "max_completion_tokens"],
    ["gpt-6-sol", "high", undefined, "max_completion_tokens"],
    ["third-party-reasoner", "high", 0.2, "max_tokens"],
  ] as const)(
    "handles sampling for %s effort %s",
    (model, reasoningEffort, temperature, budgetKey) => {
      const request = {
        model,
        messages,
        reasoningEffort,
        temperature: 0.2,
        topP: 0.8,
        maxTokens: 262144,
      };
      const chat = buildOpenAiCompatibleBody(request);
      const responses = buildOpenAiResponsesBody(request);
      expect(chat.temperature).toBe(temperature);
      expect(responses.temperature).toBe(temperature);
      expect(chat.top_p).toBe(temperature === undefined ? undefined : 0.8);
      expect(responses.max_output_tokens).toBe(262144);
      expect(chat[budgetKey]).toBe(262144);
    }
  );

  it("leaves omitted sampling and optional output budgets to the provider", () => {
    const request = { model: "custom-model", messages };
    const google = buildGoogleGenerateContentRequest(
      { provider: "gemini", baseUrl: "https://example.com" },
      request
    );
    const bodies = [
      buildOpenAiCompatibleBody(request),
      buildOpenAiResponsesBody(request),
      buildCohereChatBody(request),
    ];
    for (const body of bodies) expect(body.temperature).toBeUndefined();
    expect(google.body).toMatchObject({
      kind: "json",
      value: { generationConfig: {} },
    });
    expect(buildAnthropicMessagesBody(request).max_tokens).toBe(
      DEFAULT_MAX_OUTPUT_TOKENS
    );
    expect(
      buildAnthropicMessagesBody({ ...request, maxTokens: 2048 }).max_tokens
    ).toBe(2048);
  });

  it("uses final payload filtering for reasoning and preserves ordinary sampling", () => {
    const request = {
      model: "gpt-5.2",
      messages,
      reasoningEffort: "high",
      extraBody: { temperature: 0.7, top_p: 0.8 },
    };
    const reasoning = buildOpenAiCompatibleBody(request);
    const regular = buildOpenAiCompatibleBody({
      ...request,
      reasoningEffort: "none",
    });
    expect(reasoning.temperature).toBeUndefined();
    expect(reasoning.top_p).toBeUndefined();
    expect(regular).toMatchObject({ temperature: 0.7, top_p: 0.8 });
    const claude = {
      model: "claude-sonnet-4-5",
      messages,
      temperature: 0.2,
      topP: 0.8,
      topK: 20,
    };
    expect(buildAnthropicMessagesBody(claude)).toMatchObject({
      temperature: 0.2,
      top_p: 0.8,
      top_k: 20,
    });
    expect(
      buildAnthropicMessagesBody({
        ...claude,
        thinkingEnabled: true,
        extraBody: { temperature: 0.7 },
      }).temperature
    ).toBeUndefined();
    expect(
      buildOpenAiCompatibleBody({ ...claude, thinkingEnabled: true })
        .temperature
    ).toBeUndefined();
  });

  it("honors discovered sampling capabilities without assuming all thinking models reject sampling", () => {
    const request = { model: "custom-reasoner", reasoningEffort: "high" };
    expect(isSamplingParameterUnsupported("temperature", request)).toBe(false);
    expect(
      isSamplingParameterUnsupported("temperature", {
        ...request,
        supportedParameters: ["top_p"],
      })
    ).toBe(true);
    expect(
      isSamplingParameterUnsupported("topP", {
        ...request,
        supportedParameters: ["top_p"],
      })
    ).toBe(false);
  });
});

describe("model output budgets", () => {
  it("preserves large and omitted budgets while enforcing known model limits", () => {
    expect(limitOutputTokens(262144, undefined)).toBe(262144);
    expect(limitOutputTokens(65536, 8192)).toBe(8192);
    expect(limitOutputTokens(262144, 128000)).toBe(128000);
    expect(limitOutputTokens(2048, 65536)).toBe(2048);
    expect(limitOutputTokens(undefined, 65536)).toBeUndefined();
  });
});
