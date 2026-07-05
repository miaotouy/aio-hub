// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except compliance with the License.
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
 * useScreenMonitor - 实时字幕 OCR 核心业务控制器
 *
 * 职责：
 *  - 管理定时采样器（setInterval）
 *  - 调度 Rust 后端 capture_screen_rect 区域截屏
 *  - aHash 图像去重，过滤无变化帧
 *  - 调用 smart-ocr 平台 useOcrRunner().runOcr 进行识别
 *  - 基于编辑距离的字幕合并/断句
 *  - 生成并导出 SRT 字幕
 *
 * 监控框几何信息由 MonitorBox 悬浮窗通过 `monitor-box:geometry` 事件上报，
 * 主界面监听后写入 monitorRect；截图时自动向内收缩避开监控框边框与控制栏。
 */

import { computed, ref, shallowRef, onBeforeUnmount } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useOcrRunner } from "@/tools/smart-ocr/platform";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import type { ImageBlock, OcrEngineConfig } from "@/tools/smart-ocr/types";
import type { StateSyncPayload } from "@/types/window-sync";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  calculateAHash,
  getHammingDistance,
  getSimilarity,
  buildSrt,
} from "../utils/algorithms";
import type {
  DedupSensitivity,
  MonitorConfig,
  MonitorRect,
  MonitorStatus,
  SubtitleEntry,
} from "../types";

const logger = createModuleLogger("realtime-subtitle-ocr/useScreenMonitor");
const errorHandler = createModuleErrorHandler(
  "realtime-subtitle-ocr/useScreenMonitor"
);

/** 监控框几何信息在窗口同步总线上的状态键 */
const MONITOR_BOX_GEOMETRY_STATE_KEY =
  "realtime-subtitle-ocr:monitor-box-geometry";

/** 灵敏度 → 汉明距离阈值映射 */
const DEDUP_THRESHOLD: Record<DedupSensitivity, number> = {
  high: 2, // 高灵敏度：阈值小，微小变化也触发 OCR
  medium: 4,
  low: 8, // 低灵敏度：阈值大，只有较大变化才触发
};

/** 字幕合并相似度阈值 */
const MERGE_SIMILARITY_THRESHOLD = 0.9;

/** 监控框边框与控制栏的内收缩量（逻辑像素） */
const MONITOR_BOX_INSET = {
  left: 2,
  top: 26, // 24px 控制栏 + 2px 边框
  right: 2,
  bottom: 2,
};

let entryIdCounter = 0;
function nextEntryId(): string {
  entryIdCounter += 1;
  return `sub-${Date.now()}-${entryIdCounter}`;
}

