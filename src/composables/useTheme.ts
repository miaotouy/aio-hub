import { ref } from "vue";
import { useDark } from "@vueuse/core";
import { useAppSettingsStore } from "@/stores/appSettingsStore";

// 这是一个全局共享的状态,类似于单例
const isDark = useDark();
const currentTheme = ref<"auto" | "light" | "dark">("auto");

/**
 * 应用主题设置
 * @param theme 主题选项
 */
function applyTheme(theme: "auto" | "light" | "dark") {
  currentTheme.value = theme;
  if (theme === "auto") {
    // isDark 会自动跟随系统主题
    isDark.value = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } else {
    isDark.value = theme === "dark";
  }

  // 发送主题变化通知，让其他组件（如图标组件）能够响应
  window.dispatchEvent(
    new CustomEvent("theme-changed", {
      detail: { isDark: isDark.value, theme },
    })
  );
}

/**
 * 循环切换主题
 */
function toggleTheme() {
  let newTheme: "auto" | "light" | "dark";
  if (currentTheme.value === "auto") {
    newTheme = "light";
  } else if (currentTheme.value === "light") {
    newTheme = "dark";
  } else {
    newTheme = "auto";
  }
  applyTheme(newTheme);
  const appSettingsStore = useAppSettingsStore();
  appSettingsStore.update({ theme: newTheme });
}

/**
 * 异步初始化主题
 * 从应用设置中加载主题配置
 */
export async function initTheme(): Promise<void> {
  const appSettingsStore = useAppSettingsStore();
  // 确保已经加载，如果没有加载则先加载
  if (!appSettingsStore.isLoaded) {
    await appSettingsStore.load();
  }
  applyTheme(appSettingsStore.settings.theme || "auto");
}

// 监听系统颜色方案变化，以便在 'auto' 模式下实时更新
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const handleSystemThemeChange = (e: MediaQueryListEvent) => {
  if (currentTheme.value === "auto") {
    isDark.value = e.matches;
    // 系统主题变化时也发送通知
    window.dispatchEvent(
      new CustomEvent("theme-changed", {
        detail: { isDark: isDark.value, theme: currentTheme.value },
      })
    );
  }
};
mediaQuery.addEventListener("change", handleSystemThemeChange);

/**
 * 提供全局主题状态和控制功能的 Composable
 */
export function useTheme() {
  return {
    isDark,
    currentTheme,
    applyTheme,
    toggleTheme,
  };
}
