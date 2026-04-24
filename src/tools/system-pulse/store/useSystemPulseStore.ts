// src/tools/system-pulse/store/useSystemPulseStore.ts
import { defineStore } from "pinia";
import { ref, reactive } from "vue";
import type { SystemSnapshot, GpuSnapshot } from "../types/snapshot";

const HISTORY_SIZE = 60; // 保留最近 60 个采样点（约 60 秒）

/** 定长环形缓冲区，避免 Array.shift() 大量复制 */
class RingBuffer<T> {
  private buf: T[];
  private ptr = 0;
  readonly size: number;

  constructor(size: number, fill: T) {
    this.size = size;
    this.buf = Array(size).fill(fill);
  }

  push(val: T) {
    this.buf[this.ptr] = val;
    this.ptr = (this.ptr + 1) % this.buf.length;
  }

  /** 返回按时间顺序排列的数组（供 ECharts 直接使用） */
  toArray(): T[] {
    return [...this.buf.slice(this.ptr), ...this.buf.slice(0, this.ptr)];
  }
}

export const useSystemPulseStore = defineStore("systemPulse", () => {
  // 最新快照
  const latest = ref<SystemSnapshot | null>(null);

  // CPU 全局使用率历史
  const cpuHistory = new RingBuffer<number>(HISTORY_SIZE, 0);

  // 内存使用率历史（0~100）
  const memHistory = new RingBuffer<number>(HISTORY_SIZE, 0);

  // 网络总速率历史（取所有接口之和）
  const networkHistory = new RingBuffer<{ up: number; down: number }>(HISTORY_SIZE, { up: 0, down: 0 });

  // GPU 历史（按 index 存储）
  const gpuHistory = reactive<Map<number, RingBuffer<{ usage: number; temp: number }>>>(new Map());

  // 完整快照历史（用于导出）
  const fullHistory = new RingBuffer<SystemSnapshot | null>(HISTORY_SIZE, null);

  // 响应式历史数组（供组件直接绑定）
  const cpuHistoryArray = ref<number[]>(cpuHistory.toArray());
  const memHistoryArray = ref<number[]>(memHistory.toArray());
  const networkHistoryArray = ref<{ up: number; down: number }[]>(networkHistory.toArray());
  const gpuHistoryArrays = reactive<Map<number, { usage: number; temp: number }[]>>(new Map());
  const fullHistoryArray = ref<SystemSnapshot[]>([]);

  function applySnapshot(snapshot: SystemSnapshot) {
    latest.value = snapshot;

    // 更新完整历史
    fullHistory.push(snapshot);
    fullHistoryArray.value = fullHistory.toArray().filter((s): s is SystemSnapshot => s !== null);

    // 更新 CPU 历史
    cpuHistory.push(snapshot.cpu.globalUsage);
    cpuHistoryArray.value = cpuHistory.toArray();

    // 更新内存历史（转换为百分比）
    const memPercent =
      snapshot.memory.totalBytes > 0 ? (snapshot.memory.usedBytes / snapshot.memory.totalBytes) * 100 : 0;
    memHistory.push(memPercent);
    memHistoryArray.value = memHistory.toArray();

    // 更新网络历史（所有接口求和）
    const totalUp = snapshot.networks.reduce((s, n) => s + n.uploadBytesPerSec, 0);
    const totalDown = snapshot.networks.reduce((s, n) => s + n.downloadBytesPerSec, 0);
    networkHistory.push({ up: totalUp, down: totalDown });
    networkHistoryArray.value = networkHistory.toArray();

    // 更新 GPU 历史
    snapshot.gpus.forEach((gpu: GpuSnapshot) => {
      if (!gpuHistory.has(gpu.index)) {
        const buf = new RingBuffer<{ usage: number; temp: number }>(HISTORY_SIZE, { usage: 0, temp: 0 });
        gpuHistory.set(gpu.index, buf);
        gpuHistoryArrays.set(gpu.index, buf.toArray());
      }
      const buf = gpuHistory.get(gpu.index)!;
      buf.push({
        usage: gpu.usagePercent,
        temp: gpu.temperatureCelsius ?? 0,
      });
      gpuHistoryArrays.set(gpu.index, buf.toArray());
    });
  }

  function reset() {
    latest.value = null;
  }

  return {
    latest,
    cpuHistoryArray,
    memHistoryArray,
    networkHistoryArray,
    gpuHistoryArrays,
    fullHistoryArray,
    applySnapshot,
    reset,
  };
});
