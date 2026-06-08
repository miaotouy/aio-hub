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

function wallpaperBackground(preset: string | undefined, isDark: boolean) {
  switch (preset) {
    case "morning":
      return isDark
        ? "radial-gradient(circle at 18% 18%, rgba(255, 214, 165, 0.24), transparent 30%), radial-gradient(circle at 82% 24%, rgba(125, 211, 252, 0.2), transparent 34%), linear-gradient(145deg, #171923 0%, #25313f 48%, #102a43 100%)"
        : "radial-gradient(circle at 18% 18%, rgba(255, 214, 165, 0.7), transparent 30%), radial-gradient(circle at 82% 24%, rgba(125, 211, 252, 0.48), transparent 34%), linear-gradient(145deg, #fff7ed 0%, #dff6ff 46%, #dbeafe 100%)";
    case "canyon":
      return isDark
        ? "radial-gradient(circle at 18% 20%, rgba(244, 114, 86, 0.24), transparent 30%), radial-gradient(circle at 76% 28%, rgba(251, 191, 36, 0.18), transparent 32%), linear-gradient(150deg, #211915 0%, #3a1f1b 46%, #14213d 100%)"
        : "radial-gradient(circle at 18% 20%, rgba(244, 114, 86, 0.42), transparent 30%), radial-gradient(circle at 76% 28%, rgba(251, 191, 36, 0.36), transparent 32%), linear-gradient(150deg, #fff1e6 0%, #fed7aa 46%, #dbeafe 100%)";
    case "ink":
      return isDark
        ? "radial-gradient(circle at 24% 20%, rgba(148, 163, 184, 0.2), transparent 32%), radial-gradient(circle at 72% 72%, rgba(45, 212, 191, 0.14), transparent 34%), linear-gradient(150deg, #0f172a 0%, #1f2937 48%, #111827 100%)"
        : "radial-gradient(circle at 24% 20%, rgba(148, 163, 184, 0.34), transparent 32%), radial-gradient(circle at 72% 72%, rgba(45, 212, 191, 0.24), transparent 34%), linear-gradient(150deg, #f8fafc 0%, #e2e8f0 48%, #ecfeff 100%)";
    case "aurora":
    default:
      return isDark
        ? "radial-gradient(circle at 18% 18%, rgba(52, 211, 153, 0.22), transparent 30%), radial-gradient(circle at 78% 24%, rgba(96, 165, 250, 0.24), transparent 34%), radial-gradient(circle at 50% 88%, rgba(244, 114, 182, 0.16), transparent 36%), linear-gradient(145deg, #101827 0%, #172033 45%, #111827 100%)"
        : "radial-gradient(circle at 18% 18%, rgba(52, 211, 153, 0.36), transparent 30%), radial-gradient(circle at 78% 24%, rgba(96, 165, 250, 0.32), transparent 34%), radial-gradient(circle at 50% 88%, rgba(244, 114, 182, 0.22), transparent 36%), linear-gradient(145deg, #eff6ff 0%, #ecfdf5 45%, #fdf2f8 100%)";
  }
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
  const wallpaper = appearance.wallpaper;
  const wallpaperEnabled = Boolean(
    wallpaper?.enabled && wallpaper.preset !== "none"
  );
  const wallpaperDim = clamp(wallpaper?.dimOpacity ?? 0.34, 0, 0.8);
  const wallpaperBlur = clamp(wallpaper?.blurIntensity ?? 0, 0, 40);

  const primary = pickColor(varletVars, "--color-primary", sourceColor);
  const success = pickColor(varletVars, "--color-success", "#67C23A");
  const warning = pickColor(varletVars, "--color-warning", "#E6A23C");
  const danger = pickColor(varletVars, "--color-danger", "#F56C6C");
  const info = pickColor(varletVars, "--color-info", "#909399");
  const body = pickColor(
    varletVars,
    "--color-body",
    isDark ? "#121212" : "#FFFFFF"
  );
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
    "--app-wallpaper-display": wallpaperEnabled ? "block" : "none",
    "--app-wallpaper-bg": wallpaperBackground(wallpaper?.preset, isDark),
    "--app-wallpaper-dim": String(wallpaperDim),
    "--app-wallpaper-blur": `${wallpaperBlur}px`,
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
