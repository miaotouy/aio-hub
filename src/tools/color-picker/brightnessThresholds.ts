export const BATCH_BRIGHTNESS_LEVELS = [
  "极暗",
  "偏暗",
  "中等",
  "偏亮",
  "明亮",
] as const;
export type BatchBrightnessLevel = (typeof BATCH_BRIGHTNESS_LEVELS)[number];
export const DEFAULT_BRIGHTNESS_THRESHOLDS = [0.2, 0.4, 0.6, 0.8] as const;
export const BRIGHTNESS_PRESETS = [
  { id: "two", name: "两档明暗", thresholds: [0.5] },
  { id: "three", name: "三档均分", thresholds: [0.33, 0.67] },
  { id: "four", name: "四档均分", thresholds: [0.25, 0.5, 0.75] },
  {
    id: "five",
    name: "五档均分（默认）",
    thresholds: [...DEFAULT_BRIGHTNESS_THRESHOLDS],
  },
];
export function validThresholds(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 4 &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}
export function clampThresholds(input: readonly number[]): number[] {
  if (!validThresholds(input)) return [...DEFAULT_BRIGHTNESS_THRESHOLDS];
  const sorted = [...input].sort((a, b) => a - b);
  const result: number[] = [];
  sorted.forEach((value, index) => {
    const min = index ? result[index - 1] + 0.01 : 0.01;
    const max = 0.99 - (sorted.length - 1 - index) * 0.01;
    result.push(Number(Math.min(max, Math.max(min, value)).toFixed(2)));
  });
  return result;
}
export function brightnessLevelsFor(
  count: number
): readonly BatchBrightnessLevel[] {
  return count === 1
    ? ["偏暗", "明亮"]
    : count === 2
      ? ["偏暗", "中等", "明亮"]
      : count === 3
        ? ["极暗", "偏暗", "偏亮", "明亮"]
        : BATCH_BRIGHTNESS_LEVELS;
}
export function insertBrightnessThreshold(input: readonly number[]): {
  values: number[];
  index: number;
} {
  const values = clampThresholds(input);
  if (values.length >= 4) return { values, index: -1 };
  const edges = [0, ...values, 1];
  let index = 0;
  for (let i = 1; i < edges.length - 1; i++)
    if (edges[i + 1] - edges[i] > edges[index + 1] - edges[index] + 1e-9)
      index = i;
  values.splice(
    index,
    0,
    Number(((edges[index] + edges[index + 1]) / 2).toFixed(2))
  );
  return { values: clampThresholds(values), index };
}
