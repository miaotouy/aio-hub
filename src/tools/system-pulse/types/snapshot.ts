// src/tools/system-pulse/types/snapshot.ts

export interface SystemSnapshot {
  timestamp: number;
  cpu: CpuSnapshot;
  memory: MemorySnapshot;
  disks: DiskSnapshot[];
  networks: NetworkInterfaceSnapshot[];
  gpus: GpuSnapshot[];
}

export interface CpuSnapshot {
  globalUsage: number;
  perCoreUsage: number[];
  frequencyMhz: number;
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
