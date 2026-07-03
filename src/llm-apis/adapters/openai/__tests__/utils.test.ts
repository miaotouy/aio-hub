// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
