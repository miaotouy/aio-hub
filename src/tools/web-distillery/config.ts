import { reactive } from "vue";
import { createConfigManager } from "@/utils/configManager";
import type { WebDistilleryConfig } from "./types";

export const createDefaultWebDistilleryConfig = (): WebDistilleryConfig => ({
  lastUrl: "",
  defaultMode: "fast",
  defaultFormat: "markdown",
  defaultCleanMode: false,
  jina: {
    apiKey: "",
    engine: "default",
    withGeneratedAlt: false,
    targetSelector: "",
    waitForSelector: "",
    removeSelector: "",
  },
  network: {
    timeout: 15000,
    maxAutoScrolls: 3,
    scrollDelay: 800,
  },
  extractionRules: {
    include: [],
    exclude: [],
  },
});

export const distilleryConfigManager = createConfigManager<WebDistilleryConfig>(
  {
    moduleName: "web-distillery",
    fileName: "settings.json",
    createDefault: createDefaultWebDistilleryConfig,
    mergeConfig: (defaultConfig, loadedConfig) => ({
      ...defaultConfig,
      ...loadedConfig,
      jina: {
        ...defaultConfig.jina,
        ...(loadedConfig?.jina || {}),
      },
      network: {
        ...defaultConfig.network,
        ...(loadedConfig?.network || {}),
      },
      extractionRules: {
        ...defaultConfig.extractionRules,
        ...(loadedConfig?.extractionRules || {}),
      },
    }),
  }
);

/** UI 与后台工具调用共享同一份已加载配置。 */
export const distilleryConfig = reactive(createDefaultWebDistilleryConfig());
let loadPromise: Promise<WebDistilleryConfig> | undefined;

export function ensureDistilleryConfig(): Promise<WebDistilleryConfig> {
  loadPromise ??= distilleryConfigManager
    .load()
    .then((loaded) => {
      Object.assign(distilleryConfig, loaded);
      return distilleryConfig;
    })
    .catch((error: unknown) => {
      loadPromise = undefined;
      throw error;
    });
  return loadPromise;
}
