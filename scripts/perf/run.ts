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
 * 玻璃材质性能对比 runner。
 *
 * 用法：
 *   bun scripts/perf/run.ts --lane release --label baseline  --binary <release.exe> --runs 3
 *   bun scripts/perf/run.ts --lane release --label candidate --binary <release.exe> --runs 3
 *   bun scripts/perf/run.ts --lane debug   --label baseline  --binary <debug.exe>   --runs 3
 *   bun scripts/perf/run.ts --report
 *
 * 设计约束：
 * - 同一lane的 baseline / candidate 必须使用同一二进制格式（release 对 release）。
 * - 每轮使用独立 data-dir 与独立 WebView2 profile，播种完全一致的聊天 fixture。
 * - 结果逐个场景落盘，中断时已完成的轮次仍然可用。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  buildPerfFixture,
  writePerfFixture,
  type PerfFixtureManifest,
} from "./fixture";
import {
  connectFrameProbe,
  frameSamplingExpression,
  openLlmChatAndWait,
  startCdpWheelScroll,
  verifyTallMessageSlices,
  summarizeFrames,
} from "./frames";
import {
  MIN_RESOURCE_SAMPLES,
  RESOURCE_SAMPLE_INTERVAL_MS,
  startResourceCollector,
} from "./resources";
import { PERF_SCENARIOS, CHAT_SCROLL_SELECTOR } from "./scenarios";
import { killTree, launchApp, sleep, waitForMainWindow } from "./launch";
import {
  buildComparisonMarkdown,
  collectMetricRows,
  readRunResults,
  writeRunResult,
  type RunResult,
  type ScenarioResult,
} from "./report";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const resultsRoot = path.join(
  projectRoot,
  ".dev-data",
  "perf-results",
  "glass-material"
);
const runsRoot = path.join(projectRoot, ".dev-data", "perf-runs");

interface CliOptions {
  lane: "release" | "debug";
  label: string;
  binary: string;
  runs: number;
  scenarios: string[];
  reportOnly: boolean;
  keepData: boolean;
  cdpPort: number;
}

function printHelp(): void {
  console.log(`玻璃材质性能对比 runner

构建 release 性能版本:
  bun run build:perf

用法:
  bun scripts/perf/run.ts --lane <release|debug> --label <baseline|candidate> --binary <path> [选项]
  bun scripts/perf/run.ts --report

选项:
  --lane <release|debug>   采集通道；release 二进制需启用 perf-instrumentation
  --label <name>           结果标签，对比固定使用 baseline / candidate
  --binary <path>          被测可执行文件
  --runs <n>               轮次，默认 3
  --scenarios <a,b>        仅运行指定场景
  --cdp-port <port>        WebView2 loopback CDP 端口，默认 9333
  --keep-data              保留每次运行的 data-dir
  --report                 只根据已有结果重新生成 comparison.md
  -h, --help               显示帮助
`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    lane: "release",
    label: "baseline",
    binary: "",
    runs: 3,
    scenarios: PERF_SCENARIOS.map((item) => item.id),
    reportOnly: false,
    keepData: false,
    cdpPort: 9333,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const readValue = (name: string): string => {
      const value = args[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error(`${name} 需要提供取值`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--lane": {
        const lane = readValue(arg);
        if (lane !== "release" && lane !== "debug") {
          throw new Error("--lane 仅支持 release 或 debug");
        }
        options.lane = lane;
        break;
      }
      case "--label":
        options.label = readValue(arg);
        break;
      case "--binary":
        options.binary = readValue(arg);
        break;
      case "--runs":
        options.runs = Number(readValue(arg));
        break;
      case "--cdp-port":
        options.cdpPort = Number(readValue(arg));
        break;
      case "--scenarios":
        options.scenarios = readValue(arg)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        break;
      case "--keep-data":
        options.keepData = true;
        break;
      case "--report":
        options.reportOnly = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`未知参数: ${arg}`);
    }
  }
  if (options.reportOnly) return options;
  if (!options.binary) throw new Error("--binary 为必填项");
  if (!Number.isInteger(options.runs) || options.runs < 1) {
    throw new Error("--runs 必须是正整数");
  }
  if (!fs.existsSync(options.binary)) {
    throw new Error(`二进制不存在: ${options.binary}`);
  }
  return options;
}

function sha256(file: string): string {
  return createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex")
    .toUpperCase();
}

function gitCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function hostInfo(): RunResult["host"] {
  const gpus: string[] = [];
  try {
    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-CimInstance Win32_VideoController).Name -join '|'",
      ],
      { encoding: "utf8", windowsHide: true }
    ).trim();
    if (output) gpus.push(...output.split("|").filter(Boolean));
  } catch {
    // 忽略：GPU 名称仅用于记录。
  }
  let cpu = os.cpus()[0]?.model ?? "unknown";
  return {
    platform: `${os.platform()} ${os.release()}`,
    release: os.version(),
    cpu,
    memoryBytes: os.totalmem(),
    gpus,
  };
}

/**
 * 运行单个场景。
 *
 * 两种 lane 都通过 CDP Input domain 产生一致的滚轮事件，并在同一个真实 WebView2
 * 中采集 rAF、CPU、GPU 与显存。整个过程不触碰系统鼠标、键盘或前台焦点。
 */
async function runScenario(options: {
  scenario: (typeof PERF_SCENARIOS)[number];
  appPid: number;
  probe: Awaited<ReturnType<typeof connectFrameProbe>>;
}): Promise<ScenarioResult> {
  const { scenario, appPid, probe } = options;
  const notes: string[] = [];

  const runWindow = async (
    durationMs: number,
    collectFrames: boolean
  ): Promise<ScenarioResult["frames"]> => {
    const framesPromise: Promise<ScenarioResult["frames"]> = collectFrames
      ? probe
          .evaluate<{ frameTimes: number[] }>(
            frameSamplingExpression({ durationMs })
          )
          .then((sample) => summarizeFrames(sample.frameTimes))
          .catch((error: unknown) => {
            notes.push(
              `frame sampling failed: ${error instanceof Error ? error.message : String(error)}`
            );
            return null;
          })
      : Promise.resolve(null);

    const wheel = scenario.scroll
      ? await startCdpWheelScroll(probe, CHAT_SCROLL_SELECTOR, {
          durationMs,
          stepPx: scenario.scrollStepPx ?? 320,
          intervalMs: scenario.stepIntervalMs ?? 16,
        })
      : null;

    const [frames] = await Promise.all([
      framesPromise,
      wheel ? wheel.done : sleep(durationMs),
    ]);
    wheel?.stop();
    return frames;
  };

  await runWindow(scenario.warmupMs, false);

  const collector = startResourceCollector(appPid, {
    intervalMs: RESOURCE_SAMPLE_INTERVAL_MS,
  });
  const startedAt = Date.now();
  const frames = await runWindow(scenario.durationMs, true);
  // 先记录测量窗口长度，再停止采样；避免 stop() 的排队等待时间被算进窗口。
  const elapsed = Date.now() - startedAt;
  const resources = await collector.stop();
  if (Math.abs(elapsed - scenario.durationMs) > scenario.durationMs * 0.5) {
    notes.push(
      `measure window deviated: ${elapsed}ms vs expected ${scenario.durationMs}ms`
    );
  }
  if (!frames || frames.samples === 0) {
    notes.push("frame sampling produced no samples");
  }
  if (resources.samples < MIN_RESOURCE_SAMPLES) {
    notes.push(
      `resource sampling too sparse: ${resources.samples} sample(s) < ${MIN_RESOURCE_SAMPLES} — GPU/CPU deltas will be unreliable`
    );
  }
  if (!resources.hasWebView2Process) {
    notes.push(
      "process tree contained no WebView2 renderer (msedgewebview2) during sampling"
    );
  }
  if (!resources.hasGpuProcess) {
    notes.push(
      "process tree contained no WebView2 GPU process (--type=gpu-process) during sampling"
    );
  }

  return {
    scenarioId: scenario.id,
    description: scenario.description,
    scroll: scenario.scroll,
    durationMs: scenario.durationMs,
    frames,
    resources,
    notes: notes.length > 0 ? notes : undefined,
  };
}

