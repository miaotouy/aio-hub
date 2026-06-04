<template>
  <!--
    wrapper 覆盖整个 video 容器（包含 letterbox 黑边），而非仅视频渲染区域。
    这迫使 WebView2/Chromium 合成器退出视频硬件 overlay 模式。
    额外的 backdrop-filter: blur(0.01px) 作为保险——视觉无感知但触发合成路径。
    canvas 用绝对定位精确对齐视频渲染区域，字幕排版不受影响。
  -->
  <div class="jassub-wrapper" :style="wrapperStyle">
    <canvas ref="canvasRef" class="jassub-canvas" :style="canvasStyle"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount, nextTick } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("danmaku-player/JassubRenderer");
const errorHandler = createModuleErrorHandler("danmaku-player/JassubRenderer");

const props = defineProps<{
  /** 底层 <video> 元素（仅用于读取 currentTime 和尺寸，不传给 JASSUB） */
  video: HTMLVideoElement;
  /** ASS/SSA 原始字幕文本 */
  rawContent: string;
  /** 是否显示字幕 */
  enabled: boolean;
}>();

const emit = defineEmits<{
  (e: "error"): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let jassubInstance: any = null;
const ready = ref(false);
let rafId: number | null = null;

// 视频实际渲染区域（object-fit: contain 下的 letterbox 计算）
const videoRect = ref({ width: 0, height: 0, top: 0, left: 0 });

/**
 * 计算 object-fit: contain 下视频的实际渲染区域
 */
function computeVideoRect() {
  const video = props.video;
  if (!video) return;

  const containerWidth = video.clientWidth;
  const containerHeight = video.clientHeight;
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;

  if (!containerWidth || !containerHeight || !videoWidth || !videoHeight)
    return;

  const containerAspect = containerWidth / containerHeight;
  const videoAspect = videoWidth / videoHeight;

  let renderWidth: number;
  let renderHeight: number;

  if (videoAspect > containerAspect) {
    renderWidth = containerWidth;
    renderHeight = containerWidth / videoAspect;
  } else {
    renderHeight = containerHeight;
    renderWidth = containerHeight * videoAspect;
  }

  const top = (containerHeight - renderHeight) / 2;
  const left = (containerWidth - renderWidth) / 2;

  videoRect.value = {
    width: Math.round(renderWidth),
    height: Math.round(renderHeight),
    top: Math.round(top),
    left: Math.round(left),
  };
}

/**
 * wrapper 覆盖整个 video 容器（100% 宽高），横跨视频渲染区域和黑边区域。
 * backdrop-filter: blur(0.01px) 触发合成器将此层纳入正常合成流，
 * 迫使视频退出硬件 overlay 独占模式。
 */
const wrapperStyle = computed(() => ({
  position: "absolute" as const,
  top: "0",
  left: "0",
  width: `${props.video.clientWidth}px`,
  height: `${props.video.clientHeight}px`,
  pointerEvents: "none" as const,
  zIndex: 16,
  overflow: "hidden" as const,
  backdropFilter: "blur(0.01px)",
}));

/** canvas 精确对齐视频实际渲染区域 */
const canvasStyle = computed(() => ({
  position: "absolute" as const,
  top: `${videoRect.value.top}px`,
  left: `${videoRect.value.left}px`,
  width: `${videoRect.value.width}px`,
  height: `${videoRect.value.height}px`,
}));

// 监听视频容器尺寸变化
useResizeObserver(
  computed(() => props.video?.parentElement ?? null),
  () => computeVideoRect()
);

async function initJassub() {
  if (jassubInstance) destroyJassub();
  if (!canvasRef.value) return;

  computeVideoRect();

  try {
    const { default: JASSUB } = await import("jassub");

    jassubInstance = new JASSUB({
      canvas: canvasRef.value,
      subContent: props.rawContent,
      availableFonts: {
        "microsoft yahei":
          "http://asset.localhost/C%3A%5CWindows%5CFonts%5Cmsyh.ttc",
        "microsoft yahei ui":
          "http://asset.localhost/C%3A%5CWindows%5CFonts%5Cmsyh.ttc",
        simhei: "http://asset.localhost/C%3A%5CWindows%5CFonts%5Csimhei.ttf",
        simsun: "http://asset.localhost/C%3A%5CWindows%5CFonts%5Csimsun.ttc",
        dengxian:
          "http://asset.localhost/C%3A%5CWindows%5CFonts%5CDengXian.ttf",
      },
      defaultFont: "Microsoft YaHei",
      queryFonts: "local",
    });

    await jassubInstance.ready;
    ready.value = true;
    logger.info("JASSUB 初始化成功（canvas 模式，backdrop-filter 防 overlay）");

    if (props.enabled) startRenderLoop();
  } catch (error) {
    errorHandler.error(error, "JASSUB 初始化失败，将降级使用 DOM 渲染");
    ready.value = false;
    emit("error");
  }
}

function startRenderLoop() {
  if (rafId !== null) return;
  const loop = () => {
    if (!jassubInstance || !ready.value || !canvasRef.value) return;

    computeVideoRect();

    const rect = videoRect.value;
    if (rect.width > 0 && rect.height > 0) {
      jassubInstance.manualRender({
        expectedDisplayTime: performance.now(),
        width: rect.width,
        height: rect.height,
        mediaTime: props.video.currentTime,
      });
    }

    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function stopRenderLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function destroyJassub() {
  stopRenderLoop();
  if (jassubInstance) {
    try {
      jassubInstance.destroy();
    } catch (error) {
      logger.warn("JASSUB 销毁时出错", { error });
    }
    jassubInstance = null;
    ready.value = false;
  }
}

watch(
  () => props.rawContent,
  async (newContent) => {
    if (!jassubInstance || !ready.value) {
      await initJassub();
      return;
    }
    try {
      jassubInstance.setTrack(newContent);
    } catch (error) {
      errorHandler.warn(error, "切换字幕轨道失败");
    }
  }
);

watch(
  () => props.enabled,
  (enabled) => {
    if (!jassubInstance || !ready.value) return;
    if (enabled) {
      startRenderLoop();
    } else {
      stopRenderLoop();
    }
  }
);

function onLoadedMetadata() {
  computeVideoRect();
}

nextTick(() => {
  props.video.addEventListener("loadedmetadata", onLoadedMetadata);
  computeVideoRect();
  initJassub();
});

onBeforeUnmount(() => {
  props.video.removeEventListener("loadedmetadata", onLoadedMetadata);
  destroyJassub();
});

defineExpose({ ready, reinit: initJassub });
</script>

<style scoped>
.jassub-wrapper {
  overflow: hidden;
}

.jassub-canvas {
  display: block;
}
</style>
