/** Mobile model metadata facade. Storage is platform-local; all rule and materialization semantics come from the shared core. */
import { computed, ref } from "vue";
import {
  applyBuiltinCatalogUpdate,
  compileActiveRules,
  createCatalogSnapshot,
  diffBuiltinCatalog,
  getMatchedRuleChain,
  materializeModelMetadata,
  mergeRuleProperties,
  migrateV2Store,
  testRuleMatch,
  validateRule,
  validateStore,
  type BuiltinRuleDiff,
  type CatalogUpdateResult,
  type CatalogUpdateSelection,
  type LegacyModelMetadataStore,
  type ModelMetadataDiagnostic,
} from "@aiohub/model-metadata-core";
import type {
  ModelMetadataProperties,
  ModelMetadataRule,
  ModelMetadataStore,
  PresetIconInfo,
} from "../types/model-metadata";
import type { LlmModelInfo } from "../types/common";
import {
  DEFAULT_METADATA_RULES,
  isValidIconPath,
  normalizeIconPath,
} from "../config/model-metadata";
import { PRESET_ICONS } from "../config/preset-icons";
import { createConfigManager } from "../../../utils/configManager";
import { createModuleErrorHandler } from "../../../utils/errorHandler";

const errorHandler = createModuleErrorHandler("ModelMetadata");
const CONFIG_VERSION = "3.0.0";
const CATALOG_REVISION = "2026.08.24.1";
const CATALOG_GENERATED_AT = "2026-08-24T00:00:00.000Z";

const catalog = () =>
  createCatalogSnapshot(
    DEFAULT_METADATA_RULES,
    CATALOG_REVISION,
    CATALOG_GENERATED_AT
  );

const createDefaultStore = (): ModelMetadataStore => ({
  version: CONFIG_VERSION,
  sourceSnapshot: catalog(),
  builtinOverrides: {},
  suppressedBuiltinRuleIds: [],
  customRules: [],
  updatedAt: new Date().toISOString(),
});

const configManager = createConfigManager<ModelMetadataStore>({
  moduleName: "model-metadata",
  fileName: "metadata-rules.json",
  version: CONFIG_VERSION,
  createDefault: createDefaultStore,
  // Preserve the raw v2 shape so migration can detect it safely.
  mergeConfig: (_default, loaded) => loaded as ModelMetadataStore,
});

const metadataStore = ref<ModelMetadataStore>(createDefaultStore());
const isLoaded = ref(false);
let loadingPromise: Promise<void> | null = null;

function isV3(value: unknown): value is ModelMetadataStore {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as ModelMetadataStore).version === CONFIG_VERSION &&
    Boolean((value as ModelMetadataStore).sourceSnapshot)
  );
}

function normalizeRule(rule: ModelMetadataRule): ModelMetadataRule {
  return {
    ...rule,
    properties: {
      ...rule.properties,
      ...(rule.properties.icon
        ? { icon: normalizeIconPath(rule.properties.icon) }
        : {}),
    },
  };
}

