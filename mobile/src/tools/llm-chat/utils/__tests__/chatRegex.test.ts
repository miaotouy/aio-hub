import { describe, expect, it } from "vitest";
import type { ChatRegexConfig, ChatRegexRule } from "../../types/chatRegex";
import {
  applyRegexRules,
  collectStageRules,
  filterRulesByDepth,
  filterRulesByRole,
  mergeRegexConfigs,
  readRegexRule,
  resolveMessageRules,
} from "../chatRegex";

function config(
  presets: ChatRegexConfig["presets"]
): ChatRegexConfig {
  return { presets };
}

const renderRule: ChatRegexRule = {
  enabled: true,
  name: "仅渲染",
  regex: "/world/g",
  replacement: "移动端",
  applyTo: { render: true, request: false },
  targetRoles: ["assistant"],
};

const requestRule: ChatRegexRule = {
  enabled: true,
  name: "仅请求",
  regex: "/foo/g",
  replacement: "bar",
  applyTo: { render: false, request: true },
  targetRoles: ["user"],
};

describe("chatRegex collectStageRules", () => {
  it("splits render and request stages without interference", () => {
    const source = config([
      { enabled: true, rules: [renderRule, requestRule] },
    ]);

    expect(collectStageRules("render", source).map((rule) => rule.name)).toEqual(
      ["仅渲染"]
    );
    expect(
      collectStageRules("request", source).map((rule) => rule.name)
    ).toEqual(["仅请求"]);
  });

  it("orders rules by preset priority then rule order with stable ties", () => {
    const source = config([
      {
        enabled: true,
        priority: 100,
        rules: [
          { ...requestRule, name: "late", order: 0 },
        ],
      },
      {
        enabled: true,
        priority: 10,
        rules: [
          { ...requestRule, name: "middle", order: 10 },
          { ...requestRule, name: "early", order: 20 },
        ],
      },
    ]);

    expect(
      collectStageRules("request", source).map((rule) => rule.name)
    ).toEqual(["middle", "early", "late"]);
  });

  it("ignores disabled presets and disabled rules", () => {
    const source = config([
      { enabled: false, rules: [requestRule] },
      {
        enabled: true,
        rules: [{ ...requestRule, enabled: false }, requestRule],
      },
    ]);

    expect(collectStageRules("request", source)).toHaveLength(1);
  });
});

describe("chatRegex filters", () => {
  it("filters by role and depth", () => {
    const rules = collectStageRules(
      "request",
      config([
        {
          enabled: true,
          rules: [
            { ...requestRule, name: "assistant", targetRoles: ["assistant"] },
            {
              ...requestRule,
              name: "newest-user",
              targetRoles: ["user"],
              depthRange: { max: 0 },
            },
          ],
        },
      ])
    );

    const assistantRules = filterRulesByRole(rules, "assistant");
    expect(assistantRules.map((rule) => rule.name)).toEqual(["assistant"]);

    const userRules = filterRulesByRole(rules, "user");
    expect(filterRulesByDepth(userRules, 0).map((rule) => rule.name)).toEqual([
      "newest-user",
    ]);
    expect(filterRulesByDepth(userRules, 1)).toHaveLength(0);
  });

  it("resolves per-message rules for a stage", () => {
    const source = config([
      { enabled: true, rules: [renderRule, requestRule] },
    ]);

    const resolved = resolveMessageRules("render", "assistant", 0, source);
    expect(resolved.map((rule) => rule.name)).toEqual(["仅渲染"]);
  });
});

describe("chatRegex multi-source merge", () => {
  it("keeps source order for equal priority and lower priority first", () => {
    const globalConfig = config([
      {
        enabled: true,
        priority: 100,
        rules: [{ ...requestRule, name: "global" }],
      },
    ]);
    const agentConfig = config([
      {
        enabled: true,
        priority: 10,
        rules: [{ ...requestRule, name: "agent" }],
      },
      {
        enabled: true,
        priority: 100,
        rules: [{ ...requestRule, name: "agent-tie" }],
      },
    ]);

    const merged = mergeRegexConfigs(globalConfig, agentConfig);
    expect(merged?.presets).toHaveLength(3);

    expect(
      collectStageRules("request", globalConfig, agentConfig).map(
        (rule) => rule.name
      )
    ).toEqual(["agent", "global", "agent-tie"]);
  });

  it("treats missing sources as empty", () => {
    expect(mergeRegexConfigs(undefined, null, {})).toBeUndefined();
  });
});

describe("chatRegex legacy compatibility", () => {
  it("defaults render to false when old configs omit it", () => {
    const parsed = readRegexRule({
      enabled: true,
      regex: "a",
      replacement: "b",
      applyTo: { request: true },
      targetRoles: ["user"],
    });

    expect(parsed?.applyTo).toEqual({ render: false, request: true });
    const legacyRules = [parsed as ChatRegexRule];
    expect(
      collectStageRules("render", config([{ enabled: true, rules: legacyRules }]))
    ).toHaveLength(0);
    expect(
      collectStageRules("request", config([{ enabled: true, rules: legacyRules }]))
    ).toHaveLength(1);
  });

  it("rejects rules without any stage flag or target roles", () => {
    expect(
      readRegexRule({
        enabled: true,
        regex: "a",
        replacement: "b",
        applyTo: {},
        targetRoles: ["user"],
      })
    ).toBeNull();
    expect(
      readRegexRule({
        enabled: true,
        regex: "a",
        replacement: "b",
        applyTo: { request: true },
        targetRoles: [],
      })
    ).toBeNull();
  });
});

describe("chatRegex applyRegexRules", () => {
  it("applies rules in order and reports replacements", () => {
    const rules = collectStageRules(
      "request",
      config([
        {
          enabled: true,
          rules: [
            { ...requestRule, name: "first", regex: "a", replacement: "b", order: 0 },
            { ...requestRule, name: "second", regex: "b", replacement: "c", order: 1 },
          ],
        },
      ])
    );

    const outcome = applyRegexRules("a", rules);
    expect(outcome.text).toBe("c");
    expect(outcome.replacements).toBe(2);
    expect(outcome.skippedScripts).toBe(0);
    expect(outcome.failedRules).toHaveLength(0);
  });

  it("skips script rules and collects failed rules without throwing", () => {
    const rules = collectStageRules(
      "request",
      config([
        {
          enabled: true,
          rules: [
            { ...requestRule, name: "script", replacementType: "script" },
            { ...requestRule, name: "broken", regex: "[" },
          ],
        },
      ])
    );

    const outcome = applyRegexRules("foo", rules);
    expect(outcome.text).toBe("foo");
    expect(outcome.skippedScripts).toBe(1);
    expect(outcome.failedRules).toHaveLength(1);
  });
});
