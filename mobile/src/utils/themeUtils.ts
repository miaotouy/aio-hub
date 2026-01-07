import {
  argbFromHex,
  themeFromSourceColor,
  hexFromArgb,
} from "@material/material-color-utilities";

/**
 * 将 Hex 转换为 HSL 字符串 (不带逗号，符合 Varlet 的 --hsl-xxx 格式)
 * 格式: "h, s%, l%"
 */
function hexToVarletHsl(hex: string): string {
  // 去掉 #
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
}

/**
 * 将 MD3 主题转换为 Varlet 兼容的 CSS 变量对象
 */
export function generateMd3Theme(sourceColorHex: string, isDark: boolean) {
  const theme = themeFromSourceColor(argbFromHex(sourceColorHex));
  const scheme = isDark ? theme.schemes.dark : theme.schemes.light;

  const themeConfig: Record<string, string> = {};

  const addColor = (key: string, argb: number) => {
    const hex = hexFromArgb(argb);
    themeConfig[`--color-${key}`] = hex;
    themeConfig[`--hsl-${key}`] = hexToVarletHsl(hex);
  };

  addColor("primary", scheme.primary);
  addColor("on-primary", scheme.onPrimary);
  addColor("primary-container", scheme.primaryContainer);
  addColor("on-primary-container", scheme.onPrimaryContainer);
  
  addColor("secondary", scheme.secondary);
  addColor("on-secondary", scheme.onSecondary);
  addColor("secondary-container", scheme.secondaryContainer);
  addColor("on-secondary-container", scheme.onSecondaryContainer);
  
  addColor("tertiary", scheme.tertiary);
  addColor("on-tertiary", scheme.onTertiary);
  addColor("tertiary-container", scheme.tertiaryContainer);
  addColor("on-tertiary-container", scheme.onTertiaryContainer);
  
  addColor("error", scheme.error);
  addColor("on-error", scheme.onError);
  addColor("error-container", scheme.errorContainer);
  addColor("on-error-container", scheme.onErrorContainer);
  
  addColor("surface", scheme.surface);
  addColor("on-surface", scheme.onSurface);
  addColor("surface-variant", scheme.surfaceVariant);
  addColor("on-surface-variant", scheme.onSurfaceVariant);
  
  addColor("outline", scheme.outline);
  addColor("outline-variant", scheme.outlineVariant);
  addColor("inverse-surface", scheme.inverseSurface);
  addColor("inverse-on-surface", scheme.inverseOnSurface);
  addColor("inverse-primary", scheme.inversePrimary);
  
  // 核心语义映射
  themeConfig["--color-body"] = hexFromArgb(scheme.surface);
  themeConfig["--hsl-body"] = hexToVarletHsl(themeConfig["--color-body"]);
  
  themeConfig["--color-text"] = hexFromArgb(scheme.onSurface);
  themeConfig["--hsl-text"] = hexToVarletHsl(themeConfig["--color-text"]);

  // 映射语义颜色 (MD3 默认没有 info, success, warning)
  // 我们根据 MD3 的 secondary 和 tertiary 来模拟
  const infoHex = hexFromArgb(scheme.secondary);
  themeConfig["--color-info"] = infoHex;
  themeConfig["--hsl-info"] = hexToVarletHsl(infoHex);
  
  const infoContainerHex = hexFromArgb(scheme.secondaryContainer);
  themeConfig["--color-info-container"] = infoContainerHex;
  themeConfig["--hsl-info-container"] = hexToVarletHsl(infoContainerHex);
  themeConfig["--color-on-info-container"] = hexFromArgb(scheme.onSecondaryContainer);

  // 成功色 (MD3 库通常不直接提供 success，我们借用 tertiary 颜色)
  const successHex = hexFromArgb(scheme.tertiary);
  themeConfig["--color-success"] = successHex;
  themeConfig["--hsl-success"] = hexToVarletHsl(successHex);
  themeConfig["--color-success-container"] = hexFromArgb(scheme.tertiaryContainer);

  // 警告色 (MD3 库不直接提供，我们可以通过 tertiary 或者手动调整)
  // 这里为了简单，我们先保持一个映射
  themeConfig["--color-warning"] = hexFromArgb(scheme.tertiary);
  themeConfig["--hsl-warning"] = hexToVarletHsl(themeConfig["--color-warning"]);

  // 容器类颜色映射 (MD3 规范)
  themeConfig["--color-surface-container"] = hexFromArgb(scheme.surfaceVariant);
  themeConfig["--hsl-surface-container"] = hexToVarletHsl(themeConfig["--color-surface-container"]);
  
  themeConfig["--color-surface-container-low"] = hexFromArgb(scheme.surface);
  themeConfig["--hsl-surface-container-low"] = hexToVarletHsl(themeConfig["--color-surface-container-low"]);
  
  themeConfig["--color-surface-container-high"] = hexFromArgb(scheme.surfaceVariant);
  themeConfig["--hsl-surface-container-high"] = hexToVarletHsl(themeConfig["--color-surface-container-high"]);
  
  themeConfig["--color-surface-container-highest"] = hexFromArgb(scheme.surfaceVariant);
  themeConfig["--hsl-surface-container-highest"] = hexToVarletHsl(themeConfig["--color-surface-container-highest"]);

  // 修复 BottomNavigation 等组件的紫色高亮问题
  // 强制覆盖 Varlet 内部可能引用的 info-container 变量
  const primaryContainer = hexFromArgb(scheme.primaryContainer);
  themeConfig["--bottom-navigation-item-active-background-color"] = primaryContainer;
  themeConfig["--bottom-navigation-item-variant-active-background-color"] = primaryContainer;
  themeConfig["--bottom-navigation-item-variant-active-color"] = hexFromArgb(scheme.onPrimaryContainer);

  return themeConfig;
}