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
  <div class="timeline-editor" data-testid="rsocr-timeline">
    <div class="timeline-editor__toolbar">
      <span class="timeline-editor__title">字幕轨道</span>
      <span class="timeline-editor__time">{{
        formatTimecode(currentTimeMs)
      }}</span>
      <span
        class="timeline-editor__hint"
        title="左键拖拽块移动 · 拖块边缘修剪 · 滚轮/Alt+滚轮横向滚动 · Ctrl+滚轮缩放 · 中键 或 Alt+左键拖拽平移 · 右键菜单"
        >拖拽移动 · 拖边修剪 · 滚轮/Alt+滚轮滚动 · Ctrl+滚轮缩放 · 中键/Alt+拖拽平移 · 右键菜单</span
      >
      <label
        class="timeline-editor__snap"
        title="拖拽时吸附到字幕边缘 / 播放头 / 识别区间端点"
      >
        <el-switch
          v-model="snapEnabled"
          size="small"
          data-testid="rsocr-timeline-snap"
        />
        <span>吸附</span>
      </label>
      <div class="timeline-editor__zoom">
        <el-button
          size="small"
          text
          title="缩小时间轴（Ctrl+滚轮）"
          @click="viewport.zoomBy(1 / 1.4, width / 2)"
        >
          <ZoomOut :size="14" />
        </el-button>
        <el-button
          size="small"
          text
          title="适配全长，显示整段时间轴"
          @click="fitAll"
        >
          适配全长
        </el-button>
        <el-button
          size="small"
          text
          title="放大时间轴（Ctrl+滚轮）"
          @click="viewport.zoomBy(1.4, width / 2)"
        >
          <ZoomIn :size="14" />
        </el-button>
      </div>
    </div>

    <div
      ref="hostRef"
      class="timeline-editor__canvas"
      :class="{ 'is-panning': isPanning }"
    >
      <div ref="stageRef" class="timeline-editor__stage"></div>
      <div
        v-if="dragTip.visible"
        class="timeline-editor__drag-tip"
        :style="{ left: `${dragTip.x}px`, top: `${RULER_H + 4}px` }"
      >
        <span class="timeline-editor__drag-tip-time">{{ dragTip.text }}</span>
        <span
          v-if="dragTip.delta !== null"
          class="timeline-editor__drag-tip-delta"
        >
          {{ formatDelta(dragTip.delta) }}
        </span>
      </div>
      <div
        v-if="contextMenu.visible"
        class="timeline-editor__context"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        @pointerdown.stop
        @contextmenu.prevent
      >
        <button type="button" @click="runContext('edit')">编辑</button>
        <button type="button" @click="runContext('split')">
          在播放头拆分
          <kbd class="timeline-editor__kbd">Ctrl+K</kbd>
        </button>
        <button
          type="button"
          :disabled="!contextMenu.nextId"
          @click="runContext('merge')"
        >
          与下一条合并
        </button>
        <button type="button" class="is-danger" @click="runContext('delete')">
          删除
        </button>
      </div>
    </div>

    <!-- 常驻横向滚动条：始终占位，内容不足时显示为整条，不挤动布局 -->
    <div
      ref="scrollbarRef"
      class="timeline-editor__scrollbar"
      :class="{ 'is-disabled': !canScroll }"
      @pointerdown="onScrollbarPointerDown"
    >
      <div
        class="timeline-editor__scrollbar-thumb"
        :style="scrollbarThumbStyle"
        @pointerdown.stop="onThumbPointerDown"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useElementSize, useLocalStorage } from "@vueuse/core";
import { ElButton } from "element-plus";
import { ZoomIn, ZoomOut } from "lucide-vue-next";
import Konva from "konva";
import type { SubtitleEntry } from "../../../types";
import { useTimelineViewport } from "../../../composables/useTimelineViewport";
import { snapRange, snapValue } from "../../../utils/timelineSnap";

const props = defineProps<{
  subtitles: SubtitleEntry[];
  durationMs: number;
  currentTimeMs: number;
  rangeStartMs: number;
  rangeEndMs: number;
  selectedId: string | null;
}>();

const emit = defineEmits<{
  seek: [ms: number];
  select: [id: string];
  "update-subtitle": [
    id: string,
    patch: Partial<Pick<SubtitleEntry, "startMs" | "endMs">>,
  ];
  "update-range": [patch: { startMs?: number; endMs?: number }];
  edit: [id: string];
  delete: [id: string];
  split: [id: string, atMs: number];
  merge: [ids: string[]];
}>();

