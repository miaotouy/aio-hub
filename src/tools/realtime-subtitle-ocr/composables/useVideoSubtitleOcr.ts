// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except compliance with the License.

import { computed, onBeforeUnmount, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { appDataDir, join } from "@tauri-apps/api/path";
import { remove, readFile, mkdir } from "@tauri-apps/plugin-fs";
import { useFFmpeg } from "@/composables/useFFmpeg";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useOcrRunner } from "@/tools/smart-ocr/platform";
import type { ImageBlock } from "@/tools/smart-ocr/types";
import type { OcrEngineConfig } from "@/tools/smart-ocr/types";
import {
  blobToDataUrl,
  createFilteredImageBlob,
  createImageBlock,
  isImageFilterActive,
} from "../utils/image";
import { getSimilarity } from "../utils/algorithms";
import {
  calculateVideoFrameCount,
  DEFAULT_VIDEO_ROI,
  normalizeVideoRange,
} from "../utils/video";
import { useScreenMonitor, useSubtitleTimeline } from "./useScreenMonitor";
import type {
  SubtitleEntry,
  DedupSensitivity,
  ImageFilterConfig,
  VideoFramePayload,
  VideoOcrPhase,
  VideoOcrProgress,
  VideoOcrStatus,
  VideoRoi,
  VideoSourceInfo,
} from "../types";

const errorHandler = createModuleErrorHandler(
  "realtime-subtitle-ocr/useVideoSubtitleOcr"
);

const MERGE_SIMILARITY_THRESHOLD = 0.9;

const source = ref<VideoSourceInfo | null>(null);
const roi = ref<VideoRoi>({ ...DEFAULT_VIDEO_ROI });
const startMs = ref(0);
const endMs = ref(0);
const status = ref<VideoOcrStatus>("idle");
const progress = ref<VideoOcrProgress>({
  phase: "extracting",
  extracted: 0,
  ocrCompleted: 0,
  total: 0,
  currentTimeMs: 0,
  percent: 0,
});
const previewUrl = ref<string | null>(null);
const ffmpegAvailable = ref<boolean | null>(null);
const taskId = ref<string | null>(null);
const queuedFrames: VideoFramePayload[] = [];
let processing = false;
let processingPromise: Promise<void> | null = null;
let frameUnlisten: UnlistenFn | null = null;
let progressUnlisten: UnlistenFn | null = null;
let cancellationPromise: Promise<void> | null = null;
let frameDirectory = "";
let ocrAbortController: AbortController | null = null;
let frameCounter = 0;
let activeSettings: {
  engineConfig: OcrEngineConfig;
  imageFilter: ImageFilterConfig;
  intervalMs: number;
  dedupSensitivity: DedupSensitivity;
} | null = null;
let lastVideoHash = "";

function fileNameFromPath(path: string): string {
  return path.match(/[/\\]([^/\\]+)$/)?.[1] ?? "video";
}

function makeTaskId(prefix = "video-ocr") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function setProgress(patch: Partial<VideoOcrProgress>) {
  progress.value = { ...progress.value, ...patch };
}

async function ensureListeners() {
  if (frameUnlisten && progressUnlisten) return;
  frameUnlisten = await listen<VideoFramePayload>(
    "video-ocr-frame",
    (event) => {
      if (
        !taskId.value ||
        event.payload.taskId !== taskId.value ||
        status.value !== "running"
      )
        return;
      queuedFrames.push(event.payload);
      setProgress({
        phase: "ocr",
        extracted: Math.max(progress.value.extracted, queuedFrames.length),
        total: Math.max(progress.value.total, queuedFrames.length),
      });
      void processQueue();
    }
  );
  progressUnlisten = await listen<VideoOcrProgress>(
    "video-ocr-progress",
    (event) => {
      if (
        !taskId.value ||
        event.payload.taskId !== taskId.value ||
        status.value !== "running"
      )
        return;
      if (event.payload.phase === "error") {
        setProgress({
          ...event.payload,
          extracted: Math.max(
            progress.value.extracted,
            event.payload.extracted
          ),
          ocrCompleted: Math.max(
            progress.value.ocrCompleted,
            event.payload.ocrCompleted
          ),
          total: Math.max(progress.value.total, event.payload.total),
        });
        return;
      }
      const extractionOverlapsOcr =
        event.payload.phase === "extracting" && progress.value.phase === "ocr";
      setProgress({
        ...event.payload,
        phase: extractionOverlapsOcr
          ? "ocr"
          : (event.payload.phase as VideoOcrPhase),
        extracted: Math.max(progress.value.extracted, event.payload.extracted),
        ocrCompleted: Math.max(
          progress.value.ocrCompleted,
          event.payload.ocrCompleted
        ),
        total: Math.max(progress.value.total, event.payload.total),
        percent: extractionOverlapsOcr
          ? progress.value.percent
          : event.payload.percent,
      });
    }
  );
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  const loaded = await new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
  if (!loaded || !image.naturalWidth || !image.naturalHeight)
    throw new Error("无法加载视频帧");
  return image;
}

