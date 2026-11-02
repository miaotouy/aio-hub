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

<script setup lang="ts">
/**
 * 截图选点 / 框选 / 原点标定弹窗
 *
 * 工作流程：
 *  1. mount 时自动调用 wa_capture_window 截图；
 *  2. 把 ArrayBuffer 包成 Blob → Object URL 渲染到 <img>；
 *  3. 鼠标在图片上移动时显示放大镜 + 像素坐标/颜色/原点系数值；
 *  4. 点击或拖拽后根据 mode 触发 confirm，返回选点或框选结果；
 *  5. 工具栏"设为原点"进入标定角色，点击后 emit mark-origin（不关闭弹窗，
 *     标定后立即叠加十字线，可继续取点）。
 *
 * 关闭/重新截图时必须 revokeObjectURL 防止内存泄漏。
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { Camera, Crosshair, LocateFixed } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useScreenshotPicker } from "../composables/useScreenshotPicker";
import { quadrantLabel } from "../composables/coordinateTransforms";
import type {
  CoordinateOrigin,
  ScreenshotPickerOriginResult,
  ScreenshotPickerResult,
} from "../types";

export type PickerWriteMode = "pixel" | "percent" | "center";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    hwnd: number;
    mode?: "point" | "rect";
    /** 中心坐标系原点（percent），null = 未标定 */
    origin?: CoordinateOrigin | null;
    /** 写入模式初始值（point 模式），默认跟随目标步骤当前模式 */
    initialWriteMode?: PickerWriteMode;
  }>(),
  { mode: "point", origin: null, initialWriteMode: "pixel" }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "confirm", result: ScreenshotPickerResult): void;
  (e: "mark-origin", point: ScreenshotPickerOriginResult): void;
  (e: "cancel"): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

const picker = useScreenshotPicker();
const imgRef = ref<HTMLImageElement | null>(null);
const isReady = ref(false);
const isDragging = ref(false);
const dragStart = ref<{ clientX: number; clientY: number } | null>(null);
const dragEnd = ref<{ clientX: number; clientY: number } | null>(null);
/** 取点角色：默认取点；进入"设为原点"后下一次点击标定原点 */
const pickRole = ref<"pick" | "mark-origin">("pick");
/** 内部维护的原点（props 变化时同步；标定后立即更新以叠加十字线） */
const originRef = ref<CoordinateOrigin | null>(props.origin);
const writeMode = ref<PickerWriteMode>(props.initialWriteMode);
const hover = ref<{
  clientX: number;
  clientY: number;
  x: number;
  y: number;
  color: string;
  center: ReturnType<typeof picker.computeCenterMetrics> | null;
} | null>(null);

const isMarkOrigin = computed(() => pickRole.value === "mark-origin");

const dialogTitle = computed(() => {
  if (props.mode === "rect") return "截图框选";
  return isMarkOrigin.value ? "截图设为原点" : "截图取点";
});

async function takeScreenshot() {
  isReady.value = false;
  hover.value = null;
  dragStart.value = null;
  dragEnd.value = null;
  const ok = await picker.capture(props.hwnd);
  isReady.value = ok;
}

function startMarkOrigin() {
  pickRole.value = "mark-origin";
}

function onMouseMove(e: MouseEvent) {
  if (!imgRef.value || !isReady.value) return;
  const rect = imgRef.value.getBoundingClientRect();
  if (
    e.clientX < rect.left ||
    e.clientX > rect.right ||
    e.clientY < rect.top ||
    e.clientY > rect.bottom
  ) {
    hover.value = null;
    return;
  }
  const px = picker.clientToImage(imgRef.value, e.clientX, e.clientY);
  const color = picker.pickColor(imgRef.value, px.x, px.y);
  hover.value = {
    clientX: e.clientX,
    clientY: e.clientY,
    x: Math.round(px.x),
    y: Math.round(px.y),
    color,
    center: picker.computeCenterMetrics(px.x, px.y, originRef.value),
  };
  if (isDragging.value) {
    dragEnd.value = { clientX: e.clientX, clientY: e.clientY };
  }
}

function onMouseDown(e: MouseEvent) {
  if (!imgRef.value || !isReady.value) return;
  if (props.mode === "rect") {
    isDragging.value = true;
    dragStart.value = { clientX: e.clientX, clientY: e.clientY };
    dragEnd.value = { clientX: e.clientX, clientY: e.clientY };
  }
}

