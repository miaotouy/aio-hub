<template>
  <div class="batch-color-organizer">
    <!-- 左侧边栏：输入与配置 -->
    <BatchInputSidebar
      :candidate-count="candidates.length"
      :directory-path="directoryPath"
      :max-depth="maxDepth"
      :thresholds="thresholds"
      :analyzing="analyzing"
      :completed="completed"
      :total="analysisTotal"
      :eta-seconds="etaSeconds"
      @add-directory="addDirectory"
      @scan-path="scanDirectoryPath"
      @update:directory-path="directoryPath = $event"
      @clear-candidates="clearCandidates"
      @update:max-depth="maxDepth = $event"
      @update:thresholds="updateThresholds"
      @start-analyze="startAnalyze"
      @cancel-analyze="cancelAnalyze"
      @drop="handleDrop"
    />

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 工具栏 -->
      <BatchResultToolbar
        :filter="filter"
        :total-count="successCount"
        :filtered-count="filteredCount"
        :selected-count="selectedItems.length"
        :failed-count="failedItems.length"
        @update:filter="filter = $event"
        @select-filtered="selectFiltered"
        @invert-selection="invertSelection"
        @clear-selection="clearSelection"
        @export-csv="exportCsv"
        @export-json="exportJson"
        @retry-failed="retryFailed"
        @start-archive="archiveDialogVisible = true"
      />

      <!-- 结果网格 -->
      <BatchResultGrid
        :groups="groups"
        @preview="previewItem"
        @toggle-selection="toggleSelection"
        @toggle-group="toggleGroup"
        @select-group="selectGroup"
        @archive-group="archiveGroup"
        @archive-item="archiveItem"
      />
    </div>

    <!-- 归档弹窗 -->
    <ArchiveDialog
      v-model:visible="archiveDialogVisible"
      :selected-count="selectedItems.length"
      :target-directory="targetDirectory"
      :archive-mode="archiveMode"
      :preflight="preflight"
      :organizing="organizing"
      :archive-result="archiveResult"
      @update:target-directory="targetDirectory = $event"
      @update:archive-mode="archiveMode = $event"
      @choose-directory="chooseTargetDirectory"
      @organize="organize"
      @open-directory="openTargetDirectory"
      @clear-result="archiveResult = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useImageViewer } from "@/composables/useImageViewer";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import BatchInputSidebar from "./components/BatchInputSidebar.vue";
import BatchResultToolbar from "./components/BatchResultToolbar.vue";
import BatchResultGrid from "./components/BatchResultGrid.vue";
import ArchiveDialog from "./components/ArchiveDialog.vue";
import {
  clampThresholds,
  DEFAULT_BRIGHTNESS_THRESHOLDS,
  makeCsv,
  matchesBatchFilter,
  type BatchImageCandidate,
  type BatchImageItem,
  type BatchArchiveMode,
  type BatchFilterState,
  type BatchColorFamily,
  type BatchBrightnessLevel,
  type BatchAnalysisStatus,
} from "./batchColorOrganizer";

type ArchiveDetail = {
  sourcePath: string;
  targetPath?: string;
  status: string;
  error?: string;
};

type AnalyzeItemResult = {
  path: string;
  status: BatchAnalysisStatus;
  averageColor?: string;
  luminance?: number;
  colorFamily?: BatchColorFamily;
  brightnessLevel?: BatchBrightnessLevel;
  error?: string;
};

type AnalyzeProgress = {
  taskId: string;
  completedCount: number;
  totalCount: number;
  activeNames: string[];
  batchResults: AnalyzeItemResult[];
  done: boolean;
  cancelled: boolean;
};

const logger = createModuleLogger("color-picker/BatchColorOrganizer");
const errorHandler = createModuleErrorHandler(
  "color-picker/BatchColorOrganizer"
);
const { show: showImageViewer } = useImageViewer();

// 数据状态
const supported = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
  "tiff",
  "avif",
];
const candidates = ref<BatchImageCandidate[]>([]);
const directoryPath = ref("");
const items = ref<BatchImageItem[]>([]);
const maxDepth = ref<number | null>(3);
const thresholds = ref<[number, number, number, number]>([
  ...DEFAULT_BRIGHTNESS_THRESHOLDS,
]);
const filter = ref<BatchFilterState>({
  colorFamilies: [],
  brightnessLevels: [],
});