function imageAverageHash(image: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "";
  context.drawImage(image, 0, 0, 8, 8);
  const pixels = context.getImageData(0, 0, 8, 8).data;
  const gray: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    gray.push(
      (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000
    );
  }
  const average = gray.reduce((sum, value) => sum + value, 0) / gray.length;
  return gray.map((value) => (value >= average ? "1" : "0")).join("");
}

function hashDistance(left: string, right: string): number {
  if (!left || left.length !== right.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let i = 0; i < left.length; i += 1)
    if (left[i] !== right[i]) distance += 1;
  return distance;
}

const DEDUP_THRESHOLD: Record<DedupSensitivity, number> = {
  high: 2,
  medium: 4,
  low: 8,
};

async function runFrameOcr(frame: VideoFramePayload) {
  const bytes = await readFile(frame.framePath);
  const rawBlob = new Blob([bytes], { type: "image/jpeg" });
  const rawUrl = URL.createObjectURL(rawBlob);
  try {
    const image = await loadImage(rawUrl);
    if (!activeSettings) throw new Error("视频 OCR 配置尚未初始化");
    const hash = imageAverageHash(image);
    if (
      hash &&
      lastVideoHash &&
      hashDistance(hash, lastVideoHash) <
        DEDUP_THRESHOLD[activeSettings.dedupSensitivity]
    ) {
      const last =
        useSubtitleTimeline().subtitles.value[
          useSubtitleTimeline().subtitles.value.length - 1
        ];
      if (last) last.endMs = Math.max(last.endMs, frame.timestampMs);
      setProgress({
        phase: "ocr",
        ocrCompleted: progress.value.ocrCompleted + 1,
        currentTimeMs: frame.timestampMs,
      });
      return;
    }
    lastVideoHash = hash;
    const filteredBlob = isImageFilterActive(activeSettings.imageFilter)
      ? await createFilteredImageBlob(image, activeSettings.imageFilter)
      : rawBlob;
    const frameUrl = URL.createObjectURL(filteredBlob);
    useSubtitleTimeline().registerFrameUrl(frameUrl);
    previewUrl.value = frameUrl;
    const dataUrl = await blobToDataUrl(filteredBlob);
    const block: ImageBlock = createImageBlock(
      image,
      `video-${frame.timestampMs}-${frameCounter++}`,
      undefined,
      dataUrl
    );
    // 当应用滤镜时，block 的 canvas 仅作为尺寸载体，OCR 实际使用已处理 dataUrl。
    ocrAbortController = new AbortController();
    const result = await useOcrRunner().runOcr(
      [block],
      activeSettings.engineConfig,
      undefined,
      ocrAbortController.signal
    );
    const text = result[0]?.text?.trim() ?? "";
    if (text) appendSubtitle(text, frame.timestampMs, frameUrl);
    else useSubtitleTimeline().clearFrameUrl(frameUrl);
    setProgress({
      phase: "ocr",
      ocrCompleted: progress.value.ocrCompleted + 1,
      currentTimeMs: frame.timestampMs,
      percent: progress.value.total
        ? ((progress.value.ocrCompleted + 1) / progress.value.total) * 100
        : progress.value.percent,
    });
  } finally {
    URL.revokeObjectURL(rawUrl);
    try {
      await remove(frame.framePath);
    } catch {
      /* 临时帧可能已被任务清理 */
    }
  }
}

