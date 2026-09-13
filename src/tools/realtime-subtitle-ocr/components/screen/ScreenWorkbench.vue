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

<template>
  <div class="screen-workbench">
    <!-- 上方：左侧监视与滤镜区，右侧 OCR 配置区 -->
    <div
      class="screen-workbench__top"
      :style="{ height: topSectionHeight + 'px' }"
    >
      <!-- 左上：实时截图预览 + 区域滤镜预览（自适应堆叠/并排） -->
      <div
        ref="previewPanelRef"
        class="preview-panel preview-panel--screen"
        :class="{ 'is-row': screenPreviewLayout === 'row' }"
      >
        <LivePreview
          class="preview-panel__live"
          :last-frame-url="lastFrameUrl"
          :latency="latency"
          :filter-latency="filterLatency"
          :is-running="isRunning"
          :is-ocr-preparing="isOcrPreparing"
          :is-monitor-box-detached="isMonitorBoxDetached"
          :has-monitor-rect="!!monitorRect"
          @open-monitor-box="openMonitorBox"
          @close-monitor-box="closeMonitorBox"
          @focus-monitor-box="focusMonitorBox"
          @toggle-monitor="toggleMonitor"
        />
        <RegionFilterPreview
          class="preview-panel__filter"
          :capture="captureScreenSource"
          hint="打开监控框后点击「截图预览」，实时查看区域滤镜效果"
        />
      </div>

      <!-- 右上：OCR 与监控配置面板 -->
      <div class="config-panel">
        <div class="config-panel__header">
          <SettingsIcon :size="14" />
          <span>监控与识别设置</span>
        </div>
        <div class="config-panel__body">
          <MonitorConfig orientation="vertical" />
        </div>
      </div>
    </div>

    <!-- 拖拽条：拖动调整高度，双击复原默认高度 -->
    <ResizeHandle
      title="拖动调整高度，双击复原默认"
      :is-resizing="isDraggingHeight"
      @start="handleHeightDragStart"
      @reset="resetTopSectionHeight"
    />

    <!-- 下方：字幕时间轴列表 -->
    <div class="screen-workbench__bottom">
      <SubtitleTimeline
        :subtitles="subtitles"
        @remove="removeSubtitle"
        @update-text="updateSubtitleText"
        @export-srt="exportSrt"
        @copy-all="copyAll"
        @send-to-chat="sendToChat"
        @clear-all="clearAll"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Settings as SettingsIcon } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { useResizable } from "@/composables/useResizable";
import SubtitleTimeline from "../SubtitleTimeline.vue";
import LivePreview from "../LivePreview.vue";
import MonitorConfig from "../MonitorConfig.vue";
import RegionFilterPreview from "../common/RegionFilterPreview.vue";
import ResizeHandle from "../common/ResizeHandle.vue";
import { blobToCaptureSource, type CaptureSource } from "../../utils/frameCapture";
import { useScreenMonitor } from "../../composables/useScreenMonitor";
import { useMonitorBox } from "../../composables/useMonitorBox";
import { useSubtitleActions } from "../../composables/useSubtitleActions";

// ===== 上方区域高度拖拽调整 =====
/** 上方区域默认高度，双击拖拽条可复原到该值。 */
const DEFAULT_TOP_SECTION_HEIGHT = 340;
const topSectionHeight = ref(DEFAULT_TOP_SECTION_HEIGHT);
const {
  isResizing: isDraggingHeight,
  startResize: handleHeightDragStart,
  resetSize: resetHeightSize,
} = useResizable({
  size: topSectionHeight,
  minSize: 180,
  maxSize: 600,
  direction: "top",
});

/** 双击拖拽条复原默认高度。 */
function resetTopSectionHeight() {
  resetHeightSize(DEFAULT_TOP_SECTION_HEIGHT);
}

const {
  subtitles,
  timeline,
  status,
  isRunning,
  monitorRect,
  lastFrameUrl,
  latency,
  filterLatency,
  isOcrPreparing,
  ensureOcrReady,
  start,
  stop,
  captureOnce,
  removeSubtitle,
  updateSubtitleText,
} = useScreenMonitor();

const { isMonitorBoxDetached, openMonitorBox, closeMonitorBox, focusMonitorBox } =
  useMonitorBox();

const { copyAll, sendToChat, exportSrt, clearAll } =
  useSubtitleActions(timeline);

// ===== 左上监视与滤镜区自适应布局 =====
const previewPanelRef = ref<HTMLElement | null>(null);
const previewPanelWidth = ref(0);
let previewPanelObserver: ResizeObserver | null = null;

/**
 * 横向监控选区在上下堆叠时能保持较宽的画面比例；竖向选区则优先并排，
 * 避免两个预览各自被压扁。容器过窄时始终退回上下堆叠。
 */
const screenPreviewLayout = computed<"row" | "column">(() => {
  if (previewPanelWidth.value < 560) return "column";
  const rect = monitorRect.value;
  const isLandscape = !rect || rect.width >= rect.height;
  return isLandscape ? "column" : "row";
});

/** 屏幕模式：抓取监控框区域一次，供滤镜预览共用组件使用。 */
async function captureScreenSource(): Promise<CaptureSource | null> {
  const blob = await captureOnce();
  if (!blob) return null;
  return blobToCaptureSource(blob);
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

onMounted(() => {
  // 监控框几何信息由 useScreenMonitor 通过窗口同步总线接收。
  // 同时后台执行当前 OCR 引擎的健康检查/预热，确保用户直接开始识别时
  // 不会把首次运行时握手和模型检查堆积到实时帧队列中。
  void ensureOcrReady().catch(() => {
    // 启动按钮会再次检查并展示明确错误，这里仅做静默预热。
  });

  if (previewPanelRef.value) {
    previewPanelWidth.value = previewPanelRef.value.clientWidth;
    previewPanelObserver = new ResizeObserver((entries) => {
      previewPanelWidth.value = entries[0]?.contentRect.width ?? 0;
    });
    previewPanelObserver.observe(previewPanelRef.value);
  }
});

onBeforeUnmount(() => {
  previewPanelObserver?.disconnect();
  previewPanelObserver = null;
  if (isRunning.value) stop();
  // 监控框的关闭由 useMonitorBox 的 onBeforeUnmount 统一处理。
});
</script>

<style scoped>
.screen-workbench {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  gap: 12px;
}

.screen-workbench__top {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
  min-height: 180px;
}

.preview-panel {
  flex: 65;
  min-height: 0;
  min-width: 280px;
  height: 100%;
}

.preview-panel--screen {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-panel--screen.is-row {
  flex-direction: row;
}

.preview-panel__live {
  flex: 1.4;
  min-width: 0;
  min-height: 0;
}

.preview-panel__filter {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.config-panel {
  flex: 35;
  min-width: 280px;
  max-width: 420px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.config-panel__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--sidebar-bg);
  flex-shrink: 0;
}

.config-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.screen-workbench__bottom {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
