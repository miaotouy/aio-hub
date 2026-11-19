// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRegexRule } from "../../types/chatRegex";
import {
  applyRegexRules,
  clearScriptCache,
  executeReplacementScript,
} from "../chatRegexUtils";

const rule = (overrides: Partial<ChatRegexRule>): ChatRegexRule => ({
  id: "script",
  enabled: true,
  regex: "hello",
  flags: "g",
  replacement: "",
  applyTo: { render: true, request: false },
  targetRoles: ["assistant"],
  replacementType: "script",
  ...overrides,
});
const context = { match: "hello", groups: [], index: 0, source: "hello" };
beforeEach(clearScriptCache);
afterEach(() => vi.restoreAllMocks());

describe("chat regex replacement scripts", () => {
  it.each([
    ["return match.toUpperCase();", "HELLO"],
    ["match.toUpperCase()", "HELLO"],
    ["match.toUpperCase();", "HELLO"],
    ['match + " return"', "hello return"],
    ["const value = match.toUpperCase(); return value;", "HELLO"],
  ])("executes expression or body %s", (script, expected) => {
    expect(executeReplacementScript(script, context)).toBe(expected);
  });

  it("preserves optional capture positions and offsets with named groups", () => {
    const input = "prefix b tail";
    const rules = [
      rule({
        regex: "(a)?(?<letter>b)",
        scriptContent: "return JSON.stringify({ groups, index, source });",
      }),
    ];
    expect(applyRegexRules(input, rules)).toBe(
      "prefix " +
        JSON.stringify({ groups: [null, "b"], index: 7, source: input }) +
        " tail"
    );
  });

  it("executes each match once and retains the original for nullish results", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const rules = [rule({ scriptContent: "(console.log(index), null)" })];
    expect(applyRegexRules("hello hello", rules)).toBe("hello hello");
    expect(log.mock.calls).toEqual([[0], [6]]);
  });

  it.each(["return (", 'throw new Error("script failed");'])(
    "preserves failed matches in rendering and reports the same failure to preview: %s",
    (script) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(executeReplacementScript(script, context)).toBe("hello");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(() =>
        executeReplacementScript(script, context, { throwOnError: true })
      ).toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
    }
  );

  it("keeps trimStrings capture numbering when named captures are present", () => {
    expect(
      applyRegexRules("aa-bb", [
        rule({
          regex: "(a+)-(?<second>b+)",
          replacementType: "regex",
          replacement: "$1/$2/$3",
          trimStrings: ["a", "b"],
        }),
      ])
    ).toBe("//$3");
  });
});