const contextMenu = reactive<{
  visible: boolean;
  x: number;
  y: number;
  id: string;
  nextId: string | null;
  clickMs: number;
}>({
  visible: false,
  x: 0,
  y: 0,
  id: "",
  nextId: null,
  clickMs: 0,
});

function hideContextMenu() {
  contextMenu.visible = false;
}

/** 拖拽时浮层提示：当前时间与吸附差量 */
const dragTip = reactive<{
  visible: boolean;
  x: number;
  text: string;
  delta: number | null;
}>({ visible: false, x: 0, text: "", delta: null });

function hideDragTip() {
  dragTip.visible = false;
  dragTip.delta = null;
}

function showDragTip(ms: number, delta: number | null) {
  const rawX = viewport.timeToX(ms);
  const clampedX = Math.max(24, Math.min(width.value - 24, rawX));
  dragTip.visible = true;
  dragTip.x = clampedX;
  dragTip.text = formatTimecode(ms);
  dragTip.delta = delta;
}

function formatDelta(delta: number | null): string {
  if (delta === null) return "";
  const rounded = Math.round(delta);
  return `${rounded >= 0 ? "+" : ""}${rounded}ms`;
}

const SNAP_SCREEN_PX = 7;

/** 吸附开关由用户控制，关闭后拖拽完全自由，避免强制吸附。 */
const snapEnabled = useLocalStorage("rsocr:timeline-snap", true);

function snapThresholdMs(): number {
  return (SNAP_SCREEN_PX / viewport.pxPerSecond.value) * 1000;
}

/** 按当前开关对单个时间值做吸附，返回吸附值与差量。 */
function applySnap(
  value: number,
  targets: number[]
): { value: number; delta: number | null } {
  if (!snapEnabled.value) return { value, delta: null };
  const result = snapValue(value, targets, snapThresholdMs());
  return { value: result.value, delta: result.deltaMs };
}

/** 收集吸附目标：边界、播放头、识别区间端点与其它字幕边缘。 */
function collectSnapTargets(excludeId?: string): number[] {
  const targets = [
    0,
    props.durationMs,
    props.currentTimeMs,
    props.rangeStartMs,
    props.rangeEndMs,
  ];
  for (const subtitle of props.subtitles) {
    if (subtitle.id === excludeId) continue;
    targets.push(subtitle.startMs, subtitle.endMs);
  }
  return targets;
}

const RULER_H = 22;
const TRACK_H = 58;
const TOTAL_H = RULER_H + TRACK_H;
const HANDLE_HIT = 6;
const MIN_SUBTITLE_MS = 1;

const hostRef = ref<HTMLDivElement | null>(null);
const stageRef = ref<HTMLDivElement | null>(null);
const { width } = useElementSize(hostRef);

const durationRef = computed(() => props.durationMs);
const viewport = useTimelineViewport(durationRef);

let stage: Konva.Stage | null = null;
let rulerLayer: Konva.Layer | null = null;
let trackLayer: Konva.Layer | null = null;
let overlayLayer: Konva.Layer | null = null;
let rafId = 0;
let hasFitted = false;

const TICK_STEPS = [
  0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
];

function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const msPart = Math.floor(ms % 1000);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msPart).padStart(3, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msPart).padStart(3, "0")}`;
}

function tickLabel(seconds: number, step: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const sub = step < 1 ? `.${Math.round((seconds % 1) * 10)}` : "";
  const base = h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${base}${sub}`;
}

function visibleSubtitles(): SubtitleEntry[] {
  const startTime = viewport.xToTime(-40);
  const endTime = viewport.xToTime(width.value + 40);
  return props.subtitles.filter(
    (s) => s.endMs >= startTime && s.startMs <= endTime
  );
}

