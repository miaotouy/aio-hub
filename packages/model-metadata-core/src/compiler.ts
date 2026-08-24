import type {
  MetadataProperties,
  ModelMetadataRule,
  ModelMetadataStoreV3,
} from "./types";

export function compileActiveRules<TProperties extends MetadataProperties>(
  store: ModelMetadataStoreV3<TProperties>
): ModelMetadataRule<TProperties>[] {
  const suppressed = new Set(store.suppressedBuiltinRuleIds);
  const builtins = store.sourceSnapshot.rules
    .filter((rule) => !suppressed.has(rule.id))
    .map((rule) => store.builtinOverrides[rule.id] ?? rule);
  return [...builtins, ...store.customRules];
}

export function isBuiltinRule<TProperties extends MetadataProperties>(
  store: ModelMetadataStoreV3<TProperties>,
  id: string
): boolean {
  return store.sourceSnapshot.rules.some((rule) => rule.id === id);
}