export function useScreenMonitor() {
  const subtitles = ref<SubtitleEntry[]>([]);
  const status = ref<MonitorStatus>("idle");
  const monitorRect = ref<MonitorRect | null>(null);
  const lastHash = shallowRef<string>("");
  const lastFrameUrl = ref<string | null>(null);

  /** 当前采样配置 */
  const config = ref<MonitorConfig>({
    intervalMs: 1000,
    dedupSensitivity: "medium",
    engineConfig: { type: "native", name: "native" },
  });

  const isRunning = computed(() => status.value === "running");

  let timer: ReturnType<typeof setInterval> | null = null;
  let monitorStartedAt = 0;
  let abortController: AbortController | null = null;
  let geometryUnlisten: UnlistenFn | null = null;
  let inFlight = false; // 防止采样重叠

  /** 当前监控框对应的物理坐标截图区域（已向内收缩） */
  function getCaptureRect(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null {
    const rect = monitorRect.value;
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    // 监控框几何信息为逻辑坐标，capture_screen_rect 接收物理坐标，
    // 这里先按逻辑坐标收缩，调用时再乘以 scaleFactor。
    const x = rect.x + MONITOR_BOX_INSET.left;
    const y = rect.y + MONITOR_BOX_INSET.top;
    const width = rect.width - MONITOR_BOX_INSET.left - MONITOR_BOX_INSET.right;
    const height =
      rect.height - MONITOR_BOX_INSET.top - MONITOR_BOX_INSET.bottom;
    if (width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  }

  /** 监听 MonitorBox 悬浮窗通过窗口同步总线上报的几何信息 */
  async function startListeningGeometry() {
    if (geometryUnlisten) return;
    const { onMessage } = useWindowSyncBus();
    const syncUnlisten = onMessage<StateSyncPayload>(
      "state-sync",
      (payload) => {
        if (
          payload?.stateType === MONITOR_BOX_GEOMETRY_STATE_KEY &&
          payload.data
        ) {
          monitorRect.value = payload.data as MonitorRect;
        }
      }
    );

    // 兼容：分离窗口可能尚未通过总线广播，额外监听直连 Tauri 事件作为兜底
    let directUnlistenFn: UnlistenFn | null = null;
    listen<MonitorRect>("monitor-box:geometry", (event) => {
      monitorRect.value = event.payload;
    })
      .then((unlisten) => {
        directUnlistenFn = unlisten;
      })
      .catch((err) => {
        logger.error("监听 monitor-box:geometry 事件失败", err);
      });

    geometryUnlisten = () => {
      syncUnlisten();
      if (directUnlistenFn) {
        directUnlistenFn();
      }
    };
  }

  function stopListeningGeometry() {
    geometryUnlisten?.();
    geometryUnlisten = null;
  }

  // 缓存 scaleFactor，避免高频采样时频繁通过 IPC 获取
  let cachedScaleFactor = 1;
  async function updateScaleFactor() {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      cachedScaleFactor = await getCurrentWindow().scaleFactor();
    } catch (err) {
      logger.warn("获取 scaleFactor 失败，降级为 1", err);
    }
  }

  /** 截屏 → Image → 计算 aHash → 返回 { hash, image } */
  async function captureAndHash(): Promise<{
    hash: string;
    image: HTMLImageElement;
    url: string;
  } | null> {
    const logicalRect = getCaptureRect();
    if (!logicalRect) return null;

    // 如果缓存的缩放因子为 1，尝试更新一次
    if (cachedScaleFactor === 1) {
      await updateScaleFactor();
    }

    const x = Math.round(logicalRect.x * cachedScaleFactor);
    const y = Math.round(logicalRect.y * cachedScaleFactor);
    const width = Math.round(logicalRect.width * cachedScaleFactor);
    const height = Math.round(logicalRect.height * cachedScaleFactor);

    const buffer = await errorHandler.wrapAsync(
      () => invoke<ArrayBuffer>("capture_screen_rect", { x, y, width, height }),
      { userMessage: "屏幕截屏失败", showToUser: false } // 静默处理，避免高频弹窗
    );
    if (!buffer) return null;

    const blob = new Blob([buffer], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    await new Promise<void>((resolve) => {
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) {
      URL.revokeObjectURL(url);
      return null;
    }
    const hash = calculateAHash(image);
    return { hash, image, url };
  }

  // 复用 Canvas 实例，避免高频采样时频繁创建 DOM 元素导致 GC 压力
  let ocrCanvas: HTMLCanvasElement | null = null;

  /** 将 Image 绘制到 canvas 并构造 ImageBlock 供 runOcr 使用 */
  function buildImageBlock(
    image: HTMLImageElement,
    imageId: string
  ): ImageBlock {
    if (!ocrCanvas) {
      ocrCanvas = document.createElement("canvas");
    }
    const canvas = ocrCanvas;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    ctx?.drawImage(image, 0, 0);
    return {
      id: `blk-${imageId}`,
      imageId,
      canvas,
      dataUrl: canvas.toDataURL("image/png"),
      startY: 0,
      endY: canvas.height,
      width: canvas.width,
      height: canvas.height,
    };
  }

  /** 单次采样循环 */
  async function tick() {
    if (inFlight) return;
    inFlight = true;
    try {
      const captured = await captureAndHash();
      if (!captured) return;

      // 异步操作后，检查是否在截屏期间停止了监控，防止内存泄漏
      if (status.value !== "running") {
        URL.revokeObjectURL(captured.url);
        return;
      }

      // 释放上一帧 Object URL
      if (lastFrameUrl.value && lastFrameUrl.value !== captured.url) {
        URL.revokeObjectURL(lastFrameUrl.value);
      }
      lastFrameUrl.value = captured.url;

      // aHash 去重
      const threshold = DEDUP_THRESHOLD[config.value.dedupSensitivity];
      if (
        lastHash.value &&
        getHammingDistance(lastHash.value, captured.hash) < threshold
      ) {
        // 画面无变化：顺延当前字幕结束时间
        const now = Date.now() - monitorStartedAt;
        const last = subtitles.value[subtitles.value.length - 1];
        if (last) last.endMs = now;
        return;
      }
      lastHash.value = captured.hash;

      // 调用 OCR
      const imageId = `img-${Date.now()}`;
      const block = buildImageBlock(captured.image, imageId);
      abortController = new AbortController();
      const { runOcr } = useOcrRunner();
      const results = await runOcr(
        [block],
        config.value.engineConfig,
        undefined,
        abortController.signal
      );

      // 异步 OCR 后，再次检查是否已停止监控
      if (status.value !== "running") {
        return;
      }

      const text = results[0]?.text?.trim() ?? "";
      if (!text) return;

      // 编辑距离合并/断句
      const now = Date.now() - monitorStartedAt;
      const last = subtitles.value[subtitles.value.length - 1];
      if (
        last &&
        getSimilarity(last.text, text) >= MERGE_SIMILARITY_THRESHOLD
      ) {
        last.endMs = now;
        // 若新文本更长，采用新文本以修正 OCR 增量识别
        if (text.length > last.text.length) last.text = text;
      } else {
        subtitles.value.push({
          id: nextEntryId(),
          text,
          startMs: now,
          endMs: now,
        });
      }
    } catch (err) {
      // 高频采样循环中的异常采用静默记录，避免弹窗轰炸用户
      errorHandler.handle(err, {
        userMessage: "采样循环异常",
        showToUser: false,
      });
    } finally {
      inFlight = false;
    }
  }

  /** 开始监控 */
  async function start() {
    if (status.value === "running") return;
    if (!monitorRect.value) {
      errorHandler.handle(new Error("未设置监控框区域"), {
        userMessage: "请先打开并定位监控框",
      });
      return;
    }
    subtitles.value = [];
    lastHash.value = "";
    monitorStartedAt = Date.now();
    status.value = "running";
    timer = setInterval(() => {
      tick();
    }, config.value.intervalMs);
    logger.info("监控开始", { intervalMs: config.value.intervalMs });
  }

  /** 停止监控 */
  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    abortController?.abort();
    abortController = null;
    if (status.value === "running") {
      status.value = "stopped";
    }
    if (lastFrameUrl.value) {
      URL.revokeObjectURL(lastFrameUrl.value);
      lastFrameUrl.value = null;
    }
    logger.info("监控停止");
  }

  /** 更新引擎配置 */
  function setEngineConfig(engineConfig: OcrEngineConfig) {
    config.value.engineConfig = engineConfig;
  }

  /** 更新采样间隔 */
  function setIntervalMs(intervalMs: number) {
    config.value.intervalMs = intervalMs;
    if (status.value === "running") {
      if (timer) clearInterval(timer);
      timer = setInterval(() => tick(), intervalMs);
    }
  }

  /** 更新去重灵敏度 */
  function setDedupSensitivity(s: DedupSensitivity) {
    config.value.dedupSensitivity = s;
  }

  /** 删除单条字幕 */
  function removeSubtitle(id: string) {
    subtitles.value = subtitles.value.filter((s) => s.id !== id);
  }

  /** 更新单条字幕文本 */
  function updateSubtitleText(id: string, text: string) {
    const target = subtitles.value.find((s) => s.id === id);
    if (target) target.text = text;
  }

  /** 复制全部字幕纯文本 */
  function exportPlainText(): string {
    return subtitles.value.map((s) => s.text.trim()).join("\n");
  }

  /** 导出 SRT 字符串 */
  function exportSrt(): string {
    return buildSrt(subtitles.value);
  }

  /** 触发浏览器下载 SRT 文件 */
  function downloadSrt(filename = "subtitles.srt") {
    const srt = exportSrt();
    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 提前启动几何信息监听，解决“未开始监控时 monitorRect 始终为 null 导致按钮死锁禁用”的 Bug
  startListeningGeometry();

  // 在 Composable 销毁时自动注销监听器，防止内存泄漏
  onBeforeUnmount(() => {
    stopListeningGeometry();
  });

  return {
    // state
    subtitles,
    status,
    isRunning,
    monitorRect,
    config,
    // control
    start,
    stop,
    setEngineConfig,
    setIntervalMs,
    setDedupSensitivity,
    // subtitle ops
    removeSubtitle,
    updateSubtitleText,
    exportPlainText,
    exportSrt,
    downloadSrt,
  };
}

