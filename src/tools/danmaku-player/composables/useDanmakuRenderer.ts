import { ref, onBeforeUnmount } from "vue";
import { DanmakuEngine } from "../core/danmakuEngine";
import type { ParsedDanmaku, DanmakuConfig, AssScriptInfo } from "../types";

/**
 * 弹幕渲染 Composable
 *
 * 性能优化：
 * - 30fps 渲染弹幕（弹幕不需要 60fps，省一半 GPU 合成开销）
 * - 空弹幕列表时不启动 rAF 循环
 * - 弹幕禁用时清空画布并暂停循环
 */
export function useDanmakuRenderer() {
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  let engine: DanmakuEngine | null = null;
  let animationId: number | null = null;
  let hasDanmakus = false;
  let lastRenderTime = 0;

  // 弹幕渲染间隔：~30fps（约 33ms），降低 CPU/GPU 压力
  const RENDER_INTERVAL = 33;

  const initEngine = (canvas: HTMLCanvasElement, config: DanmakuConfig, scriptInfo: AssScriptInfo) => {
    canvasRef.value = canvas;
    engine = new DanmakuEngine(canvas, config, scriptInfo);
  };

  const setDanmakus = (danmakus: ParsedDanmaku[]) => {
    hasDanmakus = danmakus.length > 0;
    engine?.setDanmakus(danmakus);
  };

  const updateConfig = (config: DanmakuConfig) => {
    engine?.setConfig(config);
    // 如果弹幕被禁用，清空画布
    if (!config.enabled) {
      clearCanvas();
    }
  };

  const updateScriptInfo = (info: AssScriptInfo) => {
    engine?.setScriptInfo(info);
  };

  const startRender = (getCurrentTime: () => number) => {
    if (animationId) return;

    // 无弹幕数据时不启动渲染循环，避免浪费帧预算
    if (!hasDanmakus) return;

    lastRenderTime = 0;
    const loop = (timestamp: number) => {
      // 帧率限制：跳过过于频繁的帧，降到 ~30fps
      // timestamp 是 requestAnimationFrame 传回的高精度时间戳
      if (timestamp - lastRenderTime >= RENDER_INTERVAL) {
        if (engine) {
          engine.render(getCurrentTime());
        }
        lastRenderTime = timestamp;
      }
      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);
  };

  const stopRender = () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  };

  const clearCanvas = () => {
    if (canvasRef.value) {
      const ctx = canvasRef.value.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    }
  };

  onBeforeUnmount(() => {
    stopRender();
  });

  return {
    canvasRef,
    initEngine,
    setDanmakus,
    updateConfig,
    updateScriptInfo,
    startRender,
    stopRender,
    clearCanvas,
  };
}