// 分析状态
const analyzing = ref(false);
const completed = ref(0);
const analysisTotal = ref(0);
const etaSeconds = ref<number | null>(null);
const cancelled = ref(false);
const activeNames = ref<string[]>([]);
const currentTaskId = ref<string>("");
let unlistenProgress: UnlistenFn | null = null;
let progressListenerReady: Promise<void> | null = null;
let disposed = false;
let analysisStartTime = 0;

// 归档状态
const archiveMode = ref<BatchArchiveMode>("copy");
const targetDirectory = ref("");
const organizing = ref(false);
const archiveDialogVisible = ref(false);
const preflight = ref<{
  loading: boolean;
  error: string;
  available?: number;
  required?: number;
  diskSufficient?: boolean;
  symlinkAllowed?: boolean;
}>({ loading: false, error: "" });
const archiveResult = ref<{
  successCount: number;
  renamedCount: number;
  failedCount: number;
  sourceNotFoundCount: number;
  details: ArchiveDetail[];
} | null>(null);

// 计算属性
const failedItems = computed(() =>
  items.value.filter((item) => item.status === "failed")
);
const successCount = computed(
  () => items.value.filter((item) => item.status === "success").length
);
const selectedItems = computed(() =>
  items.value.filter((item) => item.selected && item.status === "success")
);

const groups = computed(() => {
  const map = new Map<string, BatchImageItem[]>();
  items.value
    .filter(
      (item) =>
        item.status === "success" && matchesBatchFilter(item, filter.value)
    )
    .forEach((item) => {
      const key = `${item.colorFamily}/${item.brightnessLevel}`;
      const group = map.get(key) ?? [];
      group.push(item);
      map.set(key, group);
    });
  return [...map].map(([key, items]) => ({
    key,
    colorFamily: items[0].colorFamily!,
    brightnessLevel: items[0].brightnessLevel!,
    items,
  }));
});

const filteredCount = computed(() => {
  return items.value.filter(
    (item) =>
      item.status === "success" && matchesBatchFilter(item, filter.value)
  ).length;
});

function updateThresholds(values: number[]) {
  thresholds.value = clampThresholds(
    [...values].sort((left, right) => left - right)
  ) as [number, number, number, number];
}

async function scanDirectoryPath() {
  const path = directoryPath.value.trim();
  if (path) await scan([path]);
}

async function addDirectory() {
  const selected = await open({ directory: true, multiple: false });
  if (selected && typeof selected === "string") {
    directoryPath.value = selected;
    await scan([selected]);
  }
}

async function scan(roots: string[]) {
  const scanId = crypto.randomUUID();
  try {
    const result = await invoke<BatchImageCandidate[]>(
      "color_picker_scan_images",
      {
        request: {
          scanId,
          roots,
          maxDepth: maxDepth.value,
          extensions: supported,
        },
      }
    );
    const existing = new Set(candidates.value.map((c) => c.path));
    candidates.value.push(...result.filter((c) => !existing.has(c.path)));
    customMessage.success(`发现 ${result.length} 张图片`);
  } catch (error) {
    errorHandler.error(error, "扫描图片失败");
  }
}

function handleDrop(paths: string[]) {
  if (paths.length) {
    directoryPath.value = paths[0];
    void scan(paths);
  }
}

function clearCandidates() {
  candidates.value = [];
  items.value = [];
  archiveResult.value = null;
}

// Keep a path index so each progress batch only touches its own results.
const itemsByPath = computed(
  () => new Map(items.value.map((item) => [item.path, item]))
);

function applyAnalysisResults(results: AnalyzeItemResult[]) {
  for (const result of results) {
    const item = itemsByPath.value.get(result.path);
    if (!item) continue;
    item.status = result.status;
    item.averageColor = result.averageColor;
    item.luminance = result.luminance;
    item.colorFamily = result.colorFamily;
    item.brightnessLevel = result.brightnessLevel;
    item.error = result.error;
  }
}

