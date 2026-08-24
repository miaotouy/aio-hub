import { deepClone } from "./fingerprint";
import { stableFingerprint } from "./fingerprint";
import { validateRule } from "./schema";
import type {
  LegacyModelMetadataRule,
  LegacyModelMetadataStore,
  MetadataCatalogSnapshot,
  MetadataProperties,
  MigrationResult,
  ModelMetadataDiagnostic,
  ModelMetadataRule,
} from "./types";

export function migrateLegacyRule<TProperties extends MetadataProperties>(
  rule: LegacyModelMetadataRule<TProperties>
): {
  rule?: ModelMetadataRule<TProperties>;
  diagnostics: ModelMetadataDiagnostic[];
} {
  if (rule.matchType === "modelGroup")
    return {
      diagnostics: [
        {
          code: "legacy-model-group",
          message: "modelGroup 规则无法自动迁移，请转换或删除",
          ruleId: rule.id,
          blocking: true,
        },
      ],
    };
  const matchType =
    rule.matchType === "provider"
      ? "provider"
      : rule.useRegex
        ? "modelRegex"
        : rule.matchType === "modelPrefix"
          ? "modelContains"
          : "modelExact";
  const migrated: ModelMetadataRule<TProperties> = {
    id: rule.id,
    matchType,
    matchValue: rule.matchValue,
    properties: deepClone(rule.properties),
    ...(rule.priority === undefined ? {} : { priority: rule.priority }),
    ...(rule.enabled === undefined ? {} : { enabled: rule.enabled }),
    ...(rule.exclusive === undefined ? {} : { exclusive: rule.exclusive }),
    ...(rule.description === undefined
      ? {}
      : { description: rule.description }),
    ...(rule.createdAt === undefined ? {} : { createdAt: rule.createdAt }),
    ...(rule.updatedAt === undefined ? {} : { updatedAt: rule.updatedAt }),
  };
  return { rule: migrated, diagnostics: validateRule(migrated) };
}

export function createCatalogSnapshot<TProperties extends MetadataProperties>(
  rules: ModelMetadataRule<TProperties>[],
  revision: string,
  generatedAt: string
): MetadataCatalogSnapshot<TProperties> {
  const snapshot = {
    schemaVersion: "3.0.0" as const,
    sourceId: "aiohub-builtin" as const,
    revision,
    generatedAt,
    rules: deepClone(rules),
    fingerprint: "",
  };
  return {
    ...snapshot,
    fingerprint: stableFingerprint({
      revision: snapshot.revision,
      rules: snapshot.rules,
    }),
  };
}

export function migrateV2Store<TProperties extends MetadataProperties>(
  legacy: LegacyModelMetadataStore<TProperties>,
  catalog: MetadataCatalogSnapshot<TProperties>,
  now: string
): MigrationResult<TProperties> {
  const diagnostics: ModelMetadataDiagnostic[] = [];
  const migrated = legacy.rules.map((rule) => migrateLegacyRule(rule));
  diagnostics.push(...migrated.flatMap((item) => item.diagnostics));
  if (diagnostics.some((item) => item.blocking)) return { diagnostics };
  const rules = migrated.flatMap((item) => (item.rule ? [item.rule] : []));
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id))
      diagnostics.push({
        code: "duplicate-rule-id",
        message: "v2 配置存在重复规则 ID",
        ruleId: rule.id,
        blocking: true,
      });
    ids.add(rule.id);
  }
  if (diagnostics.some((item) => item.blocking)) return { diagnostics };
  const catalogById = new Map(catalog.rules.map((rule) => [rule.id, rule]));
  const legacyById = new Map(rules.map((rule) => [rule.id, rule]));
  const builtinOverrides: Record<string, ModelMetadataRule<TProperties>> = {};
  const customRules: ModelMetadataRule<TProperties>[] = [];
  for (const rule of rules) {
    const builtin = catalogById.get(rule.id);
    if (!builtin || rule.id.startsWith("custom-")) customRules.push(rule);
    else if (JSON.stringify(rule) !== JSON.stringify(builtin))
      builtinOverrides[rule.id] = rule;
  }
  const suppressedBuiltinRuleIds = catalog.rules
    .filter((rule) => !legacyById.has(rule.id))
    .map((rule) => rule.id);
  return {
    store: {
      version: "3.0.0",
      sourceSnapshot: deepClone(catalog),
      builtinOverrides,
      suppressedBuiltinRuleIds,
      customRules,
      updatedAt: now,
    },
    diagnostics,
  };
}