function onMouseUp(e: MouseEvent) {
  if (!imgRef.value || !isReady.value) return;
  if (props.mode === "point") {
    if (!hover.value) return;
    // 原点标定：emit 后立即更新十字线并回到取点角色，不关闭弹窗
    if (isMarkOrigin.value) {
      const px = picker.clientToImage(imgRef.value, e.clientX, e.clientY);
      const w = picker.naturalWidth.value;
      const h = picker.naturalHeight.value;
      const point: ScreenshotPickerOriginResult = {
        xPercent: w > 0 ? (px.x / w) * 100 : 0,
        yPercent: h > 0 ? (px.y / h) * 100 : 0,
      };
      originRef.value = point;
      pickRole.value = "pick";
      emit("mark-origin", point);
      return;
    }
    const result = picker.buildPointResult(
      imgRef.value,
      e.clientX,
      e.clientY,
      originRef.value,
      writeMode.value
    );
    emit("confirm", result);
    visible.value = false;
  } else {
    if (!isDragging.value || !dragStart.value || !dragEnd.value) return;
    isDragging.value = false;
    const result = picker.buildRectResult(
      imgRef.value,
      dragStart.value,
      dragEnd.value,
      originRef.value
    );
    if (result.rect && (result.rect.width < 2 || result.rect.height < 2)) {
      // 框选区域过小，按单点处理
      const point = picker.buildPointResult(
        imgRef.value,
        dragEnd.value.clientX,
        dragEnd.value.clientY
      );
      emit("confirm", point);
    } else {
      emit("confirm", result);
    }
    visible.value = false;
    dragStart.value = null;
    dragEnd.value = null;
  }
}

function onClose() {
  emit("cancel");
  visible.value = false;
}

const selectionRect = computed(() => {
  if (props.mode !== "rect" || !dragStart.value || !dragEnd.value) return null;
  const a = dragStart.value;
  const b = dragEnd.value;
  return {
    left: Math.min(a.clientX, b.clientX),
    top: Math.min(a.clientY, b.clientY),
    width: Math.abs(a.clientX - b.clientX),
    height: Math.abs(a.clientY - b.clientY),
  };
});

/** 悬停信息栏的原点系展示 */
const hoverOriginText = computed(() => {
  if (!hover.value) return "";
  const c = hover.value.center;
  if (!c) return "";
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return `原点系: ${sign(c.dx ?? 0)}, ${sign(c.dy ?? 0)} · ${quadrantLabel(
    c.quadrant ?? null
  )}`;
});

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      originRef.value = props.origin;
      writeMode.value = props.initialWriteMode;
      pickRole.value = "pick";
      void takeScreenshot();
    } else {
      picker.revoke();
      isReady.value = false;
    }
  }
);

watch(
  () => props.origin,
  (v) => {
    originRef.value = v;
  }
);

onMounted(async () => {
  if (props.modelValue) await takeScreenshot();
});

onBeforeUnmount(() => {
  picker.revoke();
});
</script>

