// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { distribution } from "./bench-shared";
import type { TauriPerformanceSample } from "./tauri-performance-page";

export function summarizeTauriPerformance(sample: TauriPerformanceSample) {
  const start = sample.mode === "stream" ? sample.sendStartAt : sample.startAt;
  const end = sample.finalContentFrameAt;
  const frames = [
    ...new Set(sample.frames.filter((at) => at >= start && at <= end)),
  ];
  const updateFrames = [
    ...new Set(sample.commitFrames.filter((at) => at >= start && at <= end)),
  ];
  const gaps = (times: number[]) =>
    times.slice(1).map((at, i) => at - times[i]);
  const stats = (values: number[]) =>
    values.length ? distribution(values) : null;
  const updateWait: number[] = [];
  let cursor = 0;
  for (const delivery of sample.deliveries) {
    // A frame scheduled by an earlier commit cannot acknowledge a later delivery.
    while (
      cursor < sample.commits.length &&
      sample.commits[cursor].committedAt < delivery.deliveredAt
    )
      cursor++;
    const commit = sample.commits[cursor];
    if (commit && commit.frameAt <= end)
      updateWait.push(commit.frameAt - delivery.deliveredAt);
  }
  const longTasks = sample.longTasks.filter(
    (task) => task.startTime < end && task.startTime + task.duration > start
  );
  return {
    firstContentFrameMs: updateFrames.length ? updateFrames[0] - start : null,
    mountMs: sample.mountedAt - sample.startAt,
    totalMs: end - start,
    completionMs:
      sample.mode === "stream"
        ? Math.max(0, end - sample.finishRequestedAt)
        : null,
    validationMs: sample.validationMs,
    postValidationFrameMs: end - sample.verifiedAt,
    deliveryCount: sample.deliveries.length,
    deliveryLatenessMs: stats(
      sample.deliveries.map((x) => Math.max(0, x.deliveredAt - x.scheduledAt))
    ),
    nextCommitFrameWaitMs: stats(updateWait),
    deliveriesWithSubsequentCommit: updateWait.length,
    frameGapMs: stats(gaps(frames)),
    commitFrameGapMs: stats(gaps(updateFrames)),
    commitFrameCount: updateFrames.length,
    longTaskCount: sample.longTaskSupported === false ? null : longTasks.length,
    longTaskTotalMs:
      sample.longTaskSupported === false
        ? null
        : longTasks.reduce(
            (sum, task) =>
              sum +
              Math.max(
                0,
                Math.min(end, task.startTime + task.duration) -
                  Math.max(start, task.startTime)
              ),
            0
          ),
    longestTaskMs:
      sample.longTaskSupported === false
        ? null
        : Math.max(0, ...longTasks.map((x) => x.duration)),
  };
}

export interface TauriPerformanceRow {
  caseId: string;
  cycle: number;
  sample: TauriPerformanceSample;
  summary: ReturnType<typeof summarizeTauriPerformance>;
  afterDispose: TauriPerformanceSample["components"];
  cdpMetrics: Record<string, number>;
}

export function renderTauriPerformanceReport(
  rows: TauriPerformanceRow[]
): string {
  const ms = (value: number | null | undefined) =>
    value == null ? "—" : value.toFixed(2);
  const lines = [
    "# Tauri 富文本界面性能采样",
    "",
    "首屏为非空组件提交后的双 rAF 绘制机会；流式计时从首块发送开始，静态计时从挂载开始。",
    "更新等待是每块发送后下一次组件提交至绘制机会的时差；流式合并、节流会让多个 chunk 共用提交，数据只表达调度响应。",
    "完成延迟为结束信号到最终 AST 校验通过后双 rAF 绘制机会的上界，包含单列的校验开销；静态模式以总耗时表示。重型节点内部异步工作与实际像素呈现另行解释。",
    "引擎缺少的长任务或 CDP 指标记为不可用；界面时序继续采集 rAF 与组件提交。",
    "固定节奏在页内按绝对时间发送，拥塞后的追赶和迟发通过原始时间戳与发送迟延保存。所有数据含可选生命周期计数开销。",
    "",
    "| 输入 | 模式 | 轮次 | 首屏 ms | 更新等待 P95 ms | 帧间隔 P95 / 最大 ms | 完成上界 / 校验 ms | 长任务 数 / 总 ms / 最大 ms | 提交帧 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const row of rows) {
    const s = row.summary;
    lines.push(
      "| " +
        [
          row.caseId,
          row.sample.mode,
          row.cycle,
          ms(s.firstContentFrameMs),
          ms(s.nextCommitFrameWaitMs?.p95),
          ms(s.frameGapMs?.p95) + " / " + ms(s.frameGapMs?.max),
          ms(s.completionMs) + " / " + ms(s.validationMs),
          (s.longTaskCount ?? "—") +
            " / " +
            ms(s.longTaskTotalMs) +
            " / " +
            ms(s.longestTaskMs),
          s.commitFrameCount,
        ].join(" | ") +
        " |"
    );
  }
  lines.push(
    "",
    "## 组件生命周期",
    "",
    "挂载、更新、卸载为探针局部 Vue 应用的 hook 计数；更新次数表达调用量，单次耗时需结合 CPU trace。",
    ""
  );
  for (const row of rows) {
    lines.push(
      "### " + row.caseId + " · " + row.sample.mode + " · " + row.cycle,
      "",
      "| 组件 | 挂载 | 更新 | 卸载 |",
      "| --- | ---: | ---: | ---: |"
    );
    for (const [name, count] of Object.entries(row.afterDispose)
      .sort(
        (a, b) => b[1].updated + b[1].mounted - (a[1].updated + a[1].mounted)
      )
      .slice(0, 15))
      lines.push(
        "| " +
          [name, count.mounted, count.updated, count.unmounted].join(" | ") +
          " |"
      );
    lines.push("");
  }
  return lines.join("\n") + "\n";
}
