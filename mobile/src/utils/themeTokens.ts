import type { AppearanceSettings } from "@/types/settings";
import { generateMd3Theme } from "@/utils/themeUtils";

export interface MobileThemeTokens {
  aioVars: Record<string, string>;
  varletVars: Record<string, string>;
  isDark: boolean;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(hex: string | undefined, fallback: string) {
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
    return hex;
  }

  return fallback;
}

function hexToRgb(hex: string): RGB {
  const normalized = normalizeHex(hex, "#409EFF").slice(1);

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbString(hex: string) {
  const rgb = hexToRgb(hex);
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

function rgbaFromHex(hex: string, opacity: number) {
  return `rgba(${rgbString(hex)}, ${clamp(opacity, 0, 1)})`;
}

function layerOpacity(base: number, offset: number, effectsEnabled: boolean) {
  if (!effectsEnabled) {
    return 1;
  }

  return clamp(base + offset, 0.35, 1);
}

function radius(value: number, scale: number) {
  return `${Math.round(value * clamp(scale, 0.5, 1.8))}px`;
}

function pickColor(
  vars: Record<string, string>,
  key: string,
  fallback: string
) {
  return normalizeHex(vars[key], fallback);
}

export function generateMobileTheme(
  appearance: AppearanceSettings,
  isDark: boolean
): MobileThemeTokens {
  const sourceColor = normalizeHex(appearance.themeColor, "#409EFF");
  const varletVars = generateMd3Theme(sourceColor, isDark);
  const effectsEnabled = appearance.enableUiEffects;
  const blurEnabled = effectsEnabled && appearance.enableUiBlur;
  const baseOpacity = clamp(appearance.uiBaseOpacity, 0.35, 1);
  const borderOpacity = clamp(appearance.borderOpacity, 0, 1);
  const borderWidth = clamp(appearance.borderWidth, 0, 4);
  const radiusScale = clamp(appearance.radiusScale, 0.5, 1.8);
  const fontScale = clamp(appearance.fontSizeScale, 0.8, 1.5);
  const baseFontSize = 14 * fontScale;
  const layerOffsets = appearance.layerOpacityOffsets;

  const primary = pickColor(varletVars, "--color-primary", sourceColor);
  const success = pickColor(varletVars, "--color-success", "#67C23A");
  const warning = pickColor(varletVars, "--color-warning", "#E6A23C");
  const danger = pickColor(varletVars, "--color-danger", "#F56C6C");
  const info = pickColor(varletVars, "--color-info", "#909399");
  const body = pickColor(varletVars, "--color-body", isDark ? "#121212" : "#FFFFFF");
  const surface = pickColor(
    varletVars,
    "--color-surface",
    isDark ? "#121212" : "#FFFFFF"
  );
  const surfaceContainer = pickColor(
    varletVars,
    "--color-surface-container",
    isDark ? "#242424" : "#F3F3F3"
  );
  const surfaceLow = pickColor(
    varletVars,
    "--color-surface-container-low",
    isDark ? "#1A1A1A" : "#FFFFFF"
  );
  const surfaceHigh = pickColor(
    varletVars,
    "--color-surface-container-high",
    isDark ? "#2A2A2A" : "#F7F7F7"
  );
  const text = pickColor(
    varletVars,
    "--color-on-surface",
    isDark ? "#E5E5E5" : "#333333"
  );
  const textLight = pickColor(
    varletVars,
    "--color-on-surface-variant",
    isDark ? "#A8A8A8" : "#666666"
  );
  const outline = pickColor(
    varletVars,
    "--color-outline",
    isDark ? "#3A3A3A" : "#DDDDDD"
  );

  const cardOpacity = layerOpacity(
    baseOpacity,
    layerOffsets.card,
    effectsEnabled
  );
  const inputOpacity = layerOpacity(
    baseOpacity,
    layerOffsets.input,
    effectsEnabled
  );
  const toolbarOpacity = layerOpacity(
    baseOpacity,
    layerOffsets.toolbar,
    effectsEnabled
  );
  const overlayOpacity = layerOpacity(
    baseOpacity,
    layerOffsets.overlay,
    effectsEnabled
  );

  const aioVars: Record<string, string> = {
    "--primary-color": primary,
    "--primary-color-rgb": rgbString(primary),
    "--success-color": success,
    "--success-color-rgb": rgbString(success),
    "--warning-color": warning,
    "--warning-color-rgb": rgbString(warning),
    "--danger-color": danger,
    "--danger-color-rgb": rgbString(danger),
    "--error-color": danger,
    "--error-color-rgb": rgbString(danger),
    "--info-color": info,
    "--info-color-rgb": rgbString(info),

    "--bg-color": body,
    "--bg-color-rgb": rgbString(body),
    "--text-color": text,
    "--text-color-rgb": rgbString(text),
    "--text-color-light": textLight,
    "--text-color-light-rgb": rgbString(textLight),
    "--border-color-rgb": rgbString(outline),
    "--border-opacity": String(borderOpacity),
    "--border-color": `rgba(${rgbString(outline)}, ${borderOpacity})`,
    "--border-width": `${borderWidth}px`,

    "--container-bg": rgbaFromHex(surfaceContainer, toolbarOpacity),
    "--container-bg-rgb": rgbString(surfaceContainer),
    "--card-bg": rgbaFromHex(surfaceLow, cardOpacity),
    "--card-bg-rgb": rgbString(surfaceLow),
    "--input-bg": rgbaFromHex(surfaceHigh, inputOpacity),
    "--input-bg-rgb": rgbString(surfaceHigh),
    "--sidebar-bg": rgbaFromHex(surface, toolbarOpacity),
    "--sidebar-bg-rgb": rgbString(surface),
    "--overlay-bg": rgbaFromHex(surfaceHigh, overlayOpacity),
    "--overlay-bg-rgb": rgbString(surfaceHigh),

    "--ui-blur": blurEnabled ? `${appearance.uiBlurIntensity}px` : "0px",
    "--ui-effects-enabled": effectsEnabled ? "1" : "0",
    "--card-opacity": String(cardOpacity),
    "--input-opacity": String(inputOpacity),
    "--toolbar-opacity": String(toolbarOpacity),
    "--overlay-opacity": String(overlayOpacity),

    "--app-font-size": `${baseFontSize}px`,
    "--app-font-scale": String(fontScale),
    "--font-size-xs": `${baseFontSize - 4}px`,
    "--font-size-sm": `${baseFontSize - 2}px`,
    "--font-size-md": `${baseFontSize}px`,
    "--font-size-lg": `${baseFontSize + 2}px`,

    "--app-radius-xl": radius(16, radiusScale),
    "--app-radius-lg": radius(12, radiusScale),
    "--app-radius-md": radius(8, radiusScale),
    "--app-radius-sm": radius(4, radiusScale),
  };

  return {
    aioVars,
    varletVars: {
      ...varletVars,
      "--popup-content-background-color": "var(--overlay-bg)",
      "--dialog-background": "var(--overlay-bg)",
      "--paper-background": "var(--card-bg)",
      "--card-background": "var(--card-bg)",
      "--button-default-color": "var(--input-bg)",
      "--field-decorator-blur-color": "var(--border-color)",
      "--field-decorator-focus-color": "var(--primary-color)",
      "--input-text-color": "var(--text-color)",
      "--input-placeholder-color": "var(--text-color-light)",
    },
    isDark,
  };
}
