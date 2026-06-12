import { reactive, ref, onMounted, onUnmounted } from "vue";

/**
 * 获取 CSS 变量值
 */
function getCssVar(varName: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
}

/**
 * 判断是否为暗色主题
 */
function isDarkTheme(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * 创建动态调色板
 */
function createThemePalette() {
  const dark = isDarkTheme();
  const lightSuffix = dark ? "" : "-light-3";
  const lighterSuffix = dark ? "-light-3" : "-light-5";
  const inactiveSuffix = dark ? "-dark-2" : "-light-8";

  const cardBg = getCssVar("--card-bg");
  const containerBg = getCssVar("--container-bg");

  return {
    user: {
      base: cardBg || getCssVar("--el-color-primary"),
      light: getCssVar(`--el-color-primary${lightSuffix}`),
      lighter: containerBg || getCssVar(`--el-color-primary${lighterSuffix}`),
    },
    assistant: {
      base: cardBg || getCssVar("--el-color-success"),
      light: getCssVar(`--el-color-success${lightSuffix}`),
      lighter: containerBg || getCssVar(`--el-color-success${lighterSuffix}`),
    },
    system: {
      base: cardBg || getCssVar("--el-color-warning"),
      light: getCssVar(`--el-color-warning${lightSuffix}`),
      lighter: containerBg || getCssVar(`--el-color-warning${lighterSuffix}`),
    },
    tool: {
      base: cardBg || getCssVar("--el-color-info"),
      light: getCssVar(`--el-color-info${lightSuffix}`),
      lighter: containerBg || getCssVar(`--el-color-info${lighterSuffix}`),
    },
    danger: {
      base: getCssVar("--el-color-danger"),
      light: getCssVar(`--el-color-danger${lightSuffix}`),
    },
    disabled: {
      base: getCssVar(`--el-color-info${inactiveSuffix}`),
      light: getCssVar(`--el-color-info${inactiveSuffix}`),
    },
    inactive: {
      base: getCssVar(`--el-color-info-dark-2`),
      light: getCssVar(`--el-color-info${lightSuffix}`),
    },
    edge: {
      active: getCssVar("--el-color-primary"),
      activeHighlight: getCssVar(`--el-color-primary${lightSuffix}`),
      inactive: getCssVar(`--el-color-info${inactiveSuffix}`),
      inactiveHighlight: getCssVar(`--el-color-info${lightSuffix}`),
    },
  };
}

function isPaletteEqual(
  current: Record<string, any>,
  next: Record<string, any>
): boolean {
  for (const key of Object.keys(next)) {
    const nextValue = next[key];
    const currentValue = current[key];
    if (
      nextValue &&
      typeof nextValue === "object" &&
      !Array.isArray(nextValue)
    ) {
      if (!isPaletteEqual(currentValue || {}, nextValue)) return false;
    } else if (currentValue !== nextValue) {
      return false;
    }
  }

  return true;
}

/**
 * 树图主题调色板 Composable
 */
export function useGraphThemePalette() {
  const palette = reactive(createThemePalette());
  // 版本号：每次 palette 更新时递增，供外部 watch 触发刷新
  const paletteVersion = ref(0);

  let observer: MutationObserver | null = null;

  onMounted(() => {
    observer = new MutationObserver(() => {
      const nextPalette = createThemePalette();
      if (isPaletteEqual(palette, nextPalette)) return;

      Object.assign(palette, nextPalette);
      paletteVersion.value++;
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
  });

  onUnmounted(() => {
    if (observer) {
      observer.disconnect();
    }
  });

  return {
    palette,
    paletteVersion,
  };
}
