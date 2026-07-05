<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ElMessageBox,
  ElInput,
  ElSelect,
  ElOption,
  ElSlider,
  ElPopover,
  ElButton,
} from "element-plus";
import { Settings as SettingsIcon } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { useResizable } from "@/composables/useResizable";
import { useDetachable } from "@/composables/useDetachable";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useOcrProfiles } from "@/tools/smart-ocr/platform";
import type { OcrEngineConfig } from "@/tools/smart-ocr/types";
import SubtitleTimeline from "./components/SubtitleTimeline.vue";
import LivePreview from "./components/LivePreview.vue";
import { useScreenMonitor } from "./composables/useScreenMonitor";
import { formatSrtTime } from "./utils/algorithms";
import type { DedupSensitivity } from "./types";

/** 监控框可分离组件 ID（与 registry.ts 中 detachableComponents 的 key 一致） */
const MONITOR_BOX_ID = "realtime-subtitle-ocr:monitor-box";
/** 监控框默认尺寸（逻辑像素） */
const MONITOR_BOX_DEFAULT_WIDTH = 360;
const MONITOR_BOX_DEFAULT_HEIGHT = 200;

const { detachByClick } = useDetachable();
const detachedManager = useDetachedManager();

// ===== 上方区域高度拖拽调整 =====
const topSectionHeight = ref(260);
const { isResizing: isDraggingHeight, startResize: handleHeightDragStart } =
  useResizable({
    size: topSectionHeight,
    minSize: 180,
    maxSize: 600,
    direction: "top",
  });

const {
  subtitles,
  status,
  isRunning,
  monitorRect,
  config,
  lastHash,
  lastFrameUrl,
  latency,
  start,
  stop,
  setEngineConfig,
  setIntervalMs,
  setDedupSensitivity,
  removeSubtitle,
  updateSubtitleText,
  exportPlainText,
  downloadSrt,
} = useScreenMonitor();

const { enabledProfiles } = useOcrProfiles();

const engineType = computed(() => config.value.engineConfig.type);
const activeProfileId = computed(() =>
  config.value.engineConfig.type === "cloud"
    ? config.value.engineConfig.activeProfileId
    : ""
);

function onEngineTypeChange(type: string) {
  let next: OcrEngineConfig;
  switch (type) {
    case "native":
      next = { type: "native", name: "native" };
      break;
    case "tesseract":
      next = { type: "tesseract", name: "tesseract", language: "chi_sim+eng" };
      break;
    case "vlm":
      next = {
        type: "vlm",
        name: "vlm",
        profileId: "",
        modelId: "",
        prompt: "请识别图片中的文字，仅输出识别结果。",
      };
      break;
    case "cloud":
      next = {
        type: "cloud",
        name: "cloud",
        activeProfileId: enabledProfiles.value[0]?.id ?? "",
      };
      break;
    default:
      return;
  }
  setEngineConfig(next);
}

function onProfileChange(id: string) {
  if (config.value.engineConfig.type !== "cloud") return;
  setEngineConfig({
    ...config.value.engineConfig,
    activeProfileId: id,
  });
}

const isMonitorBoxDetached = computed(() =>
  detachedManager.isDetached(MONITOR_BOX_ID)
);

const statusText = computed(() => {
  switch (status.value) {
    case "running":
      return "监控中";
    case "stopped":
      return "已停止";
    default:
      return "空闲";
  }
});

const selectedId = ref<string | null>(null);

const activeSubtitleIndex = computed(() => {
  if (!subtitles.value.length) return -1;
  if (!selectedId.value) return subtitles.value.length - 1;
  const idx = subtitles.value.findIndex((s) => s.id === selectedId.value);
  return idx !== -1 ? idx : subtitles.value.length - 1;
});

const activeSubtitle = computed(() => {
  const idx = activeSubtitleIndex.value;
  if (idx === -1) return null;
  return subtitles.value[idx];
});

function handleSelectSubtitle(id: string) {
  selectedId.value = id;
}

// ===== 当前字幕大字编辑框逻辑 =====
const localSubtitleText = ref("");
const editorInputRef = ref<any>(null);

