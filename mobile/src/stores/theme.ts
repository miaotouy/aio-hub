import { defineStore } from "pinia";
import { ref, watch, computed } from "vue";
import { useSettingsStore } from "./settings";
import { createModuleLogger } from "@/utils/logger";
import { generateMobileTheme } from "@/utils/themeTokens";

const logger = createModuleLogger("ThemeStore");
import { StyleProvider, Themes } from "@varlet/ui";

export const useThemeStore = defineStore("theme", () => {
  const settingsStore = useSettingsStore();
  const isDark = ref(false);
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const themeMode = computed(() => settingsStore.settings.appearance.theme);
  const mobileTheme = computed(() =>
    generateMobileTheme(settingsStore.settings.appearance, isDark.value)
  );

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
    return {
      ...(isDark.value ? Themes.md3Dark : Themes.md3Light),
      ...mobileTheme.value.varletVars,
      ...mobileTheme.value.aioVars,
    };
  });

  const aioVars = computed(() => mobileTheme.value.aioVars);

  const applyCssVariables = (vars: Record<string, string>) => {
    const root = document.documentElement;

    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    root.style.fontSize = vars["--app-font-size"] || "";
  };

  const applyTheme = () => {
    if (isDark.value) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    applyCssVariables(themeVars.value);

    // 同时也保留函数式调用，以防万一有组件没在 StyleProvider 下
    StyleProvider(themeVars.value);

    window.dispatchEvent(
      new CustomEvent("theme-changed", {
        detail: { isDark: isDark.value, theme: themeMode.value },
      })
    );
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
  mediaQuery.addEventListener("change", () => {
    if (themeMode.value === "auto") {
      updateIsDark();
    }
  });

  return {
    isDark,
    themeVars,
    aioVars,
    initTheme,
    toggleTheme,
  };
});
