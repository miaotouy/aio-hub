import type {
  ModelMetadataRule,
  RuleMatchInput,
  MetadataProperties,
} from "./types";

const specificity: Record<ModelMetadataRule["matchType"], number> = {
  provider: 0,
  modelContains: 1,
  modelPrefix: 2,
  modelRegex: 3,
  modelExact: 4,
};

export function testRuleMatch(
  rule: ModelMetadataRule,
  input: RuleMatchInput
): boolean {
  const modelId = input.modelId.toLocaleLowerCase();
  const matchValue = rule.matchValue.toLocaleLowerCase();
  switch (rule.matchType) {
    case "provider":
      return (
        Boolean(input.provider) &&
        input.provider!.toLocaleLowerCase() === matchValue
      );
    case "modelExact":
      return modelId === matchValue;
    case "modelPrefix":
      return modelId.startsWith(matchValue);
    case "modelContains":
      return modelId.includes(matchValue);
    case "modelRegex":
      try {
        return new RegExp(rule.matchValue, "i").test(input.modelId);
      } catch {
        return false;
      }
  }
}

export function getMatchedRuleChain<TProperties extends MetadataProperties>(
  rules: ModelMetadataRule<TProperties>[],
  input: RuleMatchInput
): ModelMetadataRule<TProperties>[] {
  const matches = rules.filter(
    (rule) => rule.enabled !== false && testRuleMatch(rule, input)
  );
  const exclusivePriority = matches
    .filter((rule) => rule.exclusive)
    .reduce<number | undefined>(
      (highest, rule) => Math.max(highest ?? -Infinity, rule.priority ?? 0),
      undefined
    );
  return matches
    .filter(
      (rule) =>
        exclusivePriority === undefined ||
        (rule.priority ?? 0) >= exclusivePriority
    )
    .sort(
      (left, right) =>
        (left.priority ?? 0) - (right.priority ?? 0) ||
        specificity[left.matchType] - specificity[right.matchType] ||
        left.id.localeCompare(right.id)
    );
}
