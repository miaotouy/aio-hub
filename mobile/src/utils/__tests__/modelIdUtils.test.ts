import { describe, expect, it } from "vitest";
import { compareModelGroup, compareModelId } from "../modelIdUtils";

function sortIds(ids: string[]): string[] {
  return [...ids].sort(compareModelId);
}

describe("compareModelId", () => {
  it("按数字段而非字典序排序版本号", () => {
    expect(compareModelId("gemini-3.5-flash", "gemini-3.7-flash")).toBeLessThan(
      0
    );
    expect(
      compareModelId("gemini-3.7-flash", "gemini-3.10-flash")
    ).toBeLessThan(0);
  });

  it("基础版本排在带小数点的版本之前", () => {
    expect(
      compareModelId("gemini-3-flash", "gemini-3.1-pro")
    ).toBeLessThan(0);
  });

  it("对同一组模型输出稳定的版本顺序", () => {
    expect(
      sortIds([
        "gemini-3.8-flash",
        "gemini-3.5-flash",
        "gemini-3.7-flash",
        "gemini-3.1-pro-preview",
        "gemini-3-flash-preview",
      ])
    ).toEqual([
      "gemini-3-flash-preview",
      "gemini-3.1-pro-preview",
      "gemini-3.5-flash",
      "gemini-3.7-flash",
      "gemini-3.8-flash",
    ]);
  });
});

describe("compareModelGroup", () => {
  it("按数字段排序分组名", () => {
    expect(compareModelGroup("Gemini 2", "Gemini 10")).toBeLessThan(0);
    expect(compareModelGroup("Gemini 3", "Gemini 2")).toBeGreaterThan(0);
  });
});
