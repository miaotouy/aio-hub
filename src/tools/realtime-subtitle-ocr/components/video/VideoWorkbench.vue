<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="video-workbench" data-testid="rsocr-workbench">
    <!-- 顶部工具栏 -->
    <div class="video-workbench__toolbar">
      <div class="toolbar-left">
        <template v-if="source">
          <span
            class="video-name"
            data-testid="rsocr-file-name"
            :title="source.fileName"
            >{{ source.fileName }}</span
          >
          <span class="meta">{{ formatDuration(source.durationMs) }}</span>
          <span class="meta">{{ source.width }}×{{ source.height }}</span>
          <span
            class="meta"
            :class="{
              'meta--ok': ffmpegAvailable === true,
              'meta--error': ffmpegAvailable === false,
            }"
            >FFmpeg
            {{
              ffmpegAvailable === true
                ? "就绪"
                : ffmpegAvailable === false
                  ? "不可用"
                  : "待检查"
            }}</span
          >
        </template>
        <span v-else class="meta">本地视频 OCR</span>
      </div>

      <div class="toolbar-center">
        <el-progress
          v-if="isBusy || progress.phase === 'completed'"
          :percentage="Math.min(100, progress.percent)"
          :status="progressStatus"
          :show-text="false"
          style="width: 160px"
        />
        <span v-if="isBusy" class="progress-text">
          {{ phaseText }} {{ progress.percent.toFixed(0) }}%
        </span>
        <span v-if="progress.error" class="progress-error">{{
          progress.error
        }}</span>
      </div>

      <div class="toolbar-right">
        <el-button
          size="small"
          data-testid="rsocr-choose"
          :disabled="isBusy"
          @click="pickVideo"
        >
          <FolderOpen :size="14" class="btn-icon" />
          {{ source ? "重新选择" : "选择视频" }}
        </el-button>
        <el-button
          v-if="isBusy"
          size="small"
          type="danger"
          data-testid="rsocr-cancel"
          @click="cancel"
        >
          <Square :size="14" class="btn-icon" /> 取消识别
        </el-button>
        <el-button
          v-else
          size="small"
          type="primary"
          data-testid="rsocr-start"
          :disabled="!canStart || screen.isOcrPreparing.value"
          @click="startTask"
        >
          <Play :size="14" class="btn-icon" />
          {{ screen.isOcrPreparing.value ? "检查 OCR" : "开始识别" }}
        </el-button>
        <el-button
          size="small"
          data-testid="rsocr-subtitle-list"
          :disabled="!subtitles.length"
          @click="showList = true"
        >
          <List :size="14" class="btn-icon" /> 字幕列表
        </el-button>
        <el-button
          size="small"
          data-testid="rsocr-export-srt"
          :disabled="!subtitles.length"
          @click="onExportSrt"
        >
          <Download :size="14" class="btn-icon" /> 导出 SRT
        </el-button>
      </div>
    </div>

    <!-- 主体 -->
    <div class="video-workbench__body">
      <template v-if="source">
        <div class="video-workbench__monitor-col">
          <div class="video-workbench__monitor">
            <VideoMonitor
              ref="monitorRef"
              :src="videoUrl"
              v-model:roi="roi"
              :aspect-locked="roiAspectLocked"
              :mask-opacity="maskOpacity"
              :video-width="source.width"
              :video-height="source.height"
              :fps="source.fps ?? 30"
              :roi-locked="isBusy"
              @timeupdate="currentTimeMs = $event"
              @set-range-start="onSetRangeStart"
              @set-range-end="onSetRangeEnd"
            />
          </div>
          <RegionFilterPreview
            ref="previewRef"
            class="video-workbench__preview"
            :capture="captureVideoSource"
            :get-rect="videoRect"
            :refresh-key="JSON.stringify(roi)"
            show-apply-actions
            :can-apply="!!activeSubtitle"
            @apply-text="onPreviewApplyText"
            @insert-text="onPreviewInsertText"
          />
        </div>

        <div class="video-workbench__inspector">
          <el-tabs v-model="inspectorTab" class="inspector-tabs">
            <el-tab-pane label="识别设置" name="settings">
              <div class="inspector-settings" :class="{ 'is-locked': isBusy }">
                <div v-if="isBusy" class="inspector-settings__lock">
                  <Lock :size="12" />
                  <span>识别进行中，参数已锁定</span>
                </div>
                <div class="inspector-settings__body" :inert="isBusy">
                  <MonitorConfig class="inspector-config" />
                  <div class="roi-mask-control">
                    <span>ROI 外遮罩</span
                    ><el-slider
                      v-model="maskOpacity"
                      :min="0"
                      :max="0.9"
                      :step="0.05"
                      show-input
                      size="small"
                    /><span class="roi-mask-control__value"
                      >{{ Math.round(maskOpacity * 100) }}%</span
                    >
                  </div>
                  <RoiNumberPanel
                    v-model="roi"
                    v-model:aspect-locked="roiAspectLocked"
                    :video-width="source.width"
                    :video-height="source.height"
                  />
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="字幕编辑" name="subtitle">
              <ActiveSubtitleEditor
                :active-subtitle="activeSubtitle"
                :active-subtitle-index="activeIndex"
                @update-text="onUpdateSubtitleText"
                @finish="onEditorFinish"
              />
            </el-tab-pane>
          </el-tabs>
        </div>
      </template>

      <div
        v-else
        class="video-workbench__empty"
        data-testid="rsocr-empty-workbench"
      >
        <div class="empty-monitor" aria-label="视频监视器预览">
          <div class="empty-monitor__topbar">
            <span>SOURCE MONITOR</span
            ><span class="empty-monitor__status">NO MEDIA</span>
          </div>
          <div class="empty-monitor__stage">
            <div class="empty-monitor__crosshair"></div>
            <div class="empty-monitor__message">
              <div class="empty-monitor__glyph">+</div>
              <strong>载入素材开始工作</strong>
              <span>视频会显示在这里，随后可定位、裁剪 ROI 和预览滤镜</span>
              <DropZone
                data-testid="rsocr-dropzone"
                :accept="videoExtensions"
                :multiple="false"
                file-only
                clickable
                variant="border"
                placeholder="拖入视频文件，或点击选择"
                drag-overlay-text="松开以加载视频"
                @drop="onVideoDrop"
                @error="onError"
              />
            </div>
          </div>
          <div class="empty-monitor__controls">
            <span class="skeleton skeleton--time"></span
            ><span class="skeleton skeleton--line"></span
            ><span class="skeleton skeleton--short"></span>
          </div>
        </div>
        <aside class="empty-inspector" aria-label="检查器预览">
          <div class="empty-inspector__tabs">
            <span class="is-active">识别设置</span><span>字幕编辑</span>
          </div>
          <div class="empty-inspector__body">
            <span class="empty-inspector__eyebrow">WORKBENCH INSPECTOR</span
            ><strong>素材载入后可用</strong
            ><span>引擎、滤镜、识别区域和字幕属性会集中在这里。</span>
          </div>
        </aside>
      </div>
    </div>

    <!-- 时间轴 -->
    <div v-if="source" class="video-workbench__timeline-wrap">
      <div
        class="resize-trigger-y"
        :class="{ 'is-resizing': isDraggingTimeline }"
        @mousedown="handleTimelineDragStart"
      >
        <div class="resize-handle-line"></div>
      </div>
      <div
        class="video-workbench__timeline"
        :style="{ height: timelineHeight + 'px' }"
      >
        <TimelineEditor
          :subtitles="subtitles"
          :duration-ms="source.durationMs"
          :current-time-ms="currentTimeMs"
          :range-start-ms="startMs"
          :range-end-ms="endMs"
          :selected-id="selectedId"
          @seek="onTimelineSeek"
          @select="onSelect"
          @update-subtitle="onUpdateSubtitle"
          @update-range="onUpdateRange"
          @edit="onEditSubtitle"
          @delete="onDeleteSubtitle"
          @split="onSplitSubtitle"
          @merge="onMergeSubtitles"
        />
      </div>
    </div>

    <el-drawer
      v-model="showList"
      title="字幕列表"
      direction="rtl"
      size="460px"
      :with-header="true"
    >
      <SubtitleTimeline
        :subtitles="subtitles"
        @remove="onListRemove"
        @update-text="onListUpdateText"
        @export-srt="onExportSrt"
        @copy-all="onListCopy"
        @send-to-chat="onListSend"
        @select="onListSelect"
        @clear-all="onListClear"
      />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  ElButton,
  ElDrawer,
  ElMessageBox,
  ElProgress,
  ElTabPane,
  ElTabs,
} from "element-plus";
import {
  Download,
  FolderOpen,
  List,
  Lock,
  Play,
  Square,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { useSendToChat } from "@/composables/useSendToChat";
import DropZone from "@/components/common/DropZone.vue";
import { useResizable } from "@/composables/useResizable";
import VideoMonitor from "./VideoMonitor.vue";
import RegionFilterPreview from "../common/RegionFilterPreview.vue";
import MonitorConfig from "../MonitorConfig.vue";
import RoiNumberPanel from "./RoiNumberPanel.vue";
import ActiveSubtitleEditor from "../ActiveSubtitleEditor.vue";
import TimelineEditor from "./timeline/TimelineEditor.vue";
import SubtitleTimeline from "../SubtitleTimeline.vue";
import { useVideoSubtitleOcr } from "../../composables/useVideoSubtitleOcr";
import {
  useScreenMonitor,
  useSubtitleTimeline,
} from "../../composables/useScreenMonitor";
import { videoRoiToPixels } from "../../utils/video";
import type { CaptureSource } from "../../utils/frameCapture";
import type { SubtitleEntry } from "../../types";

const videoExtensions = [
  ".mp4",
  ".mkv",
  ".webm",
  ".avi",
  ".mov",
  ".flv",
  ".m4v",
];

const video = useVideoSubtitleOcr();
const {
  source,
  roi,
  startMs,
  endMs,
  status,
  progress,
  ffmpegAvailable,
  canStart,
} = video;
const screen = useScreenMonitor();
const { subtitles } = screen;
const timeline = useSubtitleTimeline();

const monitorRef = ref<InstanceType<typeof VideoMonitor> | null>(null);
const previewRef = ref<InstanceType<typeof RegionFilterPreview> | null>(null);
const currentTimeMs = ref(0);
const selectedId = ref<string | null>(null);
const inspectorTab = ref("settings");
const showList = ref(false);
const roiAspectLocked = ref(false);
const maskOpacity = ref(0.5);

const { sendToChat } = useSendToChat();

const videoUrl = computed(() =>
  source.value ? convertFileSrc(source.value.path) : ""
);

const isBusy = computed(() =>
  ["preparing", "running", "cancelling"].includes(status.value)
);
const progressStatus = computed(() =>
  progress.value.phase === "error"
    ? "exception"
    : progress.value.phase === "completed"
      ? "success"
      : undefined
);
const phaseText = computed(
  () =>
    ({
      extracting: "抽取视频帧",
      ocr: "识别字幕",
      completed: "识别完成",
      cancelled: "已取消",
      error: "处理失败",
    })[progress.value.phase] ?? "等待开始"
);

const activeIndex = computed(() => {
  if (!subtitles.value.length) return -1;
  if (!selectedId.value) return subtitles.value.length - 1;
  const idx = subtitles.value.findIndex((s) => s.id === selectedId.value);
  return idx !== -1 ? idx : subtitles.value.length - 1;
});
const activeSubtitle = computed(() => {
  const idx = activeIndex.value;
  return idx === -1 ? null : subtitles.value[idx];
});

// 时间轴高度可拖拽
const timelineHeight = ref(150);
const { isResizing: isDraggingTimeline, startResize: handleTimelineDragStart } =
  useResizable({
    size: timelineHeight,
    minSize: 100,
    maxSize: 420,
    direction: "bottom",
  });

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

async function pickVideo() {
  if (isBusy.value) return;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "视频",
          extensions: videoExtensions.map((ext) => ext.slice(1)),
        },
      ],
    });
    if (typeof selected === "string") await video.selectVideo(selected);
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
  }
}

