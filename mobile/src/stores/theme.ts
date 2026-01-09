import { defineStore } from "pinia";
import { ref, watch, computed } from "vue";
import { useSettingsStore } from "./settings";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("ThemeStore");
import { StyleProvider, Themes } from "@varlet/ui";
import { generateMd3Theme } from "@/utils/themeUtils";

export const useThemeStore = defineStore("theme", () => {
  const settingsStore = useSettingsStore();
  const isDark = ref(false);

  const themeMode = computed(() => settingsStore.settings.appearance.theme);
  const themeColor = computed(() => settingsStore.settings.appearance.themeColor || "#409EFF");

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

  const themeVars = computed(() => {
    const md3Theme = generateMd3Theme(themeColor.value, isDark.value);

    return {
      ...(isDark.value ? Themes.md3Dark : Themes.md3Light),
      ...md3Theme,
    };
  });

  const applyTheme = () => {
    if (isDark.value) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // 同时也保留函数式调用，以防万一有组件没在 StyleProvider 下
    StyleProvider(themeVars.value);
  };

  // 深度监听 settingsStore.settings.appearance 的变化
  watch(
    () => settingsStore.settings.appearance,
    () => {
      logger.debug("外观设置发生变化，重新应用主题");
      updateIsDark();
      applyTheme();
    },
    { immediate: true, deep: true }
  );

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
    themeVars,
    initTheme,
    toggleTheme,
  };
});
