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
import type { OcrEngineConfig } from "@/tools/smart-ocr/types";
import type { StateSyncPayload } from "@/types/window-sync";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createConfigManager } from "@/utils/configManager";
import { getSimilarity, buildSrt, formatSrtTime } from "../utils/algorithms";
import { createImageBlock } from "../utils/image";
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

const configManager = createConfigManager<MonitorConfig>({
  moduleName: "realtime-subtitle-ocr",
  fileName: "config.json",
  version: "1.0.0",
  createDefault: () => ({
    intervalMs: 1000,
    dedupSensitivity: "medium",
    engineConfig: { type: "native", name: "native" },
  }),
});

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

// ===== 全局单例状态 =====
const subtitles = ref<SubtitleEntry[]>([]);
const status = ref<MonitorStatus>("idle");
const monitorRect = ref<MonitorRect | null>(null);
const lastHash = shallowRef<string>("");
const lastFrameUrl = ref<string | null>(null);
const activeUrls = new Set<string>();
const latency = ref<number>(0);

// Canvas 缓存，避免高频采样时频繁创建 DOM 元素导致 GC 压力
let ocrCanvas: HTMLCanvasElement | null = null;

/** 当前采样配置 */
const config = ref<MonitorConfig>({
  intervalMs: 1000,
  dedupSensitivity: "medium",
  engineConfig: { type: "native", name: "native" },
});

// 初始化加载配置
configManager.load().then((loaded) => {
  config.value = loaded;
});

const isRunning = computed(() => status.value === "running");

function registerUrl(url: string) {
  activeUrls.add(url);
}

function revokeUrl(url: string) {
  if (activeUrls.has(url)) {
    URL.revokeObjectURL(url);
    activeUrls.delete(url);
  }
}

function revokeAllUrls() {
  for (const url of activeUrls) {
    URL.revokeObjectURL(url);
  }
  activeUrls.clear();
}

let timer: ReturnType<typeof setInterval> | null = null;
let monitorStartedAt = 0;
let abortController: AbortController | null = null;
let geometryUnlisten: UnlistenFn | null = null;
let inFlight = false; // 防止采样重叠
let activeInstances = 0; // 引用计数，管理几何信息监听器

export function useScreenMonitor() {
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
  interface CaptureResult {
    changed: boolean;
    hash: string;
    imageBytes: number[] | null;
  }

  /**
   * 物理坐标转换、调用 Rust 截屏、处理去重
   *
   * @returns 有新画面时返回 HTMLImageElement 及其 Object URL，无变化或停止时返回 null
   */
  async function performCapture(): Promise<{
    image: HTMLImageElement;
    url: string;
    hash: string;
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

    const threshold = DEDUP_THRESHOLD[config.value.dedupSensitivity];

    const result = await errorHandler.wrapAsync(
      () =>
        invoke<CaptureResult>("capture_screen_rect", {
          x,
          y,
          width,
          height,
          lastHash: lastHash.value || null,
          threshold,
        }),
      { userMessage: "屏幕截屏失败", showToUser: false } // 静默处理，避免高频弹窗
    );
    if (!result) return null;

    // 异步操作后，检查是否在截屏期间停止了监控，防止内存泄漏
    if (status.value !== "running") {
      return null;
    }

    lastHash.value = result.hash;

    if (!result.changed || !result.imageBytes) {
      // 画面无变化：顺延当前字幕结束时间
      const now = Date.now() - monitorStartedAt;
      const last = subtitles.value[subtitles.value.length - 1];
      if (last) last.endMs = now;
      return null;
    }

    const blob = new Blob([new Uint8Array(result.imageBytes)], {
      type: "image/png",
    });
    const url = URL.createObjectURL(blob);
    registerUrl(url);
    const image = new Image();
    await new Promise<void>((resolve) => {
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) {
      revokeUrl(url);
      return null;
    }

    // 再次检查状态
    if (status.value !== "running") {
      revokeUrl(url);
      return null;
    }

    // 释放上一帧 Object URL
    if (lastFrameUrl.value && lastFrameUrl.value !== url) {
      revokeUrl(lastFrameUrl.value);
    }
    lastFrameUrl.value = url;

    return { image, url, hash: result.hash };
  }

  /**
   * 调度 OCR 引擎并返回文本
   */
  async function performOcr(image: HTMLImageElement): Promise<string> {
    const imageId = `img-${Date.now()}`;
    if (!ocrCanvas) {
      ocrCanvas = document.createElement("canvas");
    }
    const block = createImageBlock(image, imageId, ocrCanvas);
    abortController = new AbortController();
    const { runOcr } = useOcrRunner();
    const startTime = Date.now();
    const results = await runOcr(
      [block],
      config.value.engineConfig,
      undefined,
      abortController.signal
    );
    latency.value = Date.now() - startTime;

    return results[0]?.text?.trim() ?? "";
  }

  /**
   * 负责编辑距离对比、追加或更新时间轴
   */
  function mergeOrAppendSubtitle(text: string) {
    if (!text) return;
    const now = Date.now() - monitorStartedAt;
    const last = subtitles.value[subtitles.value.length - 1];
    if (last && getSimilarity(last.text, text) >= MERGE_SIMILARITY_THRESHOLD) {
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
  }

  /** 单次采样循环 */
  async function tick() {
    if (inFlight) return;
    inFlight = true;
    try {
      const captured = await performCapture();
      if (!captured) return;

      const text = await performOcr(captured.image);

      // 异步 OCR 后，再次检查是否已停止监控
      if (status.value !== "running") {
        return;
      }

      mergeOrAppendSubtitle(text);
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
      revokeUrl(lastFrameUrl.value);
      lastFrameUrl.value = null;
    }
    revokeAllUrls();
    logger.info("监控停止");
  }

  /** 更新引擎配置 */
  function setEngineConfig(engineConfig: OcrEngineConfig) {
    config.value.engineConfig = engineConfig;
    configManager.saveDebounced(config.value);
  }

  /** 更新采样间隔 */
  function setIntervalMs(intervalMs: number) {
    config.value.intervalMs = intervalMs;
    configManager.saveDebounced(config.value);
    if (status.value === "running") {
      if (timer) clearInterval(timer);
      timer = setInterval(() => tick(), intervalMs);
    }
  }

  /** 更新去重灵敏度 */
  function setDedupSensitivity(s: DedupSensitivity) {
    config.value.dedupSensitivity = s;
    configManager.saveDebounced(config.value);
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

  /** 导出带时间的字幕文本 */
  function exportTextWithTime(): string {
    return subtitles.value
      .map((s) => {
        const start = formatSrtTime(s.startMs);
        const end = formatSrtTime(s.endMs);
        return `[${start} --> ${end}] ${s.text.trim()}`;
      })
      .join("\n");
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

  // 增加引用计数并按需启动几何信息监听
  activeInstances += 1;
  if (activeInstances === 1) {
    startListeningGeometry();
  }

  // 在 Composable 销毁时减少引用计数，并在无活跃实例时注销监听器，防止内存泄漏
  onBeforeUnmount(() => {
    activeInstances -= 1;
    if (activeInstances <= 0) {
      activeInstances = 0;
      stopListeningGeometry();
    }
  });

  return {
    // state
    subtitles,
    status,
    isRunning,
    monitorRect,
    config,
    lastHash,
    lastFrameUrl,
    latency,
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
    exportTextWithTime,
    exportSrt,
    downloadSrt,
  };
}
