import { createConfigManager } from "@/utils/configManager";
import { computed, reactive, watch, type Ref } from "vue";
import {
  createDefaultColorPoints,
  classifyColorCoordinate,
  colorCoordinate,
  prepareColorPoints,
  type ColorCoordinate,
  validateColorPoints,
  UNCLASSIFIED,
  type ColorFamilyPoint,
} from "./colorFamilyPoints";
export {
  createDefaultColorPoints,
  UNCLASSIFIED,
  type ColorFamilyPoint,
} from "./colorFamilyPoints";

import {
  DEFAULT_BRIGHTNESS_THRESHOLDS,
  clampThresholds,
  brightnessLevelsFor,
  type BatchBrightnessLevel,
} from "./brightnessThresholds";
import {
  defaultPresetState,
  normalizePresetState,
  type ClassificationPresetState,
} from "./classificationPresets";
export {
  DEFAULT_BRIGHTNESS_THRESHOLDS,
  BATCH_BRIGHTNESS_LEVELS,
  clampThresholds,
  brightnessLevelsFor,
  type BatchBrightnessLevel,
} from "./brightnessThresholds";
export type BatchColorFamily = string;
export type BatchArchiveMode = "copy" | "symlink";
export type BatchArchiveStructure =
  | "color_and_brightness"
  | "brightness_only"
  | "color_only"
  | "brightness_and_color";

export interface BatchArchiveStructureOption {
  value: BatchArchiveStructure;
  label: string;
  description: string;
  example: string;
}

export const BATCH_ARCHIVE_STRUCTURE_OPTIONS: readonly BatchArchiveStructureOption[] =
  [
    {
      value: "color_and_brightness",
      label: "色系 / 亮度",
      description:
        "在目标目录下按色系创建一级文件夹，并在其内按亮度创建二级文件夹",
      example: "目标目录/蓝/明亮/image.png",
    },
    {
      value: "brightness_only",
      label: "仅亮度",
      description: "在目标目录下直接按亮度等级分类",
      example: "目标目录/明亮/image.png",
    },
    {
      value: "color_only",
      label: "仅色系",
      description: "在目标目录下直接按色系分类",
      example: "目标目录/蓝/image.png",
    },
    {
      value: "brightness_and_color",
      label: "亮度 / 色系",
      description:
        "在目标目录下按亮度创建一级文件夹，并在其内按色系创建二级文件夹",
      example: "目标目录/明亮/蓝/image.png",
    },
  ] as const;

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

export interface BatchAnalysisItem extends BatchImageCandidate {
  averageColor?: string;
  luminance?: number;
  status: BatchAnalysisStatus;
  error?: string;
  thumbnailUrl?: string;
  archiveStatus?: string;
  targetPath?: string;
}

export interface BatchImageItem extends BatchAnalysisItem {
  colorFamilyId?: string;
  colorFamily?: string;
  brightnessLevel?: BatchBrightnessLevel;
  selected: boolean;
}

