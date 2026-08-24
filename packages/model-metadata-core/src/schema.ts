import { isSafePath } from "./fingerprint";
import type {
  MetadataCatalogSnapshot,
  MetadataProperties,
  ModelMetadataDiagnostic,
  ModelMetadataRule,
  ModelMetadataStoreV3,
} from "./types";

const validMatchTypes = new Set([
  "provider",
  "modelExact",
  "modelPrefix",
  "modelContains",
  "modelRegex",
]);

export function validateRule<TProperties extends MetadataProperties>(
  rule: ModelMetadataRule<TProperties>
): ModelMetadataDiagnostic[] {
  const diagnostics: ModelMetadataDiagnostic[] = [];
  if (!rule.id.trim())
    diagnostics.push({
      code: "invalid-schema",
      message: "规则 ID 不能为空",
      ruleId: rule.id,
      blocking: true,
    });
  if (!validMatchTypes.has(rule.matchType))
    diagnostics.push({
      code: "invalid-schema",
      message: "规则匹配类型无效",
      ruleId: rule.id,
      blocking: true,
    });
  if (!rule.matchValue.trim())
    diagnostics.push({
      code: "invalid-match-value",
      message: "规则匹配值不能为空",
      ruleId: rule.id,
      blocking: true,
    });
  if (rule.matchType === "modelRegex") {
    try {
      new RegExp(rule.matchValue, "i");
    } catch {
      diagnostics.push({
        code: "invalid-regex",
        message: "规则正则表达式无效",
        ruleId: rule.id,
        blocking: true,
      });
    }
  }
  for (const path of rule.unsetPaths ?? []) {
    if (!isSafePath(path))
      diagnostics.push({
        code: "unsafe-path",
        message: "unsetPaths 包含危险或无效路径",
        ruleId: rule.id,
        path,
        blocking: true,
      });
  }
  return diagnostics;
}

export function validateCatalog<TProperties extends MetadataProperties>(
  catalog: MetadataCatalogSnapshot<TProperties>
): ModelMetadataDiagnostic[] {
  const diagnostics: ModelMetadataDiagnostic[] = [];
  if (
    catalog.schemaVersion !== "3.0.0" ||
    catalog.sourceId !== "aiohub-builtin" ||
    !catalog.revision ||
    !catalog.fingerprint
  ) {
    diagnostics.push({
      code: "invalid-schema",
      message: "内置目录结构无效",
      blocking: true,
    });
  }
  const ids = new Set<string>();
  for (const rule of catalog.rules) {
    if (ids.has(rule.id))
      diagnostics.push({
        code: "duplicate-rule-id",
        message: "内置目录存在重复规则 ID",
        ruleId: rule.id,
        blocking: true,
      });
    ids.add(rule.id);
    diagnostics.push(...validateRule(rule));
  }
  return diagnostics;
}

export function validateStore<TProperties extends MetadataProperties>(
  store: ModelMetadataStoreV3<TProperties>
): ModelMetadataDiagnostic[] {
  if (store.version !== "3.0.0")
    return [
      {
        code: "unsupported-version",
        message: "不支持的模型元数据配置版本",
        blocking: true,
      },
    ];
  const diagnostics = validateCatalog(store.sourceSnapshot);
  const customIds = new Set<string>();
  for (const rule of store.customRules) {
    if (customIds.has(rule.id))
      diagnostics.push({
        code: "duplicate-rule-id",
        message: "自定义规则存在重复 ID",
        ruleId: rule.id,
        blocking: true,
      });
    customIds.add(rule.id);
    diagnostics.push(...validateRule(rule));
  }
  for (const rule of Object.values(store.builtinOverrides))
    diagnostics.push(...validateRule(rule));
  return diagnostics;
}
