import type {
  MetadataCatalogSnapshot,
  MetadataProperties,
  MetadataRuleSourceInfo,
  ModelMetadataRule,
  ModelMetadataStoreV3,
} from "./types";

export const BUILTIN_SOURCE_ID = "aiohub-builtin";
export const CUSTOM_SOURCE_ID = "aiohub-custom";

function allCatalogEntries<TProperties extends MetadataProperties>(
  store: ModelMetadataStoreV3<TProperties>
): Array<{ snapshot: MetadataCatalogSnapshot<TProperties>; kind: "builtin" | "external" }> {
  const entries: Array<{
    snapshot: MetadataCatalogSnapshot<TProperties>;
    kind: "builtin" | "external";
  }> = [{ snapshot: store.sourceSnapshot, kind: "builtin" }];
  for (const snapshot of Object.values(store.externalCatalogs ?? {})) {
    entries.push({ snapshot, kind: "external" });
  }
  return entries;
}

/** Enabled catalogs in merge order: built-in first, then external sources. */
export function getActiveCatalogEntries<TProperties extends MetadataProperties>(
  store: ModelMetadataStoreV3<TProperties>
): Array<{ snapshot: MetadataCatalogSnapshot<TProperties>; kind: "builtin" | "external" }> {
  return allCatalogEntries(store).filter(
    ({ snapshot, kind }) =>
      kind === "builtin" ||
      store.externalSourceStates?.[snapshot.sourceId]?.enabled === true
  );
}

export function compileActiveRules<TProperties extends MetadataProperties>(
  store: ModelMetadataStoreV3<TProperties>
): ModelMetadataRule<TProperties>[] {
  const suppressed = new Set(store.suppressedBuiltinRuleIds);
  const knownCatalogIds = new Set(
    allCatalogEntries(store).flatMap(({ snapshot }) =>
      snapshot.rules.map((rule) => rule.id)
    )
  );

  const catalogRules = getActiveCatalogEntries(store).flatMap(
    ({ snapshot }) =>
      snapshot.rules
        .filter((rule) => !suppressed.has(rule.id))
        .map((rule) => {
          const override = store.builtinOverrides[rule.id];
          const base = override ?? rule;
          return {
            ...base,
            sourceId: base.sourceId ?? rule.sourceId ?? snapshot.sourceId,
          };
        })
  );

  // A catalog rule that was edited locally but later removed upstream stays
  // active as a user-owned rule instead of being silently dropped.
  const retainedOverrides = Object.values(store.builtinOverrides)
    .filter(
      (rule) => !knownCatalogIds.has(rule.id) && !suppressed.has(rule.id)
    )
    .map((rule) => ({
      ...rule,
      sourceId: rule.sourceId ?? BUILTIN_SOURCE_ID,
    }));

  const customRules = store.customRules.map((rule) => ({
    ...rule,
    sourceId: rule.sourceId ?? CUSTOM_SOURCE_ID,
  }));

  return [...catalogRules, ...retainedOverrides, ...customRules];
}

export function isBuiltinRule<TProperties extends MetadataProperties>(
  store: ModelMetadataStoreV3<TProperties>,
  id: string
): boolean {
  return store.sourceSnapshot.rules.some((rule) => rule.id === id);
}

export function getRuleSourceInfo<TProperties extends MetadataProperties>(
  store: ModelMetadataStoreV3<TProperties>,
  id: string
): MetadataRuleSourceInfo | undefined {
  return buildRuleSourceIndex(store).get(id);
}

/** Build the id → source lookup once for list rendering and filtering. */
export function buildRuleSourceIndex<TProperties extends MetadataProperties>(
  store: ModelMetadataStoreV3<TProperties>
): Map<string, MetadataRuleSourceInfo> {
  const index = new Map<string, MetadataRuleSourceInfo>();
  for (const { snapshot, kind } of allCatalogEntries(store)) {
    for (const rule of snapshot.rules) {
      if (index.has(rule.id)) continue;
      index.set(rule.id, {
        kind,
        sourceId: snapshot.sourceId,
        overridden: Boolean(store.builtinOverrides[rule.id]),
      });
    }
  }
  for (const rule of Object.values(store.builtinOverrides)) {
    if (index.has(rule.id)) continue;
    const sourceId = rule.sourceId ?? BUILTIN_SOURCE_ID;
    index.set(rule.id, {
      kind: sourceId === BUILTIN_SOURCE_ID ? "builtin" : "external",
      sourceId,
      overridden: true,
    });
  }
  for (const rule of store.customRules) {
    index.set(rule.id, {
      kind: "custom",
      sourceId: CUSTOM_SOURCE_ID,
      overridden: false,
    });
  }
  return index;
}
