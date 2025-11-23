import { ref, watch, computed, Ref } from "vue";
import { createModuleErrorHandler } from "@utils/errorHandler";
import { useTheme } from "./useTheme";

const errorHandler = createModuleErrorHandler("ThemeAwareIcon");

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
  // 安全清洗：移除可能存在的 meta、script 等标签，防止 CSP 警告和 XSS 风险
  // 如果 fetch 返回了 HTML 页面（如 404），这也能防止渲染出奇怪的东西
  let processed = svgText
    .replace(/<meta[^>]*>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // 替换 fill 和 stroke 属性中的黑白颜色
  processed = processed.replace(
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

    // 检查 Content-Type，防止将 HTML 页面（如 404 页面）当做 SVG 处理
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
      throw new Error(`Expected SVG but got HTML for: ${url}`);
    }

    const svgText = await response.text();

    // 二次检查内容特征，确保它是 SVG 而不是 HTML 页面
    const trimmed = svgText.trim();
    if (
      trimmed.toLowerCase().startsWith("<!doctype html") ||
      trimmed.toLowerCase().startsWith("<html")
    ) {
      throw new Error(`Content looks like HTML, not SVG for: ${url}`);
    }

    // 宽松检查：必须包含 <svg 标签
    if (!trimmed.includes("<svg")) {
      throw new Error(`Invalid SVG content (no <svg> tag found) for: ${url}`);
    }

    const processed = processSvgContent(svgText);

    // 缓存结果
    svgCache.set(url, processed);
    return processed;
  } catch (error) {
    // 由调用方处理错误日志和 UI
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
      errorHandler.error(err, "加载或处理SVG图标失败", {
        showToUser: false, // 通常由 UI 的 error state 反映，无需弹窗
        context: { iconSrc: iconSrcRef.value },
      });
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