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

export interface MemorySample {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
}
export interface MemoryCheckpoint extends MemorySample {
  jscHeapSize: number;
  jscExtraMemory: number;
  objectCount: number;
}
export interface MemoryJob {
  root: string;
  markdown: string;
  chunkSize: number;
  cycles: number;
  yieldEvery: number;
  tokenizerTransport: "inline" | "worker";
}
export interface MemoryCycle {
  peak: MemorySample;
  completed: MemorySample;
  retained: MemoryCheckpoint;
  released: MemoryCheckpoint;
}
export interface MemoryMeasurement {
  pid: number;
  baseline: MemoryCheckpoint;
  startupPeakRss: number;
  processPeakRss: number;
  processPeakCommit: number;
  cycles: MemoryCycle[];
  finalMatches: boolean;
  outputSignature: string;
}
export interface MemoryResult {
  engine: string;
  caseId: string;
  round: number;
  status: "ok" | "error";
  measurement?: MemoryMeasurement;
  error?: string;
}
export interface MemoryReport {
  metadata: {
    createdAt: string;
    runtime: string;
    platform: string;
    cpu: string;
    sourceRevision: string;
    sourceChanges: string;
    rounds: number;
    cycles: number;
    chunkSize: number;
    yieldEvery: number;
    tokenizerTransport: "inline" | "worker";
    seed: number;
    engines: { id: string; revision: string }[];
  };
  corpus: { id: string; bytes: number; characters: number }[];
  results: MemoryResult[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function renderMemoryReport(report: MemoryReport): string {
  const { metadata: m, results } = report;
  const good = results.filter((r) => r.status === "ok");
  const changedOutputs = report.corpus.filter(
    (input) =>
      new Set(
        good
          .filter((row) => row.caseId === input.id)
          .map((row) => row.measurement!.outputSignature)
      ).size > 1
  );
  const mib = (n: number) => (n / 1024 / 1024).toFixed(2);
  const lines = [
    "# 富文本计算管线内存对照",
    "",
    "生成时间：" + m.createdAt,
    "",
    "- 环境：" + m.runtime + "；" + m.platform + "；" + m.cpu,
    "- 版本：" + m.engines.map((e) => e.id + " = " + e.revision).join("；"),
    "- 配置：" +
      m.rounds +
      " 轮；每个独立进程连续 " +
      m.cycles +
      " 个完整生命周期；块长 " +
      m.chunkSize +
      " UTF-16 单元；顺序种子 " +
      m.seed,
    "- 任务：" +
      results.length +
      "；成功 " +
      good.length +
      "；失败 " +
      (results.length - good.length),
    "",
    "- 跨版本归一化产物差异：" + changedOutputs.length,
    "",
    "- 额外事件循环让出：" +
      (m.yieldEvery ? "每 " + m.yieldEvery + " 块让出一次" : "关闭"),
    "",
    "- 分词传输：" + (m.tokenizerTransport || "inline"),
    "",
    "## 口径",
    "",
    "- 每个版本/输入/轮次启动独立 Bun 进程；输入和模块加载后先做固定小样本预热，再 GC 两次建立起点。父进程的语料生成与报告写入独立于测量进程。",
    "- 每块解析与补丁应用后采样 RSS、heapUsed、heapTotal、external；采样峰值可能漏过块内短暂峰值。进程 RSS/commit 峰值另由 bun:jsc.memoryUsage() 读取，包含模块加载、预热、检查点和多个生命周期；记录在最后一轮语义校验之前。",
    "- 每个生命周期完整解析后先记录自然回收状态，再强制 GC 两次测量仍持有 AST 的堆；destroy/dispose 且函数返回后再 GC 两次测释放后堆。块内沿用自然 GC。",
    "- GC 后堆使用 bun:jsc.heapStats().heapSize；其中的 extraMemorySize 子项单列，二者按包含关系读取。释放后增量包含模块/JIT、运行时缓存和少量采样记录；末轮释放点还包含产物校验后的运行时成本，需结合多轮范围与连续周期曲线判断。",
    "- inline 模式沿用同版同步 Tokenizer 的异步封装；worker 模式调用原有 tokenizerService 和 Bun Worker，RSS 包含分词线程，堆检查点仅含主线程 isolate；共享 Worker 在各周期保留，任务结束后终止。两种传输会影响字符串复制和调度，分别汇总。",
    "- 最后一个周期在内存峰值与持有量取样后比较流式完成态和完整解析，跨版本再比较归一化输出。此次测试覆盖 Bun 计算管线；Tauri WebView 内的 Worker、Vue/DOM 与重型节点另测。",
    "- 本入口带有内存采样和主动 GC；耗时收益继续使用 rich-text:bench。所有数值为 MiB；汇总取独立进程结果的中位数，保留范围。",
    "",
    "## 汇总",
    "",
    "| 输入 | 版本 | 起点 RSS | 进程峰值 RSS [范围] | 进程峰值 commit | 块后采样峰值 heapUsed | 完成持有堆 | 其中 extra | 最后释放 RSS | 最后释放堆 | 释放堆较起点增量 | 释放周期末−首 | 完成态 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const input of report.corpus)
    for (const engine of m.engines) {
      const rows = good
        .filter((r) => r.caseId === input.id && r.engine === engine.id)
        .map((r) => r.measurement!);
      if (!rows.length) continue;
      const med = (get: (r: MemoryMeasurement) => number) =>
        mib(median(rows.map(get)));
      const peak = rows.map((r) => r.processPeakRss);
      lines.push(
        "| " +
          [
            input.id,
            engine.id,
            med((r) => r.baseline.rss),
            med((r) => r.processPeakRss) +
              " [" +
              mib(Math.min(...peak)) +
              "–" +
              mib(Math.max(...peak)) +
              "]",
            med((r) => r.processPeakCommit),
            med((r) => Math.max(...r.cycles.map((c) => c.peak.heapUsed))),
            med((r) => r.cycles[r.cycles.length - 1].retained.jscHeapSize),
            med((r) => r.cycles[r.cycles.length - 1].retained.jscExtraMemory),
            med((r) => r.cycles[r.cycles.length - 1].released.rss),
            med((r) => r.cycles[r.cycles.length - 1].released.jscHeapSize),
            med(
              (r) =>
                r.cycles[r.cycles.length - 1].released.jscHeapSize -
                r.baseline.jscHeapSize
            ),
            med(
              (r) =>
                r.cycles[r.cycles.length - 1].released.jscHeapSize -
                r.cycles[0].released.jscHeapSize
            ),
            rows.every((r) => r.finalMatches) ? "一致" : "**差异**",
          ].join(" | ") +
          " |"
      );
    }
  lines.push(
    "",
    "## 释放后堆曲线（各独立进程的中位数）",
    "",
    "| 输入 | 版本 | GC 起点 → 每次销毁并 GC 后的堆 MiB |",
    "| --- | --- | --- |"
  );
  for (const input of report.corpus)
    for (const engine of m.engines) {
      const rows = good
        .filter((r) => r.caseId === input.id && r.engine === engine.id)
        .map((r) => r.measurement!);
      if (!rows.length) continue;
      const points = [
        median(rows.map((r) => r.baseline.jscHeapSize)),
        ...Array.from({ length: m.cycles }, (_, i) =>
          median(rows.map((r) => r.cycles[i].released.jscHeapSize))
        ),
      ];
      lines.push(
        "| " +
          input.id +
          " | " +
          engine.id +
          " | " +
          points.map(mib).join(" → ") +
          " |"
      );
    }
  const failed = results.filter(
    (r) => r.status !== "ok" || !r.measurement?.finalMatches
  );
  if (failed.length)
    lines.push(
      "",
      "## 异常",
      "",
      ...failed.map(
        (r) =>
          "- " +
          r.caseId +
          "/" +
          r.engine +
          "/" +
          r.round +
          ": " +
          (r.error || "完成态差异")
      )
    );
  return lines.join("\n") + "\n";
}