// 分析逻辑
async function startAnalyze() {
  if (analyzing.value || candidates.value.length === 0) return;
  analyzing.value = true;
  cancelled.value = false;
  completed.value = 0;
  etaSeconds.value = null;
  analysisStartTime = performance.now();
  const taskId = crypto.randomUUID();
  currentTaskId.value = taskId;

  items.value = candidates.value.map((c) => ({
    ...c,
    status: "pending",
    selected: false,
    thumbnailUrl: toThumbnailUrl(c.path),
  }));
  analysisTotal.value = items.value.length;

  try {
    await ensureProgressListener();
    if (disposed || cancelled.value) return;
    const results = await invoke<AnalyzeItemResult[]>(
      "color_picker_analyze_images",
      {
        request: {
          taskId,
          paths: items.value.map((i) => i.path),
          thresholds: thresholds.value,
        },
      }
    );

    if (!disposed) {
      applyAnalysisResults(results);
      if (!cancelled.value) completed.value = analysisTotal.value;
    }
  } catch (error) {
    errorHandler.error(error, "批量分析失败");
  } finally {
    analyzing.value = false;
    currentTaskId.value = "";
    activeNames.value = [];
  }
}

async function retryFailed() {
  if (analyzing.value || failedItems.value.length === 0) return;
  analyzing.value = true;
  cancelled.value = false;
  completed.value = 0;
  etaSeconds.value = null;
  analysisStartTime = performance.now();
  const retryTargets = failedItems.value;
  retryTargets.forEach((item) => {
    item.status = "pending";
    item.error = undefined;
  });

  analysisTotal.value = retryTargets.length;
  const taskId = crypto.randomUUID();
  currentTaskId.value = taskId;

  try {
    await ensureProgressListener();
    if (disposed || cancelled.value) return;
    const results = await invoke<AnalyzeItemResult[]>(
      "color_picker_analyze_images",
      {
        request: {
          taskId,
          paths: retryTargets.map((i) => i.path),
          thresholds: thresholds.value,
        },
      }
    );

    if (!disposed) {
      applyAnalysisResults(results);
      if (!cancelled.value) completed.value = analysisTotal.value;
    }
  } catch (error) {
    errorHandler.error(error, "重试分析失败");
  } finally {
    analyzing.value = false;
    currentTaskId.value = "";
    activeNames.value = [];
  }
}

async function cancelAnalyze() {
  cancelled.value = true;
  if (currentTaskId.value) {
    try {
      await invoke("color_picker_cancel_analyze", {
        taskId: currentTaskId.value,
      });
    } catch (error) {
      logger.warn("取消分析任务失败", { error });
    }
  }
}

function ensureProgressListener(): Promise<void> {
  if (progressListenerReady) return progressListenerReady;
  progressListenerReady = listen<AnalyzeProgress>(
    "color_picker_analyze_progress",
    (event) => {
      if (disposed || event.payload.taskId !== currentTaskId.value) return;
      completed.value = event.payload.completedCount;
      analysisTotal.value = event.payload.totalCount;
      if (event.payload.activeNames?.length) {
        activeNames.value = event.payload.activeNames;
      }

      if (event.payload.completedCount > 0 && event.payload.totalCount > 0) {
        const elapsed = (performance.now() - analysisStartTime) / 1000;
        const avg = elapsed / event.payload.completedCount;
        etaSeconds.value = Math.max(
          0,
          Math.ceil(
            avg * (event.payload.totalCount - event.payload.completedCount)
          )
        );
      }

      applyAnalysisResults(event.payload.batchResults ?? []);
      if (event.payload.done) {
        activeNames.value = [];
        cancelled.value = event.payload.cancelled;
        etaSeconds.value = null;
      }
    }
  )
    .then((unlisten) => {
      if (disposed) unlisten();
      else unlistenProgress = unlisten;
    })
    .catch((error: unknown) => {
      progressListenerReady = null;
      throw error;
    });
  return progressListenerReady;
}

onUnmounted(() => {
  disposed = true;
  if (analyzing.value) void cancelAnalyze();
  unlistenProgress?.();
  unlistenProgress = null;
});

// 选择逻辑
function toggleSelection(item: BatchImageItem) {
  item.selected = !item.selected;
}

function toggleGroup(group: BatchImageItem[]) {
  const shouldSelect = !group.every((item) => item.selected);
  group.forEach((item) => {
    item.selected = shouldSelect;
  });
}

function selectGroup(groupItems: BatchImageItem[], select: boolean) {
  groupItems.forEach((item) => {
    item.selected = select;
  });
}