function appendSubtitle(text: string, timestampMs: number, frameUrl: string) {
  const timeline = useSubtitleTimeline();
  const entries = timeline.subtitles.value;
  const last = entries[entries.length - 1];
  if (last && getSimilarity(last.text, text) >= MERGE_SIMILARITY_THRESHOLD) {
    last.endMs = Math.max(last.endMs, timestampMs);
    if (text.length > last.text.length) last.text = text;
    timeline.clearFrameUrl(frameUrl);
    return;
  }
  if (last) last.endMs = Math.max(last.startMs + 1, timestampMs);
  const duration = source.value?.durationMs ?? timestampMs;
  const frameEnd = Math.min(
    endMs.value || duration,
    timestampMs + Math.max(1, intervalMsValue())
  );
  const entry: SubtitleEntry = {
    id: `video-sub-${Date.now()}-${frameCounter}`,
    text,
    startMs: timestampMs,
    endMs: Math.max(timestampMs + 1, frameEnd),
    frameUrl,
    status: "done",
  };
  timeline.addSubtitle(entry);
}

function intervalMsValue() {
  return activeSettings?.intervalMs ?? 1000;
}

function finishTask(finalStatus: "completed" | "cancelled") {
  const entries = useSubtitleTimeline().subtitles.value;
  const last = entries[entries.length - 1];
  if (last) last.endMs = Math.max(last.startMs + 1, endMs.value || last.endMs);
  status.value = finalStatus;
  setProgress({
    phase: finalStatus === "completed" ? "completed" : "cancelled",
    percent: 100,
  });
}
function waitForOcrCompletion(): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setInterval(() => {
      const total = progress.value.total;
      if (
        status.value !== "running" ||
        total === 0 ||
        progress.value.ocrCompleted >= total
      ) {
        window.clearInterval(timer);
        resolve();
      }
    }, 50);
  });
}

function processQueue(): Promise<void> {
  if (processingPromise) return processingPromise;
  processingPromise = (async () => {
    if (processing) return;
    processing = true;
    try {
      while (queuedFrames.length && status.value === "running") {
        const frame = queuedFrames.shift()!;
        await runFrameOcr(frame);
      }
    } catch (error) {
      const currentStatus = status.value as VideoOcrStatus;
      if (currentStatus !== "cancelling" && currentStatus !== "cancelled") {
        errorHandler.handle(error, {
          userMessage: "视频字幕识别失败",
          showToUser: false,
        });
        setProgress({
          phase: "error",
          error: error instanceof Error ? error.message : String(error),
        });
        status.value = "error";
      }
    } finally {
      processing = false;
      if (
        status.value === "running" &&
        progress.value.total > 0 &&
        progress.value.ocrCompleted >= progress.value.total
      ) {
        finishTask("completed");
      }
    }
  })().finally(() => {
    processingPromise = null;
  });
  return processingPromise;
}

