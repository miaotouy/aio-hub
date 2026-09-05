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
      :total="items.length"
      :eta-seconds="etaSeconds"
      @add-directory="addDirectory"
      @scan-path="scanDirectoryPath"
      @update:directory-path="directoryPath = $event"
      @clear-candidates="clearCandidates"
      @update:max-depth="maxDepth = $event"
      @update:thresholds="thresholds = $event"
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
import { ref, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
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
  DEFAULT_BRIGHTNESS_THRESHOLDS,
  makeCsv,
  matchesBatchFilter,
  type BatchImageCandidate,
  type BatchImageItem,
  type BatchArchiveMode,
  type BatchFilterState,
} from "./batchColorOrganizer";

type ArchiveDetail = {
  sourcePath: string;
  targetPath?: string;
  status: string;
  error?: string;
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
const etaSeconds = ref<number | null>(null);
const cancelled = ref(false);
const activeNames = ref<string[]>([]);

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

// 分析逻辑
async function startAnalyze() {
  analyzing.value = true;
  cancelled.value = false;
  completed.value = 0;
  etaSeconds.value = null;
  items.value = candidates.value.map((c) => ({
    ...c,
    status: "pending",
    selected: false,
  }));
  await processAnalysis(items.value);
  analyzing.value = false;
}

async function processAnalysis(queue: BatchImageItem[]) {
  const startedAt = performance.now();
  let nextIndex = 0;
  const worker = async () => {
    while (!cancelled.value && nextIndex < queue.length) {
      const index = nextIndex++;
      const item = queue[index];
      await analyzeItem(item);
      completed.value++;
      const elapsed = (performance.now() - startedAt) / 1000;
      const average = elapsed / completed.value;
      etaSeconds.value = Math.max(
        0,
        Math.ceil(average * (queue.length - completed.value))
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
}

async function analyzeItem(item: BatchImageItem) {
  item.status = "analyzing";
  activeNames.value = [...new Set([...activeNames.value, item.fileName])].slice(
    -4
  );
  try {
    const color = await sampleImage(item.path);
    item.averageColor = color.hex;
    item.luminance = color.luminance;
    item.colorFamily = (await import("./batchColorOrganizer")).classifyColor(
      color.r,
      color.g,
      color.b
    );
    item.brightnessLevel = (
      await import("./batchColorOrganizer")
    ).classifyBrightness(color.luminance, thresholds.value);
    item.status = "success";
    item.error = undefined;
  } catch (error) {
    item.status = "failed";
    item.error = error instanceof Error ? error.message : "图片解码失败";
    logger.warn("批量图片分析失败", { path: item.path, error: item.error });
  } finally {
    activeNames.value = activeNames.value.filter(
      (name) => name !== item.fileName
    );
  }
}

async function sampleImage(path: string) {
  const base64 = await invoke<string>("read_file_as_base64", { path });
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const blob = new Blob([bytes]);
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("图片格式不支持或文件损坏"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    const scale = Math.min(128 / image.width, 128 / image.height, 1);
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("无法读取图片像素");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let r = 0,
      g = 0,
      b = 0,
      weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255;
      if (alpha < 0.01) continue;
      r += data[i] * alpha;
      g += data[i + 1] * alpha;
      b += data[i + 2] * alpha;
      weight += alpha;
    }
    if (!weight) throw new Error("图片没有可见像素");
    r = Math.round(r / weight);
    g = Math.round(g / weight);
    b = Math.round(b / weight);
    const luminance = (
      await import("./batchColorOrganizer")
    ).calculateLuminance(r, g, b);
    return {
      r,
      g,
      b,
      hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
      luminance,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function retryFailed() {
  if (analyzing.value || failedItems.value.length === 0) return;
  analyzing.value = true;
  cancelled.value = false;
  failedItems.value.forEach((item) => {
    item.status = "pending";
    item.error = undefined;
  });
  completed.value = items.value.filter((c) => c.status === "success").length;
  await processAnalysis(failedItems.value);
  analyzing.value = false;
}

function cancelAnalyze() {
  cancelled.value = true;
}

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

function clearSelection() {
  items.value.forEach((item) => {
    item.selected = false;
  });
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
}

.main-content {
  flex: 3;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
}

@media (max-width: 1200px) {
  .batch-color-organizer {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