export interface AnalyzeItemResult {
  path: string;
  status: BatchAnalysisStatus;
  averageColor?: string | null;
  luminance?: number | null;
  error?: string | null;
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

export interface BatchColorOrganizerConfig extends ClassificationPresetState {
  version: string;
  directoryPath: string;
  maxDepth: number | null;
  thresholds: number[];
  colorPoints: ColorFamilyPoint[];
  archiveMode: BatchArchiveMode;
  archiveStructure: BatchArchiveStructure;
  targetDirectory: string;
}

export function createDefaultBatchOrganizerConfig(): BatchColorOrganizerConfig {
  return {
    ...defaultPresetState(),
    version: "3.0.0",
    directoryPath: "",
    maxDepth: 3,
    thresholds: [...DEFAULT_BRIGHTNESS_THRESHOLDS],
    colorPoints: createDefaultColorPoints(),
    archiveMode: "copy",
    archiveStructure: "color_and_brightness",
    targetDirectory: "",
  };
}

export function mergeBatchOrganizerConfig(
  defaults: BatchColorOrganizerConfig,
  loaded: Partial<BatchColorOrganizerConfig>
): BatchColorOrganizerConfig {
  const validated = validateColorPoints(loaded?.colorPoints);
  return {
    ...normalizePresetState(loaded),
    version: "3.0.0",
    directoryPath:
      typeof loaded?.directoryPath === "string"
        ? loaded.directoryPath
        : defaults.directoryPath,
    maxDepth:
      loaded?.maxDepth === null ||
      (Number.isInteger(loaded?.maxDepth) && loaded.maxDepth! >= 0)
        ? loaded.maxDepth!
        : defaults.maxDepth,
    thresholds: Array.isArray(loaded?.thresholds)
      ? (clampThresholds(
          loaded.thresholds
        ) as BatchColorOrganizerConfig["thresholds"])
      : defaults.thresholds,
    colorPoints: validated.points ?? createDefaultColorPoints(),
    archiveMode: loaded?.archiveMode === "symlink" ? "symlink" : "copy",
    archiveStructure: BATCH_ARCHIVE_STRUCTURE_OPTIONS.some(
      (option) => option.value === loaded?.archiveStructure
    )
      ? loaded.archiveStructure!
      : defaults.archiveStructure,
    targetDirectory:
      typeof loaded?.targetDirectory === "string"
        ? loaded.targetDirectory
        : defaults.targetDirectory,
  };
}

const batchConfigStorage = createConfigManager<BatchColorOrganizerConfig>({
  moduleName: "color-picker",
  fileName: "batch-organizer-config.json",
  version: "3.0.0",
  debounceDelay: 500,
  createDefault: createDefaultBatchOrganizerConfig,
  mergeConfig: mergeBatchOrganizerConfig,
});

// Serialize explicit and delayed writes. A stale autosave must never overwrite a saved preset.
let configSaveTimer: ReturnType<typeof setTimeout> | undefined;
let configSaveQueue: Promise<void> = Promise.resolve();
function saveBatchConfig(config: BatchColorOrganizerConfig): Promise<void> {
  clearTimeout(configSaveTimer);
  const snapshot = JSON.parse(
    JSON.stringify(config)
  ) as BatchColorOrganizerConfig;
  const pending = configSaveQueue.then(() => batchConfigStorage.save(snapshot));
  configSaveQueue = pending.catch(() => {});
  return pending;
}
export const batchOrganizerConfigManager = {
  load: () => batchConfigStorage.load(),
  save: saveBatchConfig,
  saveDebounced(
    config: BatchColorOrganizerConfig,
    onError: (error: unknown) => void = () => {}
  ) {
    clearTimeout(configSaveTimer);
    const snapshot = JSON.parse(
      JSON.stringify(config)
    ) as BatchColorOrganizerConfig;
    configSaveTimer = setTimeout(() => {
      void saveBatchConfig(snapshot).catch(onError);
    }, 500);
  },
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
  const [h, s] = rgbToHsl(r, g, b);
  return classifyColorCoordinate(
    colorCoordinate(h, s),
    prepareColorPoints(createDefaultColorPoints())
  ).name;
}

export function classifyBrightness(
  luminance: number,
  thresholds: readonly number[] = DEFAULT_BRIGHTNESS_THRESHOLDS
): BatchBrightnessLevel {
  const values = clampThresholds(thresholds);
  const index = values.findIndex((value) => luminance < value);
  return brightnessLevelsFor(values.length)[index < 0 ? values.length : index];
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
    (!!item.colorFamilyId && filter.colorFamilies.includes(item.colorFamilyId));
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
      const key = `${item.colorFamilyId}/${item.brightnessLevel}`;
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

// Classification is a pure projection of analysis data. Selection lives outside that projection.
export function useBatchClassification(
  source: Ref<BatchAnalysisItem[]>,
  points: Ref<ColorFamilyPoint[]>,
  thresholds: Ref<number[]>,
  filter: Ref<BatchFilterState>
) {
  const selectedPaths = reactive(new Set<string>());
  const sites = computed(() => prepareColorPoints(points.value));
  const coordinateCache = new WeakMap<
    BatchAnalysisItem,
    { color: string; coordinate: ColorCoordinate }
  >();
  const classifiedItems = computed<BatchImageItem[]>(() =>
    source.value.map((item) => {
      let family: { id: string; name: string } | undefined;
      let brightnessLevel: BatchBrightnessLevel | undefined;
      if (
        item.status === "success" &&
        item.averageColor &&
        Number.isFinite(item.luminance)
      ) {
        let cached = coordinateCache.get(item);
        if (!cached || cached.color !== item.averageColor) {
          const hex = item.averageColor.slice(1);
          const [h, s] = rgbToHsl(
            parseInt(hex.slice(0, 2), 16),
            parseInt(hex.slice(2, 4), 16),
            parseInt(hex.slice(4, 6), 16)
          );
          cached = {
            color: item.averageColor,
            coordinate: colorCoordinate(h, s),
          };
          coordinateCache.set(item, cached);
        }
        family = classifyColorCoordinate(cached.coordinate, sites.value);
        brightnessLevel = classifyBrightness(item.luminance!, thresholds.value);
      }
      return {
        ...item,
        colorFamilyId: family?.id,
        colorFamily: family?.name,
        brightnessLevel,
        get selected() {
          return selectedPaths.has(item.path);
        },
      };
    })
  );
  watch(
    points,
    () => {
      const validIds = new Set([
        ...points.value.map((rule) => rule.id),
        UNCLASSIFIED.id,
      ]);
      filter.value = {
        ...filter.value,
        colorFamilies: filter.value.colorFamilies.filter((id) =>
          validIds.has(id)
        ),
      };
    },
    { deep: true, flush: "sync" }
  );
  watch(
    () => thresholds.value.length,
    (count) => {
      const levels = brightnessLevelsFor(count);
      filter.value = {
        ...filter.value,
        brightnessLevels: filter.value.brightnessLevels.filter((level) =>
          levels.includes(level)
        ),
      };
    },
    { flush: "sync" }
  );
  const { filteredItems, groups } = useBatchFiltering(classifiedItems, filter);
  watch(
    filteredItems,
    (visible) => {
      const paths = new Set(visible.map((item) => item.path));
      for (const path of selectedPaths)
        if (!paths.has(path)) selectedPaths.delete(path);
    },
    { flush: "sync" }
  );
  const selectedItems = computed(() =>
    filteredItems.value.filter((item) => selectedPaths.has(item.path))
  );
  function setSelected(item: BatchImageItem, selected: boolean) {
    if (selected && matchesBatchFilter(item, filter.value))
      selectedPaths.add(item.path);
    else selectedPaths.delete(item.path);
  }
  return {
    classifiedItems,
    filteredItems,
    groups,
    selectedPaths,
    selectedItems,
    setSelected,
  };
}

export function createArchiveItems(
  items: BatchImageItem[]
): BatchOrganizeRequestItem[] {
  return items
    .filter(
      (item) =>
        item.status === "success" && item.colorFamily && item.brightnessLevel
    )
    .map((item) => ({
      sourcePath: item.path,
      fileName: item.fileName,
      colorFamily: item.colorFamily!,
      brightnessLevel: item.brightnessLevel!,
    }));
}

export function applyBatchAnalysisResults(
  itemsByPath: Map<string, BatchAnalysisItem>,
  results: AnalyzeItemResult[]
) {
  for (const result of results) {
    const item = itemsByPath.get(result.path);
    if (!item) continue;
    item.status = result.status;
    item.averageColor = result.averageColor ?? undefined;
    item.luminance = result.luminance ?? undefined;
    item.error = result.error ?? undefined;
  }
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