export function useVideoSubtitleOcr() {
  const screen = useScreenMonitor();
  const { activeFfmpegPath, checkAvailability } = useFFmpeg();
  activeSettings = {
    engineConfig: screen.config.value.engineConfig,
    imageFilter: screen.config.value.imageFilter,
    intervalMs: screen.config.value.intervalMs,
    dedupSensitivity: screen.config.value.dedupSensitivity,
  };
  const canStart = computed(() =>
    Boolean(
      source.value &&
      source.value.durationMs > 0 &&
      status.value !== "running" &&
      status.value !== "preparing"
    )
  );

  async function selectVideo(path: string) {
    await cancel();
    const available = await checkAvailability(activeFfmpegPath.value);
    ffmpegAvailable.value = available;
    if (!available)
      throw new Error("未找到 FFmpeg，请先在应用设置中配置 FFmpeg");
    const metadata = await invoke<{
      duration?: number;
      fps?: number;
      width?: number;
      height?: number;
    }>("get_media_metadata", {
      ffmpegPath: activeFfmpegPath.value,
      inputPath: path,
    });
    if (!metadata.duration || !metadata.width || !metadata.height)
      throw new Error("无法读取视频元数据");
    source.value = {
      path,
      fileName: fileNameFromPath(path),
      durationMs: Math.round(metadata.duration * 1000),
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps ?? undefined,
    };
    startMs.value = 0;
    endMs.value = source.value.durationMs;
    roi.value = { ...DEFAULT_VIDEO_ROI };
    previewUrl.value = null;
    status.value = "idle";
    setProgress({
      phase: "extracting",
      extracted: 0,
      ocrCompleted: 0,
      total: 0,
      currentTimeMs: 0,
      percent: 0,
      error: undefined,
    });
  }

  async function start() {
    if (!source.value || !canStart.value) return;
    activeSettings = {
      engineConfig: screen.config.value.engineConfig,
      imageFilter: screen.config.value.imageFilter,
      intervalMs: screen.config.value.intervalMs,
      dedupSensitivity: screen.config.value.dedupSensitivity,
    };
    const range = normalizeVideoRange(
      startMs.value,
      endMs.value,
      source.value.durationMs
    );
    if (range.endMs <= range.startMs)
      throw new Error("请选择有效的视频时间范围");
    const available = await checkAvailability(activeFfmpegPath.value);
    ffmpegAvailable.value = available;
    if (!available) throw new Error("FFmpeg 不可用");
    await ensureListeners();
    useSubtitleTimeline().clearSubtitles();
    queuedFrames.splice(0);
    processing = false;
    processingPromise = null;
    lastVideoHash = "";
    frameCounter = 0;
    const currentTask = makeTaskId();
    taskId.value = currentTask;
    status.value = "preparing";
    const intervalMs = activeSettings.intervalMs;
    const total = calculateVideoFrameCount(
      range.startMs,
      range.endMs,
      intervalMs
    );
    setProgress({
      phase: "extracting",
      extracted: 0,
      ocrCompleted: 0,
      total,
      currentTimeMs: range.startMs,
      percent: 0,
      error: undefined,
    });
    frameDirectory = await join(
      await appDataDir(),
      "realtime-subtitle-ocr",
      currentTask
    );
    await mkdir(frameDirectory, { recursive: true });
    // 取消可能发生在创建临时目录的异步等待期间，避免取消后仍启动 FFmpeg。
    if (taskId.value !== currentTask || status.value !== "preparing") {
      await cleanupFrameDirectory();
      return;
    }
    status.value = "running";
    try {
      await invoke("extract_video_frames", {
        taskId: currentTask,
        ffmpegPath: activeFfmpegPath.value,
        inputPath: source.value.path,
        outputDir: frameDirectory,
        startMs: range.startMs,
        endMs: range.endMs,
        intervalMs,
        roi: roi.value,
      });
      if (status.value === "running") {
        await processQueue();
        await waitForOcrCompletion();
        if (
          status.value === "running" &&
          progress.value.ocrCompleted >= progress.value.total
        )
          finishTask("completed");
      }
    } catch (error) {
      const currentStatus = status.value as VideoOcrStatus;
      if (currentStatus === "cancelling" || currentStatus === "cancelled")
        return;
      status.value = "error";
      setProgress({
        phase: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      errorHandler.handle(error, { userMessage: "视频抽帧失败" });
    } finally {
      await cleanupFrameDirectory();
    }
  }

  async function cancel() {
    if (cancellationPromise) return cancellationPromise;
    if (
      !taskId.value ||
      (status.value !== "running" && status.value !== "preparing")
    )
      return;

    const currentTask = taskId.value;
    cancellationPromise = (async () => {
      status.value = "cancelling";
      ocrAbortController?.abort();
      try {
        await invoke("kill_ffmpeg_process", { taskId: currentTask });
      } catch {
        /* 进程已结束 */
      }
      queuedFrames.splice(0);
      if (processingPromise) await processingPromise;
      status.value = "cancelled";
      setProgress({ phase: "cancelled" });
      await cleanupFrameDirectory();
    })().finally(() => {
      cancellationPromise = null;
    });
    return cancellationPromise;
  }

  async function cleanupFrameDirectory() {
    if (!frameDirectory) return;
    try {
      await remove(frameDirectory, { recursive: true });
    } catch {
      /* 已清理 */
    }
    frameDirectory = "";
  }

  async function dispose() {
    await cancel();
    if (frameUnlisten) {
      await frameUnlisten();
      frameUnlisten = null;
    }
    if (progressUnlisten) {
      await progressUnlisten();
      progressUnlisten = null;
    }
    await cleanupFrameDirectory();
  }

  onBeforeUnmount(() => {
    void dispose();
  });

  return {
    source,
    roi,
    startMs,
    endMs,
    status,
    progress,
    previewUrl,
    ffmpegAvailable,
    canStart,
    selectVideo,
    start,
    cancel,
    dispose,
    screen,
  };
}