function archiveGroup(groupItems: BatchImageItem[]) {
  clearSelection();
  groupItems.forEach((item) => {
    item.selected = true;
  });
  archiveDialogVisible.value = true;
}

function archiveItem(item: BatchImageItem) {
  clearSelection();
  item.selected = true;
  archiveDialogVisible.value = true;
}

function selectFiltered() {
  items.value
    .filter(
      (item) =>
        item.status === "success" && matchesBatchFilter(item, filter.value)
    )
    .forEach((item) => {
      item.selected = true;
    });
}

function invertSelection() {
  items.value
    .filter(
      (item) =>
        item.status === "success" && matchesBatchFilter(item, filter.value)
    )
    .forEach((item) => {
      item.selected = !item.selected;
    });
}

function clearSelection() {
  items.value.forEach((item) => {
    item.selected = false;
  });
}

function toThumbnailUrl(path: string): string | undefined {
  try {
    return convertFileSrc(path);
  } catch (error) {
    logger.debug("生成图片预览地址失败", { path, error });
    return undefined;
  }
}

function previewItem(item: BatchImageItem) {
  void showImageViewer(item.path);
}

// 归档逻辑
async function chooseTargetDirectory() {
  const selected = await open({ directory: true, multiple: false });
  if (selected && typeof selected === "string")
    targetDirectory.value = selected;
}

async function runPreflight() {
  const selected = selectedItems.value;
  if (!targetDirectory.value || selected.length === 0) {
    preflight.value = { loading: false, error: "" };
    return;
  }
  const required = selected.reduce(
    (sum, item) => sum + (item.size || 0),
    100 * 1024 * 1024
  );
  preflight.value = { loading: true, error: "", required };
  try {
    if (archiveMode.value === "copy") {
      const result = await invoke<{ available: number; sufficient: boolean }>(
        "color_picker_check_disk_space",
        { targetDirectory: targetDirectory.value, requiredBytes: required }
      );
      preflight.value = {
        loading: false,
        error: "",
        required,
        available: result.available,
        diskSufficient: result.sufficient,
      };
    } else {
      const allowed = await invoke<boolean>(
        "color_picker_check_symlink_permission",
        {
          testDirectory: targetDirectory.value,
        }
      );
      preflight.value = {
        loading: false,
        error: "",
        required,
        symlinkAllowed: allowed,
      };
    }
  } catch (error) {
    preflight.value = {
      loading: false,
      error: error instanceof Error ? error.message : String(error),
      required,
    };
  }
}

async function organize() {
  organizing.value = true;
  try {
    const result = await invoke<NonNullable<typeof archiveResult.value>>(
      "color_picker_organize_images",
      {
        request: {
          items: selectedItems.value.map((item) => ({
            sourcePath: item.path,
            fileName: item.fileName,
            colorFamily: item.colorFamily,
            brightnessLevel: item.brightnessLevel,
          })),
          targetDirectory: targetDirectory.value,
          mode: archiveMode.value,
          checkSourceExists: true,
        },
      }
    );
    archiveResult.value = result;
    customMessage.success("归档处理完成");
  } catch (error) {
    errorHandler.error(error, "归档失败");
  } finally {
    organizing.value = false;
  }
}

async function openTargetDirectory() {
  try {
    await revealItemInDir(targetDirectory.value);
  } catch (error) {
    errorHandler.error(error, "打开目标目录失败");
  }
}

// 导出逻辑
async function exportCsv() {
  const path = await save({
    defaultPath: "color-analysis-report.csv",
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return;
  await writeTextFile(path, `﻿${makeCsv(items.value)}`);
  customMessage.success("CSV 报告已导出");
}

async function exportJson() {
  const path = await save({
    defaultPath: "color-analysis-report.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return;
  await writeTextFile(path, JSON.stringify(items.value, null, 2));
  customMessage.success("JSON 报告已导出");
}

// 监听归档配置变化，触发预检
watch(
  [selectedItems, targetDirectory, archiveMode],
  () => void runPreflight(),
  { deep: true }
);
</script>

<style scoped>
.batch-color-organizer {
  height: 100%;
  display: flex;
  gap: 16px;
  overflow: hidden;
  min-height: 0;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
}

@media (max-width: 768px) {
  .batch-color-organizer {
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .main-content {
    min-height: 480px;
    flex: none;
  }
}
</style>
