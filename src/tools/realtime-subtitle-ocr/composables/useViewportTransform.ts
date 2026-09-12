// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * useViewportTransform - 剪辑器式监视器视口变换。
 *
 * 维护 `scale / offsetX / offsetY`，支持适配、以光标为锚点缩放、平移。
 * 内容使用 `transform-origin: 0 0`，屏幕坐标与内容坐标换算见 `toContentPoint`。
 */

import { computed, ref, type Ref, type ComputedRef } from "vue";

const MIN_SCALE = 0.02;
const MAX_SCALE = 16;

export interface ViewportTransform {
  scale: Ref<number>;
  offsetX: Ref<number>;
  offsetY: Ref<number>;
  fitScale: ComputedRef<number>;
  zoomPercent: ComputedRef<number>;
  isFitted: Ref<boolean>;
  contentStyle: ComputedRef<Record<string, string>>;
  fit: () => void;
  setScale: (scale: number, anchorX?: number, anchorY?: number) => void;
  zoomBy: (factor: number, anchorX?: number, anchorY?: number) => void;
  actualSize: () => void;
  panBy: (dx: number, dy: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toContentPoint: (screenX: number, screenY: number) => { x: number; y: number };
}

export function useViewportTransform(options: {
  containerWidth: Ref<number>;
  containerHeight: Ref<number>;
  contentWidth: Ref<number>;
  contentHeight: Ref<number>;
}): ViewportTransform {
  const scale = ref(1);
  const offsetX = ref(0);
  const offsetY = ref(0);
  const isFitted = ref(true);

  const fitScale = computed(() => {
    const cw = options.containerWidth.value;
    const ch = options.containerHeight.value;
    const iw = options.contentWidth.value;
    const ih = options.contentHeight.value;
    if (!cw || !ch || !iw || !ih) return 1;
    return Math.min(cw / iw, ch / ih);
  });

  const zoomPercent = computed(() => Math.round(scale.value * 100));

  function clampScale(value: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  }

  function centerFor(currentScale: number): { x: number; y: number } {
    const cw = options.containerWidth.value;
    const ch = options.containerHeight.value;
    const iw = options.contentWidth.value;
    const ih = options.contentHeight.value;
    return {
      x: (cw - iw * currentScale) / 2,
      y: (ch - ih * currentScale) / 2,
    };
  }

  function fit() {
    const next = clampScale(fitScale.value);
    scale.value = next;
    const center = centerFor(next);
    offsetX.value = center.x;
    offsetY.value = center.y;
    isFitted.value = true;
  }

  function setScale(next: number, anchorX?: number, anchorY?: number) {
    const clamped = clampScale(next);
    const cw = options.containerWidth.value;
    const ch = options.containerHeight.value;
    const ax = anchorX ?? cw / 2;
    const ay = anchorY ?? ch / 2;
    const contentX = (ax - offsetX.value) / scale.value;
    const contentY = (ay - offsetY.value) / scale.value;
    scale.value = clamped;
    offsetX.value = ax - contentX * clamped;
    offsetY.value = ay - contentY * clamped;
    isFitted.value = false;
  }

  function zoomBy(factor: number, anchorX?: number, anchorY?: number) {
    setScale(scale.value * factor, anchorX, anchorY);
  }

  function actualSize() {
    setScale(1);
  }

  function panBy(dx: number, dy: number) {
    offsetX.value += dx;
    offsetY.value += dy;
    isFitted.value = false;
  }

  function zoomIn() {
    zoomBy(1.2);
  }

  function zoomOut() {
    zoomBy(1 / 1.2);
  }

  function toContentPoint(screenX: number, screenY: number) {
    return {
      x: (screenX - offsetX.value) / scale.value,
      y: (screenY - offsetY.value) / scale.value,
    };
  }

  const contentStyle = computed(() => ({
    width: `${options.contentWidth.value}px`,
    height: `${options.contentHeight.value}px`,
    transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
    transformOrigin: "0 0",
  }));

  return {
    scale,
    offsetX,
    offsetY,
    fitScale,
    zoomPercent,
    isFitted,
    contentStyle,
    fit,
    setScale,
    zoomBy,
    actualSize,
    panBy,
    zoomIn,
    zoomOut,
    toContentPoint,
  };
}
