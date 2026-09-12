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
      <div class="timeline-editor__zoom">
        <el-button size="small" text @click="viewport.zoomBy(1 / 1.4, width / 2)">
          <ZoomOut :size="14" />
        </el-button>
        <el-button size="small" text @click="fitAll">适配全长</el-button>
        <el-button size="small" text @click="viewport.zoomBy(1.4, width / 2)">
          <ZoomIn :size="14" />
        </el-button>
      </div>
    </div>

    <div ref="hostRef" class="timeline-editor__canvas">
      <div ref="stageRef" class="timeline-editor__stage"></div>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useElementSize } from "@vueuse/core";
import { ElButton } from "element-plus";
import { ZoomIn, ZoomOut } from "lucide-vue-next";
import Konva from "konva";
import type { SubtitleEntry } from "../../../types";
import { useTimelineViewport } from "../../../composables/useTimelineViewport";

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
  const startMs = Math.max(0, Math.floor(viewport.xToTime(0) / stepMs) * stepMs);
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
  | "rangeEnd";

interface DragState {
  kind: DragKind;
  id?: string;
  startClientX: number;
  originStart: number;
  originEnd: number;
}

let drag: DragState | null = null;

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
    drag = { kind: "scrub", startClientX: event.clientX, originStart: time, originEnd: time };
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
  drag = { kind: "scrub", startClientX: event.clientX, originStart: time, originEnd: time };
  emit("seek", Math.max(0, Math.min(duration, time)));
  bindMove();
}

function onPointerMove(event: PointerEvent) {
  if (!drag) return;
  const duration = props.durationMs;
  const deltaMs =
    ((event.clientX - drag.startClientX) / viewport.pxPerSecond.value) * 1000;
  const { kind, originStart, originEnd } = drag;

  if (kind === "scrub") {
    const { x } = pointerPos(event);
    const time = Math.max(0, Math.min(duration, viewport.xToTime(x)));
    emit("seek", time);
    return;
  }
  if (kind === "rangeStart") {
    const next = Math.max(0, Math.min(originEnd - MIN_SUBTITLE_MS, originStart + deltaMs));
    emit("update-range", { startMs: next });
    return;
  }
  if (kind === "rangeEnd") {
    const next = Math.min(duration, Math.max(originStart + MIN_SUBTITLE_MS, originEnd + deltaMs));
    emit("update-range", { endMs: next });
    return;
  }
  if (!drag.id) return;
  if (kind === "move") {
    const span = originEnd - originStart;
    const nextStart = Math.max(0, Math.min(duration - span, originStart + deltaMs));
    emit("update-subtitle", drag.id, {
      startMs: nextStart,
      endMs: nextStart + span,
    });
    return;
  }
  if (kind === "trimStart") {
    const next = Math.max(0, Math.min(originEnd - MIN_SUBTITLE_MS, originStart + deltaMs));
    emit("update-subtitle", drag.id, { startMs: next });
    return;
  }
  if (kind === "trimEnd") {
    const next = Math.min(duration, Math.max(originStart + MIN_SUBTITLE_MS, originEnd + deltaMs));
    emit("update-subtitle", drag.id, { endMs: next });
  }
}

function onPointerUp() {
  drag = null;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
}

function bindMove() {
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
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
        playhead > block.startMs && playhead < block.endMs
          ? playhead
          : clickMs;
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
    viewport.scrollBy(event.deltaY + event.deltaX);
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
  hostRef.value?.addEventListener("wheel", onWheel, { passive: false });
  hostRef.value?.addEventListener("dblclick", onDoubleClick);
  hostRef.value?.addEventListener("contextmenu", onContextMenu);
});

onBeforeUnmount(() => {
  hostRef.value?.removeEventListener("pointerdown", onPointerDown);
  hostRef.value?.removeEventListener("wheel", onWheel);
  hostRef.value?.removeEventListener("dblclick", onDoubleClick);
  hostRef.value?.removeEventListener("contextmenu", onContextMenu);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
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
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.timeline-editor__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
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
.timeline-editor__zoom {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
}
.timeline-editor__canvas {
  position: relative;
  width: 100%;
  user-select: none;
  touch-action: none;
}
.timeline-editor__stage {
  width: 100%;
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
