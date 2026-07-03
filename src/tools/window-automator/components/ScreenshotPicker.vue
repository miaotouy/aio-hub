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
 * 截图选点 / 框选弹窗
 *
 * 工作流程：
 *  1. mount 时自动调用 wa_capture_window 截图；
 *  2. 把 ArrayBuffer 包成 Blob → Object URL 渲染到 <img>；
 *  3. 鼠标在图片上移动时显示放大镜 + 像素坐标/颜色；
 *  4. 点击或拖拽后根据 mode 触发 confirm，返回选点或框选结果。
 *
 * 关闭/重新截图时必须 revokeObjectURL 防止内存泄漏。
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { Camera, Crosshair } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useScreenshotPicker } from "../composables/useScreenshotPicker";
import type { ScreenshotPickerResult } from "../types";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    hwnd: number;
    mode?: "point" | "rect";
  }>(),
  { mode: "point" }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "confirm", result: ScreenshotPickerResult): void;
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
const hover = ref<{
  clientX: number;
  clientY: number;
  x: number;
  y: number;
  color: string;
} | null>(null);

async function takeScreenshot() {
  isReady.value = false;
  hover.value = null;
  dragStart.value = null;
  dragEnd.value = null;
  const ok = await picker.capture(props.hwnd);
  isReady.value = ok;
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
    const result = picker.buildPointResult(imgRef.value, e.clientX, e.clientY);
    emit("confirm", result);
    visible.value = false;
  } else {
    if (!isDragging.value || !dragStart.value || !dragEnd.value) return;
    isDragging.value = false;
    const result = picker.buildRectResult(
      imgRef.value,
      dragStart.value,
      dragEnd.value
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

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      void takeScreenshot();
    } else {
      picker.revoke();
      isReady.value = false;
    }
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
    :title="mode === 'rect' ? '截图框选' : '截图取点'"
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
            mode === 'rect' ? '拖拽鼠标框选区域' : '点击鼠标选取单个像素'
          "
          placement="top"
        >
          <div class="mode-hint">
            <Crosshair :size="14" />
            {{ mode === "rect" ? "拖拽框选" : "点击取点" }}
          </div>
        </el-tooltip>
        <div v-if="hover" class="hover-info">
          <span>x={{ hover.x }}</span>
          <span>y={{ hover.y }}</span>
          <span class="color-chip" :style="{ background: hover.color }"></span>
          <code>{{ hover.color }}</code>
        </div>
      </div>

      <div class="image-stage">
        <div v-if="!isReady" class="loading">
          {{ picker.isCapturing.value ? "截图中..." : "加载中..." }}
        </div>
        <div v-else class="image-wrap">
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
.hover-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
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
