import { ref, watch } from "vue";
import { useSettingsStore } from "@/stores/settings";
import {
  DEFAULT_APP_SETTINGS,
  type AppearanceSettings,
} from "@/types/settings";

function cloneAppearance(
  appearance: Partial<AppearanceSettings>
): AppearanceSettings {
  const defaults = DEFAULT_APP_SETTINGS.appearance;

  return {
    ...defaults,
    ...appearance,
    wallpaper: {
      ...defaults.wallpaper,
      ...appearance.wallpaper,
    },
    layerOpacityOffsets: {
      ...defaults.layerOpacityOffsets,
      ...appearance.layerOpacityOffsets,
    },
  };
}

export function useAppearanceSettingsDraft() {
  const settingsStore = useSettingsStore();
  const appearanceDraft = ref<AppearanceSettings>(
    cloneAppearance(settingsStore.settings.appearance)
  );

  watch(
    () => settingsStore.settings.appearance,
    (appearance) => {
      appearanceDraft.value = cloneAppearance(appearance);
    },
    { deep: true, immediate: true }
  );

  const updateAppearanceDraft = async (
    updates: Partial<AppearanceSettings>
  ) => {
    const nextAppearance = cloneAppearance({
      ...appearanceDraft.value,
      ...updates,
      wallpaper: {
        ...appearanceDraft.value.wallpaper,
        ...updates.wallpaper,
      },
      layerOpacityOffsets: {
        ...appearanceDraft.value.layerOpacityOffsets,
        ...updates.layerOpacityOffsets,
      },
    });

    appearanceDraft.value = nextAppearance;
    await settingsStore.updateAppearance(nextAppearance);
  };

  const resetAppearanceDraft = async () => {
    appearanceDraft.value = cloneAppearance(DEFAULT_APP_SETTINGS.appearance);
    await settingsStore.updateAppearance(DEFAULT_APP_SETTINGS.appearance);
  };

  return {
    appearanceDraft,
    updateAppearanceDraft,
    resetAppearanceDraft,
  };
}
