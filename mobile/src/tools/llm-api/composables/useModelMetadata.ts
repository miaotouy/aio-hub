/** Mobile model metadata composable. Platform persistence stays local; rule semantics are shared. */
import { computed, ref } from "vue";
import {
  compileActiveRules,
  createCatalogSnapshot,
  migrateV2Store,
  validateRule,
  validateStore,
  type LegacyModelMetadataStore,
} from "@aiohub/model-metadata-core";
import type {
  ModelMetadataRule,
  ModelMetadataStore,
  ModelMetadataProperties,
  PresetIconInfo,
} from "../types/model-metadata";
import type { LlmModelInfo } from "../types/common";
import {
  DEFAULT_METADATA_RULES,
  getMatchedModelProperties,
  getModelIconPath,
  isValidIconPath,
  normalizeIconPath,
  testRuleMatch,
} from "../config/model-metadata";
import { PRESET_ICONS } from "../config/preset-icons";
import { createConfigManager } from "../../../utils/configManager";
import { createModuleErrorHandler } from "../../../utils/errorHandler";

const errorHandler = createModuleErrorHandler("ModelMetadata");
const CONFIG_VERSION = "3.0.0";
const catalog = () =>
  createCatalogSnapshot(
    DEFAULT_METADATA_RULES,
    "2026.08.24.1",
    "2026-08-24T00:00:00.000Z"
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
  mergeConfig: (_default, loaded) => loaded as ModelMetadataStore,
});

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
  const store = ref<ModelMetadataStore>(createDefaultStore());
  const rules = ref<ModelMetadataRule[]>(compileActiveRules(store.value));
  const isLoaded = ref(false);
  const presetIcons = computed<PresetIconInfo[]>(() => PRESET_ICONS);
  const enabledCount = computed(
    () => rules.value.filter((rule) => rule.enabled !== false).length
  );

  function synchronizeStoreFromRules(): ModelMetadataStore {
    const builtinById = new Map(
      store.value.sourceSnapshot.rules.map((rule) => [rule.id, rule])
    );
    const currentById = new Map(
      rules.value.map((rule) => [rule.id, normalizeRule(rule)])
    );
    const builtinOverrides: Record<string, ModelMetadataRule> = {};
    const suppressedBuiltinRuleIds: string[] = [];
    for (const [id, builtin] of builtinById) {
      const current = currentById.get(id);
      if (!current) suppressedBuiltinRuleIds.push(id);
      else if (JSON.stringify(current) !== JSON.stringify(builtin))
        builtinOverrides[id] = current;
    }
    const customRules = rules.value
      .filter((rule) => !builtinById.has(rule.id))
      .map(normalizeRule);
    return {
      ...store.value,
      builtinOverrides,
      suppressedBuiltinRuleIds,
      customRules,
      updatedAt: new Date().toISOString(),
    };
  }

  async function loadRules() {
    try {
      const loaded = await configManager.load();
      const next = isV3(loaded)
        ? loaded
        : migrateV2Store(
            loaded as unknown as LegacyModelMetadataStore<ModelMetadataProperties>,
            catalog(),
            new Date().toISOString()
          ).store;
      if (
        !next ||
        validateStore(next).some((diagnostic) => diagnostic.blocking)
      )
        throw new Error("模型元数据配置无效");
      store.value = next;
      rules.value = compileActiveRules(next).map(normalizeRule);
    } catch (error) {
      errorHandler.handle(error, { userMessage: "加载模型元数据规则失败" });
      store.value = createDefaultStore();
      rules.value = compileActiveRules(store.value);
    } finally {
      isLoaded.value = true;
    }
  }

  async function saveRules(): Promise<boolean> {
    try {
      const next = synchronizeStoreFromRules();
      if (validateStore(next).some((diagnostic) => diagnostic.blocking))
        return false;
      await configManager.save(next);
      store.value = next;
      return true;
    } catch (error) {
      errorHandler.handle(error, { userMessage: "保存模型元数据规则失败" });
      return false;
    }
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
    )
      return false;
    rules.value.push(rule);
    return saveRules();
  }

  async function updateRule(
    id: string,
    updates: Partial<ModelMetadataRule>
  ): Promise<boolean> {
    const index = rules.value.findIndex((rule) => rule.id === id);
    if (index < 0) return false;
    const next = normalizeRule({
      ...rules.value[index],
      ...updates,
      properties: {
        ...rules.value[index].properties,
        ...(updates.properties ?? {}),
      },
      updatedAt: new Date().toISOString(),
    });
    if (
      (next.properties.icon && !isValidIconPath(next.properties.icon)) ||
      validateRule(next).some((diagnostic) => diagnostic.blocking)
    )
      return false;
    rules.value[index] = next;
    return saveRules();
  }

  async function deleteRule(id: string): Promise<boolean> {
    rules.value = rules.value.filter((rule) => rule.id !== id);
    return saveRules();
  }
  async function toggleRule(id: string): Promise<boolean> {
    const rule = rules.value.find((item) => item.id === id);
    return rule ? updateRule(id, { enabled: rule.enabled === false }) : false;
  }
  async function resetToDefaults(): Promise<boolean> {
    store.value = createDefaultStore();
    rules.value = compileActiveRules(store.value);
    return saveRules();
  }
  async function mergeWithDefaults(): Promise<{
    added: number;
    updated: number;
  }> {
    return { added: 0, updated: 0 };
  }
  function getMatchedRule(
    modelId: string,
    provider?: string
  ): ModelMetadataRule | undefined {
    return rules.value.find(
      (rule) => rule.enabled !== false && testRuleMatch(rule, modelId, provider)
    );
  }
  function getMatchedProperties(
    modelId: string,
    provider?: string
  ): ModelMetadataProperties | undefined {
    return getMatchedModelProperties(modelId, provider, rules.value);
  }
  function getModelProperty<K extends keyof ModelMetadataProperties>(
    model: LlmModelInfo,
    key: K,
    fallback?: ModelMetadataProperties[K]
  ): ModelMetadataProperties[K] | undefined {
    const modelValue = (model as Record<string, unknown>)[key as string] as
      ModelMetadataProperties[K] | undefined;
    const matchedValue = (
      getMatchedProperties(model.id, model.provider) as
        Record<string, unknown> | undefined
    )?.[key as string] as ModelMetadataProperties[K] | undefined;
    return modelValue ?? matchedValue ?? fallback;
  }
  function getModelGroup(model: LlmModelInfo): string {
    return (
      model.group ??
      getMatchedProperties(model.id, model.provider)?.group ??
      "未分组"
    );
  }
  function getDisplayIconPath(iconPath: string): string {
    return iconPath;
  }
  function getModelIcon(model: LlmModelInfo): string | null {
    return (
      model.icon ??
      getModelIconPath(model.id, model.provider, rules.value) ??
      null
    );
  }
  if (!isLoaded.value) void loadRules();
  return {
    rules,
    isLoaded,
    presetIcons,
    enabledCount,
    loadRules,
    saveRules,
    addRule,
    updateRule,
    deleteRule,
    toggleRule,
    resetToDefaults,
    mergeWithDefaults,
    getMatchedRule,
    getMatchedProperties,
    getModelProperty,
    getModelGroup,
    getDisplayIconPath,
    getModelIcon,
  };
}
