// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  applyBuiltinCatalogUpdate,
  compileActiveRules,
  createCatalogSnapshot,
  diffBuiltinCatalog,
  migrateV2Store,
  testRuleMatch,
  validateRule,
  validateStore,
  type BuiltinRuleDiff,
  type CatalogUpdateResult,
  type ModelMetadataDiagnostic,
  type CatalogUpdateSelection,
  type LegacyModelMetadataStore,
} from "@aiohub/model-metadata-core";
import type {
  ModelMetadataProperties,
  ModelMetadataRule,
  ModelMetadataStore,
  PresetIconInfo,
} from "../types/model-metadata";
import {
  DEFAULT_METADATA_RULES,
  isValidIconPath,
  normalizeIconPath,
} from "../config/model-metadata";
import { PRESET_ICONS } from "../config/preset-icons";
import { createConfigManager } from "@utils/configManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("stores/modelMetadataStore");
const errorHandler = createModuleErrorHandler("stores/modelMetadataStore");

const CONFIG_VERSION = "3.0.0";
const CATALOG_REVISION = "2026.08.24.1";
const CATALOG_GENERATED_AT = "2026-08-24T00:00:00.000Z";

function createBuiltinCatalog() {
  return createCatalogSnapshot(
    DEFAULT_METADATA_RULES,
    CATALOG_REVISION,
    CATALOG_GENERATED_AT
  );
}

function createDefaultStore(): ModelMetadataStore {
  return {
    version: CONFIG_VERSION,
    sourceSnapshot: createBuiltinCatalog(),
    builtinOverrides: {},
    suppressedBuiltinRuleIds: [],
    customRules: [],
    updatedAt: new Date().toISOString(),
  };
}

const configManager = createConfigManager<ModelMetadataStore>({
  moduleName: "model-metadata",
  fileName: "metadata-rules.json",
  version: CONFIG_VERSION,
  createDefault: createDefaultStore,
  // v2/v3 detection must see the raw on-disk shape. Shallowly merging a v2
  // payload into the v3 default would otherwise forge a sourceSnapshot.
  mergeConfig: (_default, loaded) => loaded as ModelMetadataStore,
});

function isV3Store(value: unknown): value is ModelMetadataStore {
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

/** Model metadata state. Rules are compiled from the v3 source snapshot, local overrides, and custom rules. */
export const useModelMetadataStore = defineStore("modelMetadata", () => {
  const metadataStore = ref<ModelMetadataStore>(createDefaultStore());
  const isLoaded = ref(false);

  const rules = computed(() => compileActiveRules(metadataStore.value));
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
    try {
      const loaded = await configManager.load();
      if (isV3Store(loaded)) {
        const diagnostics = validateStore(loaded);
        if (diagnostics.some((diagnostic) => diagnostic.blocking)) {
          throw new Error("v3 模型元数据配置校验失败");
        }
        metadataStore.value = loaded;
      } else {
        const migration = migrateV2Store(
          loaded as unknown as LegacyModelMetadataStore<ModelMetadataProperties>,
          createBuiltinCatalog(),
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
        logger.info("模型元数据配置已从 v2 迁移到 v3", {
          diagnostics: migration.diagnostics.length,
        });
      }
    } catch (error) {
      errorHandler.handle(error, { userMessage: "加载模型元数据规则失败" });
      metadataStore.value = createDefaultStore();
    } finally {
      isLoaded.value = true;
    }
  }

  function inspectImport(candidate: unknown): {
    store?: ModelMetadataStore;
    diagnostics: ModelMetadataDiagnostic[];
  } {
    try {
      if (isV3Store(candidate)) {
        return { store: candidate, diagnostics: validateStore(candidate) };
      }
      const migration = migrateV2Store(
        candidate as LegacyModelMetadataStore<ModelMetadataProperties>,
        createBuiltinCatalog(),
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
    if (rule.properties.icon && !isValidIconPath(rule.properties.icon)) {
      errorHandler.handle(new Error("无效的图标路径"), {
        userMessage: "添加规则失败",
      });
      return false;
    }
    if (validateRule(rule).some((diagnostic) => diagnostic.blocking))
      return false;
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
    if (next.properties.icon && !isValidIconPath(next.properties.icon))
      return false;
    if (validateRule(next).some((diagnostic) => diagnostic.blocking))
      return false;
    const builtin = metadataStore.value.sourceSnapshot.rules.some(
      (rule) => rule.id === id
    );
    if (builtin) {
      return persist({
        ...metadataStore.value,
        builtinOverrides: {
          ...metadataStore.value.builtinOverrides,
          [id]: next,
        },
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
      customRules: metadataStore.value.customRules.filter(
        (rule) => rule.id !== id
      ),
    });
  }

  async function restoreBuiltinRule(id: string): Promise<boolean> {
    if (
      !metadataStore.value.sourceSnapshot.rules.some((rule) => rule.id === id)
    )
      return false;
    const overrides = { ...metadataStore.value.builtinOverrides };
    delete overrides[id];
    return persist({
      ...metadataStore.value,
      builtinOverrides: overrides,
      suppressedBuiltinRuleIds:
        metadataStore.value.suppressedBuiltinRuleIds.filter(
          (item) => item !== id
        ),
    });
  }

  async function toggleRule(id: string): Promise<boolean> {
    const current = rules.value.find((rule) => rule.id === id);
    return current
      ? updateRule(id, { enabled: current.enabled === false })
      : false;
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
        createBuiltinCatalog(),
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
    if (
      metadataStore.value.sourceSnapshot.rules.some((rule) => rule.id === id)
    ) {
      return "builtin";
    }
    return undefined;
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

  // Load lazily to retain the former composable contract.
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
  };
});

/** Pure consumers may read compiled active rules without creating a second matching implementation. */
export function getActiveRules(): ModelMetadataRule[] {
  return compileActiveRules(useModelMetadataStore().metadataStore);
}
