import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AppSettings, AppearanceSettings } from '@/utils/appSettings';
import { appSettingsManager, defaultAppSettings, defaultAppearanceSettings } from '@/utils/appSettings';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('SettingsStore');

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(defaultAppSettings);

  const appearanceSettings = computed(() => settings.value.appearance);

  async function loadSettings() {
    try {
      const loadedSettings = await appSettingsManager.load();
      settings.value = loadedSettings;
      logger.info('应用设置已加载', loadedSettings);
    } catch (error) {
      logger.error('加载应用设置失败', error);
      // 在加载失败时，回退到默认设置
      settings.value = defaultAppSettings;
    }
  }

  async function updateSettings(newSettings: Partial<AppSettings>) {
    // 采用深度合并的逻辑，确保嵌套对象（如 appearance）也能正确更新
    const currentSettings = JSON.parse(JSON.stringify(settings.value));

    for (const key in newSettings) {
      if (Object.prototype.hasOwnProperty.call(newSettings, key)) {
        const k = key as keyof AppSettings;
        if (typeof newSettings[k] === 'object' && newSettings[k] !== null && !Array.isArray(newSettings[k])) {
          // @ts-ignore
          currentSettings[k] = { ...currentSettings[k], ...newSettings[k] };
        } else {
          // @ts-ignore
          currentSettings[k] = newSettings[k];
        }
      }
    }
    
    settings.value = currentSettings;

    try {
      await appSettingsManager.save(settings.value);
      logger.info('应用设置已更新并保存');
    } catch (error) {
      logger.error('保存应用设置失败', error);
    }
  }

  function updateAppearanceSettings(newAppearance: Partial<AppearanceSettings>) {
    return updateSettings({
      appearance: {
        ...(settings.value.appearance || defaultAppearanceSettings),
        ...newAppearance,
      },
    });
  }

  return {
    settings,
    appearanceSettings,
    loadSettings,
    updateSettings,
    updateAppearanceSettings,
  };
});