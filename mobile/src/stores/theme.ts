import { defineStore } from "pinia";
import { ref, watch, computed } from "vue";
import { useSettingsStore } from "./settings";
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

  const applyTheme = () => {
    const md3Theme = generateMd3Theme(themeColor.value, isDark.value);
    
    if (isDark.value) {
      document.documentElement.classList.add("dark");
      StyleProvider({
        ...Themes.md3Dark,
        ...md3Theme
      });
    } else {
      document.documentElement.classList.remove("dark");
      StyleProvider({
        ...Themes.md3Light,
        ...md3Theme
      });
    }
  };

  // 监听设置中的主题模式或颜色变化
  watch([themeMode, themeColor], () => {
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
