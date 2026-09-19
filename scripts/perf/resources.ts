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
 * release 构建版的资源计数采集（Windows / PDH）。
 *
 * 指标：
 * - 进程 CPU 时间（aiohub.exe 及其 msedgewebview2.exe 子进程合计）
 * - 工作集 / 私有内存（字节）
 * - GPU 3D 引擎占用（\`GPU Engine(*)\\Utilization Percentage\` 中 engtype_3d）
 * - 显存专用/共享峰值（\`GPU Process Memory\`，按 pid 归集）
 *
 * 全部通过 PowerShell `Get-Counter` 采样，避免引入额外依赖；采样间隔固定，
 * 由 scripts/perf/run.ts 统一控制时长。
 */

import { execFile } from "node:child_process";

/**
 * 资源采样间隔与最低样本数。最短场景为 5s，取 400ms 可为「样本不少于 10」
 * 留出余量；采样过稀时 GPU/CPU 差值不可靠。
 */
export const RESOURCE_SAMPLE_INTERVAL_MS = 400;
export const MIN_RESOURCE_SAMPLES = 10;

export interface ResourceSample {
  at: number;
  cpuSeconds: number;
  workingSetBytes: number;
  privateBytes: number;
  gpu3dPercent: number;
  gpuDedicatedBytes: number;
  gpuSharedBytes: number;
  processCount: number;
  hasWebView2Process: boolean;
  hasGpuProcess: boolean;
}

export interface ResourceSummary {
  samples: number;
  durationMs: number;
  cpuSecondsTotal: number;
  cpuSecondsPerSecond: number;
  workingSetPeakBytes: number;
  workingSetLastBytes: number;
  privatePeakBytes: number;
  gpu3dAvgPercent: number;
  gpu3dPeakPercent: number;
  gpuDedicatedPeakBytes: number;
  gpuSharedPeakBytes: number;
  processCount: number;
  /** 采样窗口内是否观察到 WebView2 渲染进程（msedgewebview2.exe）。 */
  hasWebView2Process: boolean;
  /** 采样窗口内是否观察到 WebView2 GPU 子进程（`--type=gpu-process`）。 */
  hasGpuProcess: boolean;
}

export function summarizeResources(
  samples: ResourceSample[],
  durationMs: number
): ResourceSummary {
  if (samples.length === 0) {
    return {
      samples: 0,
      durationMs,
      cpuSecondsTotal: 0,
      cpuSecondsPerSecond: 0,
      workingSetPeakBytes: 0,
      workingSetLastBytes: 0,
      privatePeakBytes: 0,
      gpu3dAvgPercent: 0,
      gpu3dPeakPercent: 0,
      gpuDedicatedPeakBytes: 0,
      gpuSharedPeakBytes: 0,
      processCount: 0,
      hasWebView2Process: false,
      hasGpuProcess: false,
    };
  }
  const last = samples[samples.length - 1];
  const first = samples[0];
  const totalCpu = last.cpuSeconds - first.cpuSeconds;
  const wallSeconds = Math.max(0.001, (last.at - first.at) / 1000);
  const gpuValues = samples.map((sample) => sample.gpu3dPercent);
  return {
    samples: samples.length,
    durationMs,
    cpuSecondsTotal: totalCpu,
    cpuSecondsPerSecond: totalCpu / wallSeconds,
    workingSetPeakBytes: Math.max(
      ...samples.map((sample) => sample.workingSetBytes)
    ),
    workingSetLastBytes: last.workingSetBytes,
    privatePeakBytes: Math.max(...samples.map((sample) => sample.privateBytes)),
    gpu3dAvgPercent:
      gpuValues.reduce((sum, value) => sum + value, 0) / gpuValues.length,
    gpu3dPeakPercent: Math.max(...gpuValues),
    gpuDedicatedPeakBytes: Math.max(
      ...samples.map((sample) => sample.gpuDedicatedBytes)
    ),
    gpuSharedPeakBytes: Math.max(
      ...samples.map((sample) => sample.gpuSharedBytes)
    ),
    processCount: last.processCount,
    hasWebView2Process: samples.some((sample) => sample.hasWebView2Process),
    hasGpuProcess: samples.some((sample) => sample.hasGpuProcess),
  };
}

/** 每轮采样的 PowerShell 片段：解析一次计数器，输出一行 JSON。 */
const SAMPLE_SCRIPT = (rootPid: number): string => `
$ErrorActionPreference = 'Stop'
$root = Get-Process -Id ${rootPid} -ErrorAction SilentlyContinue
if ($null -eq $root) { Write-Output '{"alive":false}'; exit 0 }
$all = New-Object System.Collections.Generic.List[object]
$all.Add($root)
# WebView2 的 GPU/渲染/网络进程是**孙进程**（aiohub.exe -> msedgewebview2.exe -> --type=gpu-process），
# 因此必须递归收集整棵进程树，否则会漏掉 GPU 与显存归属的 PID。
$seen = New-Object System.Collections.Generic.HashSet[int]
$seen.Add(${rootPid}) | Out-Null
$queue = New-Object System.Collections.Generic.Queue[int]
$queue.Enqueue(${rootPid})
while ($queue.Count -gt 0) {
  $parent = $queue.Dequeue()
  $kids = @()
  try {
    $kids = Get-CimInstance Win32_Process -Filter "ParentProcessId=$parent" -ErrorAction SilentlyContinue
  } catch { $kids = @() }
  foreach ($kid in $kids) {
    if (-not $seen.Add([int]$kid.ProcessId)) { continue }
    $queue.Enqueue([int]$kid.ProcessId)
    $p = Get-Process -Id $kid.ProcessId -ErrorAction SilentlyContinue
    if ($p) { $all.Add($p) }
  }
}

