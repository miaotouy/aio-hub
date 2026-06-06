import { describe, expect, it } from "vitest";
import { getProviderTypeInfo } from "@/config/llm-providers";
import type { LlmProfile } from "@/types/llm-profiles";
import { openAiResponsesUrlHandler } from "../utils";

describe("OpenAI adapter URL handlers", () => {
  it("uses the Responses endpoint as the OpenAI Responses placeholder", () => {
    const providerInfo = getProviderTypeInfo("openai-responses");

    expect(providerInfo?.endpointPlaceholders?.chatCompletions).toBe(
      "/v1/responses"
    );
    expect(providerInfo?.endpointPlaceholders?.imagesGenerations).toBe(
      "/v1/responses"
    );
  });

  it("uses custom chat endpoint for OpenAI Responses requests", () => {
    const profile = {
      baseUrl: "https://api.example.com",
      customEndpoints: {
        chatCompletions: "/v1/responses-custom",
      },
    } as LlmProfile;

    const url = openAiResponsesUrlHandler.buildUrl(
      profile.baseUrl,
      "responses",
      profile
    );

    expect(url).toBe("https://api.example.com/v1/responses-custom");
  });
});
