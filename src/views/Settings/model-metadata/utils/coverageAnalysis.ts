import { merge } from "lodash-es";
import { testRuleMatch } from "@/config/model-metadata";
import type { LlmProfile } from "@/types/llm-profiles";
import type {
  ModelMetadataProperties,
  ModelMetadataRule,
} from "@/types/model-metadata";

export interface RuleContribution {
  rule: ModelMetadataRule;
  effectiveFields: string[];
  overriddenFields: string[];
}

export interface CoverageItem {
  profileId: string;
  profileName: string;
  profileType: string;
  modelId: string;
  modelName: string;
  modelProvider?: string;
  ruleChain: RuleContribution[];
  finalProperties: ModelMetadataProperties | undefined;
  isMatched: boolean;
}

type PathValue = {
  path: string;
  value: unknown;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flattenDefinedPropertyPaths(value: unknown, prefix = ""): PathValue[] {
  if (!isPlainRecord(value)) {
    return value === undefined || !prefix ? [] : [{ path: prefix, value }];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    if (child === undefined) return [];

    const path = prefix ? `${prefix}.${key}` : key;

    if (isPlainRecord(child)) {
      const childPaths = flattenDefinedPropertyPaths(child, path);
      return childPaths.length ? childPaths : [{ path, value: child }];
    }

    return [{ path, value: child }];
  });
}

function hasOverridingPath(
  higherPriorityRules: ModelMetadataRule[],
  fieldPath: string
): boolean {
  return higherPriorityRules.some((rule) => {
    const paths = flattenDefinedPropertyPaths(rule.properties);
    return paths.some(
      ({ path }) =>
        path === fieldPath ||
        fieldPath.startsWith(`${path}.`) ||
        path.startsWith(`${fieldPath}.`)
    );
  });
}

export function buildRuleContributions(
  ruleChain: ModelMetadataRule[]
): RuleContribution[] {
  return ruleChain.map((rule, index) => {
    const fieldPaths = flattenDefinedPropertyPaths(rule.properties).map(
      ({ path }) => path
    );
    const higherPriorityRules = ruleChain.slice(index + 1);
    const effectiveFields: string[] = [];
    const overriddenFields: string[] = [];

    fieldPaths.forEach((path) => {
      if (hasOverridingPath(higherPriorityRules, path)) {
        overriddenFields.push(path);
      } else {
        effectiveFields.push(path);
      }
    });

    return {
      rule,
      effectiveFields,
      overriddenFields,
    };
  });
}

/**
 * 使用预先排序和过滤好的规则列表获取匹配的规则链
 */
export function getMatchedRuleChainWithSortedRules(
  sortedEnabledRules: ModelMetadataRule[],
  modelId: string,
  provider?: string
): ModelMetadataRule[] {
  let matchedRules = sortedEnabledRules.filter((rule) =>
    testRuleMatch(rule, modelId, provider)
  );

  if (matchedRules.length === 0) {
    return [];
  }

  const highestExclusiveRule = matchedRules.find((r) => r.exclusive === true);

  if (highestExclusiveRule) {
    const exclusivePriority = highestExclusiveRule.priority || 0;
    matchedRules = matchedRules.filter(
      (r) => (r.priority || 0) >= exclusivePriority
    );
  }

  return matchedRules.reverse();
}

export function buildCoverageItems(
  profiles: LlmProfile[],
  rules: ModelMetadataRule[]
): CoverageItem[] {
  const sortedEnabledRules = rules
    .filter((r) => r.enabled !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const chainCache = new Map<string, ModelMetadataRule[]>();
  const propertyCache = new Map<string, ModelMetadataProperties | undefined>();

  return profiles.flatMap((profile) =>
    profile.models.map((model) => {
      const modelProvider = model.provider;
      const cacheKey = `${model.id}|${modelProvider ?? ""}`;
      let ruleChain = chainCache.get(cacheKey);
      let finalProperties = propertyCache.get(cacheKey);

      if (!ruleChain) {
        ruleChain = getMatchedRuleChainWithSortedRules(
          sortedEnabledRules,
          model.id,
          modelProvider
        );
        chainCache.set(cacheKey, ruleChain);
        finalProperties =
          ruleChain.length > 0
            ? ruleChain.reduce(
                (acc, rule) => merge(acc, rule.properties),
                {} as ModelMetadataProperties
              )
            : undefined;
        propertyCache.set(cacheKey, finalProperties);
      }

      return {
        profileId: profile.id,
        profileName: profile.name,
        profileType: profile.type,
        modelId: model.id,
        modelName: model.name || model.id,
        modelProvider,
        ruleChain: buildRuleContributions(ruleChain),
        finalProperties,
        isMatched: ruleChain.length > 0,
      };
    })
  );
}

export function recommendGroupForProfile(
  items: CoverageItem[],
  profileId: string
): string | undefined {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    if (item.profileId !== profileId || !item.finalProperties?.group) return;

    counts.set(
      item.finalProperties.group,
      (counts.get(item.finalProperties.group) || 0) + 1
    );
  });

  let selectedGroup: string | undefined;
  let selectedCount = 0;

  counts.forEach((count, group) => {
    if (count > selectedCount) {
      selectedGroup = group;
      selectedCount = count;
    }
  });

  return selectedGroup;
}

export function mergeRuleChainProperties(
  ruleChain: ModelMetadataRule[]
): ModelMetadataProperties | undefined {
  if (!ruleChain.length) return undefined;

  return ruleChain.reduce(
    (acc, rule) => merge(acc, rule.properties),
    {} as ModelMetadataProperties
  );
}