<template>
  <BaseDialog
    v-model="visible"
    :title="dialogTitle"
    width="90vw"
    height="90vh"
    :show-close-button="true"
    :close-on-backdrop-click="true"
    content-class="screenshot-picker-content"
    @close="onClose"
  >
    <div class="screenshot-picker">
      <div class="toolbar">
        <el-button
          :icon="Camera"
          size="small"
          :loading="picker.isCapturing.value"
          @click="takeScreenshot"
        >
          重新截图
        </el-button>
        <el-tooltip
          :content="
            mode === 'rect'
              ? '拖拽鼠标框选区域'
              : isMarkOrigin
                ? '点击鼠标标定中心坐标系原点'
                : '点击鼠标选取单个像素'
          "
          placement="top"
        >
          <div class="mode-hint">
            <Crosshair :size="14" />
            {{
              mode === "rect"
                ? "拖拽框选"
                : isMarkOrigin
                  ? "点击设为原点"
                  : "点击取点"
            }}
          </div>
        </el-tooltip>
        <div v-if="mode === 'point'" class="write-mode">
          <span class="write-mode-label">写入模式</span>
          <el-radio-group v-model="writeMode" size="small">
            <el-radio-button value="pixel">像素</el-radio-button>
            <el-radio-button value="percent">百分比</el-radio-button>
            <el-radio-button value="center">中心</el-radio-button>
          </el-radio-group>
        </div>
        <el-button
          :icon="LocateFixed"
          size="small"
          :disabled="mode === 'rect' || isMarkOrigin"
          @click="startMarkOrigin"
        >
          设为原点
        </el-button>
        <div v-if="hover" class="hover-info">
          <span>x={{ hover.x }}</span>
          <span>y={{ hover.y }}</span>
          <span class="color-chip" :style="{ background: hover.color }"></span>
          <code>{{ hover.color }}</code>
          <span class="origin-info" :class="{ muted: !originRef }">
            {{ hoverOriginText || "原点: 未标定 (使用几何中心)" }}
          </span>
        </div>
      </div>

      <div class="image-stage">
        <div v-if="!isReady" class="loading">
          {{ picker.isCapturing.value ? "截图中..." : "加载中..." }}
        </div>
        <div v-else class="image-wrap">
          <div class="image-canvas">
            <img
              ref="imgRef"
              :src="picker.imageUrl.value ?? ''"
              class="screenshot-image"
              alt="窗口截图"
              draggable="false"
              @mousemove="onMouseMove"
              @mousedown="onMouseDown"
              @mouseup="onMouseUp"
              @mouseleave="hover = null"
            />
            <!-- 原点十字线：图片宽高方向各一条半透明线 + 中心圆点 -->
            <template v-if="originRef">
              <div
                class="origin-cross origin-cross-v"
                :style="{ left: originRef.xPercent + '%' }"
              ></div>
              <div
                class="origin-cross origin-cross-h"
                :style="{ top: originRef.yPercent + '%' }"
              ></div>
              <div
                class="origin-dot"
                :style="{
                  left: originRef.xPercent + '%',
                  top: originRef.yPercent + '%',
                }"
              ></div>
            </template>
          </div>
          <div
            v-if="
              mode === 'rect' &&
              selectionRect &&
              selectionRect.width > 0 &&
              selectionRect.height > 0
            "
            class="selection-rect"
            :style="{
              left: selectionRect.left + 'px',
              top: selectionRect.top + 'px',
              width: selectionRect.width + 'px',
              height: selectionRect.height + 'px',
            }"
          ></div>
          <div
            v-if="hover"
            class="magnifier"
            :style="{
              left: hover.clientX + 18 + 'px',
              top: hover.clientY + 18 + 'px',
            }"
          >
            <div
              class="mag-bg"
              :style="{
                background: hover.color,
              }"
            ></div>
            <div class="mag-label">{{ hover.x }},{{ hover.y }}</div>
          </div>
        </div>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
:deep(.screenshot-picker-content) {
  padding: 0 !important;
  overflow: hidden;
}
.screenshot-picker {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: var(--border-width) solid var(--border-color-light);
  background-color: var(--header-bg);
  flex-wrap: wrap;
}
.mode-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.write-mode {
  display: flex;
  align-items: center;
  gap: 6px;
}
.write-mode-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.hover-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
}
.origin-info {
  color: var(--el-color-primary);
}
.origin-info.muted {
  color: var(--el-text-color-placeholder);
}
.color-chip {
  width: 14px;
  height: 14px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 2px;
}
.image-stage {
  flex: 1;
  overflow: auto;
  position: relative;
  background-color: var(--bg-color);
}
.image-wrap {
  position: relative;
  display: inline-block;
  min-width: 100%;
  min-height: 100%;
}
.image-canvas {
  position: relative;
  display: inline-block;
}
.loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}
.screenshot-image {
  display: block;
  max-width: none;
  user-select: none;
  cursor: crosshair;
  image-rendering: pixelated;
}
.origin-cross {
  position: absolute;
  pointer-events: none;
  background-color: var(--el-color-danger);
  opacity: 0.55;
}
.origin-cross-v {
  top: 0;
  bottom: 0;
  width: 1px;
  transform: translateX(-0.5px);
}
.origin-cross-h {
  left: 0;
  right: 0;
  height: 1px;
  transform: translateY(-0.5px);
}
.origin-dot {
  position: absolute;
  width: 7px;
  height: 7px;
  border: 1px solid #ffffff;
  border-radius: 50%;
  background-color: var(--el-color-danger);
  transform: translate(-50%, -50%);
  pointer-events: none;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
}
.selection-rect {
  position: fixed;
  border: 2px solid var(--el-color-primary);
  background-color: rgba(64, 158, 255, 0.1);
  pointer-events: none;
}
.magnifier {
  position: fixed;
  width: 96px;
  height: 96px;
  border: 2px solid var(--el-color-primary);
  border-radius: 4px;
  pointer-events: none;
  overflow: hidden;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
.mag-bg {
  position: absolute;
  inset: 0;
}
.mag-label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 10px;
  font-family: ui-monospace, monospace;
  text-align: center;
  padding: 1px 0;
}
</style>
