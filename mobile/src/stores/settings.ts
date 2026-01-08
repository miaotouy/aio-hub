import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { MobileAppSettings, DEFAULT_APP_SETTINGS } from "@/types/settings";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createConfigManager } from "@/utils/configManager";

const logger = createModuleLogger("SettingsStore");
const errorHandler = createModuleErrorHandler("SettingsStore");

// 使用通用的 ConfigManager
const configManager = createConfigManager<MobileAppSettings>({
  moduleName: "app-settings",
  fileName: "app_settings.json",
  version: "1.0.0",
  createDefault: () => DEFAULT_APP_SETTINGS,
});

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<MobileAppSettings>({ ...DEFAULT_APP_SETTINGS });
  const isLoaded = ref(false);
  const isLoading = ref(false);
  const error = ref<Error | null>(null);

  /**
   * 初始化并加载设置
   */
  async function init() {
    if (isLoaded.value || isLoading.value) return;

    isLoading.value = true;
    error.value = null;

    try {
      const loaded = await configManager.load();
      settings.value = loaded;
      syncThemeToLocalStorage();
      logger.info("设置加载成功", { settings: settings.value });
    } catch (err: any) {
      error.value = err;
      errorHandler.error(err, "加载设置失败");
    } finally {
      isLoading.value = false;
      isLoaded.value = true;
    }
  }

  /**
   * 同步主题到 localStorage 以便 index.html 提前读取，防止白屏闪烁
   */
  function syncThemeToLocalStorage() {
    try {
      localStorage.setItem("aio_hub_theme_cache", settings.value.appearance.theme);
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 保存设置
   */
  async function save() {
    try {
      await configManager.save(settings.value);
      syncThemeToLocalStorage();
      logger.debug("设置已保存");
    } catch (err) {
      errorHandler.error(err, "保存设置失败");
    }
  }

  /**
   * 更新设置
   */
  async function updateSettings(updates: Partial<MobileAppSettings>) {
    settings.value = {
      ...settings.value,
      ...updates,
    };
    configManager.saveDebounced(settings.value);
  }

  /**
   * 更新外观设置
   */
  async function updateAppearance(updates: Partial<MobileAppSettings["appearance"]>) {
    settings.value.appearance = {
      ...settings.value.appearance,
      ...updates,
    };
    await save();
  }

  // 计算属性
  const theme = computed(() => settings.value.appearance.theme);
  const debugMode = computed(() => settings.value.debugMode);

  return {
    settings,
    isLoaded,
    isLoading,
    error,
    init,
    save,
    updateSettings,
    updateAppearance,
    theme,
    debugMode,
  };
});