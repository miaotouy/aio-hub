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

// src/tools/system-pulse/types/snapshot.ts

export interface SystemSnapshot {
  timestamp: number;
  uptime: number;
  cpu: CpuSnapshot;
  memory: MemorySnapshot;
  disks: DiskSnapshot[];
  networks: NetworkInterfaceSnapshot[];
  gpus: GpuSnapshot[];
}

export interface CpuSnapshot {
  brand: string;
  globalUsage: number;
  perCoreUsage: number[];
  frequencyMhz: number;
  baseFrequencyMhz: number;
  temperatureCelsius: number | null;
  processCount: number;
  threadCount: number | null;
}

export interface MemorySnapshot {
  totalBytes: number;
  usedBytes: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
}

export interface DiskSnapshot {
  name: string;
  mountPoint: string;
  totalBytes: number;
  usedBytes: number;
  readBytesPerSec: number;
  writeBytesPerSec: number;
}

export interface NetworkInterfaceSnapshot {
  name: string;
  uploadBytesPerSec: number;
  downloadBytesPerSec: number;
}

export interface GpuSnapshot {
  index: number;
  name: string;
  usagePercent: number;
  temperatureCelsius: number | null;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  // 仅 NVIDIA 可用
  encoderUsage: number | null;
  decoderUsage: number | null;
  computeUsage: number | null;
}