watch(
  () => activeSubtitle.value,
  (newVal) => {
    localSubtitleText.value = newVal ? newVal.text : "";
    // 自动聚焦到大编辑框
    if (newVal) {
      setTimeout(() => {
        const textarea = editorInputRef.value?.$el?.querySelector("textarea");
        textarea?.focus();
      }, 50);
    }
  },
  { immediate: true }
);

function commitSubtitleEdit() {
  if (!activeSubtitle.value) return;
  updateSubtitleText(activeSubtitle.value.id, localSubtitleText.value);
  customMessage.success("字幕已保存");
}

function formatTime(ms: number): string {
  return formatSrtTime(ms);
}

/** 查找监控框分离窗口的 label */
function findMonitorBoxLabel(): string | undefined {
  for (const win of detachedManager.detachedWindows.value.values()) {
    if (win.id === MONITOR_BOX_ID) return win.label;
  }
  return undefined;
}

// ===== 监控框控制 =====
async function openMonitorBox() {
  if (isMonitorBoxDetached.value) {
    // 已分离则聚焦
    const label = findMonitorBoxLabel();
    if (label) await detachedManager.focusWindow(label);
    return;
  }

  // 通过统一分离体系创建监控框（type: "component" → 透明+置顶+无边框+可缩放）
  const success = await detachByClick({
    id: MONITOR_BOX_ID,
    displayName: "屏幕监控框",
    type: "component",
    width: MONITOR_BOX_DEFAULT_WIDTH,
    height: MONITOR_BOX_DEFAULT_HEIGHT,
  });

  if (!success) {
    customMessage.error("打开监控框失败");
    return;
  }

  // detachByClick 默认位置由后端窗口配置恢复决定；首次创建时定位到主窗口右侧
  try {
    const win = getCurrentWindow();
    const [pos, size, scaleFactor] = await Promise.all([
      win.outerPosition(),
      win.outerSize(),
      win.scaleFactor(),
    ]);
    const mainX = pos.x / scaleFactor;
    const mainY = pos.y / scaleFactor;
    const mainW = size.width / scaleFactor;
    let x = Math.round(mainX + mainW + 16);
    let y = Math.round(mainY + 80);
    if (x + MONITOR_BOX_DEFAULT_WIDTH > mainX + mainW + 400) {
      x = Math.round(mainX + 40);
      y = Math.round(mainY + 120);
    }
    const label = `detached-${MONITOR_BOX_ID}`;
    await invoke("set_window_position", { label, x, y, center: false });
  } catch {
    // ignore：定位失败不影响功能
  }
}

async function focusMonitorBox() {
  const label = findMonitorBoxLabel();
  if (label) {
    await detachedManager.focusWindow(label);
  } else {
    await openMonitorBox();
  }
}

async function toggleMonitor() {
  if (isRunning.value) {
    stop();
    customMessage.info("已停止监控");
  } else {
    await start();
    if (status.value === "running") customMessage.success("已开始监控");
  }
}

function onCopyAll() {
  const text = exportPlainText();
  if (!text) {
    customMessage.warning("暂无字幕可复制");
    return;
  }
  navigator.clipboard
    .writeText(text)
    .then(() => customMessage.success("已复制全部字幕"))
    .catch(() => customMessage.error("复制失败"));
}

function onExportSrt() {
  if (!subtitles.value.length) {
    customMessage.warning("暂无字幕可导出");
    return;
  }
  downloadSrt(`subtitles-${Date.now()}.srt`);
  customMessage.success("SRT 已导出");
}

