export type MetadataMatchType =
  "provider" | "modelExact" | "modelPrefix" | "modelContains" | "modelRegex";

export type MetadataBindingMode = "manual" | "fillMissing" | "followSource";

export type MetadataProperties = Record<string, unknown>;

export interface ModelMetadataRule<
  TProperties extends MetadataProperties = MetadataProperties,
> {
  id: string;
  matchType: MetadataMatchType;
  matchValue: string;
  properties: TProperties;
  unsetPaths?: string[];
  priority?: number;
  enabled?: boolean;
  exclusive?: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MetadataCatalogSnapshot<
  TProperties extends MetadataProperties = MetadataProperties,
> {
  schemaVersion: "3.0.0";
  sourceId: "aiohub-builtin";
  revision: string;
  generatedAt: string;
  rules: ModelMetadataRule<TProperties>[];
  fingerprint: string;
}

export interface ModelMetadataStoreV3<
  TProperties extends MetadataProperties = MetadataProperties,
> {
  version: "3.0.0";
  sourceSnapshot: MetadataCatalogSnapshot<TProperties>;
  builtinOverrides: Record<string, ModelMetadataRule<TProperties>>;
  suppressedBuiltinRuleIds: string[];
  customRules: ModelMetadataRule<TProperties>[];
  updatedAt: string;
}

export interface ModelMetadataDiagnostic {
  code:
    | "duplicate-rule-id"
    | "invalid-match-value"
    | "invalid-regex"
    | "invalid-unset-path"
    | "unsafe-path"
    | "invalid-schema"
    | "legacy-model-group"
    | "unsupported-version";
  message: string;
  ruleId?: string;
  path?: string;
  blocking?: boolean;
}

export interface RuleMatchInput {
  modelId: string;
  provider?: string;
}

export interface LegacyModelMetadataRule<
  TProperties extends MetadataProperties = MetadataProperties,
> {
  id: string;
  matchType: "provider" | "model" | "modelPrefix" | "modelGroup";
  matchValue: string;
  properties: TProperties;
  useRegex?: boolean;
  priority?: number;
  enabled?: boolean;
  exclusive?: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LegacyModelMetadataStore<
  TProperties extends MetadataProperties = MetadataProperties,
> {
  version?: string;
  rules: LegacyModelMetadataRule<TProperties>[];
  updatedAt?: string;
}

export interface MigrationResult<
  TProperties extends MetadataProperties = MetadataProperties,
> {
  store?: ModelMetadataStoreV3<TProperties>;
  diagnostics: ModelMetadataDiagnostic[];
}

export type FieldDiffKind = "unchanged" | "upstream" | "local" | "conflict";

export interface MetadataFieldDiff {
  path: string;
  base: unknown;
  local: unknown;
  incoming: unknown;
  kind: FieldDiffKind;
}

export type BuiltinRuleDiffStatus =
  "unchanged" | "added" | "removed" | "upstream" | "local" | "conflict";

export interface BuiltinRuleDiff<
  TProperties extends MetadataProperties = MetadataProperties,
> {
  id: string;
  status: BuiltinRuleDiffStatus;
  base?: ModelMetadataRule<TProperties>;
  local?: ModelMetadataRule<TProperties>;
  incoming?: ModelMetadataRule<TProperties>;
  fields: MetadataFieldDiff[];
}
