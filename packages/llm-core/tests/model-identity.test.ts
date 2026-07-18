import { describe, expect, it } from "vitest";
import {
  buildEmbeddingSpaceDescriptor,
  getEmbeddingSpaceId,
  getLegacyRouteCanonicalId,
  getModelIdentity,
  listRoutesByCanonicalId,
  materializeModelIdentity,
  normalizeCanonicalModelId,
  resolveBuiltinModelIdentity,
  suggestModelIdentityFromProvider,
  validateModelIdentityPresets,
  type ModelIdentityPresetRule,
} from "../src";

describe("model identity", () => {
  it("normalizes valid canonical IDs and rejects ambiguous values", () => {
    expect(normalizeCanonicalModelId(" OpenAI\\Text-Embedding-3-Small ")).toBe(
      "openai/text-embedding-3-small"
    );
    expect(normalizeCanonicalModelId("text-embedding-3-small")).toBeNull();
    expect(normalizeCanonicalModelId("openai/a/b")).toBeNull();
    expect(normalizeCanonicalModelId("openai/模型")).toBeNull();
  });

  it("maps exact route aliases but never guesses unknown names", () => {
    expect(
      resolveBuiltinModelIdentity("text-embedding-3-small")?.identity.canonicalId
    ).toBe("openai/text-embedding-3-small");
    expect(
      resolveBuiltinModelIdentity("openai/text-embedding-3-small")?.identity
        .canonicalId
    ).toBe("openai/text-embedding-3-small");
    expect(resolveBuiltinModelIdentity("azure-embedding-production")).toBeNull();
  });

  it("keeps provider ownership as a suggestion instead of a fact", () => {
    const suggestion = suggestModelIdentityFromProvider(
      "openai/text-embedding-3-small",
      "OpenAI"
    );
    expect(suggestion).toMatchObject({
      confidence: "suggested",
      identity: {
        canonicalId: "openai/text-embedding-3-small",
        source: "provider",
      },
    });
    expect(suggestModelIdentityFromProvider("model", undefined)).toBeNull();
  });

  it("fills only missing identities and preserves user values", () => {
    const userModel = {
      id: "text-embedding-3-small",
      modelIdentity: {
        canonicalId: "vendor/private-embedding",
        source: "user" as const,
      },
    };
    expect(materializeModelIdentity(userModel)).toBe(userModel);
    expect(
      materializeModelIdentity({ id: "text-embedding-3-small" }).modelIdentity
        ?.source
    ).toBe("builtin");
  });

  it("rejects conflicting exact catalog entries", () => {
    const rules: ModelIdentityPresetRule[] = [
      {
        id: "a",
        routeModelId: "same-route",
        identity: { canonicalId: "vendor/model-a" },
        evidence: { kind: "maintainer-verified", reference: "test:a" },
      },
      {
        id: "b",
        routeModelId: "SAME-ROUTE",
        identity: { canonicalId: "vendor/model-b" },
        evidence: { kind: "maintainer-verified", reference: "test:b" },
      },
    ];
    expect(() => validateModelIdentityPresets(rules)).toThrow(/冲突映射/);
  });

  it("lists equivalent routes without changing routing", () => {
    const profiles = [
      {
        id: "profile-a",
        models: [materializeModelIdentity({ id: "text-embedding-3-small" })],
      },
      {
        id: "profile-b",
        models: [
          materializeModelIdentity({ id: "openai/text-embedding-3-small" }),
        ],
      },
    ];
    const routes = listRoutesByCanonicalId(
      profiles,
      "openai/text-embedding-3-small"
    );
    expect(routes.map(({ route }) => route)).toEqual([
      { profileId: "profile-a", modelId: "text-embedding-3-small" },
      { profileId: "profile-b", modelId: "openai/text-embedding-3-small" },
    ]);
    expect(getModelIdentity(profiles[0].models[0])?.source).toBe("builtin");
  });
});

describe("embedding spaces", () => {
  it("produces stable IDs and changes them for request-contract changes", async () => {
    const base = buildEmbeddingSpaceDescriptor({
      modelIdentity: { canonicalId: "OpenAI/Text-Embedding-3-Small" },
      dimensions: 1536,
    });
    const same = buildEmbeddingSpaceDescriptor({
      dimensions: 1536,
      modelIdentity: { canonicalId: "openai/text-embedding-3-small" },
    });
    const changed = buildEmbeddingSpaceDescriptor({
      modelIdentity: { canonicalId: "openai/text-embedding-3-small" },
      dimensions: 1024,
    });
    expect(await getEmbeddingSpaceId(base)).toBe(await getEmbeddingSpaceId(same));
    expect(await getEmbeddingSpaceId(changed)).not.toBe(
      await getEmbeddingSpaceId(base)
    );
  });

  it("isolates legacy routes without exposing route data in canonical IDs", async () => {
    const a = await getLegacyRouteCanonicalId({
      profileId: "profile-a",
      modelId: "embedding",
    });
    const b = await getLegacyRouteCanonicalId({
      profileId: "profile-b",
      modelId: "embedding",
    });
    expect(a).toMatch(/^legacy-route\/[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
  });
});
