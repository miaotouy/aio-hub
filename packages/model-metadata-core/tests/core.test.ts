import { describe, expect, it } from "vitest";
import {
  compileActiveRules,
  createCatalogSnapshot,
  diffBuiltinCatalog,
  getMatchedRuleChain,
  mergeRuleProperties,
  migrateV2Store,
  testRuleMatch,
  type ModelMetadataRule,
} from "../src";

const rule = (
  id: string,
  matchType: ModelMetadataRule["matchType"],
  matchValue: string,
  properties: Record<string, unknown> = {},
  extras: Partial<ModelMetadataRule> = {}
): ModelMetadataRule => ({ id, matchType, matchValue, properties, ...extras });

describe("model metadata matching and merging", () => {
  it("uses case-insensitive normalized match types", () => {
    expect(
      testRuleMatch(rule("provider", "provider", "OpenAI"), {
        modelId: "gpt-4o",
        provider: "openai",
      })
    ).toBe(true);
    expect(
      testRuleMatch(rule("exact", "modelExact", "GPT-4O"), {
        modelId: "gpt-4o",
      })
    ).toBe(true);
    expect(
      testRuleMatch(rule("prefix", "modelPrefix", "gpt-"), {
        modelId: "gpt-4o",
      })
    ).toBe(true);
    expect(
      testRuleMatch(rule("contains", "modelContains", "4o"), {
        modelId: "gpt-4o",
      })
    ).toBe(true);
    expect(
      testRuleMatch(rule("regex", "modelRegex", "^gpt-[0-9]+o$"), {
        modelId: "gpt-4o",
      })
    ).toBe(true);
    expect(
      testRuleMatch(rule("invalid", "modelRegex", "["), { modelId: "gpt-4o" })
    ).toBe(false);
  });

  it("orders same-priority rules deterministically and honors exclusive boundaries", () => {
    const chain = getMatchedRuleChain(
      [
        rule("z-provider", "provider", "openai", {}, { priority: 20 }),
        rule("contains", "modelContains", "gpt", {}, { priority: 20 }),
        rule("prefix", "modelPrefix", "gpt-", {}, { priority: 20 }),
        rule("regex", "modelRegex", "^gpt", {}, { priority: 20 }),
        rule("exact", "modelExact", "gpt-4o", {}, { priority: 20 }),
        rule("low", "modelContains", "gpt", {}, { priority: 10 }),
        rule(
          "exclusive",
          "modelContains",
          "gpt",
          {},
          { priority: 20, exclusive: true }
        ),
      ],
      { modelId: "gpt-4o", provider: "openai" }
    );

    expect(chain.map((item) => item.id)).toEqual([
      "z-provider",
      "contains",
      "exclusive",
      "prefix",
      "regex",
      "exact",
    ]);
  });

  it("deep merges objects, replaces arrays, retains falsey values, and applies unset paths", () => {
    const result = mergeRuleProperties([
      rule("base", "modelContains", "gpt", {
        capabilities: { vision: true, toolUse: true },
        recommendedFor: ["chat", "code"],
        enabled: true,
        retry: 3,
      }),
      rule(
        "override",
        "modelExact",
        "gpt-4o",
        {
          capabilities: { vision: false },
          recommendedFor: ["analysis"],
          enabled: false,
          retry: 0,
          label: "",
        },
        { unsetPaths: ["capabilities.toolUse", "__proto__.polluted"] }
      ),
    ]);

    expect(result).toEqual({
      capabilities: { vision: false },
      recommendedFor: ["analysis"],
      enabled: false,
      retry: 0,
      label: "",
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("model metadata store migration and catalog diff", () => {
  const builtin = rule("builtin-openai", "modelContains", "gpt", {
    group: "OpenAI",
    recommendedFor: ["chat"],
  });
  const catalog = createCatalogSnapshot(
    [builtin],
    "2026.08.24.1",
    "2026-08-24T00:00:00.000Z"
  );

  it("preserves v2 custom values, disabled rules, and removed builtins without guessing user intent", () => {
    const result = migrateV2Store(
      {
        version: "2.0.0",
        rules: [
          {
            id: "builtin-openai",
            matchType: "modelPrefix",
            matchValue: "gpt",
            properties: { group: "My OpenAI" },
            enabled: false,
          },
          {
            id: "custom-user",
            matchType: "model",
            matchValue: "custom",
            properties: { icon: "custom.svg" },
          },
        ],
      },
      catalog,
      "2026-08-24T00:00:00.000Z"
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.store?.builtinOverrides["builtin-openai"]).toMatchObject({
      matchType: "modelContains",
      enabled: false,
      properties: { group: "My OpenAI" },
    });
    expect(result.store?.customRules).toMatchObject([
      { id: "custom-user", matchType: "modelExact" },
    ]);
    expect(compileActiveRules(result.store!).map((item) => item.id)).toEqual([
      "builtin-openai",
      "custom-user",
    ]);
  });

  it("blocks migration for legacy modelGroup rules", () => {
    const result = migrateV2Store(
      {
        rules: [
          {
            id: "group",
            matchType: "modelGroup",
            matchValue: "legacy",
            properties: {},
          },
        ],
      },
      catalog,
      "2026-08-24T00:00:00.000Z"
    );
    expect(result.store).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "legacy-model-group", blocking: true })
    );
  });

  it("identifies pure upstream updates and true field conflicts", () => {
    const localCatalog = createCatalogSnapshot(
      [builtin],
      "2026.08.24.1",
      "2026-08-24T00:00:00.000Z"
    );
    const store = {
      version: "3.0.0" as const,
      sourceSnapshot: localCatalog,
      builtinOverrides: {
        "builtin-openai": rule("builtin-openai", "modelContains", "gpt", {
          group: "Local",
          recommendedFor: ["chat"],
        }),
      },
      suppressedBuiltinRuleIds: [],
      customRules: [],
      updatedAt: "2026-08-24T00:00:00.000Z",
    };
    const [result] = diffBuiltinCatalog(store, [
      rule("builtin-openai", "modelContains", "gpt", {
        group: "Incoming",
        recommendedFor: ["analysis"],
      }),
    ]);
    expect(result.status).toBe("conflict");
    expect(result.fields).toContainEqual(
      expect.objectContaining({ path: "properties.group", kind: "conflict" })
    );
    expect(result.fields).toContainEqual(
      expect.objectContaining({
        path: "properties.recommendedFor",
        kind: "upstream",
      })
    );
  });
});
