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
import { buildRuleContributions } from "../coverageAnalysis";
import type { ModelMetadataRule } from "@/types/model-metadata";

function makeRule(
  id: string,
  priority: number,
  properties: ModelMetadataRule["properties"]
): ModelMetadataRule {
  return {
    id,
    matchType: "modelPrefix",
    matchValue: "claude",
    priority,
    enabled: true,
    properties,
  };
}

describe("coverageAnalysis", () => {
  it("marks nested property paths as effective or overridden", () => {
    const contributions = buildRuleContributions([
      makeRule("base", 10, {
        icon: "/model-icons/anthropic.svg",
        capabilities: {
          vision: true,
          toolUse: true,
        },
      }),
      makeRule("specific", 100, {
        capabilities: {
          vision: false,
          thinking: true,
        },
      }),
    ]);

    expect(contributions[0].effectiveFields).toEqual([
      "icon",
      "capabilities.toolUse",
    ]);
    expect(contributions[0].overriddenFields).toEqual(["capabilities.vision"]);
    expect(contributions[1].effectiveFields).toEqual([
      "capabilities.vision",
      "capabilities.thinking",
    ]);
    expect(contributions[1].overriddenFields).toEqual([]);
  });
});