async function onVideoDrop(paths: string[]) {
  if (!paths[0]) return;
  try {
    await video.selectVideo(paths[0]);
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
  }
}

async function startTask() {
  try {
    await video.start();
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
  }
}

async function cancel() {
  await video.cancel();
}

async function captureVideoSource(): Promise<CaptureSource | null> {
  const element = monitorRef.value?.getVideoElement() ?? null;
  if (!element || !element.videoWidth) return null;
  // seek 刚设置 currentTime 时画面可能仍是旧帧，等目标帧真正呈现后再截图。
  await monitorRef.value?.waitForFrame();
  return element;
}

function videoRect(source: CaptureSource) {
  const element = source as HTMLVideoElement;
  return videoRoiToPixels(roi.value, element.videoWidth, element.videoHeight);
}

function onTimelineSeek(ms: number) {
  monitorRef.value?.seek(ms);
}

function onSelect(id: string) {
  selectedId.value = id;
}

function onEditSubtitle(id: string) {
  selectedId.value = id;
  inspectorTab.value = "subtitle";
}

function onUpdateSubtitle(
  id: string,
  patch: Partial<Pick<SubtitleEntry, "startMs" | "endMs">>
) {
  timeline.replaceSubtitle(id, patch);
}

function onUpdateRange(patch: { startMs?: number; endMs?: number }) {
  if (patch.startMs !== undefined) startMs.value = patch.startMs;
  if (patch.endMs !== undefined) endMs.value = patch.endMs;
}

