import { defineStore } from "pinia";
import { ref, watch, computed } from "vue";
import { useSettingsStore } from "./settings";

export const useThemeStore = defineStore("theme", () => {
  const settingsStore = useSettingsStore();
  const isDark = ref(false);

  const themeMode = computed(() => settingsStore.settings.appearance.theme);

  const initTheme = () => {
    updateIsDark();
    applyTheme();
  };

  const updateIsDark = () => {
    if (themeMode.value === "auto") {
      isDark.value = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } else {
      isDark.value = themeMode.value === "dark";
    }
  };

  const toggleTheme = async () => {
    const newTheme = isDark.value ? "light" : "dark";
    await settingsStore.updateAppearance({ theme: newTheme });
  };

  const applyTheme = () => {
    if (isDark.value) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // 监听设置中的主题模式变化
  watch(themeMode, () => {
    updateIsDark();
  });

  watch(isDark, () => {
    applyTheme();
  });

  // 监听系统主题变化 (当模式为 auto 时)
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (themeMode.value === "auto") {
      updateIsDark();
    }
  });

  return {
    isDark,
    initTheme,
    toggleTheme,
  };
});
