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
      <!-- 左上：实时原图 / 滤镜结果对比预览 -->
      <div class="preview-panel preview-panel--screen">
        <LivePreview
          class="preview-panel__live"
          :last-raw-frame-url="lastRawFrameUrl"
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
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Settings as SettingsIcon } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { useResizable } from "@/composables/useResizable";
import SubtitleTimeline from "../SubtitleTimeline.vue";
import LivePreview from "../LivePreview.vue";
import MonitorConfig from "../MonitorConfig.vue";
import ResizeHandle from "../common/ResizeHandle.vue";
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
  lastRawFrameUrl,
  latency,
  filterLatency,
  isOcrPreparing,
  ensureOcrReady,
  start,
  stop,
  removeSubtitle,
  updateSubtitleText,
} = useScreenMonitor();

const {
  isMonitorBoxDetached,
  openMonitorBox,
  closeMonitorBox,
  focusMonitorBox,
} = useMonitorBox();

const { copyAll, sendToChat, exportSrt, clearAll } =
  useSubtitleActions(timeline);

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
});

onBeforeUnmount(() => {
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
}

.preview-panel__live {
  flex: 1;
  min-width: 0;
  min-height: 0;
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