function onSetRangeStart(ms: number) {
  startMs.value = Math.max(0, Math.min(ms, endMs.value - 1));
}

function onSetRangeEnd(ms: number) {
  const duration = source.value?.durationMs ?? ms;
  endMs.value = Math.max(startMs.value + 1, Math.min(ms, duration));
}

function onDeleteSubtitle(id: string) {
  timeline.removeSubtitle(id);
  if (selectedId.value === id) selectedId.value = null;
}

function onSplitSubtitle(id: string, atMs: number) {
  const newId = timeline.splitSubtitle(id, atMs);
  if (!newId) {
    customMessage.warning("拆分点需位于字幕内部");
    return;
  }
  selectedId.value = newId;
}

function onMergeSubtitles(ids: string[]) {
  const id = timeline.mergeSubtitles(ids);
  if (id) selectedId.value = id;
}

function onUpdateSubtitleText(id: string, text: string) {
  screen.updateSubtitleText(id, text);
}

/** 试识别结果填入当前选中/活动字幕。 */
function onPreviewApplyText(text: string) {
  if (!activeSubtitle.value) {
    customMessage.warning("请先选择一条字幕");
    return;
  }
  screen.updateSubtitleText(activeSubtitle.value.id, text);
  customMessage.success("已填入当前字幕");
}

