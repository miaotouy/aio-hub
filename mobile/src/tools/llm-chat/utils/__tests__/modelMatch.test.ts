import { describe, expect, it } from "vitest";
import { isModelMatchSatisfied } from "../modelMatch";

describe("isModelMatchSatisfied", () => {
  it("preserves provider-native model IDs that contain colons", () => {
    expect(
      isModelMatchSatisfied(
        {
          enabled: true,
          patterns: ["^llama3\\.2:latest$"],
        },
        { modelId: "llama3.2:latest" }
      )
    ).toBe(true);
  });

  it("still matches the final path segment of namespaced model IDs", () => {
    expect(
      isModelMatchSatisfied(
        {
          enabled: true,
          patterns: ["^qwen2\\.5:7b$"],
        },
        { modelId: "library/qwen2.5:7b" }
      )
    ).toBe(true);
  });

  it("combines model and profile criteria in all mode", () => {
    expect(
      isModelMatchSatisfied(
        {
          enabled: true,
          mode: "all",
          patterns: ["llama"],
          profilePatterns: ["local ollama"],
        },
        {
          modelId: "llama3.2:latest",
          profileName: "Local Ollama",
        }
      )
    ).toBe(true);
  });
});
