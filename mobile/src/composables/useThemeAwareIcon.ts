import { ref, watch, computed, Ref } from "vue";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { normalizeIconPath } from "../tools/llm-api/config/model-metadata";

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
  let processed = svgText
    .replace(/<meta[^>]*>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  processed = processed.replace(
    /\b(fill|stroke)\s*=\s*["']([^"']+)["']/gi,
    (match, attr, color) => {
      if (isMonochromeColor(color)) {
        return `${attr}="currentColor"`;
      }
      return match;
    }
  );

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
  if (svgCache.has(url)) {
    return svgCache.get(url)!;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch SVG: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
      throw new Error(`Expected SVG but got HTML for: ${url}`);
    }

    const svgText = await response.text();
    const trimmed = svgText.trim();

    if (!trimmed.includes("<svg")) {
      throw new Error(`Invalid SVG content for: ${url}`);
    }

    const processed = processSvgContent(svgText);
    svgCache.set(url, processed);
    return processed;
  } catch (error) {
    throw error;
  }
}

/**
 * Vue Composable：根据主题智能处理图标
 */
export function useThemeAwareIcon(iconSrcRef: Ref<string | undefined>) {
  const svgContent = ref<string>("");
  const error = ref<Error | null>(null);
  const isLoading = ref(false);

  const isSvg = computed(() => {
    const src = iconSrcRef?.value;
    return src && typeof src === 'string' && src.toLowerCase().endsWith(".svg");
  });
  const iconUrl = computed(() => {
    if (isSvg.value) return "";

    const src = iconSrcRef?.value;
    if (src && typeof src === 'string') {
      return normalizeIconPath(src);
    }
    return src;
  });

  const loadSvg = async () => {
    const src = iconSrcRef?.value;
    if (!isSvg.value || !src) {
      svgContent.value = "";
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      // 确保使用规范化的路径进行 fetch
      const finalUrl = normalizeIconPath(src);
      svgContent.value = await fetchAndProcessSvg(finalUrl);
    } catch (err) {
      error.value = err as Error;
      errorHandler.handle(err, {
        userMessage: "加载或处理SVG图标失败",
        showToUser: false,
        context: { iconSrc: iconSrcRef.value },
      });
    } finally {
      isLoading.value = false;
    }
  };

  watch(
    iconSrcRef,
    () => {
      loadSvg();
    },
    { immediate: true }
  );

  return {
    isSvg,
    svgContent,
    iconUrl,
    isLoading,
    error,
  };
}