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
import type { ModelCapabilities } from "@/types/llm-profiles";
import {
  MIN_THINKING_BUDGET,
  pickLowestReasoningEffort,
  resolveThinkingParams,
} from "../thinking";

function caps(
  type: ModelCapabilities["thinkingConfigType"],
  options?: string[]
): ModelCapabilities {
  return {
    thinking: true,
    thinkingConfigType: type,
    reasoningEffortOptions: options,
  };
}

describe("resolveThinkingParams", () => {
  it("does not send anything in default mode", () => {
    expect(
      resolveThinkingParams({
        mode: "default",
        capabilities: caps("budget"),
        isGemini: true,
      })
    ).toEqual({});
  });

  it("ignores models without thinking capability", () => {
    expect(
      resolveThinkingParams({
        mode: "disabled",
        capabilities: { thinking: false },
      })
    ).toEqual({});
  });

  it("disables a switch model", () => {
    expect(
      resolveThinkingParams({ mode: "disabled", capabilities: caps("switch") })
    ).toEqual({ thinkingEnabled: false });
  });

  it("disables Gemini budget thinking with a zero budget", () => {
    expect(
      resolveThinkingParams({
        mode: "disabled",
        capabilities: caps("budget"),
        isGemini: true,
      })
    ).toEqual({ thinkingEnabled: false, thinkingBudget: 0 });
  });

  it("disables non-Gemini budget thinking without a budget field", () => {
    expect(
      resolveThinkingParams({
        mode: "disabled",
        capabilities: caps("budget"),
        isGemini: false,
      })
    ).toEqual({ thinkingEnabled: false });
  });

  it("picks the lowest effort, preferring none when disabling", () => {
    expect(
      resolveThinkingParams({
        mode: "disabled",
        capabilities: caps("effort", ["none", "low", "medium", "high"]),
      })
    ).toEqual({ reasoningEffort: "none" });
    expect(
      resolveThinkingParams({
        mode: "disabled",
        capabilities: caps("effort", ["low", "medium", "high"]),
      })
    ).toEqual({ reasoningEffort: "low" });
  });

  it("falls back to a conservative effort when options are missing", () => {
    expect(
      resolveThinkingParams({
        mode: "disabled",
        capabilities: caps("effort"),
      })
    ).toEqual({ reasoningEffort: "low" });
  });

  it("enables a switch model in minimal mode", () => {
    expect(
      resolveThinkingParams({ mode: "minimal", capabilities: caps("switch") })
    ).toEqual({ thinkingEnabled: true });
  });

  it("keeps minimal budget thinking enabled at the floor", () => {
    expect(
      resolveThinkingParams({ mode: "minimal", capabilities: caps("budget") })
    ).toEqual({ thinkingEnabled: true, thinkingBudget: MIN_THINKING_BUDGET });
  });

  it("prefers minimal effort in minimal mode", () => {
    expect(
      resolveThinkingParams({
        mode: "minimal",
        capabilities: caps("effort", ["minimal", "low", "medium", "high"]),
      })
    ).toEqual({ reasoningEffort: "minimal" });
    expect(
      resolveThinkingParams({
        mode: "minimal",
        capabilities: caps("effort", ["low", "medium", "high"]),
      })
    ).toEqual({ reasoningEffort: "low" });
  });
});

describe("pickLowestReasoningEffort", () => {
  it("normalizes case and whitespace", () => {
    expect(pickLowestReasoningEffort([" HIGH ", "Low"], false)).toBe("low");
  });

  it("returns the first option when nothing matches the priority list", () => {
    expect(pickLowestReasoningEffort(["turbo", "standard"], false)).toBe(
      "turbo"
    );
  });
});
