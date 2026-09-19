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
 * WebView2 GPU 性能计数器自动验证。
 *
 * 在隔离 Tauri 进程中通过 CDP 打开“组件测试器 → GPU 渲染探针”，自动启动高负载
 * WebGL 绘制，并在同一测量窗口内采集 WebView2 进程树的 GPU 3D 引擎数据。
 *
 * 用法：
 *   bun run perf:gpu-probe -- --binary <debug-or-perf-release.exe>
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  connectFrameProbe,
  frameSamplingExpression,
  summarizeFrames,
  type FrameProbe,
  type FrameStats,
} from "./frames";
import {
  MIN_RESOURCE_SAMPLES,
  RESOURCE_SAMPLE_INTERVAL_MS,
  startResourceCollector,
  type ResourceSummary,
} from "./resources";
import { killTree, launchApp, sleep, waitForMainWindow } from "./launch";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const resultsRoot = path.join(
  projectRoot,
  ".dev-data",
  "perf-results",
  "gpu-probe"
);
const runsRoot = path.join(projectRoot, ".dev-data", "perf-runs");
const GPU_PROBE_SELECTOR = '[data-testid="gpu-rendering-tester"]';
const GPU_CANVAS_SELECTOR = '[data-testid="gpu-rendering-canvas"]';
const GPU_START_SELECTOR = '[data-testid="gpu-rendering-start"]';
const GPU_STOP_SELECTOR = '[data-testid="gpu-rendering-stop"]';

interface CliOptions {
  binary: string;
  durationMs: number;
  cdpPort: number;
  keepData: boolean;
}

interface GpuProbeRuntimeState {
  isRunning: boolean;
  renderedFrames: number;
  framesPerSecond: number;
  elapsedText: string;
  resolution: string;
}

interface GpuProbeResult {
  status: "passed" | "failed";
  failures?: string[];
  binary: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  runtime: GpuProbeRuntimeState;
  frames: FrameStats;
  resources: ResourceSummary;
}