function drawRuler() {
  if (!rulerLayer) return;
  rulerLayer.destroyChildren();
  const w = width.value;
  rulerLayer.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: RULER_H,
      fill: "#1f1f24",
    })
  );
  const pps = viewport.pxPerSecond.value;
  const step =
    TICK_STEPS.find((s) => s * pps >= 70) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const stepMs = step * 1000;
  const startMs = Math.max(
    0,
    Math.floor(viewport.xToTime(0) / stepMs) * stepMs
  );
  const endMs = Math.min(props.durationMs, viewport.xToTime(w));
  for (let ms = startMs; ms <= endMs; ms += stepMs) {
    const x = viewport.timeToX(ms);
    rulerLayer.add(
      new Konva.Line({
        points: [x, RULER_H - 7, x, RULER_H],
        stroke: "#4a4a55",
        strokeWidth: 1,
      })
    );
    const label = new Konva.Text({
      x: x + 3,
      y: 3,
      text: tickLabel(ms / 1000, step),
      fontSize: 10,
      fill: "#9a9aa5",
      listening: false,
    });
    rulerLayer.add(label);
  }
  rulerLayer.batchDraw();
}

function drawTrack() {
  if (!trackLayer) return;
  trackLayer.destroyChildren();
  const w = width.value;
  trackLayer.add(
    new Konva.Rect({
      x: 0,
      y: RULER_H,
      width: w,
      height: TRACK_H,
      fill: "#15151a",
    })
  );
  for (const sub of visibleSubtitles()) {
    const x = viewport.timeToX(sub.startMs);
    const x2 = viewport.timeToX(sub.endMs);
    const blockW = Math.max(3, x2 - x);
    const selected = sub.id === props.selectedId;
    const isError = sub.status === "error";
    const isPending = sub.status === "pending" || sub.status === "processing";
    trackLayer.add(
      new Konva.Rect({
        x,
        y: RULER_H + 6,
        width: blockW,
        height: TRACK_H - 12,
        fill: isError
          ? "rgba(245, 108, 108, 0.35)"
          : selected
            ? "rgba(64, 158, 255, 0.55)"
            : "rgba(64, 158, 255, 0.28)",
        stroke: selected ? "#409eff" : "rgba(64, 158, 255, 0.7)",
        strokeWidth: selected ? 2 : 1,
        cornerRadius: 3,
      })
    );
    if (blockW > 24) {
      trackLayer.add(
        new Konva.Text({
          x: x + 5,
          y: RULER_H + 12,
          width: blockW - 10,
          height: TRACK_H - 24,
          text: isPending ? "识别中…" : sub.text || "(空)",
          fontSize: 11,
          lineHeight: 1.3,
          fill: "#e6e6eb",
          wrap: "none",
          ellipsis: true,
          listening: false,
        })
      );
    }
  }
  trackLayer.batchDraw();
}

function drawOverlay() {
  if (!overlayLayer) return;
  overlayLayer.destroyChildren();
  const w = width.value;

  // 识别区间
  const rangeX1 = Math.max(0, viewport.timeToX(props.rangeStartMs));
  const rangeX2 = Math.min(w, viewport.timeToX(props.rangeEndMs));
  if (rangeX2 > rangeX1) {
    overlayLayer.add(
      new Konva.Rect({
        x: rangeX1,
        y: RULER_H,
        width: rangeX2 - rangeX1,
        height: TRACK_H,
        fill: "rgba(103, 194, 58, 0.10)",
        listening: false,
      })
    );
  }
  for (const x of [rangeX1, rangeX2]) {
    overlayLayer.add(
      new Konva.Rect({
        x: x - 4,
        y: RULER_H,
        width: 8,
        height: TRACK_H,
        fill: "#67c23a",
        cornerRadius: 2,
      })
    );
  }

  // 播放头
  const playX = viewport.timeToX(props.currentTimeMs);
  if (playX >= -1 && playX <= w + 1) {
    overlayLayer.add(
      new Konva.Line({
        points: [playX, 0, playX, TOTAL_H],
        stroke: "#f56c6c",
        strokeWidth: 1.5,
        listening: false,
      })
    );
  }
  overlayLayer.batchDraw();
}

function redraw() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    if (!stage) return;
    if (stage.width() !== width.value) stage.width(width.value);
    drawRuler();
    drawTrack();
    drawOverlay();
  });
}

function fitAll() {
  if (props.durationMs > 0) {
    viewport.fit(props.durationMs);
    hasFitted = true;
  }
  redraw();
}

// ===== 指针交互 =====
type DragKind =
  | "scrub"
  | "move"
  | "trimStart"
  | "trimEnd"
  | "rangeStart"
  | "rangeEnd"
  | "pan";

interface DragState {
  kind: DragKind;
  id?: string;
  startClientX: number;
  originStart: number;
  originEnd: number;
  originScrollX?: number;
}

