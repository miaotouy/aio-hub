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
import { useZIndex } from "element-plus";
import { onBeforeUnmount, ref, watch } from "vue";

const BASE_DIALOG_INITIAL_Z_INDEX = 2000;
const MIN_NOTIFICATION_Z_INDEX = 2030;
const MAX_NOTIFICATION_Z_INDEX = 9990;
const NOTIFICATION_Z_INDEX_STEP = 10;

let _counter = BASE_DIALOG_INITIAL_Z_INDEX;
const activeDialogZIndexes = new Set<number>();

function getElementPlusMaxZIndex(): number {
  try {
    const { currentZIndex } = useZIndex();
    const val = currentZIndex.value;
    return typeof val === "number" && !Number.isNaN(val) ? val : 0;
  } catch {
    return 0;
  }
}

/**
 * 扫描 DOM 中可见的弹窗与遮罩元素的最大 z-index。
 */
export function getDomMaxOverlayZIndex(): number {
  if (typeof document === "undefined") return 0;

  let maxZ = 0;
  const selectors = [
    ".base-dialog-backdrop",
    ".el-overlay",
    ".el-popper",
    "[data-overlay-layer]",
    ".el-message-box__wrapper",
    ".el-dialog__wrapper",
    ".viewer-container",
    ".viewer-backdrop",
    ".video-viewer-overlay",
    "[role='dialog']",
    "[role='alertdialog']",
  ];

  try {
    const elements = document.querySelectorAll(selectors.join(","));
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement;
      if (el.closest(".top-message-host")) continue;
      // 保留挂载的弹层也可能藏在 v-show / hidden 祖先内。
      let hidden = false;
      for (let node: HTMLElement | null = el; node; node = node.parentElement) {
        const style = window.getComputedStyle(node);
        if (
          node.hidden ||
          style.display === "none" ||
          style.visibility === "hidden"
        ) {
          hidden = true;
          break;
        }
      }
      if (hidden) continue;

      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        continue;
      }

      const z = parseInt(style.zIndex, 10);
      if (!Number.isNaN(z) && z < 9999) {
        if (z > maxZ) maxZ = z;
      }
    }
  } catch {
    // 降级容错
  }

  return maxZ;
}

/**
 * 分配弹窗 z-index，协同 Element Plus 与活跃弹窗高水位。
 */
export function acquireZIndex(
  preferredZIndex = 0,
  allocator = useZIndex()
): number {
  const currentMax = Math.max(
    _counter,
    allocator.currentZIndex.value,
    getDomMaxOverlayZIndex(),
    Number.isFinite(preferredZIndex) ? preferredZIndex : 0
  );
  // 通过 Element Plus 的分配器推进共享计数，让之后打开的 Select、
  // Popover、Tooltip、MessageBox 都能高于当前弹层。
  let nextZ = allocator.nextZIndex();
  while (nextZ <= currentMax) nextZ = allocator.nextZIndex();
  _counter = nextZ;
  activeDialogZIndexes.add(nextZ);
  return nextZ;
}

/**
 * 释放已使用的弹窗 z-index。
 */
export function releaseZIndex(z: number): void {
  activeDialogZIndexes.delete(z);
  if (activeDialogZIndexes.size === 0) {
    const elMax = getElementPlusMaxZIndex();
    _counter = Math.max(BASE_DIALOG_INITIAL_Z_INDEX, elMax);
  }
}

/**
 * 获取当前已注册的应用浮层活跃层级最大值。
 */
export function getMaxDialogZIndex(): number {
  let max = 0;
  for (const z of activeDialogZIndexes) {
    if (z > max) max = z;
  }
  return max;
}

/**
 * 获取当前全局所有弹窗/遮罩层的高水位 z-index。
 */
export function getMaxOverlayZIndex(): number {
  const dialogMax = getMaxDialogZIndex();
  const elMax = getElementPlusMaxZIndex();
  const domMax = getDomMaxOverlayZIndex();
  return Math.max(dialogMax, elMax, domMax);
}

/**
 * 计算顶部浮动消息当前应该使用的动态 z-index。
 * 保证始终高于活跃弹窗层级，同时低于全局标题栏（9999）。
 */
export function getTopMessageZIndex(requestedZIndex?: number): number {
  const maxOverlay = getMaxOverlayZIndex();
  const candidateFromOverlays =
    maxOverlay > 0
      ? maxOverlay + NOTIFICATION_Z_INDEX_STEP
      : MIN_NOTIFICATION_Z_INDEX;

  const target = Math.max(
    MIN_NOTIFICATION_Z_INDEX,
    candidateFromOverlays,
    requestedZIndex ?? 0
  );

  return Math.min(target, MAX_NOTIFICATION_Z_INDEX);
}

/**
 * 重置内部计数器（主要用于单元测试）。
 */
export function resetDialogZIndexCounter(): void {
  activeDialogZIndexes.clear();
  _counter = BASE_DIALOG_INITIAL_Z_INDEX;
}

/** 自定义浮层按打开顺序分配层级；关闭或卸载时释放。 */
export function useOverlayZIndex(
  visible: () => boolean,
  preferredZIndex: () => number = () => 0
) {
  const allocator = useZIndex();
  const zIndex = ref(0);
  let allocated: number | undefined;
  const release = () => {
    if (allocated === undefined) return;
    releaseZIndex(allocated);
    allocated = undefined;
  };
  const bringToFront = () => {
    if (!visible()) return;
    const previous = allocated;
    allocated = acquireZIndex(preferredZIndex(), allocator);
    zIndex.value = allocated;
    if (previous !== undefined) releaseZIndex(previous);
  };
  watch(visible, (open) => (open ? bringToFront() : release()), {
    immediate: true,
    flush: "sync",
  });
  onBeforeUnmount(release);
  return { zIndex, bringToFront };
}