function printHelp(): void {
  console.log(`WebView2 GPU 性能计数器验证

用法:
  bun run perf:gpu-probe -- --binary <debug-or-perf-release.exe> [选项]

选项:
  --binary <path>      被测可执行文件；debug 或启用 perf-instrumentation 的 release 构建
  --duration <seconds> WebGL 与资源采样时长，默认 12，最小 12
  --cdp-port <port>    WebView2 loopback CDP 端口，默认 9333
  --keep-data          保留隔离的 data-dir 与 WebView2 profile
  -h, --help           显示帮助
`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    binary: "",
    durationMs: 12_000,
    cdpPort: 9333,
    keepData: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const readValue = (name: string): string => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${name} 需要提供取值`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--binary":
        options.binary = readValue(arg);
        break;
      case "--duration": {
        const seconds = Number(readValue(arg));
        if (!Number.isInteger(seconds) || seconds < 12 || seconds > 300) {
          throw new Error("--duration 必须是 12–300 之间的整数秒");
        }
        options.durationMs = seconds * 1_000;
        break;
      }
      case "--cdp-port": {
        const port = Number(readValue(arg));
        if (!Number.isInteger(port) || port < 1 || port > 65_535) {
          throw new Error("--cdp-port 必须是有效端口号");
        }
        options.cdpPort = port;
        break;
      }
      case "--keep-data":
        options.keepData = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`未知参数: ${arg}`);
    }
  }

  if (!options.binary) throw new Error("必须提供 --binary");
  if (!fs.existsSync(options.binary)) {
    throw new Error(`找不到被测可执行文件: ${options.binary}`);
  }
  return options;
}

async function openGpuRenderingProbe(probe: FrameProbe): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const state = await probe.evaluate<{ ready: boolean; clicked: boolean }>(
      `(() => {
        const root = document.querySelector(${JSON.stringify(GPU_PROBE_SELECTOR)});
        if (root) return { ready: true, clicked: false };
        if (location.pathname === '/component-tester') return { ready: false, clicked: false };
        const link = Array.from(document.querySelectorAll('a[href]')).find((candidate) => {
          try { return new URL(candidate.href, location.href).pathname === '/component-tester'; }
          catch { return false; }
        });
        if (link instanceof HTMLElement) {
          link.click();
          return { ready: false, clicked: true };
        }
        return { ready: false, clicked: false };
      })()`
    );
    if (state.ready) return;
    await sleep(state.clicked ? 750 : 300);
  }
  throw new Error("组件测试器未在 120 秒内加载，无法打开 GPU 渲染探针。");
}

async function activateAndStartGpuProbe(probe: FrameProbe): Promise<void> {
  await probe.waitForSelector(GPU_PROBE_SELECTOR, 30_000);
  const tabActivated = await probe.evaluate<boolean>(`(() => {
    const tab = Array.from(document.querySelectorAll('.el-tabs__item'))
      .find((item) => item.textContent?.trim() === 'GPU 渲染探针');
    if (!tab) return false;
    tab.click();
    return true;
  })()`);
  if (!tabActivated) throw new Error("未找到“GPU 渲染探针”标签页。");

  await probe.waitForSelector(GPU_CANVAS_SELECTOR, 30_000);
  const started = await probe.evaluate<boolean>(`(() => {
    const button = document.querySelector(${JSON.stringify(GPU_START_SELECTOR)});
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!started) throw new Error("无法触发 GPU 渲染探针的开始按钮。");

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const isRunning = await probe.evaluate<boolean>(
      `!!document.querySelector('.canvas-shell.is-running')`
    );
    if (isRunning) return;
    await sleep(100);
  }
  throw new Error("WebGL 绘制未在 15 秒内开始。");
}

async function snapshotRuntime(
  probe: FrameProbe
): Promise<GpuProbeRuntimeState> {
  return probe.evaluate<GpuProbeRuntimeState>(`(() => {
    const readText = (selector) => document.querySelector(selector)?.textContent?.trim() ?? '';
    const parseInteger = (value) => Number(value.replace(/[^0-9]/g, '')) || 0;
    const parseFloatValue = (value) => Number(value.replace(/[^0-9.]/g, '')) || 0;
    return {
      isRunning: !!document.querySelector('.canvas-shell.is-running'),
      renderedFrames: parseInteger(readText('[data-testid="gpu-rendering-frame-count"]')),
      framesPerSecond: parseFloatValue(readText('[data-testid="gpu-rendering-fps"]')),
      elapsedText: readText('[data-testid="gpu-rendering-elapsed"]'),
      resolution: readText('[data-testid="gpu-rendering-resolution"]'),
    };
  })()`);
}

async function stopGpuProbe(probe: FrameProbe): Promise<void> {
  await probe.evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(GPU_STOP_SELECTOR)});
    if (button instanceof HTMLButtonElement && !button.disabled) button.click();
  })()`);
}

function validate(result: GpuProbeResult): string[] {
  const failures: string[] = [];
  if (!result.runtime.isRunning) failures.push("WebGL 绘制在测量结束前已停止");
  if (result.runtime.renderedFrames < 10) {
    failures.push(`WebGL 绘制帧数不足: ${result.runtime.renderedFrames}`);
  }
  if (result.frames.samples === 0) failures.push("rAF 帧采样为空");
  if (result.resources.samples < MIN_RESOURCE_SAMPLES) {
    failures.push(
      `资源样本不足: ${result.resources.samples} < ${MIN_RESOURCE_SAMPLES}`
    );
  }
  if (!result.resources.hasWebView2Process) {
    failures.push("进程树中未观察到 WebView2 渲染进程");
  }
  if (!result.resources.hasGpuProcess) {
    failures.push("进程树中未观察到 WebView2 GPU 子进程");
  }
  if (result.resources.gpu3dPeakPercent <= 0) {
    failures.push("GPU 3D 引擎峰值仍为 0，GPU 性能计数器采集链路未通过");
  }
  return failures;
}

function writeResult(result: GpuProbeResult): string {
  fs.mkdirSync(resultsRoot, { recursive: true });
  const timestamp = result.startedAt.replace(/[:.]/g, "-");
  const target = path.join(resultsRoot, `gpu-probe-${timestamp}.json`);
  fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return target;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const runDir = path.join(runsRoot, `gpu-probe-${Date.now()}`);
  const dataDir = path.join(runDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const app = launchApp({
    binary: options.binary,
    dataDir,
    cdpPort: options.cdpPort,
  });
  let probe: FrameProbe | null = null;
  try {
    await waitForMainWindow(app.pid);
    probe = await connectFrameProbe(options.cdpPort, {
      targetUrlIncludes: "tauri.localhost",
    });
    await openGpuRenderingProbe(probe);
    await activateAndStartGpuProbe(probe);
    await sleep(500);

    const collector = startResourceCollector(app.pid, {
      intervalMs: RESOURCE_SAMPLE_INTERVAL_MS,
    });
    const frameSample = await probe.evaluate<{
      frameTimes: number[];
      durationMs: number;
    }>(frameSamplingExpression({ durationMs: options.durationMs }));
    const resources = await collector.stop();
    const runtime = await snapshotRuntime(probe);
    const result: GpuProbeResult = {
      status: "passed",
      binary: path.resolve(options.binary),
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: options.durationMs,
      runtime,
      frames: summarizeFrames(frameSample.frameTimes),
      resources,
    };
    const failures = validate(result);
    if (failures.length > 0) {
      result.status = "failed";
      result.failures = failures;
    }
    const resultPath = writeResult(result);
    console.log(
      `GPU 探针: frames=${runtime.renderedFrames} fps=${runtime.framesPerSecond.toFixed(1)} ` +
        `gpuAvg=${resources.gpu3dAvgPercent.toFixed(2)}% ` +
        `gpuPeak=${resources.gpu3dPeakPercent.toFixed(2)}% ` +
        `samples=${resources.samples}`
    );
    console.log(`结果: ${resultPath}`);
    if (failures.length > 0) {
      throw new Error(`GPU 采集验证失败:\n- ${failures.join("\n- ")}`);
    }
  } finally {
    if (probe) {
      await stopGpuProbe(probe).catch(() => undefined);
      await probe.close();
    }
    await app.stop();
    await killTree(app.pid);
    if (!options.keepData) fs.rmSync(runDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`\n[gpu-probe] ❌ ${message}`);
  process.exitCode = 1;
});