let drag: DragState | null = null;
/** 平移时切换抓取光标，提升拖拽手感。 */
const isPanning = ref(false);

function pointerPos(event: PointerEvent): { x: number; y: number } {
  const rect = hostRef.value?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function findBlock(time: number): SubtitleEntry | undefined {
  return visibleSubtitles().find(
    (s) => time >= s.startMs - 20 && time <= s.endMs + 20
  );
}

function onPointerDown(event: PointerEvent) {
  hideContextMenu();
  // 中键 / Alt+左键：平移视口；即使指针落在字幕块上也优先平移，避免左键被块“吃掉”。
  if (event.button === 1 || (event.button === 0 && event.altKey)) {
    event.preventDefault();
    isPanning.value = true;
    drag = {
      kind: "pan",
      startClientX: event.clientX,
      originStart: 0,
      originEnd: 0,
      originScrollX: viewport.scrollX.value,
    };
    bindMove();
    return;
  }
  if (event.button !== 0) return;
  const { x, y } = pointerPos(event);
  const time = viewport.xToTime(x);
  const duration = props.durationMs;

  // 识别区间手柄
  const rsX = viewport.timeToX(props.rangeStartMs);
  const reX = viewport.timeToX(props.rangeEndMs);
  if (Math.abs(x - rsX) <= HANDLE_HIT + 2 && y > RULER_H - 4) {
    drag = {
      kind: "rangeStart",
      startClientX: event.clientX,
      originStart: props.rangeStartMs,
      originEnd: props.rangeEndMs,
    };
    bindMove();
    return;
  }
  if (Math.abs(x - reX) <= HANDLE_HIT + 2 && y > RULER_H - 4) {
    drag = {
      kind: "rangeEnd",
      startClientX: event.clientX,
      originStart: props.rangeStartMs,
      originEnd: props.rangeEndMs,
    };
    bindMove();
    return;
  }

  // 标尺 / 空白 → 拖动播放头
  if (y <= RULER_H) {
    drag = {
      kind: "scrub",
      startClientX: event.clientX,
      originStart: time,
      originEnd: time,
    };
    emit("seek", Math.max(0, Math.min(duration, time)));
    bindMove();
    return;
  }

  const block = findBlock(time);
  if (block) {
    const startX = viewport.timeToX(block.startMs);
    const endX = viewport.timeToX(block.endMs);
    emit("select", block.id);
    if (Math.abs(x - startX) <= HANDLE_HIT) {
      drag = {
        kind: "trimStart",
        id: block.id,
        startClientX: event.clientX,
        originStart: block.startMs,
        originEnd: block.endMs,
      };
    } else if (Math.abs(x - endX) <= HANDLE_HIT) {
      drag = {
        kind: "trimEnd",
        id: block.id,
        startClientX: event.clientX,
        originStart: block.startMs,
        originEnd: block.endMs,
      };
    } else {
      drag = {
        kind: "move",
        id: block.id,
        startClientX: event.clientX,
        originStart: block.startMs,
        originEnd: block.endMs,
      };
    }
    bindMove();
    return;
  }

  // 空白轨道 → 移动播放头
  drag = {
    kind: "scrub",
    startClientX: event.clientX,
    originStart: time,
    originEnd: time,
  };
  emit("seek", Math.max(0, Math.min(duration, time)));
  bindMove();
}

function onPointerMove(event: PointerEvent) {
  if (!drag) return;
  if (drag.kind === "pan") {
    const deltaPx = event.clientX - drag.startClientX;
    viewport.setScrollX((drag.originScrollX ?? 0) - deltaPx);
    return;
  }
  const duration = props.durationMs;
  const deltaMs =
    ((event.clientX - drag.startClientX) / viewport.pxPerSecond.value) * 1000;
  const { kind, originStart, originEnd } = drag;

  if (kind === "scrub") {
    const { x } = pointerPos(event);
    const time = Math.max(0, Math.min(duration, viewport.xToTime(x)));
    showDragTip(time, null);
    emit("seek", time);
    return;
  }
  if (kind === "rangeStart") {
    const raw = Math.max(
      0,
      Math.min(originEnd - MIN_SUBTITLE_MS, originStart + deltaMs)
    );
    const snap = applySnap(raw, collectSnapTargets());
    showDragTip(snap.value, snap.delta);
    emit("update-range", { startMs: snap.value });
    return;
  }
  if (kind === "rangeEnd") {
    const raw = Math.min(
      duration,
      Math.max(originStart + MIN_SUBTITLE_MS, originEnd + deltaMs)
    );
    const snap = applySnap(raw, collectSnapTargets());
    showDragTip(snap.value, snap.delta);
    emit("update-range", { endMs: snap.value });
    return;
  }
  if (!drag.id) return;
  if (kind === "move") {
    const span = originEnd - originStart;
    const rawStart = Math.max(
      0,
      Math.min(duration - span, originStart + deltaMs)
    );
    let nextStart = rawStart;
    let delta: number | null = null;
    if (snapEnabled.value) {
      const snap = snapRange(
        rawStart,
        rawStart + span,
        collectSnapTargets(drag.id),
        snapThresholdMs()
      );
      nextStart = Math.max(0, Math.min(duration - span, snap.startMs));
      delta = snap.deltaMs;
    }
    showDragTip(nextStart, delta);
    emit("update-subtitle", drag.id, {
      startMs: nextStart,
      endMs: nextStart + span,
    });
    return;
  }
  if (kind === "trimStart") {
    const raw = Math.max(
      0,
      Math.min(originEnd - MIN_SUBTITLE_MS, originStart + deltaMs)
    );
    const snap = applySnap(raw, collectSnapTargets(drag.id));
    showDragTip(snap.value, snap.delta);
    emit("update-subtitle", drag.id, { startMs: snap.value });
    return;
  }
  if (kind === "trimEnd") {
    const raw = Math.min(
      duration,
      Math.max(originStart + MIN_SUBTITLE_MS, originEnd + deltaMs)
    );
    const snap = applySnap(raw, collectSnapTargets(drag.id));
    showDragTip(snap.value, snap.delta);
    emit("update-subtitle", drag.id, { endMs: snap.value });
  }
}

function onPointerUp() {
  drag = null;
  isPanning.value = false;
  hideDragTip();
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
}

function bindMove() {
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

// ===== 常驻横向滚动条 =====
const scrollbarRef = ref<HTMLDivElement | null>(null);
let scrollbarDrag: { startClientX: number; startScrollX: number } | null = null;

const canScroll = computed(
  () => viewport.scrollWidth.value > viewport.viewportWidth.value + 1
);

/** 以百分比定位滑块，避免紧密监听宽度；内容不足时铺满整条。 */
const scrollbarThumbStyle = computed(() => {
  const scrollWidth = Math.max(1, viewport.scrollWidth.value);
  const viewportWidth = viewport.viewportWidth.value;
  const widthPercent = Math.min(100, (viewportWidth / scrollWidth) * 100);
  const maxLeft = 100 - widthPercent;
  const maxScroll = scrollWidth - viewportWidth;
  const leftPercent =
    maxLeft <= 0 || maxScroll <= 0
      ? 0
      : (viewport.scrollX.value / maxScroll) * maxLeft;
  return {
    width: `${widthPercent}%`,
    left: `${leftPercent}%`,
  };
});

function onScrollbarPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !canScroll.value) return;
  event.preventDefault();
  const el = scrollbarRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const scrollWidth = Math.max(1, viewport.scrollWidth.value);
  const viewportWidth = viewport.viewportWidth.value;
  const thumbWidth = Math.min(1, viewportWidth / scrollWidth) * rect.width;
  const usable = Math.max(1, rect.width - thumbWidth);
  const ratio = Math.min(
    1,
    Math.max(0, (event.clientX - rect.left - thumbWidth / 2) / usable)
  );
  viewport.setScrollX(ratio * Math.max(0, scrollWidth - viewportWidth));

  scrollbarDrag = {
    startClientX: event.clientX,
    startScrollX: viewport.scrollX.value,
  };
  window.addEventListener("pointermove", onScrollbarMove);
  window.addEventListener("pointerup", onScrollbarUp, { once: true });
}

function onThumbPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !canScroll.value) return;
  event.preventDefault();
  scrollbarDrag = {
    startClientX: event.clientX,
    startScrollX: viewport.scrollX.value,
  };
  window.addEventListener("pointermove", onScrollbarMove);
  window.addEventListener("pointerup", onScrollbarUp, { once: true });
}

function onScrollbarMove(event: PointerEvent) {
  if (!scrollbarDrag) return;
  const el = scrollbarRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const scrollWidth = Math.max(1, viewport.scrollWidth.value);
  const viewportWidth = viewport.viewportWidth.value;
  const thumbWidth = Math.min(1, viewportWidth / scrollWidth) * rect.width;
  const usable = Math.max(1, rect.width - thumbWidth);
  const deltaRatio = (event.clientX - scrollbarDrag.startClientX) / usable;
  viewport.setScrollX(
    scrollbarDrag.startScrollX + deltaRatio * Math.max(0, scrollWidth - viewportWidth)
  );
}

function onScrollbarUp() {
  scrollbarDrag = null;
  window.removeEventListener("pointermove", onScrollbarMove);
}

/** 阻止中键触发浏览器自动滚动，让指针事件专用于平移。 */
function onMouseDown(event: MouseEvent) {
  if (event.button === 1) event.preventDefault();
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.isContentEditable
  );
}

