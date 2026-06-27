import { describe, expect, it } from "vitest";
import {
  coerceAgentBoolean,
  normalizeAgentBooleanFields,
  parseAgentBoolean,
} from "../agentArgs";

describe("agentArgs", () => {
  it("parseAgentBoolean 应识别常见布尔字符串和数字", () => {
    expect(parseAgentBoolean(true)).toBe(true);
    expect(parseAgentBoolean(false)).toBe(false);
    expect(parseAgentBoolean("TRUE")).toBe(true);
    expect(parseAgentBoolean(" false ")).toBe(false);
    expect(parseAgentBoolean("1")).toBe(true);
    expect(parseAgentBoolean("0")).toBe(false);
    expect(parseAgentBoolean(1)).toBe(true);
    expect(parseAgentBoolean(0)).toBe(false);
    expect(parseAgentBoolean("maybe")).toBeUndefined();
  });

  it("coerceAgentBoolean 应保留默认值语义", () => {
    expect(coerceAgentBoolean(undefined, true)).toBe(true);
    expect(coerceAgentBoolean(undefined, false)).toBe(false);
    expect(coerceAgentBoolean("false", true)).toBe(false);
  });

  it("normalizeAgentBooleanFields 只转换已声明字段", () => {
    expect(
      normalizeAgentBooleanFields(
        { enabled: "false", confirm: "yes", untouched: "false" },
        ["enabled", "confirm"]
      )
    ).toEqual({ enabled: false, confirm: true, untouched: "false" });
  });
});