/** 试识别结果在播放头处新增一条字幕。 */
function onPreviewInsertText(text: string) {
  const at = Math.round(currentTimeMs.value);
  const duration = source.value?.durationMs ?? at + 2000;
  const id = `subtitle-manual-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  timeline.addSubtitle({
    id,
    text,
    startMs: at,
    endMs: Math.max(at + 1, Math.min(duration, at + 2000)),
    status: "done",
  });
  selectedId.value = id;
  customMessage.success("已在播放头处新增字幕");
}

/** 编辑器保存/失焦后把键盘焦点交还监视器，恢复空格等快捷键。 */
function onEditorFinish() {
  monitorRef.value?.focus();
}

function onExportSrt() {
  if (!subtitles.value.length) {
    customMessage.warning("暂无字幕可导出");
    return;
  }
  screen.downloadSrt(`subtitles-${Date.now()}.srt`);
  customMessage.success("SRT 已导出");
}

// ===== 次级字幕列表（与轨道联动） =====
function onListSelect(id: string) {
  selectedId.value = id;
  const sub = subtitles.value.find((s) => s.id === id);
  if (sub) monitorRef.value?.seek(sub.startMs);
}

function onListRemove(id: string) {
  screen.removeSubtitle(id);
  if (selectedId.value === id) selectedId.value = null;
}

function onListUpdateText(id: string, text: string) {
  screen.updateSubtitleText(id, text);
}

function onListCopy(withTime: boolean) {
  const text = withTime
    ? screen.exportTextWithTime()
    : screen.exportPlainText();
  if (!text) {
    customMessage.warning("暂无字幕可复制");
    return;
  }
  navigator.clipboard
    .writeText(text)
    .then(() => customMessage.success("已复制全部字幕"))
    .catch(() => customMessage.error("复制失败"));
}

function onListSend(withTime: boolean) {
  const text = withTime
    ? screen.exportTextWithTime()
    : screen.exportPlainText();
  if (!text) {
    customMessage.warning("暂无字幕可发送");
    return;
  }
  sendToChat(text, { successMessage: "已发送字幕到聊天输入框" });
}

async function onListClear() {
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
    screen.clearSubtitles();
    selectedId.value = null;
    customMessage.success("已清空所有字幕");
  } catch {
    // 取消
  }
}

function onError(message: string) {
  customMessage.error(message);
}

// 暂停状态下拖动/跳转后刷新截图预览
watch(currentTimeMs, () => {
  if (!monitorRef.value?.isPlaying && previewRef.value) {
    previewRef.value.refreshIfActive();
  }
});

watch(
  () => source.value?.path,
  () => {
    selectedId.value = null;
    currentTimeMs.value = 0;
  }
);
</script>

<style scoped>
.video-workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 10px;
  padding: 10px;
  box-sizing: border-box;
  overflow: hidden;
}
.video-workbench__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 12px;
  background: var(--sidebar-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.toolbar-center {
  flex: 1;
  justify-content: center;
}
.video-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.meta--ok {
  color: var(--el-color-success);
}
.meta--error {
  color: var(--el-color-danger);
}
.progress-text {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.progress-error {
  font-size: 11px;
  color: var(--el-color-danger);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn-icon {
  margin-right: 4px;
}

.video-workbench__body {
  display: flex;
  gap: 10px;
  flex: 1;
  min-height: 0;
}
.video-workbench__monitor-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.video-workbench__monitor {
  flex: 1;
  min-height: 0;
}
.video-workbench__preview {
  flex-shrink: 0;
}
.video-workbench__inspector {
  width: 340px;
  flex-shrink: 0;
  min-height: 0;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.inspector-tabs {
  height: 100%;
  padding: 0 8px;
}
.inspector-tabs :deep(.el-tabs__content) {
  overflow: auto;
  height: calc(100% - 40px);
}
.inspector-config :deep(.monitor-config) {
  justify-content: flex-start;
}
.inspector-settings__body {
  transition: opacity 0.2s ease;
}
.inspector-settings.is-locked .inspector-settings__body {
  opacity: 0.55;
  pointer-events: none;
}
.inspector-settings__lock {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(var(--el-color-warning-rgb), 0.15);
  color: var(--el-color-warning);
  font-size: 11px;
}
.video-workbench__empty {
  flex: 1;
  display: flex;
  gap: 10px;
  min-height: 240px;
}
.empty-monitor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #101214;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}
.empty-monitor__topbar,
.empty-monitor__controls {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 30px;
  padding: 0 12px;
  color: var(--el-text-color-secondary);
  background: #17191c;
  font-size: 10px;
  letter-spacing: 0.08em;
}
.empty-monitor__status {
  margin-left: auto;
  color: #c98b4b;
}
.empty-monitor__stage {
  position: relative;
  flex: 1;
  min-height: 180px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: radial-gradient(
    circle at center,
    #20252a 0,
    #15181b 42%,
    #0d0f11 100%
  );
}
.empty-monitor__stage::before,
.empty-monitor__stage::after {
  content: "";
  position: absolute;
  background: rgba(255, 255, 255, 0.05);
}
.empty-monitor__stage::before {
  width: 1px;
  height: 100%;
}
.empty-monitor__stage::after {
  width: 100%;
  height: 1px;
}
.empty-monitor__crosshair {
  position: absolute;
  width: 18%;
  aspect-ratio: 16 / 9;
  border: 1px dashed rgba(255, 255, 255, 0.12);
}
.empty-monitor__message {
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 360px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
.empty-monitor__message strong {
  color: #e6e8eb;
  font-size: 14px;
  font-weight: 600;
}
.empty-monitor__message > span {
  font-size: 12px;
}
.empty-monitor__glyph {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  color: #d6a66c;
  font-size: 24px;
}
.empty-monitor__message :deep(.drop-zone) {
  width: min(360px, 80%);
  min-height: 64px;
  margin-top: 8px;
}
.empty-monitor__controls {
  height: 36px;
}
.skeleton {
  display: block;
  height: 4px;
  border-radius: 4px;
  background: #343a40;
}
.skeleton--time {
  width: 54px;
}
.skeleton--line {
  flex: 1;
}
.skeleton--short {
  width: 42px;
}
.empty-inspector {
  width: 340px;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}
@media (max-width: 900px) {
  .video-workbench__empty {
    flex-direction: column;
  }
  .empty-inspector {
    width: auto;
  }
}
.empty-inspector__tabs {
  display: flex;
  gap: 16px;
  height: 40px;
  align-items: end;
  padding: 0 14px;
  border-bottom: var(--border-width) solid var(--border-color);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.empty-inspector__tabs span {
  padding-bottom: 10px;
  white-space: nowrap;
}
.empty-inspector__tabs .is-active {
  color: var(--el-color-primary);
  border-bottom: 2px solid var(--el-color-primary);
}
.empty-inspector__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px 16px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.empty-inspector__body strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.empty-inspector__eyebrow {
  color: var(--el-text-color-placeholder);
  font-size: 10px;
  letter-spacing: 0.12em;
}

.video-workbench__timeline-wrap {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
.video-workbench__timeline {
  min-height: 0;
  overflow: hidden;
}
.resize-trigger-y {
  height: 8px;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: -4px 0;
  z-index: 10;
}
.resize-handle-line {
  width: 36px;
  height: 3px;
  border-radius: 1.5px;
  background: rgba(128, 128, 128, 0.4);
  transition:
    background 0.2s,
    width 0.2s;
}
.resize-trigger-y:hover .resize-handle-line,
.resize-trigger-y.is-resizing .resize-handle-line {
  background: var(--el-color-primary);
  width: 48px;
}

.roi-mask-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.roi-mask-control :deep(.el-slider) {
  flex: 1;
  min-width: 100px;
}
.roi-mask-control__value {
  width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
