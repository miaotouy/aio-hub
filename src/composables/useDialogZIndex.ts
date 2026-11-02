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
export function acquireZIndex(preferredZIndex = 0): number {
  const currentMax = Math.max(
    _counter,
    getElementPlusMaxZIndex(),
    preferredZIndex
  );
  const nextZ = currentMax + 1;
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
 * 获取当前已注册的 BaseDialog 活跃层级最大值。
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
