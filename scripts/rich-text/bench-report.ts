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

import {
  distribution,
  type BenchReport,
  type BenchResult,
} from "./bench-shared";

export function renderBenchReport(report: BenchReport): string {
  const { metadata: m, results, corpus } = report;
  const number = (value: number) => value.toFixed(value < 1 ? 4 : 2);
  const range = (values: number[]) => {
    const d = distribution(values);
    return `${number(d.min)}–${number(d.max)}`;
  };
  const ok = results.filter((row) => row.status === "ok");
  const failures = results.filter((row) => row.status !== "ok");
  const lines = [
    "# 富文本解析性能对照",
    "",
    `生成时间：${m.createdAt}`,
    "",
    `- 环境：${m.runtime}；${m.os}；${m.cpu}（${m.logicalCpus} 逻辑核）`,
    `- 当前源码：${m.sourceRevision}；旧版：${m.baselineRevision ?? "未启用"}；markdown-it：${m.markdownItVersion}`,
    `- 执行路径：${m.execution}`,
    `- 配置：${m.rounds} 轮；每轮预热 ${m.settings.warmup} 次、单次样本 ${m.settings.samples} 个、批量样本 ${m.settings.batches} 个；目标批长 ${m.settings.batchMs} ms；顺序种子 ${m.seed}`,
    `- 任务：${results.length}；成功 ${ok.length}；失败/超时 ${failures.length}`,
    "",
    "## 读数口径",
    "",
    "- 静态中位数来自批量计时的平均单次耗时；P95 来自单次调用样本。吞吐量按 UTF-8 字节数计算。",
    "- 每种实现依次运行，按固定种子交错顺序；冷启动、输入传输、归一化、HTML 生成和报告写入在计时区外。保留原始样本与 GC 抖动。",
    "- 项目解析器输出 AST（含项目处理），markdown-it 输出 token。语义列使用已有适配器与当前项目输出比较：一致、差异或适配器待支持。",
    "- 流式总耗时包含边界扫描、解析、diff、patch 入队及实际 patch 应用；每块后同步刷新，测量连续计算能力。真实 Worker 传输、帧调度、Vue/DOM 与输入等待留待 WebView 回放。",
    "- 项目流式护栏开启；patch 状态层节流关闭。每个流式组合首轮先完整预热一次。markdown-it 按累计前缀重解析，计时范围仅解析，收尾列记 0。",
    "- 同版完成态必须与完整解析等价；不一致的记录单列。跨版本内容变化可在正确性修复中出现，应结合节点数及语义差异阅读。项目扩展样本的外部库读数缺少对应扩展处理，跨库结论优先参考语义一致样本。",
    "",
    "## 静态解析",
    "",
    "| 输入 | UTF-8 KiB | 实现 | 中位 ms [轮中位范围] | 单次 P95 ms | MiB/s | 产物节点 | 与当前语义 |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |",
  ];
  const engines = [...new Set(results.map((row) => row.engine))];
  for (const input of corpus) {
    const current = ok.find(
      (row) =>
        row.mode === "static" &&
        row.caseId === input.id &&
        row.engine === "current"
    )?.static;
    for (const engine of engines) {
      const rows = ok.filter(
        (row) =>
          row.mode === "static" &&
          row.caseId === input.id &&
          row.engine === engine
      );
      if (!rows.length) continue;
      const median = distribution(
        rows.flatMap((row) => row.static!.batchPerOpMs)
      ).median;
      const single = distribution(rows.flatMap((row) => row.static!.singleMs));
      const value = rows[0].static!;
      const semantic =
        value.semanticSignature && current?.semanticSignature
          ? value.semanticSignature === current.semanticSignature
            ? "一致"
            : "差异"
          : "适配器待支持";
      lines.push(
        `| ${input.id} | ${number(input.bytes / 1024)} | ${engine} | ${number(median)} [${range(rows.map((row) => distribution(row.static!.batchPerOpMs).median))}] | ${number(single.p95)} | ${number(input.bytes / 1048576 / (median / 1000))} | ${value.outputNodes} | ${semantic} |`
      );
    }
  }
  lines.push(
    "",
    "## 流式计算",
    "",
    "| 输入 | 块长 | 实现 | 总计中位 ms [轮范围] | 更新 P95 ms | 收尾 ms | 解析 ms | Patch 应用 ms | 重解析/输入 | Patch 数 | 完成态 |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  );
  for (const input of corpus)
    for (const chunkSize of m.chunkSizes)
      for (const engine of engines) {
        const rows = ok.filter(
          (row) =>
            row.mode === "stream" &&
            row.caseId === input.id &&
            row.chunkSize === chunkSize &&
            row.engine === engine
        );
        if (!rows.length) continue;
        const values = rows.map((row) => row.stream!);
        const median = (
          key:
            | "totalMs"
            | "finalizeMs"
            | "patchApplyMs"
            | "parseMs"
            | "parsedCharacters"
            | "patchCount"
        ) => distribution(values.map((value) => value[key])).median;
        lines.push(
          `| ${input.id} | ${chunkSize} | ${engine} | ${number(median("totalMs"))} [${range(values.map((value) => value.totalMs))}] | ${number(distribution(values.flatMap((value) => value.updateMs)).p95)} | ${number(median("finalizeMs"))} | ${number(median("parseMs"))} | ${number(median("patchApplyMs"))} | ${number(median("parsedCharacters") / input.characters)}× | ${median("patchCount")} | ${values.every((value) => value.finalMatches) ? "一致" : "**差异**"} |`
        );
      }
  lines.push("", "## 自身版本变化（按增加的绝对耗时排序）", "");
  const changes: {
    label: string;
    before: number;
    after: number;
    equal: boolean;
  }[] = [];
  for (const input of corpus)
    for (const mode of ["static", "stream"] as const)
      for (const chunk of mode === "static" ? [0] : m.chunkSizes) {
        const rows = (engine: string) =>
          ok.filter(
            (row) =>
              row.engine === engine &&
              row.caseId === input.id &&
              row.mode === mode &&
              row.chunkSize === chunk
          );
        const before = rows("baseline"),
          after = rows("current");
        if (!before.length || !after.length) continue;
        const time = (rows: BenchResult[]) =>
          distribution(
            rows.flatMap(
              (row) => row.static?.batchPerOpMs ?? [row.stream!.totalMs]
            )
          ).median;
        changes.push({
          label: input.id + "/" + mode + (chunk ? "/" + chunk : ""),
          before: time(before),
          after: time(after),
          equal:
            (before[0].static?.outputSignature ??
              before[0].stream?.outputSignature) ===
            (after[0].static?.outputSignature ??
              after[0].stream?.outputSignature),
        });
      }
  for (const change of changes
    .sort((a, b) => b.after - b.before - (a.after - a.before))
    .slice(0, 10)) {
    lines.push(
      `- ${change.label}：${number(change.before)} → ${number(change.after)} ms，${number(change.after / change.before)}×；归一化产物${change.equal ? "相同" : "有变化"}。`
    );
  }
  lines.push("", "## 异常与校验", "");
  for (const row of failures)
    lines.push(
      `- ${row.caseId}/${row.mode}/${row.chunkSize}/${row.engine}/轮 ${row.round + 1}：${row.status}；${row.error?.replaceAll("\n", " ")}`
    );
  for (const row of ok.filter((row) => row.stream && !row.stream.finalMatches))
    lines.push(
      `- 完成态差异：${row.caseId}/${row.chunkSize}/${row.engine}/轮 ${row.round + 1}；${JSON.stringify(row.stream?.finalDifference)}`
    );
  if (
    !failures.length &&
    ok.every((row) => !row.stream || row.stream.finalMatches)
  )
    lines.push("所有执行任务成功，已测流式组合完成态与同版完整解析一致。");
  if (m.sourceChanges)
    lines.push(
      "",
      "## 运行时工作区变更",
      "",
      "```text",
      m.sourceChanges,
      "```"
    );
  return lines.join("\n") + "\n";
}
