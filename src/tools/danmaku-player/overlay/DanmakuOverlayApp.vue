<template>
  <canvas ref="canvasRef" class="overlay-canvas"></canvas>
</template>

<script setup lang="ts">
import { listen } from "@tauri-apps/api/event";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useVirtualClock } from "@tools/danmaku-player/composables/useVirtualClock";
import { DanmakuEngine } from "@tools/danmaku-player/core/danmakuEngine";
import { MpcBeClient } from "@tools/danmaku-player/core/mpcBeApi";
import type {
  AssScriptInfo,
  DanmakuConfig,
  MpcBeStatus,
  ParsedDanmaku,
} from "@tools/danmaku-player/types";

interface OverlayInitPayload {
  danmakus: ParsedDanmaku[];
  scriptInfo: AssScriptInfo;
  config: DanmakuConfig;
  port: number;
}

interface OverlayDanmakuUpdatePayload {
  danmakus: ParsedDanmaku[];
  scriptInfo: AssScriptInfo;
}

const canvasRef = ref<HTMLCanvasElement | null>(null);
let engine: DanmakuEngine | null = null;
let mpcClient: MpcBeClient | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let animationId: number | null = null;
let lastRenderTime = 0;

const RENDER_INTERVAL = 33;
const POLL_INTERVAL = 200;

const { tick, calibrate, reset: resetClock } = useVirtualClock();

const unlisteners: Array<() => void> = [];

// 自适应 canvas 尺寸到窗口大小
function resizeCanvas() {
  if (!canvasRef.value) return;
  canvasRef.value.width = window.innerWidth;
  canvasRef.value.height = window.innerHeight;
}

function clearCanvas() {
  if (!canvasRef.value) return;
  const context = canvasRef.value.getContext("2d");
  context?.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
}

function initEngine(config: DanmakuConfig, scriptInfo: AssScriptInfo) {
  if (!canvasRef.value) return;
  resizeCanvas();
  engine = new DanmakuEngine(canvasRef.value, config, scriptInfo);
}

function startPolling() {
  if (pollInterval !== null) return;

  pollInterval = setInterval(async () => {
    if (!mpcClient) return;

    try {
      const status: MpcBeStatus | null = await mpcClient.getStatus();
      if (status) {
        calibrate(status.position, status.state);
      }
    } catch (error) {
      console.warn("[DanmakuOverlay] MPC-BE 状态轮询失败", error);
    }
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollInterval === null) return;
  clearInterval(pollInterval);
  pollInterval = null;
}

function startRender() {
  if (animationId !== null) return;

  lastRenderTime = 0;

  const loop = (timestamp: number) => {
    if (timestamp - lastRenderTime >= RENDER_INTERVAL) {
      if (engine) {
        const currentTime = tick(timestamp);
        engine.render(currentTime);
      }
      lastRenderTime = timestamp;
    }

    animationId = requestAnimationFrame(loop);
  };

  animationId = requestAnimationFrame(loop);
}

function stopRender() {
  if (animationId === null) return;
  cancelAnimationFrame(animationId);
  animationId = null;
  lastRenderTime = 0;
}

function resetOverlay() {
  stopPolling();
  stopRender();
  mpcClient = null;
  engine = null;
  resetClock();
  clearCanvas();
}

function handleInit(payload: OverlayInitPayload) {
  resetOverlay();

  const { danmakus, scriptInfo, config, port } = payload;
  mpcClient = new MpcBeClient(port);
  initEngine(config, scriptInfo);

  if (!engine) {
    console.error("[DanmakuOverlay] 初始化失败：canvas 尚未就绪");
    return;
  }

  engine.setDanmakus(danmakus);
  startPolling();

  if (danmakus.length > 0) {
    startRender();
  }

  console.log("[DanmakuOverlay] 初始化完成", { danmakuCount: danmakus.length, port });
}

function handleConfigUpdate(config: DanmakuConfig) {
  if (!engine) {
    console.warn("[DanmakuOverlay] 收到配置更新，但弹幕引擎尚未初始化");
    return;
  }

  engine.setConfig(config);

  if (!config.enabled) {
    clearCanvas();
  }

  console.log("[DanmakuOverlay] 配置已更新");
}

function handleDanmakuUpdate(payload: OverlayDanmakuUpdatePayload) {
  if (!engine) {
    console.warn("[DanmakuOverlay] 收到弹幕更新，但弹幕引擎尚未初始化");
    return;
  }

  engine.setScriptInfo(payload.scriptInfo);
  engine.setDanmakus(payload.danmakus);

  if (payload.danmakus.length > 0) {
    startRender();
  } else {
    stopRender();
    clearCanvas();
  }

  console.log("[DanmakuOverlay] 弹幕数据已更新", { danmakuCount: payload.danmakus.length });
}

onMounted(async () => {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  try {
    const unInit = await listen<OverlayInitPayload>("danmaku-overlay:init", (event) => {
      handleInit(event.payload);
    });
    unlisteners.push(unInit);

    const unConfigUpdate = await listen<DanmakuConfig>("danmaku-overlay:config-update", (event) => {
      handleConfigUpdate(event.payload);
    });
    unlisteners.push(unConfigUpdate);

    const unDanmakuUpdate = await listen<OverlayDanmakuUpdatePayload>("danmaku-overlay:danmaku-update", (event) => {
      handleDanmakuUpdate(event.payload);
    });
    unlisteners.push(unDanmakuUpdate);

    const unStop = await listen("danmaku-overlay:stop", () => {
      resetOverlay();
      console.log("[DanmakuOverlay] 已停止渲染");
    });
    unlisteners.push(unStop);
  } catch (error) {
    console.error("[DanmakuOverlay] Tauri 事件监听注册失败", error);
  }
});

onBeforeUnmount(() => {
  resetOverlay();
  window.removeEventListener("resize", resizeCanvas);
  unlisteners.forEach((unlisten) => unlisten());
  unlisteners.length = 0;
});
</script>

<style>
/* 全局样式，确保透明 */
html,
body,
#overlay-app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: transparent !important;
  overflow: hidden;
}

.overlay-canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: transparent;
}
</style>