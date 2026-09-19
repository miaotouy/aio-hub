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
 * 性能对比场景定义。
 *
 * 场景矩阵在 baseline 与 candidate 上逐字一致，且每个场景都分为：
 * - `warmup`：丢弃的预热窗口，排除冷启动、字体与首帧抖动；
 * - `measure`：计入统计的采样窗口。
 */

export interface PerfScenario {
  id: string;
  description: string;
  /** 采样窗口内是否驱动滚动。 */
  scroll: boolean;
  /** 采样窗口时长（毫秒）。 */
  durationMs: number;
  warmupMs: number;
  /** 滚动步长（像素）与节拍。 */
  scrollStepPx?: number;
  stepIntervalMs?: number;
}

/** 聊天滚动容器：非滚动父容器的区域玻璃层由该容器承载。 */
export const CHAT_SCROLL_SELECTOR = ".message-list";

export const PERF_SCENARIOS: PerfScenario[] = [
  {
    id: "idle",
    description: "长会话可见、无滚动（静态合成基线）",
    scroll: false,
    durationMs: 5_000,
    warmupMs: 2_000,
  },
  {
    id: "scroll-slow",
    description: "长会话常速滚动",
    scroll: true,
    durationMs: 8_000,
    warmupMs: 2_000,
    scrollStepPx: 240,
    stepIntervalMs: 16,
  },
  {
    id: "scroll-fast",
    description: "长会话快速连续滚动",
    scroll: true,
    durationMs: 8_000,
    warmupMs: 2_000,
    scrollStepPx: 720,
    stepIntervalMs: 8,
  },
];

export function scenarioById(id: string): PerfScenario {
  const scenario = PERF_SCENARIOS.find((item) => item.id === id);
  if (!scenario) {
    throw new Error(
      `Unknown perf scenario: ${id}. Available: ${PERF_SCENARIOS.map((item) => item.id).join(", ")}`
    );
  }
  return scenario;
}
