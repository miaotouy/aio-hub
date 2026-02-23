import { defineStore } from "pinia";
import { ref, computed } from "vue";
import debounce from "lodash-es/debounce";
import {
  appSettingsManager,
  defaultAppSettings,
  defaultAppearanceSettings,
  type AppSettings,
} from "@/utils/appSettings";

/**
 * 全局应用设置 Store
 * 提供响应式的设置状态和持久化操作
 */
export const useAppSettingsStore = defineStore("appSettings", () => {
  const settings = ref<AppSettings>({ ...defaultAppSettings });
  const isLoaded = ref(false);

  // 防抖保存（300ms），避免频繁写入磁盘
  const _debouncedSave = debounce(async (s: AppSettings) => {
    await appSettingsManager.save(s);
  }, 300);

  /**
   * 初始化时调用一次，从磁盘加载设置
   */
  async function load(): Promise<AppSettings> {
    const loaded = await appSettingsManager.load();
    settings.value = loaded;
    isLoaded.value = true;
    return loaded;
  }

  /**
   * 更新部分设置，自动触发防抖保存
   * @param updates 要更新的设置项
   */
  function update(updates: Partial<AppSettings>): void {
    settings.value = { ...settings.value, ...updates };
    _debouncedSave(settings.value);
  }

  /**
   * 重置所有设置为默认值
   */
  async function reset(): Promise<AppSettings> {
    settings.value = { ...defaultAppSettings };
    await appSettingsManager.save(defaultAppSettings);
    return defaultAppSettings;
  }

  // --- 常用 Computed Getters ---
  // 避免组件中出现 store.settings.appearance?.xxx 这种繁琐且可能 undefined 的访问

  /** 外观设置 */
  const appearance = computed(() => settings.value.appearance ?? defaultAppearanceSettings);

  /** 主题模式 */
  const theme = computed(() => settings.value.theme ?? "auto");

  /** 工具可见性 */
  const toolsVisible = computed(() => settings.value.toolsVisible ?? {});

  /** 工具排序 */
  const toolsOrder = computed(() => settings.value.toolsOrder ?? []);

  /** 侧边栏模式 */
  const sidebarMode = computed(() => settings.value.sidebarMode ?? "sidebar");

  return {
    settings,
    isLoaded,
    load,
    update,
    reset,
    appearance,
    theme,
    toolsVisible,
    toolsOrder,
    sidebarMode,
  };
});
