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
 * 时间轴吸附的纯计算逻辑，方便单测与复用。
 * 只处理毫秒数值与吸附目标，不感知像素与视口。
 */

export interface SnapResult {
  /** 吸附后的值；未命中目标时等于入参。 */
  value: number;
  /** 命中的吸附目标；未命中为 null。 */
  target: number | null;
  /** 原始值与吸附值的差（raw - snapped），用于浮动提示方向。 */
  deltaMs: number;
}

/** 将单个时间值吸附到最近的目标点。 */
export function snapValue(
  value: number,
  targets: number[],
  thresholdMs: number
): SnapResult {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    if (!Number.isFinite(target)) continue;
    const distance = Math.abs(value - target);
    if (distance <= thresholdMs && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  if (best === null) return { value, target: null, deltaMs: 0 };
  return { value: best, target: best, deltaMs: value - best };
}

export interface RangeSnapResult {
  startMs: number;
  endMs: number;
  /** 命中的吸附目标；未命中为 null。 */
  target: number | null;
  /** 原始值与吸附值的差（raw - snapped）。 */
  deltaMs: number;
}

/**
 * 平移一个区间时，取起止两端中命中吸附目标更近的一端整体平移，
 * 保持区间长度不变。
 */
export function snapRange(
  startMs: number,
  endMs: number,
  targets: number[],
  thresholdMs: number
): RangeSnapResult {
  const startSnap = snapValue(startMs, targets, thresholdMs);
  const endSnap = snapValue(endMs, targets, thresholdMs);
  const startDistance =
    startSnap.target === null
      ? Number.POSITIVE_INFINITY
      : Math.abs(startSnap.deltaMs);
  const endDistance =
    endSnap.target === null
      ? Number.POSITIVE_INFINITY
      : Math.abs(endSnap.deltaMs);

  if (
    startDistance === Number.POSITIVE_INFINITY &&
    endDistance === Number.POSITIVE_INFINITY
  ) {
    return { startMs, endMs, target: null, deltaMs: 0 };
  }

  if (startDistance <= endDistance) {
    const shift = startSnap.value - startMs;
    return {
      startMs: startSnap.value,
      endMs: endMs + shift,
      target: startSnap.target,
      deltaMs: startSnap.deltaMs,
    };
  }

  const shift = endSnap.value - endMs;
  return {
    startMs: startMs + shift,
    endMs: endSnap.value,
    target: endSnap.target,
    deltaMs: endSnap.deltaMs,
  };
}
