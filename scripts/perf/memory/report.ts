// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { ResourceSample } from "../resources";

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function summarizeMemory(samples: ResourceSample[], endedAt: number) {
  const tail = samples.filter((s) => s.at >= endedAt - 5000);
  const valid =
    samples.length >= 3 &&
    tail.length >= 2 &&
    samples.some((s) => s.hasWebView2Process);
  const kinds = ["native", "renderer", "gpu", "browser", "utility"] as const;
  return {
    valid,
    samples: samples.length,
    sampleAgeMs: samples.length ? endedAt - samples.at(-1)!.at : null,
    privatePeakBytes: samples.length
      ? Math.max(...samples.map((s) => s.privateBytes))
      : null,
    privateTailBytes: median(tail.map((s) => s.privateBytes)),
    workingSetPeakBytes: samples.length
      ? Math.max(...samples.map((s) => s.workingSetBytes))
      : null,
    workingSetTailBytes: median(tail.map((s) => s.workingSetBytes)),
    gpuDedicatedPeakBytes: samples.some((s) => s.gpuCountersAvailable)
      ? Math.max(
          ...samples
            .filter((s) => s.gpuCountersAvailable)
            .map((s) => s.gpuDedicatedBytes)
        )
      : null,
    gpuSharedPeakBytes: samples.some((s) => s.gpuCountersAvailable)
      ? Math.max(
          ...samples
            .filter((s) => s.gpuCountersAvailable)
            .map((s) => s.gpuSharedBytes)
        )
      : null,
    byKind: Object.fromEntries(
      kinds.map((kind) => [
        kind,
        {
          privateTailBytes: median(
            tail
              .filter((s) => s.processes !== undefined)
              .map(
                (s) =>
                  s.processes
                    ?.filter((p) => p.kind === kind)
                    .reduce((n, p) => n + p.privateBytes, 0) ?? 0
              )
          ),
          workingSetTailBytes: median(
            tail
              .filter((s) => s.processes !== undefined)
              .map(
                (s) =>
                  s.processes
                    ?.filter((p) => p.kind === kind)
                    .reduce((n, p) => n + p.workingSetBytes, 0) ?? 0
              )
          ),
        },
      ])
    ),
  };
}

export interface MemoryCheckpoint {
  phase: string;
  cycle: number;
  at: number;
  resources: ReturnType<typeof summarizeMemory>;
  heap: {
    usedSize: number;
    totalSize: number;
    embedderHeapUsedSize?: number;
    backingStorageSize?: number;
  };
  dom: { documents: number; nodes: number; jsEventListeners: number };
  page: {
    path: string;
    visibility: string;
    width: number;
    height: number;
    dpr: number;
    blur: string;
    wallpaper: string;
    messageCount: number;
    images: number;
    decodedImages: number;
    toolMessages: number;
    reasoningPanels: number;
    diagramErrors: number;
    imageErrors: number;
    codeBlocks?: number;
    pageEditors?: number;
    codeEditors?: number;
    codeFallbacks?: number;
    messageScrollTop?: number;
    messageScrollHeight?: number;
  };
}
export interface MemoryCaseResult {
  id: string;
  page: string;
  appearance: { id: string };
  round: number;
  status: "ok" | "failed";
  failure?: string;
  checkpoints: MemoryCheckpoint[];
}
function mib(value: number | null | undefined) {
  return value == null ? "—" : (value / 1048576).toFixed(1);
}
export function memoryMarkdown(
  results: MemoryCaseResult[],
  textMode?: "readable" | "masked"
): string {
  const lines = [
    "# 应用内存用量",
    "",
    ...(textMode
      ? [
          `语料模式：${textMode}。不同模式分开比较；可读语料仅限本机使用，分享前审阅。`,
          "",
        ]
      : []),
    "单位：MiB。Private 为整个应用进程树的私有提交量；WS 为进程工作集之和，含共享页重复计数。GPU 专用/共享用量单列；GPU 计数不可用显示 —。",
    "",
    "尾值为阶段最后 5 秒样本中位数；峰值为采样观测下界。返回首页后的保留量可能包含会话缓存，需结合多轮趋势与末轮 GC 诊断。",
    "页面编辑器统计当前文档中的全部 CodeMirror，包含聊天输入区；源码查看器专用计数 codeEditors 在 JSON 中另列。离开聊天后，文档计数无法反映 KeepAlive 的脱离文档子树，需结合全局 DOM 与堆诊断。",
    "",
    "| 页面 | 配置 | 轮次 | 阶段 | Private 尾值 | Private 峰值 | WS 尾值 | GPU 专用峰值 | GPU 共享峰值 | 页面 JS Heap | DOM 节点 | 代码块 / 页面编辑器 / 源码预览 | 采样 |",
    "|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|",
  ];
  for (const result of results) {
    for (const c of result.checkpoints)
      lines.push(
        `| ${result.page} | ${result.appearance.id} | ${result.round} | ${c.phase}:${c.cycle} | ${mib(c.resources.privateTailBytes)} | ${mib(c.resources.privatePeakBytes)} | ${mib(c.resources.workingSetTailBytes)} | ${mib(c.resources.gpuDedicatedPeakBytes)} | ${mib(c.resources.gpuSharedPeakBytes)} | ${mib(c.heap.usedSize)} | ${c.dom.nodes} | ${c.page.codeBlocks ?? "—"} / ${c.page.pageEditors ?? "—"} / ${c.page.codeFallbacks ?? "—"} | ${c.resources.valid ? "有效" : "稀疏/不可用"} |`
      );
    if (result.status === "failed")
      lines.push(
        `\n采集失败：${result.id}（${result.failure ?? "查看结果 JSON"}）。\n`
      );
  }
  lines.push(
    "",
    "## 同配置重复轮次",
    "",
    "| 页面 / 配置 | 阶段 | 有效轮数 | Private 尾值中位数 | 范围 |",
    "|---|---|---:|---:|---|"
  );
  const groups = new Map<string, number[]>();
  for (const result of results.filter((r) => r.status === "ok"))
    for (const c of result.checkpoints) {
      if (!c.resources.valid || c.resources.privateTailBytes == null) continue;
      const key = `${result.page} / ${result.appearance.id}|${c.phase}:${c.cycle}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c.resources.privateTailBytes);
    }
  for (const [key, values] of groups) {
    const [group, phase] = key.split("|");
    lines.push(
      `| ${group} | ${phase} | ${values.length} | ${mib(median(values))} | ${mib(Math.min(...values))}–${mib(Math.max(...values))} |`
    );
  }
  lines.push(
    "",
    "## 返回首页保留量",
    "",
    "| 页面 | 配置 | 轮次 | 循环 | 相对首次首页 Private | 相对首次首页 JS Heap |",
    "|---|---|---:|---:|---:|---:|"
  );
  for (const result of results) {
    const first = result.checkpoints.find((c) => c.phase === "home");
    if (!first?.resources.valid || first.resources.privateTailBytes == null)
      continue;
    for (const c of result.checkpoints.filter(
      (c) => c.phase === "return-home" || c.phase === "after-gc"
    )) {
      if (!c.resources.valid || c.resources.privateTailBytes == null) continue;
      lines.push(
        `| ${result.page} | ${result.appearance.id} | ${result.round} | ${c.phase}:${c.cycle} | ${mib(c.resources.privateTailBytes - first.resources.privateTailBytes)} | ${mib(c.heap.usedSize - first.heap.usedSize)} |`
      );
    }
  }
  return lines.join("\n") + "\n";
}