$cpu = 0.0
$workingSet = 0L
$private = 0L
foreach ($p in $all) {
  try { $cpu += $p.TotalProcessorTime.TotalSeconds } catch {}
  try { $workingSet += $p.WorkingSet64 } catch {}
  try { $private += $p.PrivateMemorySize64 } catch {}
}
$pids = ($all | ForEach-Object { $_.Id }) -join '|'

$hasWebView2 = $false
$hasGpu = $false
foreach ($p in $all) {
  if ($p.ProcessName -like 'msedgewebview2*') { $hasWebView2 = $true }
}
try {
  $cmdlines = Get-CimInstance Win32_Process -Filter "Name LIKE 'msedgewebview2%'" -ErrorAction SilentlyContinue
  foreach ($proc in $cmdlines) {
    if ($pids -split '\|' -contains ([string]$proc.ProcessId) -and $proc.CommandLine -match '--type=gpu-process') {
      $hasGpu = $true
    }
  }
} catch {}

$gpu3d = 0.0
try {
  $engine = (Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples
  foreach ($sample in $engine) {
    if ($sample.InstanceName -match "engtype_3d" -and $sample.InstanceName -match "pid_(\d+)") {
      if ($pids -split '\|' -contains $matches[1]) { $gpu3d += $sample.CookedValue }
    }
  }
} catch {}

$dedicated = 0L
$shared = 0L
try {
  $procMem = (Get-Counter '\GPU Process Memory(*)\Dedicated Usage', '\GPU Process Memory(*)\Shared Usage' -ErrorAction SilentlyContinue).CounterSamples
  foreach ($sample in $procMem) {
    if ($sample.Path -notmatch '\\dedicated usage' -and $sample.Path -notmatch '\\shared usage') { continue }
    if ($sample.InstanceName -match "pid_(\d+)") {
      if ($pids -split '\|' -contains $matches[1]) {
        if ($sample.Path -match '\\dedicated usage') { $dedicated += [long]$sample.CookedValue }
        else { $shared += [long]$sample.CookedValue }
      }
    }
  }
} catch {}

[pscustomobject]@{
  alive = $true
  cpuSeconds = [math]::Round($cpu, 4)
  workingSetBytes = [long]$workingSet
  privateBytes = [long]$private
  gpu3dPercent = [math]::Round($gpu3d, 4)
  gpuDedicatedBytes = [long]$dedicated
  gpuSharedBytes = [long]$shared
  processCount = $all.Count
  hasWebView2Process = $hasWebView2
  hasGpuProcess = $hasGpu
} | ConvertTo-Json -Compress
`;

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(`PowerShell sampling failed: ${stderr || error.message}`)
          );
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

export interface ResourceCollector {
  stop(): Promise<ResourceSummary>;
}

/**
 * 以固定间隔采样，直到 `stop()`。
 *
 * 采样开销低于 1 个 PDH 计数器集合的读取耗时（约 50~150ms），对被测进程影响可忽略。
 */
export function startResourceCollector(
  rootPid: number,
  options: { intervalMs?: number } = {}
): ResourceCollector {
  const intervalMs = options.intervalMs ?? 500;
  const samples: ResourceSample[] = [];
  const startedAt = Date.now();
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let inflight: Promise<void> = Promise.resolve();

  const takeSample = async () => {
    const text = await runPowerShell(SAMPLE_SCRIPT(rootPid));
    const line = text.split(/\r?\n/).filter(Boolean).pop();
    if (!line) return;
    const parsed = JSON.parse(line) as {
      alive?: boolean;
      cpuSeconds?: number;
      workingSetBytes?: number;
      privateBytes?: number;
      gpu3dPercent?: number;
      gpuDedicatedBytes?: number;
      gpuSharedBytes?: number;
      processCount?: number;
      hasWebView2Process?: boolean;
      hasGpuProcess?: boolean;
    };
    if (!parsed.alive) return;
    samples.push({
      at: Date.now(),
      cpuSeconds: parsed.cpuSeconds ?? 0,
      workingSetBytes: parsed.workingSetBytes ?? 0,
      privateBytes: parsed.privateBytes ?? 0,
      gpu3dPercent: parsed.gpu3dPercent ?? 0,
      gpuDedicatedBytes: parsed.gpuDedicatedBytes ?? 0,
      gpuSharedBytes: parsed.gpuSharedBytes ?? 0,
      processCount: parsed.processCount ?? 0,
      hasWebView2Process: parsed.hasWebView2Process ?? false,
      hasGpuProcess: parsed.hasGpuProcess ?? false,
    });
  };

  const schedule = () => {
    if (stopped) return;
    inflight = inflight.then(takeSample).catch(() => undefined);
    timer = setTimeout(schedule, intervalMs);
  };
  schedule();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await inflight;
      return summarizeResources(samples, Date.now() - startedAt);
    },
  };
}
