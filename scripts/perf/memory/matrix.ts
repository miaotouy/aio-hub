// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

export interface AppearanceCase {
  id: string;
  theme: "light" | "dark";
  wallpaper: boolean;
  opacity: number;
  blur: number;
  effects: boolean;
  windowEffect: "none" | "mica" | "acrylic";
  windowOpacity: number;
}

export function appearanceMatrix(
  suite: "quick" | "full" | "native"
): AppearanceCase[] {
  const cases: AppearanceCase[] = [];
  for (const theme of ["light", "dark"] as const) {
    for (const wallpaper of [false, true]) {
      for (const opacity of [1, 0.75, 0.3]) {
        for (const blur of [0, 15, 40]) {
          cases.push({
            id: `${theme}-w${Number(wallpaper)}-o${opacity}-b${blur}`,
            theme,
            wallpaper,
            opacity,
            blur,
            effects: true,
            windowEffect: "none",
            windowOpacity: 1,
          });
        }
      }
    }
    cases.push({
      id: `${theme}-effects-off`,
      theme,
      wallpaper: false,
      opacity: 1,
      blur: 0,
      effects: false,
      windowEffect: "none",
      windowOpacity: 1,
    });
  }
  // Short diagnostic sweep. Full is the Cartesian product, including opaque + blur.
  if (suite === "quick") {
    const ids = new Set([
      "light-effects-off",
      "dark-effects-off",
      "light-w0-o0.75-b0",
      "dark-w1-o1-b0",
      "light-w1-o0.75-b15",
      "dark-w1-o0.75-b15",
      "light-w1-o0.3-b40",
      "dark-w0-o0.3-b40",
    ]);
    return cases.filter((item) => ids.has(item.id));
  }
  if (suite === "native") {
    return (["light", "dark"] as const).flatMap((theme) =>
      (["none", "mica", "acrylic"] as const).flatMap((windowEffect) =>
        [1, 0.7].map((windowOpacity) => ({
          id: `${theme}-${windowEffect}-window${windowOpacity}`,
          theme,
          wallpaper: true,
          opacity: 0.75,
          blur: 15,
          effects: true,
          windowEffect,
          windowOpacity,
        }))
      )
    );
  }
  return cases;
}

export function appearanceSettings(item: AppearanceCase) {
  return {
    enableWallpaper: item.wallpaper,
    wallpaperMode: "static",
    wallpaperSource: "builtin",
    builtinWallpaperName: "abstract-shapes.png",
    wallpaperOpacity: 0.55,
    wallpaperPath: "",
    wallpaperFit: "cover",
    enableUiEffects: item.effects,
    enableUiBlur: item.blur > 0,
    uiBaseOpacity: item.opacity,
    detachedUiBaseOpacity: 0.95,
    uiBlurIntensity: item.blur,
    chatMessageBlurFactor: 1,
    codeBlockOpacity: 0.9,
    enableWindowEffects: item.windowEffect !== "none",
    windowEffect: item.windowEffect,
    enableWindowBackgroundOpacity: item.windowOpacity < 1,
    windowBackgroundOpacity: item.windowOpacity,
    backgroundColorOpacity: item.windowOpacity,
    showWindowShadow: true,
    autoExtractColorFromWallpaper: false,
    autoExtractThemeColorFromWallpaper: false,
    backgroundColorOverlayEnabled: false,
  };
}
