import { describe, expect, it } from "vitest";
import type { LlmProfile } from "../../../llm-api/types";
import {
  parseSelectedModelValue,
  resolveSelectedModelValue,
} from "../modelSelection";

const profiles = [
  {
    id: "empty-profile",
    enabled: true,
    models: [],
  },
  {
    id: "profile-1",
    enabled: true,
    models: [{ id: "model-1" }, { id: "model-2" }],
  },
] as LlmProfile[];

describe("parseSelectedModelValue", () => {
  it("preserves model IDs containing colons", () => {
    expect(parseSelectedModelValue("profile-id:qwen3.5:9b")).toEqual([
      "profile-id",
      "qwen3.5:9b",
    ]);
  });

  it("returns an empty pair for a malformed selection", () => {
    expect(parseSelectedModelValue("profile-id")).toEqual(["", ""]);
  });
});

describe("resolveSelectedModelValue", () => {
  it("preserves a valid current selection", () => {
    expect(
      resolveSelectedModelValue(
        "profile-1:model-2",
        "profile-1:model-1",
        profiles
      )
    ).toBe("profile-1:model-2");
  });

  it("uses the configured default after an empty or stale selection", () => {
    expect(resolveSelectedModelValue("", "profile-1:model-2", profiles)).toBe(
      "profile-1:model-2"
    );
    expect(
      resolveSelectedModelValue("missing:model", "profile-1:model-2", profiles)
    ).toBe("profile-1:model-2");
  });

  it("falls back to the first available model when the default is stale", () => {
    expect(resolveSelectedModelValue("", "missing:model", profiles)).toBe(
      "profile-1:model-1"
    );
  });

  it("returns an empty selection when no enabled profile exposes a model", () => {
    expect(resolveSelectedModelValue("", "", [profiles[0]])).toBe("");
  });
});
