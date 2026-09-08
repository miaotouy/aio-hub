import {
  COLOR_FAMILY_PRESETS,
  createColorFamilyPreset,
  validateColorPoints,
  type ColorFamilyPoint,
} from "./colorFamilyPoints";
import {
  BRIGHTNESS_PRESETS,
  clampThresholds,
  validThresholds,
} from "./brightnessThresholds";
export interface PresetOption<T> {
  id: string;
  name: string;
  value: T;
}
export interface BrightnessPreset {
  id: string;
  name: string;
  thresholds: number[];
}
export interface CustomColorPreset {
  id: string;
  name: string;
  colorPoints: ColorFamilyPoint[];
}
export interface ClassificationPresetState {
  brightnessPresets: BrightnessPreset[];
  colorPresets: CustomColorPreset[];
  selectedBrightnessPreset: string | null;
  selectedColorPreset: string | null;
}
export const builtinBrightnessOptions: PresetOption<number[]>[] =
  BRIGHTNESS_PRESETS.map((p) => ({
    id: "builtin:" + p.id,
    name: p.name,
    value: p.thresholds,
  }));
export const builtinColorOptions: PresetOption<ColorFamilyPoint[]>[] =
  COLOR_FAMILY_PRESETS.map((p) => ({
    id: "builtin:" + p.id,
    name: p.name,
    value: createColorFamilyPreset(p.id),
  }));
export function defaultPresetState(): ClassificationPresetState {
  return {
    brightnessPresets: [],
    colorPresets: [],
    selectedBrightnessPreset: "builtin:five",
    selectedColorPreset: "builtin:common",
  };
}
export const clonePresetValue = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value));
export function presetNameError(name: string, names: string[]): string {
  return !name.trim()
    ? "请输入预设名称"
    : names.includes(name.trim())
      ? "已存在同名自定义预设"
      : "";
}
export function suggestPresetName(base: string, names: string[]): string {
  let name = base,
    index = 2;
  while (names.includes(name)) name = base + " " + index++;
  return name;
}
export function normalizePresetState(
  input: Partial<ClassificationPresetState>
): ClassificationPresetState {
  function records<T>(
    raw: unknown,
    parse: (r: Record<string, unknown>) => T | null
  ): T[] {
    if (!Array.isArray(raw)) return [];
    const ids = new Set<string>(),
      names = new Set<string>();
    return raw.flatMap((r) => {
      if (
        !r ||
        typeof r !== "object" ||
        typeof r.id !== "string" ||
        !r.id.startsWith("custom:") ||
        r.id.length <= 7 ||
        typeof r.name !== "string" ||
        !r.name.trim() ||
        ids.has(r.id) ||
        names.has(r.name.trim())
      )
        return [];
      const parsed = parse({ ...r, name: r.name.trim() });
      if (!parsed) return [];
      ids.add(r.id);
      names.add(r.name.trim());
      return [parsed];
    });
  }
  const brightnessPresets = records<BrightnessPreset>(
    input.brightnessPresets,
    (r) =>
      validThresholds(r.thresholds)
        ? {
            id: r.id as string,
            name: r.name as string,
            thresholds: clampThresholds(r.thresholds),
          }
        : null
  );
  const colorPresets = records<CustomColorPreset>(input.colorPresets, (r) => {
    const points = validateColorPoints(r.colorPoints).points;
    return points
      ? {
          id: r.id as string,
          name: r.name as string,
          colorPoints: clonePresetValue(points),
        }
      : null;
  });
  const resolve = (id: unknown, options: { id: string }[], fallback: string) =>
    id === undefined
      ? fallback
      : typeof id === "string" && options.some((p) => p.id === id)
        ? id
        : null;
  return {
    brightnessPresets,
    colorPresets,
    selectedBrightnessPreset: resolve(
      input.selectedBrightnessPreset,
      [...builtinBrightnessOptions, ...brightnessPresets],
      "builtin:five"
    ),
    selectedColorPreset: resolve(
      input.selectedColorPreset,
      [...builtinColorOptions, ...colorPresets],
      "builtin:common"
    ),
  };
}
