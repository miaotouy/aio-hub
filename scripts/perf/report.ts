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
 * 结果落盘与对比报告生成。
 *
 * 产物结构（默认 .dev-data/perf-results/glass-material/）：
 * - <label>-run-<n>.json     单轮原始记录
 * - comparison.md            逐指标中位数对比与判定
 */

import fs from "node:fs";
import path from "node:path";
import type { FrameStats } from "./frames";
import { MIN_RESOURCE_SAMPLES } from "./resources";
import type { ResourceSummary } from "./resources";

export interface ScenarioResult {
  scenarioId: string;
  description: string;
  scroll: boolean;
  durationMs: number;
  frames: FrameStats | null;
  resources: ResourceSummary;
  notes?: string[];
}

export interface RunResult {
  label: string;
  lane: "release" | "debug";
  commit: string;
  binary: string;
  binarySha256: string;
  runIndex: number;
  startedAt: string;
  finishedAt: string;
  host: {
    platform: string;
    release: string;
    cpu: string;
    memoryBytes: number;
    gpus: string[];
  };
  fixture: unknown;
  scenarios: ScenarioResult[];
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function writeRunResult(outputDir: string, result: RunResult): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = `${result.label}-${result.lane}-run-${result.runIndex}.json`;
  const target = path.join(outputDir, fileName);
  fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return target;
}

export function readRunResults(outputDir: string): RunResult[] {
  if (!fs.existsSync(outputDir)) return [];
  return fs
    .readdirSync(outputDir)
    .filter((name) => /-run-\d+\.json$/.test(name))
    .sort()
    .map(
      (name) =>
        JSON.parse(
          fs.readFileSync(path.join(outputDir, name), "utf8")
        ) as RunResult
    );
}

interface MetricRow {
  scenario: string;
  lane: string;
  metric: string;
  baseline: number;
  candidate: number;
  delta: number;
  deltaPercent: number;
  unit: string;
  /** true 表示数值越小越好。 */
  lowerIsBetter: boolean;
}

function aggregate(
  results: RunResult[],
  label: string,
  lane: RunResult["lane"]
): Map<string, Map<string, number>> {
  const byScenario = new Map<string, Map<string, number[]>>();
  for (const result of results.filter(
    (item) => item.label === label && item.lane === lane
  )) {
    for (const scenario of result.scenarios) {
      const metrics =
        byScenario.get(scenario.scenarioId) ?? new Map<string, number[]>();
      const push = (key: string, value: number | null | undefined) => {
        if (value === null || value === undefined || !Number.isFinite(value))
          return;
        metrics.set(key, [...(metrics.get(key) ?? []), value]);
      };
      push("fps", scenario.frames?.fps);
      push("p50", scenario.frames?.p50);
      push("p95", scenario.frames?.p95);
      push("p99", scenario.frames?.p99);
      push("jankRatio", scenario.frames?.jankRatio);
      push("over33_3", scenario.frames?.over33_3);
      push("cpuPerSecond", scenario.resources.cpuSecondsPerSecond);
      push(
        "workingSetPeakMiB",
        scenario.resources.workingSetPeakBytes / 1048576
      );
      push("privatePeakMiB", scenario.resources.privatePeakBytes / 1048576);
      push("gpu3dAvgPercent", scenario.resources.gpu3dAvgPercent);
      push(
        "gpuDedicatedPeakMiB",
        scenario.resources.gpuDedicatedPeakBytes / 1048576
      );
      push("gpuSharedPeakMiB", scenario.resources.gpuSharedPeakBytes / 1048576);
      byScenario.set(scenario.scenarioId, metrics);
    }
  }
  const aggregated = new Map<string, Map<string, number>>();
  for (const [scenarioId, metrics] of byScenario) {
    const entry = new Map<string, number>();
    for (const [key, values] of metrics) entry.set(key, median(values));
    aggregated.set(scenarioId, entry);
  }
  return aggregated;
}