/** 在播放头处拆分字幕：Ctrl/Cmd+K（剪辑软件常用剃刀键）。 */
function onGlobalKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k")
    return;
  if (isTypingTarget(event.target)) return;
  const playhead = props.currentTimeMs;
  const block = [...props.subtitles]
    .sort((a, b) => a.startMs - b.startMs)
    .find((entry) => playhead > entry.startMs && playhead < entry.endMs);
  if (!block) return;
  event.preventDefault();
  emit("split", block.id, playhead);
}

function onDoubleClick(event: MouseEvent) {
  const rect = hostRef.value?.getBoundingClientRect();
  if (!rect) return;
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (y <= RULER_H) return;
  const time = viewport.xToTime(x);
  const block = findBlock(time);
  if (block) emit("edit", block.id);
}

function onContextMenu(event: MouseEvent) {
  event.preventDefault();
  const rect = hostRef.value?.getBoundingClientRect();
  if (!rect) return;
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const time = viewport.xToTime(x);
  const block = findBlock(time);
  if (!block) {
    hideContextMenu();
    return;
  }
  const ordered = [...props.subtitles].sort((a, b) => a.startMs - b.startMs);
  const index = ordered.findIndex((entry) => entry.id === block.id);
  const next = index >= 0 ? (ordered[index + 1]?.id ?? null) : null;
  emit("select", block.id);
  contextMenu.visible = true;
  contextMenu.x = Math.max(0, Math.min(x, rect.width - 120));
  contextMenu.y = Math.max(0, y);
  contextMenu.id = block.id;
  contextMenu.nextId = next;
  contextMenu.clickMs = time;
}

function runContext(action: "edit" | "split" | "merge" | "delete") {
  const { id, nextId, clickMs } = contextMenu;
  hideContextMenu();
  if (!id) return;
  switch (action) {
    case "edit":
      emit("edit", id);
      break;
    case "split": {
      const block = props.subtitles.find((entry) => entry.id === id);
      if (!block) return;
      const playhead = props.currentTimeMs;
      const at =
        playhead > block.startMs && playhead < block.endMs ? playhead : clickMs;
      emit("split", id, at);
      break;
    }
    case "merge":
      if (nextId) emit("merge", [id, nextId]);
      break;
    case "delete":
      emit("delete", id);
      break;
  }
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  hideContextMenu();
  if (event.ctrlKey || event.metaKey) {
    const { x } = pointerPos(event as unknown as PointerEvent);
    viewport.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, x);
  } else {
    // 滚轮 / Shift+滚轮 / Alt+滚轮 统一做横向滚动；优先采用横向滚轮数据。
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX * unit
        : event.deltaY * unit;
    viewport.scrollBy(delta);
  }
  redraw();
}

function ensureStage() {
  if (!stageRef.value || !hostRef.value) return;
  if (!stage) {
    stage = new Konva.Stage({
      container: stageRef.value,
      width: width.value,
      height: TOTAL_H,
    });
    rulerLayer = new Konva.Layer({ listening: false });
    trackLayer = new Konva.Layer({ listening: false });
    overlayLayer = new Konva.Layer({ listening: false });
    stage.add(rulerLayer);
    stage.add(trackLayer);
    stage.add(overlayLayer);
  }
  stage.height(TOTAL_H);
  redraw();
}