export function useModelMetadata() {
  const rules = computed(() =>
    compileActiveRules(metadataStore.value).map(normalizeRule)
  );
  const presetIcons = computed<PresetIconInfo[]>(() => PRESET_ICONS);
  const enabledCount = computed(
    () => rules.value.filter((rule) => rule.enabled !== false).length
  );
  const catalogDiffs = computed<BuiltinRuleDiff<ModelMetadataProperties>[]>(
    () => diffBuiltinCatalog(metadataStore.value, DEFAULT_METADATA_RULES)
  );
  const pendingUpdatesCount = computed(
    () =>
      catalogDiffs.value.filter(
        (diff) => diff.status !== "unchanged" && diff.status !== "local"
      ).length
  );

  async function persist(nextStore = metadataStore.value): Promise<boolean> {
    const diagnostics = validateStore(nextStore);
    if (diagnostics.some((diagnostic) => diagnostic.blocking)) {
      errorHandler.handle(new Error("模型元数据配置校验失败"), {
        userMessage: "模型元数据配置无效，未保存更改",
        context: { diagnostics },
      });
      return false;
    }
    try {
      const saved = { ...nextStore, updatedAt: new Date().toISOString() };
      await configManager.save(saved);
      metadataStore.value = saved;
      return true;
    } catch (error) {
      errorHandler.handle(error, { userMessage: "保存模型元数据规则失败" });
      return false;
    }
  }

  async function loadRules(): Promise<void> {
    if (isLoaded.value) return;
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      try {
        const loaded = await configManager.load();
        if (isV3(loaded)) {
          if (validateStore(loaded).some((diagnostic) => diagnostic.blocking)) {
            throw new Error("模型元数据配置无效");
          }
          metadataStore.value = loaded;
        } else {
          const migration = migrateV2Store(
            loaded as LegacyModelMetadataStore<ModelMetadataProperties>,
            catalog(),
            new Date().toISOString()
          );
          if (
            !migration.store ||
            migration.diagnostics.some((diagnostic) => diagnostic.blocking)
          ) {
            throw new Error("旧版模型元数据配置无法安全迁移");
          }
          metadataStore.value = migration.store;
          await persist(migration.store);
        }
      } catch (error) {
        errorHandler.handle(error, { userMessage: "加载模型元数据规则失败" });
        metadataStore.value = createDefaultStore();
      } finally {
        isLoaded.value = true;
        loadingPromise = null;
      }
    })();
    return loadingPromise;
  }

  function inspectImport(candidate: unknown): {
    store?: ModelMetadataStore;
    diagnostics: ModelMetadataDiagnostic[];
  } {
    try {
      if (isV3(candidate)) {
        return { store: candidate, diagnostics: validateStore(candidate) };
      }
      const migration = migrateV2Store(
        candidate as LegacyModelMetadataStore<ModelMetadataProperties>,
        catalog(),
        new Date().toISOString()
      );
      return {
        store: migration.store,
        diagnostics: migration.store
          ? [...migration.diagnostics, ...validateStore(migration.store)]
          : migration.diagnostics,
      };
    } catch {
      return {
        diagnostics: [
          {
            code: "invalid-schema",
            message: "导入文件无法解析为模型元数据配置",
            blocking: true,
          },
        ],
      };
    }
  }

  async function importStore(candidate: unknown): Promise<boolean> {
    const inspected = inspectImport(candidate);
    if (
      !inspected.store ||
      inspected.diagnostics.some((diagnostic) => diagnostic.blocking)
    ) {
      return false;
    }
    return persist(inspected.store);
  }

  async function saveRules(): Promise<boolean> {
    return persist();
  }

  async function addRule(
    input: Omit<ModelMetadataRule, "id">
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const rule = normalizeRule({
      ...input,
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      enabled: input.enabled !== false,
      createdAt: now,
      updatedAt: now,
    });
    if (
      (rule.properties.icon && !isValidIconPath(rule.properties.icon)) ||
      validateRule(rule).some((diagnostic) => diagnostic.blocking)
    ) {
      return false;
    }
    return persist({
      ...metadataStore.value,
      customRules: [...metadataStore.value.customRules, rule],
    });
  }

  async function updateRule(
    id: string,
    updates: Partial<ModelMetadataRule>
  ): Promise<boolean> {
    const current = rules.value.find((rule) => rule.id === id);
    if (!current) return false;
    const next = normalizeRule({
      ...current,
      ...updates,
      properties: { ...current.properties, ...(updates.properties ?? {}) },
      updatedAt: new Date().toISOString(),
    });
    if (
      (next.properties.icon && !isValidIconPath(next.properties.icon)) ||
      validateRule(next).some((diagnostic) => diagnostic.blocking)
    ) {
      return false;
    }
    const builtin = metadataStore.value.sourceSnapshot.rules.some(
      (rule) => rule.id === id
    );
    if (builtin) {
      return persist({
        ...metadataStore.value,
        builtinOverrides: { ...metadataStore.value.builtinOverrides, [id]: next },
      });
    }
    return persist({
      ...metadataStore.value,
      customRules: metadataStore.value.customRules.map((rule) =>
        rule.id === id ? next : rule
      ),
    });
  }

  async function deleteRule(id: string): Promise<boolean> {
    const builtin = metadataStore.value.sourceSnapshot.rules.some(
      (rule) => rule.id === id
    );
    if (builtin) {
      const suppressed = new Set(metadataStore.value.suppressedBuiltinRuleIds);
      suppressed.add(id);
      const overrides = { ...metadataStore.value.builtinOverrides };
      delete overrides[id];
      return persist({
        ...metadataStore.value,
        builtinOverrides: overrides,
        suppressedBuiltinRuleIds: [...suppressed].sort(),
      });
    }
    return persist({
      ...metadataStore.value,
      customRules: metadataStore.value.customRules.filter((rule) => rule.id !== id),
    });
  }

  async function restoreBuiltinRule(id: string): Promise<boolean> {
    if (!metadataStore.value.sourceSnapshot.rules.some((rule) => rule.id === id)) {
      return false;
    }
    const overrides = { ...metadataStore.value.builtinOverrides };
    delete overrides[id];
    return persist({
      ...metadataStore.value,
      builtinOverrides: overrides,
      suppressedBuiltinRuleIds: metadataStore.value.suppressedBuiltinRuleIds.filter(
        (item) => item !== id
      ),
    });
  }

  async function toggleRule(id: string): Promise<boolean> {
    const current = rules.value.find((rule) => rule.id === id);
    return current ? updateRule(id, { enabled: current.enabled === false }) : false;
  }

  async function resetToDefaults(): Promise<boolean> {
    return persist(createDefaultStore());
  }

  async function applyCatalogUpdate(
    selections: CatalogUpdateSelection[]
  ): Promise<CatalogUpdateResult<ModelMetadataProperties> | null> {
    try {
      const result = applyBuiltinCatalogUpdate(
        metadataStore.value,
        catalog(),
        selections
      );
      return (await persist(result.store)) ? result : null;
    } catch (error) {
      errorHandler.handle(error, { userMessage: "应用内置目录更新失败" });
      return null;
    }
  }

  function getRuleSource(
    id: string
  ): "builtin" | "builtinOverride" | "custom" | undefined {
    if (metadataStore.value.customRules.some((rule) => rule.id === id)) {
      return "custom";
    }
    if (metadataStore.value.builtinOverrides[id]) return "builtinOverride";
    return metadataStore.value.sourceSnapshot.rules.some((rule) => rule.id === id)
      ? "builtin"
      : undefined;
  }

  function getMatchedRule(
    modelId: string,
    provider?: string
  ): ModelMetadataRule | undefined {
    return rules.value.find(
      (rule) =>
        rule.enabled !== false && testRuleMatch(rule, { modelId, provider })
    );
  }

  function getMatchedProperties(
    modelId: string,
    provider?: string
  ): ModelMetadataProperties | undefined {
    return mergeRuleProperties(
      getMatchedRuleChain(rules.value, { modelId, provider })
    );
  }

  function materializeModel(
    model: LlmModelInfo,
    options?: Parameters<typeof materializeModelMetadata<LlmModelInfo, ModelMetadataProperties>>[2]
  ) {
    const ruleChain = getMatchedRuleChain(rules.value, {
      modelId: model.id,
      provider: model.provider,
    });
    return materializeModelMetadata(
      model,
      mergeRuleProperties(ruleChain),
      {
        sourceId: metadataStore.value.sourceSnapshot.sourceId,
        sourceRevision: metadataStore.value.sourceSnapshot.revision,
        appliedRuleIds: ruleChain.map((rule) => rule.id),
        ...options,
      }
    );
  }

  function getModelProperty<K extends keyof ModelMetadataProperties>(
    model: LlmModelInfo,
    key: K,
    fallback?: ModelMetadataProperties[K]
  ): ModelMetadataProperties[K] | undefined {
    const modelValue = (model as Record<string, unknown>)[key as string] as
      | ModelMetadataProperties[K]
      | undefined;
    return modelValue ?? fallback;
  }

  function getModelGroup(model: LlmModelInfo): string {
    return model.group ?? "未分组";
  }

  function getDisplayIconPath(iconPath: string): string {
    return iconPath;
  }

  function getModelIcon(model: LlmModelInfo): string | null {
    return model.icon ?? null;
  }

  if (!isLoaded.value) void loadRules();

  return {
    metadataStore,
    rules,
    isLoaded,
    presetIcons,
    enabledCount,
    catalogDiffs,
    pendingUpdatesCount,
    loadRules,
    saveRules,
    importStore,
    inspectImport,
    addRule,
    updateRule,
    deleteRule,
    restoreBuiltinRule,
    getRuleSource,
    toggleRule,
    resetToDefaults,
    applyCatalogUpdate,
    getMatchedRule,
    getMatchedProperties,
    materializeModel,
    getModelProperty,
    getModelGroup,
    getDisplayIconPath,
    getModelIcon,
  };
}
