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
import type { LlmRequestOptions } from "@/llm-apis/common";
import { filterParametersByCapabilities } from "@/llm-apis/request-builder";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";

function createProfile(type: LlmProfile["type"]): LlmProfile {
  return {
    id: `test-${type}`,
    name: `Test ${type}`,
    type,
    baseUrl: "https://example.com/v1",
    apiKeys: ["test-key"],
    enabled: true,
    models: [],
  };
}

function createThinkingModel(
  id: string,
  thinkingConfigType: "budget" | "effort",
  provider?: string
): LlmModelInfo {
  return {
    id,
    name: id,
    provider,
    capabilities: {
      thinking: true,
      thinkingConfigType,
    },
  };
}

function createOptions(
  modelId: string,
  overrides: Partial<LlmRequestOptions>
): LlmRequestOptions {
  return {
    profileId: "test-profile",
    modelId,
    messages: [{ role: "user", content: "Think" }],
    ...overrides,
  };
}

describe("filterParametersByCapabilities thinking parameters", () => {
  it("preserves Gemini 3 effort and summaries behind OpenAI-compatible profiles", () => {
    const modelId = "gemini-3.1-pro-preview";
    const result = filterParametersByCapabilities(
      createOptions(modelId, {
        reasoningEffort: "high",
        includeThoughts: true,
      }),
      createProfile("openai-compatible"),
      createThinkingModel(modelId, "effort", "google")
    );

    expect(result.reasoningEffort).toBe("high");
    expect(result.includeThoughts).toBe(true);
  });

  it("preserves Gemini 2.5 budgets and summaries behind OpenAI profiles", () => {
    const modelId = "gemini-2.5-pro";
    const result = filterParametersByCapabilities(
      createOptions(modelId, {
        thinkingEnabled: true,
        thinkingBudget: 4096,
        includeThoughts: true,
      }),
      createProfile("openai"),
      createThinkingModel(modelId, "budget", "google")
    );

    expect(result.thinkingEnabled).toBe(true);
    expect(result.thinkingBudget).toBe(4096);
    expect(result.includeThoughts).toBe(true);
  });

  it("does not preserve Gemini summaries for non-Gemini thinking models", () => {
    const modelId = "gpt-5";
    const result = filterParametersByCapabilities(
      createOptions(modelId, {
        reasoningEffort: "low",
        includeThoughts: true,
      }),
      createProfile("openai"),
      createThinkingModel(modelId, "effort", "openai")
    );

    expect(result.reasoningEffort).toBe("low");
    expect(result.includeThoughts).toBeUndefined();
  });
});
