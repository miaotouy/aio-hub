// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { debounce } from "lodash-es";
import {
  appSettingsManager,
  defaultAppSettings,
  defaultAppearanceSettings,
  defaultEnvironmentSettings,
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
   * 立即保存当前设置，用于变更后马上需要后端读取 settings.json 的场景
   */
  async function saveNow(): Promise<void> {
    _debouncedSave.cancel();
    await appSettingsManager.save(settings.value);
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
  const appearance = computed(
    () => settings.value.appearance ?? defaultAppearanceSettings
  );

  /** 运行环境与外部依赖设置 */
  const environment = computed(
    () => settings.value.environment ?? defaultEnvironmentSettings
  );

  /** 主题模式 */
  const theme = computed(() => settings.value.theme ?? "auto");

  /** 工具可见性 */
  const toolsVisible = computed(() => settings.value.toolsVisible ?? {});

  /** 工具排序 */
  const toolsOrder = computed(() => settings.value.toolsOrder ?? []);

  /** 侧边栏模式 */
  const sidebarMode = computed(() => settings.value.sidebarMode ?? "sidebar");

  /** 生效的主题色（如果开启了自动提取且有提取值，则使用提取值，否则使用设置的主题色） */
  const effectiveThemeColor = computed(() => {
    const app = appearance.value;
    const isExtracted = !!(
      app.autoExtractThemeColorFromWallpaper && app.wallpaperExtractedThemeColor
    );
    return isExtracted
      ? app.wallpaperExtractedThemeColor!
      : (settings.value.themeColor ?? "#409eff");
  });

  return {
    settings,
    isLoaded,
    load,
    update,
    saveNow,
    reset,
    appearance,
    environment,
    theme,
    toolsVisible,
    toolsOrder,
    sidebarMode,
    effectiveThemeColor,
  };
});
