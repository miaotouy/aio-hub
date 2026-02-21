import { ref } from "vue";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import type { FilterOptions } from "../logic/dataFilter.logic";

const logger = createModuleLogger("tools/data-filter/config");

export interface DataFilterPreset {
  id: string;
  name: string;
  options: FilterOptions;
  createdAt: number;
}

interface DataFilterConfig {
  version: string;
  lastState: {
    inputText: string;
    options: FilterOptions;
  };
  presets: DataFilterPreset[];
}

const DEFAULT_OPTIONS: FilterOptions = {
  dataPath: "",
  conditions: [{ key: "enabled", operator: "eq", value: "true" }],
};

const configManager = createConfigManager<DataFilterConfig>({
  moduleName: "data-filter",
  fileName: "config.json",
  fileType: "json",
  version: "1.0.0",
  debounceDelay: 800,
  createDefault: () => ({
    version: "1.0.0",
    lastState: {
      inputText: "",
      options: { ...DEFAULT_OPTIONS, conditions: [...DEFAULT_OPTIONS.conditions] },
    },
    presets: [],
  }),
  mergeConfig: (defaultConfig, loaded) => ({
    ...defaultConfig,
    ...loaded,
    lastState: loaded.lastState ?? defaultConfig.lastState,
    presets: loaded.presets ?? defaultConfig.presets,
  }),
});

export function useDataFilterConfig() {
  const presets = ref<DataFilterPreset[]>([]);

  async function loadConfig(): Promise<{ inputText: string; options: FilterOptions }> {
    const config = await configManager.load();
    presets.value = config.presets ?? [];
    logger.debug("配置加载完成", { presetsCount: presets.value.length });
    return config.lastState;
  }

  function saveLastState(inputText: string, options: FilterOptions) {
    configManager.saveDebounced({
      version: "1.0.0",
      lastState: { inputText, options },
      presets: presets.value,
    });
  }

  async function savePreset(name: string, options: FilterOptions): Promise<string> {
    const preset: DataFilterPreset = {
      id: `preset_${Date.now()}`,
      name,
      options: JSON.parse(JSON.stringify(options)), // 深拷贝
      createdAt: Date.now(),
    };
    presets.value.push(preset);
    const config = await configManager.load();
    await configManager.save({
      ...config,
      presets: presets.value,
    });
    logger.info("预设已保存", { name, id: preset.id });
    return preset.id;
  }

  async function updatePreset(id: string, options: FilterOptions): Promise<void> {
    const preset = presets.value.find((p) => p.id === id);
    if (preset) {
      preset.options = JSON.parse(JSON.stringify(options));
      const config = await configManager.load();
      await configManager.save({ ...config, presets: presets.value });
      logger.info("预设已更新", { id });
    }
  }

  async function deletePreset(id: string): Promise<void> {
    const idx = presets.value.findIndex((p) => p.id === id);
    if (idx !== -1) {
      presets.value.splice(idx, 1);
      const config = await configManager.load();
      await configManager.save({ ...config, presets: presets.value });
      logger.info("预设已删除", { id });
    }
  }

  async function renamePreset(id: string, newName: string): Promise<void> {
    const preset = presets.value.find((p) => p.id === id);
    if (preset) {
      preset.name = newName;
      const config = await configManager.load();
      await configManager.save({ ...config, presets: presets.value });
      logger.info("预设已重命名", { id, newName });
    }
  }

  return {
    presets,
    loadConfig,
    saveLastState,
    savePreset,
    updatePreset,
    deletePreset,
    renamePreset,
  };
}