async function clearAll() {
  try {
    await ElMessageBox.confirm(
      "确定要清空所有字幕吗？此操作不可撤销。",
      "提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    subtitles.value = [];
    selectedId.value = null;
    customMessage.success("已清空所有字幕");
  } catch {
    // 取消
  }
}

onMounted(() => {
  // 监控框几何信息由 useScreenMonitor 通过窗口同步总线接收
});

onBeforeUnmount(() => {
  if (isRunning.value) stop();
  // 关闭监控框（统一分离窗口关闭流程，触发 window-attached 回主窗口）
  detachedManager.closeWindow(MONITOR_BOX_ID).catch(() => {});
});
</script>

<template>
  <div class="rsocr-wrapper">
    <!-- 顶部工具栏 -->
    <div class="rsocr-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">实时字幕 OCR</span>
        <span class="status-badge" :class="status">
          {{ statusText }}
        </span>
      </div>
      <div class="toolbar-right">
        <!-- 采样频率 -->
        <div class="toolbar-item">
          <span class="toolbar-label">采样频率:</span>
          <el-slider
            :model-value="config.intervalMs"
            :min="500"
            :max="3000"
            :step="100"
            style="width: 100px"
            @update:model-value="setIntervalMs($event as number)"
          />
          <span class="toolbar-value"
            >{{ (config.intervalMs / 1000).toFixed(1) }}s</span
          >
        </div>

        <!-- 去重灵敏度 -->
        <div class="toolbar-item">
          <span class="toolbar-label">去重灵敏度:</span>
          <el-select
            :model-value="config.dedupSensitivity"
            size="small"
            style="width: 100px"
            @update:model-value="
              setDedupSensitivity($event as DedupSensitivity)
            "
          >
            <el-option label="高" value="high" />
            <el-option label="中" value="medium" />
            <el-option label="低" value="low" />
          </el-select>
        </div>

        <!-- OCR 引擎 -->
        <div class="toolbar-item">
          <span class="toolbar-label">OCR 引擎:</span>
          <el-select
            :model-value="engineType"
            size="small"
            style="width: 150px"
            @update:model-value="onEngineTypeChange"
          >
            <el-option label="Windows Native OCR" value="native" />
            <el-option label="Tesseract.js" value="tesseract" />
            <el-option label="VLM 多模态大模型" value="vlm" />
            <el-option label="云端 OCR" value="cloud" />
          </el-select>

          <!-- 引擎额外配置气泡 -->
          <el-popover
            v-if="engineType === 'cloud' || engineType === 'tesseract'"
            placement="bottom"
            title="引擎额外配置"
            :width="240"
            trigger="click"
          >
            <template #reference>
              <el-button size="small" circle style="margin-left: 4px">
                <SettingsIcon :size="14" />
              </el-button>
            </template>
            <div class="engine-popover-content">
              <div v-if="engineType === 'cloud'" class="popover-field">
                <label>云端 OCR 配置</label>
                <el-select
                  :model-value="activeProfileId"
                  size="small"
                  placeholder="选择已启用的云端 OCR 配置"
                  @update:model-value="onProfileChange"
                >
                  <el-option
                    v-for="p in enabledProfiles"
                    :key="p.id"
                    :label="p.name"
                    :value="p.id"
                  />
                </el-select>
                <div v-if="!enabledProfiles.length" class="popover-hint">
                  请先在 Smart OCR 中配置并启用云端 OCR 配置
                </div>
              </div>
              <div v-if="engineType === 'tesseract'" class="popover-field">
                <label>识别语言</label>
                <el-select
                  :model-value="
                    config.engineConfig.type === 'tesseract'
                      ? config.engineConfig.language
                      : 'chi_sim+eng'
                  "
                  size="small"
                  @update:model-value="
                    setEngineConfig({
                      ...config.engineConfig,
                      type: 'tesseract',
                      name: 'tesseract',
                      language: $event as string,
                    })
                  "
                >
                  <el-option label="简体中文 + 英文" value="chi_sim+eng" />
                  <el-option label="繁体中文 + 英文" value="chi_tra+eng" />
                  <el-option label="纯英文" value="eng" />
                  <el-option label="纯日文" value="jpn" />
                </el-select>
              </div>
            </div>
          </el-popover>
        </div>
      </div>
    </div>

    <!-- 主体区域：上下分栏 -->
    <div class="rsocr-main">
      <!-- 上方：左右分栏 (7:3 比例) -->
      <div
        class="rsocr-top-section"
        :style="{ height: topSectionHeight + 'px' }"
      >
        <!-- 左上：实时截图预览与控制区 (70% 宽度) -->
        <div class="preview-panel">
          <LivePreview
            :last-frame-url="lastFrameUrl"
            :last-hash="lastHash"
            :latency="latency"
            :is-running="isRunning"
            :is-monitor-box-detached="isMonitorBoxDetached"
            :monitor-rect="monitorRect"
            @open-monitor-box="openMonitorBox"
            @focus-monitor-box="focusMonitorBox"
            @toggle-monitor="toggleMonitor"
          />
        </div>

        <!-- 右上：当前字幕大字编辑框 (30% 宽度) -->
        <div class="editor-panel">
          <div class="editor-panel__header">
            <span class="editor-panel__title">当前字幕编辑</span>
            <span class="editor-panel__tip" v-if="activeSubtitle">
              正在编辑 #{{ activeSubtitleIndex + 1 }} ({{
                formatTime(activeSubtitle.startMs)
              }})
            </span>
          </div>
          <div class="editor-panel__body">
            <el-input
              ref="editorInputRef"
              v-model="localSubtitleText"
              type="textarea"
              :disabled="!activeSubtitle"
              placeholder="双击下方时间轴列表中的字幕，或等待最新识别结果在此处编辑。Ctrl+Enter 提交保存。"
              class="large-subtitle-input"
              @keydown.enter.ctrl.prevent="commitSubtitleEdit"
            />
          </div>
        </div>
      </div>

      <!-- 拖拽条 -->
      <div
        class="resize-trigger-y"
        :class="{ 'is-resizing': isDraggingHeight }"
        @mousedown="handleHeightDragStart"
      >
        <div class="resize-handle-line"></div>
      </div>

      <!-- 下方：字幕时间轴列表 -->
      <div class="rsocr-bottom-section">
        <SubtitleTimeline
          :subtitles="subtitles"
          @remove="removeSubtitle"
          @update-text="updateSubtitleText"
          @export-srt="onExportSrt"
          @copy-all="onCopyAll"
          @select="handleSelectSubtitle"
          @clear-all="clearAll"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.rsocr-wrapper {
  height: 100%;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--container-bg);
}