const METRIC_SPECS: Array<{
  key: string;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
  /** 帧时间指标标记，仅用于展示与数据检查。 */
  frameMetric: boolean;
}> = [
  {
    key: "fps",
    label: "FPS",
    unit: "fps",
    lowerIsBetter: false,
    frameMetric: true,
  },
  {
    key: "p50",
    label: "帧时间 p50",
    unit: "ms",
    lowerIsBetter: true,
    frameMetric: true,
  },
  {
    key: "p95",
    label: "帧时间 p95",
    unit: "ms",
    lowerIsBetter: true,
    frameMetric: true,
  },
  {
    key: "p99",
    label: "帧时间 p99",
    unit: "ms",
    lowerIsBetter: true,
    frameMetric: true,
  },
  {
    key: "over33_3",
    label: ">33.3ms 慢帧数",
    unit: "frame",
    lowerIsBetter: true,
    frameMetric: true,
  },
  {
    key: "jankRatio",
    label: "卡顿比例(>33.3ms)",
    unit: "ratio",
    lowerIsBetter: true,
    frameMetric: true,
  },
  {
    key: "cpuPerSecond",
    label: "CPU 核秒/秒",
    unit: "core-s/s",
    lowerIsBetter: true,
    frameMetric: false,
  },
  {
    key: "workingSetPeakMiB",
    label: "工作集峰值",
    unit: "MiB",
    lowerIsBetter: true,
    frameMetric: false,
  },
  {
    key: "privatePeakMiB",
    label: "私有内存峰值",
    unit: "MiB",
    lowerIsBetter: true,
    frameMetric: false,
  },
  {
    key: "gpu3dAvgPercent",
    label: "GPU 3D 平均占用",
    unit: "%",
    lowerIsBetter: true,
    frameMetric: false,
  },
  {
    key: "gpuDedicatedPeakMiB",
    label: "显存专用峰值",
    unit: "MiB",
    lowerIsBetter: true,
    frameMetric: false,
  },
  {
    key: "gpuSharedPeakMiB",
    label: "显存共享峰值",
    unit: "MiB",
    lowerIsBetter: true,
    frameMetric: false,
  },
];

/**
 * 数据健康度校验：计划要求「资源样本不少于 10、帧样本非空、进程树包含
 * WebView2/GPU 子进程」。任一 lane 的任一场景不满足，都要让读者立刻看到。
 */
function buildHealthLines(
  results: RunResult[],
  baselineLabel: string,
  candidateLabel: string
): string[] {
  const lines: string[] = ["## 数据健康度", ""];
  const issues: string[] = [];
  for (const result of results) {
    for (const scenario of result.scenarios) {
      const tag = `${result.label} run${result.runIndex}/${scenario.scenarioId}`;
      if (!scenario.frames || scenario.frames.samples === 0) {
        issues.push(`${tag}: 帧样本为空`);
      }
      if (scenario.resources.samples < MIN_RESOURCE_SAMPLES) {
        issues.push(
          `${tag}: 资源样本 ${scenario.resources.samples} < ${MIN_RESOURCE_SAMPLES}`
        );
      }
      if (!scenario.resources.hasWebView2Process) {
        issues.push(`${tag}: 采样期间未见 WebView2 渲染进程`);
      }
      if (!scenario.resources.hasGpuProcess) {
        issues.push(`${tag}: 采样期间未见 WebView2 GPU 子进程`);
      }
    }
  }
  const relevant = results.filter(
    (item) => item.label === baselineLabel || item.label === candidateLabel
  );
  lines.push(
    `- 参与汇总的运行记录：${relevant.length} 条（baseline / candidate），逐场景校验：资源样本 ≥ ${MIN_RESOURCE_SAMPLES}、帧样本非空、进程树含 WebView2 与 GPU 子进程。`
  );
  if (issues.length === 0) {
    lines.push("- 校验结果：全部通过 ✅");
  } else {
    lines.push(`- 校验结果：${issues.length} 项异常 ⚠️`);
    for (const issue of issues) lines.push(`  - ${issue}`);
  }
  return lines;
}

