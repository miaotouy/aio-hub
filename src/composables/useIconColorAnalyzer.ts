import { ref, onMounted } from "vue";
import { createModuleLogger } from "@utils/logger";

const logger = createModuleLogger("IconColorAnalyzer");

// 缓存分析结果
const iconAnalysisCache = new Map<string, boolean>();

// 用于检测颜色值的正则表达式 (匹配 fill="..." 或 stroke="...")
const colorRegex = /(?:fill|stroke)=["']([^"']+)["']/g;
// 用于检测是否包含 data:image (通常是内嵌的光栅图像)
const dataImageRegex = /data:image\//;

/**
 * 检查一个颜色值是否为单色（黑、白、无色或透明）
 * @param color 颜色字符串
 * @returns 是否为单色
 */
function isMonochromeColor(color: string): boolean {
  if (!color || color.toLowerCase() === "none" || color.toLowerCase() === "transparent") {
    return true;
  }
  const c = color.toLowerCase();
  // 检查是否为黑色、白色或其变体
  return c === "#000" || c === "#000000" || c === "black" || c === "#fff" || c === "#ffffff" || c === "white";
}

/**
 * 分析 SVG 文件内容，判断是否应该在暗色模式下反色
 * @param url SVG 文件的 URL
 * @returns 是否需要反色
 */
async function analyzeSvgForInversion(url: string): Promise<boolean> {
  if (iconAnalysisCache.has(url)) {
    return iconAnalysisCache.get(url)!;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch SVG: ${response.statusText}`);
    }
    const svgText = await response.text();

    // 规则 1: 如果 SVG 包含内嵌的光栅图 (data:image)，则不反色
    if (dataImageRegex.test(svgText)) {
      iconAnalysisCache.set(url, false);
      return false;
    }

    // 规则 2: 如果 SVG 明确使用了 currentColor，则认为它是单色图标，需要反色
    if (svgText.includes('currentColor')) {
      iconAnalysisCache.set(url, true);
      return true;
    }

    // 规则 3: 提取所有具体的颜色定义
    const matches = [...svgText.matchAll(colorRegex)];
    const colors = matches.map((match) => match[1]);

    // 规则 4: 如果没有找到任何颜色定义 (fill/stroke)，则认为它是单色图标 (依赖外部 CSS)
    if (colors.length === 0) {
      iconAnalysisCache.set(url, true);
      return true;
    }

    // 规则 5: 如果所有定义的颜色都是单色（黑/白/无色），则反色
    const allMonochrome = colors.every(isMonochromeColor);
    iconAnalysisCache.set(url, allMonochrome);
    return allMonochrome;
  } catch (error) {
    logger.error(`Error analyzing SVG at ${url}:`, error);
    // 出错时，为避免破坏彩色图标，默认不反色
    iconAnalysisCache.set(url, false);
    return false;
  }
}

/**
 * 一个 Vue Composable，用于分析图标颜色并返回是否需要反色
 * @param iconSrc 图标的路径
 */
export function useIconColorAnalyzer(iconSrc: string) {
  const needsInversion = ref(false);

  onMounted(async () => {
    if (iconSrc && iconSrc.toLowerCase().endsWith(".svg")) {
      needsInversion.value = await analyzeSvgForInversion(iconSrc);
    }
  });

  return { needsInversion };
}