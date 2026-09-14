import { describe, expect, it } from "vitest";
import {
  compileActiveRules,
  createCatalogSnapshot,
  getMatchedRuleChain,
  mergeRuleProperties,
  materializeModelMetadata,
  detachModifiedMetadataPaths,
  migrateV2Store,
  syncCatalogSnapshot,
  testRuleMatch,
  type MaterializableModel,
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

  it("returns the same store when the shipped revision is unchanged", () => {
    const store = {
      version: "3.0.0" as const,
      sourceSnapshot: catalog,
      builtinOverrides: {},
      suppressedBuiltinRuleIds: [],
      customRules: [],
      updatedAt: "2026-08-24T00:00:00.000Z",
    };
    expect(syncCatalogSnapshot(store, catalog)).toBe(store);
  });
});

describe("built-in catalog auto-update", () => {
  const store = {
    version: "3.0.0" as const,
    sourceSnapshot: createCatalogSnapshot(
      [
        rule("builtin-openai", "modelContains", "gpt", { group: "OpenAI" }),
        rule("builtin-suppressed", "provider", "anthropic", {
          group: "Anthropic",
        }),
        rule("builtin-removed", "provider", "legacy", { group: "Legacy" }),
      ],
      "2026.08.24.1",
      "2026-08-24T00:00:00.000Z"
    ),
    builtinOverrides: {
      "builtin-openai": rule("builtin-openai", "modelContains", "gpt", {
        group: "My OpenAI",
      }),
    },
    suppressedBuiltinRuleIds: ["builtin-suppressed"],
    customRules: [
      rule("custom-user", "modelExact", "custom", { group: "Custom" }),
    ],
    updatedAt: "2026-08-24T00:00:00.000Z",
  };

  const nextCatalog = createCatalogSnapshot(
    [
      rule("builtin-openai", "modelContains", "gpt", { group: "OpenAI Next" }),
      rule("builtin-added", "provider", "newco", { group: "NewCo" }),
    ],
    "2026.09.09.1",
    "2026-09-09T00:00:00.000Z"
  );

  it("adopts the shipped catalog automatically while keeping local overrides, suppressions, and custom rules", () => {
    const synced = syncCatalogSnapshot(store, nextCatalog);

    expect(synced.sourceSnapshot.revision).toBe("2026.09.09.1");
    // A suppressed built-in that no longer exists upstream is dropped.
    expect(synced.suppressedBuiltinRuleIds).toEqual([]);
    // A pure built-in removed upstream disappears without user action.
    expect(
      synced.sourceSnapshot.rules.some((item) => item.id === "builtin-removed")
    ).toBe(false);
    expect(compileActiveRules(synced).map((item) => item.id)).toEqual([
      "builtin-openai",
      "builtin-added",
      "custom-user",
    ]);
    expect(
      compileActiveRules(synced).find((item) => item.id === "builtin-openai")
        ?.properties
    ).toEqual({ group: "My OpenAI" });
  });

  it("retains a locally edited built-in that upstream removed", () => {
    const withOrphan = {
      ...store,
      builtinOverrides: {
        ...store.builtinOverrides,
        "builtin-removed": rule("builtin-removed", "provider", "legacy", {
          group: "My Legacy",
        }),
      },
    };
    const synced = syncCatalogSnapshot(withOrphan, nextCatalog);

    expect(compileActiveRules(synced).map((item) => item.id)).toEqual([
      "builtin-openai",
      "builtin-added",
      "builtin-removed",
      "custom-user",
    ]);
  });
});

describe("shared model metadata materialization", () => {
  it("persists resolved metadata on the model and only refreshes managed follow-source fields", () => {
    const source: MaterializableModel & { name: string } = {
      id: "gpt-4o",
      provider: "openai",
      name: "GPT-4o",
    };
    const initial = materializeModelMetadata(
      source,
      {
        group: "OpenAI",
        tokenizer: "gpt4o",
        contextLength: 128000,
        capabilities: { vision: true },
      },
      {
        mode: "followSource",
        sourceRevision: "2026.08.24.1",
        appliedRuleIds: ["builtin-openai"],
        now: "2026-08-24T00:00:00.000Z",
      }
    );

    expect(initial.model).toMatchObject({
      group: "OpenAI",
      tokenizerProfileId: "gpt4o",
      apiFamily: "openai",
      tokenLimits: { contextLength: 128000 },
      capabilities: { vision: true },
      metadataBinding: {
        mode: "followSource",
        sourceRevision: "2026.08.24.1",
      },
    });

    const refreshed = materializeModelMetadata(
      initial.model,
      { group: "OpenAI Next", contextLength: 200000 },
      { sourceRevision: "2026.08.25.1" }
    );
    expect(refreshed.model.group).toBe("OpenAI Next");
    expect(refreshed.model.tokenLimits?.contextLength).toBe(200000);

    const detached = detachModifiedMetadataPaths(refreshed.model, {
      ...refreshed.model,
      group: "My group",
    });
    expect(detached.metadataBinding?.managedPaths).not.toContain("group");
  });
});
