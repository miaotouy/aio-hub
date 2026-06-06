import { describe, expect, it } from "vitest";
import {
  getMatchedModelProperties,
  getMatchedRuleChain,
} from "../model-metadata";
import type { ModelMetadataRule } from "@/types/model-metadata";

function makeRule(
  id: string,
  priority: number,
  properties: ModelMetadataRule["properties"],
  overrides: Partial<ModelMetadataRule> = {}
): ModelMetadataRule {
  return {
    id,
    matchType: "modelPrefix",
    matchValue: "gpt",
    priority,
    enabled: true,
    properties,
    ...overrides,
  };
}

describe("model-metadata rule chain", () => {
  it("returns matching rules from low to high priority and merges in the same order", () => {
    const rules = [
      makeRule("provider-openai", 5, { group: "OpenAI" }),
      makeRule("gpt-family", 20, {
        icon: "/model-icons/openai-color.svg",
        capabilities: { vision: true },
      }),
      makeRule("gpt-specific", 100, {
        group: "GPT",
        capabilities: { toolUse: true },
      }),
    ];

    const chain = getMatchedRuleChain(rules, "gpt-4o");
    const finalProperties = getMatchedModelProperties(rules, "gpt-4o");

    expect(chain.map((rule) => rule.id)).toEqual([
      "provider-openai",
      "gpt-family",
      "gpt-specific",
    ]);
    expect(finalProperties).toEqual({
      group: "GPT",
      icon: "/model-icons/openai-color.svg",
      capabilities: { vision: true, toolUse: true },
    });
  });

  it("keeps only rules at or above the highest exclusive priority", () => {
    const rules = [
      makeRule("low", 10, { group: "Low" }),
      makeRule("exclusive", 50, { icon: "/model-icons/gpt.svg" }, {
        exclusive: true,
      }),
      makeRule("high", 80, { group: "High" }),
    ];

    const chain = getMatchedRuleChain(rules, "gpt-4o");
    const finalProperties = getMatchedModelProperties(rules, "gpt-4o");

    expect(chain.map((rule) => rule.id)).toEqual(["exclusive", "high"]);
    expect(finalProperties).toEqual({
      icon: "/model-icons/gpt.svg",
      group: "High",
    });
  });
});