.rsocr-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
  background: var(--el-fill-color-darker);
  color: var(--el-text-color-secondary);
}

.status-badge.running {
  background: rgba(var(--el-color-success-rgb), 0.15);
  color: var(--el-color-success);
}

.status-badge.stopped {
  background: rgba(var(--el-color-danger-rgb), 0.15);
  color: var(--el-color-danger);
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.rsocr-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  gap: 12px;
}

.rsocr-top-section {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
  min-height: 180px;
}

.preview-panel {
  flex: 7;
  min-width: 320px;
  height: 100%;
}

.editor-panel {
  flex: 3;
  min-width: 200px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  box-sizing: border-box;
}

.editor-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.editor-panel__title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.editor-panel__tip {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.editor-panel__body {
  flex: 1;
  min-height: 0;
}

.large-subtitle-input {
  height: 100%;
}

.large-subtitle-input :deep(.el-textarea__inner) {
  height: 100% !important;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.6;
  padding: 12px;
  resize: none;
  background: var(--input-bg);
  border-color: var(--border-color);
}

.large-subtitle-input :deep(.el-textarea__inner:focus) {
  border-color: var(--el-color-primary);
}

.toolbar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.toolbar-label {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.toolbar-value {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  color: var(--el-text-color-primary);
  min-width: 28px;
}

.engine-popover-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.popover-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.popover-field > label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.popover-hint {
  font-size: 11px;
  color: var(--el-color-warning);
  line-height: 1.4;
}

.resize-trigger-y {
  height: 8px;
  cursor: row-resize;
  background: transparent;
  transition: background 0.2s;
  flex-shrink: 0;
  margin: -4px 0;
  z-index: 10;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.resize-handle-line {
  width: 36px;
  height: 3px;
  border-radius: 1.5px;
  background: rgba(128, 128, 128, 0.4);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  transition:
    background 0.2s,
    width 0.2s;
}

.resize-trigger-y:hover,
.resize-trigger-y.is-resizing {
  background: rgba(var(--el-color-primary-rgb), 0.1);
}

.resize-trigger-y:hover .resize-handle-line,
.resize-trigger-y.is-resizing .resize-handle-line {
  background: var(--el-color-primary);
  width: 48px;
}

.rsocr-bottom-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>

