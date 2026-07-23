import { describe, expect, it } from "vitest";
import { parseSelectedModelValue } from "../modelSelection";

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
