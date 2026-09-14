import type {
  MetadataProperties,
  ModelMetadataRule,
  ModelMetadataStoreV3,
} from "./types";

export function compileActiveRules<TProperties extends MetadataProperties>(
  store: ModelMetadataStoreV3<TProperties>
): ModelMetadataRule<TProperties>[] {
  const suppressed = new Set(store.suppressedBuiltinRuleIds);
  const catalogIds = new Set(store.sourceSnapshot.rules.map((rule) => rule.id));
  const builtins = store.sourceSnapshot.rules
    .filter((rule) => !suppressed.has(rule.id))
    .map((rule) => store.builtinOverrides[rule.id] ?? rule);
  // A built-in rule that was edited locally but later removed upstream stays
  // active as a user-owned rule instead of being silently dropped.
  const retainedOverrides = Object.values(store.builtinOverrides).filter(
    (rule) => !catalogIds.has(rule.id) && !suppressed.has(rule.id)
  );
  return [...builtins, ...retainedOverrides, ...store.customRules];
}

export function isBuiltinRule<TProperties extends MetadataProperties>(
  store: ModelMetadataStoreV3<TProperties>,
  id: string
): boolean {
  return store.sourceSnapshot.rules.some((rule) => rule.id === id);
}