async function runOnce(
  options: CliOptions,
  runIndex: number,
  fixture: PerfFixtureManifest
): Promise<RunResult> {
  const runDir = path.join(
    runsRoot,
    `glass-${options.lane}-${options.label}-run${runIndex}`
  );
  const dataDir = path.join(runDir, "data");
  fs.rmSync(runDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  writePerfFixture(dataDir, buildPerfFixture());

  const startedAt = new Date().toISOString();
  const app = launchApp({
    binary: options.binary,
    dataDir,
    cdpPort: options.cdpPort,
  });

  let probe: Awaited<ReturnType<typeof connectFrameProbe>> | null = null;
  const scenarios: ScenarioResult[] = [];
  try {
    await waitForMainWindow(app.pid);
    probe = await connectFrameProbe(options.cdpPort, {
      targetUrlIncludes: "tauri.localhost",
    });
    await openLlmChatAndWait(probe, { anchorText: "[239-0]" });
    // 冷启动之后的稳定期：等待首帧布局与壁纸解码完成。
    await sleep(3_000);
    await probe.waitForSelector(CHAT_SCROLL_SELECTOR, 60_000);
    const tallMessageChecks = await verifyTallMessageSlices(
      probe,
      fixture.tallMessageIds
    );
    console.log(
      `  超高消息背景切片已验证: ${tallMessageChecks.length} 条，` +
        `高度 ${Math.min(...tallMessageChecks.map((item) => item.height))}–` +
        `${Math.max(...tallMessageChecks.map((item) => item.height))}px`
    );

    for (const scenarioId of options.scenarios) {
      const scenario = PERF_SCENARIOS.find((item) => item.id === scenarioId);
      if (!scenario) throw new Error(`未知场景: ${scenarioId}`);
      const result = await runScenario({
        scenario,
        appPid: app.pid,
        probe,
      });
      scenarios.push(result);
      console.log(
        `  [${options.label} run ${runIndex}] ${scenario.id}: ` +
          `fps=${result.frames ? result.frames.fps.toFixed(1) : "n/a"} ` +
          `cpu=${result.resources.cpuSecondsPerSecond.toFixed(2)}core/s ` +
          `gpu=${result.resources.gpu3dAvgPercent.toFixed(1)}% ` +
          `vram=${(result.resources.gpuDedicatedPeakBytes / 1048576).toFixed(0)}MiB`
      );
      await sleep(1_500);
    }
  } finally {
    await probe?.close();
    await app.stop();
    await killTree(app.pid);
    if (!options.keepData) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  }

  const result: RunResult = {
    label: options.label,
    lane: options.lane,
    commit: gitCommit(),
    binary: path.resolve(options.binary),
    binarySha256: sha256(options.binary),
    runIndex,
    startedAt,
    finishedAt: new Date().toISOString(),
    host: hostInfo(),
    fixture,
    scenarios,
  };
  writeRunResult(resultsRoot, result);
  return result;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(resultsRoot, { recursive: true });

  if (options.reportOnly) {
    const results = readRunResults(resultsRoot);
    if (results.length === 0) {
      throw new Error(`没有可用的性能结果: ${resultsRoot}`);
    }
    const markdown = buildComparisonMarkdown(results);
    const target = path.join(resultsRoot, "comparison.md");
    fs.writeFileSync(target, markdown, "utf8");
    for (const row of collectMetricRows(results)) {
      console.log(
        `${row.lane} ${row.scenario} ${row.metric}: ${row.baseline.toFixed(2)} -> ${row.candidate.toFixed(2)} (${row.deltaPercent >= 0 ? "+" : ""}${row.deltaPercent.toFixed(1)}%)`
      );
    }
    console.log(`已写入 ${target}`);
    return;
  }

  const fixture = buildPerfFixture().manifest;
  console.log(
    `性能采集: lane=${options.lane} label=${options.label} runs=${options.runs} ` +
      `scenarios=${options.scenarios.join(",")} binary=${path.basename(options.binary)}`
  );
  console.log(
    `fixture: ${fixture.messageCount} 条消息 / ${fixture.paragraphCount} 段常规消息 / ` +
      `${fixture.tallMessageCount} 条 ${fixture.tallMessageParagraphCount} 段超高消息`
  );
  console.log(`输出目录: ${resultsRoot}
`);

  for (let runIndex = 1; runIndex <= options.runs; runIndex += 1) {
    console.log(`[run ${runIndex}/${options.runs}] 启动应用...`);
    await runOnce(options, runIndex, fixture);
  }

  const results = readRunResults(resultsRoot);
  const markdown = buildComparisonMarkdown(results);
  fs.writeFileSync(path.join(resultsRoot, "comparison.md"), markdown, "utf8");
  console.log(`\n完成。对比报告: ${path.join(resultsRoot, "comparison.md")}`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`\n[perf] ❌ ${message}`);
  process.exitCode = 1;
});
