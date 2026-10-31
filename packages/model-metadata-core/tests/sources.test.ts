import { describe, expect, it } from "vitest";
import {
  compileActiveRules,
  createCatalogSnapshot,
  getMatchedRuleChain,
  getRuleSourceInfo,
  litellmAdapter,
  materializeModelMetadata,
  mergeRuleProperties,
  modelsDevAdapter,
  type ModelMetadataRule,
  type ModelMetadataStoreV3,
} from "../src";

const rule = (
  id: string,
  matchValue: string,
  properties: Record<string, unknown> = {}
): ModelMetadataRule => ({
  id,
  matchType: "modelExact",
  matchValue,
  properties,
});

function createStore(
  external: Partial<ModelMetadataStoreV3> = {}
): ModelMetadataStoreV3 {
  return {
    version: "3.0.0",
    sourceSnapshot: createCatalogSnapshot(
      [rule("builtin-gpt", "gpt-4o", { contextLength: 128000 })],
      "rev-1",
      "2026-01-01T00:00:00.000Z"
    ),
    builtinOverrides: {},
    suppressedBuiltinRuleIds: [],
    customRules: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...external,
  };
}

describe("models.dev adapter", () => {
  it("maps provider models to exact-match rules", () => {
    const parsed = modelsDevAdapter.parse(
      {
        acme: {
          id: "acme",
          name: "Acme",
          models: {
            "acme/chat-pro": {
              id: "acme/chat-pro",
              description: "A capable chat model",
              reasoning: true,
              tool_call: true,
              release_date: "2026-02-01",
              modalities: { input: ["text", "image"], output: ["text"] },
              limit: { context: 200000, output: 8192 },
              cost: { input: 1.5, output: 6, cache_read: 0.3 },
            },
          },
        },
      },
      "2026-10-31T00:00:00.000Z"
    );

    expect(parsed.sourceId).toBe("models-dev");
    expect(parsed.rules).toHaveLength(1);
    const [parsedRule] = parsed.rules;
    expect(parsedRule.matchValue).toBe("chat-pro");
    expect(parsedRule.priority).toBeLessThan(0);
    expect(parsedRule.sourceId).toBe("models-dev");
    expect(parsedRule.properties).toMatchObject({
      contextLength: 200000,
      description: "A capable chat model",
      releaseDate: "2026-02-01",
      pricing: { input: 1.5, output: 6, cacheHitInput: 0.3, unit: "USD" },
      capabilities: { vision: true, toolUse: true, thinking: true },
    });
  });

  it("keeps canonical ids without duplicating match values", () => {
    const parsed = modelsDevAdapter.parse({
      acme: {
        name: "Acme",
        models: {
          vendored: {
            id: "acme/vendored",
            canonical_model_id: "upstream/vendored",
            limit: { context: 64000 },
          },
        },
      },
    });
    expect(parsed.rules.map((item) => item.matchValue)).toEqual(["vendored"]);
  });
});

describe("litellm adapter", () => {
  it("converts per-token costs and capabilities", () => {
    const parsed = litellmAdapter.parse(
      {
        sample_spec: { mode: "chat" },
        "openai/gpt-test": {
          litellm_provider: "openai",
          mode: "chat",
          max_input_tokens: 100000,
          input_cost_per_token: 0.0000025,
          output_cost_per_token: 0.00001,
          cache_read_input_token_cost: 0.00000125,
          supports_vision: true,
          supports_function_calling: true,
          supports_reasoning: true,
        },
      },
      "2026-10-31T00:00:00.000Z"
    );

    expect(parsed.rules).toHaveLength(1);
    const [parsedRule] = parsed.rules;
    expect(parsedRule.matchValue).toBe("gpt-test");
    expect(parsedRule.properties).toMatchObject({
      contextLength: 100000,
      pricing: {
        input: 2.5,
        output: 10,
        cacheHitInput: 1.25,
        unit: "USD",
      },
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
      },
    });
  });

  it("filters non-chat and size-spec entries", () => {
    const parsed = litellmAdapter.parse({
      "1024-x-1024/50-steps/stability.stable-diffusion": {
        mode: "image_generation",
        litellm_provider: "stability",
      },
      "bedrock/image-model": {
        mode: "image_generation",
        litellm_provider: "bedrock",
      },
      "openai/embed": {
        mode: "embedding",
        max_input_tokens: 8192,
      },
    });
    expect(parsed.rules.map((item) => item.matchValue)).toEqual(["embed"]);
    expect(parsed.rules[0].properties).toMatchObject({
      capabilities: { embedding: true },
    });
  });
});

