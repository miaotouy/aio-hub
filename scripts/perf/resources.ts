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
 * release 构建版的资源计数采集（Windows / PowerShell 性能快照）。
 *
 * 指标：
 * - 进程 CPU 时间（aiohub.exe 及其 msedgewebview2.exe 子进程合计）
 * - 工作集 / 私有内存（字节）
 * - GPU 3D 引擎占用（\`GPU Engine(*)\\Utilization Percentage\` 中 engtype_3d）
 * - 显存专用/共享峰值（\`GPU Process Memory\`，按 pid 归集）
 *
 * 通过一个常驻 PowerShell 子进程采集，避免每个采样周期重复启动 shell；
 * 采样间隔固定，由 scripts/perf/run.ts 统一控制时长。
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/**
 * 资源采样间隔与最低样本数。最短场景为 12s；常驻采集器按 400ms 节拍
 * 采样，可为「样本不少于 10」留出余量。采样过稀时 GPU/CPU 差值不可靠。
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

/** 常驻采集器：每个周期输出一行 JSON，根进程退出后输出 alive=false 并结束。 */
const COLLECTOR_SCRIPT = (rootPid: number, intervalMs: number): string => `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$intervalMs = ${intervalMs}

function Write-ResourceSample {
  $rootAlive = Get-Process -Id ${rootPid} -ErrorAction SilentlyContinue
  if ($null -eq $rootAlive) {
    [Console]::Out.WriteLine('{"alive":false}')
    return $false
  }

  # 一次性抓取整张进程表，在本地按 ParentProcessId 构树。
  # WebView2 的 GPU/渲染/网络进程是孙进程，因此必须展开整棵树。
  $procs = Get-CimInstance Win32_Process
  $byParent = @{}
  foreach ($p in $procs) {
    $ppid = [int]$p.ParentProcessId
    if (-not $byParent.ContainsKey($ppid)) {
      $byParent[$ppid] = New-Object System.Collections.Generic.List[object]
    }
    [void]$byParent[$ppid].Add($p)
  }

  $treeIds = New-Object System.Collections.Generic.HashSet[int]
  [void]$treeIds.Add(${rootPid})
  $queue = New-Object System.Collections.Generic.Queue[int]
  $queue.Enqueue(${rootPid})
  while ($queue.Count -gt 0) {
    $parent = $queue.Dequeue()
    if ($byParent.ContainsKey($parent)) {
      foreach ($kid in $byParent[$parent]) {
        if ($treeIds.Add([int]$kid.ProcessId)) {
          $queue.Enqueue([int]$kid.ProcessId)
        }
      }
    }
  }

  $cpu = 0.0
  $workingSet = 0L
  $private = 0L
  $processCount = 0
  foreach ($p in (Get-Process)) {
    if (-not $treeIds.Contains($p.Id)) { continue }
    $processCount += 1
    try { $cpu += $p.TotalProcessorTime.TotalSeconds } catch {}
    try { $workingSet += $p.WorkingSet64 } catch {}
    try { $private += $p.PrivateMemorySize64 } catch {}
  }

  $hasWebView2 = $false
  $hasGpu = $false
  foreach ($p in $procs) {
    if (-not $treeIds.Contains([int]$p.ProcessId)) { continue }
    if ($p.Name -like 'msedgewebview2*') {
      $hasWebView2 = $true
      if ($p.CommandLine -match '--type=gpu-process') { $hasGpu = $true }
    }
  }

  # GPU 计数使用 CIM 快照，避免 Get-Counter 枚举数百个实例的高额开销。
  $gpu3d = 0.0
  $engine = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -Filter "Name LIKE '%engtype_3D%'"
  foreach ($sample in $engine) {
    if ($sample.Name -match 'pid_(\d+)_') {
      if ($treeIds.Contains([int]$matches[1])) {
        $gpu3d += [double]$sample.UtilizationPercentage
      }
    }
  }

  $dedicated = 0L
  $shared = 0L
  $procMem = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory
  foreach ($sample in $procMem) {
    if ($sample.Name -match 'pid_(\d+)_') {
      if ($treeIds.Contains([int]$matches[1])) {
        $dedicated += [long]$sample.DedicatedUsage
        $shared += [long]$sample.SharedUsage
      }
    }
  }

  [pscustomobject]@{
    alive = $true
    cpuSeconds = [math]::Round($cpu, 4)
    workingSetBytes = [long]$workingSet
    privateBytes = [long]$private
    gpu3dPercent = [math]::Round($gpu3d, 4)
    gpuDedicatedBytes = [long]$dedicated
    gpuSharedBytes = [long]$shared
    processCount = $processCount
    hasWebView2Process = $hasWebView2
    hasGpuProcess = $hasGpu
  } | ConvertTo-Json -Compress | ForEach-Object { [Console]::Out.WriteLine($_) }
  return $true
}

while ($true) {
  $cycle = [Diagnostics.Stopwatch]::StartNew()
  if (-not (Write-ResourceSample)) { break }
  $cycle.Stop()
  $remaining = $intervalMs - [int]$cycle.ElapsedMilliseconds
  if ($remaining -gt 0) { Start-Sleep -Milliseconds $remaining }
}
`;

export interface ResourceCollector {
  stop(): Promise<ResourceSummary>;
}

interface ParsedResourceSample {
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
}

function parseResourceSample(line: string, samples: ResourceSample[]): void {
  if (!line) return;
  try {
    const parsed = JSON.parse(line) as ParsedResourceSample;
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
  } catch {
    // PowerShell 的诊断输出不应污染已采集的数据，也不应中断整轮采集。
  }
}

function launchResourceCollector(
  rootPid: number,
  intervalMs: number,
  samples: ResourceSample[]
): { process: ChildProcessWithoutNullStreams; exited: Promise<void> } {
  const process = spawn(
    "powershell",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      COLLECTOR_SCRIPT(rootPid, intervalMs),
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
  );
  process.stdout.setEncoding("utf8");

  let stdoutBuffer = "";
  const consumeStdout = (flush = false) => {
    let newline = stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      parseResourceSample(line, samples);
      newline = stdoutBuffer.indexOf("\n");
    }
    if (flush && stdoutBuffer.trim()) {
      parseResourceSample(stdoutBuffer.trim(), samples);
      stdoutBuffer = "";
    }
  };
  process.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    consumeStdout();
  });
  // stderr 仅用于 PowerShell 的诊断；采集器会继续保留已取得的样本。
  process.stderr.resume();

  const exited = new Promise<void>((resolve) => {
    process.once("close", () => {
      consumeStdout(true);
      resolve();
    });
  });
  return { process, exited };
}

/**
 * 以固定节拍从常驻 PowerShell 采样，直到 `stop()`。
 *
 * 保持 shell 存活可去掉每次采样的 PowerShell 初始化开销；场景窗口取 12 秒，
 * 为 Windows CIM 快照的实际耗时保留足够的资源样本健康余量。
 */
export function startResourceCollector(
  rootPid: number,
  options: { intervalMs?: number } = {}
): ResourceCollector {
  const intervalMs = options.intervalMs ?? RESOURCE_SAMPLE_INTERVAL_MS;
  const samples: ResourceSample[] = [];
  const startedAt = Date.now();
  const collector = launchResourceCollector(rootPid, intervalMs, samples);
  let stopped = false;

  return {
    async stop() {
      if (!stopped) {
        stopped = true;
        collector.process.kill();
      }
      await collector.exited;
      return summarizeResources(samples, Date.now() - startedAt);
    },
  };
}