onMounted(async () => {
  viewport.setViewportWidth(width.value);
  await Promise.resolve();
  ensureStage();
  if (props.durationMs > 0) fitAll();
  hostRef.value?.addEventListener("pointerdown", onPointerDown);
  hostRef.value?.addEventListener("mousedown", onMouseDown);
  hostRef.value?.addEventListener("wheel", onWheel, { passive: false });
  hostRef.value?.addEventListener("dblclick", onDoubleClick);
  hostRef.value?.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onGlobalKeydown);
});

onBeforeUnmount(() => {
  hostRef.value?.removeEventListener("pointerdown", onPointerDown);
  hostRef.value?.removeEventListener("mousedown", onMouseDown);
  hostRef.value?.removeEventListener("wheel", onWheel);
  hostRef.value?.removeEventListener("dblclick", onDoubleClick);
  hostRef.value?.removeEventListener("contextmenu", onContextMenu);
  window.removeEventListener("keydown", onGlobalKeydown);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointermove", onScrollbarMove);
  window.removeEventListener("pointerup", onScrollbarUp);
  if (rafId) cancelAnimationFrame(rafId);
  stage?.destroy();
  stage = null;
});

watch(width, (w) => {
  viewport.setViewportWidth(w);
  if (stage) stage.width(w);
  if (!hasFitted && props.durationMs > 0) fitAll();
  else redraw();
});

watch(
  () => props.durationMs,
  (d) => {
    if (d > 0) fitAll();
    else redraw();
  }
);

const redrawKey = computed(() => {
  const blocks = props.subtitles
    .map(
      (s) =>
        `${s.id}:${s.startMs}:${s.endMs}:${s.status ?? ""}:${s.text.length}:${s.text.slice(0, 2)}`
    )
    .join("|");
  return `${blocks}#${props.selectedId}#${props.currentTimeMs}#${props.rangeStartMs}#${props.rangeEndMs}#${viewport.pxPerSecond.value}#${viewport.scrollX.value}`;
});

watch(redrawKey, () => redraw());

watch(
  () => props.currentTimeMs,
  (ms) => {
    if (ms > 0) viewport.ensureVisible(ms, 60);
  }
);
</script>

<style scoped>
.timeline-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.timeline-editor__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 4px 10px;
  background: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
}
.timeline-editor__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.timeline-editor__time {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.timeline-editor__hint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
.timeline-editor__zoom {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
}
.timeline-editor__snap {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  user-select: none;
}
.timeline-editor__canvas {
  position: relative;
  flex-shrink: 0;
  width: 100%;
  user-select: none;
  touch-action: none;
}
.timeline-editor__canvas.is-panning {
  cursor: grabbing;
}
.timeline-editor__stage {
  width: 100%;
}
/* 常驻横向滚动条：始终占位，内容不足时铺满整条，缩放不挤动布局。 */
.timeline-editor__scrollbar {
  position: relative;
  flex-shrink: 0;
  height: 12px;
  margin: auto 8px 6px;
  padding: 3px 0;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  cursor: pointer;
}
.timeline-editor__scrollbar.is-disabled {
  cursor: default;
}
.timeline-editor__scrollbar-thumb {
  position: absolute;
  top: 3px;
  height: 6px;
  border-radius: 3px;
  background: var(--el-border-color-darker, rgba(144, 147, 153, 0.5));
  transition: background 0.15s;
}
.timeline-editor__scrollbar:hover .timeline-editor__scrollbar-thumb {
  background: var(--el-text-color-secondary);
}
.timeline-editor__scrollbar.is-disabled .timeline-editor__scrollbar-thumb {
  opacity: 0.4;
}
.timeline-editor__drag-tip {
  position: absolute;
  z-index: 25;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(20, 20, 24, 0.92);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  transform: translateX(-50%);
  pointer-events: none;
  white-space: nowrap;
}
.timeline-editor__drag-tip-time {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 11px;
  color: #e6e6eb;
}
.timeline-editor__drag-tip-delta {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 11px;
  color: var(--el-color-primary);
}
.timeline-editor__kbd {
  margin-left: 6px;
  padding: 0 4px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
}
.timeline-editor__context {
  position: absolute;
  z-index: 30;
  display: flex;
  flex-direction: column;
  min-width: 112px;
  padding: 4px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}
.timeline-editor__context button {
  padding: 5px 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.timeline-editor__context button:hover:not(:disabled) {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}
.timeline-editor__context button:disabled {
  color: var(--el-text-color-disabled);
  cursor: not-allowed;
}
.timeline-editor__context button.is-danger:hover {
  color: var(--el-color-danger);
}
</style>
