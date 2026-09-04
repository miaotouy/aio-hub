import { computed, type Ref } from "vue";

export const BATCH_COLOR_FAMILIES = [
  "红",
  "橙",
  "黄",
  "绿",
  "青",
  "蓝",
  "紫",
  "粉",
  "棕",
  "灰",
] as const;
export const BATCH_BRIGHTNESS_LEVELS = [
  "极暗",
  "偏暗",
  "中等",
  "偏亮",
  "明亮",
] as const;
export const DEFAULT_BRIGHTNESS_THRESHOLDS = [0.2, 0.4, 0.6, 0.8] as const;

export type BatchColorFamily = (typeof BATCH_COLOR_FAMILIES)[number];
export type BatchBrightnessLevel = (typeof BATCH_BRIGHTNESS_LEVELS)[number];
export type BatchArchiveMode = "copy" | "symlink";
export type BatchAnalysisStatus =
  "pending" | "analyzing" | "success" | "failed";

export interface BatchImageCandidate {
  path: string;
  fileName: string;
  extension: string;
  size: number;
  modifiedAt?: number;
  isNetwork: boolean;
}

export interface BatchImageItem extends BatchImageCandidate {
  averageColor?: string;
  luminance?: number;
  colorFamily?: BatchColorFamily;
  brightnessLevel?: BatchBrightnessLevel;
  status: BatchAnalysisStatus;
  error?: string;
  selected: boolean;
  thumbnailUrl?: string;
  archiveStatus?: string;
  targetPath?: string;
}

export interface BatchFilterState {
  colorFamilies: BatchColorFamily[];
  brightnessLevels: BatchBrightnessLevel[];
}

export interface BatchOrganizeRequestItem {
  sourcePath: string;
  fileName: string;
  colorFamily: string;
  brightnessLevel: string;
}

export const clampThresholds = (thresholds: number[]): number[] => {
  const result: number[] = [];
  thresholds.slice(0, 4).forEach((value, index) => {
    const minimum = index === 0 ? 0.01 : result[index - 1] + 0.01;
    const maximum = index === 3 ? 0.99 : 0.99 - (3 - index) * 0.01;
    result.push(
      Math.min(
        maximum,
        Math.max(minimum, Number.isFinite(value) ? value : minimum)
      )
    );
  });
  while (result.length < 4)
    result.push(
      result.length ? Math.min(0.99, result[result.length - 1] + 0.2) : 0.2
    );
  return result;
};

export function rgbToHsl(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue =
    max === r
      ? (g - b) / delta + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  hue *= 60;
  return [hue, saturation, lightness];
}

export function classifyColor(
  r: number,
  g: number,
  b: number
): BatchColorFamily {
  const [hue, saturation, lightness] = rgbToHsl(r, g, b);
  if (saturation < 0.12) return "灰";
  if (hue < 15 || hue >= 345) return "红";
  if (hue < 42) return lightness < 0.35 ? "棕" : "橙";
  if (hue < 68) return "黄";
  if (hue < 165) return "绿";
  if (hue < 195) return "青";
  if (hue < 255) return "蓝";
  if (hue < 315) return "紫";
  return "粉";
}

export function classifyBrightness(
  luminance: number,
  thresholds: readonly number[] = DEFAULT_BRIGHTNESS_THRESHOLDS
): BatchBrightnessLevel {
  const [dark, dim, medium, bright] = clampThresholds([...thresholds]);
  if (luminance < dark) return "极暗";
  if (luminance < dim) return "偏暗";
  if (luminance < medium) return "中等";
  if (luminance < bright) return "偏亮";
  return "明亮";
}

export function calculateLuminance(r: number, g: number, b: number): number {
  const linear = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return Math.min(
    1,
    Math.max(0, 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b))
  );
}

export function matchesBatchFilter(
  item: BatchImageItem,
  filter: BatchFilterState
): boolean {
  if (item.status !== "success") return false;
  const colorMatches =
    filter.colorFamilies.length === 0 ||
    (!!item.colorFamily && filter.colorFamilies.includes(item.colorFamily));
  const brightnessMatches =
    filter.brightnessLevels.length === 0 ||
    (!!item.brightnessLevel &&
      filter.brightnessLevels.includes(item.brightnessLevel));
  return colorMatches && brightnessMatches;
}

export function useBatchFiltering(
  items: Ref<BatchImageItem[]>,
  filter: Ref<BatchFilterState>
) {
  const filteredItems = computed(() =>
    items.value.filter((item) => matchesBatchFilter(item, filter.value))
  );
  const groups = computed(() => {
    const map = new Map<string, BatchImageItem[]>();
    for (const item of filteredItems.value) {
      const key = `${item.colorFamily}/${item.brightnessLevel}`;
      const group = map.get(key) ?? [];
      group.push(item);
      map.set(key, group);
    }
    return [...map.entries()].map(([key, group]) => ({
      key,
      colorFamily: group[0].colorFamily!,
      brightnessLevel: group[0].brightnessLevel!,
      items: group,
    }));
  });
  return { filteredItems, groups };
}

export function makeCsv(items: BatchImageItem[]): string {
  const headers = [
    "fileName",
    "sourcePath",
    "averageColor",
    "luminance",
    "colorFamily",
    "brightnessLevel",
    "status",
    "targetPath",
    "error",
  ];
  const escape = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...items.map((item) =>
      [
        item.fileName,
        item.path,
        item.averageColor,
        item.luminance?.toFixed(4),
        item.colorFamily,
        item.brightnessLevel,
        item.archiveStatus ?? item.status,
        item.targetPath,
        item.error,
      ]
        .map(escape)
        .join(",")
    ),
  ].join("\r\n");
}
