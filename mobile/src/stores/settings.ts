import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { load } from "@tauri-apps/plugin-store";
import { defaultsDeep } from "lodash-es";
import { MobileAppSettings, DEFAULT_APP_SETTINGS } from "@/types/settings";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("SettingsStore");
const errorHandler = createModuleErrorHandler("SettingsStore");
const STORE_PATH = "app_settings.json";

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
      const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
      const saved = await store.get<MobileAppSettings>("settings");

      if (saved) {
        // 使用 defaultsDeep 递归合并默认设置，确保新版本增加的字段能被正确初始化
        settings.value = defaultsDeep({}, saved, DEFAULT_APP_SETTINGS);
        logger.info("设置加载成功", { settings: settings.value });
      } else {
        logger.info("未找到保存的设置，使用默认值");
        await store.set("settings", settings.value);
      }
    } catch (err: any) {
      error.value = err;
      errorHandler.error(err, "加载设置失败");
    } finally {
      isLoading.value = false;
      isLoaded.value = true;
    }
  }

  /**
   * 保存设置
   */
  async function save() {
    try {
      const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
      await store.set("settings", settings.value);
      // plugin-store autoSave 会处理写入磁盘
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
    await save();
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