export function buildComparisonMarkdown(
  results: RunResult[],
  options: { baselineLabel?: string; candidateLabel?: string } = {}
): string {  const baselineLabel = options.baselineLabel ?? "baseline";
  const candidateLabel = options.candidateLabel ?? "candidate";
  const baselineRuns = results.filter((item) => item.label === baselineLabel);
  const candidateRuns = results.filter((item) => item.label === candidateLabel);

  const lines: string[] = [];
  lines.push("# 玻璃材质性能对比");
  lines.push("");
  lines.push(`- 生成时间：${new Date().toISOString()}`);
  lines.push(
    `- baseline 轮次：${baselineRuns.length}（commit ${[...new Set(baselineRuns.map((item) => item.commit))].join(", ") || "-"}）`
  );
  lines.push(
    `- candidate 轮次：${candidateRuns.length}（commit ${[...new Set(candidateRuns.map((item) => item.commit))].join(", ") || "-"}）`
  );
  lines.push("- 单轮口径：每个场景取统计窗口内的中位数，跨轮再取中位数。");
  lines.push("");
  lines.push("## 判定");
  lines.push("");
  lines.push(
    "收益结论以 **CPU 核秒/秒、工作集峰值、GPU 3D 平均占用、显存峰值** 与 **帧时间分位数** 为准；" +
      "每条 lane 都通过 WebView2 CDP 使用相同的工作区导航与滚轮输入序列，并同时采集帧和资源指标。"
  );
  lines.push("");
  lines.push(...buildHealthLines(results, baselineLabel, candidateLabel));
  lines.push("");

  const scenarioIds = [
    ...new Set(
      results.flatMap((item) => item.scenarios.map((s) => s.scenarioId))
    ),
  ];
  for (const lane of ["release", "debug"] as const) {
    const baseline = aggregate(results, baselineLabel, lane);
    const candidate = aggregate(results, candidateLabel, lane);
    if (baseline.size === 0 && candidate.size === 0) continue;
    const metrics = METRIC_SPECS;
    lines.push(`## ${lane} lane`);
    lines.push("");
    for (const scenarioId of scenarioIds) {
      const baseMetrics = baseline.get(scenarioId);
      const candMetrics = candidate.get(scenarioId);
      if (!baseMetrics && !candMetrics) continue;
      lines.push(`### ${scenarioId}`);
      lines.push("");
      lines.push("| 指标 | baseline | candidate | 变化 | 判定 |");
      lines.push("| --- | ---: | ---: | ---: | --- |");
      for (const spec of metrics) {
        const baseValue = baseMetrics?.get(spec.key);
        const candValue = candMetrics?.get(spec.key);
        if (baseValue === undefined || candValue === undefined) continue;
        const delta = candValue - baseValue;
        const deltaPercent =
          baseValue === 0 ? 0 : (delta / Math.abs(baseValue)) * 100;
        const improved = spec.lowerIsBetter ? delta < 0 : delta > 0;
        const meaningful = Math.abs(deltaPercent) >= 3;
        const verdict = !meaningful ? "持平" : improved ? "✅ 改善" : "⚠️ 回退";
        lines.push(
          `| ${spec.label} | ${baseValue.toFixed(2)} | ${candValue.toFixed(2)} | ${deltaPercent >= 0 ? "+" : ""}${deltaPercent.toFixed(1)}% | ${verdict} |`
        );
      }
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

export function collectMetricRows(results: RunResult[]): MetricRow[] {
  const rows: MetricRow[] = [];
  for (const lane of ["release", "debug"] as const) {
    const baseline = aggregate(results, "baseline", lane);
    const candidate = aggregate(results, "candidate", lane);
    for (const scenarioId of baseline.keys()) {
      for (const spec of METRIC_SPECS) {
        const baseValue = baseline.get(scenarioId)?.get(spec.key);
        const candValue = candidate.get(scenarioId)?.get(spec.key);
        if (baseValue === undefined || candValue === undefined) continue;
        rows.push({
          scenario: scenarioId,
          lane,
          metric: spec.label,
          baseline: baseValue,
          candidate: candValue,
          delta: candValue - baseValue,
          deltaPercent:
            baseValue === 0
              ? 0
              : ((candValue - baseValue) / Math.abs(baseValue)) * 100,
          unit: spec.unit,
          lowerIsBetter: spec.lowerIsBetter,
        });
      }
    }
  }
  return rows;
}