describe("multi-catalog compilation", () => {
  const externalCatalog = createCatalogSnapshot(
    [rule("ext-source-a-chat-pro", "chat-pro", { contextLength: 200000 })],
    "ext-rev-1",
    "2026-10-01T00:00:00.000Z",
    "source-a"
  );

  it("ignores external catalogs until the source is enabled", () => {
    const store = createStore({
      externalCatalogs: { "source-a": externalCatalog },
    });
    expect(compileActiveRules(store).map((item) => item.id)).toEqual([
      "builtin-gpt",
    ]);
  });

  it("merges enabled catalogs and tags rule sources", () => {
    const store = createStore({
      externalCatalogs: { "source-a": externalCatalog },
      externalSourceStates: { "source-a": { enabled: true } },
    });
    const compiled = compileActiveRules(store);
    expect(compiled.map((item) => item.id)).toEqual([
      "builtin-gpt",
      "ext-source-a-chat-pro",
    ]);
    expect(compiled[0].sourceId).toBe("aiohub-builtin");
    expect(compiled[1].sourceId).toBe("source-a");
    expect(getRuleSourceInfo(store, "ext-source-a-chat-pro")).toEqual({
      kind: "external",
      sourceId: "source-a",
      overridden: false,
    });
  });

  it("applies overrides and reports them on external rules", () => {
    const store = createStore({
      externalCatalogs: { "source-a": externalCatalog },
      externalSourceStates: { "source-a": { enabled: true } },
      builtinOverrides: {
        "ext-source-a-chat-pro": rule("ext-source-a-chat-pro", "chat-pro", {
          contextLength: 1000000,
          sourceId: "source-a",
        }),
      },
    });
    const compiled = compileActiveRules(store);
    expect(
      compiled.find((item) => item.id === "ext-source-a-chat-pro")?.properties
    ).toMatchObject({ contextLength: 1000000 });
    expect(getRuleSourceInfo(store, "ext-source-a-chat-pro")).toEqual({
      kind: "external",
      sourceId: "source-a",
      overridden: true,
    });
  });

  it("reports built-in and custom sources", () => {
    const store = createStore({
      customRules: [{ ...rule("custom-1", "mine"), sourceId: "custom" }],
    });
    expect(getRuleSourceInfo(store, "builtin-gpt")).toEqual({
      kind: "builtin",
      sourceId: "aiohub-builtin",
      overridden: false,
    });
    expect(getRuleSourceInfo(store, "custom-1")).toEqual({
      kind: "custom",
      sourceId: "aiohub-custom",
      overridden: false,
    });
  });

  it("lets lower-priority external rules fill missing fields only", () => {
    const externalCatalog = createCatalogSnapshot(
      [
        rule("ext-source-a-chat-pro", "chat-pro", { contextLength: 200000 }),
        rule("ext-source-a-gpt", "gpt-4o", { contextLength: 1000000 }),
      ],
      "ext-rev-2",
      "2026-10-01T00:00:00.000Z",
      "source-a"
    );
    const store = createStore({
      externalCatalogs: { "source-a": externalCatalog },
      externalSourceStates: { "source-a": { enabled: true } },
    });
    const compiled = compileActiveRules(store).map((item) => ({
      ...item,
      priority: item.sourceId === "source-a" ? -10 : (item.priority ?? 0),
    }));

    const newModelChain = getMatchedRuleChain(compiled, {
      modelId: "chat-pro",
    });
    const newModel = materializeModelMetadata(
      { id: "chat-pro" },
      mergeRuleProperties(newModelChain)
    );
    expect(newModel.model.tokenLimits?.contextLength).toBe(200000);

    const existingModel = materializeModelMetadata(
      { id: "chat-pro", tokenLimits: { contextLength: 4096 } },
      mergeRuleProperties(newModelChain)
    );
    expect(existingModel.model.tokenLimits?.contextLength).toBe(4096);

    const builtinWins = materializeModelMetadata(
      { id: "gpt-4o" },
      mergeRuleProperties(getMatchedRuleChain(compiled, { modelId: "gpt-4o" }))
    );
    expect(builtinWins.model.tokenLimits?.contextLength).toBe(128000);
  });
});
