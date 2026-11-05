// Copyright 2025-2026 miaotouy(Github@miaotouy)
interface WindowEffectTarget {
  setBackgroundMaterial(
    material: "none" | "auto" | "mica" | "acrylic" | "tabbed"
  ): void;
  setBackgroundColor(color: string): void;
}
const materials = {
  none: "none",
  mica: "mica",
  acrylic: "acrylic",
  blur: "acrylic",
  tabbed: "tabbed",
  auto: "auto",
} as const;
/** Transparent component surfaces retain alpha when the global appearance is reapplied. */
export function applyWindowEffect(
  target: WindowEffectTarget,
  effect: string,
  transparent: boolean,
  platform: NodeJS.Platform
) {
  if (!Object.prototype.hasOwnProperty.call(materials, effect))
    throw Error("当前宿主暂未接入窗口材质 " + effect);
  if (transparent) {
    // Even DWM 'none' replaces the transparent compositor surface with an opaque backdrop.
    target.setBackgroundColor("#00000000");
    return;
  }
  if (platform === "win32")
    target.setBackgroundMaterial(materials[effect as keyof typeof materials]);
  else if (effect !== "none") throw Error("当前宿主暂未接入窗口材质 " + effect);
}
