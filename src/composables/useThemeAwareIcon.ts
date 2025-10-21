import { ref, watch, computed, Ref } from "vue";
import { createModuleLogger } from "@utils/logger";
import { useTheme } from "./useTheme";

const logger = createModuleLogger("ThemeAwareIcon");

// 缓存处理后的 SVG 内容
const svgCache = new Map<string, string>();

/**
 * 检查颜色是否为黑色
 */
function isBlackColor(color: string): boolean {
  if (!color) return false;
  const c = color.toLowerCase().trim();
  return (
    c === "#000" ||
    c === "#000000" ||
    c === "black" ||
    c === "rgb(0,0,0)" ||
    c === "rgb(0, 0, 0)"
  );
}

/**
 * 检查颜色是否为白色
 */
function isWhiteColor(color: string): boolean {
  if (!color) return false;
  const c = color.toLowerCase().trim();
  return (
    c === "#fff" ||
    c === "#ffffff" ||
    c === "white" ||
    c === "rgb(255,255,255)" ||
    c === "rgb(255, 255, 255)"
  );
}

/**
 * 检查颜色是否为单色（黑色或白色）
 */
function isMonochromeColor(color: string): boolean {
  return isBlackColor(color) || isWhiteColor(color);
}

/**
 * 处理 SVG 内容，将黑白颜色替换为 currentColor
 */
function processSvgContent(svgText: string): string {
  // 替换 fill 和 stroke 属性中的黑白颜色
  let processed = svgText.replace(
    /\b(fill|stroke)\s*=\s*["']([^"']+)["']/gi,
    (match, attr, color) => {
      if (isMonochromeColor(color)) {
        return `${attr}="currentColor"`;
      }
      return match;
    }
  );

  // 替换 style 属性中的颜色
  processed = processed.replace(
    /style\s*=\s*["']([^"']*?)["']/gi,
    (_match, styleContent) => {
      const updatedStyle = styleContent.replace(
        /\b(fill|stroke)\s*:\s*([^;]+)/gi,
        (styleMatch: string, prop: string, value: string) => {
          const trimmedValue = value.trim();
          if (isMonochromeColor(trimmedValue)) {
            return `${prop}: currentColor`;
          }
          return styleMatch;
        }
      );
      return `style="${updatedStyle}"`;
    }
  );

  return processed;
}

/**
 * 从 URL 获取并处理 SVG
 */
async function fetchAndProcessSvg(url: string): Promise<string> {
  // 检查缓存
  if (svgCache.has(url)) {
    return svgCache.get(url)!;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch SVG: ${response.statusText}`);
    }

    const svgText = await response.text();
    const processed = processSvgContent(svgText);

    // 缓存结果
    svgCache.set(url, processed);
    return processed;
  } catch (error) {
    logger.error(`Error processing SVG at ${url}:`, error);
    throw error;
  }
}

/**
 * Vue Composable：根据主题智能处理图标
 * - SVG 图标：将黑白部分替换为 currentColor，保留彩色部分
 * - PNG 图标：跳过处理，直接使用原图
 */
export function useThemeAwareIcon(iconSrcRef: Ref<string>) {
  const { isDark } = useTheme();
  const svgContent = ref<string>("");
  const error = ref<Error | null>(null);
  const isLoading = ref(false);

  // 判断是否为 SVG
  const isSvg = computed(() => {
    return iconSrcRef.value && iconSrcRef.value.toLowerCase().endsWith(".svg");
  });

  // 如果是 PNG 或其他格式，直接返回原始 src
  const iconUrl = computed(() => {
    return isSvg.value ? "" : iconSrcRef.value;
  });

  // 加载和处理 SVG
  const loadSvg = async () => {
    if (!isSvg.value) {
      svgContent.value = "";
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      svgContent.value = await fetchAndProcessSvg(iconSrcRef.value);
    } catch (err) {
      error.value = err as Error;
      logger.error("Failed to load SVG:", err);
    } finally {
      isLoading.value = false;
    }
  };

  // 监听 iconSrcRef 的变化并自动重新加载
  watch(
    iconSrcRef,
    () => {
      loadSvg();
    },
    { immediate: true }
  );

  // 当主题切换时，currentColor 会自动适配，无需重新加载
  watch(isDark, () => {
    // currentColor 会自动响应主题变化
  });

  return {
    isSvg,
    svgContent,
    iconUrl,
    isLoading,
    error,
  };
}